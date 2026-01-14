import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true, trim: true, uppercase: true },
  contactInfo: {
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" }
  },
  notes: { type: String, trim: true, default: "" },
  active: { type: Boolean, default: true, index: true }
}, { timestamps: true });

supplierSchema.index({ companyId: 1, name: 1 });
supplierSchema.index({ companyId: 1, active: 1 });

export default mongoose.model("Supplier", supplierSchema);
