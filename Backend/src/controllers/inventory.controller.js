import mongoose from "mongoose";
import * as XLSX from "xlsx";
import VehicleIntake from "../models/VehicleIntake.js";
import Item from "../models/Item.js";

// ===== Helpers =====
function makeIntakeLabel(vi) {
  return `${(vi?.brand || "").trim()} ${(vi?.model || "").trim()} ${(vi?.engine || "").trim()}`
    .replace(/\s+/g, " ").trim().toUpperCase();
}

// Prorrateo por STOCK (unitario = remanente / sum(stock AUTO))
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
  const remaining = Math.max(vehicleTotal - manualTotal, 0);

  const autoStockTotal = auto.reduce((s, it) => s + Math.max(0, it.stock || 0), 0);
  const unit = autoStockTotal > 0 ? Math.round((remaining / autoStockTotal) * 100) / 100 : 0;

  for (const it of auto) {
    it.entryPrice = unit;
    it.entryPriceIsAuto = true;
    await it.save();
  }
}

// ===== Entradas de vehículo =====
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
    return res.status(400).json({ error: `No se puede eliminar: hay ${linked} ítem(s) vinculados.` });
  }
  const del = await VehicleIntake.findOneAndDelete({ _id: id, companyId: req.companyId });
  if (!del) return res.status(404).json({ error: "Entrada no encontrada" });
  res.status(204).end();
};

// ===== Ítems =====
export const listItems = async (req, res) => {
  const { name, sku, vehicleTarget } = req.query;
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  if (name) q.name = new RegExp((name || "").trim().toUpperCase(), "i");
  if (sku)  q.sku  = new RegExp((sku  || "").trim().toUpperCase(), "i");
  if (vehicleTarget) q.vehicleTarget = new RegExp((vehicleTarget || "").trim().toUpperCase(), "i");

  const data = await Item.find(q).sort({ createdAt: -1 });
  res.json({ data });
};

export const createItem = async (req, res) => {
  const b = req.body;

  if (b.sku)  b.sku  = b.sku.toUpperCase().trim();
  if (b.name) b.name = b.name.toUpperCase().trim();

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

  const image = req.file || null;
  const imageFileId = image?.id || image?._id || null;
  const imageUrl = imageFileId ? `/api/v1/files/${imageFileId}` : null;

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
    imageFileId, imageUrl,
  });

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
  const item = await Item.findOneAndUpdate(
    { _id: id, companyId: req.companyId },
    b,
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
  res.status(204).end();
};

// (opcional) recálculo manual
export const recalcIntakePrices = async (req, res) => {
  await recalcAutoEntryPrices(req.companyId, req.params.id);
  res.json({ ok: true });
};

// ===== Export / Import Excel =====
export const exportItemsXlsx = async (req, res) => {
  const items = await Item.find({ companyId: req.companyId }).lean();

  const rows = items.map(it => ({
    sku: it.sku,
    name: it.name,
    vehicleTarget: it.vehicleTarget,
    vehicleIntakeId: it.vehicleIntakeId?.toString() || "",
    entryPrice: it.entryPrice ?? "",
    entryPriceIsAuto: it.entryPriceIsAuto ? "TRUE" : "FALSE",
    salePrice: it.salePrice,
    original: it.original ? "TRUE" : "FALSE",
    stock: it.stock,
    imageFileId: it.imageFileId?.toString() || "",
    imageUrl: it.imageUrl || "",
    createdAt: it.createdAt,
    updatedAt: it.updatedAt,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Inventario");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=inventario.xlsx");
  res.send(buf);
};

export const importItemsXlsx = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Sube un archivo .xlsx" });

  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const upserts = [];
  for (const r of rows) {
    const b = {
      companyId: req.companyId,
      sku: String(r.sku || "").toUpperCase().trim(),
      name: String(r.name || "").toUpperCase().trim(),
      vehicleTarget: String(r.vehicleTarget || "VITRINAS").toUpperCase().trim(),
      vehicleIntakeId: r.vehicleIntakeId ? new mongoose.Types.ObjectId(r.vehicleIntakeId) : null,
      salePrice: +r.salePrice || 0,
      original: String(r.original).toUpperCase() === "TRUE",
      stock: +r.stock || 0,
    };

    // Si no viene entryPrice y hay entrada -> AUTO
    if ((r.entryPrice === "" || r.entryPrice === null || r.entryPrice === undefined) && b.vehicleIntakeId) {
      b.entryPrice = null; b.entryPriceIsAuto = true;
    } else {
      b.entryPrice = r.entryPrice === "" ? null : +r.entryPrice;
      b.entryPriceIsAuto = String(r.entryPriceIsAuto).toUpperCase() === "TRUE";
    }

    if (!b.sku || !b.name) continue; // mínima validación

    upserts.push(
      Item.findOneAndUpdate(
        { companyId: req.companyId, sku: b.sku },
        b,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    );
  }

  const saved = await Promise.all(upserts);

  // Recalcular prorrateos por cada entrada afectada
  const intakeIds = [...new Set(saved.map(x => x?.vehicleIntakeId?.toString()).filter(Boolean))];
  await Promise.all(intakeIds.map(id => recalcAutoEntryPrices(req.companyId, id)));

  res.json({ ok: true, upserted: saved.length });
};
