import mongoose from 'mongoose';
import { checkLowStockForMany } from '../lib/stockAlerts.js';
import { registerSaleIncome } from './cashflow.controller.js';
import Sale from '../models/Sale.js';
import Item from '../models/Item.js';
import PriceEntry from '../models/PriceEntry.js';
import Counter from '../models/Counter.js';
import StockMove from '../models/StockMove.js';
import StockEntry from '../models/StockEntry.js';
import CustomerProfile from '../models/CustomerProfile.js';
import { upsertProfileFromSource } from './profile.helper.js';
import { publish } from '../lib/live.js';
import { createDateRange } from '../lib/dateTime.js';
import { logger } from '../lib/logger.js';
import { getAllSharedCompanyIds as getAllSharedCompanyIdsHelper } from '../lib/sharedDatabase.js';

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

async function upsertCustomerProfile(companyId, sale, options) { await upsertProfileFromSource(companyId, sale, options || {}); }

async function getNextSaleNumber(companyId) {
  const c = await Counter.findOneAndUpdate(
    { companyId },
    { $inc: { saleSeq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return c.saleSeq;
}

// Función auxiliar para obtener el companyId correcto para CREAR ventas
// Las ventas SIEMPRE se crean con el originalCompanyId (empresa logueada),
// independientemente de si hay base de datos compartida
function getSaleCreationCompanyId(req) {
  // Siempre usar originalCompanyId para crear ventas
  // Esto asegura que la venta pertenece a la empresa que la crea
  // Si originalCompanyId no está definido (edge case), usar companyId como fallback
  return req.originalCompanyId || req.companyId || req.company?.id;
}

// Función auxiliar para obtener el filtro de companyId para BUSCAR ventas
// Cuando hay base de datos compartida, busca en ambos companyId,
// pero valida que la venta pertenezca al originalCompanyId del usuario
function getSaleQueryCompanyFilter(req) {
  // Obtener IDs: originalCompanyId siempre debería estar definido por el middleware
  // pero usamos fallbacks por seguridad
  const originalCompanyId = req.originalCompanyId || req.company?.id;
  const effectiveCompanyId = req.companyId;
  
  // Si no hay effectiveCompanyId, usar originalCompanyId (edge case)
  if (!effectiveCompanyId) {
    return originalCompanyId || req.company?.id;
  }
  
  // Si no hay originalCompanyId, usar effectiveCompanyId (caso normal sin base compartida)
  if (!originalCompanyId) {
    return effectiveCompanyId;
  }
  
  // Si hay base de datos compartida (originalCompanyId !== effectiveCompanyId),
  // buscar en ambos, pero priorizar originalCompanyId
  if (String(originalCompanyId) !== String(effectiveCompanyId)) {
    return { $in: [originalCompanyId, effectiveCompanyId].filter(Boolean) };
  }
  
  // Si no hay base de datos compartida (son iguales), usar cualquiera de los dos
  return originalCompanyId;
}

// Función auxiliar para validar que una venta pertenece al originalCompanyId del usuario
// Esto es importante para seguridad: aunque busquemos en ambos companyId,
// solo permitimos operaciones en ventas que pertenecen al originalCompanyId
function validateSaleOwnership(sale, req) {
  if (!sale) return false;
  
  // Obtener originalCompanyId (empresa logueada)
  const originalCompanyId = req.originalCompanyId || req.company?.id;
  if (!originalCompanyId) {
    // Si no hay originalCompanyId, usar companyId como fallback
    const fallbackId = req.companyId || req.company?.id;
    if (!fallbackId) return false;
    return String(sale.companyId || '') === String(fallbackId);
  }
  
  const saleCompanyId = String(sale.companyId || '');
  const userCompanyId = String(originalCompanyId);
  
  // La venta debe pertenecer al originalCompanyId del usuario
  return saleCompanyId === userCompanyId;
}

// Función auxiliar para obtener TODOS los companyIds que comparten la BD
// Usa la función helper compartida
async function getAllSharedCompanyIds(req) {
  const originalCompanyId = req.originalCompanyId || req.companyId || req.company?.id;
  return await getAllSharedCompanyIdsHelper(originalCompanyId);
}

// Función auxiliar para obtener el filtro de companyId para BUSCAR precios
// Siempre busca en el originalCompanyId primero, y si hay base compartida, también en effectiveCompanyId
function getPriceQueryCompanyFilter(req) {
  // Obtener IDs: originalCompanyId siempre debería estar definido por el middleware
  const originalCompanyId = req.originalCompanyId || req.company?.id;
  const effectiveCompanyId = req.companyId;
  
  // Si no hay originalCompanyId, usar effectiveCompanyId o req.company?.id como fallback
  if (!originalCompanyId) {
    return effectiveCompanyId || req.company?.id;
  }
  
  // Si no hay effectiveCompanyId, usar solo originalCompanyId
  if (!effectiveCompanyId) {
    return originalCompanyId;
  }
  
  // Normalizar a strings para comparación
  const origId = String(originalCompanyId);
  const effId = String(effectiveCompanyId);
  
  // Si son iguales, usar solo uno
  if (origId === effId) {
    return originalCompanyId;
  }
  
  // Si son diferentes (hay base compartida), buscar en ambos
  // IMPORTANTE: Siempre incluir originalCompanyId primero para priorizar la empresa logueada
  return { $in: [originalCompanyId, effectiveCompanyId].filter(Boolean) };
}

// Función auxiliar para obtener el filtro de companyId para BUSCAR items de inventario
// Si hay base de datos compartida, busca en ambos companyId (se comparte TODA la data)
async function getItemQueryCompanyFilter(req) {
  const originalCompanyId = req.originalCompanyId || req.company?.id;
  const effectiveCompanyId = req.companyId;
  
  // Si no hay originalCompanyId, usar effectiveCompanyId o req.company?.id como fallback
  if (!originalCompanyId) {
    return effectiveCompanyId || req.company?.id;
  }
  
  // Si no hay effectiveCompanyId, usar solo originalCompanyId
  if (!effectiveCompanyId) {
    return originalCompanyId;
  }
  
  // Normalizar a strings para comparación
  const origId = String(originalCompanyId);
  const effId = String(effectiveCompanyId);
  
  // Si son iguales, usar solo uno (no hay base compartida)
  if (origId === effId) {
    return originalCompanyId;
  }
  
  // Si son diferentes, hay base compartida - buscar en ambos companyId
  // Cuando se comparte BD, se comparte TODA la data (inventario, clientes, ventas, etc.)
  return { $in: [originalCompanyId, effectiveCompanyId].filter(Boolean) };
}

// ===== CRUD base =====
export const startSale = async (req, res) => {
  // CRÍTICO: Las ventas SIEMPRE se crean con el originalCompanyId (empresa logueada),
  // no con el effectiveCompanyId (empresa compartida). Esto asegura que la venta
  // pertenece a la empresa que la crea, aunque comparta la base de datos con otra.
  const creationCompanyId = getSaleCreationCompanyId(req);
  
  if (!creationCompanyId) {
    return res.status(400).json({ error: 'Company ID missing' });
  }
  
  // Usa 'draft' para respetar el enum del modelo
  // Asignar número de remisión al crear la venta (no al cerrarla)
  const saleNumber = await getNextSaleNumber(creationCompanyId);
  const sale = await Sale.create({ companyId: creationCompanyId, status: 'draft', items: [], number: saleNumber });
  
  logger.info('[startSale] Venta creada', {
    saleId: sale._id?.toString(),
    companyId: sale.companyId?.toString(),
    originalCompanyId: req.originalCompanyId?.toString(),
    effectiveCompanyId: req.companyId?.toString(),
    saleNumber: sale.number
  });
  
  try{ await publish(creationCompanyId, 'sale:started', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

export const getSale = async (req, res) => {
  // Buscar venta considerando base de datos compartida
  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: req.params.id, companyId: companyFilter });
  
  if (!sale) {
    return res.status(404).json({ error: 'Sale not found' });
  }
  
  // Validar que la venta pertenece al originalCompanyId del usuario
  if (!validateSaleOwnership(sale, req)) {
    return res.status(403).json({ error: 'Sale belongs to different company' });
  }
  
  const saleObj = sale.toObject();
  
  // Enriquecer items con información de StockEntry si están linkeados
  const Account = (await import('../models/Account.js')).default;
  const VehicleIntake = (await import('../models/VehicleIntake.js')).default;
  
  // Obtener información de cuentas para los pagos
  const accountIds = (saleObj.paymentMethods || [])
    .map(p => p.accountId)
    .filter(Boolean);
  const accounts = accountIds.length > 0 
    ? await Account.find({ _id: { $in: accountIds }, companyId: req.companyId }).lean()
    : [];
  const accountMap = {};
  accounts.forEach(acc => {
    accountMap[String(acc._id)] = acc.name;
  });
  
  // Enriquecer paymentMethods con nombres de cuenta
  if (saleObj.paymentMethods && Array.isArray(saleObj.paymentMethods)) {
    saleObj.paymentMethods = saleObj.paymentMethods.map(p => ({
      ...p,
      accountName: p.accountId ? accountMap[String(p.accountId)] : null,
      accountId: p.accountId ? String(p.accountId) : null
    }));
  }
  
  // Enriquecer items con información de compra (StockEntry) si tienen meta.entryId
  const enrichedItems = await Promise.all((saleObj.items || []).map(async (item) => {
    if (item.source === 'inventory' && item.meta?.entryId) {
      try {
        const stockEntry = await StockEntry.findOne({ 
          _id: item.meta.entryId, 
          companyId: req.companyId 
        }).populate('vehicleIntakeId', 'intakeKind intakeDate purchasePlace brand model engine').lean();
        
        if (stockEntry && stockEntry.vehicleIntakeId) {
          const intake = stockEntry.vehicleIntakeId;
          return {
            ...item,
            purchaseInfo: {
              stockEntryId: String(stockEntry._id),
              entryDate: stockEntry.entryDate,
              entryPrice: stockEntry.entryPrice,
              intakeKind: intake.intakeKind,
              intakeDate: intake.intakeDate,
              purchasePlace: intake.purchasePlace || '',
              vehicleInfo: intake.brand && intake.model ? `${intake.brand} ${intake.model}` : '',
              meta: stockEntry.meta || {}
            }
          };
        }
      } catch (err) {
        logger.warn('Error fetching StockEntry for item', { error: err?.message, stack: err?.stack });
      }
    }
    return item;
  }));
  
  saleObj.items = enrichedItems;
  res.json(saleObj);
};

export const addItem = async (req, res) => {
  const { id } = req.params;
  const { source, refId, sku, qty = 1, unitPrice } = req.body || {};

  // Log para debugging (siempre, no solo en desarrollo)
  const originalCompanyId = req.originalCompanyId || req.company?.id;
  const effectiveCompanyId = req.companyId;
  
  logger.info('[addItem] Iniciando addItem', { 
    saleId: id, 
    originalCompanyId: originalCompanyId?.toString(),
    effectiveCompanyId: effectiveCompanyId?.toString(),
    companyIdType: typeof req.companyId,
    companyIdFromReq: req.company?.id,
    userId: req.userId,
    hasSharedDb: originalCompanyId && effectiveCompanyId && String(originalCompanyId) !== String(effectiveCompanyId),
    body: { source, refId, sku, qty, unitPrice }
  });

  // Validar que tenemos companyId
  if (!effectiveCompanyId) {
    logger.error('[addItem] No hay companyId en request', { 
      saleId: id,
      hasCompany: !!req.company,
      companyId: req.company?.id,
      originalCompanyId: originalCompanyId?.toString(),
      effectiveCompanyId: effectiveCompanyId?.toString()
    });
    return res.status(400).json({ error: 'Company ID missing' });
  }

  // Buscar venta considerando base de datos compartida
  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: id, companyId: companyFilter });
  
  if (!sale) {
    logger.error('[addItem] Venta no encontrada', { 
      saleId: id, 
      originalCompanyId: originalCompanyId?.toString(),
      effectiveCompanyId: effectiveCompanyId?.toString(),
      companyFilter: companyFilter,
      isValidObjectId: /^[0-9a-fA-F]{24}$/.test(id)
    });
    return res.status(404).json({ error: 'Sale not found' });
  }
  
  // CRÍTICO: Validar que la venta pertenece al originalCompanyId del usuario
  // Aunque busquemos en ambos companyId, solo permitimos operaciones en ventas
  // que pertenecen al originalCompanyId (empresa logueada)
  if (!validateSaleOwnership(sale, req)) {
    logger.error('[addItem] Venta encontrada pero companyId no coincide', {
      saleId: id,
      expectedCompanyId: originalCompanyId?.toString(),
      actualCompanyId: sale.companyId?.toString(),
      saleStatus: sale.status,
      saleNumber: sale.number
    });
    return res.status(403).json({ error: 'Sale belongs to different company' });
  }
  
  if (sale.status !== 'draft') {
    return res.status(400).json({ error: `Sale not open (draft). Current status: ${sale.status}` });
  }

  let itemData = null;

  // El schema admite 'inventory', 'price', 'service'. Unificamos 'service' como 'price' para coherencia.
  const src = (source === 'service') ? 'price' : source;

  if (src === 'inventory') {
    // CRÍTICO: Buscar items en ambos companyId si hay base compartida (se comparte TODA la data)
    const itemCompanyFilter = await getItemQueryCompanyFilter(req);
    let it = null;
    if (refId) it = await Item.findOne({ _id: refId, companyId: itemCompanyFilter });
    if (!it && sku) it = await Item.findOne({ sku: String(sku).trim().toUpperCase(), companyId: itemCompanyFilter });
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
      // CRÍTICO: Usar la misma lógica que getPrice para buscar precios en todas las empresas compartidas
      // Esto asegura consistencia entre addItem y getPrice
      
      // Obtener TODOS los companyIds que comparten la BD (igual que getPrice)
      const companyIdsToSearch = await getAllSharedCompanyIdsHelper(originalCompanyId);
      
      // Construir query con companyIds
      // CRÍTICO: Siempre usar $in para asegurar que funcione correctamente con ObjectIds
      // Convertir todos los IDs a ObjectIds de mongoose para la búsqueda
      const companyIdsAsObjectIds = companyIdsToSearch.map(id => {
        try {
          if (id instanceof mongoose.Types.ObjectId) return id;
          return new mongoose.Types.ObjectId(id);
        } catch (err) {
          logger.warn('[addItem] Error convirtiendo companyId a ObjectId', { id, error: err?.message });
          return null;
        }
      }).filter(Boolean);
      
      if (companyIdsAsObjectIds.length === 0) {
        logger.error('[addItem] No hay companyIds válidos después de conversión', {
          refId: refId,
          companyIdsToSearch: companyIdsToSearch.map(String)
        });
        return res.status(404).json({ error: 'PriceEntry not found' });
      }
      
      // Siempre usar $in para consistencia
      const companyFilter = { $in: companyIdsAsObjectIds };
      
      // Buscar el precio en todas las empresas compartidas
      let pe = await PriceEntry.findOne({ _id: refId, companyId: companyFilter })
        .populate('vehicleId', 'make line displacement modelYear')
        .populate('itemId', 'sku name stock salePrice')
        .populate('comboProducts.itemId', 'sku name stock salePrice')
        .lean();
      
      // Si no se encontró, verificar si existe en alguna empresa (para debugging)
      if (!pe) {
        const priceAnyCompany = await PriceEntry.findOne({ _id: refId }).lean();
        if (priceAnyCompany) {
          const priceCompanyId = priceAnyCompany.companyId?.toString();
          const origId = originalCompanyId?.toString();
          
          // El precio existe pero no está en las empresas compartidas
          logger.error('[addItem] Precio encontrado pero no está en empresas compartidas', {
            priceId: refId,
            priceCompanyId: priceCompanyId,
            originalCompanyId: origId,
            companyIdsToSearch: companyIdsToSearch.map(String),
            message: 'El precio existe pero no está accesible. Verificar configuración de sharedDatabaseConfig.'
          });
          
          return res.status(403).json({ 
            error: 'PriceEntry belongs to different company',
            message: 'El precio existe pero no está accesible desde la empresa actual. Verificar configuración de sharedDatabaseConfig.'
          });
        } else {
          // El precio realmente no existe
          return res.status(404).json({ error: 'PriceEntry not found' });
        }
      }
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
            // CRÍTICO: Usar SKU que empiece con "CP-" para que se identifique como parte del combo
            const comboItem = cp.itemId;
            const itemSku = comboItem.sku || '';
            // Asegurar que el SKU empiece con "CP-" para identificación correcta
            const comboItemSku = itemSku && !itemSku.toUpperCase().startsWith('CP-') 
              ? `CP-${itemSku}` 
              : (itemSku || `CP-${String(comboItem._id).slice(-6)}`);
            sale.items.push({
              source: 'inventory',
              refId: comboItem._id,
              sku: comboItemSku,
              name: cp.name || 'Producto del combo',
              qty: comboQty,
              unitPrice: cp.unitPrice || 0,
              total: Math.round(comboQty * (cp.unitPrice || 0))
            });
          } else {
            // Producto sin vincular: agregar como price con SKU que empiece con CP-
            // IMPORTANTE: Usar un identificador único basado en el índice del producto en el combo
            // para asegurar que el SKU siempre empiece con CP- y sea único
            const comboProductId = cp._id ? String(cp._id).slice(-6) : String(idx).padStart(6, '0');
            sale.items.push({
              source: 'price',
              refId: new mongoose.Types.ObjectId(),
              sku: `CP-${comboProductId}`,
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
        try{ await publish(sale.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
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
  try{ await publish(sale.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
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

  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: id, companyId: companyFilter });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (!validateSaleOwnership(sale, req)) return res.status(403).json({ error: 'Sale belongs to different company' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

  // Pre-procesar para identificar combos en el batch y sus productos
  // Esto nos ayuda a evitar duplicados cuando los productos del combo ya vienen en el batch
  const combosInBatch = new Set(); // IDs de combos que vienen en el batch
  const comboProductRefIds = new Map(); // itemId -> comboRefId (para saber a qué combo pertenece)
  
  // Obtener IDs para búsqueda de precios
  const originalCompanyId = req.originalCompanyId || req.company?.id;
  const effectiveCompanyId = req.companyId;
  
  for (const raw of list) {
    if (!raw || raw.source !== 'price' || !raw.refId) continue;
    try {
      // Búsqueda robusta en dos pasos (igual que en addItem)
      let pe = null;
      if (originalCompanyId) {
        pe = await PriceEntry.findOne({ _id: raw.refId, companyId: originalCompanyId })
          .populate('vehicleId', 'make line displacement modelYear')
          .populate('itemId', 'sku name stock salePrice')
          .populate('comboProducts.itemId', 'sku name stock salePrice')
          .lean();
      }
      if (!pe && effectiveCompanyId && originalCompanyId && String(originalCompanyId) !== String(effectiveCompanyId)) {
        pe = await PriceEntry.findOne({ _id: raw.refId, companyId: effectiveCompanyId })
          .populate('vehicleId', 'make line displacement modelYear')
          .populate('itemId', 'sku name stock salePrice')
          .populate('comboProducts.itemId', 'sku name stock salePrice')
          .lean();
      }
      if (pe && pe.type === 'combo' && Array.isArray(pe.comboProducts) && pe.comboProducts.length > 0) {
        combosInBatch.add(String(raw.refId));
        // Marcar los itemIds de los productos del combo y a qué combo pertenecen
        pe.comboProducts.forEach(cp => {
          if (cp.itemId) {
            comboProductRefIds.set(String(cp.itemId), String(raw.refId));
          }
        });
      }
    } catch (err) {
      // Continuar si hay error
      continue;
    }
  }

  const added = [];
  for (const raw of list) {
    if (!raw) continue;
    try {
      const source = (raw.source === 'service') ? 'service' : (raw.source === 'price' ? 'price' : (raw.source === 'inventory' ? 'inventory' : 'service'));
      const qty = asNum(raw.qty) || 1;
      const unitCandidate = raw.unitPrice;

      if (source === 'inventory') {
        // Si este item es un producto de un combo que se va a expandir, omitirlo
        // porque el combo ya lo agregará
        if (raw.refId && comboProductRefIds.has(String(raw.refId))) {
          continue; // Omitir este item, el combo lo agregará
        }
        
        // CRÍTICO: Buscar items en ambos companyId si hay base compartida (se comparte TODA la data)
        const itemCompanyFilter = await getItemQueryCompanyFilter(req);
        let it = null;
        if (raw.refId) it = await Item.findOne({ _id: raw.refId, companyId: itemCompanyFilter });
        if (!it && raw.sku) it = await Item.findOne({ sku: String(raw.sku).trim().toUpperCase(), companyId: itemCompanyFilter });
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
          // CRÍTICO: Usar la misma lógica que getPrice y addItem para buscar precios en todas las empresas compartidas
          const companyIdsToSearch = await getAllSharedCompanyIdsHelper(originalCompanyId);
          
          // Construir query con companyIds
          // CRÍTICO: Siempre usar $in para asegurar que funcione correctamente con ObjectIds
          // Convertir todos los IDs a ObjectIds de mongoose para la búsqueda
          const companyIdsAsObjectIds = companyIdsToSearch.map(id => {
            try {
              if (id instanceof mongoose.Types.ObjectId) return id;
              return new mongoose.Types.ObjectId(id);
            } catch (err) {
              logger.warn('[addItemsBatch] Error convirtiendo companyId a ObjectId', { id, error: err?.message });
              return null;
            }
          }).filter(Boolean);
          
          if (companyIdsAsObjectIds.length === 0) {
            logger.error('[addItemsBatch] No hay companyIds válidos después de conversión', {
              refId: raw.refId,
              companyIdsToSearch: companyIdsToSearch.map(String)
            });
            throw new Error('PriceEntry not found');
          }
          
          // Siempre usar $in para consistencia
          const companyFilter = { $in: companyIdsAsObjectIds };
          
          // Buscar el precio en todas las empresas compartidas
          let pe = await PriceEntry.findOne({ _id: raw.refId, companyId: companyFilter })
            .populate('vehicleId', 'make line displacement modelYear')
            .populate('itemId', 'sku name stock salePrice')
            .populate('comboProducts.itemId', 'sku name stock salePrice')
            .lean();
          
          if (!pe) {
            // Verificar si existe en alguna empresa (para debugging)
            const priceAnyCompany = await PriceEntry.findOne({ _id: raw.refId }).lean();
            if (priceAnyCompany) {
              logger.error('[addItemsBatch] Precio encontrado pero no está en empresas compartidas', {
                priceId: raw.refId,
                priceCompanyId: priceAnyCompany.companyId?.toString(),
                originalCompanyId: originalCompanyId?.toString(),
                companyIdsToSearch: companyIdsToSearch.map(String)
              });
              throw new Error('PriceEntry belongs to different company');
            } else {
              throw new Error('PriceEntry not found');
            }
          }
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
            // Siempre agregar los productos del combo, a menos que ya vengan explícitamente en el batch
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
                // Verificar si este producto ya viene explícitamente en el batch como item independiente
                // (no como parte de otro combo, sino como item de inventario directo)
                const productAlreadyInBatch = list.some(r => 
                  r && r.source === 'inventory' && r.refId && String(r.refId) === String(cp.itemId._id)
                );
                
                // SIEMPRE agregar el producto del combo, a menos que ya venga explícitamente en el batch
                // Esto asegura que los productos del combo se agreguen incluso si no vienen en la cotización
                if (!productAlreadyInBatch) {
                  // Producto vinculado: agregar como inventory para que se descuente
                  // CRÍTICO: Usar SKU que empiece con "CP-" para que se identifique como parte del combo
                  const comboItem = cp.itemId;
                  const itemSku = comboItem.sku || '';
                  // Asegurar que el SKU empiece con "CP-" para identificación correcta
                  const comboItemSku = itemSku && !itemSku.toUpperCase().startsWith('CP-') 
                    ? `CP-${itemSku}` 
                    : (itemSku || `CP-${String(comboItem._id).slice(-6)}`);
                  added.push({
                    source: 'inventory',
                    refId: comboItem._id,
                    sku: comboItemSku,
                    name: cp.name || 'Producto del combo',
                    qty: comboQty,
                    unitPrice: cp.unitPrice || 0,
                    total: Math.round(comboQty * (cp.unitPrice || 0))
                  });
                }
                // Si ya viene en el batch como item independiente, omitirlo para evitar duplicado
              } else {
                // Producto sin vincular: agregar como price
                // Verificar si ya viene en el batch (por nombre similar o SKU CP-)
                const productAlreadyInBatch = list.some(r => {
                  if (!r || r.source !== 'price') return false;
                  // Si tiene el mismo nombre y viene después del combo, probablemente es el mismo
                  const rName = String(r.name || r.description || '').trim().toUpperCase();
                  const cpName = String(cp.name || '').trim().toUpperCase();
                  return rName === cpName && rName.length > 0;
                });
                
                if (!productAlreadyInBatch) {
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
                // Si ya viene en el batch, omitirlo para evitar duplicado
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
  try { await publish(sale.companyId, 'sale:updated', { id: (sale?._id) || undefined }); } catch { }
  res.json(sale.toObject());
};

export const updateItem = async (req, res) => {
  const { id, itemId } = req.params;
  const { qty, unitPrice, name } = req.body || {};
  
  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: id, companyId: companyFilter });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (!validateSaleOwnership(sale, req)) return res.status(403).json({ error: 'Sale belongs to different company' });
  
  // Si solo se está actualizando el nombre, permitir en ventas cerradas también
  const isOnlyNameUpdate = name != null && qty == null && unitPrice == null;
  if (!isOnlyNameUpdate && sale.status !== 'draft') {
    return res.status(400).json({ error: 'Solo se puede editar el nombre en ventas cerradas' });
  }
  
  const it = sale.items.id(itemId);
  if (!it) return res.status(404).json({ error: 'Item not found' });
  
  // Solo permitir actualizar cantidad y precio en ventas abiertas
  if (sale.status === 'draft') {
    if (qty != null && Number.isFinite(Number(qty))) it.qty = asNum(qty);
    if (unitPrice != null && Number.isFinite(Number(unitPrice))) it.unitPrice = asNum(unitPrice);
  }
  
  // Permitir actualizar el nombre en cualquier estado (solo para esta venta, no afecta inventario/precio)
  if (name != null && typeof name === 'string' && name.trim() !== '') {
    it.name = name.trim();
  }
  
  it.total = Math.round(asNum(it.qty) * asNum(it.unitPrice));
  
  computeTotals(sale);
  await sale.save();
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
  try{ await publish(sale.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

export const removeItem = async (req, res) => {
  const { id, itemId } = req.params;
  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: id, companyId: companyFilter });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (!validateSaleOwnership(sale, req)) return res.status(403).json({ error: 'Sale belongs to different company' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

  sale.items.id(itemId)?.deleteOne();
  computeTotals(sale);
  await sale.save();
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
  try{ await publish(sale.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

// ===== TÃ©cnico asignado =====
export const updateSale = async (req, res) => {
  const { id } = req.params;
  const { specialNotes, ...otherFields } = req.body || {};
  
  // Buscar venta considerando base de datos compartida
  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: id, companyId: companyFilter });
  
  if (!sale) {
    return res.status(404).json({ error: 'Sale not found' });
  }
  
  // Validar que la venta pertenece al originalCompanyId del usuario
  if (!validateSaleOwnership(sale, req)) {
    return res.status(403).json({ error: 'Sale belongs to different company' });
  }
  
  // Actualizar specialNotes si viene en el body
  if (specialNotes !== undefined) {
    sale.specialNotes = Array.isArray(specialNotes) ? specialNotes : [];
  }
  
  // Permitir actualizar otros campos permitidos si es necesario
  // Por ahora solo permitimos specialNotes
  
  await sale.save();
  try{ await publish(sale.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

export const updateTechnician = async (req, res) => {
  const { id } = req.params;
  const { technician } = req.body || {};
  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: id, companyId: companyFilter });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (!validateSaleOwnership(sale, req)) return res.status(403).json({ error: 'Sale belongs to different company' });
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
  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: id, companyId: companyFilter });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (!validateSaleOwnership(sale, req)) return res.status(403).json({ error: 'Sale belongs to different company' });
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
  // Actualizar perfil del cliente con overwrite para que los cambios manuales reemplacen los datos existentes
  await upsertProfileFromSource(req.companyId, sale, { 
    source: 'sale',
    overwriteCustomer: true,  // Sobrescribir datos del cliente si se editaron manualmente
    overwriteVehicle: true,   // Sobrescribir datos del vehículo si se editaron manualmente
    overwriteYear: true,      // Sobrescribir año si se editó
    overwriteMileage: true    // Sobrescribir kilometraje si se editó (solo si es mayor)
  });
  try{ await publish(sale.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  res.json(sale.toObject());
};

// ===== Cierre: descuenta inventario con transacciÃ³n =====
export const closeSale = async (req, res) => {
  const { id } = req.params;
  
  const session = await mongoose.startSession();
  try {
    const affectedItemIds = [];
    // CRÍTICO: Determinar si hay base de datos compartida ANTES del loop
    // Esto debe estar definido fuera del loop para evitar errores de scope
    const originalCompanyId = req.originalCompanyId || req.company?.id;
    const effectiveCompanyId = req.companyId;
    const hasSharedDb = req.hasSharedDatabase || (originalCompanyId && 
                       effectiveCompanyId && 
                       String(originalCompanyId) !== String(effectiveCompanyId));
    
    // Obtener todas las empresas que comparten la BD para publicar eventos
    let allSharedCompanyIds = [originalCompanyId || effectiveCompanyId];
    if (hasSharedDb && originalCompanyId) {
      try {
        const Company = (await import('../models/Company.js')).default;
        const companyDoc = await Company.findById(originalCompanyId).select('sharedDatabaseConfig').lean();
        
        if (companyDoc?.sharedDatabaseConfig?.sharedFrom?.companyId) {
          // Es empresa secundaria: incluir la principal y otras secundarias
          const mainCompanyId = String(companyDoc.sharedDatabaseConfig.sharedFrom.companyId);
          allSharedCompanyIds = [mainCompanyId, originalCompanyId];
          
          // Obtener la empresa principal para ver todas las secundarias
          const mainCompany = await Company.findById(mainCompanyId).select('sharedDatabaseConfig').lean();
          if (mainCompany?.sharedDatabaseConfig?.sharedWith) {
            mainCompany.sharedDatabaseConfig.sharedWith.forEach(sw => {
              const secId = String(sw.companyId);
              if (!allSharedCompanyIds.includes(secId)) {
                allSharedCompanyIds.push(secId);
              }
            });
          }
        } else if (companyDoc?.sharedDatabaseConfig?.sharedWith?.length > 0) {
          // Es empresa principal: incluir todas las secundarias
          allSharedCompanyIds = [originalCompanyId];
          companyDoc.sharedDatabaseConfig.sharedWith.forEach(sw => {
            const secId = String(sw.companyId);
            if (!allSharedCompanyIds.includes(secId)) {
              allSharedCompanyIds.push(secId);
            }
          });
        }
      } catch (err) {
        // Si hay error, usar solo la empresa actual
        logger.warn('[closeSale] Error obteniendo empresas compartidas', { error: err?.message });
      }
    }
    
    await session.withTransaction(async () => {
      // Buscar venta considerando base de datos compartida
      const companyFilter = getSaleQueryCompanyFilter(req);
      const sale = await Sale.findOne({ _id: id, companyId: companyFilter }).session(session);
      if (!sale) throw new Error('Sale not found');
      
      // CRÍTICO: Validar que la venta pertenece al originalCompanyId del usuario
      if (!validateSaleOwnership(sale, req)) {
        throw new Error('Sale belongs to different company');
      }
      
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

      // Procesar slots abiertos completados: verificar si ya están en items antes de agregarlos
      // CRÍTICO: El item ya fue agregado cuando se completó el slot en completeOpenSlot
      // Necesitamos verificar si hay suficientes items para todos los slots completados
      if (sale.openSlots && sale.openSlots.length > 0) {
        // CRÍTICO: Buscar items en ambos companyId si hay base compartida (se comparte TODA la data)
        const itemCompanyFilter = await getItemQueryCompanyFilter(req);
        
        // Primero: contar cuántos items de cada slot ya existen en sale.items
        // Usar un Set para rastrear qué items ya fueron "asignados" a slots
        const assignedItems = new Set();
        
        for (const slot of sale.openSlots) {
          if (!slot.completed || !slot.completedItemId) continue;
          
          const item = await Item.findOne({ _id: slot.completedItemId, companyId: itemCompanyFilter }).session(session);
          if (!item) throw new Error(`Item del inventario no encontrado para slot: ${slot.slotName}`);
          
          const slotItemRefId = String(slot.completedItemId);
          const slotQty = slot.qty || 1;
          const slotPrice = (slot.estimatedPrice !== undefined && slot.estimatedPrice !== null) 
            ? slot.estimatedPrice 
            : (item.salePrice || 0);
          
          // Buscar el combo para limitar la búsqueda al contexto del combo
          const comboItemForSlot = sale.items.find(it => 
            it.source === 'price' && 
            it.refId && 
            String(it.refId) === String(slot.comboPriceId)
          );
          const comboIndex = comboItemForSlot ? sale.items.indexOf(comboItemForSlot) : -1;
          
          // Buscar si hay un item no asignado aún que coincida con este slot
          let foundUnassignedItem = null;
          
          if (comboIndex >= 0) {
            // Buscar desde el combo hacia adelante
            for (let i = comboIndex + 1; i < sale.items.length; i++) {
              const it = sale.items[i];
              const itRefId = it.refId ? String(it.refId) : '';
              
              // Si encontramos otro combo, parar la búsqueda
              if (it.source === 'price' && it.refId && String(it.refId) !== String(slot.comboPriceId)) {
                break;
              }
              
              // Verificar si este item coincide con el slot y no ha sido asignado aún
              if (itRefId === slotItemRefId && it.qty === slotQty && it.unitPrice === slotPrice) {
                const itemKey = `${i}_${itRefId}_${it.qty}_${it.unitPrice}`;
                if (!assignedItems.has(itemKey)) {
                  foundUnassignedItem = it;
                  assignedItems.add(itemKey);
                  break;
                }
              }
            }
          }
          
          // Fallback: buscar en toda la venta si no encontramos en el contexto del combo
          if (!foundUnassignedItem) {
            for (let i = 0; i < sale.items.length; i++) {
              const it = sale.items[i];
              const itRefId = it.refId ? String(it.refId) : '';
              
              if (itRefId === slotItemRefId && it.qty === slotQty && it.unitPrice === slotPrice) {
                const itemKey = `${i}_${itRefId}_${it.qty}_${it.unitPrice}`;
                if (!assignedItems.has(itemKey)) {
                  foundUnassignedItem = it;
                  assignedItems.add(itemKey);
                  break;
                }
              }
            }
          }
          
          // Solo agregar si no encontramos un item no asignado (el item ya fue agregado cuando se completó el slot)
          if (!foundUnassignedItem) {
            // Usar el precio que ya se estableció al completar el slot (estimatedPrice tiene prioridad)
            const realPrice = (slot.estimatedPrice !== undefined && slot.estimatedPrice !== null) 
              ? slot.estimatedPrice 
              : (item.salePrice || 0);
            
            // Determinar el SKU correcto (con prefijo CP- si es parte de un combo)
            let finalSku = item.sku || `SLOT-${String(slot.completedItemId).slice(-6)}`;
            // Si el combo usa prefijo CP-, mantenerlo consistente
            const comboItem = sale.items.find(it => 
              it.source === 'price' && 
              it.refId && 
              String(it.refId) === String(slot.comboPriceId)
            );
            if (comboItem) {
              // Verificar si otros items del combo usan prefijo CP-
              const hasCPPrefix = sale.items.some(it => 
                it.source === 'inventory' && 
                it.sku && 
                String(it.sku).toUpperCase().startsWith('CP-') &&
                it.refId && 
                String(it.refId) !== slotItemRefId
              );
              if (hasCPPrefix && finalSku && !finalSku.toUpperCase().startsWith('CP-')) {
                finalSku = `CP-${finalSku}`;
              }
            }
            
            // Agregar el item solo si no existe (evita duplicación)
            sale.items.push({
              source: 'inventory',
              refId: item._id,
              sku: finalSku,
              name: item.name || slot.slotName,
              qty: slot.qty || 1,
              unitPrice: realPrice,
              total: Math.round((slot.qty || 1) * realPrice)
            });
          }
        }
      }
      
      // CRÍTICO: Recalcular totales después de procesar slots para asegurar que los precios sean correctos
      computeTotals(sale);
      
      // Descuento inventario por lÃ­neas 'inventory'
      for (const it of sale.items) {
        if (String(it.source) !== 'inventory') continue;
        const q = asNum(it.qty) || 0;
        if (q <= 0) continue;
        let target = null;
        // CRÍTICO: Buscar items en ambos companyId si hay base compartida (se comparte TODA la data)
        const itemCompanyFilter = await getItemQueryCompanyFilter(req);
        
        
        // Fallback: si no hay refId válido intentar por SKU
        if (it.refId) {
          target = await Item.findOne({ _id: it.refId, companyId: itemCompanyFilter }).session(session);
        }
        if (!target && it.sku) {
          target = await Item.findOne({ sku: String(it.sku).trim().toUpperCase(), companyId: itemCompanyFilter }).session(session);
          // Si lo encontramos por sku y no había refId, opcionalmente lo guardamos para trazabilidad
          if (target && !it.refId) {
            it.refId = target._id; // queda persistido al save posterior
          }
        }
        if (!target) {
          logger.error('[closeSale] Item no encontrado', {
            refId: it.refId?.toString(),
            sku: it.sku,
            itemCompanyFilter: typeof itemCompanyFilter === 'object' ? JSON.stringify(itemCompanyFilter) : itemCompanyFilter?.toString()
          });
          throw new Error(`Inventory item not found (${it.sku || it.refId || 'sin id'})`);
        }
        
        // CRÍTICO: Leer el stock del Item de forma robusta.
        // El campo stock del Item es la FUENTE DE VERDAD para validar si se puede vender.
        // Si el Item tiene stock >= cantidad de la venta, se debe permitir cerrar,
        // independientemente de cómo estén las StockEntries.
        let itemStock = 0;
        if (target.stock !== null && target.stock !== undefined) {
          const stockValue = Number(target.stock);
          if (!isNaN(stockValue) && stockValue >= 0) {
            itemStock = stockValue;
          }
        }

        // VALIDACIÓN PRINCIPAL: usar SIEMPRE el stock del Item.
        // Si el Item tiene stock suficiente, se permite cerrar la venta.
        if (itemStock < q) {
          throw new Error(`Stock insuficiente para ${target.sku || target.name}. Disponible: ${itemStock}, Requerido: ${q}`);
        }

        // A partir de aquí solo nos encargamos de DESCONTAR el inventario,
        // pero ya sabemos que hay stock suficiente gracias a itemStock.

        // Descontar primero usando FIFO sobre las StockEntries (si existen).
        const stockCompanyFilter = itemCompanyFilter;
        let remainingQty = q;
        const stockEntries = await StockEntry.find({
          companyId: stockCompanyFilter,
          itemId: target._id,
          qty: { $gt: 0 }
        })
        .sort({ entryDate: 1, _id: 1 }) // FIFO: más antiguos primero
        .session(session);

        const stockEntriesUsed = [];
        
        // Si hay StockEntries, descontar usando FIFO
        if (stockEntries.length > 0) {
          for (const entry of stockEntries) {
            if (remainingQty <= 0) break;
            
            const qtyToDeduct = Math.min(remainingQty, entry.qty);
            entry.qty -= qtyToDeduct;
            remainingQty -= qtyToDeduct;
            
            stockEntriesUsed.push({
              entryId: entry._id,
              qty: qtyToDeduct,
              vehicleIntakeId: entry.vehicleIntakeId
            });
            
            if (entry.qty <= 0) {
              await StockEntry.deleteOne({ _id: entry._id }).session(session);
            } else {
              await entry.save({ session });
            }
          }
        }
        
        // Guardar información de las entradas usadas en el meta del item para trazabilidad
        // Si el item ya tiene meta.entryId (de QR), lo preservamos como primaryEntryId
        // También guardamos todas las entradas usadas
        if (!it.meta) it.meta = {};
        if (it.meta.entryId && stockEntriesUsed.length > 0) {
          // Si ya tenía entryId del QR, guardarlo como primaryEntryId
          it.meta.primaryEntryId = it.meta.entryId;
        }
        // Guardar el primer entryId usado (o el del QR si existe) como entryId principal
        if (stockEntriesUsed.length > 0) {
          it.meta.entryId = String(stockEntriesUsed[0].entryId);
          it.meta.entriesUsed = stockEntriesUsed.map(se => ({
            entryId: String(se.entryId),
            qty: se.qty,
            vehicleIntakeId: se.vehicleIntakeId ? String(se.vehicleIntakeId) : null
          }));
        }

        // Actualizar stock total del item
        // CRÍTICO: El Item.stock debe reflejar el stock total disponible
        // Si hay StockEntries, calculamos el stock total desde ellas después del descuento
        // Si no hay StockEntries, descontamos directamente del Item.stock
        if (stockEntries.length > 0) {
          // Si hay StockEntries, calcular el stock total desde las StockEntries restantes
          // Esto asegura que Item.stock = suma de todas las StockEntries restantes
          const remainingEntries = await StockEntry.find({
            companyId: stockCompanyFilter,
            itemId: target._id,
            qty: { $gt: 0 }
          }).session(session);
          
          const totalFromEntries = remainingEntries.reduce((sum, e) => sum + (e.qty || 0), 0);
          
          // Si quedó cantidad por descontar que no se pudo descontar de StockEntries,
          // descontarla del Item.stock y luego sincronizar
          if (remainingQty > 0) {
            // Descontar remainingQty del Item.stock
            await Item.updateOne(
              { _id: target._id, companyId: itemCompanyFilter },
              { $inc: { stock: -remainingQty } }
            ).session(session);
          }
          
          // Sincronizar Item.stock con la suma de StockEntries restantes
          // Esto asegura que Item.stock refleje el stock real disponible
          await Item.updateOne(
            { _id: target._id, companyId: itemCompanyFilter },
            { $set: { stock: totalFromEntries } }
          ).session(session);
        } else {
          // Si no hay StockEntries, descontar directamente del Item.stock
          const upd = await Item.updateOne(
            { _id: target._id, companyId: itemCompanyFilter },
            { $inc: { stock: -q } }
          ).session(session);
          
          if (upd.matchedCount === 0) {
            throw new Error(`No se pudo actualizar el stock para ${target.sku || target.name}`);
          }
        }

        // Si quedó en 0, despublicar automáticamente para ocultarlo del catálogo
        const fresh = await Item.findOne({ _id: target._id, companyId: itemCompanyFilter }).session(session);
        if ((fresh?.stock || 0) <= 0 && fresh?.published) {
          fresh.published = false;
          await fresh.save({ session });
        }

        // Registrar movimientos de stock con información de procedencia
        const stockMoves = stockEntriesUsed.map(se => ({
          companyId: req.companyId,
          itemId: target._id,
          qty: se.qty,
          reason: 'OUT',
          meta: { 
            saleId: sale._id, 
            sku: it.sku, 
            name: it.name,
            stockEntryId: se.entryId,
            vehicleIntakeId: se.vehicleIntakeId
          }
        }));

        if (stockMoves.length > 0) {
          await StockMove.insertMany(stockMoves, { session });
        }
        affectedItemIds.push(String(target._id));
      }

  // === Verificar si hay link de empresa para esta placa ===
      let companyAccountId = null;
      if (sale.vehicle?.plate) {
        const plate = String(sale.vehicle.plate).trim().toUpperCase();
        const ClientCompanyLink = (await import('../models/ClientCompanyLink.js')).default;
        const CompanyAccount = (await import('../models/CompanyAccount.js')).default;
        
        // 1. Verificar si hay un link activo existente
        let link = await ClientCompanyLink.findOne({
          companyId: String(req.companyId),
          plate: plate,
          active: true
        }).populate('companyAccountId', 'name type').session(session);
        
        if (link && link.companyAccountId) {
          companyAccountId = link.companyAccountId._id;
          
          // Si es empresa recurrente, el link es permanente y se aplica a todas las ventas
          if (link.companyAccountId.type === 'recurrente') {
            // Link permanente: todas las ventas de esta placa se asocian a la empresa
            sale.companyAccountId = companyAccountId;
          } else if (link.companyAccountId.type === 'particular') {
            // Empresa particular: solo esta venta se asocia
            if (!link.saleId) {
              link.saleId = sale._id;
              await link.save({ session });
            }
            sale.companyAccountId = companyAccountId;
          }
        } else {
          // 2. Si no hay link, verificar si la placa está en las placas manuales de una empresa recurrente
          const companyAccount = await CompanyAccount.findOne({
            companyId: String(req.companyId),
            type: 'recurrente',
            active: true,
            plates: { $in: [plate] }
          }).session(session);
          
          if (companyAccount) {
            // Crear link permanente para empresa recurrente
            link = await ClientCompanyLink.create([{
              companyId: String(req.companyId),
              companyAccountId: companyAccount._id,
              plate: plate,
              customerIdNumber: sale.customer?.idNumber || '',
              customerName: sale.customer?.name || '',
              customerPhone: sale.customer?.phone || '',
              linkType: 'permanent',
              active: true
            }], { session });
            
            companyAccountId = companyAccount._id;
            sale.companyAccountId = companyAccountId;
          }
        }
      }
      
      // Asignar empresa a la venta (ya se asignó arriba si se encontró)

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
      // IMPORTANTE: Si el total es 0, no validar métodos de pago (no son necesarios)
      
      // Calcular total primero para verificar si es 0
      computeTotals(sale);
      const calculatedTotal = Math.round(Number(sale.total || 0));
      const hasZeroTotal = calculatedTotal === 0;
      
      let rawMethods = Array.isArray(req.body?.paymentMethods) ? req.body.paymentMethods : [];
      
      // Solo validar métodos de pago si el total NO es 0
      if (rawMethods.length && !hasZeroTotal) {
        // CRÍTICO: Normalizar y filtrar válidos - asegurar que los montos sean números enteros
        const cleaned = rawMethods.map(m => {
          // Limpiar el amount: convertir a string, remover caracteres no numéricos, parsear y redondear
          const rawAmount = String(m?.amount || '0');
          const cleanAmount = rawAmount.replace(/[^0-9]/g, ''); // Remover cualquier carácter no numérico
          const amount = Math.round(Number(cleanAmount) || 0);
          return {
            method: String(m?.method || '').trim().toUpperCase(),
            amount: amount, // Redondear a entero
            accountId: m?.accountId ? new mongoose.Types.ObjectId(m.accountId) : null
          };
        }).filter(m => m.method && m.amount > 0);
        
        if (cleaned.length) {
          // Si el frontend envía un total, usarlo para validación (puede ser más preciso si hay items recién agregados)
          const frontendTotal = req.body?.total ? Math.round(Number(req.body.total)) : null;
          const totalToUse = frontendTotal !== null ? frontendTotal : calculatedTotal;
          
          // CRÍTICO: Calcular suma asegurando que todos los amounts sean números enteros
          const sum = cleaned.reduce((a, b) => {
            const amount = Math.round(Number(b.amount) || 0);
            return a + amount;
          }, 0);
          
          // Log para debugging
          logger.info('[closeSale] Validando pagos', {
            saleId: sale._id?.toString(),
            sum,
            calculatedTotal,
            frontendTotal,
            totalToUse,
            diff: Math.abs(sum - totalToUse),
            paymentMethods: cleaned.map(m => ({ method: m.method, amount: m.amount }))
          });
          
          if (Math.abs(sum - totalToUse) > 0.01) {
            logger.error('[closeSale] Error de validación', {
              sum,
              calculatedTotal,
              frontendTotal,
              totalToUse,
              diff: Math.abs(sum - totalToUse),
              paymentMethods: cleaned
            });
            throw new Error(`La suma de los montos de pago (${sum}) no coincide con el total de la venta (${totalToUse}). Diferencia: ${Math.abs(sum - totalToUse)}`);
          }
          
          // Si el frontend envió un total diferente al calculado, actualizar el total de la venta
          // Esto puede pasar si hay items que se agregaron/modificados después de que el frontend cargó la venta
          if (frontendTotal !== null && Math.abs(frontendTotal - calculatedTotal) > 0.01) {
            logger.warn('[closeSale] Total del frontend difiere del calculado, usando el calculado', {
              frontendTotal,
              calculatedTotal,
              diff: Math.abs(frontendTotal - calculatedTotal)
            });
            // Usar el total calculado (más confiable, viene de los items en la BD)
            sale.total = calculatedTotal;
            sale.subtotal = Math.round(Number(sale.subtotal || 0));
          }
          // Redondear montos a enteros para consistencia (COP sin decimales)
          sale.paymentMethods = cleaned.map(m => ({ method: m.method, amount: Math.round(m.amount), accountId: m.accountId }));
          // Mantener legacy paymentMethod con el primero (para compatibilidad con reportes antiguos)
          if (sale.paymentMethods.length) sale.paymentMethod = sale.paymentMethods[0].method;
        }
      } else if (hasZeroTotal) {
        // Si el total es 0, no se requieren métodos de pago
        sale.paymentMethods = [];
        sale.paymentMethod = '';
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
      
      // Procesar inversión si viene en el body (acepta 'investment' o 'investmentAmount')
      const investmentAmount = req.body?.investment || req.body?.investmentAmount;
      if (investmentAmount != null) {
        const investment = Number(investmentAmount);
        if (Number.isFinite(investment) && investment >= 0) {
          sale.investmentAmount = Math.round(investment);
        }
      }
      
      await sale.save({ session });
    });
    
    // Buscar venta después de cerrarla (usar originalCompanyId para validación)
    // Nota: originalCompanyId ya está definido al inicio de la función
    const saleCompanyId = getSaleCreationCompanyId(req);
    const sale = await Sale.findOne({ _id: id, companyId: saleCompanyId });
    if (!sale) throw new Error('Sale not found after closing');
    if (!validateSaleOwnership(sale, req)) throw new Error('Sale belongs to different company');
    await upsertCustomerProfile(saleCompanyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
    
    // Verificar alertas de stock después del cierre de venta (una sola vez)
    if (affectedItemIds.length > 0) {
      try {
        await checkLowStockForMany(req.companyId, affectedItemIds);
      } catch (e) {
        logger.error('Error checking stock alerts after sale close', { error: e?.message, stack: e?.stack });
      }
    }
    
    let cashflowEntries = [];
    let receivable = null;
    
    // IMPORTANTE: Si el total de la venta es 0, no crear entradas de flujo de caja ni cuentas por cobrar
    // Solo cerrar la venta, descontar stock y guardar en historial
    const saleTotal = Number(sale.total || 0);
    const hasZeroTotal = saleTotal === 0;
    
    if (!hasZeroTotal) {
      // Verificar si algún método de pago es CREDITO
      const hasCredit = sale.paymentMethods?.some(m => 
        String(m.method || '').toUpperCase() === 'CREDITO' || 
        String(m.method || '').toUpperCase() === 'CRÉDITO'
      ) || String(sale.paymentMethod || '').toUpperCase() === 'CREDITO' ||
         String(sale.paymentMethod || '').toUpperCase() === 'CRÉDITO';
      
      if (hasCredit) {
        // Si hay crédito, crear cuenta por cobrar
        try {
          const AccountReceivable = (await import('../models/AccountReceivable.js')).default;
          const CompanyAccount = (await import('../models/CompanyAccount.js')).default;
          
          // Calcular monto de crédito
          const creditAmount = sale.paymentMethods?.find(m => 
            String(m.method || '').toUpperCase() === 'CREDITO' || 
            String(m.method || '').toUpperCase() === 'CRÉDITO'
          )?.amount || sale.total;
          
          // Usar companyAccountId de la venta (ya asignado arriba si hay link)
          const companyAccountId = sale.companyAccountId || null;
          
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
          logger.warn('createReceivable failed', { error: e?.message || e, stack: e?.stack }); 
        }
      }
      
      // IMPORTANTE: Siempre registrar en flujo de caja (incluso si hay crédito)
      // La función registerSaleIncome ya filtra automáticamente los métodos de crédito
      // y solo registra los pagos en efectivo
      try {
        const accountId = req.body?.accountId; // opcional desde frontend
        const resEntries = await registerSaleIncome({ companyId: req.companyId, sale, accountId });
        cashflowEntries = Array.isArray(resEntries) ? resEntries : (resEntries ? [resEntries] : []);
      } catch(e) { 
        logger.warn('registerSaleIncome failed', { error: e?.message || e, stack: e?.stack }); 
      }
    }
    
    // CRÍTICO: Publicar evento a todas las empresas que comparten la BD
    // Esto asegura que todos los usuarios vean la venta cerrada
    for (const companyId of allSharedCompanyIds) {
      try {
        await publish(companyId, 'sale:closed', { id: (sale?._id)||undefined });
      } catch (e) {
        logger.warn('[closeSale] Error publicando evento a empresa', { companyId, error: e?.message });
      }
    }
    
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
    // CRÍTICO: Determinar si hay base de datos compartida
    const originalCompanyId = req.originalCompanyId || req.company?.id;
    const effectiveCompanyId = req.companyId;
    const hasSharedDb = req.hasSharedDatabase || (originalCompanyId && 
                       effectiveCompanyId && 
                       String(originalCompanyId) !== String(effectiveCompanyId));
    
    // Obtener todas las empresas que comparten la BD para publicar eventos
    let allSharedCompanyIds = [originalCompanyId || effectiveCompanyId];
    if (hasSharedDb && originalCompanyId) {
      try {
        const Company = (await import('../models/Company.js')).default;
        const companyDoc = await Company.findById(originalCompanyId).select('sharedDatabaseConfig').lean();
        
        if (companyDoc?.sharedDatabaseConfig?.sharedFrom?.companyId) {
          // Es empresa secundaria: incluir la principal y otras secundarias
          const mainCompanyId = String(companyDoc.sharedDatabaseConfig.sharedFrom.companyId);
          allSharedCompanyIds = [mainCompanyId, originalCompanyId];
          
          // Obtener la empresa principal para ver todas las secundarias
          const mainCompany = await Company.findById(mainCompanyId).select('sharedDatabaseConfig').lean();
          if (mainCompany?.sharedDatabaseConfig?.sharedWith) {
            mainCompany.sharedDatabaseConfig.sharedWith.forEach(sw => {
              const secId = String(sw.companyId);
              if (!allSharedCompanyIds.includes(secId)) {
                allSharedCompanyIds.push(secId);
              }
            });
          }
        } else if (companyDoc?.sharedDatabaseConfig?.sharedWith?.length > 0) {
          // Es empresa principal: incluir todas las secundarias
          allSharedCompanyIds = [originalCompanyId];
          companyDoc.sharedDatabaseConfig.sharedWith.forEach(sw => {
            const secId = String(sw.companyId);
            if (!allSharedCompanyIds.includes(secId)) {
              allSharedCompanyIds.push(secId);
            }
          });
        }
      } catch (err) {
        // Si hay error, usar solo la empresa actual
        logger.warn('[updateCloseSale] Error obteniendo empresas compartidas', { error: err?.message });
      }
    }
    
    await session.withTransaction(async () => {
      // Buscar venta considerando base de datos compartida
      const companyFilter = getSaleQueryCompanyFilter(req);
      const sale = await Sale.findOne({ _id: id, companyId: companyFilter }).session(session);
      if (!sale) throw new Error('Sale not found');
      
      // CRÍTICO: Validar que la venta pertenece al originalCompanyId del usuario
      if (!validateSaleOwnership(sale, req)) {
        throw new Error('Sale belongs to different company');
      }
      
      if (sale.status !== 'closed') throw new Error('Only closed sales can be updated');

      // Importar dependencias necesarias
      const CashFlowEntry = (await import('../models/CashFlowEntry.js')).default;
      const AccountReceivable = (await import('../models/AccountReceivable.js')).default;
      const cashflowModule = await import('./cashflow.controller.js');
      const registerSaleIncome = cashflowModule.registerSaleIncome;
      const computeBalance = cashflowModule.computeBalance;
      const ensureDefaultCashAccount = cashflowModule.ensureDefaultCashAccount;
      const recomputeAccountBalances = cashflowModule.recomputeAccountBalances;
      const Account = (await import('../models/Account.js')).default;

      // Guardar valores antiguos para comparar
      const oldPaymentMethods = sale.paymentMethods || [];
      const oldLaborCommissions = sale.laborCommissions || [];

      // Actualizar paymentMethods si vienen en el body
      if (req.body?.paymentMethods !== undefined) {
        const rawMethods = Array.isArray(req.body.paymentMethods) ? req.body.paymentMethods : [];
        // CRÍTICO: Normalizar y filtrar válidos - asegurar que los montos sean números enteros
        const cleaned = rawMethods
          .map(m => {
            // Limpiar el amount: convertir a string, remover caracteres no numéricos, parsear y redondear
            const rawAmount = String(m?.amount || '0');
            const cleanAmount = rawAmount.replace(/[^0-9]/g, ''); // Remover cualquier carácter no numérico
            const amount = Math.round(Number(cleanAmount) || 0);
            return {
              method: String(m.method || '').trim(),
              amount: amount,
              accountId: m.accountId ? new mongoose.Types.ObjectId(m.accountId) : null
            };
          })
          .filter(m => m.method && m.amount > 0);
        
        // CRÍTICO: Validar que la suma coincida con el total - asegurar que todos los amounts sean números enteros
        const sum = cleaned.reduce((a, m) => {
          const amount = Math.round(Number(m.amount) || 0);
          return a + amount;
        }, 0);
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
        
        // Recalcular laborValue, laborShare y laborPercent desde las comisiones
        const sumVal = sale.laborCommissions.reduce((a, b) => a + (b.laborValue || 0), 0);
        const sumShare = sale.laborCommissions.reduce((a, b) => a + (b.share || 0), 0);
        if (sumVal > 0) sale.laborValue = sumVal;
        if (sumShare > 0) sale.laborShare = sumShare;
        if (sale.laborValue > 0 && sale.laborShare > 0) {
          sale.laborPercent = Math.round((sale.laborShare / sale.laborValue) * 100);
        }
      }

      // Actualizar laborPercent directamente si viene en el body (para compatibilidad)
      if (req.body?.laborPercent !== undefined) {
        const laborPercentRaw = req.body.laborPercent;
        const laborPercent = Number(laborPercentRaw);
        if (Number.isFinite(laborPercent) && laborPercent >= 0 && laborPercent <= 100) {
          sale.laborPercent = Math.round(laborPercent);
          if (sale.laborValue && sale.laborPercent) {
            sale.laborShare = Math.round(sale.laborValue * (sale.laborPercent / 100));
          }
        }
      }

      // Actualizar paymentReceiptUrl si viene en el body
      if (req.body?.paymentReceiptUrl !== undefined) {
        sale.paymentReceiptUrl = String(req.body.paymentReceiptUrl || '').trim();
      }

      // Actualizar técnico si viene en el body (para ventas cerradas)
      if (req.body?.technician !== undefined) {
        const technician = String(req.body.technician || '').trim().toUpperCase();
        sale.technician = technician;
        // También actualizar closingTechnician para mantener consistencia
        sale.closingTechnician = technician;
        // Si no hay initialTechnician, establecerlo
        if (technician && !sale.initialTechnician) {
          sale.initialTechnician = technician;
          if (!sale.technicianAssignedAt) {
            sale.technicianAssignedAt = new Date();
          }
        }
        // Actualizar timestamp de cierre del técnico
        if (technician) {
          sale.technicianClosedAt = new Date();
        }
      }

      await sale.save({ session });

      // Verificar si hay entradas de flujo de caja para esta venta
      const existingEntries = await CashFlowEntry.find({ 
        companyId: req.companyId, 
        source: 'SALE', 
        sourceRef: sale._id 
      }).session(session);
      
      // Si cambiaron los métodos de pago O si no hay entradas en el flujo de caja, actualizar/crear
      const paymentMethodsChanged = JSON.stringify(oldPaymentMethods) !== JSON.stringify(sale.paymentMethods);
      const hasNoCashflowEntries = existingEntries.length === 0;
      
      if (paymentMethodsChanged || hasNoCashflowEntries) {
        
        // Filtrar métodos que no sean crédito
        const nonCreditMethods = sale.paymentMethods?.filter(m => {
          const method = String(m.method || '').toUpperCase();
          return method !== 'CREDITO' && method !== 'CRÉDITO';
        }) || [];

        // Actualizar o crear entradas según corresponda
        const saleDate = sale.closedAt || sale.updatedAt || new Date();
        const accountsToRecalc = new Set();
        
        // Mapear entradas existentes por índice
        const usedEntries = new Set();
        
        for (let i = 0; i < nonCreditMethods.length; i++) {
          const m = nonCreditMethods[i];
          let accId = m.accountId;
          if (!accId) {
            const acc = await ensureDefaultCashAccount(req.companyId);
            accId = acc._id;
          }
          
          // Buscar entrada existente que coincida con esta posición o cuenta
          let existingEntry = null;
          let entryIndex = -1;
          
          // Primero intentar encontrar una entrada en la misma posición
          if (i < existingEntries.length) {
            existingEntry = existingEntries[i];
            entryIndex = i;
          } else {
            // Si no hay en la misma posición, buscar una que tenga la misma cuenta
            for (let j = 0; j < existingEntries.length; j++) {
              if (!usedEntries.has(j) && String(existingEntries[j].accountId) === String(accId)) {
                existingEntry = existingEntries[j];
                entryIndex = j;
                break;
              }
            }
          }
          
          if (existingEntry && String(existingEntry.accountId) === String(accId)) {
            // Actualizar entrada existente
            usedEntries.add(entryIndex);
            accountsToRecalc.add(String(accId));
            
            const oldAmount = existingEntry.amount || 0;
            const newAmount = Number(m.amount || 0);
            
            // Si el monto cambió, necesitamos recalcular balances
            if (Math.abs(oldAmount - newAmount) > 0.01) {
              existingEntry.amount = newAmount;
              existingEntry.description = `Venta #${String(sale.number || '').padStart(5,'0')} (${m.method})`;
              existingEntry.meta = { saleNumber: sale.number, paymentMethod: m.method };
              await existingEntry.save({ session });
            } else {
              // Solo actualizar descripción y meta si el monto no cambió
              existingEntry.description = `Venta #${String(sale.number || '').padStart(5,'0')} (${m.method})`;
              existingEntry.meta = { saleNumber: sale.number, paymentMethod: m.method };
              await existingEntry.save({ session });
            }
          } else {
            // Crear nueva entrada
            accountsToRecalc.add(String(accId));
            
            // Calcular balance previo
            const prevBal = await computeBalance(accId, req.companyId);
            const newBal = prevBal + Number(m.amount || 0);
            
            await CashFlowEntry.create([{
              companyId: req.companyId,
              accountId: accId,
              kind: 'IN',
              source: 'SALE',
              sourceRef: sale._id,
              description: `Venta #${String(sale.number || '').padStart(5,'0')} (${m.method})`,
              amount: Number(m.amount || 0),
              balanceAfter: newBal,
              date: saleDate,
              meta: { saleNumber: sale.number, paymentMethod: m.method }
            }], { session });
          }
        }
        
        // Eliminar entradas sobrantes (si había más entradas que métodos de pago)
        for (let i = 0; i < existingEntries.length; i++) {
          if (!usedEntries.has(i)) {
            accountsToRecalc.add(String(existingEntries[i].accountId));
            await CashFlowEntry.deleteOne({ _id: existingEntries[i]._id }).session(session);
          }
        }
        
        // Recalcular balances de todas las cuentas afectadas
        for (const accIdStr of accountsToRecalc) {
          await recomputeAccountBalances(req.companyId, new mongoose.Types.ObjectId(accIdStr));
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
            // Usar companyAccountId de la venta (ya asignado si hay link)
            const companyAccountId = sale.companyAccountId || null;

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

      }
    });

    // Buscar venta actualizada (usar originalCompanyId para validación)
    const saleCompanyId = getSaleCreationCompanyId(req);
    const updatedSale = await Sale.findOne({ _id: id, companyId: saleCompanyId });
    if (!updatedSale) throw new Error('Sale not found after update');
    if (!validateSaleOwnership(updatedSale, req)) throw new Error('Sale belongs to different company');
    
    // CRÍTICO: Publicar evento a todas las empresas que comparten la BD
    // Esto asegura que todos los usuarios vean la venta actualizada
    for (const companyId of allSharedCompanyIds) {
      try {
        await publish(companyId, 'sale:updated', { id: (updatedSale?._id)||undefined });
      } catch (e) {
        logger.warn('[updateCloseSale] Error publicando evento a empresa', { companyId, error: e?.message });
      }
    }
    
    res.json(updatedSale.toObject());
  } catch (err) {
    await session.abortTransaction().catch(()=>{});
    res.status(400).json({ error: err?.message || 'Cannot update sale' });
  } finally {
    session.endSession();
  }
};

// ===== Registrar flujo de caja para venta cerrada que no tiene entrada =====
export const registerSaleCashflow = async (req, res) => {
  const { id } = req.params;
  
  try {
    // Buscar venta
    const companyFilter = getSaleQueryCompanyFilter(req);
    const sale = await Sale.findOne({ _id: id, companyId: companyFilter });
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    if (!validateSaleOwnership(sale, req)) return res.status(403).json({ error: 'Sale belongs to different company' });
    if (sale.status !== 'closed') return res.status(400).json({ error: 'Only closed sales can register cashflow' });
    
    // Verificar si ya tiene entradas en el flujo de caja
    const CashFlowEntry = (await import('../models/CashFlowEntry.js')).default;
    const existingEntries = await CashFlowEntry.find({ 
      companyId: req.companyId, 
      source: 'SALE', 
      sourceRef: sale._id 
    });
    
    if (existingEntries.length > 0) {
      return res.json({ 
        message: 'Sale already has cashflow entries', 
        entries: existingEntries,
        sale: sale.toObject()
      });
    }
    
    // Registrar en flujo de caja usando la función existente
    const accountId = req.body?.accountId; // opcional desde frontend
    const cashflowModule = await import('./cashflow.controller.js');
    const registerSaleIncome = cashflowModule.registerSaleIncome;
    const recomputeAccountBalances = cashflowModule.recomputeAccountBalances;
    
    const resEntries = await registerSaleIncome({ 
      companyId: req.companyId, 
      sale, 
      accountId,
      forceCreate: true // Forzar creación aunque ya existan (pero ya verificamos que no existen)
    });
    
    const cashflowEntries = Array.isArray(resEntries) ? resEntries : (resEntries ? [resEntries] : []);
    
    // Recalcular balances de todas las cuentas afectadas
    const accountsToRecalc = new Set();
    for (const entry of cashflowEntries) {
      accountsToRecalc.add(String(entry.accountId));
    }
    
    for (const accIdStr of accountsToRecalc) {
      await recomputeAccountBalances(req.companyId, new mongoose.Types.ObjectId(accIdStr));
    }
    
    res.json({ 
      ok: true, 
      message: 'Cashflow entries created successfully',
      cashflowEntries: cashflowEntries.map(e => e.toObject ? e.toObject() : e),
      sale: sale.toObject()
    });
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Cannot register cashflow' });
  }
};

// ===== Cancelar (X de pestaÃ±a) =====
export const cancelSale = async (req, res) => {
  const { id } = req.params;
  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: id, companyId: companyFilter });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (!validateSaleOwnership(sale, req)) return res.status(403).json({ error: 'Sale belongs to different company' });
  if (sale.status === 'closed') return res.status(400).json({ error: 'Closed sale cannot be cancelled' });
  // PolÃ­tica actual: eliminar; si prefieres histÃ³rico, cambia a status:'cancelled' y setea cancelledAt.
  const originalCompanyId = getSaleCreationCompanyId(req);
  await Sale.deleteOne({ _id: id, companyId: originalCompanyId });
  try{ await publish(originalCompanyId, 'sale:cancelled', { id: (sale?._id)||undefined }) }catch{}
  res.json({ ok: true });
};

// ===== Eliminar ventas en masa (administrativo) =====
export const deleteSalesBulk = async (req, res) => {
  try {
    const { plate, status, limit = 100, force = false } = req.body || {};
    const originalCompanyId = getSaleCreationCompanyId(req);
    
    if (!originalCompanyId) {
      return res.status(400).json({ error: 'Company ID missing' });
    }
    
    // Construir filtro de búsqueda
    const filter = { companyId: originalCompanyId };
    
    if (plate) {
      filter['vehicle.plate'] = String(plate).trim().toUpperCase();
    }
    
    if (status) {
      filter.status = String(status);
    } else if (!force) {
      // Por defecto, solo eliminar ventas en draft (a menos que force=true)
      filter.status = 'draft';
    }
    
    // Buscar ventas que coincidan
    const sales = await Sale.find(filter)
      .limit(Number(limit) || 100)
      .lean();
    
    if (sales.length === 0) {
      return res.json({ 
        ok: true, 
        deleted: 0, 
        message: 'No se encontraron ventas para eliminar' 
      });
    }
    
    // Eliminar ventas
    const saleIds = sales.map(s => s._id);
    const result = await Sale.deleteMany({ 
      _id: { $in: saleIds },
      companyId: originalCompanyId 
    });
    
    logger.info('[deleteSalesBulk] Ventas eliminadas', {
      companyId: originalCompanyId,
      plate: plate || 'todas',
      status: status || 'draft',
      deleted: result.deletedCount,
      totalFound: sales.length
    });
    
    // Publicar eventos para cada venta eliminada
    for (const sale of sales) {
      try {
        await publish(originalCompanyId, 'sale:cancelled', { id: sale._id?.toString() });
      } catch (e) {
        // Ignorar errores de publicación
      }
    }
    
    res.json({ 
      ok: true, 
      deleted: result.deletedCount,
      found: sales.length,
      message: `Se eliminaron ${result.deletedCount} venta(s)` 
    });
  } catch (err) {
    logger.error('[deleteSalesBulk] Error', { error: err?.message, stack: err?.stack });
    res.status(500).json({ error: err?.message || 'Error al eliminar ventas' });
  }
};

// ===== Completar slot abierto mediante QR =====
export const completeOpenSlot = async (req, res) => {
  const { id } = req.params; // saleId
  const { slotIndex, itemId, sku } = req.body || {};
  
  if (slotIndex === undefined || slotIndex === null) {
    return res.status(400).json({ error: 'slotIndex requerido' });
  }
  
  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: id, companyId: companyFilter });
  if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
  if (!validateSaleOwnership(sale, req)) return res.status(403).json({ error: 'Sale belongs to different company' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'La venta no está abierta' });
  
  if (!sale.openSlots || sale.openSlots.length === 0) {
    return res.status(400).json({ error: 'Esta venta no tiene slots abiertos' });
  }
  
  // Buscar el slot por su slotIndex (índice en el combo), no por el índice del array
  const slot = sale.openSlots.find(s => s.slotIndex === slotIndex);
  if (!slot) {
    return res.status(404).json({ error: `Slot abierto con slotIndex ${slotIndex} no encontrado` });
  }
  
  if (slot.completed) {
    return res.status(400).json({ error: 'Este slot ya está completado' });
  }
  
  // CRÍTICO: Buscar items en ambos companyId si hay base compartida (se comparte TODA la data)
  const itemCompanyFilter = await getItemQueryCompanyFilter(req);
  let item = null;
  if (itemId) {
    item = await Item.findOne({ _id: itemId, companyId: itemCompanyFilter });
  } else if (sku) {
    item = await Item.findOne({ sku: String(sku).trim().toUpperCase(), companyId: itemCompanyFilter });
  }
  
  if (!item) {
    return res.status(404).json({ error: 'Item del inventario no encontrado' });
  }
  
  // Completar el slot
  slot.completed = true;
  slot.completedItemId = item._id;
  
  // IMPORTANTE: Usar el precio del slot (estimatedPrice) en lugar del precio del item
  // El slot abierto tiene un precio estimado que debe respetarse, incluso si es 0
  // Verificar explícitamente si estimatedPrice existe (puede ser 0, que es válido)
  const realPrice = (slot.estimatedPrice !== undefined && slot.estimatedPrice !== null) 
    ? slot.estimatedPrice 
    : (item.salePrice || 0);
  
  // CRÍTICO: Cada slot debe tener su propia línea, incluso si múltiples slots usan el mismo item
  // IMPORTANTE: No buscamos items existentes aquí porque queremos que cada slot tenga su propia línea
  // La verificación `if (slot.completed)` arriba previene que se complete el mismo slot dos veces
  // Si el slot ya fue completado, simplemente agregamos el item (cada slot tiene su propia línea)
  
  // IMPORTANTE: Agregar el item inmediatamente a sale.items para que aparezca en la venta
  // Buscar el combo principal en los items para agregar el producto después de él
  const comboItem = sale.items.find(it => 
    it.source === 'price' && 
    it.refId && 
    String(it.refId) === String(slot.comboPriceId)
  );
  
  if (comboItem) {
    // Encontrar la posición del combo en el array
    const comboIndex = sale.items.indexOf(comboItem);
    
    // Obtener los refIds de los productos del combo para verificar que el item pertenece al combo
    const PriceEntry = mongoose.model('PriceEntry');
    const originalCompanyId = req.originalCompanyId || req.company?.id;
    const effectiveCompanyId = req.companyId;
    
    // Búsqueda robusta en dos pasos (igual que en addItem)
    let comboPE = null;
    if (originalCompanyId) {
      comboPE = await PriceEntry.findOne({ _id: slot.comboPriceId, companyId: originalCompanyId })
        .populate('comboProducts.itemId', '_id')
        .lean();
    }
    if (!comboPE && effectiveCompanyId && originalCompanyId && String(originalCompanyId) !== String(effectiveCompanyId)) {
      comboPE = await PriceEntry.findOne({ _id: slot.comboPriceId, companyId: effectiveCompanyId })
        .populate('comboProducts.itemId', '_id')
        .lean();
    }
    
    const comboProductRefIds = new Set();
    if (comboPE && comboPE.comboProducts) {
      comboPE.comboProducts.forEach(cp => {
        if (cp.itemId && cp.itemId._id) {
          comboProductRefIds.add(String(cp.itemId._id));
        }
      });
    }
    
    // Verificar que el item realmente pertenece al combo (por refId o por ser slot abierto)
    // Si el slot es abierto, cualquier item puede agregarse (no hay restricción de refId)
    const slotInfo = comboPE.comboProducts && comboPE.comboProducts[slot.slotIndex];
    const isOpenSlot = slotInfo && slotInfo.isOpenSlot;
    const itemBelongsToCombo = isOpenSlot || comboProductRefIds.has(String(item._id));
    
    if (itemBelongsToCombo) {
      // Buscar la posición donde termina el combo (después de todos sus items)
      let insertIndex = comboIndex + 1;
      while (insertIndex < sale.items.length) {
        const nextItem = sale.items[insertIndex];
        const nextSku = String(nextItem.sku || '').toUpperCase();
        
        // Si encontramos otro combo, parar
        if (nextSku.startsWith('COMBO-')) {
          break;
        }
        
        // Si encontramos un item que es parte del combo (SKU CP- o refId en comboProductRefIds), continuar
        if (nextSku.startsWith('CP-') || 
            (nextItem.source === 'inventory' && nextItem.refId && comboProductRefIds.has(String(nextItem.refId)))) {
          insertIndex++;
          continue;
        }
        
        // Si encontramos otro combo o un item que no es parte de este combo, parar
        if (nextItem.source === 'price' && nextItem.refId && String(nextItem.refId) !== String(slot.comboPriceId)) {
          break;
        }
        
        // Si encontramos un item de inventario que no tiene SKU CP- y no está relacionado con el combo, parar
        if (nextItem.source === 'inventory' && nextItem.sku && !nextItem.sku.startsWith('CP-')) {
          // Verificar si este item ya está en los slots completados
          const alreadyInSlots = sale.openSlots.some(s => 
            s.completed && s.completedItemId && String(s.completedItemId) === String(nextItem.refId)
          );
          if (!alreadyInSlots) {
            break;
          }
        }
        insertIndex++;
      }
      
      // IMPORTANTE: Siempre usar SKU que empiece con "CP-" para que se identifique como parte del combo
      // Incluso si el item tiene su propio SKU, lo prefijamos con CP- para asegurar que se agrupe correctamente
      const comboItemSku = item.sku && !item.sku.toUpperCase().startsWith('CP-') 
        ? `CP-${item.sku}` 
        : (item.sku || `CP-${String(item._id).slice(-6)}`);
      
      // Agregar el item del slot completado como parte del combo
      sale.items.splice(insertIndex, 0, {
        source: 'inventory',
        refId: item._id,
        sku: comboItemSku,
        name: item.name || slot.slotName,
        qty: slot.qty || 1,
        unitPrice: realPrice,
        total: Math.round((slot.qty || 1) * realPrice)
      });
    } else {
      // Si el item no pertenece al combo, agregar al final
      sale.items.push({
        source: 'inventory',
        refId: item._id,
        sku: item.sku || `SLOT-${String(item._id).slice(-6)}`,
        name: item.name || slot.slotName,
        qty: slot.qty || 1,
        unitPrice: realPrice,
        total: Math.round((slot.qty || 1) * realPrice)
      });
    }
  } else {
    // Si no encontramos el combo (no debería pasar), agregar al final
    sale.items.push({
      source: 'inventory',
      refId: item._id,
      sku: item.sku || `SLOT-${String(item._id).slice(-6)}`,
      name: item.name || slot.slotName,
      qty: slot.qty || 1,
      unitPrice: realPrice,
      total: Math.round((slot.qty || 1) * realPrice)
    });
  }
  
  // Recalcular totales
  computeTotals(sale);
  await sale.save();
  
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
  try{ await publish(sale.companyId, 'sale:updated', { id: (sale?._id)||undefined }) }catch{}
  
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

  const companyFilter = getSaleQueryCompanyFilter(req);
  const sale = await Sale.findOne({ _id: saleId, companyId: companyFilter });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (!validateSaleOwnership(sale, req)) return res.status(403).json({ error: 'Sale belongs to different company' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

  const s = String(payload || '').trim();

  if (s.toUpperCase().startsWith('IT:')) {
    const parts = s.split(':').map(p => p.trim()).filter(Boolean);
    let itemId = null;
    let entryId = null;
    
    // Formato: IT:<companyId>:<itemId>:<sku>[:<entryId>]
    if (parts.length >= 3) {
      itemId = parts[2]; // itemId está en la posición 2
      if (parts.length >= 5) {
        entryId = parts[4]; // entryId está en la posición 4 (opcional)
      }
    } else if (parts.length === 2) {
      itemId = parts[1]; // Formato antiguo sin companyId
    }

    if (itemId) {
      // CRÍTICO: Buscar items en ambos companyId si hay base compartida (se comparte TODA la data)
      const itemCompanyFilter = await getItemQueryCompanyFilter(req);
      const it = await Item.findOne({ _id: itemId, companyId: itemCompanyFilter });
      if (!it) return res.status(404).json({ error: 'Item not found for QR' });

      // Si hay entryId, validar que existe y tiene stock disponible
      if (entryId && mongoose.Types.ObjectId.isValid(entryId)) {
        const stockEntry = await StockEntry.findOne({
          _id: entryId,
          companyId: req.companyId,
          itemId: it._id,
          qty: { $gt: 0 }
        });
        if (!stockEntry) {
          return res.status(404).json({ error: 'StockEntry no encontrado o sin stock disponible' });
        }
        // Guardar entryId en meta para trazabilidad
      }

      const q = 1;
      const up = asNum(it.salePrice);
      const saleItem = {
        source: 'inventory',
        refId: it._id,
        sku: it.sku,
        name: it.name || it.sku,
        qty: q,
        unitPrice: up,
        total: Math.round(q * up)
      };
      
      // Agregar entryId al meta si está presente
      if (entryId) {
        saleItem.meta = { entryId };
      }
      
      sale.items.push(saleItem);
      computeTotals(sale);
      await sale.save();
  await upsertCustomerProfile(req.companyId, { customer: sale.customer, vehicle: sale.vehicle }, { source: 'sale' });
      return res.json(sale.toObject());
    }
  }

  // Fallback: tratar como SKU
  // CRÍTICO: Buscar items en ambos companyId si hay base compartida (se comparte TODA la data)
  const itemCompanyFilter = await getItemQueryCompanyFilter(req);
  const it = await Item.findOne({ sku: s.toUpperCase(), companyId: itemCompanyFilter });
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
  const { status, from, to, plate, companyAccountId, page = 1, limit = 50 } = req.query || {};
  const originalCompanyId = req.originalCompanyId || req.companyId || req.company?.id;
  const effectiveCompanyId = req.companyId;
  const hasSharedDatabase = req.hasSharedDatabase;
  
  // Determinar qué companyIds incluir en el filtro
  let companyIdsToSearch = [originalCompanyId];
  
  // Siempre verificar si hay empresas que comparten la BD (tanto si es principal como secundaria)
  if (originalCompanyId) {
    try {
      const Company = (await import('../models/Company.js')).default;
      const companyDoc = await Company.findById(originalCompanyId).select('sharedDatabaseConfig').lean();
      
      if (companyDoc?.sharedDatabaseConfig?.sharedWith && companyDoc.sharedDatabaseConfig.sharedWith.length > 0) {
        // Esta empresa es principal, incluir todas las empresas secundarias
        companyIdsToSearch = [
          originalCompanyId, // La empresa principal
          ...companyDoc.sharedDatabaseConfig.sharedWith.map(sw => String(sw.companyId)) // Empresas secundarias
        ];
      } else if (companyDoc?.sharedDatabaseConfig?.sharedFrom?.companyId) {
        // Esta empresa es secundaria, incluir la principal y otras secundarias
        const mainCompanyId = String(companyDoc.sharedDatabaseConfig.sharedFrom.companyId);
        const mainCompany = await Company.findById(mainCompanyId).select('sharedDatabaseConfig').lean();
        
        companyIdsToSearch = [mainCompanyId]; // La empresa principal
        if (mainCompany?.sharedDatabaseConfig?.sharedWith) {
          // Agregar todas las empresas secundarias (incluyendo esta)
          mainCompany.sharedDatabaseConfig.sharedWith.forEach(sw => {
            companyIdsToSearch.push(String(sw.companyId));
          });
        }
        // Asegurar que la empresa actual también esté incluida
        if (!companyIdsToSearch.includes(String(originalCompanyId))) {
          companyIdsToSearch.push(String(originalCompanyId));
        }
      }
    } catch (err) {
      console.error('[listSales] Error obteniendo empresas compartidas:', err);
      // En caso de error, usar solo originalCompanyId
      companyIdsToSearch = [originalCompanyId];
    }
  }
  
  // Crear el filtro de companyId
  const q = companyIdsToSearch.length === 1 
    ? { companyId: companyIdsToSearch[0] }
    : { companyId: { $in: companyIdsToSearch } };
  if (status) q.status = String(status);
  // Filtrar por placa si se proporciona
  if (plate) {
    const plateUpper = String(plate).trim().toUpperCase();
    q['vehicle.plate'] = plateUpper;
  }
  // Filtrar por empresa si se proporciona
  if (companyAccountId) {
    q.companyAccountId = new mongoose.Types.ObjectId(companyAccountId);
  }
  if (from || to) {
    // Usar closedAt si está disponible, sino createdAt
    // Para ventas cerradas, es más preciso usar closedAt
    const dateRange = createDateRange(from, to);
    const fromDate = dateRange.from;
    const toDate = dateRange.to;
    
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
    const dateRange = createDateRange(from, to);
    q.createdAt = {};
    if (dateRange.from) q.createdAt.$gte = dateRange.from;
    if (dateRange.to) q.createdAt.$lte = dateRange.to;
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
      const dateRange = createDateRange(from, to);
      const gte = dateRange.from;
      const lte = dateRange.to;
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
      const originalCompanyId = req.originalCompanyId || req.companyId || req.company?.id;
      const quick = await Sale.find({ companyId: originalCompanyId, status:'closed', laborShare: { $gt: 0 } })
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
    logger.error('technicianReport error', { error: err?.message, stack: err?.stack });
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
    const dateRange = createDateRange(from, to);
    const fromDate = dateRange.from;
    const toDate = dateRange.to;
    
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



