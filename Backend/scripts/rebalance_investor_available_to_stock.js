/**
 * Ajusta InvestmentItems available de un inversor+SKU al Item.stock actual.
 * - Si available > stock: mueve diferencia a sold.
 * - Si available < stock: mueve diferencia de sold -> available.
 *
 * Uso:
 * node scripts/rebalance_investor_available_to_stock.js --investor MANY --sku REFAC01 --fix
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DB_NAME = process.env.MONGODB_DB || 'taller';

function parseArgs() {
  const args = process.argv.slice(2);
  const cfg = { companyName: 'Casa Renault', investorName: '', sku: '', fix: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--company' && args[i + 1]) cfg.companyName = String(args[++i]).trim();
    else if (args[i] === '--investor' && args[i + 1]) cfg.investorName = String(args[++i]).trim();
    else if (args[i] === '--sku' && args[i + 1]) cfg.sku = String(args[++i]).trim().toUpperCase();
    else if (args[i] === '--fix') cfg.fix = true;
  }
  return cfg;
}

async function main() {
  if (!MONGODB_URI) throw new Error('Definir MONGODB_URI');
  const { companyName, investorName, sku, fix } = parseArgs();
  if (!investorName || !sku) throw new Error('Uso: --investor <Nombre> --sku <SKU> [--fix]');

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  const Company = (await import('../src/models/Company.js')).default;
  const Investor = (await import('../src/models/Investor.js')).default;
  const Item = (await import('../src/models/Item.js')).default;
  const InvestmentItem = (await import('../src/models/InvestmentItem.js')).default;
  const Sale = (await import('../src/models/Sale.js')).default;

  let company = await Company.findOne({ name: { $regex: new RegExp(companyName.replace(/\s+/g, '\\s+'), 'i') } }).lean();
  if (!company) company = await Company.findOne({}).lean();
  if (!company) throw new Error('No hay empresa');
  const companyId = new mongoose.Types.ObjectId(String(company._id));

  const investor = await Investor.findOne({
    companyId,
    active: true,
    name: { $regex: new RegExp(investorName.replace(/\s+/g, '\\s+'), 'i') }
  }).lean();
  if (!investor) throw new Error(`Inversor no encontrado: ${investorName}`);

  const item = await Item.findOne({
    companyId,
    sku: new RegExp('^' + sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
  }).lean();
  if (!item) throw new Error(`Item no encontrado: ${sku}`);

  const docs = await InvestmentItem.find({
    companyId,
    investorId: investor._id,
    itemId: item._id,
    status: { $in: ['available', 'sold'] },
    qty: { $gt: 0 }
  }).sort({ createdAt: 1, _id: 1 }).lean();

  const available = docs.filter(d => d.status === 'available').reduce((s, d) => s + (d.qty || 0), 0);
  const sold = docs.filter(d => d.status === 'sold').reduce((s, d) => s + (d.qty || 0), 0);
  const targetAvailable = Number(item.stock || 0) || 0;
  const delta = available - targetAvailable;

  console.log(`Empresa: ${company.name}`);
  console.log(`Inversor: ${investor.name}`);
  console.log(`SKU: ${item.sku} (${item.name || 'N/A'})`);
  console.log(`Item.stock: ${targetAvailable} | available: ${available} | sold: ${sold} | delta(available-stock): ${delta}`);

  if (delta === 0) {
    console.log('✅ Sin ajustes.');
    await mongoose.disconnect();
    return;
  }
  if (!fix) {
    console.log('Modo diagnóstico (usar --fix para aplicar).');
    await mongoose.disconnect();
    return;
  }

  if (delta > 0) {
    // available -> sold
    let toMove = delta;
    const latestSale = await Sale.findOne({
      companyId,
      status: 'closed',
      items: { $elemMatch: { source: 'inventory', $or: [{ refId: item._id }, { sku: item.sku }] } }
    }).sort({ closedAt: -1, _id: -1 }).select('_id number').lean();

    const availDocs = docs.filter(d => d.status === 'available');
    for (const d of availDocs) {
      if (toMove <= 0) break;
      const q = Math.min(toMove, d.qty || 0);
      if (q <= 0) continue;
      if (q >= (d.qty || 0)) {
        await InvestmentItem.updateOne(
          { _id: d._id },
          { $set: { status: 'sold', saleId: latestSale?._id || null, soldAt: new Date() } }
        );
      } else {
        await InvestmentItem.updateOne({ _id: d._id }, { $inc: { qty: -q } });
        await InvestmentItem.create({
          companyId: d.companyId,
          investorId: d.investorId,
          purchaseId: d.purchaseId || null,
          itemId: d.itemId,
          stockEntryId: d.stockEntryId || null,
          purchasePrice: d.purchasePrice || 0,
          qty: q,
          status: 'sold',
          saleId: latestSale?._id || null,
          soldAt: new Date()
        });
      }
      toMove -= q;
    }
    console.log(`✅ Movido available->sold: ${delta - toMove}`);
  } else {
    // sold -> available
    let toMove = -delta;
    const soldDocs = docs.filter(d => d.status === 'sold').sort((a, b) => {
      const ad = a.soldAt ? new Date(a.soldAt).getTime() : 0;
      const bd = b.soldAt ? new Date(b.soldAt).getTime() : 0;
      return bd - ad;
    });
    for (const d of soldDocs) {
      if (toMove <= 0) break;
      const q = Math.min(toMove, d.qty || 0);
      if (q <= 0) continue;
      if (q >= (d.qty || 0)) {
        await InvestmentItem.updateOne(
          { _id: d._id },
          { $set: { status: 'available', saleId: null, soldAt: null } }
        );
      } else {
        await InvestmentItem.updateOne({ _id: d._id }, { $inc: { qty: -q } });
        await InvestmentItem.create({
          companyId: d.companyId,
          investorId: d.investorId,
          purchaseId: d.purchaseId || null,
          itemId: d.itemId,
          stockEntryId: d.stockEntryId || null,
          purchasePrice: d.purchasePrice || 0,
          qty: q,
          status: 'available',
          saleId: null,
          soldAt: null
        });
      }
      toMove -= q;
    }
    console.log(`✅ Movido sold->available: ${(-delta) - toMove}`);
  }

  const after = await InvestmentItem.find({
    companyId,
    investorId: investor._id,
    itemId: item._id,
    status: { $in: ['available', 'sold'] },
    qty: { $gt: 0 }
  }).lean();
  const a2 = after.filter(d => d.status === 'available').reduce((s, d) => s + (d.qty || 0), 0);
  const s2 = after.filter(d => d.status === 'sold').reduce((s, d) => s + (d.qty || 0), 0);
  console.log(`Después -> available: ${a2} | sold: ${s2} | stock: ${targetAvailable}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err?.message || err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
