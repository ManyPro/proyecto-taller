/**
 * Repara faltantes de "sold" por inversor+SKU dentro de un rango de ventas cerradas.
 * Asigna el faltante a las ventas donde realmente se vendió el SKU (1..N ventas).
 *
 * Ejemplo:
 * node scripts/fix_investor_sku_sales_range.js --investor Sandra --sku CALTA14 --from 2026-02-25 --to 2026-02-26 --fix
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DB_NAME = process.env.MONGODB_DB || 'taller';

function parseArgs() {
  const args = process.argv.slice(2);
  const now = new Date();
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const cfg = {
    companyName: 'Casa Renault',
    investorName: '',
    sku: '',
    from: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0),
    to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
    fix: false
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--company' && args[i + 1]) cfg.companyName = String(args[++i]).trim();
    else if (args[i] === '--investor' && args[i + 1]) cfg.investorName = String(args[++i]).trim();
    else if (args[i] === '--sku' && args[i + 1]) cfg.sku = String(args[++i]).trim().toUpperCase();
    else if (args[i] === '--from' && args[i + 1]) cfg.from = new Date(String(args[++i]).trim() + 'T00:00:00');
    else if (args[i] === '--to' && args[i + 1]) cfg.to = new Date(String(args[++i]).trim() + 'T23:59:59.999');
    else if (args[i] === '--fix') cfg.fix = true;
  }
  return cfg;
}

async function main() {
  if (!MONGODB_URI) throw new Error('Definir MONGODB_URI (o MONGO_URI)');
  const { companyName, investorName, sku, from, to, fix } = parseArgs();
  if (!investorName || !sku) throw new Error('Uso: --investor <Nombre> --sku <SKU> [--from yyyy-mm-dd --to yyyy-mm-dd] [--fix]');

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  const Company = (await import('../src/models/Company.js')).default;
  const Investor = (await import('../src/models/Investor.js')).default;
  const Item = (await import('../src/models/Item.js')).default;
  const Sale = (await import('../src/models/Sale.js')).default;
  const InvestmentItem = (await import('../src/models/InvestmentItem.js')).default;
  const StockEntry = (await import('../src/models/StockEntry.js')).default;

  let company = await Company.findOne({ name: { $regex: new RegExp(companyName.replace(/\s+/g, '\\s+'), 'i') } }).lean();
  if (!company) company = await Company.findOne({}).lean();
  if (!company) throw new Error('No hay empresa');
  const companyId = String(company._id);

  const investor = await Investor.findOne({
    companyId: new mongoose.Types.ObjectId(companyId),
    active: true,
    name: { $regex: new RegExp(investorName.replace(/\s+/g, '\\s+'), 'i') }
  }).lean();
  if (!investor) throw new Error(`Inversor no encontrado: ${investorName}`);

  const item = await Item.findOne({
    companyId: new mongoose.Types.ObjectId(companyId),
    sku: new RegExp('^' + sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
  }).lean();
  if (!item) throw new Error(`Item no encontrado: ${sku}`);

  const sales = await Sale.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    status: 'closed',
    closedAt: { $gte: from, $lte: to },
    items: { $elemMatch: { source: 'inventory', $or: [{ refId: item._id }, { sku: item.sku }] } }
  }).select('_id number closedAt items').sort({ closedAt: 1, number: 1 }).lean();

  console.log(`Empresa: ${company.name}`);
  console.log(`Inversor: ${investor.name}`);
  console.log(`SKU: ${item.sku} (${item.name || 'N/A'})`);
  console.log(`Ventas cerradas en rango con SKU: ${sales.length}`);

  const plan = [];
  for (const sale of sales) {
    const usedQty = (sale.items || []).reduce((sum, it) => {
      if (String(it?.source) !== 'inventory') return sum;
      const sameRef = it?.refId && String(it.refId) === String(item._id);
      const sameSku = String(it?.sku || '').toUpperCase() === String(item.sku || '').toUpperCase();
      if (!sameRef && !sameSku) return sum;
      return sum + (Number(it?.qty || 0) || 0);
    }, 0);
    if (usedQty <= 0) continue;

    const alreadySold = await InvestmentItem.find({
      companyId: new mongoose.Types.ObjectId(companyId),
      investorId: investor._id,
      itemId: item._id,
      saleId: sale._id,
      status: 'sold'
    }).select('qty').lean();
    const soldQty = alreadySold.reduce((s, x) => s + (Number(x.qty) || 0), 0);
    const missing = Math.max(0, usedQty - soldQty);
    if (missing > 0) {
      plan.push({ saleId: sale._id, saleNumber: sale.number, missing });
    }
  }

  if (!plan.length) {
    console.log('✅ No hay faltantes por marcar en este rango.');
    await mongoose.disconnect();
    return;
  }

  console.log('Faltantes por venta:');
  for (const p of plan) console.log(`  - Venta #${p.saleNumber}: ${p.missing}`);

  if (!fix) {
    console.log('Modo diagnóstico (usar --fix para aplicar).');
    await mongoose.disconnect();
    return;
  }

  // Consumir available FIFO para crear sold en las ventas que faltan.
  const avail = await InvestmentItem.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    investorId: investor._id,
    itemId: item._id,
    status: 'available',
    qty: { $gt: 0 }
  }).sort({ createdAt: 1, _id: 1 }).lean();

  let cursor = 0;
  const nextChunk = (need) => {
    const chunks = [];
    let remaining = need;
    while (remaining > 0 && cursor < avail.length) {
      const src = avail[cursor];
      const have = Number(src.qty || 0) || 0;
      if (have <= 0) {
        cursor += 1;
        continue;
      }
      const take = Math.min(have, remaining);
      chunks.push({ src, take });
      src.qty = have - take;
      remaining -= take;
      if (src.qty <= 0) cursor += 1;
    }
    return { chunks, remaining };
  };

  for (const p of plan) {
    const { chunks, remaining } = nextChunk(p.missing);
    const assigned = p.missing - remaining;

    for (const c of chunks) {
      if (c.take <= 0) continue;
      const srcId = c.src._id;
      const srcQty = Number(c.src.qty || 0) + c.take;
      if (c.take >= srcQty) {
        await InvestmentItem.updateOne(
          { _id: srcId },
          { $set: { status: 'sold', saleId: p.saleId, soldAt: new Date() } }
        );
      } else {
        await InvestmentItem.updateOne({ _id: srcId }, { $inc: { qty: -c.take } });
        await InvestmentItem.create({
          companyId: c.src.companyId,
          investorId: c.src.investorId,
          purchaseId: c.src.purchaseId || null,
          itemId: c.src.itemId,
          stockEntryId: c.src.stockEntryId || null,
          purchasePrice: c.src.purchasePrice || 0,
          qty: c.take,
          status: 'sold',
          saleId: p.saleId,
          soldAt: new Date()
        });
      }
    }

    if (assigned > 0) {
      console.log(`✅ Venta #${p.saleNumber}: marcado sold ${assigned}`);
    }
    if (remaining > 0) {
      // Fallback: si no hay available suficiente, crear sold desde StockEntry del inversor.
      const stockEntry = await StockEntry.findOne({
        companyId: new mongoose.Types.ObjectId(companyId),
        itemId: item._id,
        investorId: investor._id
      }).sort({ entryDate: -1, _id: -1 }).lean();
      if (!stockEntry) {
        console.log(`⚠️ Venta #${p.saleNumber}: faltan ${remaining} y no hay StockEntry del inversor para fallback.`);
        continue;
      }
      await InvestmentItem.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        investorId: investor._id,
        purchaseId: stockEntry.purchaseId || null,
        itemId: item._id,
        stockEntryId: stockEntry._id,
        purchasePrice: stockEntry.entryPrice || 0,
        qty: remaining,
        status: 'sold',
        saleId: p.saleId,
        soldAt: new Date()
      });
      console.log(`✅ Venta #${p.saleNumber}: creado fallback sold ${remaining}`);
    }
  }

  console.log('✅ Reparación completada.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err?.message || err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
