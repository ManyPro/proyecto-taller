// Backend/src/models/Item.js
import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
      required: true,
    },

    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },

    // Tu lógica actual
    vehicleDest: { type: String, default: "VITRINAS" },
    vehicleIntake: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleIntake",
      default: null,
    },

    entryPrice: { type: Number, default: 0 },
    salePrice: { type: Number, required: true },
    original: { type: Boolean, default: false },
    stock: { type: Number, default: 0 },

    // NUEVO: campos de imagen (vacíos por defecto)
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Item", ItemSchema);
