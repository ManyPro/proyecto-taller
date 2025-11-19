import PriceEntry from '../models/PriceEntry.js';
import Service from '../models/Service.js';
import Vehicle from '../models/Vehicle.js';
import Item from '../models/Item.js';
import xlsx from 'xlsx'; // 0.18.x

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

// Helper para procesar productos de combo (evita duplicación)
async function processComboProducts(comboProducts, companyId) {
  if (!Array.isArray(comboProducts) || comboProducts.length === 0) {
    return { error: 'Un combo debe incluir al menos un producto', products: null };
  }
  
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
      const comboItem = await Item.findOne({ _id: cp.itemId, companyId });
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
  const { serviceId, vehicleId, type, brand, line, engine, year, name, page = 1, limit = 10, vehicleYear } = req.query || {};
  const q = { companyId: req.companyId };
  
  // Nuevo modelo: vehicleId es prioritario
  if (vehicleId) {
    q.vehicleId = vehicleId;
  } else {
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
  const price = await PriceEntry.findOne({ _id: id, companyId: req.companyId })
    .populate('vehicleId', 'make line displacement modelYear')
    .populate('itemId', 'sku name stock salePrice')
    .populate('comboProducts.itemId', 'sku name stock salePrice')
    .lean();
  if (!price) return res.status(404).json({ error: 'PriceEntry not found' });
  res.json(price);
};

// ============ create ============
export const createPrice = async (req, res) => {
  const { vehicleId, name, type = 'service', serviceId, variables = {}, total: totalRaw, itemId, comboProducts = [], yearFrom, yearTo, laborValue, laborKind } = req.body || {};
  
  // Nuevo modelo: vehicleId y name son requeridos
  if (!vehicleId) return res.status(400).json({ error: 'vehicleId requerido' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'name requerido' });
  
  // Validar vehículo
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) return res.status(404).json({ error: 'Vehículo no encontrado' });
  if (!vehicle.active) return res.status(400).json({ error: 'Vehículo inactivo' });

  // Si hay serviceId, validar servicio (opcional)
  let svc = null;
  if (serviceId) {
    svc = await getService(req.companyId, serviceId);
    if (!svc) return res.status(404).json({ error: 'Servicio no encontrado' });
  }

  // Si es producto y tiene itemId, validar item del inventario
  let item = null;
  if (type === 'product' && itemId) {
    item = await Item.findOne({ _id: itemId, companyId: req.companyId });
    if (!item) return res.status(404).json({ error: 'Item del inventario no encontrado' });
  }

  // Si es combo, validar y procesar productos del combo
  let processedComboProducts = [];
  if (type === 'combo') {
    const result = await processComboProducts(comboProducts, req.companyId);
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

  const doc = {
    companyId: req.companyId,
    vehicleId: vehicle._id,
    name: String(name).trim(),
    type: type === 'combo' ? 'combo' : (type === 'product' ? 'product' : 'service'),
    serviceId: svc?._id || null,
    itemId: (type === 'product' && item) ? item._id : null,
    comboProducts: type === 'combo' ? processedComboProducts : [],
    yearFrom: yearFromNum,
    yearTo: yearToNum,
    brand: vehicle.make,
    line: vehicle.line,
    engine: vehicle.displacement,
    year: null,
    variables: variables || {},
    total,
    laborValue: (laborValue !== undefined && laborValue !== null && laborValue !== '') ? Math.max(0, num(laborValue)) : 0,
    laborKind: (laborKind !== undefined && laborKind !== null && laborKind !== '') ? String(laborKind).trim() : ''
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
        companyId: req.companyId,
        vehicleId: vehicle._id,
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
    const newType = type === 'combo' ? 'combo' : (type === 'product' ? 'product' : 'service');
    row.type = newType;
    
    // Limpiar campos según el tipo
    if (newType !== 'product') row.itemId = null;
    if (newType !== 'combo') row.comboProducts = [];
  }
  
  // Actualizar serviceId si se proporciona
  if (serviceId !== undefined) {
    if (serviceId === null || serviceId === '') {
      row.serviceId = null;
    } else {
      const svc = await getService(req.companyId, serviceId);
      if (!svc) return res.status(404).json({ error: 'Servicio no encontrado' });
      row.serviceId = svc._id;
    }
  }
  
  // Actualizar itemId si se proporciona (solo para productos)
  if (itemId !== undefined && row.type === 'product') {
    if (itemId === null || itemId === '') {
      row.itemId = null;
    } else {
      const item = await Item.findOne({ _id: itemId, companyId: req.companyId });
      if (!item) return res.status(404).json({ error: 'Item del inventario no encontrado' });
      row.itemId = item._id;
    }
  }
  
  // Actualizar comboProducts si se proporciona (solo para combos)
  if (comboProducts !== undefined && row.type === 'combo') {
    const result = await processComboProducts(comboProducts, req.companyId);
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
