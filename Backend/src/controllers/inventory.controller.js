// Backend/src/controllers/inventory.controller.js
import mongoose from "mongoose";
import VehicleIntake from "../models/VehicleIntake.js";
import Item from "../models/Item.js";
import Notification from "../models/Notification.js";
import StockMove from "../models/StockMove.js";
import SKU from "../models/SKU.js";
import { checkLowStockAndNotify, checkLowStockForMany } from "../lib/stockAlerts.js";
import xlsx from 'xlsx';
import multer from 'multer';

// Generador de QR en PNG
import QRCode from "qrcode";

// ------ helpers ------
function makeIntakeLabel(vi) {
  if (!vi) return "GENERAL";
  const kind = (vi.intakeKind || "vehicle").toLowerCase();

  if (kind === "purchase") {
    const place = (vi.purchasePlace || "").trim();
    const d = vi.intakeDate ? new Date(vi.intakeDate) : null;
    const ymd = d && isFinite(d) ? d.toISOString().slice(0, 10) : "";
    return `COMPRA: ${place}${ymd ? " " + ymd : ""}`.trim().toUpperCase();
  }

  // vehicle (por defecto)
  return `${(vi?.brand || "").trim()} ${(vi?.model || "").trim()} ${(vi?.engine || "").trim()}`
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase() || "GENERAL";
}


function sanitizeMediaList(arr) {
  const out = [];
  for (const m of (Array.isArray(arr) ? arr : [])) {
    if (!m) continue;
    const url = (m.url || "").trim();
    const publicId = (m.publicId || "").trim();
    const mimetype = (m.mimetype || "").trim();
    if (url && publicId && mimetype) out.push({ url, publicId, mimetype });
  }
  return out;
}


// Sanitización estricta para descripción pública (allowlist de etiquetas básicas)
function sanitizePublicDescription(html){
  if(!html) return '';
  let out = String(html).slice(0,5000);
  // Quitar script/style/iframe/object
  out = out.replace(/<\s*(script|style|iframe|object|embed|link)[^>]*>[\s\S]*?<\s*\/\1>/gi,'');
  // Quitar event handlers y javascript: URIs
  out = out.replace(/on[a-zA-Z]+\s*=\s*"[^"]*"/g,'').replace(/on[a-zA-Z]+\s*=\s*'[^']*'/g,'');
  out = out.replace(/href\s*=\s*"javascript:[^"]*"/gi,'href="#"');
  // Allowlist: p|b|i|strong|em|br|ul|ol|li|span|div|h1-4|img|a
  out = out.replace(/<\/?(?!p\b|b\b|i\b|strong\b|em\b|br\b|ul\b|ol\b|li\b|span\b|div\b|h[1-4]\b|img\b|a\b)[^>]*>/gi,'');
  // Limpiar múltiples espacios
  out = out.replace(/\s{3,}/g,'  ').trim();
  return out;
}

// NUEVO: genera el payload estable del QR
function makeQrData({ companyId, item }) {
  // Estructura: IT:<companyId>:<itemId>:<sku>
  return `IT:${companyId}:${item._id}:${(item.sku || "").toUpperCase()}`;
}

// Prorratea el costo del vehiculo entre items 'AUTO' ponderando por stock.
async function recalcAutoEntryPrices(companyId, vehicleIntakeId) {
  if (!vehicleIntakeId) return;

  const intake = await VehicleIntake.findOne({ _id: vehicleIntakeId, companyId });
  if (!intake) return;

  const items = await Item.find({ companyId, vehicleIntakeId });
  if (!items.length) return;

  const manual = items.filter(it => !it.entryPriceIsAuto && it.entryPrice != null);
  const auto = items.filter(it => it.entryPriceIsAuto || it.entryPrice == null);

  const manualTotal = manual.reduce((s, it) => s + (it.entryPrice || 0) * Math.max(0, it.stock || 0), 0);
  const vehicleTotal = intake.entryPrice || 0;
  let remaining = Math.max(vehicleTotal - manualTotal, 0);

  const autoStockTotal = auto.reduce((s, it) => s + Math.max(0, it.stock || 0), 0);
  if (!auto.length) return;

  let unit = 0;
  if (autoStockTotal > 0) {
    unit = Math.round((remaining / autoStockTotal) * 100) / 100;
  }

  for (const it of auto) {
    it.entryPrice = unit;
    it.entryPriceIsAuto = true;
    await it.save();
  }
}

// ============ ENTRADAS DE VEHICULO ============

export const listVehicleIntakes = async (req, res) => {
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  const data = await VehicleIntake.find(q).sort({ intakeDate: -1, createdAt: -1 });
  res.json({ data });
};

// ============ IMPORT DESDE EXCEL ============
// Cabeceras amigables para humanos
const IMPORT_HEADERS = [
  'SKU', 'Nombre', 'Nombre interno', 'Marca', 'Ubicación', 'Procedencia final', 'Precio entrada', 'Precio venta', 'Original (SI/NO)', 'Stock', 'Stock mínimo'
];

export const downloadImportTemplate = async (req, res) => {
  const wsData = [IMPORT_HEADERS, ['COMP0001','PASTILLAS DE FRENO','PASTILLAS DELANTERAS','RENAULT','','GENERAL','25000','85000','NO','5','0']];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, 'INVENTARIO');
  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition','attachment; filename="plantilla-inventario.xlsx"');
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

const uploadExcel = multer({ storage: multer.memoryStorage(), limits:{ fileSize: 10*1024*1024 } }).single('file');

export const importItemsFromExcel = async (req, res) => {
  uploadExcel(req, res, async (err) => {
    try{
      if(err) return res.status(400).json({ error: 'Error de carga: ' + err.message });
      if(!req.file) return res.status(400).json({ error: 'Falta archivo .xlsx' });
      const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: IMPORT_HEADERS, range: 1, defval: '' });
      let created=0, updated=0, skipped=0; const errors=[];
      for(const r of rows){
        const sku = String(r['SKU']||'').trim().toUpperCase();
        const name = String(r['Nombre']||'').trim().toUpperCase();
        if(!sku || !name){ skipped++; continue; }
  const internalName = String(r['Nombre interno']||'').trim().toUpperCase();
  const brand = String(r['Marca']||'').trim().toUpperCase();
        const location = String(r['Ubicación']||'').trim().toUpperCase();
        const vehicleTarget = String(r['Procedencia final']||'').trim().toUpperCase() || 'GENERAL';
        const entryPrice = toNumberSafe(r['Precio entrada']);
        const salePrice = toNumberSafe(r['Precio venta']);
        const original = yesNoToBool(r['Original (SI/NO)']);
        const stock = Math.max(0, Math.floor(toNumberSafe(r['Stock'])));
        const minStock = Math.max(0, Math.floor(toNumberSafe(r['Stock mínimo'])));
        try{
          const existing = await Item.findOne({ companyId: req.company.id, sku });
          if(existing){
            existing.name = name || existing.name;
            if (internalName) existing.internalName = internalName;
            existing.brand = brand;
            existing.location = location;
            existing.vehicleTarget = vehicleTarget;
            if(Number.isFinite(entryPrice)) existing.entryPrice = entryPrice;
            if(Number.isFinite(salePrice)) existing.salePrice = salePrice;
            existing.original = !!original;
            if(Number.isFinite(minStock)) existing.minStock = minStock;
            if(Number.isFinite(stock)) existing.stock = stock; // fijar stock
            // Auto-despublicar si stock en 0
            if ((existing.stock || 0) <= 0 && existing.published) existing.published = false;
            await existing.save(); updated++;
          } else {
            await Item.create({
              companyId: req.company.id,
              sku, name,
              internalName: internalName || '', brand, location,
              vehicleTarget,
              entryPrice: Number.isFinite(entryPrice)? entryPrice: 0,
              salePrice: Number.isFinite(salePrice)? salePrice: 0,
              original: !!original,
              stock: Number.isFinite(stock)? stock: 0,
              minStock: Number.isFinite(minStock)? minStock: 0,
            });
            created++;
          }
        }catch(e){ errors.push({ sku, error: e.message }); }
      }
      res.json({ ok:true, summary:{ created, updated, skipped, errors } });
    }catch(e){
      res.status(400).json({ error: e.message || 'Error procesando el archivo' });
    }
  });
};

function yesNoToBool(v){
  const s = String(v||'').trim().toUpperCase();
  if(['SI','SÍ','YES','Y','TRUE','1'].includes(s)) return true;
  if(['NO','N','FALSE','0'].includes(s)) return false;
  return null;
}
function toNumberSafe(v){
  if(v==null || v==='') return NaN;
  const s = String(v).replace(/\./g,'').replace(/,/g,'.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const createVehicleIntake = async (req, res) => {
  const b = req.body || {};
  const kind = (b.intakeKind || "vehicle").toLowerCase();

  const base = {
    companyId: req.companyId,
    intakeKind: kind === "purchase" ? "purchase" : "vehicle",
    intakeDate: b.intakeDate ? new Date(b.intakeDate) : new Date(),
    entryPrice: +b.entryPrice || 0,
  };

  if (base.intakeKind === "purchase") {
    if (!b.purchasePlace) return res.status(400).json({ error: "Falta 'purchasePlace' para ingreso de compra" });
    const doc = await VehicleIntake.create({
      ...base,
      purchasePlace: (b.purchasePlace || "").toUpperCase().trim(),
    });
    return res.status(201).json({ intake: doc });
  }

  // vehicle
  if (!b.brand || !b.model || !b.engine) {
    return res.status(400).json({ error: "Faltan campos de vehículo: brand, model, engine" });
  }
  const doc = await VehicleIntake.create({
    ...base,
    brand: (b.brand || "").toUpperCase().trim(),
    model: (b.model || "").toUpperCase().trim(),
    engine: (b.engine || "").toUpperCase().trim(),
  });
  res.status(201).json({ intake: doc });
};


export const updateVehicleIntake = async (req, res) => {
  const { id } = req.params;
  const b = req.body;

  const before = await VehicleIntake.findOne({ _id: id, companyId: req.companyId });
  if (!before) return res.status(404).json({ error: "Entrada no encontrada" });

  const updated = await VehicleIntake.findOneAndUpdate(
    { _id: id, companyId: req.companyId },
    {
      ...(b.brand !== undefined ? { brand: (b.brand || "").toUpperCase().trim() } : {}),
      ...(b.model !== undefined ? { model: (b.model || "").toUpperCase().trim() } : {}),
      ...(b.engine !== undefined ? { engine: (b.engine || "").toUpperCase().trim() } : {}),
      ...(b.intakeKind !== undefined ? { intakeKind: (b.intakeKind === "purchase" ? "purchase" : "vehicle") } : {}),
      ...(b.purchasePlace !== undefined ? { purchasePlace: (b.purchasePlace || "").toUpperCase().trim() } : {}),
      ...(b.entryPrice !== undefined ? { entryPrice: +b.entryPrice || 0 } : {}),
    },
    { new: true }
  );

  const oldLabel = makeIntakeLabel(before);
  const newLabel = makeIntakeLabel(updated);
  if (oldLabel !== newLabel) {
    await Item.updateMany(
      { companyId: req.companyId, vehicleIntakeId: updated._id },
      { $set: { vehicleTarget: newLabel } }
    );
  }

  if ((before.entryPrice || 0) !== (updated.entryPrice || 0)) {
    await recalcAutoEntryPrices(req.companyId, updated._id);
  }

  res.json({ intake: updated });
};

export const deleteVehicleIntake = async (req, res) => {
  const { id } = req.params;

  const linked = await Item.countDocuments({ companyId: req.companyId, vehicleIntakeId: id });
  if (linked > 0) {
    return res.status(400).json({
      error: `No se puede eliminar: hay ${linked} ítem(s) vinculados a esta entrada.`,
    });
  }

  const del = await VehicleIntake.findOneAndDelete({ _id: id, companyId: req.companyId });
  if (!del) return res.status(404).json({ error: "Entrada no encontrada" });
  res.status(204).end();
};

// ======================= ITEMS ========================

export const listItems = async (req, res) => {
  const { name, sku, vehicleTarget, vehicleIntakeId, brand } = req.query;
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };

  if (name) {
    const normalizedName = (name || "").trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (normalizedName) {
      // Crear regex que busque todas las palabras en cualquier orden
      const words = normalizedName.split(' ').filter(w => w.length > 0);
      if (words.length > 0) {
        const regexPattern = words.map(word => `(?=.*${word})`).join('');
        q.$or = [
          { name: new RegExp(regexPattern, "i") }, 
          { internalName: new RegExp(regexPattern, "i") }
        ];
      }
    }
  }
  if (sku) {
    const normalizedSku = (sku || "").trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (normalizedSku) {
      const words = normalizedSku.split(' ').filter(w => w.length > 0);
      if (words.length > 0) {
        const regexPattern = words.map(word => `(?=.*${word})`).join('');
        q.sku = new RegExp(regexPattern, "i");
      }
    }
  }
  if (brand) {
    const normalizedBrand = (brand || "").trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (normalizedBrand) {
      const words = normalizedBrand.split(' ').filter(w => w.length > 0);
      if (words.length > 0) {
        const regexPattern = words.map(word => `(?=.*${word})`).join('');
        q.brand = new RegExp(regexPattern, "i");
      }
    }
  }

  if (vehicleIntakeId && mongoose.Types.ObjectId.isValid(vehicleIntakeId)) {
    q.vehicleIntakeId = new mongoose.Types.ObjectId(vehicleIntakeId);
  } else if (vehicleTarget) {
    const normalizedVehicleTarget = (vehicleTarget || "").trim().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (normalizedVehicleTarget) {
      const words = normalizedVehicleTarget.split(' ').filter(w => w.length > 0);
      if (words.length > 0) {
        const regexPattern = words.map(word => `(?=.*${word})`).join('');
        q.vehicleTarget = new RegExp(regexPattern, "i");
      }
    }
  }

  // Paginación opcional: si viene page o limit, respetar y devolver meta
  const pageRaw = parseInt(req.query.page, 10);
  const limitRaw = parseInt(req.query.limit, 10);
  const hasPaging = Number.isFinite(pageRaw) || Number.isFinite(limitRaw);

  if (hasPaging) {
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 10;
    const total = await Item.countDocuments(q);
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    const skip = (safePage - 1) * limit;
    const data = await Item.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit);
    return res.json({ data, meta: { page: safePage, pages, total, limit } });
  }

  // Si no hay filtros, limitar a 10 por defecto para ahorrar recursos
  const hasFilter = !!(name || sku || vehicleTarget || vehicleIntakeId || brand);
  const DEFAULT_LIMIT = 10;

  if (!hasFilter) {
    const limit = DEFAULT_LIMIT;
    const data = await Item.find(q).sort({ createdAt: -1 }).limit(limit);
    const total = await Item.countDocuments(q);
    const truncated = total > limit;
    return res.json({ data, meta: { truncated, total, limit, page: 1, pages: Math.max(1, Math.ceil(total / limit)) } });
  }

  // Si hay filtros y no hay paginación, devolver todos los resultados
  const data = await Item.find(q).sort({ createdAt: -1 });
  return res.json({ data });
};

export const createItem = async (req, res) => {
  const b = req.body;

  ['sku', 'name', 'internalName', 'location', 'brand'].forEach(key => {
    if (b[key]) b[key] = b[key].toUpperCase().trim();
  });

  if (b.vehicleIntakeId) {
    const vi = await VehicleIntake.findOne({ _id: b.vehicleIntakeId, companyId: req.companyId });
    if (vi && (!b.vehicleTarget || b.vehicleTarget === "VITRINAS")) {
      b.vehicleTarget = makeIntakeLabel(vi);
    }
  }

  if ((b.entryPrice === undefined || b.entryPrice === null || b.entryPrice === "") && b.vehicleIntakeId) {
    b.entryPrice = null;
    b.entryPriceIsAuto = true;
  } else if (b.entryPrice !== undefined && b.entryPrice !== null && b.entryPrice !== "") {
    b.entryPrice = +b.entryPrice;
    b.entryPriceIsAuto = false;
  }

  const images = sanitizeMediaList(b.images);

  const item = await Item.create({
    companyId: req.companyId,
    sku: b.sku,
    name: b.name,
    internalName: (b.internalName || "").toUpperCase().trim(),
    brand: (b.brand || "").toUpperCase().trim(),
    location: (b.location || "").toUpperCase().trim(),
    vehicleTarget: (b.vehicleTarget || "GENERAL").toUpperCase().trim(),
    vehicleIntakeId: b.vehicleIntakeId || null,
    entryPrice: b.entryPrice ?? null,
    entryPriceIsAuto: !!b.entryPriceIsAuto,
    salePrice: +b.salePrice || 0,
    original: !!b.original,
    stock: Number.isFinite(+b.stock) ? +b.stock : 0,
  images,
  // Alerta de stock mínimo: opcional
  ...(Number.isFinite(+b.minStock) && +b.minStock >= 0 ? { minStock: +b.minStock } : {}),
  ...(Number.isFinite(+b.minStock) && +b.minStock > 0 && (Number.isFinite(+b.stock) ? +b.stock : 0) <= +b.minStock ? { lowStockAlertedAt: new Date() } : {}),
    qrData: "" // inicial, lo llenamos abajo
    , // Campos catálogo público (solo backend decide publishedAt/publishedBy)
    published: !!b.published,
    publicPrice: Number.isFinite(+b.publicPrice) ? +b.publicPrice : undefined,
    publicDescription: sanitizePublicDescription(b.publicDescription||''),
    publicImages: Array.isArray(b.publicImages) ? b.publicImages.slice(0,10).map(im => ({ url: (im.url||'').trim(), alt: (im.alt||'').trim().slice(0,80) })).filter(im=>im.url) : [],
    tags: Array.isArray(b.tags) ? b.tags.slice(0,12).map(t=>String(t).trim().toUpperCase()).filter(Boolean) : [],
    category: (b.category||'').trim().toUpperCase() || '',
    publishedAt: b.published ? new Date() : undefined,
    publishedBy: b.published ? (req.userId || null) : null
  });

  // Si aun no tiene QR, lo generamos y guardamos
  if (!item.qrData) {
    item.qrData = makeQrData({ companyId: req.companyId, item });
    await item.save();
  }

  // Asegurar registro de SKU para tracking
  try {
    const code = (item.sku || "").toUpperCase();
    if (code) {
      const companyId = req.companyId;
      const exists = await SKU.findOne({ companyId, code }).lean();
      if (!exists) {
        const allowed = ['MOTOR','TRANSMISION','FRENOS','SUSPENSION','ELECTRICO','CARROCERIA','INTERIOR','FILTROS','ACEITES','NEUMATICOS','OTROS'];
        const cat = (b.category || item.category || '').toUpperCase();
        const category = allowed.includes(cat) ? cat : 'OTROS';
        await SKU.create({
          companyId,
          code,
          category,
          description: (item.name || code).toUpperCase(),
          notes: '',
          printStatus: 'pending',
          createdBy: req.userId || ''
        });
      }
    }
  } catch (e) {
    // No bloquear creación del item por fallos de SKU, solo loguear
    console.error('ensure-sku-on-create', e?.message);
  }

  if (item.vehicleIntakeId) {
    await recalcAutoEntryPrices(req.companyId, item.vehicleIntakeId);
  }

  res.status(201).json({ item });
  // Notificación publish
  if(item.published){
    await Notification.create({ companyId: req.companyId, type: 'item.published', data: { itemId: item._id, sku: item.sku } });
  }
};

export const updateItem = async (req, res) => {
  const { id } = req.params;
  const b = req.body;

  ['sku', 'name', 'internalName', 'location', 'brand'].forEach(key => {
    if (b[key]) b[key] = b[key].toUpperCase().trim();
  });

  if (b.vehicleIntakeId) {
    const vi = await VehicleIntake.findOne({ _id: b.vehicleIntakeId, companyId: req.companyId });
    if (vi && (!b.vehicleTarget || b.vehicleTarget === "GENERAL")) {
      b.vehicleTarget = makeIntakeLabel(vi);
    }
  }

  if ("entryPrice" in b) {
    if (b.entryPrice === null || b.entryPrice === "" || b.entryPrice === undefined) {
      b.entryPrice = null;
      b.entryPriceIsAuto = !!b.vehicleIntakeId;
    } else {
      b.entryPrice = +b.entryPrice;
      b.entryPriceIsAuto = false;
    }
  }

  const before = await Item.findOne({ _id: id, companyId: req.companyId });
  if (!before) return res.status(404).json({ error: "Item no encontrado" });

  // ---- imagenes ----
  let images = undefined;
  if (Array.isArray(b.images)) {
    images = sanitizeMediaList(b.images);
  } else {
    const add = sanitizeMediaList(b.addImages);
    const removeSet = new Set((Array.isArray(b.removePublicIds) ? b.removePublicIds : []).map(String));
    images = [
      ...before.images.filter(m => !removeSet.has(String(m.publicId))),
      ...add
    ];
  }

  const updateDoc = {
    ...b,
    ...(images ? { images } : {})
  };

  // Controlar campos públicos desde backend
  if('publicDescription' in updateDoc){
    updateDoc.publicDescription = sanitizePublicDescription(updateDoc.publicDescription||'');
  }
  if('publicImages' in updateDoc){
    updateDoc.publicImages = Array.isArray(updateDoc.publicImages)? updateDoc.publicImages.slice(0,10).map(im=>({ url:(im.url||'').trim(), alt:(im.alt||'').trim().slice(0,80) })).filter(im=>im.url) : [];
  }
  if('tags' in updateDoc){
    updateDoc.tags = Array.isArray(updateDoc.tags)? updateDoc.tags.slice(0,12).map(t=>String(t).trim().toUpperCase()).filter(Boolean) : [];
  }
  if('category' in updateDoc){
    updateDoc.category = (updateDoc.category||'').trim().toUpperCase();
  }
  if('publicPrice' in updateDoc){
    updateDoc.publicPrice = Number.isFinite(+updateDoc.publicPrice)? +updateDoc.publicPrice : undefined;
  }
  if('marketplacePublished' in updateDoc){
    updateDoc.marketplacePublished = !!updateDoc.marketplacePublished;
  }
  // published toggle: gestionar publishedAt/publishedBy
  let publishingAction = null;
  if('published' in updateDoc){
    const goingPublished = !!updateDoc.published;
    if(goingPublished && !before.published){
      updateDoc.publishedAt = new Date();
      updateDoc.publishedBy = req.userId || before.publishedBy || null;
      publishingAction = 'published';
    } else if(!goingPublished && before.published){
      // Mantener histórico; no borramos publishedAt
      publishingAction = 'unpublished';
    } else {
      delete updateDoc.publishedAt; // no cambiar si estado no varía
    }
  }

  let item = await Item.findOneAndUpdate(
    { _id: id, companyId: req.companyId },
    updateDoc,
    { new: true }
  );

  // Auto-despublicar si stock quedó en cero o menos
  if ((item?.stock || 0) <= 0 && item?.published) {
    item.published = false;
    await item.save();
  }

  // Asegura que tenga qrData
  if (!item.qrData) {
    item.qrData = makeQrData({ companyId: req.companyId, item });
    item = await item.save();
  }

  const intakeToRecalc = item.vehicleIntakeId || before?.vehicleIntakeId;
  if (intakeToRecalc) {
    await recalcAutoEntryPrices(req.companyId, intakeToRecalc);
  }

  // Si cambió/definió SKU, asegurar registro de SKU
  try {
    if (b.sku) {
      const code = String(b.sku).toUpperCase();
      const companyId = req.companyId;
      const exists = await SKU.findOne({ companyId, code }).lean();
      if (!exists) {
        const allowed = ['MOTOR','TRANSMISION','FRENOS','SUSPENSION','ELECTRICO','CARROCERIA','INTERIOR','FILTROS','ACEITES','NEUMATICOS','OTROS'];
        const cat = (b.category || item.category || '').toUpperCase();
        const category = allowed.includes(cat) ? cat : 'OTROS';
        await SKU.create({
          companyId,
          code,
          category,
          description: (item.name || code).toUpperCase(),
          notes: '',
          printStatus: 'pending',
          createdBy: req.userId || ''
        });
      }
    }
  } catch (e) {
    console.error('ensure-sku-on-update', e?.message);
  }

  res.json({ item });
  if(publishingAction){
    const type = publishingAction === 'published' ? 'item.published' : 'item.unpublished';
    await Notification.create({ companyId: req.companyId, type, data: { itemId: item._id, sku: item.sku } });
  }
  // Si se cambió stock o minStock vía update, validar alerta
  try {
    if ('stock' in b || 'minStock' in b) {
      await checkLowStockAndNotify(req.companyId, item._id);
    }
  } catch {}
};

export const deleteItem = async (req, res) => {
  const { id } = req.params;
  const doc = await Item.findOneAndDelete({ _id: id, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: "Item no encontrado" });

  if (doc.vehicleIntakeId) {
    await recalcAutoEntryPrices(req.companyId, doc.vehicleIntakeId);
  }
  res.status(204).end();
};

export const recalcIntakePrices = async (req, res) => {
  await recalcAutoEntryPrices(req.companyId, req.params.id);
  res.json({ ok: true });
};

// ===== Stock IN =====
// Agrega stock a un ítem existente y registra el movimiento
export const addItemStock = async (req, res) => {
  const { id } = req.params;
  const b = req.body || {};
  const qty = parseInt(b.qty, 10);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: "Cantidad inválida (debe ser > 0)" });
  }

  const item = await Item.findOne({ _id: id, companyId: req.companyId });
  if (!item) return res.status(404).json({ error: "Item no encontrado" });

  // Registrar movimiento primero (para auditoría), luego incrementar stock
  const meta = { note: (b.note || '').trim() };
  if (b.vehicleIntakeId && mongoose.Types.ObjectId.isValid(b.vehicleIntakeId)) {
    meta.vehicleIntakeId = new mongoose.Types.ObjectId(b.vehicleIntakeId);
    try {
      const vi = await VehicleIntake.findOne({ _id: meta.vehicleIntakeId, companyId: req.companyId });
      if (vi) {
        meta.intakeKind = vi.intakeKind;
        meta.intakeLabel = makeIntakeLabel(vi);
      }
    } catch { /* noop */ }
  }

  await StockMove.create({
    companyId: req.companyId,
    itemId: item._id,
    qty,
    reason: 'IN',
    meta
  });

  const updated = await Item.findOneAndUpdate(
    { _id: id, companyId: req.companyId },
    { $inc: { stock: qty } },
    { new: true }
  );

  // Actualizar estado del SKU: pasar a 'pending' e incrementar stickers pendientes
  try {
    const code = String(updated?.sku || item?.sku || '').toUpperCase();
    if (code) {
      const category = (updated?.category || item?.category || 'OTROS').toString().toUpperCase();
      const description = (updated?.name || item?.name || code).toString().toUpperCase();
      await SKU.updateOne(
        { companyId: req.companyId, code },
        {
          $set: { printStatus: 'pending' },
          $setOnInsert: { category, description, notes: '', createdBy: req.userId || '' },
          $inc: { pendingStickers: Math.max(0, qty) }
        },
        { upsert: true }
      );
    }
  } catch (e) {
    console.error('sku-pending-on-stock-in', e?.message);
  }

  res.json({ item: updated });
  // Al subir stock, si supera el mínimo limpiar bandera de alerta; si sigue por debajo, no notifica (solo notifica en bajadas o si han pasado 24h)
  try { await checkLowStockAndNotify(req.companyId, updated._id); } catch {}
};

// ===== Mantenimiento: despublicar agotados =====
export const unpublishZeroStock = async (req, res) => {
  const r = await Item.updateMany({ companyId: req.companyId, published: true, stock: { $lte: 0 } }, { $set: { published: false } });
  res.json({ matched: r.matchedCount ?? r.n, modified: r.modifiedCount ?? r.nModified });
};

// ===== Stock IN (Bulk) =====
// Agrega stock a varios ítems a la vez
// Body: { items: [{ id, qty }...], vehicleIntakeId?, note? }
export const addItemsStockBulk = async (req, res) => {
  const b = req.body || {};
  const itemsReq = Array.isArray(b.items) ? b.items : [];
  if (!itemsReq.length) return res.status(400).json({ error: 'Falta lista de items' });
  if (itemsReq.length > 500) return res.status(400).json({ error: 'Máximo 500 ítems por lote' });

  // Validación de qtys e ids
  const parsed = [];
  for (const it of itemsReq) {
    const id = String(it?.id || '').trim();
    const qty = parseInt(it?.qty, 10);
    if (!mongoose.Types.ObjectId.isValid(id) || !Number.isFinite(qty) || qty <= 0) {
      parsed.push({ id, qty, valid: false, error: 'id o qty inválidos' });
    } else {
      parsed.push({ id, qty, valid: true });
    }
  }

  const validIds = parsed.filter(p => p.valid).map(p => new mongoose.Types.ObjectId(p.id));
  if (!validIds.length) return res.status(400).json({ error: 'No hay ítems válidos' });

  // Opcional: anclar a procedencia global y preparar meta común
  const metaBase = { note: (b.note || '').trim() };
  let intakeMeta = {};
  if (b.vehicleIntakeId && mongoose.Types.ObjectId.isValid(b.vehicleIntakeId)) {
    const vi = await VehicleIntake.findOne({ _id: b.vehicleIntakeId, companyId: req.companyId });
    if (vi) {
      intakeMeta = {
        vehicleIntakeId: vi._id,
        intakeKind: vi.intakeKind,
        intakeLabel: makeIntakeLabel(vi)
      };
    }
  }

  // Cargar ítems válidos de la empresa
  const docs = await Item.find({ _id: { $in: validIds }, companyId: req.companyId });
  const byId = new Map(docs.map(d => [String(d._id), d]));

  const stockMoves = [];
  const updates = [];
  const results = [];

  for (const p of parsed) {
    const doc = byId.get(String(p.id));
    if (!p.valid || !doc) {
      results.push({ id: p.id, ok: false, error: p.valid ? 'No pertenece a la empresa o no existe' : (p.error || 'inválido') });
      continue;
    }
    const before = doc.stock || 0;
    const after = before + p.qty;
    stockMoves.push({
      companyId: req.companyId,
      itemId: doc._id,
      qty: p.qty,
      reason: 'IN',
      meta: { ...metaBase, ...intakeMeta }
    });
    updates.push({ updateOne: { filter: { _id: doc._id, companyId: req.companyId }, update: { $inc: { stock: p.qty } } } });
    results.push({ id: String(doc._id), ok: true, before, after, added: p.qty });
  }

  if (!updates.length) return res.status(400).json({ error: 'No hay ítems válidos para actualizar' });

  // Aplicar cambios
  if (stockMoves.length) await StockMove.insertMany(stockMoves);
  if (updates.length) await Item.bulkWrite(updates, { ordered: false });

  // Actualizar SKUs en masa: por cada item, llevar a 'pending' y sumar qty a pendingStickers
  try {
    const incById = new Map();
    for (const p of parsed) {
      if (p.valid) incById.set(String(p.id), (incById.get(String(p.id)) || 0) + Math.max(0, p.qty));
    }
    const ops = [];
    for (const [idStr, doc] of byId.entries()) {
      const qty = incById.get(idStr) || 0;
      if (!qty) continue;
      const code = String(doc.sku || '').toUpperCase();
      if (!code) continue;
      const category = String(doc.category || 'OTROS').toUpperCase();
      const description = String(doc.name || code).toUpperCase();
      ops.push({
        updateOne: {
          filter: { companyId: req.companyId, code },
          update: {
            $set: { printStatus: 'pending' },
            $setOnInsert: { category, description, notes: '', createdBy: req.userId || '' },
            $inc: { pendingStickers: qty }
          },
          upsert: true
        }
      });
    }
    if (ops.length) await SKU.bulkWrite(ops, { ordered: false });
  } catch (e) {
    console.error('sku-bulk-pending-on-stock-in', e?.message);
  }


  // Opcional: devolver stocks finales recargados (evitar segundo query grande)
  res.json({ updatedCount: updates.length, results });
  // Revisar alertas para los ítems actualizados
  try {
    await checkLowStockForMany(req.companyId, results.filter(r=>r.ok).map(r=>r.id));
  } catch {}
};


// ===== QR =====
// Devuelve un PNG con el QR del item
export const itemQrPng = async (req, res) => {
  const { id } = req.params;
  const size = Math.min(Math.max(parseInt(req.query.size || "220", 10), 120), 1024);

  const item = await Item.findOne({ _id: id, companyId: req.companyId });
  if (!item) return res.status(404).json({ error: "Item no encontrado" });

  const payload = item.qrData || makeQrData({ companyId: req.companyId, item });
  const png = await QRCode.toBuffer(payload, {
    errorCorrectionLevel: "M",
    type: "png",
    width: size,
    margin: 1
  });

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  return res.end(png);
};

// ===== Publicación MASIVA =====
// Permite publicar o despublicar ítems por filtro de entrada (vehicleIntakeId) o por SKUs exactos
// Body: { action: 'publish'|'unpublish', vehicleIntakeId?: string, skus?: string[] }
export const bulkPublishItems = async (req, res) => {
  const b = req.body || {};
  const action = String(b.action || '').toLowerCase();
  if (!['publish','unpublish'].includes(action)) return res.status(400).json({ error: 'Acción inválida' });

  const orFilters = [];
  if (b.vehicleIntakeId && mongoose.Types.ObjectId.isValid(b.vehicleIntakeId)) {
    orFilters.push({ vehicleIntakeId: new mongoose.Types.ObjectId(b.vehicleIntakeId) });
  }
  const skus = Array.isArray(b.skus) ? b.skus.map(s => String(s).toUpperCase().trim()).filter(Boolean) : [];
  if (skus.length) {
    orFilters.push({ sku: { $in: skus } });
  }
  if (!orFilters.length) return res.status(400).json({ error: 'Provee vehicleIntakeId o lista de skus' });

  const baseFilter = { companyId: req.companyId, $or: orFilters };

  let modified = 0;
  let matched = 0;

  if (action === 'publish') {
    // Set published=true
    // 1) Items que pasan de no publicado a publicado: set publishedAt y publishedBy
    const fNew = { ...baseFilter, published: { $ne: true } };
    const rNew = await Item.updateMany(fNew, { $set: { published: true, publishedAt: new Date(), publishedBy: req.userId || null } });
    modified += rNew.modifiedCount || 0;
    matched += rNew.matchedCount || 0;
    // 2) Items ya publicados: asegurar published=true (no cambia fechas)
    const fOld = { ...baseFilter, published: true };
    const rOld = await Item.updateMany(fOld, { $set: { published: true } });
    modified += rOld.modifiedCount || 0;
    matched += rOld.matchedCount || 0;
  } else {
    // unpublish: published=false (mantener publishedAt)
    const r = await Item.updateMany(baseFilter, { $set: { published: false } });
    modified += r.modifiedCount || 0;
    matched += r.matchedCount || 0;
  }

  // Notificación simple (no por ítem para evitar ruido)
  try { await Notification.create({ companyId: req.companyId, type: action === 'publish' ? 'items.published.bulk' : 'items.unpublished.bulk', data: { action, matched, modified } }); } catch {}

  res.json({ action, matched, modified });
};
