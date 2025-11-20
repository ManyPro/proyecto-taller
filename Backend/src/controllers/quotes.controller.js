// Backend/src/controllers/quotes.controller.js
import Counter from '../models/Counter.js';
import Quote from '../models/Quote.js';
import Vehicle from '../models/Vehicle.js';
import { upsertProfileFromSource } from './profile.helper.js';
import CustomerProfile from '../models/CustomerProfile.js';
import { createDateRange } from '../lib/dateTime.js';

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
    // PRIORIDAD: Si el frontend envía kind, respetarlo (después de normalizarlo)
    // Solo si no viene kind, intentar detectarlo automáticamente
    let itemKind = null;
    
    // Si viene kind del frontend, usarlo (normalizado)
    if (it.kind) {
      itemKind = normKind(it.kind);
      // Log para debugging
      if (process.env.NODE_ENV !== 'production') {
        console.log('[computeItems] Item con kind del frontend:', {
          originalKind: it.kind,
          normalizedKind: itemKind,
          description: it.description?.substring(0, 50) || '',
          source: source,
          refId: refId ? String(refId).substring(0, 10) : null
        });
      }
    }
    
    // Si no viene kind, intentar detectarlo automáticamente
    if (!itemKind) {
      // Si viene con source='price' y refId, verificar si es un combo
      if (source === 'price' && refId && PriceEntry && companyId) {
        let pe = priceEntryCache.get(String(refId));
        if (!pe) {
          try {
            pe = await PriceEntry.findOne({ _id: refId, companyId })
              .populate('vehicleId', 'make line displacement modelYear')
              .populate('itemId', 'sku name stock salePrice')
              .populate('comboProducts.itemId', 'sku name stock salePrice')
              .lean();
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
        } else {
          // Si es price pero no se encontró o no tiene tipo claro, asumir servicio
          itemKind = 'Servicio';
        }
      } else if (source === 'inventory') {
        // Items de inventario son productos
        itemKind = 'Producto';
      } else if (source === 'price' && !refId) {
        // Servicios manuales
        itemKind = 'Servicio';
      } else {
        // Fallback: Producto por defecto
        itemKind = 'Producto';
      }
    }
    
    // Si el SKU empieza con "CP-", es un producto anidado de combo
    // PERO solo sobrescribir si no se especificó kind explícitamente
    if (!it.kind && sku && String(sku).toUpperCase().startsWith('CP-')) {
      itemKind = 'Combo'; // Marcar como Combo para items anidados
    }

    // Si es un combo (source='price' con refId y tipo='combo'), expandirlo automáticamente
    // PERO solo si el frontend no ya expandió los items (verificar si hay items con comboParent que apunten a este refId)
    if (source === 'price' && refId && itemKind === 'Combo' && PriceEntry && companyId) {
      // Verificar si ya hay items expandidos para este combo en el input
      const alreadyExpanded = itemsInput.some(otherIt => {
        const otherComboParent = otherIt.comboParent || otherIt.combo_parent;
        return otherComboParent && String(otherComboParent).trim() === String(refId).trim();
      });
      
      // Solo expandir si no está ya expandido
      if (!alreadyExpanded) {
        let pe = priceEntryCache.get(String(refId));
        if (!pe) {
          try {
            pe = await PriceEntry.findOne({ _id: refId, companyId })
              .populate('vehicleId', 'make line displacement modelYear')
              .populate('itemId', 'sku name stock salePrice')
              .populate('comboProducts.itemId', 'sku name stock salePrice')
              .lean();
            if (pe) priceEntryCache.set(String(refId), pe);
          } catch (err) {
            // Continuar si hay error
          }
        }
        
        // Si se encontró el PriceEntry y es un combo con productos, expandirlo
        if (pe && pe.type === 'combo' && pe.comboProducts && Array.isArray(pe.comboProducts) && pe.comboProducts.length > 0) {
          // Agregar el combo principal
          items.push({
            kind: 'Combo',
            description: String(it.description || pe.name || '').trim(),
            qty,
            unitPrice,
            subtotal,
            source: 'price',
            refId,
            sku,
            comboParent: undefined // El combo principal no tiene comboParent
          });
          total += subtotal;
          
          // Agregar cada producto del combo como item anidado
          pe.comboProducts.forEach(cp => {
            const comboItemQty = (cp.qty || 1) * multiplier; // Multiplicar por la cantidad del combo
            const comboItemUnitPrice = cp.unitPrice || 0;
            const comboItemSubtotal = comboItemQty * comboItemUnitPrice;
            
            // Determinar source y refId del item anidado
            let comboItemSource = 'price';
            let comboItemRefId = undefined;
            let comboItemSku = undefined;
            
            if (cp.itemId) {
              // Si tiene itemId, es un item del inventario
              comboItemSource = 'inventory';
              comboItemRefId = typeof cp.itemId === 'object' && cp.itemId._id ? cp.itemId._id : cp.itemId;
              if (typeof cp.itemId === 'object' && cp.itemId.sku) {
                comboItemSku = cp.itemId.sku;
              }
            }
            
            items.push({
              kind: 'Combo', // Items anidados también son tipo Combo
              description: String(cp.name || '').trim(),
              qty: comboItemQty,
              unitPrice: comboItemUnitPrice,
              subtotal: comboItemSubtotal,
              source: comboItemSource,
              refId: comboItemRefId,
              sku: comboItemSku,
              // Establecer comboParent como el refId del combo principal
              comboParent: refId
            });
            total += comboItemSubtotal;
          });
          
          // Continuar con el siguiente item (ya procesamos este combo)
          continue;
        }
      }
    }

    items.push({
      kind: itemKind,
      description: String(it.description || '').trim(),
      qty,
      unitPrice,
      subtotal,
      source,
      refId,
      sku,
      // Guardar comboParent si existe para identificar items anidados de combos
      comboParent: it.comboParent || it.combo_parent || undefined
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

  // Actualizar perfil del cliente con overwrite para que los cambios manuales reemplacen los datos existentes
  try { 
    await upsertProfileFromSource(companyId, { customer, vehicle: {
      plate: vehicle.plate,
      brand: vehicle.make,
      line: vehicle.line,
      engine: vehicle.displacement,
      year: vehicle.modelYear ? Number(vehicle.modelYear) || null : null,
      mileage: null
    }}, { 
      source: 'quote',
      overwriteCustomer: true,  // Sobrescribir datos del cliente si se editaron manualmente
      overwriteVehicle: true,   // Sobrescribir datos del vehículo si se editaron manualmente
      overwriteYear: true,      // Sobrescribir año si se editó
      overwriteMileage: true     // Sobrescribir kilometraje si se editó
    }); 
  } catch {}

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
    const dateRange = createDateRange(from, to);
    q.createdAt = {};
    if (dateRange.from) {
      q.createdAt.$gte = dateRange.from;
    }
    if (dateRange.to) {
      q.createdAt.$lte = dateRange.to;
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
  // Actualizar perfil del cliente con overwrite para que los cambios manuales reemplacen los datos existentes
  try { 
    await upsertProfileFromSource(companyId, { customer, vehicle: {
      plate: vehicle.plate,
      brand: vehicle.make,
      line: vehicle.line,
      engine: vehicle.displacement,
      year: vehicle.modelYear ? Number(vehicle.modelYear) || null : null,
      mileage: vehicle.mileage ?? null
    }}, { 
      source: 'quote',
      overwriteCustomer: true,  // Sobrescribir datos del cliente si se editaron manualmente
      overwriteVehicle: true,   // Sobrescribir datos del vehículo si se editaron manualmente
      overwriteYear: true,      // Sobrescribir año si se editó
      overwriteMileage: true    // Sobrescribir kilometraje si se editó
    }); 
  } catch {}
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