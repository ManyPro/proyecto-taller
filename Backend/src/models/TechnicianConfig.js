import mongoose from 'mongoose';

const RateSchema = new mongoose.Schema({
  kind: { type: String, required: true },
  percent: { type: Number, required: true, min: 0, max: 100 }
}, { _id: false });

const TechnicianSchema = new mongoose.Schema({
  name: { type: String, required: true, uppercase: true, trim: true },
  active: { type: Boolean, default: true },
  rates: { type: [RateSchema], default: [] }
}, { _id: false });

const TechnicianConfigSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  laborKinds: { type: [String], default: ['MOTOR','SUSPENSION','FRENOS'] },
  technicians: { type: [TechnicianSchema], default: [] }
}, { timestamps: true });

TechnicianConfigSchema.index({ companyId: 1 }, { unique: true });

export default mongoose.model('TechnicianConfig', TechnicianConfigSchema);

