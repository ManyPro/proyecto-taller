import mongoose from "mongoose";
const stockMoveSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  itemId: { type: mongoose.Types.ObjectId, ref: "Item", required: true, index: true },
  qty: { type: Number, required: true },
  reason: { type: String, enum: ["IN","OUT","ADJUST"], required: true, index: true },
  meta: { type: Object },
}, { timestamps: true });

stockMoveSchema.index({ companyId: 1, createdAt: -1 });
export default mongoose.model("StockMove", stockMoveSchema);
