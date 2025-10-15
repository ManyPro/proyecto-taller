import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  publicId: { type: String, required: true, trim: true },
  mimetype: { type: String, required: true, trim: true }
}, { _id: false });

// Public image subset for catalog (simplified)
const publicImageSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  alt: { type: String, trim: true, default: "" }
}, { _id: false });

const itemSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  sku: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, uppercase: true, trim: true },
  internalName: { type: String, uppercase: true, trim: true, default: "" },
  brand: { type: String, uppercase: true, trim: true, default: "" },
  location: { type: String, uppercase: true, trim: true, default: "" },
  vehicleTarget: { type: String, required: true, uppercase: true, trim: true, default: "GENERAL" },
  vehicleIntakeId: { type: mongoose.Types.ObjectId, ref: "VehicleIntake", default: null },

  entryPrice: { type: Number, default: null, min: 0 },
  entryPriceIsAuto: { type: Boolean, default: false },

  salePrice: { type: Number, default: 0, min: 0 },
  original: { type: Boolean, default: false },
  stock: { type: Number, default: 0, min: 0 },
  // Umbral mínimo de stock para alertas (por ítem)
  minStock: { type: Number, default: 0, min: 0 },
  // Marca de última alerta enviada para evitar spam
  lowStockAlertedAt: { type: Date, default: null },

  images: { type: [mediaSchema], default: [] },

  // NUEVO: payload estable del QR
  qrData: { type: String, default: "", trim: true },

  // === Campos Catálogo Público ===
  published: { type: Boolean, default: false, index: true },
  publicPrice: { type: Number, min: 0 }, // si no se define usar salePrice
  publicDescription: { type: String, trim: true, default: "" },
  publicImages: { type: [publicImageSchema], default: [] }, // subset seguro para público
  tags: { type: [String], default: [], index: true },
  category: { type: String, trim: true, default: "" },
  publishedAt: { type: Date },
  publishedBy: { type: mongoose.Types.ObjectId, ref: 'Account' }
}, { timestamps: true });

itemSchema.index({ companyId: 1, sku: 1 }, { unique: true });
itemSchema.index({ companyId: 1, vehicleIntakeId: 1 });
itemSchema.index({ companyId: 1, published: 1 });
itemSchema.index({ companyId: 1, published: 1, category: 1 });
itemSchema.index({ companyId: 1, published: 1, tags: 1 });

export default mongoose.model("Item", itemSchema);
