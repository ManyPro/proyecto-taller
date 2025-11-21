import PriceEntry from '../models/PriceEntry.js';
import Service from '../models/Service.js';
import Vehicle from '../models/Vehicle.js';
import Item from '../models/Item.js';
import Company from '../models/Company.js';
import xlsx from 'xlsx'; // 0.18.x
import { logger } from '../lib/logger.js';
import { getAllSharedCompanyIds } from '../lib/sharedDatabase.js';

// ============ helpers ============
function cleanStr(v) {
  return String(v ?? '').trim().toUpperCase();
}
function num(v) {
  if (v === '' || v == null) return 0;
  const s = String(v).replace(/\s+/g,'').replace(/\$/g,'').replace(/\./g,'').replace(/,/g,'.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function safeEval(expr, vars = {}) {
  const cleaned = String(expr || '').trim().toUpperCase();
  if (!cleaned) return 0;
  if (!/^[\d+\-*/().\sA-Z0-9_]+$/.test(cleaned)) return 0;
  const replaced = cleaned.replace(/[A-Z_][A-Z0-9_]*/g, (k) => {
    const v = Number(vars[k] ?? 0);
    return Number.isFinite(v) ? String(v) : '0';
  });
  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${replaced});`)();
  } catch {
    return 0;
  }
}
async function getService(companyId, serviceId) {
  if (!serviceId) return null;
  return await Service.findOne({ _id: serviceId, companyId }).lean();
}
function computeTotal(service, variables = {}) {
  const map = {};
  for (const [k, v] of Object.entries(variables || {})) {
    map[String(k).toUpperCase()] = num(v);
  }
  const formula = (service?.formula || '').toUpperCase();
  return safeEval(formula, map);
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

// Helper para procesar productos de combo (evita duplicación)
async function processComboProducts(comboProducts, req) {
  if (!Array.isArray(comboProducts) || comboProducts.length === 0) {
    return { error: 'Un combo debe incluir al menos un producto', products: null };
  }
  
  // CRÍTICO: Obtener filtro de companyId para buscar items
  const itemCompanyFilter = await getItemQueryCompanyFilter(req);
  
  const processed = [];
  for (let idx = 0; idx < comboProducts.length; idx++) {
    const cp = comboProducts[idx];
    if (!cp.name || !cp.name.trim()) {
      return { error: 'Todos los productos del combo deben tener nombre', products: null };
    }
    
    const isOpenSlot = Boolean(cp.isOpenSlot);
    const comboProduct = {
      name: String(cp.name).trim(),
      qty: Math.max(1, num(cp.qty || 1)),
      unitPrice: Math.max(0, num(cp.unitPrice || 0)),
      itemId: null,
      isOpenSlot: isOpenSlot
    };
    
    // Si es slot abierto, no debe tener itemId
    if (isOpenSlot && cp.itemId) {
      return { error: `El slot abierto "${comboProduct.name}" no puede tener itemId asignado. Se asignará al crear la venta mediante QR.`, products: null };
    }
    
    // Si tiene itemId y NO es slot abierto, validar que existe
    if (!isOpenSlot && cp.itemId) {
      const comboItem = await Item.findOne({ _id: cp.itemId, companyId: itemCompanyFilter });
      if (!comboItem) {
        return { error: `Item del inventario no encontrado para producto: ${comboProduct.name}`, products: null };
      }
      comboProduct.itemId = comboItem._id;
    }
    
    processed.push(comboProduct);
  }
  
  return { error: null, products: processed };
}

// ============ list ============
export const listPrices = async (req, res) => {
  const { serviceId, vehicleId, type, brand, line, engine, year, name, page = 1, limit = 10, vehicleYear, includeGeneral = true } = req.query || {};
  
  // Determinar companyIds a buscar (considerando BD compartida)
  const originalCompanyId = req.originalCompanyId || req.companyId || req.company?.id;
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
        // Esta empresa es secundaria, incluir la empresa principal
        companyIdsToSearch = [
          originalCompanyId, // La empresa secundaria
          String(companyDoc.sharedDatabaseConfig.sharedFrom.companyId) // La empresa principal
        ];
      }
    } catch (err) {
      // Si hay error, usar solo originalCompanyId
      console.error('Error verificando BD compartida en listPrices:', err);
    }
  }
  
  // Construir query con companyIds (si hay más de uno, usar $in)
  const q = companyIdsToSearch.length > 1 
    ? { companyId: { $in: companyIdsToSearch } }
    : { companyId: companyIdsToSearch[0] };
  
  // Nuevo modelo: vehicleId es prioritario
  // Si se proporciona vehicleId, buscar precios de ese vehículo Y precios generales (vehicleId: null)
  if (vehicleId) {
    if (includeGeneral === 'true' || includeGeneral === true) {
      // Incluir precios del vehículo específico Y precios generales
      q.$or = [
        { vehicleId: vehicleId },
        { vehicleId: null }
      ];
    } else {
      // Solo precios del vehículo específico
      q.vehicleId = vehicleId;
    }
  } else {
    // Si no se proporciona vehicleId, buscar solo precios generales por defecto
    // Pero permitir buscar todos si se especifica includeGeneral=false
    if (includeGeneral === 'false' || includeGeneral === false) {
      // Buscar todos los precios (sin filtro de vehicleId)
      // No agregar condición de vehicleId
    } else {
      // Por defecto, buscar solo precios generales cuando no hay vehicleId
      q.vehicleId = null;
    }
    
    // Filtros legacy (mantener compatibilidad)
    if (serviceId) q.serviceId = serviceId;
    if (brand) q.brand = cleanStr(brand);
    if (line) q.line = cleanStr(line);
    if (engine) q.engine = cleanStr(engine);
    if (year) q.year = Number(year);
  }
  
  // Filtrar por tipo si se proporciona
  if (type) q.type = type;
  
  // Filtrar por nombre (búsqueda parcial)
  if (name && name.trim()) {
    q.name = { $regex: cleanStr(name), $options: 'i' };
  }

  const pg = Math.max(1, parseInt(page, 10));
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pg - 1) * lim;

  // Filtrar por año del vehículo en la consulta MongoDB (más eficiente)
  // Solo aplicar si vehicleYear está definido y es válido
  if (vehicleYear !== undefined && vehicleYear !== null && vehicleYear !== '') {
    const vehicleYearNum = Number(vehicleYear);
    if (!isNaN(vehicleYearNum)) {
      // Agregar condición: precio sin restricción de año O año del vehículo dentro del rango
      // Usar $and para combinar con condiciones existentes
      const yearCondition = {
        $or: [
          { yearFrom: null, yearTo: null }, // Sin restricción de año
          { 
            $and: [
              { $or: [{ yearFrom: null }, { yearFrom: { $lte: vehicleYearNum } }] },
              { $or: [{ yearTo: null }, { yearTo: { $gte: vehicleYearNum } }] }
            ]
          }
        ]
      };
      
      // Combinar todas las condiciones con $and
      const baseQuery = { ...q };
      q.$and = [
        baseQuery,
        yearCondition
      ];
      // Limpiar propiedades duplicadas (mantener solo $and)
      Object.keys(baseQuery).forEach(key => {
        delete q[key];
      });
    }
  }

  // Contar total antes de paginar (necesario para paginación correcta)
  const total = await PriceEntry.countDocuments(q);
  
  // Obtener items paginados con populate
  const items = await PriceEntry.find(q)
    .populate('vehicleId', 'make line displacement modelYear')
    .populate('itemId', 'sku name stock salePrice')
    .populate('comboProducts.itemId', 'sku name stock salePrice')
    .sort({ type: 1, name: 1, createdAt: -1 })
    .skip(skip)
    .limit(lim)
    .lean();
  
  res.json({ items, page: pg, limit: lim, total, pages: Math.ceil(total / lim) });
};

// ============ get single price ============
export const getPrice = async (req, res) => {
  const { id } = req.params;
  
  // Determinar companyIds a buscar (considerando BD compartida)
  // Usar la función helper compartida para asegurar consistencia
  const originalCompanyId = req.originalCompanyId || req.companyId || req.company?.id;
  const companyIdsToSearch = await getAllSharedCompanyIds(originalCompanyId);
  
  // Construir query con companyIds
  // CRÍTICO: Siempre usar $in para asegurar que funcione correctamente con ObjectIds
  // Convertir todos los IDs a ObjectIds de mongoose para la búsqueda
  const mongoose = (await import('mongoose')).default;
  const companyFilter = companyIdsToSearch.length > 1 
    ? { $in: companyIdsToSearch.map(id => new mongoose.Types.ObjectId(id)) }
    : new mongoose.Types.ObjectId(companyIdsToSearch[0]);
  
  const price = await PriceEntry.findOne({ _id: id, companyId: companyFilter })
    .populate('vehicleId', 'make line displacement modelYear')
    .populate('itemId', 'sku name stock salePrice')
    .populate('comboProducts.itemId', 'sku name stock salePrice')
    .lean();
  
  if (!price) {
    // Verificar si existe en alguna empresa (para debugging y diagnóstico)
    const priceAnyCompany = await PriceEntry.findOne({ _id: id }).lean();
    if (priceAnyCompany) {
      const priceCompanyId = priceAnyCompany.companyId?.toString();
      const origId = originalCompanyId?.toString();
      
      // Si el precio existe pero no está en las empresas compartidas, es un problema de configuración
      logger.error('[getPrice] Precio encontrado pero no está en empresas compartidas - PROBLEMA DE CONFIGURACIÓN sharedDB', {
        priceId: id,
        priceCompanyId: priceCompanyId,
        originalCompanyId: origId,
        companyIdsToSearch: companyIdsToSearch.map(String),
        message: 'El precio existe pero no está accesible. Verificar configuración de sharedDatabaseConfig.'
      });
      
      // En lugar de devolver 403, intentar buscar si hay alguna relación de sharedDB que no se detectó
      // Esto puede pasar si la configuración cambió después de crear el precio
      // Por ahora, devolver 403 pero con mensaje más descriptivo
      return res.status(403).json({ 
        error: 'PriceEntry belongs to different company',
        message: 'El precio existe pero no está accesible desde la empresa actual. Verificar configuración de sharedDatabaseConfig.',
        priceCompanyId: priceCompanyId,
        originalCompanyId: origId
      });
    } else {
      // El precio realmente no existe
      logger.warn('[getPrice] Precio no encontrado en ninguna empresa', {
        priceId: id,
        isValidObjectId: /^[0-9a-fA-F]{24}$/.test(id),
        originalCompanyId: originalCompanyId?.toString(),
        companyIdsToSearch: companyIdsToSearch.map(String)
      });
      return res.status(404).json({ error: 'PriceEntry not found' });
    }
  }
  
  res.json(price);
};

// ============ create ============
export const createPrice = async (req, res) => {
  const { vehicleId, name, type = 'service', serviceId, variables = {}, total: totalRaw, itemId, comboProducts = [], yearFrom, yearTo, laborValue, laborKind, isGeneral = false } = req.body || {};
  
  // name es siempre requerido
  if (!name || !name.trim()) return res.status(400).json({ error: 'name requerido' });
  
  // Para precios de inversión, vehicleId debe ser null (siempre generales)
  const isInversion = type === 'inversion';
  if (isInversion && vehicleId) {
    return res.status(400).json({ error: 'Los precios de inversión no pueden estar vinculados a un vehículo' });
  }
  
  // vehicleId es opcional: si isGeneral es true, isInversion es true, o vehicleId es null/undefined, crear precio general
  let vehicle = null;
  if (vehicleId && !isGeneral && !isInversion) {
    vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehículo no encontrado' });
    if (!vehicle.active) return res.status(400).json({ error: 'Vehículo inactivo' });
  }

  // Si hay serviceId, validar servicio (opcional)
  let svc = null;
  if (serviceId) {
    svc = await getService(req.companyId, serviceId);
    if (!svc) return res.status(404).json({ error: 'Servicio no encontrado' });
  }

  // Si es producto y tiene itemId, validar item del inventario
  // CRÍTICO: Buscar items en ambos companyId si hay base compartida (se comparte TODA la data)
  let item = null;
  if (type === 'product' && itemId) {
    const itemCompanyFilter = await getItemQueryCompanyFilter(req);
    item = await Item.findOne({ _id: itemId, companyId: itemCompanyFilter });
    if (!item) return res.status(404).json({ error: 'Item del inventario no encontrado' });
  }

  // Si es combo, validar y procesar productos del combo
  let processedComboProducts = [];
  if (type === 'combo') {
    const result = await processComboProducts(comboProducts, req);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    processedComboProducts = result.products;
  }

  // Calcular total: si hay servicio con fórmula, usarla; si no, usar el total proporcionado
  let total = 0;
  if (svc && Object.keys(variables || {}).length > 0) {
    total = computeTotal(svc, variables);
  } else if (totalRaw !== undefined) {
    total = num(totalRaw);
  } else if (item && totalRaw === undefined) {
    // Si es producto vinculado y no se proporciona precio, usar precio de venta del item
    total = num(item.salePrice || 0);
  } else if (type === 'combo' && totalRaw === undefined) {
    // Si es combo y no se proporciona precio, calcular suma de productos
    total = processedComboProducts.reduce((sum, cp) => sum + (cp.unitPrice * cp.qty), 0);
  }

  // Validar rango de años si se proporciona
  let yearFromNum = null;
  let yearToNum = null;
  if (yearFrom !== undefined && yearFrom !== null && yearFrom !== '') {
    yearFromNum = Number(yearFrom);
    if (isNaN(yearFromNum) || yearFromNum < 1900 || yearFromNum > 2100) {
      return res.status(400).json({ error: 'yearFrom debe ser un año válido entre 1900 y 2100' });
    }
  }
  if (yearTo !== undefined && yearTo !== null && yearTo !== '') {
    yearToNum = Number(yearTo);
    if (isNaN(yearToNum) || yearToNum < 1900 || yearToNum > 2100) {
      return res.status(400).json({ error: 'yearTo debe ser un año válido entre 1900 y 2100' });
    }
  }
  if (yearFromNum !== null && yearToNum !== null && yearFromNum > yearToNum) {
    return res.status(400).json({ error: 'yearFrom no puede ser mayor que yearTo' });
  }

  // CRÍTICO: Los precios SIEMPRE se crean con el originalCompanyId (empresa logueada),
  // no con el effectiveCompanyId (empresa compartida). Esto asegura que el precio
  // pertenece a la empresa que lo crea, aunque comparta la base de datos con otra.
  const creationCompanyId = req.originalCompanyId || req.companyId || req.company?.id;
  
  if (!creationCompanyId) {
    return res.status(400).json({ error: 'Company ID missing' });
  }
  
  const doc = {
    companyId: creationCompanyId,
    vehicleId: (isInversion || isGeneral) ? null : (vehicle?._id || null), // null para precios generales e inversión
    name: String(name).trim(),
    type: isInversion ? 'inversion' : (type === 'combo' ? 'combo' : (type === 'product' ? 'product' : 'service')),
    serviceId: isInversion ? null : (svc?._id || null),
    itemId: (isInversion || type !== 'product') ? null : ((item) ? item._id : null),
    comboProducts: (isInversion || type !== 'combo') ? [] : processedComboProducts,
    yearFrom: yearFromNum,
    yearTo: yearToNum,
    brand: (isInversion || isGeneral) ? '' : (vehicle?.make || ''),
    line: (isInversion || isGeneral) ? '' : (vehicle?.line || ''),
    engine: (isInversion || isGeneral) ? '' : (vehicle?.displacement || ''),
    year: null,
    variables: isInversion ? {} : (variables || {}),
    total,
    laborValue: (isInversion || laborValue === undefined || laborValue === null || laborValue === '') ? 0 : Math.max(0, num(laborValue)),
    laborKind: (isInversion || laborKind === undefined || laborKind === null || laborKind === '') ? '' : String(laborKind).trim()
  };
  
  try {
    const created = await PriceEntry.create(doc);
      const populated = await PriceEntry.findById(created._id)
        .populate('vehicleId', 'make line displacement modelYear')
        .populate('itemId', 'sku name stock salePrice')
        .populate('comboProducts.itemId', 'sku name stock salePrice')
        .lean();
    res.json(populated);
  } catch (e) {
    // Si ya existe por índice único, intenta actualizar
    if (e?.code === 11000) {
      const filter = {
        companyId: creationCompanyId,
        vehicleId: vehicle?._id || null,
        name: doc.name,
        type: doc.type
      };
      const up = await PriceEntry.findOneAndUpdate(
        filter, 
        { ...doc, variables, total }, 
        { new: true, upsert: true }
      );
      const populated = await PriceEntry.findById(up._id)
        .populate('vehicleId', 'make line displacement modelYear')
        .populate('itemId', 'sku name stock salePrice')
        .populate('comboProducts.itemId', 'sku name stock salePrice')
        .lean();
      return res.json(populated);
    }
    throw e;
  }
};

// ============ update ============
export const updatePrice = async (req, res) => {
  const id = req.params.id;
  const { name, type, variables = {}, total: totalRaw, serviceId, itemId, comboProducts, yearFrom, yearTo, laborValue, laborKind } = req.body || {};
  const row = await PriceEntry.findOne({ _id: id, companyId: req.companyId });
  if (!row) return res.status(404).json({ error: 'No encontrado' });

  // Actualizar nombre y tipo si se proporcionan
  if (name !== undefined && name !== null) row.name = String(name).trim();
  if (type !== undefined && type !== null) {
    const newType = type === 'inversion' ? 'inversion' : (type === 'combo' ? 'combo' : (type === 'product' ? 'product' : 'service'));
    row.type = newType;
    
    // Limpiar campos según el tipo
    if (newType === 'inversion') {
      // Para inversión, limpiar todos los campos relacionados
      row.vehicleId = null;
      row.serviceId = null;
      row.itemId = null;
      row.comboProducts = [];
      row.variables = {};
      row.laborValue = 0;
      row.laborKind = '';
      row.brand = '';
      row.line = '';
      row.engine = '';
    } else {
      if (newType !== 'product') row.itemId = null;
      if (newType !== 'combo') row.comboProducts = [];
    }
  }
  
  // Para precios de inversión, no permitir actualizar serviceId, itemId ni comboProducts
  const isInversion = row.type === 'inversion';
  
  // Actualizar serviceId si se proporciona (solo si no es inversión)
  if (serviceId !== undefined && !isInversion) {
    if (serviceId === null || serviceId === '') {
      row.serviceId = null;
    } else {
      const svc = await getService(req.companyId, serviceId);
      if (!svc) return res.status(404).json({ error: 'Servicio no encontrado' });
      row.serviceId = svc._id;
    }
  }
  
  // Actualizar itemId si se proporciona (solo para productos, no para inversión)
  if (itemId !== undefined && row.type === 'product' && !isInversion) {
    if (itemId === null || itemId === '') {
      row.itemId = null;
    } else {
      // CRÍTICO: Buscar items en ambos companyId si hay base compartida (se comparte TODA la data)
      const itemCompanyFilter = await getItemQueryCompanyFilter(req);
      const item = await Item.findOne({ _id: itemId, companyId: itemCompanyFilter });
      if (!item) return res.status(404).json({ error: 'Item del inventario no encontrado' });
      row.itemId = item._id;
    }
  }
  
  // Actualizar comboProducts si se proporciona (solo para combos, no para inversión)
  if (comboProducts !== undefined && row.type === 'combo' && !isInversion) {
    const result = await processComboProducts(comboProducts, req);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    row.comboProducts = result.products;
    
    // Si no se proporciona total, recalcular desde productos
    if (totalRaw === undefined) {
      row.total = result.products.reduce((sum, cp) => sum + (cp.unitPrice * cp.qty), 0);
    }
  }

  // Calcular total
  let total = 0;
  if (row.serviceId) {
    const svc = await getService(req.companyId, row.serviceId);
    if (svc && Object.keys(variables || {}).length > 0) {
      total = computeTotal(svc, variables);
    } else if (totalRaw !== undefined) {
      total = num(totalRaw);
    } else {
      total = row.total || 0;
    }
  } else if (totalRaw !== undefined) {
    total = num(totalRaw);
  } else {
    total = row.total || 0;
  }

  // Actualizar rango de años si se proporciona
  if (yearFrom !== undefined) {
    if (yearFrom === null || yearFrom === '') {
      row.yearFrom = null;
    } else {
      const yearFromNum = Number(yearFrom);
      if (isNaN(yearFromNum) || yearFromNum < 1900 || yearFromNum > 2100) {
        return res.status(400).json({ error: 'yearFrom debe ser un año válido entre 1900 y 2100' });
      }
      row.yearFrom = yearFromNum;
    }
  }
  if (yearTo !== undefined) {
    if (yearTo === null || yearTo === '') {
      row.yearTo = null;
    } else {
      const yearToNum = Number(yearTo);
      if (isNaN(yearToNum) || yearToNum < 1900 || yearToNum > 2100) {
        return res.status(400).json({ error: 'yearTo debe ser un año válido entre 1900 y 2100' });
      }
      row.yearTo = yearToNum;
    }
  }
  // Validar que yearFrom no sea mayor que yearTo
  if (row.yearFrom !== null && row.yearTo !== null && row.yearFrom > row.yearTo) {
    return res.status(400).json({ error: 'yearFrom no puede ser mayor que yearTo' });
  }

  // Actualizar campos de mano de obra si se proporcionan
  if (laborValue !== undefined) {
    row.laborValue = (laborValue !== null && laborValue !== '') ? Math.max(0, num(laborValue)) : 0;
  }
  if (laborKind !== undefined) {
    row.laborKind = (laborKind !== null && laborKind !== '') ? String(laborKind).trim() : '';
  }

  row.variables = variables || row.variables;
  row.total = total;

  await row.save();
  const populated = await PriceEntry.findById(row._id)
    .populate('vehicleId', 'make line displacement modelYear')
    .populate('itemId', 'sku name stock salePrice')
    .populate('comboProducts.itemId', 'sku name stock salePrice')
    .lean();
  res.json(populated);
};

// ============ delete (single) ============
export const deletePrice = async (req, res) => {
  const id = req.params.id;
  const del = await PriceEntry.deleteOne({ _id: id, companyId: req.companyId });
  res.json({ deleted: del?.deletedCount || 0 });
};

// ============ delete ALL by service (nuevo, eficiente) ============
export const deleteAllPrices = async (req, res) => {
  const { serviceId } = req.query || {};
  if (!serviceId) return res.status(400).json({ error: 'serviceId requerido' });
  const del = await PriceEntry.deleteMany({ companyId: req.companyId, serviceId });
  res.json({ deleted: del?.deletedCount || 0 });
};

// ============ download import template ============
export const downloadImportTemplate = async (req, res) => {
  const { vehicleId } = req.query || {};
  if (!vehicleId) return res.status(400).json({ error: 'vehicleId requerido' });
  
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) return res.status(404).json({ error: 'Vehículo no encontrado' });
  
  const headers = ['Nombre', 'Tipo', 'Precio'];
  const exampleRow = ['Cambio de aceite', 'SERVICIO', '50000'];
  
  const wsData = [headers, exampleRow];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, 'PRECIOS');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="plantilla-precios-${vehicle.make}-${vehicle.line}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

// ============ import XLSX ============
export const importPrices = async (req, res) => {
  const { vehicleId, mode = 'upsert' } = req.body || {};
  if (!vehicleId) return res.status(400).json({ error: 'vehicleId es requerido' });
  if (!req.file?.buffer) return res.status(400).json({ error: 'Archivo .xlsx requerido en campo "file"' });

  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) return res.status(404).json({ error: 'Vehículo no encontrado' });
  if (!vehicle.active) return res.status(400).json({ error: 'Vehículo inactivo' });

  // Leer primera hoja
  let rows = [];
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  } catch {
    return res.status(400).json({ error: 'XLSX inválido' });
  }

  if (mode === 'overwrite') {
    await PriceEntry.deleteMany({ companyId: req.companyId, vehicleId });
  }

  let inserted = 0, updated = 0, errors = [];
  
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const row = Object.fromEntries(Object.entries(raw).map(([k,v]) => [String(k).toLowerCase().trim(), v]));
    
    const name = String(row.nombre || row.name || '').trim();
    const typeRaw = String(row.tipo || row.type || 'service').trim().toUpperCase();
    const type = typeRaw === 'PRODUCTO' || typeRaw === 'PRODUCT' ? 'product' : 'service';
    const priceRaw = row.precio || row.price || row.total || 0;
    const total = num(priceRaw);
    
    if (!name) {
      errors.push({ row: i + 2, error: 'Nombre requerido' });
      continue;
    }
    
    if (total <= 0) {
      errors.push({ row: i + 2, error: 'Precio debe ser mayor a 0' });
      continue;
    }
    
    try {
      const filter = {
        companyId: req.companyId,
        vehicleId: vehicle._id,
        name: name,
        type: type
      };
      
      const doc = {
        ...filter,
        brand: vehicle.make,
        line: vehicle.line,
        engine: vehicle.displacement,
        year: null,
        variables: {},
        total
      };
      
      const resUp = await PriceEntry.findOneAndUpdate(
        filter, 
        doc, 
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      if (resUp.createdAt && (resUp.createdAt.getTime() === resUp.updatedAt.getTime())) inserted++; 
      else updated++;
    } catch (e) {
      errors.push({ row: i + 2, error: e.message || 'Error desconocido' });
    }
  }

  res.json({ inserted, updated, errors });
};

// ============ export Excel ============
export const exportPrices = async (req, res) => {
  const { vehicleId } = req.query || {};
  if (!vehicleId) return res.status(400).json({ error: 'vehicleId requerido' });
  
  const q = { companyId: req.companyId, vehicleId };
  const items = await PriceEntry.find(q)
    .populate('vehicleId', 'make line displacement')
    .sort({ type: 1, name: 1 })
    .lean();

  const headers = ['Nombre', 'Tipo', 'Precio'];
  const wsData = [headers];
  
  for (const it of items) {
    wsData.push([
      it.name || '',
      it.type === 'product' ? 'PRODUCTO' : 'SERVICIO',
      it.total || 0
    ]);
  }
  
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, 'PRECIOS');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  
  const vehicle = items[0]?.vehicleId || {};
  const filename = `precios-${vehicle.make || ''}-${vehicle.line || ''}-${new Date().toISOString().split('T')[0]}.xlsx`.replace(/\s+/g, '-');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};
