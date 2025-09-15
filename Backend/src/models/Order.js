import mongoose from "mongoose";
const lineSchema = new mongoose.Schema({
  itemId: { type: mongoose.Types.ObjectId, ref: "Item", required: true },
  qty: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  lines: { type: [lineSchema], required: true },
  note: { type: String, trim: true },
  total: { type: Number, min: 0, required: true },
}, { timestamps: true });

orderSchema.index({ companyId: 1, createdAt: -1 });
export default mongoose.model("Order", orderSchema);
