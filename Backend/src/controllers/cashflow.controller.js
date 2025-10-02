import Account from '../models/Account.js';
import CashFlowEntry from '../models/CashFlowEntry.js';
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
  const rows = await Account.find({ companyId: req.companyId }).sort({ createdAt: 1 });
  res.json(rows);
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
  const accounts = await Account.find({ companyId });
  const balances = [];
  for (const acc of accounts) {
    const bal = await computeBalance(acc._id, companyId);
    balances.push({ accountId: acc._id, name: acc.name, type: acc.type, balance: bal });
  }
  const total = balances.reduce((a, b) => a + b.balance, 0);
  res.json({ balances, total });
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
    CashFlowEntry.find(q).sort({ date: -1, _id: -1 }).skip((pg - 1) * lim).limit(lim),
    CashFlowEntry.countDocuments(q)
  ]);
  // Totales en el rango
  const agg = await CashFlowEntry.aggregate([
    { $match: q },
    { $group: { _id: null, in: { $sum: { $cond: [{ $eq: ['$kind', 'IN'] }, '$amount', 0] } }, out: { $sum: { $cond: [{ $eq: ['$kind', 'OUT'] }, '$amount', 0] } } } }
  ]);
  const totals = agg[0] || { in: 0, out: 0 };
  res.json({ items: rows, page: pg, limit: lim, total: count, totals });
}

export async function createEntry(req, res) {
  const { accountId, kind = 'IN', amount, description = '', date } = req.body || {};
  if (!accountId) return res.status(400).json({ error: 'accountId required' });
  if (!amount || amount <= 0) return res.status(400).json({ error: 'positive amount required' });
  const acc = await Account.findOne({ _id: accountId, companyId: req.companyId });
  if (!acc) return res.status(404).json({ error: 'account not found' });
  const prevBal = await computeBalance(acc._id, req.companyId);
  const newBal = kind === 'IN' ? prevBal + amount : prevBal - amount;
  const entry = await CashFlowEntry.create({
    companyId: req.companyId,
    accountId: acc._id,
    kind,
    amount,
    description,
    source: 'MANUAL',
    date: date ? new Date(date) : new Date(),
    balanceAfter: newBal
  });
  res.json(entry);
}

// Utilizada desde cierre de venta
export async function registerSaleIncome({ companyId, sale, accountId }) {
  if (!sale || !sale._id) return null;
  // Idempotencia
  const exists = await CashFlowEntry.findOne({ companyId, source: 'SALE', sourceRef: sale._id });
  if (exists) return exists;
  let accId = accountId;
  if (!accId) {
    const acc = await ensureDefaultCashAccount(companyId);
    accId = acc._id;
  }
  const prevBal = await computeBalance(accId, companyId);
  const amount = Number(sale.total || 0);
  const newBal = prevBal + amount;
  const entry = await CashFlowEntry.create({
    companyId,
    accountId: accId,
    kind: 'IN',
    source: 'SALE',
    sourceRef: sale._id,
    description: `Venta #${String(sale.number || '').padStart(5,'0')}`,
    amount,
    balanceAfter: newBal,
    meta: { saleNumber: sale.number, paymentMethod: sale.paymentMethod }
  });
  return entry;
}
