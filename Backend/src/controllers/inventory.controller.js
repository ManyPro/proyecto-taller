import mongoose from "mongoose";
import Item from "../models/Item.js";
import VehicleIntake from "../models/VehicleIntake.js";
import StockMove from "../models/StockMove.js";

export const createVehicleIntake = async (req, res) => {
  const body = req.body;
  ["brand", "model", "engine"].forEach(k => body[k] = body[k].toUpperCase().trim());
  body.companyId = req.companyId;
  const doc = await VehicleIntake.create(body);
  res.status(201).json({ vehicleIntake: doc });
};

export const listVehicleIntakes = async (req, res) => {
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  const data = await VehicleIntake.find(q).sort({ intakeDate: -1 }).limit(200);
  res.json({ data });
};

async function recalcAutoEntryPrices(companyId, vehicleIntakeId) {
  const intake = await VehicleIntake.findOne({ _id: vehicleIntakeId, companyId });
  if (!intake) return;

  const items = await Item.find({ companyId, vehicleIntakeId });
  if (!items.length) return;

  const manual = items.filter(it => !it.entryPriceIsAuto && it.entryPrice != null);
  const auto = items.filter(it => it.entryPriceIsAuto || it.entryPrice == null);

  const manualSum = manual.reduce((s, it) => s + (it.entryPrice || 0), 0);
  let remaining = Math.max((intake.entryPrice || 0) - manualSum, 0);

  if (!auto.length) return;

  // reparto igual; cuido redondeo a 2 decimales y ajusto el último
  const share = Math.floor((remaining / auto.length) * 100) / 100;
  let assigned = 0;

  for (let i = 0; i < auto.length; i++) {
    const price = (i === auto.length - 1)
      ? Math.round((remaining - assigned) * 100) / 100
      : share;
    auto[i].entryPrice = price;
    auto[i].entryPriceIsAuto = true;
    assigned += price;
    await auto[i].save();
  }
}


export const createItem = async (req, res) => {
  const body = req.body;
  body.companyId = req.companyId;

  // normalizaciones
  if (body.sku) body.sku = body.sku.toUpperCase().trim();
  if (body.name) body.name = body.name.toUpperCase().trim();

  // si viene entrada de vehículo y no hay destino (o es VITRINAS), lo fijo al mismo valor
  if (body.vehicleIntakeId) {
    const vi = await VehicleIntake.findOne({ _id: body.vehicleIntakeId, companyId: req.companyId });
    if (vi && (!body.vehicleTarget || body.vehicleTarget === "VITRINAS")) {
      body.vehicleTarget = `${(vi.brand || "").trim()} ${(vi.model || "").trim()} ${(vi.engine || "").trim()}`
        .replace(/\s+/g, " ").trim().toUpperCase();
    }
  }

  // si no envían entryPrice y hay entrada: marcar como AUTO (prorrateo)
  if ((body.entryPrice === undefined || body.entryPrice === null || body.entryPrice === "")
    && body.vehicleIntakeId) {
    body.entryPrice = null;
    body.entryPriceIsAuto = true;
  } else if (body.entryPrice !== undefined && body.entryPrice !== null && body.entryPrice !== "") {
    body.entryPrice = +body.entryPrice;
    body.entryPriceIsAuto = false;
  }

  const item = await Item.create(body);

  // Recalcular prorrateo si corresponde
  if (item.vehicleIntakeId) {
    await recalcAutoEntryPrices(req.companyId, item.vehicleIntakeId);
  }

  res.status(201).json({ item });
};


export const listItems = async (req, res) => {
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  const { sku, name, vehicleTarget, original, stockMin = 0, page = 1, limit = 50 } = req.query;
  if (sku) q.sku = sku.toUpperCase().trim();
  if (name) q.name = new RegExp(name.toUpperCase().trim(), "i");
  if (vehicleTarget) q.vehicleTarget = vehicleTarget.toUpperCase().trim();
  if (original !== undefined) q.original = original === "true";
  if (stockMin) q.stock = { $gte: +stockMin };
  const data = await Item.find(q).sort({ updatedAt: -1 }).skip((+page - 1) * +limit).limit(+limit);
  res.json({ data });
};

export const updateItem = async (req, res) => {
  const { id } = req.params;
  const body = req.body;

  if (body.sku) body.sku = body.sku.toUpperCase().trim();
  if (body.name) body.name = body.name.toUpperCase().trim();

  if (body.vehicleIntakeId) {
    const vi = await VehicleIntake.findOne({ _id: body.vehicleIntakeId, companyId: req.companyId });
    if (vi && (!body.vehicleTarget || body.vehicleTarget === "VITRINAS")) {
      body.vehicleTarget = `${(vi.brand || "")} ${(vi.model || "")} ${(vi.engine || "")}`
        .replace(/\s+/g, " ").trim().toUpperCase();
    }
  }

  if ("entryPrice" in body) {
    if (body.entryPrice === null || body.entryPrice === "" || body.entryPrice === undefined) {
      body.entryPrice = null;
      body.entryPriceIsAuto = !!body.vehicleIntakeId;
    } else {
      body.entryPrice = +body.entryPrice;
      body.entryPriceIsAuto = false;
    }
  }

  const before = await Item.findOne({ _id: id, companyId: req.companyId });
  const item = await Item.findOneAndUpdate(
    { _id: id, companyId: req.companyId },
    body,
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


export const moveStock = async (req, res) => {
  const { itemId, qty, reason, meta } = req.body;
  const it = await Item.findOne({ _id: itemId, companyId: req.companyId });
  if (!it) return res.status(404).json({ error: "Item no encontrado" });
  const newStock = it.stock + qty;
  if (newStock < 0) return res.status(400).json({ error: "Stock insuficiente" });
  it.stock = newStock;
  await it.save();
  const move = await StockMove.create({ companyId: req.companyId, itemId: it._id, qty, reason, meta });
  res.status(201).json({ move, stock: it.stock });
};
