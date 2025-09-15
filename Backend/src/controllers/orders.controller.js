import mongoose from "mongoose";
import Item from "../models/Item.js";
import Order from "../models/Order.js";
import StockMove from "../models/StockMove.js";

export const createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { lines, note } = req.body;
    if (!Array.isArray(lines) || !lines.length) throw new Error("lines requerido");
    let total = 0;

    for (const ln of lines) {
      const it = await Item.findOne({ _id: ln.itemId, companyId: req.companyId }).session(session);
      if (!it) throw new Error("Item no encontrado");
      if (it.stock < ln.qty) throw new Error(`Stock insuficiente para ${it.sku}`);
      it.stock -= ln.qty;
      await it.save({ session });
      await StockMove.create([{ companyId: req.companyId, itemId: it._id, qty: -ln.qty, reason: "OUT", meta: { order: true } }], { session });
      total += ln.qty * ln.unitPrice;
    }

    const order = await Order.create([{ companyId: req.companyId, lines, note, total }], { session });
    await session.commitTransaction();
    res.status(201).json({ order: order[0] });
  } catch (e) {
    await session.abortTransaction();
    res.status(400).json({ error: e.message });
  } finally {
    session.endSession();
  }
};

export const listOrders = async (req, res) => {
  const data = await Order.find({ companyId: req.companyId }).sort({ createdAt: -1 }).limit(100);
  res.json({ data });
};
