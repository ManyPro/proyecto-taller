import mongoose from "mongoose";

const purchaseItemSchema = new mongoose.Schema({
  itemId: { type: mongoose.Types.ObjectId, ref: "Item", required: true },
  qty: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 }
}, { _id: false });

const purchaseSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  supplierId: { type: mongoose.Types.ObjectId, ref: "Supplier", default: null },
  investorId: { type: mongoose.Types.ObjectId, ref: "Investor", default: null },
  purchaseDate: { type: Date, default: () => new Date(), index: true },
  totalAmount: { type: Number, default: 0, min: 0 },
  notes: { type: String, trim: true, default: "" },
  items: { type: [purchaseItemSchema], default: [] }
}, { timestamps: true });

purchaseSchema.index({ companyId: 1, purchaseDate: -1 });
purchaseSchema.index({ companyId: 1, supplierId: 1 });
purchaseSchema.index({ companyId: 1, investorId: 1 });

export default mongoose.model("Purchase", purchaseSchema);
