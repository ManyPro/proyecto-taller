import mongoose from 'mongoose';

const CustomerProfileHistorySchema = new mongoose.Schema({
  companyId: { type: String, index: true, required: true },
  profileId: { type: mongoose.Schema.Types.ObjectId, index: true },
  plate: { type: String, index: true },
  action: { type: String, enum: ['created','updated','unchanged'], index: true },
  diff: { type: Object, default: {} },
  snapshotAfter: { type: Object, default: {} },
  source: { type: String, default: '' }, // quote|sale|script|rebuild
  meta: { type: Object, default: {} }
}, { timestamps: true });

CustomerProfileHistorySchema.index({ companyId: 1, plate: 1, createdAt: -1 });

export default mongoose.model('CustomerProfileHistory', CustomerProfileHistorySchema);
