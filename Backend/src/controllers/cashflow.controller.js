import Account from '../models/Account.js';
import CashFlowEntry from '../models/CashFlowEntry.js';
import Company from '../models/Company.clean.js';
import mongoose from 'mongoose';

// Helpers
async function ensureDefaultCashAccount(companyId) {
  let acc = await Account.findOne({ companyId, type: 'CASH', name: /caja/i });
  if (!acc) {
    acc = await Account.create({ companyId, name: 'Caja', type: 'CASH', initialBalance: 0 });
  }
  return acc;
}

async function computeBalance(accountId, companyId) {
  // Usa el balanceAfter del último movimiento si existe
  const last = await CashFlowEntry.findOne({ companyId, accountId }).sort({ date: -1, _id: -1 });
  if (last) return last.balanceAfter;
  const acc = await Account.findOne({ _id: accountId, companyId });
  return acc ? acc.initialBalance : 0;
}

export async function listAccounts(req, res) {
  const [rows, company] = await Promise.all([
    Account.find({ companyId: req.companyId }).sort({ createdAt: 1 }),
    Company.findById(req.companyId).select('restrictions').lean()
  ]);
  const hide = !!company?.restrictions?.cashflow?.hideBalances;
  if (!hide) return res.json(rows);
  // Mask balances-related fields (accounts only have initialBalance stored)
  const masked = rows.map(r => ({
    _id: r._id,
    companyId: r.companyId,
    name: r.name,
    type: r.type,
    currency: r.currency,
    active: r.active,
    notes: r.notes
  }));
  res.json(masked);
}

export async function createAccount(req, res) {
  const { name, type = 'CASH', initialBalance = 0, notes = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const doc = await Account.create({ companyId: req.companyId, name, type, initialBalance, notes });
    return res.json(doc);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'cannot create account' });
  }
}

export async function updateAccount(req, res) {
  const { id } = req.params;
  const { name, active, notes } = req.body || {};
  const doc = await Account.findOne({ _id: id, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: 'not found' });
  if (name !== undefined) doc.name = name;
  if (active !== undefined) doc.active = !!active;
  if (notes !== undefined) doc.notes = notes;
  await doc.save();
  res.json(doc);
}

export async function getBalances(req, res) {
  const companyId = req.companyId;
  const [accounts, company] = await Promise.all([
    Account.find({ companyId }),
    Company.findById(companyId).select('restrictions').lean()
  ]);
  const hide = !!company?.restrictions?.cashflow?.hideBalances;
  const balances = [];
  for (const acc of accounts) {
    const bal = hide ? 0 : await computeBalance(acc._id, companyId);
    balances.push({ accountId: acc._id, name: acc.name, type: acc.type, balance: hide ? null : bal });
  }
  const total = hide ? null : balances.reduce((a, b) => a + (b.balance || 0), 0);
  res.json({ balances, total, masked: hide === true });
}

export async function listEntries(req, res) {
  const { accountId, from, to, kind, source, page = 1, limit = 50 } = req.query || {};
  const pg = Math.max(1, parseInt(page));
  const lim = Math.min(500, Math.max(1, parseInt(limit)));
  const q = { companyId: req.companyId };
  if (accountId) q.accountId = new mongoose.Types.ObjectId(accountId);
  if (kind) q.kind = kind;
  if (source) q.source = source;
  if (from || to) {
    q.date = {};
    if (from) q.date.$gte = new Date(from + 'T00:00:00.000Z');
    if (to) q.date.$lte = new Date(to + 'T23:59:59.999Z');
  }
  const [rows, count] = await Promise.all([
    CashFlowEntry.find(q).sort({ date: -1, _id: -1 }).skip((pg - 1) * lim).limit(lim).populate('accountId', 'name type'),
    CashFlowEntry.countDocuments(q)
  ]);
  // Totales en el rango
  const agg = await CashFlowEntry.aggregate([
    { $match: q },
    { $group: { _id: null, in: { $sum: { $cond: [{ $eq: ['$kind', 'IN'] }, '$amount', 0] } }, out: { $sum: { $cond: [{ $eq: ['$kind', 'OUT'] }, '$amount', 0] } } } }
  ]);
  const totals = agg[0] || { in: 0, out: 0 };
  // Mask amounts if hideBalances
  const company = await Company.findById(req.companyId).select('restrictions').lean();
  const hide = !!company?.restrictions?.cashflow?.hideBalances;
  const items = hide ? rows.map(e => ({
    _id: e._id,
    companyId: e.companyId,
    accountId: e.accountId,
    kind: e.kind,
    amount: null,
    description: e.description,
    source: e.source,
    date: e.date,
    balanceAfter: null
  })) : rows;
  const maskedTotals = hide ? { in: null, out: null } : totals;
  res.json({ items, page: pg, limit: lim, total: count, totals: maskedTotals, masked: hide === true });
}

export async function createEntry(req, res) {
  const { accountId, kind = 'IN', amount, description = '', date } = req.body || {};
  if (!accountId) return res.status(400).json({ error: 'accountId required' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'positive amount required' });
  const acc = await Account.findOne({ _id: accountId, companyId: req.companyId });
  if (!acc) return res.status(404).json({ error: 'account not found' });
  const amt = Math.round(Number(amount));
  const prevBal = await computeBalance(acc._id, req.companyId);
  const newBal = kind === 'IN' ? prevBal + amt : prevBal - amt;
  const entry = await CashFlowEntry.create({
    companyId: req.companyId,
    accountId: acc._id,
    kind,
    amount: amt,
    description,
    source: 'MANUAL',
    date: date ? new Date(date) : new Date(),
    balanceAfter: newBal
  });
  res.json(entry);
}

// --- Recalcular balances secuenciales de una cuenta ---
async function recomputeAccountBalances(companyId, accountId){
  if(!companyId || !accountId) return;
  const acc = await Account.findOne({ _id: accountId, companyId });
  if(!acc) return;
  const entries = await CashFlowEntry.find({ companyId, accountId }).sort({ date: 1, _id: 1 });
  let running = acc.initialBalance || 0;
  for(const e of entries){
    if(e.kind === 'IN') running += e.amount; else if(e.kind === 'OUT') running -= e.amount;
    // Solo actualizar si cambió para minimizar writes
    if(e.balanceAfter !== running){
      e.balanceAfter = running;
      await e.save();
    }
  }
}

// PATCH /cashflow/entries/:id
export async function updateEntry(req, res){
  const { id } = req.params;
  const { amount, description, date, kind } = req.body || {};
  const entry = await CashFlowEntry.findOne({ _id: id, companyId: req.companyId });
  if(!entry) return res.status(404).json({ error: 'entry not found' });
  // Opcional: restringir edición de movimientos generados por venta a sólo descripción
  // Permitimos edición completa para correcciones manuales.
  let mutated = false;
  if(amount!=null){
    const a = Number(amount);
    if(!Number.isFinite(a) || a<=0) return res.status(400).json({ error: 'amount inválido' });
    entry.amount = Math.round(a); mutated = true;
  }
  if(description!==undefined){ entry.description = String(description||''); mutated = true; }
  if(date){ const d=new Date(date); if(!isNaN(d.getTime())){ entry.date = d; mutated = true; } }
  if(kind && (kind==='IN' || kind==='OUT')){ entry.kind = kind; mutated = true; }
  if(!mutated) return res.json(entry);
  await entry.save();
  await recomputeAccountBalances(req.companyId, entry.accountId);
  res.json(entry);
}

// DELETE /cashflow/entries/:id
export async function deleteEntry(req, res){
  const { id } = req.params;
  const entry = await CashFlowEntry.findOne({ _id: id, companyId: req.companyId });
  if(!entry) return res.status(404).json({ error: 'entry not found' });
  const accId = entry.accountId;
  await CashFlowEntry.deleteOne({ _id: entry._id, companyId: req.companyId });
  await recomputeAccountBalances(req.companyId, accId);
  res.json({ ok: true });
}

// Utilizada desde cierre de venta
export async function registerSaleIncome({ companyId, sale, accountId }) {
  if (!sale || !sale._id) return [];
  // Si ya existen entradas para la venta, devolverlas (idempotencia multi)
  const existing = await CashFlowEntry.find({ companyId, source: 'SALE', sourceRef: sale._id });
  if (existing.length) return existing;

  // Determinar métodos de pago: nuevo array o fallback al legacy
  let methods = Array.isArray(sale.paymentMethods) && sale.paymentMethods.length
    ? sale.paymentMethods.filter(m=>m && m.method && Number(m.amount)>0)
    : [];
  if (!methods.length) {
    // fallback al paymentMethod único con total completo
    methods = [{ method: sale.paymentMethod || 'DESCONOCIDO', amount: Number(sale.total||0), accountId }];
  }

  const entries = [];
  for (const m of methods) {
    let accId = m.accountId || accountId;
    if (!accId) {
      const acc = await ensureDefaultCashAccount(companyId);
      accId = acc._id;
    }
    const prevBal = await computeBalance(accId, companyId);
    const amount = Number(m.amount||0);
    const newBal = prevBal + amount;
    const entry = await CashFlowEntry.create({
      companyId,
      accountId: accId,
      kind: 'IN',
      source: 'SALE',
      sourceRef: sale._id,
      description: `Venta #${String(sale.number || '').padStart(5,'0')} (${m.method})`,
      amount,
      balanceAfter: newBal,
      meta: { saleNumber: sale.number, paymentMethod: m.method }
    });
    entries.push(entry);
  }
  return entries;
}
