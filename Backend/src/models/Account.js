import mongoose from 'mongoose';

const AccountSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['CASH','BANK'], default: 'CASH', index: true },
  currency: { type: String, default: 'COP' },
  active: { type: Boolean, default: true },
  initialBalance: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, { timestamps: true });

AccountSchema.index({ companyId: 1, name: 1 }, { unique: true });

export default mongoose.model('Account', AccountSchema);
