import mongoose from 'mongoose';
import { checkLowStockForMany } from '../lib/stockAlerts.js';
import { registerSaleIncome } from './cashflow.controller.js';
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
  // Asignar número de remisión al crear la venta (no al cerrarla)
  const saleNumber = await getNextSaleNumber(req.companyId);
  const sale = await Sale.create({ companyId: req.companyId, status: 'draft', items: [], number: saleNumber });
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
      const pe = await PriceEntry.findOne({ _id: refId, companyId: String(req.companyId) })
        .populate('itemId', 'sku name stock salePrice')
        .populate('comboProducts.itemId', 'sku name stock salePrice');
      if (!pe) return res.status(404).json({ error: 'PriceEntry not found' });
      const q = asNum(qty) || 1;
      const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : asNum(pe.total || pe.price);
      // Usar pe.name si existe (nuevo modelo), sino fallback a campos legacy
      const itemName = pe.name && pe.name.trim() 
        ? pe.name.trim()
        : `${pe.brand || ''} ${pe.line || ''} ${pe.engine || ''} ${pe.year || ''}`.trim() || 'Servicio';
      
      // Si es combo, agregar todos los productos del combo
      if (pe.type === 'combo' && Array.isArray(pe.comboProducts) && pe.comboProducts.length > 0) {
        // Los combos se agregan como múltiples items, así que usamos addItemsBatch
        // Por ahora, agregamos el combo como un item principal y luego agregamos los productos
        // Primero agregamos el combo principal como price
        sale.items.push({
          source: 'price',
          refId: pe._id,
          sku: `COMBO-${String(pe._id).slice(-6)}`,
          name: itemName,
          qty: q,
          unitPrice: up,
          total: Math.round(q * up)
        });
        
        // Luego agregamos cada producto del combo
        for (let idx = 0; idx < pe.comboProducts.length; idx++) {
          const cp = pe.comboProducts[idx];
          const comboQty = q * (cp.qty || 1);
          
          // Si es slot abierto, agregarlo a openSlots en lugar de items
          if (cp.isOpenSlot) {
            if (!sale.openSlots) sale.openSlots = [];
            sale.openSlots.push({
              comboPriceId: pe._id,
              slotIndex: idx,
              slotName: cp.name || 'Slot abierto',
              qty: comboQty,
              estimatedPrice: cp.unitPrice || 0,
              completed: false,
              completedItemId: null
            });
          } else if (cp.itemId) {
            // Producto vinculado: agregar como inventory para que se descuente
            const comboItem = cp.itemId;
            sale.items.push({
              source: 'inventory',
              refId: comboItem._id,
              sku: comboItem.sku || `CP-${String(cp._id || '').slice(-6)}`,
              name: cp.name || 'Producto del combo',
              qty: comboQty,
              unitPrice: cp.unitPrice || 0,
              total: Math.round(comboQty * (cp.unitPrice || 0))
            });
          } else {
            // Producto sin vincular: agregar como price
            sale.items.push({
              source: 'price',
              refId: new mongoose.Types.ObjectId(),
              sku: `CP-${String(cp._id || new mongoose.Types.ObjectId()).slice(-6)}`,
              name: cp.name || 'Producto del combo',
              qty: comboQty,
              unitPrice: cp.unitPrice || 0,
              total: Math.round(comboQty * (cp.unitPrice || 0))
            });
          }
        }
        
        computeTotals(sale);
        await sale.save();
        await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
        try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
        return res.json(sale.toObject());
      }
      
      // Si es producto vinculado con inventario, agregar como inventory para que se descuente
      if (pe.type === 'product' && pe.itemId) {
        const item = pe.itemId;
        itemData = {
          source: 'inventory',
          refId: item._id,
          sku: item.sku || `PRD-${String(pe._id).slice(-6)}`,
          name: itemName,
          qty: q,
          unitPrice: up,
          total: Math.round(q * up)
        };
      } else {
        // Servicio o producto sin vincular: agregar como price (no descuenta inventario)
        itemData = {
          source: 'price',
          refId: pe._id,
          sku: `SRV-${String(pe._id).slice(-6)}`,
          name: itemName,
          qty: q,
          unitPrice: up,
          total: Math.round(q * up)
        };
      }
    } else {
      // LÃ­nea manual de servicio
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
    // Si decides mantener la fuente "service" explÃ­cita
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

// ===== Batch add items (desde cotizaciÃ³n u otro origen) =====
// Payload esperado: { items: [ { source, refId, sku, name, qty, unitPrice } ... ] }
// - source: 'inventory' | 'price' | 'service'
// - Si source=='inventory' puede venir refId o sku (se intenta resolver)
// - Para 'price' puede venir refId o datos manuales (como en addItem)
// - Para 'service' se acepta lÃ­nea manual
// Realiza validaciÃ³n mÃ­nima y agrega todas las lÃ­neas en memoria antes de guardar para computar totales una sola vez.
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
          const pe = await PriceEntry.findOne({ _id: raw.refId, companyId: req.companyId })
            .populate('itemId', 'sku name stock salePrice')
            .populate('comboProducts.itemId', 'sku name stock salePrice');
          if (!pe) throw new Error('PriceEntry not found');
          const up = Number.isFinite(Number(unitCandidate)) ? Number(unitCandidate) : asNum(pe.total || pe.price);
          // Usar pe.name si existe (nuevo modelo), sino fallback a campos legacy
          const itemName = pe.name && pe.name.trim() 
            ? pe.name.trim()
            : `${pe.brand || ''} ${pe.line || ''} ${pe.engine || ''} ${pe.year || ''}`.trim() || 'Servicio';
          
          // Si es combo, agregar todos los productos del combo
          if (pe.type === 'combo' && Array.isArray(pe.comboProducts) && pe.comboProducts.length > 0) {
            // Primero agregamos el combo principal como price
            added.push({
              source: 'price',
              refId: pe._id,
              sku: `COMBO-${String(pe._id).slice(-6)}`,
              name: itemName,
              qty,
              unitPrice: up,
              total: Math.round(qty * up)
            });
            
            // Luego agregamos cada producto del combo
            for (let idx = 0; idx < pe.comboProducts.length; idx++) {
              const cp = pe.comboProducts[idx];
              const comboQty = qty * (cp.qty || 1);
              
              // Si es slot abierto, agregarlo a openSlots en lugar de items
              if (cp.isOpenSlot) {
                if (!sale.openSlots) sale.openSlots = [];
                sale.openSlots.push({
                  comboPriceId: pe._id,
                  slotIndex: idx,
                  slotName: cp.name || 'Slot abierto',
                  qty: comboQty,
                  estimatedPrice: cp.unitPrice || 0,
                  completed: false,
                  completedItemId: null
                });
              } else if (cp.itemId) {
                // Producto vinculado: agregar como inventory para que se descuente
                const comboItem = cp.itemId;
                added.push({
                  source: 'inventory',
                  refId: comboItem._id,
                  sku: comboItem.sku || `CP-${String(cp._id || '').slice(-6)}`,
                  name: cp.name || 'Producto del combo',
                  qty: comboQty,
                  unitPrice: cp.unitPrice || 0,
                  total: Math.round(comboQty * (cp.unitPrice || 0))
                });
              } else {
                // Producto sin vincular: agregar como price
                added.push({
                  source: 'price',
                  refId: new mongoose.Types.ObjectId(),
                  sku: `CP-${String(cp._id || new mongoose.Types.ObjectId()).slice(-6)}`,
                  name: cp.name || 'Producto del combo',
                  qty: comboQty,
                  unitPrice: cp.unitPrice || 0,
                  total: Math.round(comboQty * (cp.unitPrice || 0))
                });
              }
            }
          } else if (pe.type === 'product' && pe.itemId) {
            // Si es producto vinculado con inventario, agregar como inventory para que se descuente
            const item = pe.itemId;
            added.push({
              source: 'inventory',
              refId: item._id,
              sku: item.sku || `PRD-${String(pe._id).slice(-6)}`,
              name: itemName,
              qty,
              unitPrice: up,
              total: Math.round(qty * up)
            });
          } else {
            // Servicio o producto sin vincular: agregar como price (no descuenta inventario)
            added.push({
              source: 'price',
              refId: pe._id,
              sku: `SRV-${String(pe._id).slice(-6)}`,
              name: itemName,
              qty,
              unitPrice: up,
              total: Math.round(qty * up)
            });
          }
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

      // service (lÃ­nea manual)
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
      // ContinÃºa con los demÃ¡s items; opcionalmente podrÃ­amos acumular errores
      // Para transparencia, se podrÃ­a devolver summary, pero mantenemos simple.
      continue;
    }
  }

  if (!added.length) return res.status(400).json({ error: 'No se pudo agregar ningÃºn item' });
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

// ===== TÃ©cnico asignado =====
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

  sale.customer = {
    type: customer.type || sale.customer?.type || '',
    idNumber: (customer.idNumber || '').trim(),
    name: (customer.name || '').trim(),
    phone: (customer.phone || '').trim(),
    email: (customer.email || '').trim(),
    address: (customer.address || '').trim()
  };
  // Si se proporciona vehicleId, obtener datos del vehículo
  let vehicleData = {
    plate: (vehicle.plate || '').toUpperCase(),
    vehicleId: vehicle.vehicleId || null,
    brand: (vehicle.brand || '').toUpperCase(),
    line: (vehicle.line || '').toUpperCase(),
    engine: (vehicle.engine || '').toUpperCase(),
    year: vehicle.year ?? null,
    mileage: vehicle.mileage ?? null
  };

  if (vehicle.vehicleId) {
    const Vehicle = (await import('../models/Vehicle.js')).default;
    const vehicleDoc = await Vehicle.findById(vehicle.vehicleId);
    if (vehicleDoc && vehicleDoc.active) {
      vehicleData.vehicleId = vehicleDoc._id;
      vehicleData.brand = vehicleDoc.make;
      vehicleData.line = vehicleDoc.line;
      vehicleData.engine = vehicleDoc.displacement;
      // Validar año si se proporciona
      if (vehicle.year !== undefined && vehicle.year !== null) {
        const yearNum = Number(vehicle.year);
        if (!vehicleDoc.isYearInRange(yearNum)) {
          const range = vehicleDoc.getYearRange();
          return res.status(400).json({ 
            error: 'Año fuera de rango',
            message: `El año ${yearNum} está fuera del rango permitido para este vehículo${range ? ` (${range.start}-${range.end})` : ''}`
          });
        }
        vehicleData.year = yearNum;
      }
    } else {
      return res.status(404).json({ error: 'Vehículo no encontrado o inactivo' });
    }
  }

  sale.vehicle = vehicleData;
  if (typeof notes === 'string') sale.notes = notes;

  await sale.save();
  await upsertCustomerProfile(req.companyId, sale);
  try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

// ===== Cierre: descuenta inventario con transacciÃ³n =====
export const closeSale = async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  try {
    const affectedItemIds = [];
    await session.withTransaction(async () => {
      const sale = await Sale.findOne({ _id: id, companyId: req.companyId }).session(session);
      if (!sale) throw new Error('Sale not found');
      if (sale.status !== 'draft') throw new Error('Sale not open (draft)');
      if (!sale.items?.length) throw new Error('Sale has no items');
      
      // Validar que todos los slots abiertos estén completos
      if (sale.openSlots && sale.openSlots.length > 0) {
        const incompleteSlots = sale.openSlots.filter(slot => !slot.completed || !slot.completedItemId);
        if (incompleteSlots.length > 0) {
          const slotNames = incompleteSlots.map(s => s.slotName).join(', ');
          throw new Error(`Debes completar todos los slots abiertos antes de cerrar la venta. Pendientes: ${slotNames}`);
        }
      }

      // Procesar slots abiertos completados: agregarlos como items de inventario
      if (sale.openSlots && sale.openSlots.length > 0) {
        for (const slot of sale.openSlots) {
          if (!slot.completed || !slot.completedItemId) continue;
          
          const item = await Item.findOne({ _id: slot.completedItemId, companyId: req.companyId }).session(session);
          if (!item) throw new Error(`Item del inventario no encontrado para slot: ${slot.slotName}`);
          
          // Agregar como item de inventario para que se descuente
          sale.items.push({
            source: 'inventory',
            refId: item._id,
            sku: item.sku || `SLOT-${String(slot.completedItemId).slice(-6)}`,
            name: item.name || slot.slotName,
            qty: slot.qty || 1,
            unitPrice: item.salePrice || slot.estimatedPrice || 0,
            total: Math.round((slot.qty || 1) * (item.salePrice || slot.estimatedPrice || 0))
          });
        }
      }
      
      // Descuento inventario por lÃ­neas 'inventory'
      for (const it of sale.items) {
        if (String(it.source) !== 'inventory') continue;
        const q = asNum(it.qty) || 0;
        if (q <= 0) continue;
        let target = null;
        // Fallback: si no hay refId vÃ¡lido intentar por SKU
        if (it.refId) {
          target = await Item.findOne({ _id: it.refId, companyId: req.companyId }).session(session);
        }
        if (!target && it.sku) {
          target = await Item.findOne({ sku: String(it.sku).trim().toUpperCase(), companyId: req.companyId }).session(session);
          // Si lo encontramos por sku y no habÃ­a refId, opcionalmente lo guardamos para trazabilidad
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

        // Si quedÃ³ en 0, despublicar automÃ¡ticamente para ocultarlo del catÃ¡logo
        const fresh = await Item.findOne({ _id: target._id, companyId: req.companyId }).session(session);
        if ((fresh?.stock || 0) <= 0 && fresh?.published) {
          fresh.published = false;
          await fresh.save({ session });
        }

        await StockMove.create([{
          companyId: req.companyId,
          itemId: target._id,
          qty: q,
          reason: 'OUT',
          meta: { saleId: sale._id, sku: it.sku, name: it.name }
        }], { session });
        affectedItemIds.push(String(target._id));
      }

  // === Datos de cierre adicionales (pago / mano de obra) ===
      const pm = String(req.body?.paymentMethod || '').trim();
      const technician = String(req.body?.technician || sale.technician || '').trim().toUpperCase();
      const laborValueRaw = req.body?.laborValue;
      const laborPercentRaw = req.body?.laborPercent;
      const laborLines = Array.isArray(req.body?.laborCommissions) ? req.body.laborCommissions : null;
      const paymentReceiptUrl = String(req.body?.paymentReceiptUrl || '').trim();

      // ---- Multi-payment (nuevo) ----
      // Frontend envÃ­a paymentMethods: [{ method, amount, accountId } ... ]
      // Validamos y persistimos en sale.paymentMethods antes de guardar.
      let rawMethods = Array.isArray(req.body?.paymentMethods) ? req.body.paymentMethods : [];
      if (rawMethods.length) {
        // Normalizar y filtrar vÃ¡lidos
        const cleaned = rawMethods.map(m => ({
          method: String(m?.method || '').trim().toUpperCase(),
          amount: Number(m?.amount || 0) || 0,
          accountId: m?.accountId ? new mongoose.Types.ObjectId(m.accountId) : null
        })).filter(m => m.method && m.amount > 0);
        if (cleaned.length) {
          // Validar suma contra total (luego de computeTotals mÃ¡s abajo)
          // AÃºn no tenemos total actualizado si items cambiaron durante la sesiÃ³n, asÃ­ que haremos computeTotals antes de validar.
          computeTotals(sale);
          const sum = cleaned.reduce((a,b)=> a + b.amount, 0);
          const total = Number(sale.total || 0);
            if (Math.abs(sum - total) > 0.01) throw new Error('La suma de los montos de pago no coincide con el total de la venta');
          // Redondear montos a enteros para consistencia (COP sin decimales)
          sale.paymentMethods = cleaned.map(m => ({ method: m.method, amount: Math.round(m.amount), accountId: m.accountId }));
          // Mantener legacy paymentMethod con el primero (para compatibilidad con reportes antiguos)
          if (sale.paymentMethods.length) sale.paymentMethod = sale.paymentMethods[0].method;
        }
      }

      const laborValue = Number(laborValueRaw);
      const laborPercent = Number(laborPercentRaw);
      if (laborValueRaw != null && (!Number.isFinite(laborValue) || laborValue < 0)) throw new Error('laborValue invÃ¡lido');
      if (laborPercentRaw != null && (!Number.isFinite(laborPercent) || laborPercent < 0 || laborPercent > 100)) throw new Error('laborPercent invÃ¡lido');

      // computeTotals ya pudo ejecutarse arriba para validar pagos; lo ejecutamos de nuevo por seguridad (idempotente)
      computeTotals(sale);
      sale.status = 'closed';
      sale.closedAt = new Date();
      // El número de remisión ya se asignó al crear la venta, no se asigna aquí
      // Solo verificamos que tenga número (debería tenerlo desde la creación)
      if (!Number.isFinite(Number(sale.number))) {
        // Si por alguna razón no tiene número (venta antigua), asignarlo ahora
        sale.number = await getNextSaleNumber(req.companyId);
      }

      // SÃ³lo asignar paymentMethod legacy si no se estableciÃ³ vÃ­a array
      if (!sale.paymentMethods?.length && pm) sale.paymentMethod = pm.toUpperCase();
      if (technician) {
        sale.technician = technician;
        // Si aÃºn no hay tÃ©cnico inicial, lo establecemos
        if (!sale.initialTechnician) {
          sale.initialTechnician = technician;
          if (!sale.technicianAssignedAt) sale.technicianAssignedAt = new Date();
        }
        // Registrar tÃ©cnico de cierre y timestamp
        sale.closingTechnician = technician;
        sale.technicianClosedAt = new Date();
      }
      if (laborValueRaw != null) sale.laborValue = Math.round(laborValue);
      if (laborPercentRaw != null) sale.laborPercent = Math.round(laborPercent);
      if (sale.laborValue && sale.laborPercent) {
        sale.laborShare = Math.round(sale.laborValue * (sale.laborPercent / 100));
      }
      if (laborLines && laborLines.length) {
        const lines = [];
        for (const ln of laborLines) {
          const tech = String(ln?.technician || technician || '').trim().toUpperCase();
          const kind = String(ln?.kind || '').trim().toUpperCase();
          const lv = Number(ln?.laborValue || 0);
          const pc = Number(ln?.percent || 0);
          if (!tech || !kind) continue;
          if (!Number.isFinite(lv) || lv < 0) continue;
          if (!Number.isFinite(pc) || pc < 0 || pc > 100) continue;
          const share = Math.round(lv * (pc / 100));
          lines.push({ technician: tech, kind, laborValue: Math.round(lv), percent: Math.round(pc), share });
        }
        sale.laborCommissions = lines;
        const sumVal = lines.reduce((a, b) => a + (b.laborValue || 0), 0);
        const sumShare = lines.reduce((a, b) => a + (b.share || 0), 0);
        if (!sale.laborValue || sumVal > sale.laborValue) sale.laborValue = sumVal;
        if (!sale.laborShare || sumShare > sale.laborShare) sale.laborShare = sumShare;
        if (!sale.laborPercent && sale.laborValue) {
          sale.laborPercent = Math.round((sale.laborShare / sale.laborValue) * 100);
        }
      }
      if (paymentReceiptUrl) sale.paymentReceiptUrl = paymentReceiptUrl;
      await sale.save({ session });
    });
    
    const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
    await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
    
    // Verificar alertas de stock después del cierre de venta (una sola vez)
    if (affectedItemIds.length > 0) {
      try {
        await checkLowStockForMany(req.companyId, affectedItemIds);
      } catch (e) {
        console.error('Error checking stock alerts after sale close:', e?.message);
      }
    }
    
    let cashflowEntries = [];
    let receivable = null;
    
    // Verificar si algún método de pago es CREDITO
    const hasCredit = sale.paymentMethods?.some(m => 
      String(m.method || '').toUpperCase() === 'CREDITO' || 
      String(m.method || '').toUpperCase() === 'CRÉDITO'
    ) || String(sale.paymentMethod || '').toUpperCase() === 'CREDITO' ||
       String(sale.paymentMethod || '').toUpperCase() === 'CRÉDITO';
    
    if (hasCredit) {
      // Si hay crédito, crear cuenta por cobrar en lugar de flujo de caja
      try {
        const AccountReceivable = (await import('../models/AccountReceivable.js')).default;
        const CompanyAccount = (await import('../models/CompanyAccount.js')).default;
        
        // Calcular monto de crédito
        const creditAmount = sale.paymentMethods?.find(m => 
          String(m.method || '').toUpperCase() === 'CREDITO' || 
          String(m.method || '').toUpperCase() === 'CRÉDITO'
        )?.amount || sale.total;
        
        // Buscar empresa asociada por placa si existe
        let companyAccountId = null;
        if (sale.vehicle?.plate) {
          const companyAccount = await CompanyAccount.findOne({
            companyId: String(req.companyId),
            active: true,
            plates: String(sale.vehicle.plate).trim().toUpperCase()
          });
          if (companyAccount) {
            companyAccountId = companyAccount._id;
          }
        }
        
        receivable = await AccountReceivable.create({
          companyId: String(req.companyId),
          saleId: sale._id,
          saleNumber: String(sale.number || '').padStart(5, '0'),
          customer: sale.customer || {},
          vehicle: sale.vehicle || {},
          companyAccountId,
          totalAmount: Number(creditAmount),
          paidAmount: 0,
          balance: Number(creditAmount),
          status: 'pending',
          source: 'sale'
        });
      } catch(e) { 
        console.warn('createReceivable failed:', e?.message||e); 
      }
    } else {
      // Solo registrar en flujo de caja si NO es crédito
      try {
        const accountId = req.body?.accountId; // opcional desde frontend
        const resEntries = await registerSaleIncome({ companyId: req.companyId, sale, accountId });
        cashflowEntries = Array.isArray(resEntries) ? resEntries : (resEntries ? [resEntries] : []);
      } catch(e) { console.warn('registerSaleIncome failed:', e?.message||e); }
    }
    
    try{ publish(req.companyId, 'sale:closed', { id: (sale?._id)||undefined }) }catch{}
    res.json({ ok: true, sale: sale.toObject(), cashflowEntries, receivable: receivable?.toObject() });
  } catch (err) {
    await session.abortTransaction().catch(()=>{});
    res.status(400).json({ error: err?.message || 'Cannot close sale' });
  } finally {
    session.endSession();
  }
};

// ===== Actualizar cierre de venta (editar métodos de pago, comisiones, comprobante) =====
export const updateCloseSale = async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const sale = await Sale.findOne({ _id: id, companyId: req.companyId }).session(session);
      if (!sale) throw new Error('Sale not found');
      if (sale.status !== 'closed') throw new Error('Only closed sales can be updated');

      // Importar dependencias necesarias
      const CashFlowEntry = (await import('../models/CashFlowEntry.js')).default;
      const AccountReceivable = (await import('../models/AccountReceivable.js')).default;
      const cashflowModule = await import('./cashflow.controller.js');
      const registerSaleIncome = cashflowModule.registerSaleIncome;
      const computeBalance = cashflowModule.computeBalance;
      const ensureDefaultCashAccount = cashflowModule.ensureDefaultCashAccount;
      const Account = (await import('../models/Account.js')).default;

      // Guardar valores antiguos para comparar
      const oldPaymentMethods = sale.paymentMethods || [];
      const oldLaborCommissions = sale.laborCommissions || [];

      // Actualizar paymentMethods si vienen en el body
      if (req.body?.paymentMethods !== undefined) {
        const rawMethods = Array.isArray(req.body.paymentMethods) ? req.body.paymentMethods : [];
        const cleaned = rawMethods
          .map(m => ({
            method: String(m.method || '').trim(),
            amount: Math.round(Number(m.amount) || 0),
            accountId: m.accountId ? new mongoose.Types.ObjectId(m.accountId) : null
          }))
          .filter(m => m.method && m.amount > 0);
        
        // Validar que la suma coincida con el total
        const sum = cleaned.reduce((a, m) => a + m.amount, 0);
        const total = Number(sale.total || 0);
        if (Math.abs(sum - total) > 0.01) {
          throw new Error(`La suma de pagos (${sum}) no coincide con el total de la venta (${total})`);
        }

        sale.paymentMethods = cleaned;
        
        // Actualizar paymentMethod legacy para compatibilidad
        if (cleaned.length === 1) {
          sale.paymentMethod = cleaned[0].method;
        } else if (cleaned.length > 1) {
          sale.paymentMethod = 'MULTIPLE';
        }
      }

      // Actualizar laborCommissions si vienen en el body
      if (req.body?.laborCommissions !== undefined) {
        const rawCommissions = Array.isArray(req.body.laborCommissions) ? req.body.laborCommissions : [];
        sale.laborCommissions = rawCommissions
          .map(c => ({
            technician: String(c.technician || '').trim(),
            kind: String(c.kind || '').trim(),
            laborValue: Math.round(Number(c.laborValue) || 0),
            percent: Number(c.percent) || 0,
            share: Math.round((Number(c.laborValue) || 0) * (Number(c.percent) || 0) / 100)
          }))
          .filter(c => c.technician && (c.laborValue > 0 || c.percent > 0));
      }

      // Actualizar paymentReceiptUrl si viene en el body
      if (req.body?.paymentReceiptUrl !== undefined) {
        sale.paymentReceiptUrl = String(req.body.paymentReceiptUrl || '').trim();
      }

      await sale.save({ session });

      // Si cambiaron los métodos de pago, actualizar flujo de caja
      const paymentMethodsChanged = JSON.stringify(oldPaymentMethods) !== JSON.stringify(sale.paymentMethods);
      
      if (paymentMethodsChanged) {
        // Eliminar entradas de flujo de caja existentes relacionadas con esta venta
        const existingEntries = await CashFlowEntry.find({ 
          companyId: req.companyId, 
          source: 'SALE', 
          sourceRef: sale._id 
        }).session(session);
        
        for (const entry of existingEntries) {
          await CashFlowEntry.deleteOne({ _id: entry._id }).session(session);
          // Recalcular balance de la cuenta
          await computeBalance(entry.accountId, req.companyId);
        }

        // Verificar si hay crédito en los nuevos métodos
        const hasCredit = sale.paymentMethods?.some(m => 
          String(m.method || '').toUpperCase() === 'CREDITO' || 
          String(m.method || '').toUpperCase() === 'CRÉDITO'
        );

        if (hasCredit) {
          // Si hay crédito, verificar/crear cuenta por cobrar
          const creditAmount = sale.paymentMethods?.find(m => 
            String(m.method || '').toUpperCase() === 'CREDITO' || 
            String(m.method || '').toUpperCase() === 'CRÉDITO'
          )?.amount || sale.total;

          // Buscar cuenta por cobrar existente
          let receivable = await AccountReceivable.findOne({ 
            saleId: sale._id, 
            companyId: req.companyId 
          }).session(session);

          if (receivable) {
            // Actualizar monto si cambió
            receivable.totalAmount = Number(creditAmount);
            receivable.balance = receivable.totalAmount - receivable.paidAmount;
            if (receivable.balance <= 0) {
              receivable.status = 'paid';
            } else {
              receivable.status = receivable.paidAmount > 0 ? 'partial' : 'pending';
            }
            await receivable.save({ session });
          } else {
            // Crear nueva cuenta por cobrar
            const CompanyAccount = (await import('../models/CompanyAccount.js')).default;
            let companyAccountId = null;
            if (sale.vehicle?.plate) {
              const companyAccount = await CompanyAccount.findOne({
                companyId: String(req.companyId),
                active: true,
                plates: String(sale.vehicle.plate).trim().toUpperCase()
              }).session(session);
              if (companyAccount) companyAccountId = companyAccount._id;
            }

            receivable = await AccountReceivable.create([{
              companyId: String(req.companyId),
              saleId: sale._id,
              saleNumber: String(sale.number || '').padStart(5, '0'),
              customer: sale.customer || {},
              vehicle: sale.vehicle || {},
              companyAccountId,
              totalAmount: Number(creditAmount),
              paidAmount: 0,
              balance: Number(creditAmount),
              status: 'pending',
              source: 'sale'
            }], { session });
            receivable = receivable[0];
          }
        } else {
          // Si no hay crédito, eliminar cuenta por cobrar si existe
          const receivable = await AccountReceivable.findOne({ 
            saleId: sale._id, 
            companyId: req.companyId 
          }).session(session);
          if (receivable) {
            await AccountReceivable.deleteOne({ _id: receivable._id }).session(session);
          }
        }

        // Crear nuevas entradas de flujo de caja solo para métodos que no sean crédito
        // Nota: registerSaleIncome verifica si ya existen entradas, pero las acabamos de eliminar
        // así que creará nuevas correctamente
        const nonCreditMethods = sale.paymentMethods?.filter(m => {
          const method = String(m.method || '').toUpperCase();
          return method !== 'CREDITO' && method !== 'CRÉDITO';
        }) || [];

        if (nonCreditMethods.length > 0) {
          // Forzar creación ya que eliminamos las entradas anteriores
          await registerSaleIncome({ companyId: req.companyId, sale, accountId: null, forceCreate: true });
        }
      }

      try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
    });

    const updatedSale = await Sale.findOne({ _id: id, companyId: req.companyId });
    res.json(updatedSale.toObject());
  } catch (err) {
    await session.abortTransaction().catch(()=>{});
    res.status(400).json({ error: err?.message || 'Cannot update sale' });
  } finally {
    session.endSession();
  }
};

// ===== Cancelar (X de pestaÃ±a) =====
export const cancelSale = async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status === 'closed') return res.status(400).json({ error: 'Closed sale cannot be cancelled' });
  // PolÃ­tica actual: eliminar; si prefieres histÃ³rico, cambia a status:'cancelled' y setea cancelledAt.
  await Sale.deleteOne({ _id: id, companyId: req.companyId });
  try{ publish(req.companyId, 'sale:cancelled', { id: (sale?._id)||undefined }) }catch{}
  res.json({ ok: true });
};

// ===== Completar slot abierto mediante QR =====
export const completeOpenSlot = async (req, res) => {
  const { id } = req.params; // saleId
  const { slotIndex, itemId, sku } = req.body || {};
  
  if (slotIndex === undefined || slotIndex === null) {
    return res.status(400).json({ error: 'slotIndex requerido' });
  }
  
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'La venta no está abierta' });
  
  if (!sale.openSlots || sale.openSlots.length === 0) {
    return res.status(400).json({ error: 'Esta venta no tiene slots abiertos' });
  }
  
  const slot = sale.openSlots[slotIndex];
  if (!slot) {
    return res.status(404).json({ error: 'Slot abierto no encontrado' });
  }
  
  if (slot.completed) {
    return res.status(400).json({ error: 'Este slot ya está completado' });
  }
  
  // Buscar item por itemId o SKU
  let item = null;
  if (itemId) {
    item = await Item.findOne({ _id: itemId, companyId: req.companyId });
  } else if (sku) {
    item = await Item.findOne({ sku: String(sku).trim().toUpperCase(), companyId: req.companyId });
  }
  
  if (!item) {
    return res.status(404).json({ error: 'Item del inventario no encontrado' });
  }
  
  // Completar el slot
  slot.completed = true;
  slot.completedItemId = item._id;
  
  // Actualizar el precio estimado con el precio real del item
  const realPrice = item.salePrice || slot.estimatedPrice || 0;
  
  // Recalcular totales (los slots abiertos no se agregan a items hasta cerrar la venta)
  computeTotals(sale);
  await sale.save();
  
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
  try{ publish(req.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  
  res.json({ 
    ok: true, 
    sale: sale.toObject(),
    slot: {
      slotIndex,
      slotName: slot.slotName,
      completed: true,
      item: {
        _id: item._id,
        sku: item.sku,
        name: item.name,
        salePrice: item.salePrice
      }
    }
  });
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
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
  res.json(sale.toObject());
};

// ===== Listado y resumen =====

// ===== Perfil de cliente/vehÃ­culo =====
export const getProfileByPlate = async (req, res) => {
  const plate = String(req.params.plate || '').trim().toUpperCase();
  if (!plate) return res.status(400).json({ error: 'plate required' });

  const companyId = String(req.companyId);
  const fuzzy = String(req.query.fuzzy || 'false').toLowerCase() === 'true';
  let query;
  if (fuzzy) {
    // Permite confusiÃ³n entre 0 y O y coincidencia parcial inicial
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
  
  // Buscar y linkear vehículo si no está linkeado y tenemos marca/línea/cilindraje
  if (!primary.vehicle.vehicleId && primary.vehicle.brand && primary.vehicle.line && primary.vehicle.engine) {
    try {
      const Vehicle = (await import('../models/Vehicle.js')).default;
      const vehicle = await Vehicle.findOne({
        make: primary.vehicle.brand,
        line: primary.vehicle.line,
        displacement: primary.vehicle.engine,
        active: true
      });
      if (vehicle) {
        primary.vehicle.vehicleId = vehicle._id;
        mutated = true;
      }
    } catch {}
  }

  if (mutated) {
    try {
      await primary.save();
    } catch {}
  }

  res.json(primary.toObject());
};

// Buscar perfil por nÃºmero de identificaciÃ³n
export const getProfileByIdNumber = async (req, res) => {
  const idNumber = String(req.params.id || '').trim();
  if (!idNumber) return res.status(400).json({ error: 'id required' });
  const companyId = String(req.companyId);
  // BÃºsqueda exacta, mÃ¡s reciente primero
  const matches = await CustomerProfile.find({ companyId, identificationNumber: idNumber }).sort({ updatedAt: -1, createdAt: -1 });
  if (!matches.length) return res.json(null);
  const ordered = orderProfiles(matches);
  const [primary, ...duplicates] = ordered;
  if (duplicates.length) {
    const ids = duplicates.map(d => d._id).filter(Boolean);
    if (ids.length) { try { await CustomerProfile.deleteMany({ companyId, _id: { $in: ids } }); } catch {} }
  }
  res.json(primary?.toObject?.() || null);
};
export const listSales = async (req, res) => {
  const { status, from, to, plate, page = 1, limit = 50 } = req.query || {};
  const q = { companyId: req.companyId };
  if (status) q.status = String(status);
  // Filtrar por placa si se proporciona
  if (plate) {
    const plateUpper = String(plate).trim().toUpperCase();
    q['vehicle.plate'] = plateUpper;
  }
  if (from || to) {
    // Usar closedAt si está disponible, sino createdAt
    // Para ventas cerradas, es más preciso usar closedAt
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : null;
    
    // Construir filtro de fecha usando $expr para manejar closedAt o createdAt
    const dateConditions = [];
    
    if (fromDate && toDate) {
      dateConditions.push({
        $and: [
          { $ne: ['$closedAt', null] },
          { $gte: ['$closedAt', fromDate] },
          { $lte: ['$closedAt', toDate] }
        ]
      });
      dateConditions.push({
        $and: [
          { $or: [{ $eq: ['$closedAt', null] }, { $not: { $ifNull: ['$closedAt', false] } }] },
          { $gte: ['$createdAt', fromDate] },
          { $lte: ['$createdAt', toDate] }
        ]
      });
    } else if (fromDate) {
      dateConditions.push({
        $and: [
          { $ne: ['$closedAt', null] },
          { $gte: ['$closedAt', fromDate] }
        ]
      });
      dateConditions.push({
        $and: [
          { $or: [{ $eq: ['$closedAt', null] }, { $not: { $ifNull: ['$closedAt', false] } }] },
          { $gte: ['$createdAt', fromDate] }
        ]
      });
    } else if (toDate) {
      dateConditions.push({
        $and: [
          { $ne: ['$closedAt', null] },
          { $lte: ['$closedAt', toDate] }
        ]
      });
      dateConditions.push({
        $and: [
          { $or: [{ $eq: ['$closedAt', null] }, { $not: { $ifNull: ['$closedAt', false] } }] },
          { $lte: ['$createdAt', toDate] }
        ]
      });
    }
    
    if (dateConditions.length > 0) {
      q.$expr = { $or: dateConditions };
    }
  }
  const pg = Math.max(1, Number(page || 1));
  const lim = Math.max(1, Math.min(500, Number(limit || 50)));

  const [items, total] = await Promise.all([
    Sale.find(q).sort({ closedAt: -1, createdAt: -1 }).skip((pg - 1) * lim).limit(lim).lean(),
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

// ===== Reporte tÃ©cnico (laborShare) =====
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
          _laborShareLines: { $sum: { $ifNull: ['$laborCommissions.share', []] } },
          _laborShareCalc: {
            $cond: [
              { $gt: [ { $sum: { $ifNull: ['$laborCommissions.share', []] } }, 0 ] },
              { $sum: { $ifNull: ['$laborCommissions.share', []] } },
              { $cond: [
                { $and: [ { $gt: ['$laborValue', 0] }, { $gt: ['$laborPercent', 0] } ] },
                { $round: [ { $multiply: ['$laborValue', { $divide: ['$laborPercent', 100] }] }, 0 ] },
                { $ifNull: ['$laborShare', 0] }
              ] }
            ]
          }
        }
      },
      // Filtrar solo las que tengan participaciÃ³n > 0
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

    // Fallback simple si no se obtuvieron filas pero deberÃ­an existir (debug)
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
    return res.status(500).json({ error: 'Error generando reporte tÃ©cnico' });
  }
};

// GET /api/v1/sales/by-plate/:plate
// Obtener historial completo de ventas por placa con todos los detalles (productos, servicios, etc.)
export const getSalesByPlate = async (req, res) => {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta companyId' });
  
  const plate = String(req.params.plate || '').trim().toUpperCase();
  if (!plate) return res.status(400).json({ error: 'Falta placa' });
  
  const { status, from, to, limit = 1000 } = req.query || {};
  const lim = Math.max(1, Math.min(5000, Number(limit || 1000)));
  
  const query = { 
    companyId, 
    'vehicle.plate': plate 
  };
  
  if (status) {
    query.status = String(status);
  } else {
    // Por defecto, mostrar solo ventas cerradas (historial)
    query.status = 'closed';
  }
  
  // Filtro por fechas
  if (from || to) {
    const dateConditions = [];
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : null;
    
    if (fromDate && toDate) {
      dateConditions.push({
        $and: [
          { $ne: ['$closedAt', null] },
          { $gte: ['$closedAt', fromDate] },
          { $lte: ['$closedAt', toDate] }
        ]
      });
      dateConditions.push({
        $and: [
          { $or: [{ $eq: ['$closedAt', null] }, { $not: { $ifNull: ['$closedAt', false] } }] },
          { $gte: ['$createdAt', fromDate] },
          { $lte: ['$createdAt', toDate] }
        ]
      });
    } else if (fromDate) {
      dateConditions.push({
        $and: [
          { $ne: ['$closedAt', null] },
          { $gte: ['$closedAt', fromDate] }
        ]
      });
      dateConditions.push({
        $and: [
          { $or: [{ $eq: ['$closedAt', null] }, { $not: { $ifNull: ['$closedAt', false] } }] },
          { $gte: ['$createdAt', fromDate] }
        ]
      });
    } else if (toDate) {
      dateConditions.push({
        $and: [
          { $ne: ['$closedAt', null] },
          { $lte: ['$closedAt', toDate] }
        ]
      });
      dateConditions.push({
        $and: [
          { $or: [{ $eq: ['$closedAt', null] }, { $not: { $ifNull: ['$closedAt', false] } }] },
          { $lte: ['$createdAt', toDate] }
        ]
      });
    }
    
    if (dateConditions.length > 0) {
      query.$expr = { $or: dateConditions };
    }
  }
  
  // Obtener todas las ventas con todos los detalles
  const sales = await Sale.find(query)
    .populate('vehicle.vehicleId', 'make line displacement modelYear')
    .sort({ closedAt: -1, createdAt: -1 })
    .limit(lim)
    .lean();
  
  // Calcular estadísticas
  const totalSales = sales.length;
  const totalAmount = sales.reduce((sum, sale) => sum + (sale.total || 0), 0);
  const totalProducts = sales.reduce((sum, sale) => {
    return sum + (sale.items || []).filter(item => item.source === 'inventory').length;
  }, 0);
  const totalServices = sales.reduce((sum, sale) => {
    return sum + (sale.items || []).filter(item => item.source === 'service' || item.source === 'price').length;
  }, 0);
  
  // Agrupar productos y servicios más vendidos
  const productCounts = {};
  const serviceCounts = {};
  
  sales.forEach(sale => {
    (sale.items || []).forEach(item => {
      if (item.source === 'inventory') {
        const key = item.sku || item.name || 'Sin SKU';
        productCounts[key] = (productCounts[key] || 0) + (item.qty || 1);
      } else if (item.source === 'service' || item.source === 'price') {
        const key = item.name || item.sku || 'Sin nombre';
        serviceCounts[key] = (serviceCounts[key] || 0) + (item.qty || 1);
      }
    });
  });
  
  const topProducts = Object.entries(productCounts)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);
  
  const topServices = Object.entries(serviceCounts)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);
  
  res.json({
    plate,
    summary: {
      totalSales,
      totalAmount,
      totalProducts,
      totalServices,
      topProducts,
      topServices
    },
    sales: sales.map(sale => ({
      _id: sale._id,
      number: sale.number,
      name: sale.name,
      status: sale.status,
      createdAt: sale.createdAt,
      closedAt: sale.closedAt,
      customer: sale.customer,
      vehicle: sale.vehicle,
      items: sale.items || [],
      subtotal: sale.subtotal,
      tax: sale.tax,
      total: sale.total,
      laborValue: sale.laborValue,
      notes: sale.notes,
      technician: sale.technician,
      legacyOrId: sale.legacyOrId
    }))
  });
};



