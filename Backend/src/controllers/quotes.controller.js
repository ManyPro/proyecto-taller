// Backend/src/controllers/quotes.controller.js
import Counter from '../models/Counter.js';
import Quote from '../models/Quote.js';
import Vehicle from '../models/Vehicle.js';
import { upsertProfileFromSource } from './profile.helper.js';
import CustomerProfile from '../models/CustomerProfile.js';

/** Normaliza el tipo recibido desde el Frontend:
 *  'PRODUCTO'|'Servicio' -> 'Producto' ; 'SERVICIO'|'Servicio' -> 'Servicio'
 */
const normKind = (k) => {
  const s = String(k || '').trim().toUpperCase();
  if (s === 'SERVICIO') return 'Servicio';
  if (s === 'COMBO') return 'Combo';
  return 'Producto';
};

// Calcula subtotales/total y aplica normalización de items
async function computeItems(itemsInput = [], companyId = null) {
  const items = [];
  let total = 0;
  
  // Si tenemos companyId, podemos verificar tipos de PriceEntry para combos
  const PriceEntry = companyId ? (await import('../models/PriceEntry.js')).default : null;
  const priceEntryCache = new Map();
  
  for (const it of itemsInput) {
    if (!it) continue;
    const qtyRaw = it.qty;
    const qty = qtyRaw === null || qtyRaw === '' || qtyRaw === undefined ? null : Number(qtyRaw);
    const unitPrice = Number(it.unitPrice || 0);
    const multiplier = qty && qty > 0 ? qty : 1;
    const subtotal = multiplier * unitPrice;

    const source = (['inventory','price','manual'].includes(it.source)) ? it.source : 'manual';
    let refId = undefined;
    try { if (it.refId) refId = it.refId; } catch {}
    const sku = typeof it.sku === 'string' ? it.sku : undefined;

    // Determinar el tipo (kind) del item
    let itemKind = normKind(it.kind);
    
    // Si viene con source='price' y refId, verificar si es un combo
    if (source === 'price' && refId && PriceEntry && companyId) {
      let pe = priceEntryCache.get(String(refId));
      if (!pe) {
        try {
          pe = await PriceEntry.findOne({ _id: refId, companyId }).lean();
          if (pe) priceEntryCache.set(String(refId), pe);
        } catch (err) {
          // Continuar si hay error
        }
      }
      if (pe && pe.type === 'combo') {
        itemKind = 'Combo';
      } else if (pe && pe.type === 'service') {
        itemKind = 'Servicio';
      } else if (pe && pe.type === 'product') {
        itemKind = 'Producto';
      }
    } else if (source === 'inventory') {
      // Items de inventario son productos
      itemKind = 'Producto';
    } else if (source === 'price' && !refId) {
      // Servicios manuales
      itemKind = 'Servicio';
    }
    
    // Si el SKU empieza con "CP-", es un producto anidado de combo
    if (sku && String(sku).toUpperCase().startsWith('CP-')) {
      itemKind = 'Combo'; // Marcar como Combo para items anidados
    }

    items.push({
      kind: itemKind,
      description: String(it.description || '').trim(),
      qty,
      unitPrice,
      subtotal,
      source,
      refId,
      sku
    });
    total += subtotal;
  }
  return { items, total };
}

export async function createQuote(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta empresa (companyId)' });

  // Siguiente consecutivo atómico por empresa
  const counter = await Counter.findOneAndUpdate(
    { companyId },
    { $inc: { quoteSeq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const seq = counter.quoteSeq;
  const number = String(seq).padStart(5, '0');

  const { customer = {}, vehicle = {}, validity = '', specialNotes = [], items: itemsInput = [] } = req.body || {};
  const { items, total } = await computeItems(itemsInput, companyId);

  // Si se proporciona vehicleId, obtener datos del vehículo
  let vehicleData = {
    plate:        vehicle.plate        || '',
    vehicleId:    vehicle.vehicleId   || null,
    make:         vehicle.make         || '',
    line:         vehicle.line         || '',
    modelYear:    vehicle.modelYear    || '',
    displacement: vehicle.displacement || ''
  };

  if (vehicle.vehicleId) {
    const vehicleDoc = await Vehicle.findById(vehicle.vehicleId);
    if (vehicleDoc && vehicleDoc.active) {
      vehicleData.vehicleId = vehicleDoc._id;
      vehicleData.make = vehicleDoc.make;
      vehicleData.line = vehicleDoc.line;
      vehicleData.displacement = vehicleDoc.displacement;
      // Validar año si se proporciona
      if (vehicle.modelYear) {
        const yearNum = Number(vehicle.modelYear);
        if (!vehicleDoc.isYearInRange(yearNum)) {
          const range = vehicleDoc.getYearRange();
          return res.status(400).json({ 
            error: 'Año fuera de rango',
            message: `El año ${yearNum} está fuera del rango permitido para este vehículo${range ? ` (${range.start}-${range.end})` : ''}`
          });
        }
        vehicleData.modelYear = String(yearNum);
      }
    } else {
      return res.status(404).json({ error: 'Vehículo no encontrado o inactivo' });
    }
  }

  const doc = await Quote.create({
    companyId,
    createdBy: req.userId || req.user?.id || undefined,
    seq, number,
    customer: {
      name:  customer.name  || '',
      phone: customer.phone || '',
      email: customer.email || ''
    },
    vehicle: vehicleData,
    validity,
    specialNotes: Array.isArray(specialNotes) ? specialNotes : [],
    items,
    total
  });

  try { await upsertProfileFromSource(companyId, { customer, vehicle: {
    plate: vehicle.plate,
    brand: vehicle.make,
    line: vehicle.line,
    engine: vehicle.displacement,
    year: vehicle.modelYear ? Number(vehicle.modelYear) || null : null,
    mileage: null
  }}, { source: 'quote' }); } catch {}

  res.status(201).json(doc);
}

// NUEVA VERSION listQuotes CON PAGINACIÓN, METADATA Y VALIDACIONES + ALIAS COMPATIBILIDAD
export async function listQuotes(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) {
    return res.status(401).json({ error: 'Falta contexto de empresa (companyId)' });
  }

  const {
    q: text,
    plate,
    from,
    to,
    page = '1',
    pageSize = '25',
    sort = '-createdAt'
  } = req.query || {};

  const pageNum  = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
  const skipNum  = (pageNum - 1) * limitNum;

  const q = { companyId };

  if (text) {
    const normalizedText = text.trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (normalizedText) {
      const words = normalizedText.split(' ').filter(w => w.length > 0);
      if (words.length > 0) {
        const regexPattern = words.map(word => `(?=.*${word})`).join('');
        const rx = new RegExp(regexPattern, 'i');
        q.$or = [{ 'customer.name': rx }, { 'vehicle.plate': rx }];
      }
    }
  }
  if (plate) {
    const normalizedPlate = plate.trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (normalizedPlate) {
      const words = normalizedPlate.split(' ').filter(w => w.length > 0);
      if (words.length > 0) {
        const regexPattern = words.map(word => `(?=.*${word})`).join('');
        q['vehicle.plate'] = new RegExp(regexPattern, 'i');
      }
    }
  }

  if (from || to) {
    q.createdAt = {};
    if (from) {
      const dFrom = new Date(`${from}T00:00:00.000Z`);
      if (!isNaN(dFrom.getTime())) q.createdAt.$gte = dFrom;
    }
    if (to) {
      const dTo = new Date(`${to}T23:59:59.999Z`);
      if (!isNaN(dTo.getTime())) q.createdAt.$lte = dTo;
    }
    if (Object.keys(q.createdAt).length === 0) delete q.createdAt;
  }

  // Sort: admite "campo" o "-campo" separados por coma
  let sortObj = { createdAt: -1 };
  if (typeof sort === 'string' && sort.trim()) {
    const parts = sort.split(',').map(s => s.trim()).filter(Boolean);
    const tmp = {};
    for (const p of parts) {
      if (p.startsWith('-')) tmp[p.substring(1)] = -1; else tmp[p] = 1;
    }
    if (Object.keys(tmp).length) sortObj = tmp;
  }

  const [items, total] = await Promise.all([
    Quote.find(q).sort(sortObj).skip(skipNum).limit(limitNum),
    Quote.countDocuments(q)
  ]);

  const pages = Math.ceil(total / limitNum) || 1;

  // Mapeo de compatibilidad: id y client (alias de customer)
  const mapped = items.map(doc => {
    const o = doc.toObject({ virtuals: false });
    o.id = o._id;
    o.client = o.customer;
    return o;
  });

  return res.json({
    metadata: {
      total,
      page: pageNum,
      pageSize: limitNum,
      pages,
      hasNext: pageNum < pages,
      hasPrev: pageNum > 1,
      sort: sortObj
    },
    items: mapped
  });
}

export async function getQuote(req, res) {
  const companyId = req.companyId || req.company?.id;
  const doc = await Quote.findOne({ _id: req.params.id, companyId });
  if (!doc) return res.status(404).json({ error: 'No encontrada' });
  res.json(doc);
}

export async function updateQuote(req, res) {
  const companyId = req.companyId || req.company?.id;
  const exists = await Quote.findOne({ _id: req.params.id, companyId });
  if (!exists) return res.status(404).json({ error: 'No encontrada' });

  const { customer = {}, vehicle = {}, validity = '', specialNotes = [], items: itemsInput = [], discount = null } = req.body || {};
  const { items, total } = await computeItems(itemsInput, companyId);

  exists.customer = {
    name:  customer.name  ?? exists.customer.name,
    phone: customer.phone ?? exists.customer.phone,
    email: customer.email ?? exists.customer.email,
    idNumber: customer.idNumber ?? exists.customer.idNumber
  };
  // Si se proporciona vehicleId, obtener datos del vehículo
  let vehicleData = {
    plate:        vehicle.plate        ?? exists.vehicle.plate,
    vehicleId:    vehicle.vehicleId   ?? exists.vehicle.vehicleId,
    make:         vehicle.make         ?? exists.vehicle.make,
    line:         vehicle.line         ?? exists.vehicle.line,
    modelYear:    vehicle.modelYear    ?? exists.vehicle.modelYear,
    displacement: vehicle.displacement ?? exists.vehicle.displacement,
    mileage:      vehicle.mileage      ?? exists.vehicle.mileage
  };

  if (vehicle.vehicleId !== undefined && vehicle.vehicleId !== null) {
    const vehicleDoc = await Vehicle.findById(vehicle.vehicleId);
    if (vehicleDoc && vehicleDoc.active) {
      vehicleData.vehicleId = vehicleDoc._id;
      vehicleData.make = vehicleDoc.make;
      vehicleData.line = vehicleDoc.line;
      vehicleData.displacement = vehicleDoc.displacement;
      // Validar año si se proporciona
      if (vehicle.modelYear) {
        const yearNum = Number(vehicle.modelYear);
        if (!vehicleDoc.isYearInRange(yearNum)) {
          const range = vehicleDoc.getYearRange();
          return res.status(400).json({ 
            error: 'Año fuera de rango',
            message: `El año ${yearNum} está fuera del rango permitido para este vehículo${range ? ` (${range.start}-${range.end})` : ''}`
          });
        }
        vehicleData.modelYear = String(yearNum);
      }
    } else {
      return res.status(404).json({ error: 'Vehículo no encontrado o inactivo' });
    }
  }

  exists.vehicle = vehicleData;
  exists.validity = validity ?? exists.validity;
  exists.specialNotes = Array.isArray(specialNotes) ? specialNotes : (exists.specialNotes || []);
  
  // Actualizar descuento si se proporciona
  if (discount !== undefined) {
    if (discount === null || (discount.value === 0)) {
      exists.discount = null;
    } else {
      exists.discount = {
        type: discount.type || 'fixed',
        value: Number(discount.value) || 0,
        amount: Number(discount.amount) || 0
      };
    }
  }
  exists.items = items;
  exists.total = total;

  await exists.save();
  try { await upsertProfileFromSource(companyId, { customer, vehicle: {
    plate: vehicle.plate,
    brand: vehicle.make,
    line: vehicle.line,
    engine: vehicle.displacement,
    year: vehicle.modelYear ? Number(vehicle.modelYear) || null : null,
    mileage: null
  }}, { source: 'quote' }); } catch {}
  res.json(exists);
}

export async function deleteQuote(req, res) {
  const companyId = req.companyId || req.company?.id;
  const r = await Quote.deleteOne({ _id: req.params.id, companyId });
  if (!r.deletedCount) return res.status(404).json({ error: 'No encontrada' });
  res.json({ ok: true });
}

// Lookup por placa para autocompletar en formulario de cotización
export async function lookupQuotePlate(req, res) {
  const companyId = req.companyId || req.company?.id;
  const plate = String(req.params.plate || '').trim().toUpperCase();
  if (!companyId) return res.status(400).json({ error: 'Falta empresa' });
  if (!plate) return res.status(400).json({ error: 'Falta placa' });
  const fuzzy = String(req.query.fuzzy || 'false').toLowerCase() === 'true';
  let query;
  if (fuzzy) {
    const pattern = '^' + plate.replace(/[0O]/g, '[0O]');
    const rx = new RegExp(pattern, 'i');
    query = { companyId, $or: [{ plate: rx }, { 'vehicle.plate': rx }] };
  } else {
    query = { companyId, $or: [{ plate }, { 'vehicle.plate': plate }] };
  }
  const matches = await CustomerProfile.find(query).sort({ updatedAt: -1, createdAt: -1 }).limit(3);
  if (!matches.length) return res.json(null);
  // Tomar el primero (ya deduplicado usualmente por sales controller) y mapear a formato esperado por UI de cotización
  const doc = matches[0].toObject();
  return res.json({
    customer: {
      name: doc.customer?.name || '',
      phone: doc.customer?.phone || '',
      email: doc.customer?.email || ''
    },
    vehicle: {
      plate: doc.vehicle?.plate || plate,
      make: doc.vehicle?.brand || '',
      line: doc.vehicle?.line || '',
      modelYear: doc.vehicle?.year ? String(doc.vehicle.year) : '',
      displacement: doc.vehicle?.engine || ''
    }
  });
}

// Lookup profile by plate (existing) lives in routes via lookupQuotePlate.
// Add an explicit handler to lookup by identification number for autocomplete.
export async function lookupQuoteId(req, res) {
  const companyId = req.companyId || req.company?.id;
  const idNumber = String(req.params.id || '').trim();
  if (!companyId) return res.status(401).json({ error: 'Falta empresa (companyId)' });
  if (!idNumber) return res.status(400).json({ error: 'Falta id' });
  const matches = await CustomerProfile.find({ companyId, identificationNumber: idNumber }).sort({ updatedAt: -1, createdAt: -1 });
  if (!matches.length) return res.json(null);
  const primary = matches[0];
  res.json(primary.toObject());
}