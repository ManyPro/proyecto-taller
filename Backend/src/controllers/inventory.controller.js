// Backend/src/controllers/inventory.controller.js
import mongoose from "mongoose";
import VehicleIntake from "../models/VehicleIntake.js";
import Item from "../models/Item.js";

// 👉 nuevo: generador PNG
import QRCode from "qrcode";

// ------ helpers ------
function makeIntakeLabel(vi) {
  return `${(vi?.brand || "").trim()} ${(vi?.model || "").trim()} ${(vi?.engine || "").trim()}`
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
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

// NUEVO: genera el payload estable del QR
function makeQrData({ companyId, item }) {
  // Estructura: IT:<companyId>:<itemId>:<sku>
  return `IT:${companyId}:${item._id}:${(item.sku || "").toUpperCase()}`;
}

// Prorratea el costo del vehículo entre ítems "AUTO" ponderando por STOCK.
async function recalcAutoEntryPrices(companyId, vehicleIntakeId) {
  if (!vehicleIntakeId) return;

  const intake = await VehicleIntake.findOne({ _id: vehicleIntakeId, companyId });
  if (!intake) return;

  const items = await Item.find({ companyId, vehicleIntakeId });
  if (!items.length) return;

  const manual = items.filter(it => !it.entryPriceIsAuto && it.entryPrice != null);
  const auto   = items.filter(it => it.entryPriceIsAuto || it.entryPrice == null);

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

// ============ ENTRADAS DE VEHÍCULO ============

export const listVehicleIntakes = async (req, res) => {
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  const data = await VehicleIntake.find(q).sort({ intakeDate: -1, createdAt: -1 });
  res.json({ data });
};

export const createVehicleIntake = async (req, res) => {
  const b = req.body;
  const doc = await VehicleIntake.create({
    companyId: req.companyId,
    brand: (b.brand || "").toUpperCase().trim(),
    model: (b.model || "").toUpperCase().trim(),
    engine: (b.engine || "").toUpperCase().trim(),
    intakeDate: b.intakeDate ? new Date(b.intakeDate) : new Date(),
    entryPrice: +b.entryPrice || 0,
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
      ...(b.brand  !== undefined ? { brand:  (b.brand  || "").toUpperCase().trim() } : {}),
      ...(b.model  !== undefined ? { model:  (b.model  || "").toUpperCase().trim() } : {}),
      ...(b.engine !== undefined ? { engine: (b.engine || "").toUpperCase().trim() } : {}),
      ...(b.intakeDate !== undefined ? { intakeDate: new Date(b.intakeDate) } : {}),
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

// ======================= ÍTEMS ========================

export const listItems = async (req, res) => {
  const { name, sku, vehicleTarget, vehicleIntakeId } = req.query;
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };

  if (name) q.$or = [{ name: new RegExp((name || "").trim().toUpperCase(), "i") }, { internalName: new RegExp((name || "").trim().toUpperCase(), "i") }];
  if (sku)  q.sku  = new RegExp((sku  || "").trim().toUpperCase(), "i");

  if (vehicleIntakeId && mongoose.Types.ObjectId.isValid(vehicleIntakeId)) {
    q.vehicleIntakeId = new mongoose.Types.ObjectId(vehicleIntakeId);
  } else if (vehicleTarget) {
    q.vehicleTarget = new RegExp((vehicleTarget || "").trim().toUpperCase(), "i");
  }

  const data = await Item.find(q).sort({ createdAt: -1 });
  res.json({ data });
};

export const createItem = async (req, res) => {
  const b = req.body;

  if (b.sku)  b.sku  = b.sku.toUpperCase().trim();
  if (b.name) b.name = b.name.toUpperCase().trim();
  if (b.internalName) b.internalName = b.internalName.toUpperCase().trim();
  if (b.location) b.location = b.location.toUpperCase().trim();
  if (b.internalName) b.internalName = b.internalName.toUpperCase().trim();
  if (b.location) b.location = b.location.toUpperCase().trim();

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
    vehicleTarget: (b.vehicleTarget || "VITRINAS").toUpperCase().trim(),
    vehicleIntakeId: b.vehicleIntakeId || null,
    entryPrice: b.entryPrice ?? null,
    entryPriceIsAuto: !!b.entryPriceIsAuto,
    salePrice: +b.salePrice || 0,
    original: !!b.original,
    stock: Number.isFinite(+b.stock) ? +b.stock : 0,
    internalName: b.internalName || "",
    location: b.location || "",
    images,
    qrData: "" // inicial, lo llenamos abajo
  });

  // Si aún no tiene QR, lo generamos y guardamos
  if (!item.qrData) {
    item.qrData = makeQrData({ companyId: req.companyId, item });
    await item.save();
  }

  if (item.vehicleIntakeId) {
    await recalcAutoEntryPrices(req.companyId, item.vehicleIntakeId);
  }

  res.status(201).json({ item });
};

export const updateItem = async (req, res) => {
  const { id } = req.params;
  const b = req.body;

  if (b.sku)  b.sku  = b.sku.toUpperCase().trim();
  if (b.name) b.name = b.name.toUpperCase().trim();
  if (b.internalName) b.internalName = b.internalName.toUpperCase().trim();
  if (b.location) b.location = b.location.toUpperCase().trim();
  if (b.internalName) b.internalName = b.internalName.toUpperCase().trim();
  if (b.location) b.location = b.location.toUpperCase().trim();

  if (b.vehicleIntakeId) {
    const vi = await VehicleIntake.findOne({ _id: b.vehicleIntakeId, companyId: req.companyId });
    if (vi && (!b.vehicleTarget || b.vehicleTarget === "VITRINAS")) {
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

  // ---- imágenes ----
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

  res.json({ item });
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

// ===== NUEVO =====
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
