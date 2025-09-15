import mongoose from "mongoose";

const vehicleIntakeSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  brand: { type: String, required: true, uppercase: true, trim: true },
  model: { type: String, required: true, uppercase: true, trim: true },
  engine: { type: String, required: true, uppercase: true, trim: true },
  intakeDate: { type: Date, default: () => new Date(), index: true },
  entryPrice: { type: Number, min: 0, required: true },
}, { timestamps: true });

vehicleIntakeSchema.index({ companyId: 1, intakeDate: -1 });

export default mongoose.model("VehicleIntake", vehicleIntakeSchema);
