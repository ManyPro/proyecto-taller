// Backend/src/controllers/inventory.controller.js
import mongoose from "mongoose";
import VehicleIntake from "../models/VehicleIntake.js";
import Item from "../models/Item.js";
import Notification from "../models/Notification.js";
import SKU from "../models/SKU.js";

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
  const { name, sku, vehicleTarget, vehicleIntakeId } = req.query;
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };

  if (name) q.$or = [{ name: new RegExp((name || "").trim().toUpperCase(), "i") }, { internalName: new RegExp((name || "").trim().toUpperCase(), "i") }];
  if (sku) q.sku = new RegExp((sku || "").trim().toUpperCase(), "i");

  if (vehicleIntakeId && mongoose.Types.ObjectId.isValid(vehicleIntakeId)) {
    q.vehicleIntakeId = new mongoose.Types.ObjectId(vehicleIntakeId);
  } else if (vehicleTarget) {
    q.vehicleTarget = new RegExp((vehicleTarget || "").trim().toUpperCase(), "i");
  }

  // Si no hay filtros, limitar a 10 por defecto para ahorrar recursos
  const hasFilter = !!(name || sku || vehicleTarget || vehicleIntakeId);
  const DEFAULT_LIMIT = 10;

  if (!hasFilter) {
    const limit = DEFAULT_LIMIT;
    const data = await Item.find(q).sort({ createdAt: -1 }).limit(limit);
    const total = await Item.countDocuments(q);
    const truncated = total > limit;
    return res.json({ data, meta: { truncated, total, limit } });
  }

  // Si hay filtros, devolver todos los resultados (o respeta paginado si lo añades luego)
  const data = await Item.find(q).sort({ createdAt: -1 });
  return res.json({ data });
};

export const createItem = async (req, res) => {
  const b = req.body;

  ['sku', 'name', 'internalName', 'location'].forEach(key => {
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
    location: (b.location || "").toUpperCase().trim(),
    vehicleTarget: (b.vehicleTarget || "GENERAL").toUpperCase().trim(),
    vehicleIntakeId: b.vehicleIntakeId || null,
    entryPrice: b.entryPrice ?? null,
    entryPriceIsAuto: !!b.entryPriceIsAuto,
    salePrice: +b.salePrice || 0,
    original: !!b.original,
    stock: Number.isFinite(+b.stock) ? +b.stock : 0,
    images,
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

  ['sku', 'name', 'internalName', 'location'].forEach(key => {
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
