import mongoose from 'mongoose';

const RateSchema = new mongoose.Schema({
  kind: { type: String, required: true },
  percent: { type: Number, required: true, min: 0, max: 100 }
}, { _id: false });

const TechnicianSchema = new mongoose.Schema({
  name: { type: String, required: true, uppercase: true, trim: true },
  active: { type: Boolean, default: true },
  color: { type: String, default: '#2563EB' }, // color identificador (hex)
  rates: { type: [RateSchema], default: [] }
}, { _id: false });

const LaborKindSchema = new mongoose.Schema({
  name: { type: String, required: true, uppercase: true, trim: true },
  defaultPercent: { type: Number, default: 0, min: 0, max: 100 }
}, { _id: false });

const TechnicianConfigSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  laborKinds: { type: [LaborKindSchema], default: [
    { name: 'MOTOR', defaultPercent: 0 },
    { name: 'SUSPENSION', defaultPercent: 0 },
    { name: 'FRENOS', defaultPercent: 0 }
  ] },
  technicians: { type: [TechnicianSchema], default: [] }
}, { timestamps: true });

TechnicianConfigSchema.index({ companyId: 1 }, { unique: true });

export default mongoose.model('TechnicianConfig', TechnicianConfigSchema);
