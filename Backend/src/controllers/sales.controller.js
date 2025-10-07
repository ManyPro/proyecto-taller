import mongoose from 'mongoose';
import { registerSaleIncome } from './cashflow.controller.js';
import Sale from '../models/Sale.js';
import Item from '../models/Item.js';
import PriceEntry from '../models/PriceEntry.js';
import Counter from '../models/Counter.js';
import StockMove from '../models/StockMove.js';
import CustomerProfile from '../models/CustomerProfile.js';
import { upsertProfileFromSource } from './profile.helper.js';
import { publish } from '../lib/live.js';
import { asNumber, computeSaleTotals, normalizeString, toUpper, sanitizePaymentMethods } from '../services/sales/sale-utils.js';

// Helpers




<<<<<<< Updated upstream
function saleProfilePayload(source) {
  if (!source || typeof source !== 'object') return null;
  const customer = source.customer || {};
  const vehicle = source.vehicle || {};
  if (!Object.keys(customer).length && !Object.keys(vehicle).length) return null;
  return { customer, vehicle };
}

function resolveProfileOptions(options) {
  if (options && Object.keys(options).length) return options;
  return { source: 'sale' };
}

async function syncSaleProfile(companyId, source, options = {}) {
  const payload = saleProfilePayload(source);
  if (!payload) return null;
  return upsertProfileFromSource(companyId, payload, resolveProfileOptions(options));
}

function normalizePaymentMethods(rawList, saleTotal) {
  const list = Array.isArray(rawList) ? rawList : [];
  const cleaned = list
    .map(m => ({
      method: String(m?.method || '').trim().toUpperCase(),
      amount: Number(m?.amount || 0),
      accountId: m?.accountId ? new mongoose.Types.ObjectId(m.accountId) : null
    }))
    .filter(m => m.method && Number.isFinite(m.amount) && m.amount > 0);

  if (!cleaned.length) return [];

  const total = Math.round(Number(saleTotal || 0));
  const rawSum = cleaned.reduce((sum, m) => sum + m.amount, 0);
  if (Math.abs(rawSum - total) > 0.5) {
    throw new Error('La suma de los montos de pago no coincide con el total de la venta');
  }

  const payments = cleaned.map((m, idx) => ({
    method: m.method,
    accountId: m.accountId,
    amount: Math.round(m.amount),
    delta: Math.round(m.amount) - m.amount,
    index: idx
  }));

  let diff = total - payments.reduce((sum, p) => sum + p.amount, 0);

  if (diff !== 0 && payments.length) {
    const sign = diff > 0 ? 1 : -1;
    const preferred = payments
      .filter(p => (sign > 0 ? p.delta < 0 : p.delta > 0))
      .sort((a, b) => (sign > 0 ? a.delta - b.delta : b.delta - a.delta));
    const fallback = payments.filter(p => !preferred.includes(p));
    const pool = preferred.concat(fallback);

    for (const payment of pool) {
      if (diff === 0) break;
      while (diff !== 0) {
        const next = payment.amount + sign;
        if (next <= 0) break;
        payment.amount = next;
        payment.delta += sign;
        diff -= sign;
        if ((sign > 0 && payment.delta >= 0) || (sign < 0 && payment.delta <= 0)) break;
      }
    }
  }

  if (diff !== 0 && payments.length) {
    const last = payments[payments.length - 1];
    const adjusted = last.amount + diff;
    if (adjusted <= 0) {
      throw new Error('La suma de los montos de pago no coincide con el total de la venta');
    }
    last.amount = adjusted;
    diff = 0;
  }

  const finalSum = payments.reduce((sum, p) => sum + p.amount, 0);
  if (finalSum !== total) {
    throw new Error('La suma de los montos de pago no coincide con el total de la venta');
  }

  return payments.map(({ method, amount, accountId }) => ({ method, amount, accountId }));
}
=======
>>>>>>> Stashed changes

function profileScore(doc) {
  if (!doc) return 0;
  const c = doc.customer || {};
  const v = doc.vehicle || {};
  let score = 0;

  if (normalizeString(c.name)) score += 5;
  if (normalizeString(c.idNumber)) score += 3;
  if (normalizeString(c.phone)) score += 2;
  if (normalizeString(c.email)) score += 1;
  if (normalizeString(c.address)) score += 1;

  if (normalizeString(v.brand)) score += 2;
  if (normalizeString(v.line)) score += 1;
  if (normalizeString(v.engine)) score += 1;
  if (v.year != null) score += 1;
  if (v.mileage != null) score += 1;

  return score;
}

function orderProfiles(profiles = []) {
  return [...profiles].sort((a, b) => {
    const scoreDiff = profileScore(b) - profileScore(a);
    if (scoreDiff) return scoreDiff;
    const updatedDiff = (b?.updatedAt?.getTime?.() ?? 0) - (a?.updatedAt?.getTime?.() ?? 0);
    if (updatedDiff) return updatedDiff;
    return (b?.createdAt?.getTime?.() ?? 0) - (a?.createdAt?.getTime?.() ?? 0);
  });
}

<<<<<<< Updated upstream
=======


>>>>>>> Stashed changes
// ===== CRUD base =====
export const startSale = async (req, res) => {
  // Usa 'draft' para respetar el enum del modelo
  const sale = await Sale.create({ companyId: req.companyId, status: 'draft', items: [] });
  try{ publish(req.companyId, 'sale:started', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

export const getSale = async (req, res) => {
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  res.json(sale.toObject());
};

export const addItem = async (req, res) => {
  const { id } = req.params;
  const { source, refId, sku, qty = 1, unitPrice } = req.body || {};

  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

  let itemData = null;

  // El schema admite 'inventory', 'price', 'service'. Unificamos 'service' como 'price' para coherencia.
  const src = (source === 'service') ? 'price' : source;

  if (src === 'inventory') {
    let it = null;
    if (refId) it = await Item.findOne({ _id: refId, companyId: req.companyId });
    if (!it && sku) it = await Item.findOne({ sku: String(sku).trim().toUpperCase(), companyId: req.companyId });
    if (!it) return res.status(404).json({ error: 'Item not found' });

    const q = asNumber(qty) || 1;
    const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : asNumber(it.salePrice);

    itemData = {
      source: 'inventory',
      refId: it._id,
      sku: it.sku,
      name: it.name || it.sku,
      qty: q,
      unitPrice: up,
      total: Math.round(q * up)
    };
  } else if (src === 'price') {
    if (refId) {
      const pe = await PriceEntry.findOne({ _id: refId, companyId: String(req.companyId) });
      if (!pe) return res.status(404).json({ error: 'PriceEntry not found' });
      const q = asNumber(qty) || 1;
      const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : asNumber(pe.total || pe.price);
      itemData = {
        source: 'price',
        refId: pe._id,
        sku: `SRV-${String(pe._id).slice(-6)}`,
        name: `${pe.brand || ''} ${pe.line || ''} ${pe.engine || ''} ${pe.year || ''}`.trim(),
        qty: q,
        unitPrice: up,
        total: Math.round(q * up)
      };
    } else {
<<<<<<< Updated upstream
      // Linea manual de servicio
      const q = asNum(qty) || 1;
=======
      // LÃ­nea manual de servicio
      const q = asNumber(qty) || 1;
>>>>>>> Stashed changes
      const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : 0;
      itemData = {
        source: 'price',
        refId: new mongoose.Types.ObjectId(),
        sku: (sku || '').toString(),
        name: (req.body?.name || 'Servicio'),
        qty: q,
        unitPrice: up,
        total: Math.round(q * up)
      };
    }
  } else if (src === 'service') {
<<<<<<< Updated upstream
    // Si decides mantener la fuente "service" explicita
    const q = asNum(qty) || 1;
=======
    // Si decides mantener la fuente "service" explÃ­cita
    const q = asNumber(qty) || 1;
>>>>>>> Stashed changes
    const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : 0;
    itemData = {
      source: 'service',
      refId: new mongoose.Types.ObjectId(),
      sku: (sku || '').toString(),
      name: (req.body?.name || 'Servicio'),
      qty: q,
      unitPrice: up,
      total: Math.round(q * up)
    };
  } else {
    return res.status(400).json({ error: 'unsupported source' });
  }

  sale.items.push(itemData);
  computeSaleTotals(sale);
  await sale.save();
<<<<<<< Updated upstream
  await syncSaleProfile(req.companyId, sale, { source: 'sale' });
=======
  await upsertProfileFromSource(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
>>>>>>> Stashed changes
  try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

<<<<<<< Updated upstream
// ===== Batch add items (desde cotizacion u otro origen) =====
=======
// ===== Batch add items (desde cotizaciÃ³n u otro origen) =====
>>>>>>> Stashed changes
// Payload esperado: { items: [ { source, refId, sku, name, qty, unitPrice } ... ] }
// - source: 'inventory' | 'price' | 'service'
// - Si source=='inventory' puede venir refId o sku (se intenta resolver)
// - Para 'price' puede venir refId o datos manuales (como en addItem)
<<<<<<< Updated upstream
// - Para 'service' se acepta linea manual
// Realiza validacion minima y agrega todas las lineas en memoria antes de guardar para computar totales una sola vez.
=======
// - Para 'service' se acepta lÃ­nea manual
// Realiza validaciÃ³n mÃ­nima y agrega todas las lÃ­neas en memoria antes de guardar para computar totales una sola vez.
>>>>>>> Stashed changes
export const addItemsBatch = async (req, res) => {
  const { id } = req.params;
  const list = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!list.length) return res.status(400).json({ error: 'items vacio' });

  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

  const added = [];
  for (const raw of list) {
    if (!raw) continue;
    try {
      const source = (raw.source === 'service') ? 'service' : (raw.source === 'price' ? 'price' : (raw.source === 'inventory' ? 'inventory' : 'service'));
      const qty = asNumber(raw.qty) || 1;
      const unitCandidate = raw.unitPrice;

      if (source === 'inventory') {
        let it = null;
        if (raw.refId) it = await Item.findOne({ _id: raw.refId, companyId: req.companyId });
        if (!it && raw.sku) it = await Item.findOne({ sku: String(raw.sku).trim().toUpperCase(), companyId: req.companyId });
        if (!it) throw new Error('Inventory item not found');
        const up = Number.isFinite(Number(unitCandidate)) ? Number(unitCandidate) : asNumber(it.salePrice);
        added.push({
          source: 'inventory',
          refId: it._id,
          sku: it.sku,
          name: it.name || it.sku,
            qty,
          unitPrice: up,
          total: Math.round(qty * up)
        });
        continue;
      }

      if (source === 'price') {
        if (raw.refId) {
          const pe = await PriceEntry.findOne({ _id: raw.refId, companyId: req.companyId });
          if (!pe) throw new Error('PriceEntry not found');
          const up = Number.isFinite(Number(unitCandidate)) ? Number(unitCandidate) : asNumber(pe.total || pe.price);
          added.push({
            source: 'price',
            refId: pe._id,
            sku: `SRV-${String(pe._id).slice(-6)}`,
            name: `${pe.brand || ''} ${pe.line || ''} ${pe.engine || ''} ${pe.year || ''}`.trim(),
            qty,
            unitPrice: up,
            total: Math.round(qty * up)
          });
        } else {
          const up = Number.isFinite(Number(unitCandidate)) ? Number(unitCandidate) : 0;
          added.push({
            source: 'price',
            refId: new mongoose.Types.ObjectId(),
            sku: (raw.sku || '').toString(),
            name: raw.name || 'Servicio',
            qty,
            unitPrice: up,
            total: Math.round(qty * up)
          });
        }
        continue;
      }

<<<<<<< Updated upstream
      // service (linea manual)
=======
      // service (lÃ­nea manual)
>>>>>>> Stashed changes
      const up = Number.isFinite(Number(unitCandidate)) ? Number(unitCandidate) : 0;
      added.push({
        source: source === 'service' ? 'service' : 'price',
        refId: new mongoose.Types.ObjectId(),
        sku: (raw.sku || '').toString(),
        name: raw.name || raw.description || 'Servicio',
        qty,
        unitPrice: up,
        total: Math.round(qty * up)
      });
    } catch (err) {
<<<<<<< Updated upstream
      // Continua con los demas items; opcionalmente podriamos acumular errores
      // Para transparencia, se podria devolver summary, pero mantenemos simple.
=======
      // ContinÃºa con los demÃ¡s items; opcionalmente podrÃ­amos acumular errores
      // Para transparencia, se podrÃ­a devolver summary, pero mantenemos simple.
>>>>>>> Stashed changes
      continue;
    }
  }

<<<<<<< Updated upstream
  if (!added.length) return res.status(400).json({ error: 'No se pudo agregar ningun item' });
=======
  if (!added.length) return res.status(400).json({ error: 'No se pudo agregar ningÃºn item' });
>>>>>>> Stashed changes
  sale.items.push(...added);
  computeSaleTotals(sale);
  await sale.save();
<<<<<<< Updated upstream
  await syncSaleProfile(req.companyId, sale, { source: 'sale' });
=======
  await upsertProfileFromSource(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
>>>>>>> Stashed changes
  try { publish(req.companyId, 'sale:updated', { id: (sale?._id) || undefined }); } catch { }
  res.json(sale.toObject());
};

export const updateItem = async (req, res) => {
  const { id, itemId } = req.params;
  const { qty, unitPrice } = req.body || {};

  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });
  const it = sale.items.id(itemId);
  if (!it) return res.status(404).json({ error: 'Item not found' });

  if (qty != null && Number.isFinite(Number(qty))) it.qty = asNumber(qty);
  if (unitPrice != null && Number.isFinite(Number(unitPrice))) it.unitPrice = asNumber(unitPrice);
  it.total = Math.round(asNumber(it.qty) * asNumber(it.unitPrice));

  computeSaleTotals(sale);
  await sale.save();
<<<<<<< Updated upstream
  await syncSaleProfile(req.companyId, sale, { source: 'sale' });
=======
  await upsertProfileFromSource(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
>>>>>>> Stashed changes
  try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

export const removeItem = async (req, res) => {
  const { id, itemId } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

  sale.items.id(itemId)?.deleteOne();
  computeSaleTotals(sale);
  await sale.save();
<<<<<<< Updated upstream
  await syncSaleProfile(req.companyId, sale, { source: 'sale' });
=======
  await upsertProfileFromSource(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
>>>>>>> Stashed changes
  try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

<<<<<<< Updated upstream
// ===== Tecnico asignado =====
=======
// ===== TÃ©cnico asignado =====
>>>>>>> Stashed changes
export const updateTechnician = async (req, res) => {
  const { id } = req.params;
  const { technician } = req.body || {};
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });
  const tech = String(technician || '').trim().toUpperCase();
  sale.technician = tech;
  if (tech && !sale.initialTechnician) {
    sale.initialTechnician = tech;
    sale.technicianAssignedAt = new Date();
  }
  await sale.save();
  try { publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }); } catch {}
  res.json(sale.toObject());
};

export const setCustomerVehicle = async (req, res) => {
  const { id } = req.params;
  const { customer = {}, vehicle = {}, notes } = req.body || {};
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status === 'closed') return res.status(400).json({ error: 'Closed sale cannot be edited' });

  const formattedCustomer = {
    type: normalizeString(customer.type || sale.customer?.type || ''),
    idNumber: normalizeString(customer.idNumber),
    name: normalizeString(customer.name),
    phone: normalizeString(customer.phone),
    email: normalizeString(customer.email),
    address: normalizeString(customer.address)
  };
  const formattedVehicle = {
    plate: toUpper(vehicle.plate),
    brand: toUpper(vehicle.brand),
    line: toUpper(vehicle.line),
    engine: toUpper(vehicle.engine),
    year: vehicle.year ?? null,
    mileage: vehicle.mileage ?? null
  };
  sale.customer = formattedCustomer;
  sale.vehicle = formattedVehicle;
  if (typeof notes === 'string') sale.notes = notes;

  await sale.save();
<<<<<<< Updated upstream
  await syncSaleProfile(req.companyId, sale);
=======
  await upsertProfileFromSource(req.companyId, sale);
>>>>>>> Stashed changes
  try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

<<<<<<< Updated upstream
// ===== Cierre: descuenta inventario con transaccion =====
=======
// ===== Cierre: descuenta inventario con transacciÃ³n =====
>>>>>>> Stashed changes
export const closeSale = async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sale = await Sale.findOne({ _id: id, companyId: req.companyId }).session(session);
      if (!sale) throw new Error('Sale not found');
      if (sale.status !== 'draft') throw new Error('Sale not open (draft)');
      if (!sale.items?.length) throw new Error('Sale has no items');

<<<<<<< Updated upstream
      // Descuento inventario por lineas 'inventory'
=======
      // Descuento inventario por lÃ­neas 'inventory'
>>>>>>> Stashed changes
      for (const it of sale.items) {
        if (String(it.source) !== 'inventory') continue;
        const q = asNumber(it.qty) || 0;
        if (q <= 0) continue;
        let target = null;
<<<<<<< Updated upstream
        // Fallback: si no hay refId valido intentar por SKU
=======
        // Fallback: si no hay refId vÃ¡lido intentar por SKU
>>>>>>> Stashed changes
        if (it.refId) {
          target = await Item.findOne({ _id: it.refId, companyId: req.companyId }).session(session);
        }
        if (!target && it.sku) {
          target = await Item.findOne({ sku: String(it.sku).trim().toUpperCase(), companyId: req.companyId }).session(session);
<<<<<<< Updated upstream
          // Si lo encontramos por sku y no habia refId, opcionalmente lo guardamos para trazabilidad
=======
          // Si lo encontramos por sku y no habÃ­a refId, opcionalmente lo guardamos para trazabilidad
>>>>>>> Stashed changes
          if (target && !it.refId) {
            it.refId = target._id; // queda persistido al save posterior
          }
        }
        if (!target) throw new Error(`Inventory item not found (${it.sku || it.refId || 'sin id'})`);
        if ((target.stock ?? 0) < q) throw new Error(`Insufficient stock for ${target.sku || target.name}`);

        const upd = await Item.updateOne(
          { _id: target._id, companyId: req.companyId, stock: { $gte: q } },
          { $inc: { stock: -q } }
        ).session(session);
        if (upd.matchedCount === 0) throw new Error(`Stock update failed for ${target.sku || target.name}`);

        await StockMove.create([{
          companyId: req.companyId,
          itemId: target._id,
          qty: q,
          reason: 'OUT',
          meta: { saleId: sale._id, sku: it.sku, name: it.name }
        }], { session });
      }

      // === Datos de cierre adicionales (pago / mano de obra) ===
      const pm = String(req.body?.paymentMethod || '').trim();
      const technician = String(req.body?.technician || sale.technician || '').trim().toUpperCase();
      const laborValueRaw = req.body?.laborValue;
      const laborPercentRaw = req.body?.laborPercent;
      const paymentReceiptUrl = String(req.body?.paymentReceiptUrl || '').trim();

      // ---- Multi-payment (nuevo) ----
      const rawMethods = Array.isArray(req.body?.paymentMethods) ? req.body.paymentMethods : [];
      if (rawMethods.length) {
<<<<<<< Updated upstream
        computeTotals(sale);
        const normalizedMethods = normalizePaymentMethods(rawMethods, sale.total);
        if (normalizedMethods.length) {
          sale.paymentMethods = normalizedMethods;
          if (sale.paymentMethods.length) {
            sale.paymentMethod = sale.paymentMethods[0].method;
          }
=======
        computeSaleTotals(sale);
        const sanitizedMethods = sanitizePaymentMethods(rawMethods, sale.total);
        if (sanitizedMethods.length) {
          sale.paymentMethods = sanitizedMethods;
          sale.paymentMethod = sale.paymentMethods[0]?.method || sale.paymentMethod || '';
>>>>>>> Stashed changes
        }
      }

      const laborValue = Number(laborValueRaw);
      const laborPercent = Number(laborPercentRaw);
<<<<<<< Updated upstream
      if (laborValueRaw != null && (!Number.isFinite(laborValue) || laborValue < 0)) throw new Error('laborValue invalido');
      if (laborPercentRaw != null && (!Number.isFinite(laborPercent) || laborPercent < 0 || laborPercent > 100)) throw new Error('laborPercent invalido');
=======
      if (laborValueRaw != null && (!Number.isFinite(laborValue) || laborValue < 0)) throw new Error('laborValue invÃ¡lido');
      if (laborPercentRaw != null && (!Number.isFinite(laborPercent) || laborPercent < 0 || laborPercent > 100)) throw new Error('laborPercent invÃ¡lido');
>>>>>>> Stashed changes

      // computeSaleTotals ya pudo ejecutarse arriba para validar pagos; lo ejecutamos de nuevo por seguridad (idempotente)
      computeSaleTotals(sale);
      sale.status = 'closed';
      sale.closedAt = new Date();
      if (!Number.isFinite(Number(sale.number))) sale.number = await getNextSaleNumber(req.companyId);

<<<<<<< Updated upstream
      // Solo asignar paymentMethod legacy si no se establecio via array
      if (!sale.paymentMethods?.length && pm) sale.paymentMethod = pm.toUpperCase();
      if (technician) {
        sale.technician = technician;
        // Si aun no hay tecnico inicial, lo establecemos
=======
      // SÃ³lo asignar paymentMethod legacy si no se estableciÃ³ vÃ­a array
      if (!sale.paymentMethods?.length && pm) sale.paymentMethod = pm.toUpperCase();
      if (technician) {
        sale.technician = technician;
        // Si aÃºn no hay tÃ©cnico inicial, lo establecemos
>>>>>>> Stashed changes
        if (!sale.initialTechnician) {
          sale.initialTechnician = technician;
          if (!sale.technicianAssignedAt) sale.technicianAssignedAt = new Date();
        }
<<<<<<< Updated upstream
        // Registrar tecnico de cierre y timestamp
=======
        // Registrar tÃ©cnico de cierre y timestamp
>>>>>>> Stashed changes
        sale.closingTechnician = technician;
        sale.technicianClosedAt = new Date();
      }
      if (laborValueRaw != null) sale.laborValue = Math.round(laborValue);
      if (laborPercentRaw != null) sale.laborPercent = Math.round(laborPercent);
      if (sale.laborValue && sale.laborPercent) sale.laborShare = Math.round(sale.laborValue * (sale.laborPercent / 100));
      if (paymentReceiptUrl) sale.paymentReceiptUrl = paymentReceiptUrl;
      await sale.save({ session });
    });

    const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
<<<<<<< Updated upstream
    await syncSaleProfile(req.companyId, sale, { source: 'sale' });
=======
    await upsertProfileFromSource(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
>>>>>>> Stashed changes
    let cashflowEntries = [];
    try {
      const accountId = req.body?.accountId; // opcional desde frontend
      const resEntries = await registerSaleIncome({ companyId: req.companyId, sale, accountId });
      cashflowEntries = Array.isArray(resEntries) ? resEntries : (resEntries ? [resEntries] : []);
    } catch(e) { console.warn('registerSaleIncome failed:', e?.message||e); }
    try{ publish(req.companyId, 'sale:closed', { id: (sale?._id)||undefined }) }catch{}
    res.json({ ok: true, sale: sale.toObject(), cashflowEntries });
  } catch (err) {
    await session.abortTransaction().catch(()=>{});
    res.status(400).json({ error: err?.message || 'Cannot close sale' });
  } finally {
    session.endSession();
  }
};

<<<<<<< Updated upstream
// ===== Cancelar (X de pestana) =====
=======
// ===== Cancelar (X de pestaÃ±a) =====
>>>>>>> Stashed changes
export const cancelSale = async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status === 'closed') return res.status(400).json({ error: 'Closed sale cannot be cancelled' });
<<<<<<< Updated upstream
  // Politica actual: eliminar; si prefieres historico, cambia a status:'cancelled' y setea cancelledAt.
=======
  // PolÃ­tica actual: eliminar; si prefieres histÃ³rico, cambia a status:'cancelled' y setea cancelledAt.
>>>>>>> Stashed changes
  await Sale.deleteOne({ _id: id, companyId: req.companyId });
  try{ publish(req.companyId, 'sale:cancelled', { id: (sale?._id)||undefined }) }catch{}
  res.json({ ok: true });
};

// ===== QR helpers =====
export const addByQR = async (req, res) => {
  const { saleId, payload } = req.body || {};
  if (!saleId || !payload) return res.status(400).json({ error: 'saleId and payload are required' });

  const sale = await Sale.findOne({ _id: saleId, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

  const s = String(payload || '').trim();

  if (s.toUpperCase().startsWith('IT:')) {
    const parts = s.split(':').map(p => p.trim()).filter(Boolean);
    let itemId = null;
    if (parts.length === 2) itemId = parts[1];
    if (parts.length >= 3) itemId = parts[2];

    if (itemId) {
      const it = await Item.findOne({ _id: itemId, companyId: req.companyId });
      if (!it) return res.status(404).json({ error: 'Item not found for QR' });

      const q = 1;
      const up = asNumber(it.salePrice);
      sale.items.push({
        source: 'inventory',
        refId: it._id,
        sku: it.sku,
        name: it.name || it.sku,
        qty: q,
        unitPrice: up,
        total: Math.round(q * up)
      });
      computeSaleTotals(sale);
      await sale.save();
<<<<<<< Updated upstream
  await syncSaleProfile(req.companyId, sale, { source: 'sale' });
=======
  await upsertProfileFromSource(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
>>>>>>> Stashed changes
      return res.json(sale.toObject());
    }
  }

  // Fallback: tratar como SKU
  const it = await Item.findOne({ sku: s.toUpperCase(), companyId: req.companyId });
  if (!it) return res.status(404).json({ error: 'SKU not found' });

  const q = 1;
  const up = asNumber(it.salePrice);
  sale.items.push({
    source: 'inventory',
    refId: it._id,
    sku: it.sku,
    name: it.name || it.sku,
    qty: q,
    unitPrice: up,
    total: Math.round(q * up)
  });
  computeSaleTotals(sale);
  await sale.save();
<<<<<<< Updated upstream
  await syncSaleProfile(req.companyId, sale, { source: 'sale' });
=======
  await upsertProfileFromSource(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
>>>>>>> Stashed changes
  res.json(sale.toObject());
};

// ===== Listado y resumen =====

<<<<<<< Updated upstream
// ===== Perfil de cliente/vehiculo =====
=======
// ===== Perfil de cliente/vehÃ­culo =====
>>>>>>> Stashed changes
export const getProfileByPlate = async (req, res) => {
  const plate = String(req.params.plate || '').trim().toUpperCase();
  if (!plate) return res.status(400).json({ error: 'plate required' });

  const companyId = String(req.companyId);
  const fuzzy = String(req.query.fuzzy || 'false').toLowerCase() === 'true';
  let query;
  if (fuzzy) {
<<<<<<< Updated upstream
    // Permite confusion entre 0 y O y coincidencia parcial inicial
=======
    // Permite confusiÃ³n entre 0 y O y coincidencia parcial inicial
>>>>>>> Stashed changes
    const pattern = '^' + plate.replace(/[0O]/g, '[0O]');
    const rx = new RegExp(pattern, 'i');
    query = { companyId, $or: [ { plate: rx }, { 'vehicle.plate': rx } ] };
  } else {
    query = { companyId, $or: [{ plate }, { 'vehicle.plate': plate }] };
  }

  const matches = await CustomerProfile.find(query).sort({ updatedAt: -1, createdAt: -1 });
  if (!matches.length) return res.json(null);

  const ordered = orderProfiles(matches);
  const [primary, ...duplicates] = ordered;

  if (duplicates.length) {
    const ids = duplicates.map((doc) => doc._id).filter(Boolean);
    if (ids.length) {
      try {
        await CustomerProfile.deleteMany({ companyId, _id: { $in: ids } });
      } catch {}
    }
  }

  if (!primary) return res.json(null);

  let mutated = false;
  if (primary.plate !== plate) {
    primary.plate = plate;
    mutated = true;
  }
  if (!primary.vehicle) {
    primary.vehicle = { plate };
    mutated = true;
  } else if (primary.vehicle.plate !== plate) {
    primary.vehicle.plate = plate;
    mutated = true;
  }

  if (mutated) {
    try {
      await primary.save();
    } catch {}
  }

  res.json(primary.toObject());
};
export const listSales = async (req, res) => {
  const { status, from, to, plate, page = 1, limit = 50 } = req.query || {};
  const q = { companyId: req.companyId };
  if (status) q.status = String(status);
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (plate) {
    q['vehicle.plate'] = String(plate).toUpperCase();
  }
  const pg = Math.max(1, Number(page || 1));
  const lim = Math.max(1, Math.min(500, Number(limit || 50)));

  const [items, total] = await Promise.all([
    Sale.find(q).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
    Sale.countDocuments(q)
  ]);
  res.json({ items, page: pg, limit: lim, total });
};

export const summarySales = async (req, res) => {
  const { from, to, plate } = req.query || {};
  const q = { companyId: req.companyId, status: 'closed' };
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (plate) {
    q['vehicle.plate'] = String(plate).toUpperCase();
  }
  const rows = await Sale.aggregate([
    { $match: q },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: { $ifNull: ['$total', 0] } } } }
  ]);
  const agg = rows[0] || { count: 0, total: 0 };
  res.json({ count: agg.count, total: agg.total });
};

<<<<<<< Updated upstream
// ===== Reporte tecnico (laborShare) =====
=======
// ===== Reporte tÃ©cnico (laborShare) =====
>>>>>>> Stashed changes
export const technicianReport = async (req, res) => {
  try {
    let { from, to, technician, page = 1, limit = 100 } = req.query || {};
    const pg = Math.max(1, Number(page || 1));
    const lim = Math.max(1, Math.min(500, Number(limit || 100)));
    const tech = technician ? String(technician).trim().toUpperCase() : '';

    // Base match: ventas cerradas
    const match = { companyId: req.companyId, status: 'closed' };

    // Rango de fechas sobre closedAt (fallback updatedAt) usando $expr
    if (from || to) {
      const gte = from ? new Date(from + 'T00:00:00.000Z') : null;
      const lte = to ? new Date(to + 'T23:59:59.999Z') : null;
      if (gte || lte) {
        match.$expr = {
          $and: [
            gte ? { $gte: [ { $ifNull: ['$closedAt', '$updatedAt'] }, gte ] } : { $gte: [0,0] },
            lte ? { $lte: [ { $ifNull: ['$closedAt', '$updatedAt'] }, lte ] } : { $gte: [0,0] }
          ]
        };
      }
    }

    if (tech) {
      match.$or = [
        { technician: tech },
        { initialTechnician: tech },
        { closingTechnician: tech }
      ];
    }

    const skip = (pg - 1) * lim;

    const pipeline = [
      { $match: match },
      { $addFields: {
          _reportDate: { $ifNull: ['$closedAt', '$updatedAt'] },
          _laborShareCalc: {
            $cond: [
              { $and: [ { $gt: ['$laborValue', 0] }, { $gt: ['$laborPercent', 0] } ] },
              { $round: [ { $multiply: ['$laborValue', { $divide: ['$laborPercent', 100] }] }, 0 ] },
              { $ifNull: ['$laborShare', 0] }
            ]
          }
        }
      },
<<<<<<< Updated upstream
      // Filtrar solo las que tengan participacion > 0
=======
      // Filtrar solo las que tengan participaciÃ³n > 0
>>>>>>> Stashed changes
      { $match: { _laborShareCalc: { $gt: 0 } } },
      { $sort: { _reportDate: -1, _id: -1 } },
      { $facet: {
          rows: [ { $skip: skip }, { $limit: lim }, { $project: {
            number: 1, customer:1, vehicle:1, technician:1, initialTechnician:1, closingTechnician:1,
            laborValue:1, laborPercent:1,
            laborShare: { $ifNull: ['$laborShare', '$_laborShareCalc'] },
            total:1, closedAt:1, createdAt:1, _reportDate:1
          }} ],
          totals: [ { $group: { _id:null, count:{ $sum:1 }, salesTotal:{ $sum:{ $ifNull:['$total',0]} }, laborShareTotal:{ $sum:'$_laborShareCalc' } } } ]
        }
      }
    ];

    const agg = await Sale.aggregate(pipeline);
    const pack = agg[0] || { rows: [], totals: [] };
    const rows = pack.rows || [];
    const totalsRaw = pack.totals?.[0] || { count:0, salesTotal:0, laborShareTotal:0 };
    const totalDocs = totalsRaw.count || 0;

<<<<<<< Updated upstream
    // Fallback simple si no se obtuvieron filas pero deberian existir (debug)
=======
    // Fallback simple si no se obtuvieron filas pero deberÃ­an existir (debug)
>>>>>>> Stashed changes
    if (!rows.length) {
      const quick = await Sale.find({ companyId: req.companyId, status:'closed', laborShare: { $gt: 0 } })
        .sort({ closedAt:-1, updatedAt:-1 })
        .limit(lim)
        .lean();
      if (quick.length) {
        return res.json({
          filters: { from: from || null, to: to || null, technician: tech || null },
          pagination: { page: pg, limit: lim, total: quick.length, pages: 1 },
          aggregate: { laborShareTotal: quick.reduce((a,s)=>a+(s.laborShare||0),0), salesTotal: quick.reduce((a,s)=>a+(s.total||0),0), count: quick.length },
          items: quick
        });
      }
    }

    return res.json({
      filters: { from: from || null, to: to || null, technician: tech || null },
      pagination: { page: pg, limit: lim, total: totalDocs, pages: Math.ceil(totalDocs/lim) || 1 },
      aggregate: { laborShareTotal: totalsRaw.laborShareTotal, salesTotal: totalsRaw.salesTotal, count: totalsRaw.count },
      items: rows
    });
  } catch (err) {
    console.error('technicianReport error:', err);
<<<<<<< Updated upstream
    return res.status(500).json({ error: 'Error generando reporte tecnico' });
=======
    return res.status(500).json({ error: 'Error generando reporte tÃ©cnico' });
>>>>>>> Stashed changes
  }
};













