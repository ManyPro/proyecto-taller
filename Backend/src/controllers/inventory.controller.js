// Backend/src/controllers/inventory.controller.js
import mongoose from "mongoose";
import VehicleIntake from "../models/VehicleIntake.js";
import Item from "../models/Item.js";

// ---------------------------------------------
// helpers
// ---------------------------------------------
function makeIntakeLabel(vi) {
  return `${(vi?.brand || "").trim()} ${(vi?.model || "").trim()} ${(vi?.engine || "").trim()}`
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Extrae datos de imagen desde req.file (si existe) o desde el body.
 * Soporta varios adaptadores de subida (Cloudinary, S3/multer, local, GridFS).
 * Prioridad: req.file > body.imageUrl/imagePublicId
 */
function extractImageFromReq(req, body = {}) {
  let imageUrl = body.imageUrl ?? null;
  let imagePublicId = body.imagePublicId ?? null;

  const f = req.file;
  if (f) {
    // Cloudinary (multer-storage-cloudinary)
    if (f.secure_url || f.path) {
      imageUrl = f.secure_url || f.path;
      imagePublicId = f.public_id || imagePublicId || null;
    }
    // S3 (aws-sdk, multer-s3)
    else if (f.location) {
      imageUrl = f.location;
      imagePublicId = f.key || f.filename || imagePublicId || null;
    }
    // Multer (disco) / GridFS genérico
    else if (f.filename || f.id) {
      // Ajusta según tu endpoint público si lo tienes (p.ej. /api/v1/files/:id)
      imageUrl = f.path || imageUrl;
      imagePublicId = f.filename || f.id || imagePublicId || null;
    }
  }
  return { imageUrl, imagePublicId };
}

// --------------------------------------------------------------------
// Recalcula prorrateo de entrada ponderado por STOCK en ítems AUTO.
// - Ítems MANUAL: respetados (entryPrice * stock) y descontados del total.
// - Ítems AUTO: reciben precio unitario = remaining / sumStockAuto.
// --------------------------------------------------------------------
async function recalcAutoEntryPrices(companyId, vehicleIntakeId) {
  if (!vehicleIntakeId) return;

  const intake = await VehicleIntake.findOne({ _id: vehicleIntakeId, companyId });
  if (!intake) return;

  const items = await Item.find({ companyId, vehicleIntakeId });
  if (!items.length) return;

  const manual = items.filter((it) => !it.entryPriceIsAuto && it.entryPrice != null);
  const auto = items.filter((it) => it.entryPriceIsAuto || it.entryPrice == null);

  const manualTotal = manual.reduce(
    (s, it) => s + (it.entryPrice || 0) * Math.max(0, it.stock || 0),
    0
  );
  const vehicleTotal = intake.entryPrice || 0;
  let remaining = Math.max(vehicleTotal - manualTotal, 0);

  const autoStockTotal = auto.reduce((s, it) => s + Math.max(0, it.stock || 0), 0);
  if (!auto.length) return;

  let unit = 0;
  if (autoStockTotal > 0) {
    unit = Math.round((remaining / autoStockTotal) * 100) / 100; // 2 decimales
  }

  for (const it of auto) {
    it.entryPrice = unit;
    it.entryPriceIsAuto = true;
    await it.save();
  }
}

// ====================== ENTRADAS DE VEHÍCULO ======================

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
      ...(b.brand !== undefined ? { brand: (b.brand || "").toUpperCase().trim() } : {}),
      ...(b.model !== undefined ? { model: (b.model || "").toUpperCase().trim() } : {}),
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

// =========================== ÍTEMS ============================

export const listItems = async (req, res) => {
  const { name, sku, vehicleTarget } = req.query;
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  if (name) q.name = new RegExp((name || "").trim().toUpperCase(), "i");
  if (sku) q.sku = new RegExp((sku || "").trim().toUpperCase(), "i");
  if (vehicleTarget) q.vehicleTarget = new RegExp((vehicleTarget || "").trim().toUpperCase(), "i");

  const data = await Item.find(q).sort({ createdAt: -1 });
  res.json({ data });
};

export const createItem = async (req, res) => {
  const b = req.body;

  if (b.sku) b.sku = b.sku.toUpperCase().trim();
  if (b.name) b.name = b.name.toUpperCase().trim();

  // Si hay entrada y el destino está vacío/VITRINAS -> usa etiqueta de la entrada
  if (b.vehicleIntakeId) {
    const vi = await VehicleIntake.findOne({ _id: b.vehicleIntakeId, companyId: req.companyId });
    if (vi && (!b.vehicleTarget || b.vehicleTarget === "VITRINAS")) {
      b.vehicleTarget = makeIntakeLabel(vi);
    }
  }

  // entryPrice AUTO si viene vacío y hay entrada
  if ((b.entryPrice === undefined || b.entryPrice === null || b.entryPrice === "") && b.vehicleIntakeId) {
    b.entryPrice = null;
    b.entryPriceIsAuto = true;
  } else if (b.entryPrice !== undefined && b.entryPrice !== null && b.entryPrice !== "") {
    b.entryPrice = +b.entryPrice;
    b.entryPriceIsAuto = false;
  }

  // --- NUEVO: imagen ---
  const { imageUrl, imagePublicId } = extractImageFromReq(req, b);

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
    // imagen
    imageUrl: imageUrl || null,
    imagePublicId: imagePublicId || null,
  });

  if (item.vehicleIntakeId) {
    await recalcAutoEntryPrices(req.companyId, item.vehicleIntakeId);
  }

  res.status(201).json({ item });
};

export const updateItem = async (req, res) => {
  const { id } = req.params;
  const b = req.body;

  if (b.sku) b.sku = b.sku.toUpperCase().trim();
  if (b.name) b.name = b.name.toUpperCase().trim();

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

  // --- NUEVO: imagen ---
  const img = extractImageFromReq(req, b);
  const toSet = {
    ...b,
  };
  if (img.imageUrl !== undefined) toSet.imageUrl = img.imageUrl || null;
  if (img.imagePublicId !== undefined) toSet.imagePublicId = img.imagePublicId || null;

  const before = await Item.findOne({ _id: id, companyId: req.companyId });
  const item = await Item.findOneAndUpdate(
    { _id: id, companyId: req.companyId },
    toSet,
    { new: true }
  );
  if (!item) return res.status(404).json({ error: "Item no encontrado" });

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

  // Si más adelante usas Cloudinary/S3, aquí podrías borrar el asset con doc.imagePublicId
  res.status(204).end();
};

// (Opcional) recálculo manual
export const recalcIntakePrices = async (req, res) => {
  await recalcAutoEntryPrices(req.companyId, req.params.id);
  res.json({ ok: true });
};
