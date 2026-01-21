import PriceEntry from '../models/PriceEntry.js';
import PriceHistory from '../models/PriceHistory.js';
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
  const { serviceId, vehicleId, type, brand, line, engine, year, name, page = 1, limit = 10, vehicleYear, includeGeneral = true, isGeneral } = req.query || {};
  
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
      // Incluir precios del vehículo específico Y precios generales (pero NO de inversión)
      q.$or = [
        { vehicleId: vehicleId },
        { vehicleId: null, type: { $ne: 'inversion' } }
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
      // Si isGeneral es true, excluir precios de inversión
      q.vehicleId = null;
      if (isGeneral === 'true' || isGeneral === true) {
        q.type = { $ne: 'inversion' };
      }
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
  const sort = (vehicleId && (includeGeneral === 'true' || includeGeneral === true))
    ? { vehicleId: -1, type: 1, name: 1, createdAt: -1 }
    : { type: 1, name: 1, createdAt: -1 };

  const items = await PriceEntry.find(q)
    .populate('vehicleId', 'make line displacement modelYear')
    .populate('itemId', 'sku name stock salePrice')
    .populate('comboProducts.itemId', 'sku name stock salePrice')
    .sort(sort)
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
  const effectiveCompanyId = req.companyId;
  
  // Logging detallado para diagnóstico
  logger.info('[getPrice] Iniciando búsqueda', {
    priceId: id,
    originalCompanyId: originalCompanyId?.toString(),
    effectiveCompanyId: effectiveCompanyId?.toString(),
    reqCompanyId: req.company?.id?.toString(),
    hasOriginalCompanyId: !!req.originalCompanyId,
    hasEffectiveCompanyId: !!req.companyId
  });
  
  const companyIdsToSearch = await getAllSharedCompanyIds(originalCompanyId);
  
  logger.info('[getPrice] CompanyIds a buscar', {
    priceId: id,
    originalCompanyId: originalCompanyId?.toString(),
    companyIdsToSearch: companyIdsToSearch.map(String),
    companyIdsCount: companyIdsToSearch.length
  });
  
  // Validar que tenemos companyIds para buscar
  if (!companyIdsToSearch || companyIdsToSearch.length === 0) {
    logger.error('[getPrice] No hay companyIds para buscar', {
      priceId: id,
      originalCompanyId: originalCompanyId?.toString()
    });
    return res.status(404).json({ error: 'PriceEntry not found' });
  }
  
  // Construir query con companyIds
  // CRÍTICO: Siempre usar $in para asegurar que funcione correctamente con ObjectIds
  // Convertir todos los IDs a ObjectIds de mongoose para la búsqueda
  const mongoose = (await import('mongoose')).default;
  
  // Normalizar todos los IDs a ObjectIds
  const companyIdsAsObjectIds = companyIdsToSearch.map(id => {
    try {
      // Si ya es un ObjectId, retornarlo directamente
      if (id instanceof mongoose.Types.ObjectId) {
        return id;
      }
      return new mongoose.Types.ObjectId(id);
    } catch (err) {
      logger.warn('[getPrice] Error convirtiendo companyId a ObjectId', { id, error: err?.message });
      return null;
    }
  }).filter(Boolean);
  
  if (companyIdsAsObjectIds.length === 0) {
    logger.error('[getPrice] No hay companyIds válidos después de conversión', {
      priceId: id,
      companyIdsToSearch: companyIdsToSearch.map(String)
    });
    return res.status(404).json({ error: 'PriceEntry not found' });
  }
  
  // CRÍTICO: Siempre usar $in para consistencia, incluso con un solo elemento
  // Esto asegura que la búsqueda funcione correctamente
  const companyFilter = { $in: companyIdsAsObjectIds };
  
  logger.debug('[getPrice] Buscando precio con filtro', {
    priceId: id,
    companyFilter: companyFilter,
    companyIdsCount: companyIdsAsObjectIds.length,
    companyIds: companyIdsAsObjectIds.map(id => id.toString())
  });
  
  // Intentar buscar el precio
  let price = await PriceEntry.findOne({ _id: id, companyId: companyFilter })
    .populate('vehicleId', 'make line displacement modelYear')
    .populate('itemId', 'sku name stock salePrice')
    .populate('comboProducts.itemId', 'sku name stock salePrice')
    .lean();
  
  // Si no se encontró, verificar si existe en alguna empresa (para debugging y diagnóstico)
  if (!price) {
    logger.warn('[getPrice] Precio no encontrado con filtro, buscando sin filtro', {
      priceId: id,
      companyFilter: companyFilter,
      companyIdsToSearch: companyIdsToSearch.map(String)
    });
    
    const priceAnyCompany = await PriceEntry.findOne({ _id: id }).lean();
    if (priceAnyCompany) {
      const priceCompanyId = priceAnyCompany.companyId?.toString();
      const origId = originalCompanyId?.toString();
      const companyIdsStr = companyIdsToSearch.map(String);
      const companyIdsObjectIdsStr = companyIdsAsObjectIds.map(id => id.toString());
      
      // Verificar si el companyId del precio está en la lista de companyIds buscados (comparar como strings)
      const isInSearchList = companyIdsStr.includes(priceCompanyId) || companyIdsObjectIdsStr.includes(priceCompanyId);
      
      logger.error('[getPrice] Precio encontrado pero no está en empresas compartidas', {
        priceId: id,
        priceCompanyId: priceCompanyId,
        originalCompanyId: origId,
        effectiveCompanyId: effectiveCompanyId?.toString(),
        companyIdsToSearch: companyIdsStr,
        companyIdsAsObjectIds: companyIdsObjectIdsStr,
        isInSearchList: isInSearchList,
        priceCompanyIdInList: companyIdsStr.includes(priceCompanyId),
        priceCompanyIdInObjectIdsList: companyIdsObjectIdsStr.includes(priceCompanyId),
        message: isInSearchList 
          ? 'El precio está en la lista pero no se encontró (posible problema de conversión ObjectId)'
          : 'El precio existe pero no está accesible. Verificar configuración de sharedDatabaseConfig.'
      });
      
      // Si el precio está en la lista pero no se encontró, podría ser un problema de conversión
      // Intentar buscar directamente con el companyId del precio (como ObjectId y como string)
      if (isInSearchList) {
        try {
          // Intentar con ObjectId
          price = await PriceEntry.findOne({ 
            _id: id, 
            companyId: new mongoose.Types.ObjectId(priceCompanyId) 
          })
            .populate('vehicleId', 'make line displacement modelYear')
            .populate('itemId', 'sku name stock salePrice')
            .populate('comboProducts.itemId', 'sku name stock salePrice')
            .lean();
          
          if (price) {
            logger.info('[getPrice] Precio encontrado con búsqueda directa por companyId (ObjectId)', {
              priceId: id,
              priceCompanyId: priceCompanyId
            });
            return res.json(price);
          }
          
          // Intentar con string (por si acaso)
          price = await PriceEntry.findOne({ 
            _id: id, 
            companyId: priceCompanyId 
          })
            .populate('vehicleId', 'make line displacement modelYear')
            .populate('itemId', 'sku name stock salePrice')
            .populate('comboProducts.itemId', 'sku name stock salePrice')
            .lean();
          
          if (price) {
            logger.info('[getPrice] Precio encontrado con búsqueda directa por companyId (string)', {
              priceId: id,
              priceCompanyId: priceCompanyId
            });
            return res.json(price);
          }
        } catch (err) {
          logger.error('[getPrice] Error en búsqueda directa', { error: err?.message, stack: err?.stack });
        }
      }
      
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
        effectiveCompanyId: effectiveCompanyId?.toString(),
        companyIdsToSearch: companyIdsToSearch.map(String)
      });
      return res.status(404).json({ error: 'PriceEntry not found' });
    }
  }
  
  logger.info('[getPrice] Precio encontrado exitosamente', {
    priceId: id,
    priceCompanyId: price.companyId?.toString(),
    originalCompanyId: originalCompanyId?.toString()
  });
  
  res.json(price);
};

// ============ create ============
export const createPrice = async (req, res) => {
  const { name, type = 'service', serviceId, variables = {}, total: totalRaw, itemId, comboProducts = [], yearFrom, yearTo, laborValue, laborKind, investmentValue } = req.body || {};
  
  // name es siempre requerido
  if (!name || !name.trim()) return res.status(400).json({ error: 'name requerido' });
  
  // Todos los precios deben ser GENERALES. Ignorar vehicleId y forzar general.
  const isInversion = type === 'inversion';
  const vehicle = null;

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
    vehicleId: null, // Siempre general
    name: String(name).trim(),
    type: isInversion ? 'inversion' : (type === 'combo' ? 'combo' : (type === 'product' ? 'product' : 'service')),
    serviceId: isInversion ? null : (svc?._id || null),
    itemId: (isInversion || type !== 'product') ? null : ((item) ? item._id : null),
    comboProducts: (isInversion || type !== 'combo') ? [] : processedComboProducts,
    yearFrom: yearFromNum,
    yearTo: yearToNum,
    brand: '',
    line: '',
    engine: '',
    year: null,
    variables: isInversion ? {} : (variables || {}),
    total,
    investmentValue: isInversion ? 0 : Math.max(0, num(investmentValue || 0)),
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
  const { name, type, variables = {}, total: totalRaw, serviceId, itemId, comboProducts, yearFrom, yearTo, laborValue, laborKind, investmentValue } = req.body || {};
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

  // Todos los precios deben ser GENERALES: limpiar vínculo al vehículo y legacy fields.
  row.vehicleId = null;
  row.brand = '';
  row.line = '';
  row.engine = '';
  row.year = null;
  
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
  if (investmentValue !== undefined) {
    row.investmentValue = (investmentValue !== null && investmentValue !== '') ? Math.max(0, num(investmentValue)) : 0;
    if (row.type === 'inversion') row.investmentValue = 0;
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

// ============ download import template (GENERAL) ============
export const downloadGeneralImportTemplate = async (_req, res) => {
  // Formato unificado para lista de precios general:
  // - SERVICIO / PRODUCTO / COMBO
  // - COMBO soporta hasta 5 productos (nombre, qty, precio, sku/id opcional, slot abierto)

  const headers = [
    'Nombre*',
    'Tipo* (SERVICIO|PRODUCTO|COMBO)',
    'Precio total',
    'Valor inversión (opcional)',
    'Valor mano de obra (opcional)',
    'Tipo mano de obra (opcional)',
    'Año desde (opcional)',
    'Año hasta (opcional)',
  ];

  // Combo product columns (1..5)
  for (let i = 1; i <= 5; i++) {
    headers.push(
      `Combo${i} Nombre`,
      `Combo${i} Cantidad`,
      `Combo${i} Precio unitario`,
      `Combo${i} ItemSKU (opcional)`,
      `Combo${i} ItemId (opcional)`,
      `Combo${i} Slot abierto (SI|NO)`
    );
  }

  const examples = [
    // Servicio
    [
      'Cambio de aceite',
      'SERVICIO',
      '50000',
      '0',
      '0',
      '',
      '',
      '',
      // combos (vacío)
      ...Array.from({ length: 5 }, () => ['', '', '', '', '', ''])
    ],
    // Producto (por SKU)
    [
      'Filtro de aceite',
      'PRODUCTO',
      '45000',
      '0',
      '0',
      '',
      '',
      '',
      ...Array.from({ length: 5 }, () => ['', '', '', '', '', ''])
    ],
    // Combo con 2 productos, uno slot abierto
    [
      'Combo mantenimiento básico',
      'COMBO',
      '0', // si queda 0, el import calcula suma de productos
      '25000',
      '15000',
      'MOTOR',
      '2021',
      '2025',
      // Combo1
      'Aceite 5W30',
      '1',
      '80000',
      'SKU-ACEITE-5W30',
      '',
      'NO',
      // Combo2 (slot abierto)
      'Filtro (slot abierto)',
      '1',
      '20000',
      '',
      '',
      'SI',
      // Combo3..5 vacíos
      ...Array.from({ length: 3 }, () => ['', '', '', '', '', ''])
    ]
  ];

  const wsData = [headers, ...examples];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, 'PRECIOS');

  const info = [
    ['INSTRUCCIONES'],
    ['- Columnas con * son obligatorias.'],
    ['- Tipo debe ser: SERVICIO, PRODUCTO o COMBO.'],
    ['- "Valor inversión" es opcional: se usará para autocompletar inversión al cerrar la venta (se suma por ítems).'],
    ['- PRODUCTO: se importa solo con nombre y precio (sin SKU/ItemId).'],
    ['- COMBO: llena hasta 5 productos (Combo1..Combo5).'],
    ['  - Si "Slot abierto" es SI, NO debes indicar SKU/ItemId (se asigna al cerrar venta/QR).'],
    ['  - Si "Precio total" es 0, se calculará como suma(qty * precio unitario).'],
    ['- Año desde/hasta son opcionales (aplica solo si el año del vehículo cae en el rango).'],
  ];
  const wsInfo = xlsx.utils.aoa_to_sheet(info);
  xlsx.utils.book_append_sheet(wb, wsInfo, 'INFO');

  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-import-precios-general.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

// ============ import XLSX ============
export const importPrices = async (req, res) => {
  const { vehicleId, mode = 'upsert' } = req.body || {};
  if (!req.file?.buffer) return res.status(400).json({ error: 'Archivo .xlsx requerido en campo "file"' });
  
  // Todos los precios deben ser GENERALES: ignorar vehicleId si se envía.
  if (vehicleId) {
    // No usar vehicleId, pero permitir compatibilidad con payloads antiguos.
  }

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
    await PriceEntry.deleteMany({ companyId: req.companyId, vehicleId: null, type: { $ne: 'inversion' } });
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
        vehicleId: null,
        name: name,
        type: type
      };
      
      const doc = {
        ...filter,
        brand: '',
        line: '',
        engine: '',
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

function parseBool(v) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'SI' || s === 'SÍ' || s === 'YES' || s === 'TRUE' || s === '1';
}

function parseType(v) {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'SERVICIO' || s === 'SERVICE') return 'service';
  if (s === 'PRODUCTO' || s === 'PRODUCT') return 'product';
  if (s === 'COMBO') return 'combo';
  return null;
}

async function findItemBySkuOrId({ sku, id, req }) {
  const itemCompanyFilter = await getItemQueryCompanyFilter(req);
  if (id) {
    const it = await Item.findOne({ _id: id, companyId: itemCompanyFilter });
    if (it) return it;
  }
  if (sku) {
    const skuNorm = String(sku).trim();
    if (!skuNorm) return null;
    const it = await Item.findOne({ sku: skuNorm, companyId: itemCompanyFilter });
    if (it) return it;
  }
  return null;
}

async function findServiceById({ serviceId, req }) {
  if (!serviceId) return null;
  return await getService(req.companyId, serviceId);
}

// ============ import XLSX (GENERAL) ============
export const importGeneralPrices = async (req, res) => {
  const { mode = 'upsert' } = req.body || {};
  if (!req.file?.buffer) return res.status(400).json({ error: 'Archivo .xlsx requerido en campo "file"' });

  // Leer primera hoja
  let rows = [];
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  } catch {
    return res.status(400).json({ error: 'XLSX inválido' });
  }

  const creationCompanyId = req.originalCompanyId || req.companyId || req.company?.id;
  if (!creationCompanyId) return res.status(400).json({ error: 'Company ID missing' });

  if (mode === 'overwrite') {
    // Solo borra precios generales (vehicleId=null)
    await PriceEntry.deleteMany({ companyId: creationCompanyId, vehicleId: null });
  }

  let inserted = 0;
  let updated = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const row = Object.fromEntries(Object.entries(raw).map(([k, v]) => [String(k).toLowerCase().trim(), v]));

    const name = String(row['nombre*'] || row.nombre || row.name || '').trim();
    const type = parseType(row['tipo* (servicio|producto|combo)'] || row.tipo || row.type);
    const totalRaw = row['precio total'] ?? row.precio ?? row.price ?? row.total ?? '';

    if (!name) {
      errors.push({ row: i + 2, error: 'Nombre requerido' });
      continue;
    }
    if (!type) {
      errors.push({ row: i + 2, error: 'Tipo inválido (SERVICIO|PRODUCTO|COMBO)' });
      continue;
    }

    try {
      const investmentValueRaw =
        row['valor inversión (opcional)'] ??
        row['valor inversion (opcional)'] ??
        row['valor inversión'] ??
        row['valor inversion'] ??
        row['inversion'] ??
        row['investment'] ??
        row['investmentvalue'] ??
        '';
      // service/product/combo extra fields
      const laborValue = row['valor mano de obra (opcional)'] ?? row.laborvalue ?? row.labor ?? '';
      const laborKind = String(row['tipo mano de obra (opcional)'] || row.laborkind || '').trim();

      const yearFrom = row['año desde (opcional)'] ?? row['ano desde (opcional)'] ?? row.yearfrom ?? '';
      const yearTo = row['año hasta (opcional)'] ?? row['ano hasta (opcional)'] ?? row.yearto ?? '';

      // En import general NO vinculamos serviceId ni itemId (se eliminan columnas).
      const svc = null;
      const item = null;

      // Combo products 1..5
      const comboProducts = [];
      if (type === 'combo') {
        for (let n = 1; n <= 5; n++) {
          const cpName = String(row[`combo${n} nombre`] || '').trim();
          if (!cpName) continue;
          const cpQty = Math.max(1, num(row[`combo${n} cantidad`] ?? 1));
          const cpUnitPrice = Math.max(0, num(row[`combo${n} precio unitario`] ?? 0));
          const cpSku = String(row[`combo${n} itemsku (opcional)`] || '').trim();
          const cpId = String(row[`combo${n} itemid (opcional)`] || '').trim();
          const isOpenSlot = parseBool(row[`combo${n} slot abierto (si|no)`]);

          let cpItemId = null;
          if (!isOpenSlot && (cpSku || cpId)) {
            const it = await findItemBySkuOrId({ sku: cpSku, id: cpId, req });
            if (!it) {
              errors.push({ row: i + 2, error: `Combo${n}: ItemSKU/ItemId no encontrado` });
              continue;
            }
            cpItemId = it._id;
          }
          if (isOpenSlot && (cpSku || cpId)) {
            errors.push({ row: i + 2, error: `Combo${n}: si es slot abierto no debe tener SKU/ItemId` });
            continue;
          }

          comboProducts.push({
            name: cpName,
            qty: cpQty,
            unitPrice: cpUnitPrice,
            itemId: cpItemId,
            isOpenSlot
          });
        }

        if (!comboProducts.length) {
          errors.push({ row: i + 2, error: 'COMBO requiere al menos 1 producto (Combo1..Combo5)' });
          continue;
        }
      }

      // Calcular total
      let total = num(totalRaw);
      if (type === 'product' && (!total || total <= 0)) {
        errors.push({ row: i + 2, error: 'PRODUCTO requiere un Precio total mayor a 0' });
        continue;
      }
      if (type === 'combo') {
        if (!total || total <= 0) {
          total = comboProducts.reduce((sum, cp) => sum + (num(cp.unitPrice) * num(cp.qty)), 0);
        }
      }
      const investmentValue = Math.max(0, num(investmentValueRaw || 0));

      // Años
      const yearFromNum = (yearFrom === '' || yearFrom == null) ? null : Number(yearFrom);
      const yearToNum = (yearTo === '' || yearTo == null) ? null : Number(yearTo);
      if (yearFromNum != null && (isNaN(yearFromNum) || yearFromNum < 1900 || yearFromNum > 2100)) {
        errors.push({ row: i + 2, error: 'Año desde inválido' });
        continue;
      }
      if (yearToNum != null && (isNaN(yearToNum) || yearToNum < 1900 || yearToNum > 2100)) {
        errors.push({ row: i + 2, error: 'Año hasta inválido' });
        continue;
      }
      if (yearFromNum != null && yearToNum != null && yearFromNum > yearToNum) {
        errors.push({ row: i + 2, error: 'Año desde no puede ser mayor que Año hasta' });
        continue;
      }

      const filter = {
        companyId: creationCompanyId,
        vehicleId: null,
        name,
        type
      };

      const existed = await PriceEntry.findOne(filter).select('_id').lean();

      const doc = {
        ...filter,
        serviceId: null,
        itemId: null,
        comboProducts: (type === 'combo') ? comboProducts : [],
        yearFrom: yearFromNum,
        yearTo: yearToNum,
        brand: '',
        line: '',
        engine: '',
        year: null,
        variables: {},
        total,
        investmentValue,
        laborValue: Math.max(0, num(laborValue || 0)),
        laborKind: String(laborKind || '').trim()
      };

      await PriceEntry.findOneAndUpdate(
        filter,
        doc,
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      if (existed) updated++;
      else inserted++;
    } catch (e) {
      errors.push({ row: i + 2, error: e?.message || 'Error desconocido' });
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

// ============ last price used for vehicle ============
export const getLastPriceForVehicle = async (req, res) => {
  const { priceId, vehicleId } = req.params || {};
  if (!priceId || !vehicleId) {
    return res.status(400).json({ error: 'priceId y vehicleId requeridos' });
  }

  const row = await PriceHistory.findOne({
    companyId: req.companyId,
    priceId,
    vehicleId
  }).lean();

  if (!row) {
    return res.json({
      lastPrice: null,
      lastComboProducts: [],
      lastUsedAt: null,
      usedCount: 0
    });
  }

  res.json({
    lastPrice: row.lastPrice ?? null,
    lastComboProducts: row.lastComboProducts || [],
    lastUsedAt: row.lastUsedAt || null,
    usedCount: row.usedCount || 0
  });
};
