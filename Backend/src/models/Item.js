import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  sku: { type: String, required: true, uppercase: true, index: true, trim: true },
  name: { type: String, required: true, uppercase: true, index: true, trim: true },
  vehicleTarget: { type: String, required: true, uppercase: true, default: "VITRINAS", index: true },
  vehicleIntakeId: { type: mongoose.Types.ObjectId, ref: "VehicleIntake" },
  entryPrice: { type: Number, min: 0 },
  salePrice: { type: Number, min: 0, required: true },
  original: { type: Boolean, default: false },
  stock: { type: Number, min: 0, default: 0, index: true },
}, { timestamps: true });

itemSchema.index({ companyId: 1, sku: 1 }, { unique: true });
itemSchema.index({ companyId: 1, name: 1, vehicleTarget: 1 });

export default mongoose.model("Item", itemSchema);
