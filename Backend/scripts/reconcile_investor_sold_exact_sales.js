/**
 * Ajusta InvestmentItems (status=sold) de forma exacta por inversor + SKU + ventas objetivo.
 *
 * Objetivo: dejar "Items Vendidos" exactamente como indicó el usuario y limpiar
 * sobrantes generados por scripts anteriores (se convierten a status=paid).
 *
 * Uso:
 *   node scripts/reconcile_investor_sold_exact_sales.js --fix
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DB_NAME = process.env.MONGODB_DB || 'taller';

const RULES = [
  {
    investor: 'SANDRA',
    skuCandidates: ['KITR01'],
    targets: { 950: 1 }
  },
  {
    investor: 'SANDRA',
    skuCandidates: ['BUJI03'],
    targets: { 926: 4 }
  },
  {
    investor: 'SANDRA',
    skuCandidates: ['CALTA14'],
    targets: { 926: 1 }
  },
  {
    investor: 'SANDRA',
    skuCandidates: ['GPAM001', 'GPAMO01'],
    targets: { 941: 2 }
  },
  {
    investor: 'MANY',
    skuCandidates: ['REFAC01'],
    targets: { 950: 1, 958: 1, 951: 1, 947: 1 }
  }
];

function parseArgs() {
  const args = process.argv.slice(2);
  return { fix: args.includes('--fix') };
}

async function resolveCompany(Company) {
  let company = await Company.findOne({ name: { $regex: /casa\s*renault/i } }).lean();
  if (!company) company = await Company.findOne({}).lean();
  if (!company) throw new Error('No hay empresa en la BD');
  return company;
}

async function resolveInvestor(Investor, companyId, investorName) {
  return Investor.findOne({
    companyId: new mongoose.Types.ObjectId(companyId),
    active: true,
    name: { $regex: new RegExp(investorName.replace(/\s+/g, '\\s+'), 'i') }
  }).lean();
}

async function resolveItem(Item, companyId, skuCandidates) {
  for (const sku of skuCandidates) {
    const item = await Item.findOne({
      companyId: new mongoose.Types.ObjectId(companyId),
      sku: new RegExp('^' + String(sku).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')
    }).lean();
    if (item) return item;
  }
  return null;
}

async function resolveSales(Sale, companyId, targets) {
  const numbers = Object.keys(targets).map(n => Number(n));
  const sales = await Sale.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    number: { $in: numbers }
  }).select('_id number status closedAt').lean();
  const map = new Map(sales.map(s => [Number(s.number), s]));
  return { numbers, map };
}

function groupSoldBySaleNumber(soldDocs, saleIdToNumber) {
  const grouped = new Map();
  for (const d of soldDocs) {
    const num = saleIdToNumber.get(String(d.saleId)) || 'SIN-VENTA';
    grouped.set(num, (grouped.get(num) || 0) + (Number(d.qty) || 0));
  }
  return [...grouped.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

async function reconcileRule({ rule, refs, fix }) {
  const { InvestmentItem } = refs;
  const { investor, item, salesByNumber } = refs.resolved;

  const soldDocs = await InvestmentItem.find({
    companyId: investor.companyId,
    investorId: investor._id,
    itemId: item._id,
    status: 'sold',
    qty: { $gt: 0 }
  }).sort({ createdAt: 1, _id: 1 }).lean();

  const targetEntries = Object.entries(rule.targets).map(([num, qty]) => ({
    number: Number(num),
    qty: Number(qty || 0)
  })).filter(x => x.qty > 0);
  const targetTotal = targetEntries.reduce((s, x) => s + x.qty, 0);
  const currentTotal = soldDocs.reduce((s, d) => s + (Number(d.qty) || 0), 0);

  const saleIdToNumber = new Map();
  for (const s of salesByNumber.values()) saleIdToNumber.set(String(s._id), Number(s.number));
  const before = groupSoldBySaleNumber(soldDocs, saleIdToNumber);

  console.log(`\n--- ${investor.name} / ${item.sku} ---`);
  console.log('Sold actual por venta:', before.map(([n, q]) => `#${n}:${q}`).join(', ') || '(vacío)');
  console.log('Objetivo:', targetEntries.map(x => `#${x.number}:${x.qty}`).join(', '));
  console.log(`Total sold actual=${currentTotal} | objetivo=${targetTotal}`);

  if (currentTotal < targetTotal) {
    console.log('⚠️ No hay suficiente qty sold para cumplir objetivo. Se aplicará hasta donde alcance.');
  }
  if (!fix) return;

  // pool mutable de docs sold
  const pool = soldDocs.map(d => ({ doc: d, remaining: Number(d.qty) || 0 }));
  const allocations = new Map(); // docId -> [{ status:'sold'|'paid', qty, saleId? }]

  const addAlloc = (docId, chunk) => {
    const arr = allocations.get(docId) || [];
    arr.push(chunk);
    allocations.set(docId, arr);
  };

  // 1) reservar qty para ventas objetivo
  for (const t of targetEntries) {
    const sale = salesByNumber.get(t.number);
    if (!sale) {
      console.log(`⚠️ Venta #${t.number} no existe; se omite su objetivo (${t.qty}).`);
      continue;
    }
    let need = t.qty;
    for (const p of pool) {
      if (need <= 0) break;
      if (p.remaining <= 0) continue;
      const take = Math.min(need, p.remaining);
      if (take <= 0) continue;
      addAlloc(String(p.doc._id), { status: 'sold', qty: take, saleId: sale._id });
      p.remaining -= take;
      need -= take;
    }
    if (need > 0) {
      console.log(`⚠️ Faltó asignar ${need} a venta #${t.number} por falta de pool sold.`);
    }
  }

  // 2) todo lo restante de sold se convierte a paid (limpieza de sobrantes)
  for (const p of pool) {
    if (p.remaining > 0) {
      addAlloc(String(p.doc._id), { status: 'paid', qty: p.remaining });
      p.remaining = 0;
    }
  }

  // 3) aplicar cambios: reusar doc original para el primer chunk; crear docs para chunks extra
  for (const p of soldDocs) {
    const docId = String(p._id);
    const chunks = allocations.get(docId) || [];
    if (!chunks.length) continue;

    const first = chunks[0];
    const firstSet = first.status === 'sold'
      ? { status: 'sold', qty: first.qty, saleId: first.saleId, soldAt: new Date(), paidAt: null }
      : { status: 'paid', qty: first.qty, saleId: null, soldAt: p.soldAt || null, paidAt: new Date() };
    await InvestmentItem.updateOne({ _id: p._id }, { $set: firstSet });

    for (let i = 1; i < chunks.length; i++) {
      const c = chunks[i];
      if (!c.qty || c.qty <= 0) continue;
      await InvestmentItem.create({
        companyId: p.companyId,
        investorId: p.investorId,
        purchaseId: p.purchaseId || null,
        itemId: p.itemId,
        stockEntryId: p.stockEntryId,
        purchasePrice: p.purchasePrice || 0,
        qty: c.qty,
        status: c.status,
        saleId: c.status === 'sold' ? c.saleId : null,
        soldAt: c.status === 'sold' ? new Date() : (p.soldAt || null),
        paidAt: c.status === 'paid' ? new Date() : null
      });
    }
  }

  const afterSold = await InvestmentItem.find({
    companyId: investor.companyId,
    investorId: investor._id,
    itemId: item._id,
    status: 'sold',
    qty: { $gt: 0 }
  }).lean();
  const after = groupSoldBySaleNumber(afterSold, saleIdToNumber);
  console.log('✅ Sold final por venta:', after.map(([n, q]) => `#${n}:${q}`).join(', ') || '(vacío)');
}

async function main() {
  const { fix } = parseArgs();
  if (!MONGODB_URI) throw new Error('Definir MONGODB_URI (o MONGO_URI)');

  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });

  const Company = (await import('../src/models/Company.js')).default;
  const Investor = (await import('../src/models/Investor.js')).default;
  const Item = (await import('../src/models/Item.js')).default;
  const Sale = (await import('../src/models/Sale.js')).default;
  const InvestmentItem = (await import('../src/models/InvestmentItem.js')).default;

  const company = await resolveCompany(Company);
  const companyId = String(company._id);
  console.log(`Empresa: ${company.name} (${companyId})`);
  console.log(`Modo: ${fix ? 'FIX' : 'DIAGNOSTICO'}`);

  for (const rule of RULES) {
    const investor = await resolveInvestor(Investor, companyId, rule.investor);
    if (!investor) {
      console.log(`⚠️ Inversor no encontrado: ${rule.investor}`);
      continue;
    }
    const item = await resolveItem(Item, companyId, rule.skuCandidates);
    if (!item) {
      console.log(`⚠️ Item no encontrado para SKU(s): ${rule.skuCandidates.join(', ')}`);
      continue;
    }
    const { map: salesByNumber } = await resolveSales(Sale, companyId, rule.targets);
    await reconcileRule({
      rule,
      refs: { InvestmentItem, resolved: { investor, item, salesByNumber } },
      fix
    });
  }

  await mongoose.disconnect();
  console.log('\nProceso terminado.');
}

main().catch(async (err) => {
  console.error(err?.message || err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
