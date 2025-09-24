import mongoose from "mongoose";

const vehicleIntakeSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },

  // Nuevo: tipo de ingreso
  intakeKind: { type: String, enum: ["vehicle", "purchase"], default: "vehicle", index: true },

  // Campos de "vehicle"
  brand:  { type: String, uppercase: true, trim: true, default: "" },
  model:  { type: String, uppercase: true, trim: true, default: "" },
  engine: { type: String, uppercase: true, trim: true, default: "" },

  // Campos de "purchase"
  purchasePlace: { type: String, uppercase: true, trim: true, default: "" },

  // Comunes
  intakeDate: { type: Date, default: () => new Date(), index: true },
  entryPrice:  { type: Number, min: 0, default: 0 },
}, { timestamps: true });

// Índices usados en filtros/listados
vehicleIntakeSchema.index({ companyId: 1, intakeDate: -1 });

export default mongoose.model("VehicleIntake", vehicleIntakeSchema);
