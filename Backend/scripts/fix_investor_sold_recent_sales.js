/**
 * Revisa ventas cerradas en un rango de fechas y repara faltantes de
 * InvestmentItem(status='sold') cuando se usó stock de inversor.
 *
 * Uso:
 *   node scripts/fix_investor_sold_recent_sales.js --fix
 *   node scripts/fix_investor_sold_recent_sales.js --from 2026-02-25 --to 2026-02-26 --fix
 *   node scripts/fix_investor_sold_recent_sales.js --company "Casa Renault" --investor "Sandra" --fix
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DB_NAME = process.env.MONGODB_DB || 'taller';

function parseArgs() {
  const args = process.argv.slice(2);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const startDefault = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
  const endDefault = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const cfg = {
    companyName: 'Casa Renault',
    investorName: null,
    from: startDefault,
    to: endDefault,
    fix: false
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--company' && args[i + 1]) cfg.companyName = String(args[++i]).trim();
    else if (a === '--investor' && args[i + 1]) cfg.investorName = String(args[++i]).trim();
    else if (a === '--from' && args[i + 1]) {
      const d = new Date(String(args[++i]).trim() + 'T00:00:00');
      if (!isNaN(d.getTime())) cfg.from = d;
    } else if (a === '--to' && args[i + 1]) {
      const d = new Date(String(args[++i]).trim() + 'T23:59:59.999');
      if (!isNaN(d.getTime())) cfg.to = d;
    } else if (a === '--fix') cfg.fix = true;
  }

  return cfg;
}

function fmtDate(d) {
  return new Date(d).toISOString();
}

async function main() {
  if (!MONGODB_URI) {
    console.error('❌ Definir MONGODB_URI (o MONGO_URI).');
    process.exit(1);
  }

  const { companyName, investorName, from, to, fix } = parseArgs();

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  const Company = (await import('../src/models/Company.js')).default;
  const Sale = (await import('../src/models/Sale.js')).default;
  const Investor = (await import('../src/models/Investor.js')).default;
  const StockEntry = (await import('../src/models/StockEntry.js')).default;
  const InvestmentItem = (await import('../src/models/InvestmentItem.js')).default;

  let company = await Company.findOne({ name: { $regex: new RegExp(companyName.replace(/\s+/g, '\\s+'), 'i') } }).lean();
  if (!company) company = await Company.findOne({}).lean();
  if (!company) {
    console.error('❌ No hay empresas en la BD.');
    await mongoose.disconnect();
    process.exit(1);
  }
  const companyId = String(company._id);

  let investorFilterId = null;
  if (investorName) {
    const inv = await Investor.findOne({
      companyId: new mongoose.Types.ObjectId(companyId),
      active: true,
      name: { $regex: new RegExp(investorName.replace(/\s+/g, '\\s+'), 'i') }
    }).lean();
    if (!inv) {
      console.error(`❌ Inversor no encontrado: ${investorName}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    investorFilterId = String(inv._id);
  }

  console.log(`🏢 Empresa: ${company.name} (${companyId})`);
  console.log(`📅 Rango: ${fmtDate(from)} -> ${fmtDate(to)}`);
  if (investorFilterId) console.log(`💰 Inversor filtro: ${investorName} (${investorFilterId})`);
  console.log('');

  const sales = await Sale.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    status: 'closed',
    closedAt: { $gte: from, $lte: to }
  })
    .select('_id number closedAt items')
    .sort({ closedAt: 1, number: 1 })
    .lean();

  console.log(`📋 Ventas cerradas encontradas: ${sales.length}\n`);

  const issues = [];

  for (const sale of sales) {
    const usedByEntry = new Map();

    for (const it of sale.items || []) {
      if (String(it?.source) !== 'inventory') continue;
      const qtyFallback = Number(it?.qty || 0) || 0;
      const list = Array.isArray(it?.meta?.entriesUsed)
        ? it.meta.entriesUsed
        : (it?.meta?.entryId ? [{ entryId: it.meta.entryId, qty: qtyFallback || 1 }] : []);

      for (const u of list) {
        const entryIdStr = u?.entryId ? String(u.entryId) : null;
        if (!entryIdStr || !mongoose.Types.ObjectId.isValid(entryIdStr)) continue;
        const q = Number(u?.qty || qtyFallback || 0) || 0;
        if (q <= 0) continue;
        usedByEntry.set(entryIdStr, (usedByEntry.get(entryIdStr) || 0) + q);
      }
    }

    if (!usedByEntry.size) continue;

    const entryIds = [...usedByEntry.keys()].map(id => new mongoose.Types.ObjectId(id));
    const entries = await StockEntry.find({
      _id: { $in: entryIds },
      companyId: new mongoose.Types.ObjectId(companyId)
    })
      .select('_id investorId itemId purchaseId entryPrice')
      .lean();

    for (const ent of entries) {
      const investorIdStr = ent?.investorId ? String(ent.investorId) : null;
      if (!investorIdStr) continue;
      if (investorFilterId && investorFilterId !== investorIdStr) continue;

      const used = Number(usedByEntry.get(String(ent._id)) || 0);
      if (used <= 0) continue;

      const soldDocs = await InvestmentItem.find({
        companyId: new mongoose.Types.ObjectId(companyId),
        saleId: sale._id,
        stockEntryId: ent._id,
        investorId: ent.investorId,
        status: 'sold'
      })
        .select('_id qty')
        .lean();

      const soldQty = soldDocs.reduce((s, d) => s + (Number(d.qty) || 0), 0);
      if (soldQty >= used) continue;

      const missing = used - soldQty;
      issues.push({
        saleId: String(sale._id),
        saleNumber: sale.number,
        closedAt: sale.closedAt,
        stockEntryId: String(ent._id),
        investorId: investorIdStr,
        itemId: String(ent.itemId),
        purchaseId: ent.purchaseId ? String(ent.purchaseId) : null,
        purchasePrice: Number(ent.entryPrice || 0) || 0,
        used,
        soldQty,
        missing
      });
    }
  }

  if (!issues.length) {
    console.log('✅ No se encontraron faltantes de cobro de inversor en el rango.');
    await mongoose.disconnect();
    return;
  }

  console.log(`⚠️ Faltantes detectados: ${issues.length}\n`);
  for (const x of issues) {
    console.log(
      `Venta #${x.saleNumber} | entry ${x.stockEntryId} | inversor ${x.investorId} | usado ${x.used} | sold ${x.soldQty} | faltante ${x.missing}`
    );
  }

  if (!fix) {
    console.log('\nModo diagnóstico. Ejecuta con --fix para reparar.');
    await mongoose.disconnect();
    return;
  }

  console.log('\n--- Aplicando reparación ---');
  for (const x of issues) {
    await InvestmentItem.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      investorId: new mongoose.Types.ObjectId(x.investorId),
      purchaseId: x.purchaseId ? new mongoose.Types.ObjectId(x.purchaseId) : null,
      itemId: new mongoose.Types.ObjectId(x.itemId),
      stockEntryId: new mongoose.Types.ObjectId(x.stockEntryId),
      purchasePrice: x.purchasePrice,
      qty: x.missing,
      status: 'sold',
      saleId: new mongoose.Types.ObjectId(x.saleId),
      soldAt: new Date()
    });
    console.log(`✅ Venta #${x.saleNumber}: creado sold faltante (${x.missing})`);
  }

  console.log('\n✅ Reparación completada.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
