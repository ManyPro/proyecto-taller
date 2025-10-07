import Account from '../models/Account.js';
import CashFlowEntry from '../models/CashFlowEntry.js';
import mongoose from 'mongoose';

// Helpers

<<<<<<< Updated upstream
async function computeBalance(accountId, companyId) {
  // Usa el balanceAfter del ultimo movimiento si existe
  const last = await CashFlowEntry.findOne({ companyId, accountId }).sort({ date: -1, _id: -1 });
  if (last) return last.balanceAfter;
  const acc = await Account.findOne({ _id: accountId, companyId });
  return acc ? acc.initialBalance : 0;
}
=======
>>>>>>> Stashed changes

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
    const bal = await computeBalance(req.companyId, acc._id);
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
  const prevBal = await computeBalance(req.companyId, acc._id);
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
  await recomputeAccountBalances(req.companyId, acc._id);
  const fresh = await CashFlowEntry.findById(entry._id);
  res.json(fresh || entry);
}

// --- Recalcular balances secuenciales de una cuenta ---
<<<<<<< Updated upstream
async function recomputeAccountBalances(companyId, accountId){
  if(!companyId || !accountId) return;
  const acc = await Account.findOne({ _id: accountId, companyId });
  if(!acc) return;
  const entries = await CashFlowEntry.find({ companyId, accountId }).sort({ date: 1, _id: 1 });
  let running = acc.initialBalance || 0;
  for(const e of entries){
    if(e.kind === 'IN') running += e.amount; else if(e.kind === 'OUT') running -= e.amount;
    // Solo actualizar si cambio para minimizar writes
    if(e.balanceAfter !== running){
      e.balanceAfter = running;
      await e.save();
    }
  }
}
=======
>>>>>>> Stashed changes

// PATCH /cashflow/entries/:id
export async function updateEntry(req, res){
  const { id } = req.params;
  const { amount, description, date, kind } = req.body || {};
  const entry = await CashFlowEntry.findOne({ _id: id, companyId: req.companyId });
  if(!entry) return res.status(404).json({ error: 'entry not found' });
<<<<<<< Updated upstream
  // Opcional: restringir edicion de movimientos generados por venta a solo descripcion
  // Permitimos edicion completa para correcciones manuales.
  let mutated = false;
  if(amount!=null){
    const a = Number(amount);
    if(!Number.isFinite(a) || a<=0) return res.status(400).json({ error: 'amount invalido' });
=======
  // Opcional: restringir ediciÃ³n de movimientos generados por venta a sÃ³lo descripciÃ³n
  // Permitimos ediciÃ³n completa para correcciones manuales.
  let mutated = false;
  if(amount!=null){
    const a = Number(amount);
    if(!Number.isFinite(a) || a<=0) return res.status(400).json({ error: 'amount invÃ¡lido' });
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
  const existing = await CashFlowEntry.find({ companyId, source: 'SALE', sourceRef: sale._id }).sort({ date: 1, _id: 1 });

=======
  // Determinar mÃ©todos de pago: nuevo array o fallback al legacy
>>>>>>> Stashed changes
  let methods = Array.isArray(sale.paymentMethods) && sale.paymentMethods.length
    ? sale.paymentMethods
    : [];

  methods = methods
    .map(m => ({
      method: String(m?.method || '').trim().toUpperCase(),
      amount: Math.round(Number(m?.amount || 0)),
      accountId: m?.accountId ? new mongoose.Types.ObjectId(m.accountId) : null
    }))
    .filter(m => m.method && m.amount > 0);

  if (!methods.length) {
<<<<<<< Updated upstream
    const fallbackAmount = Math.round(Number(sale.total || 0));
    if (fallbackAmount <= 0) return existing;
    methods = [{
      method: String(sale.paymentMethod || 'DESCONOCIDO').trim().toUpperCase(),
      amount: fallbackAmount,
      accountId: accountId ? new mongoose.Types.ObjectId(accountId) : null
    }];
=======
    // fallback al paymentMethod Ãºnico con total completo
    methods = [{ method: sale.paymentMethod || 'DESCONOCIDO', amount: Number(sale.total||0), accountId }];
>>>>>>> Stashed changes
  }

  const expectedTotal = methods.reduce((sum, m) => sum + m.amount, 0);
  const matched = new Set();
  const pending = [];
  const adjustments = [];

  methods.forEach(expected => {
    let idx = existing.findIndex((entry, index) => {
      if (matched.has(index)) return false;
      const entryMethod = String(entry.meta?.paymentMethod || '').trim().toUpperCase();
      return entryMethod && entryMethod === expected.method;
    });

    if (idx === -1) {
      idx = existing.findIndex((entry, index) => {
        if (matched.has(index)) return false;
        const entryAmount = Math.round(Number(entry.amount || 0));
        return entryAmount === expected.amount;
      });
    }

    if (idx === -1) {
      pending.push(expected);
      return;
    }

    matched.add(idx);
    const entry = existing[idx];
    const entryAmount = Math.round(Number(entry.amount || 0));
    const entryMethod = String(entry.meta?.paymentMethod || '').trim().toUpperCase();
    if (entryAmount !== expected.amount || entryMethod !== expected.method) {
      adjustments.push({ entry, expected });
    }
  });

  const existingTotal = existing.reduce((sum, entry) => sum + Math.round(Number(entry.amount || 0)), 0);
  if (!pending.length && !adjustments.length && matched.size === methods.length && existingTotal === expectedTotal) {
    return existing;
  }

  const saleDate = sale.closedAt || sale.updatedAt || new Date();
  const touchedAccounts = new Set();

  for (const { entry, expected } of adjustments) {
    entry.amount = expected.amount;
    entry.meta = { ...(entry.meta || {}), saleNumber: sale.number, paymentMethod: expected.method };
    entry.description = `Venta #${String(sale.number || '').padStart(5, '0')} (${expected.method})`;
    if (!entry.date) entry.date = saleDate;
    await entry.save();
    if (entry.accountId) touchedAccounts.add(String(entry.accountId));
  }

  const createdIds = [];

  for (const method of pending) {
    let accId = method.accountId || accountId;
    if (accId && accId._id) accId = accId._id;
    if (accId && !(accId instanceof mongoose.Types.ObjectId)) {
      accId = new mongoose.Types.ObjectId(accId);
    }
    if (!accId) {
      const acc = await ensureDefaultCashAccount(companyId);
      accId = acc._id;
    }
<<<<<<< Updated upstream
    touchedAccounts.add(String(accId));
    const prevBal = await computeBalance(accId, companyId);
    const amount = method.amount;
=======
    const prevBal = await computeBalance(companyId, accId);
    const amount = Number(m.amount||0);
    const newBal = prevBal + amount;
>>>>>>> Stashed changes
    const entry = await CashFlowEntry.create({
      companyId,
      accountId: accId,
      kind: 'IN',
      source: 'SALE',
      sourceRef: sale._id,
      description: `Venta #${String(sale.number || '').padStart(5, '0')} (${method.method})`,
      amount,
      balanceAfter: prevBal + amount,
      date: saleDate,
      meta: { saleNumber: sale.number, paymentMethod: method.method }
    });
    createdIds.push(entry._id);
  }

  for (const entry of existing) {
    if (entry.accountId) touchedAccounts.add(String(entry.accountId));
  }

  for (const accId of touchedAccounts) {
    await recomputeAccountBalances(companyId, accId);
  }

  if (createdIds.length) {
    return CashFlowEntry.find({ companyId, _id: { $in: createdIds } }).sort({ date: 1, _id: 1 });
  }

  return CashFlowEntry.find({ companyId, source: 'SALE', sourceRef: sale._id }).sort({ date: 1, _id: 1 });
}




