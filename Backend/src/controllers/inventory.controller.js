// Backend/src/controllers/inventory.controller.js
import mongoose from "mongoose";
import QRCode from "qrcode";
import VehicleIntake from "../models/VehicleIntake.js";
import Item from "../models/Item.js";

/* =============== helpers =============== */
const toUpper = (s) => (s ?? "").toString().trim().toUpperCase();

function sanitizeMediaList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((m) => (m && typeof m === "object" ? m : {}))
    .filter((m) => m.url && m.publicId && m.mimetype)
    .map((m) => ({
      url: String(m.url),
      publicId: String(m.publicId),
      mimetype: String(m.mimetype)
    }));
}

function makeIntakeLabel(vi) {
  return `${toUpper(vi?.brand)} ${toUpper(vi?.model)} ${toUpper(vi?.engine)}`
    .replace(/\s+/g, " ")
    .trim();
}

// QR payload estable
function makeQrData({ companyId, item }) {
  const payload = { t: "ITEM", c: String(companyId), i: String(item._id), s: item.sku || null };
  return JSON.stringify(payload);
}

// Propaga/precalcula entryPrice automático para ítems ligados a una entrada
async function recalcAutoEntryPrices(companyId, intakeId, forcedPrice) {
  if (!intakeId) return;
  let price = forcedPrice;
  if (price === undefined) {
    const vi = await VehicleIntake.findOne({ _id: intakeId, companyId });
    price = vi?.price ?? null;
  }
  if (price === null || price === undefined) return;

  await Item.updateMany(
    {
      companyId,
      vehicleIntakeId: intakeId,
      $or: [{ entryPriceIsAuto: true }, { entryPrice: null }]
    },
    { $set: { entryPrice: price, entryPriceIsAuto: true } }
  );
}

/* =============== vehicle intakes =============== */
export const listVehicleIntakes = async (req, res) => {
  const companyId = new mongoose.Types.ObjectId(req.companyId);
  const data = await VehicleIntake.find({ companyId }).sort({ intakeDate: -1, createdAt: -1 });
  res.json({ data });
};

export const createVehicleIntake = async (req, res) => {
  const b = req.body || {};
  const doc = await VehicleIntake.create({
    companyId: req.companyId,
    brand: toUpper(b.brand),
    model: toUpper(b.model),
    engine: toUpper(b.engine),
    intakeDate: b.intakeDate ? new Date(b.intakeDate) : new Date(),
    price: Number.isFinite(+b.price) ? +b.price : null
  });
  await recalcAutoEntryPrices(req.companyId, doc._id, doc.price ?? undefined);
  res.status(201).json({ intake: doc });
};

export const updateVehicleIntake = async (req, res) => {
  const { id } = req.params;
  const b = req.body || {};
  const before = await VehicleIntake.findOne({ _id: id, companyId: req.companyId });
  if (!before) return res.status(404).json({ error: "Entrada no encontrada" });

  const update = {
    brand: b.brand !== undefined ? toUpper(b.brand) : before.brand,
    model: b.model !== undefined ? toUpper(b.model) : before.model,
    engine: b.engine !== undefined ? toUpper(b.engine) : before.engine,
    intakeDate: b.intakeDate ? new Date(b.intakeDate) : before.intakeDate,
    price: b.price !== undefined ? (Number.isFinite(+b.price) ? +b.price : null) : before.price
  };

  const after = await VehicleIntake.findOneAndUpdate(
    { _id: id, companyId: req.companyId },
    update,
    { new: true }
  );

  if (before.price !== after.price) {
    await recalcAutoEntryPrices(req.companyId, after._id, after.price ?? undefined);
  }
  res.json({ intake: after });
};

export const deleteVehicleIntake = async (req, res) => {
  const { id } = req.params;
  const del = await VehicleIntake.findOneAndDelete({ _id: id, companyId: req.companyId });
  if (!del) return res.status(404).json({ error: "Entrada no encontrada" });
  res.status(204).end();
};

export const recalcIntakePrices = async (req, res) => {
  const { id } = req.params;
  const vi = await VehicleIntake.findOne({ _id: id, companyId: req.companyId });
  if (!vi) return res.status(404).json({ error: "Entrada no encontrada" });
  await recalcAutoEntryPrices(req.companyId, vi._id, vi.price ?? undefined);
  res.json({ ok: true });
};

/* =============== items =============== */
export const listItems = async (req, res) => {
  const { name, sku, vehicleTarget, vehicleIntakeId } = req.query;
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };

  if (name) {
    const re = new RegExp(toUpper(name), "i");
    q.$or = [{ name: re }, { internalName: re }]; // incluye nombre interno
  }
  if (sku) q.sku = new RegExp(toUpper(sku), "i");
  if (vehicleTarget) q.vehicleTarget = new RegExp(toUpper(vehicleTarget), "i");
  if (vehicleIntakeId && mongoose.Types.ObjectId.isValid(vehicleIntakeId)) {
    q.vehicleIntakeId = new mongoose.Types.ObjectId(vehicleIntakeId);
  }

  const data = await Item.find(q).sort({ createdAt: -1 });
  res.json({ data });
};

export const createItem = async (req, res) => {
  const b = req.body || {};
  const images = sanitizeMediaList(b.images);

  const doc = await Item.create({
    companyId: req.companyId,
    sku: toUpper(b.sku),
    name: toUpper(b.name),
    internalName: toUpper(b.internalName),       // opcional
    storageLocation: toUpper(b.storageLocation), // opcional
    vehicleTarget: toUpper(b.vehicleTarget || "VITRINAS"),
    vehicleIntakeId: b.vehicleIntakeId || null,
    entryPrice: b.entryPrice !== undefined && b.entryPrice !== null && b.entryPrice !== "" ? +b.entryPrice : null,
    entryPriceIsAuto: !!b.entryPriceIsAuto,
    salePrice: Number.isFinite(+b.salePrice) ? +b.salePrice : 0,
    original: !!b.original,
    stock: Number.isFinite(+b.stock) ? +b.stock : 0,
    images,
    qrData: "" // se completa abajo
  });

  if (!doc.qrData) {
    doc.qrData = makeQrData({ companyId: req.companyId, item: doc });
    await doc.save();
  }

  if (doc.vehicleIntakeId) {
    await recalcAutoEntryPrices(req.companyId, doc.vehicleIntakeId);
  }

  res.status(201).json({ item: doc });
};

export const updateItem = async (req, res) => {
  const { id } = req.params;
  const b = req.body || {};
  const before = await Item.findOne({ _id: id, companyId: req.companyId });
  if (!before) return res.status(404).json({ error: "Item no encontrado" });

  const images = Array.isArray(b.images) ? sanitizeMediaList(b.images) : undefined;

  const update = {
    ...(b.sku !== undefined ? { sku: toUpper(b.sku) } : {}),
    ...(b.name !== undefined ? { name: toUpper(b.name) } : {}),
    ...(b.internalName !== undefined ? { internalName: toUpper(b.internalName) } : {}),
    ...(b.storageLocation !== undefined ? { storageLocation: toUpper(b.storageLocation) } : {}),
    ...(b.vehicleTarget !== undefined ? { vehicleTarget: toUpper(b.vehicleTarget) } : {}),
    ...(b.vehicleIntakeId !== undefined ? { vehicleIntakeId: b.vehicleIntakeId || null } : {}),
    ...(b.entryPrice !== undefined ? { entryPrice: b.entryPrice === null || b.entryPrice === "" ? null : +b.entryPrice } : {}),
    ...(b.entryPriceIsAuto !== undefined ? { entryPriceIsAuto: !!b.entryPriceIsAuto } : {}),
    ...(b.salePrice !== undefined ? { salePrice: Number.isFinite(+b.salePrice) ? +b.salePrice : 0 } : {}),
    ...(b.original !== undefined ? { original: !!b.original } : {}),
    ...(b.stock !== undefined ? { stock: Number.isFinite(+b.stock) ? +b.stock : 0 } : {}),
    ...(images ? { images } : {})
  };

  let after = await Item.findOneAndUpdate({ _id: id, companyId: req.companyId }, update, { new: true });

  if (!after.qrData) {
    after.qrData = makeQrData({ companyId: req.companyId, item: after });
    after = await after.save();
  }

  if (after.vehicleIntakeId) {
    await recalcAutoEntryPrices(req.companyId, after.vehicleIntakeId);
  }

  res.json({ item: after });
};

export const deleteItem = async (req, res) => {
  const { id } = req.params;
  const del = await Item.findOneAndDelete({ _id: id, companyId: req.companyId });
  if (!del) return res.status(404).json({ error: "Item no encontrado" });
  res.status(204).end();
};

// PNG de QR de un ítem
export const itemQrPng = async (req, res) => {
  const { id } = req.params;
  const size = Math.min(Math.max(parseInt(req.query.size || "256", 10), 120), 1024);
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
  res.end(png);
};
