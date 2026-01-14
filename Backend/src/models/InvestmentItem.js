import mongoose from "mongoose";

const investmentItemSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  investorId: { type: mongoose.Types.ObjectId, ref: "Investor", required: true, index: true },
  purchaseId: { type: mongoose.Types.ObjectId, ref: "Purchase", default: null },
  itemId: { type: mongoose.Types.ObjectId, ref: "Item", required: true, index: true },
  stockEntryId: { type: mongoose.Types.ObjectId, ref: "StockEntry", required: true, index: true },
  purchasePrice: { type: Number, required: true, min: 0 },
  qty: { type: Number, required: true, min: 0 },
  status: { 
    type: String, 
    enum: ['available', 'sold', 'paid'], 
    default: 'available',
    index: true 
  },
  saleId: { type: mongoose.Types.ObjectId, ref: "Sale", default: null },
  soldAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  cashflowEntryId: { type: mongoose.Types.ObjectId, ref: "CashFlowEntry", default: null }
}, { timestamps: true });

investmentItemSchema.index({ companyId: 1, investorId: 1, status: 1 });
investmentItemSchema.index({ companyId: 1, itemId: 1 });
investmentItemSchema.index({ companyId: 1, stockEntryId: 1 });
investmentItemSchema.index({ companyId: 1, saleId: 1 });

export default mongoose.model("InvestmentItem", investmentItemSchema);
