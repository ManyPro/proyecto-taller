import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Item from '../models/Item.js';
import PriceEntry from '../models/PriceEntry.js';
import Counter from '../models/Counter.js';
import StockMove from '../models/StockMove.js';
import CustomerProfile from '../models/CustomerProfile.js';
import { upsertProfileFromSource } from './profile.helper.js';
import { publish } from '../lib/live.js';

// Helpers
const asNum = (n) => Number.isFinite(Number(n)) ? Number(n) : 0;

function computeTotals(sale) {
  const subtotal = (sale.items || []).reduce((a, it) => a + asNum(it.total), 0);
  sale.subtotal = Math.round(subtotal);
  sale.tax = 0; // ajustar si aplicas IVA
  sale.total = Math.round(sale.subtotal + sale.tax);
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function upperString(value) {
  return cleanString(value).toUpperCase();
}

function buildCustomerProfilePayload(companyId, sale) {
  if (!sale) return null;
  const plate = upperString(sale.vehicle?.plate);
  if (!plate) return null;

  return {
    companyId: String(companyId),
    plate,
    customer: {
      idNumber: cleanString(sale.customer?.idNumber),
      name: cleanString(sale.customer?.name),
      phone: cleanString(sale.customer?.phone),
      email: cleanString(sale.customer?.email),
      address: cleanString(sale.customer?.address)
    },
    vehicle: {
      plate,
      brand: upperString(sale.vehicle?.brand),
      line: upperString(sale.vehicle?.line),
      engine: upperString(sale.vehicle?.engine),
      year: sale.vehicle?.year ?? null,
      mileage: sale.vehicle?.mileage ?? null
    }
  };
}

function profileScore(doc) {
  if (!doc) return 0;
  const c = doc.customer || {};
  const v = doc.vehicle || {};
  let score = 0;

  if (cleanString(c.name)) score += 5;
  if (cleanString(c.idNumber)) score += 3;
  if (cleanString(c.phone)) score += 2;
  if (cleanString(c.email)) score += 1;
  if (cleanString(c.address)) score += 1;

  if (cleanString(v.brand)) score += 2;
  if (cleanString(v.line)) score += 1;
  if (cleanString(v.engine)) score += 1;
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

function mergeProfileData(existingDoc, payload) {
  const base = existingDoc?.toObject?.() ?? existingDoc ?? {};
  const mergedCustomer = {
    idNumber: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    ...(base.customer || {})
  };
  const mergedVehicle = {
    plate: payload.plate,
    brand: '',
    line: '',
    engine: '',
    year: null,
    mileage: null,
    ...(base.vehicle || {})
  };

  for (const key of ['idNumber', 'name', 'phone', 'email', 'address']) {
    const value = payload.customer?.[key];
    if (value) mergedCustomer[key] = value;
  }

  for (const key of ['brand', 'line', 'engine']) {
    const value = payload.vehicle?.[key];
    if (value) mergedVehicle[key] = value;
  }

  if (payload.vehicle && Object.prototype.hasOwnProperty.call(payload.vehicle, 'year')) {
    if (payload.vehicle.year === null) mergedVehicle.year = null;
    else if (payload.vehicle.year != null) mergedVehicle.year = payload.vehicle.year;
  }

  if (payload.vehicle && Object.prototype.hasOwnProperty.call(payload.vehicle, 'mileage')) {
    if (payload.vehicle.mileage === null) mergedVehicle.mileage = null;
    else if (payload.vehicle.mileage != null) mergedVehicle.mileage = payload.vehicle.mileage;
  }

  mergedVehicle.plate = payload.plate;

  return {
    companyId: payload.companyId,
    plate: payload.plate,
    customer: mergedCustomer,
    vehicle: mergedVehicle
  };
}

async function upsertCustomerProfile(companyId, sale) { await upsertProfileFromSource(companyId, sale); }

async function getNextSaleNumber(companyId) {
  const c = await Counter.findOneAndUpdate(
    { companyId },
    { $inc: { saleSeq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return c.saleSeq;
}

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

    const q = asNum(qty) || 1;
    const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : asNum(it.salePrice);

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
      const q = asNum(qty) || 1;
      const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : asNum(pe.total || pe.price);
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
      // Línea manual de servicio
      const q = asNum(qty) || 1;
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
    // Si decides mantener la fuente "service" explícita
    const q = asNum(qty) || 1;
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
  computeTotals(sale);
  await sale.save();
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
  try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

// ===== Batch add items (desde cotización u otro origen) =====
// Payload esperado: { items: [ { source, refId, sku, name, qty, unitPrice } ... ] }
// - source: 'inventory' | 'price' | 'service'
// - Si source=='inventory' puede venir refId o sku (se intenta resolver)
// - Para 'price' puede venir refId o datos manuales (como en addItem)
// - Para 'service' se acepta línea manual
// Realiza validación mínima y agrega todas las líneas en memoria antes de guardar para computar totales una sola vez.
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
      const qty = asNum(raw.qty) || 1;
      const unitCandidate = raw.unitPrice;

      if (source === 'inventory') {
        let it = null;
        if (raw.refId) it = await Item.findOne({ _id: raw.refId, companyId: req.companyId });
        if (!it && raw.sku) it = await Item.findOne({ sku: String(raw.sku).trim().toUpperCase(), companyId: req.companyId });
        if (!it) throw new Error('Inventory item not found');
        const up = Number.isFinite(Number(unitCandidate)) ? Number(unitCandidate) : asNum(it.salePrice);
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
          const up = Number.isFinite(Number(unitCandidate)) ? Number(unitCandidate) : asNum(pe.total || pe.price);
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

      // service (línea manual)
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
      // Continúa con los demás items; opcionalmente podríamos acumular errores
      // Para transparencia, se podría devolver summary, pero mantenemos simple.
      continue;
    }
  }

  if (!added.length) return res.status(400).json({ error: 'No se pudo agregar ningún item' });
  sale.items.push(...added);
  computeTotals(sale);
  await sale.save();
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
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

  if (qty != null && Number.isFinite(Number(qty))) it.qty = asNum(qty);
  if (unitPrice != null && Number.isFinite(Number(unitPrice))) it.unitPrice = asNum(unitPrice);
  it.total = Math.round(asNum(it.qty) * asNum(it.unitPrice));

  computeTotals(sale);
  await sale.save();
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
  try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

export const removeItem = async (req, res) => {
  const { id, itemId } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

  sale.items.id(itemId)?.deleteOne();
  computeTotals(sale);
  await sale.save();
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
  try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

// ===== Técnico asignado =====
export const updateTechnician = async (req, res) => {
  const { id } = req.params;
  const { technician } = req.body || {};
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });
  const tech = String(technician || '').trim().toUpperCase();
  sale.technician = tech;
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

  sale.customer = {
    type: customer.type || sale.customer?.type || '',
    idNumber: (customer.idNumber || '').trim(),
    name: (customer.name || '').trim(),
    phone: (customer.phone || '').trim(),
    email: (customer.email || '').trim(),
    address: (customer.address || '').trim()
  };
  sale.vehicle = {
    plate: (vehicle.plate || '').toUpperCase(),
    brand: (vehicle.brand || '').toUpperCase(),
    line: (vehicle.line || '').toUpperCase(),
    engine: (vehicle.engine || '').toUpperCase(),
    year: vehicle.year ?? null,
    mileage: vehicle.mileage ?? null
  };
  if (typeof notes === 'string') sale.notes = notes;

  await sale.save();
  await upsertCustomerProfile(req.companyId, sale);
  try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

// ===== Cierre: descuenta inventario con transacción =====
export const closeSale = async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sale = await Sale.findOne({ _id: id, companyId: req.companyId }).session(session);
      if (!sale) throw new Error('Sale not found');
      if (sale.status !== 'draft') throw new Error('Sale not open (draft)');
      if (!sale.items?.length) throw new Error('Sale has no items');

      // Descuento inventario por líneas 'inventory'
      for (const it of sale.items) {
        if (String(it.source) !== 'inventory') continue;
        const q = asNum(it.qty) || 0;
        if (q <= 0) continue;
        let target = null;
        // Fallback: si no hay refId válido intentar por SKU
        if (it.refId) {
          target = await Item.findOne({ _id: it.refId, companyId: req.companyId }).session(session);
        }
        if (!target && it.sku) {
          target = await Item.findOne({ sku: String(it.sku).trim().toUpperCase(), companyId: req.companyId }).session(session);
          // Si lo encontramos por sku y no había refId, opcionalmente lo guardamos para trazabilidad
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

      computeTotals(sale);
      sale.status = 'closed';
      sale.closedAt = new Date();
      if (!Number.isFinite(Number(sale.number))) {
        sale.number = await getNextSaleNumber(req.companyId);
      }
      await sale.save({ session });
    });

    const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
    try{ publish(req.companyId, 'sale:closed', { id: (sale?._id)||undefined }) }catch{}
    res.json({ ok: true, sale: sale.toObject() });
  } catch (err) {
    await session.abortTransaction().catch(()=>{});
    res.status(400).json({ error: err?.message || 'Cannot close sale' });
  } finally {
    session.endSession();
  }
};

// ===== Cancelar (X de pestaña) =====
export const cancelSale = async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status === 'closed') return res.status(400).json({ error: 'Closed sale cannot be cancelled' });
  // Política actual: eliminar; si prefieres histórico, cambia a status:'cancelled' y setea cancelledAt.
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
      const up = asNum(it.salePrice);
      sale.items.push({
        source: 'inventory',
        refId: it._id,
        sku: it.sku,
        name: it.name || it.sku,
        qty: q,
        unitPrice: up,
        total: Math.round(q * up)
      });
      computeTotals(sale);
      await sale.save();
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
      return res.json(sale.toObject());
    }
  }

  // Fallback: tratar como SKU
  const it = await Item.findOne({ sku: s.toUpperCase(), companyId: req.companyId });
  if (!it) return res.status(404).json({ error: 'SKU not found' });

  const q = 1;
  const up = asNum(it.salePrice);
  sale.items.push({
    source: 'inventory',
    refId: it._id,
    sku: it.sku,
    name: it.name || it.sku,
    qty: q,
    unitPrice: up,
    total: Math.round(q * up)
  });
  computeTotals(sale);
  await sale.save();
  await upsertCustomerProfile(req.companyId, sale);
  res.json(sale.toObject());
};

// ===== Listado y resumen =====

// ===== Perfil de cliente/vehículo =====
export const getProfileByPlate = async (req, res) => {
  const plate = String(req.params.plate || '').trim().toUpperCase();
  if (!plate) return res.status(400).json({ error: 'plate required' });

  const companyId = String(req.companyId);
  const fuzzy = String(req.query.fuzzy || 'false').toLowerCase() === 'true';
  let query;
  if (fuzzy) {
    // Permite confusión entre 0 y O y coincidencia parcial inicial
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
