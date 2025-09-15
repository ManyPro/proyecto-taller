import mongoose from "mongoose";
import Item from "../models/Item.js";
import VehicleIntake from "../models/VehicleIntake.js";
import StockMove from "../models/StockMove.js";

export const createVehicleIntake = async (req, res) => {
  const body = req.body;
  ["brand","model","engine"].forEach(k => body[k] = body[k].toUpperCase().trim());
  body.companyId = req.companyId;
  const doc = await VehicleIntake.create(body);
  res.status(201).json({ vehicleIntake: doc });
};

export const listVehicleIntakes = async (req, res) => {
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  const data = await VehicleIntake.find(q).sort({ intakeDate: -1 }).limit(200);
  res.json({ data });
};

async function resolveEntryPriceIfMissing({ companyId, name, vehicleIntakeId }) {
  if (!vehicleIntakeId) return 0;
  const agg = await Item.aggregate([
    { $match: { companyId: new mongoose.Types.ObjectId(companyId), name: name.toUpperCase().trim(), vehicleIntakeId: new mongoose.Types.ObjectId(vehicleIntakeId) } },
    { $group: { _id: null, avg: { $avg: "$entryPrice" } } }
  ]);
  if (agg.length && agg[0].avg) return agg[0].avg;
  const vi = await VehicleIntake.findOne({ _id: vehicleIntakeId, companyId });
  return vi?.entryPrice || 0;
}

export const createItem = async (req, res) => {
  const body = req.body;
  body.companyId = req.companyId;
  body.sku = body.sku.toUpperCase().trim();
  body.name = body.name.toUpperCase().trim();
  body.vehicleTarget = (body.vehicleTarget || "VITRINAS").toUpperCase().trim();

  if (!body.entryPrice || body.entryPrice === 0) {
    body.entryPrice = await resolveEntryPriceIfMissing({ companyId: req.companyId, name: body.name, vehicleIntakeId: body.vehicleIntakeId });
  }

  const item = await Item.create(body);
  if (item.stock > 0) {
    await StockMove.create({ companyId: req.companyId, itemId: item._id, qty: item.stock, reason: "IN", meta: { seed: true } });
  }
  res.status(201).json({ item });
};

export const listItems = async (req, res) => {
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  const { sku, name, vehicleTarget, original, stockMin=0, page=1, limit=50 } = req.query;
  if (sku) q.sku = sku.toUpperCase().trim();
  if (name) q.name = new RegExp(name.toUpperCase().trim(), "i");
  if (vehicleTarget) q.vehicleTarget = vehicleTarget.toUpperCase().trim();
  if (original !== undefined) q.original = original === "true";
  if (stockMin) q.stock = { $gte: +stockMin };
  const data = await Item.find(q).sort({ updatedAt: -1 }).skip((+page-1)*+limit).limit(+limit);
  res.json({ data });
};

export const updateItem = async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  ["sku","name","vehicleTarget"].forEach(k => { if (body[k]) body[k] = body[k].toUpperCase().trim(); });
  const it = await Item.findOneAndUpdate({ _id: id, companyId: req.companyId }, body, { new: true });
  if (!it) return res.status(404).json({ error: "Item no encontrado" });
  res.json({ item: it });
};

export const deleteItem = async (req, res) => {
  const { id } = req.params;
  const it = await Item.findOne({ _id: id, companyId: req.companyId });
  if (!it) return res.status(404).json({ error: "Item no encontrado" });
  if (it.stock > 0) return res.status(400).json({ error: "No se puede eliminar con stock > 0" });
  await it.deleteOne();
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
