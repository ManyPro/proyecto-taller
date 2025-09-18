import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  publicId: { type: String, required: true, trim: true },
  mimetype: { type: String, required: true, trim: true }
}, { _id: false });

const itemSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  sku: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, uppercase: true, trim: true },
  vehicleTarget: { type: String, required: true, uppercase: true, trim: true, default: "VITRINAS" },
  vehicleIntakeId: { type: mongoose.Types.ObjectId, ref: "VehicleIntake", default: null },

  entryPrice: { type: Number, default: null, min: 0 },
  entryPriceIsAuto: { type: Boolean, default: false },

  salePrice: { type: Number, default: 0, min: 0 },
  original: { type: Boolean, default: false },
  stock: { type: Number, default: 0, min: 0 },

  images: { type: [mediaSchema], default: [] },

  // NUEVO: payload estable del QR
  qrData: { type: String, default: "", trim: true }
}, { timestamps: true });

itemSchema.index({ companyId: 1, sku: 1 }, { unique: true });
itemSchema.index({ companyId: 1, vehicleIntakeId: 1 });

export default mongoose.model("Item", itemSchema);
