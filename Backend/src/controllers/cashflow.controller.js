import Account from '../models/Account.js';
import CashFlowEntry from '../models/CashFlowEntry.js';
import Company from '../models/Company.js';
import mongoose from 'mongoose';
import { createDateRange, now, localToUTC } from '../lib/dateTime.js';

// Helpers
export async function ensureDefaultCashAccount(companyId) {
  let acc = await Account.findOne({ companyId, type: 'CASH', name: /caja/i });
  if (!acc) {
    acc = await Account.create({ companyId, name: 'Caja', type: 'CASH', initialBalance: 0 });
  }
  return acc;
}

export async function computeBalance(accountId, companyId) {
  // Obtener balance inicial de la cuenta
  const acc = await Account.findOne({ _id: accountId, companyId });
  const initialBalance = acc ? (acc.initialBalance || 0) : 0;
  
  // Calcular balance usando agregación MongoDB (más eficiente que cargar todas las entradas)
  // Esto asegura que las entradas con fecha futura no afecten el balance actual
  const currentDate = now();
  const result = await CashFlowEntry.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        accountId: new mongoose.Types.ObjectId(accountId),
        date: { $lte: currentDate } // Solo entradas hasta la fecha actual
      }
    },
    {
      $group: {
        _id: null,
        totalIn: {
          $sum: {
            $cond: [{ $eq: ['$kind', 'IN'] }, '$amount', 0]
          }
        },
        totalOut: {
          $sum: {
            $cond: [{ $eq: ['$kind', 'OUT'] }, '$amount', 0]
          }
        }
      }
    }
  ]);
  
  const totals = result[0] || { totalIn: 0, totalOut: 0 };
  const balance = initialBalance + (totals.totalIn || 0) - (totals.totalOut || 0);
  
  return balance;
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
  const total = balances.reduce((a, b) => a + (b.balance || 0), 0);
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
  
  // Usar el util de fechas para crear el rango correctamente
  const dateRange = createDateRange(from, to);
  if (dateRange.from || dateRange.to) {
    q.date = {};
    if (dateRange.from) q.date.$gte = dateRange.from;
    if (dateRange.to) q.date.$lte = dateRange.to;
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
  res.json({ items: rows, page: pg, limit: lim, total: count, totals });
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
    date: date ? localToUTC(date) : new Date(),
    balanceAfter: newBal
  });
  res.json(entry);
}

// --- Recalcular balances secuenciales de una cuenta ---
export async function recomputeAccountBalances(companyId, accountId){
  if(!companyId || !accountId) return;
  const acc = await Account.findOne({ _id: accountId, companyId });
  if(!acc) return;
  
  const entries = await CashFlowEntry.find({ companyId, accountId }).sort({ date: 1, _id: 1 }).lean();
  let running = acc.initialBalance || 0;
  
  // Preparar actualizaciones en batch
  const updates = [];
  for(const e of entries){
    if(e.kind === 'IN') running += (e.amount || 0);
    else if(e.kind === 'OUT') running -= (e.amount || 0);
    
    // Solo actualizar si cambió para minimizar writes
    if(e.balanceAfter !== running){
      updates.push({
        updateOne: {
          filter: { _id: e._id },
          update: { $set: { balanceAfter: running } }
        }
      });
    }
  }
  
  // Ejecutar actualizaciones en batch si hay cambios
  if(updates.length > 0){
    await CashFlowEntry.bulkWrite(updates);
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
  if(amount != null){
    const a = Number(amount);
    if(!Number.isFinite(a) || a <= 0) return res.status(400).json({ error: 'amount inválido' });
    entry.amount = Math.round(a);
    mutated = true;
  }
  if(description !== undefined){
    entry.description = String(description || '');
    mutated = true;
  }
  if(date){
    const d = new Date(date);
    if(!isNaN(d.getTime())){
      entry.date = d;
      mutated = true;
    }
  }
  if(kind && (kind === 'IN' || kind === 'OUT')){
    entry.kind = kind;
    mutated = true;
  }
  
  if(!mutated) return res.json(entry);
  
  await entry.save();
  // Recalcular balances solo si cambió amount, kind o date (afectan el balance)
  if(amount != null || kind || date){
    await recomputeAccountBalances(req.companyId, entry.accountId);
  }
  
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
export async function registerSaleIncome({ companyId, sale, accountId, forceCreate = false }) {
  if (!sale || !sale._id) return [];
  
  // Si ya existen entradas para la venta, devolverlas (idempotencia)
  // A menos que forceCreate sea true (para actualizaciones de cierre)
  if (!forceCreate) {
    const existing = await CashFlowEntry.find({ 
      companyId, 
      source: 'SALE', 
      sourceRef: sale._id 
    }).lean();
    if (existing.length) return existing;
  }

  // Determinar métodos de pago: nuevo array o fallback al legacy
  let methods = Array.isArray(sale.paymentMethods) && sale.paymentMethods.length
    ? sale.paymentMethods.filter(m => m && m.method && Number(m.amount) > 0)
    : [];
  
  if (!methods.length) {
    // Fallback al paymentMethod único con total completo
    methods = [{ 
      method: sale.paymentMethod || 'DESCONOCIDO', 
      amount: Number(sale.total || 0), 
      accountId 
    }];
  }

  // Filtrar métodos de crédito (no deben generar entrada de caja)
  methods = methods.filter(m => {
    const method = String(m.method || '').toUpperCase();
    return method !== 'CREDITO' && method !== 'CRÉDITO';
  });

  if (!methods.length) return []; // No hay métodos de pago efectivo

  const entries = [];
  // Track balances por cuenta para pagos múltiples a la misma cuenta
  const accountBalances = new Map();
  
  // Usar la fecha de cierre de la venta (closedAt) en lugar de new Date()
  // Esto asegura que la fecha del movimiento coincida con la fecha de cierre
  const saleDate = sale.closedAt || sale.updatedAt || new Date();
  
  // Preparar todas las entradas antes de crear (mejor para transacciones)
  const entriesToCreate = [];
  
  for (const m of methods) {
    let accId = m.accountId || accountId;
    if (!accId) {
      const acc = await ensureDefaultCashAccount(companyId);
      accId = acc._id;
    }
    
    // Si ya procesamos un pago a esta cuenta, usar el balance incremental
    let prevBal;
    if (accountBalances.has(String(accId))) {
      prevBal = accountBalances.get(String(accId));
    } else {
      prevBal = await computeBalance(accId, companyId);
      accountBalances.set(String(accId), prevBal);
    }
    
    const amount = Number(m.amount || 0);
    if (amount <= 0) continue; // Saltar montos inválidos
    
    const newBal = prevBal + amount;
    accountBalances.set(String(accId), newBal); // Actualizar para el próximo pago
    
    entriesToCreate.push({
      companyId,
      accountId: accId,
      kind: 'IN',
      source: 'SALE',
      sourceRef: sale._id,
      description: `Venta #${String(sale.number || '').padStart(5, '0')} (${m.method})`,
      amount,
      balanceAfter: newBal,
      date: saleDate,
      meta: { saleNumber: sale.number, paymentMethod: m.method }
    });
  }
  
  // Crear todas las entradas en batch si hay alguna
  if (entriesToCreate.length > 0) {
    const created = await CashFlowEntry.insertMany(entriesToCreate);
    entries.push(...created);
  }
  
  return entries;
}

