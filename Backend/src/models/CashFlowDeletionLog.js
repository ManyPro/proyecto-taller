import mongoose from 'mongoose';

const CashFlowDeletionLogSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  entryId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
  businessDate: { type: Date, required: true, index: true },
  entryDate: { type: Date, default: null },
  deletedAt: { type: Date, required: true, index: true },
  kind: { type: String, enum: ['IN', 'OUT'], required: true },
  source: { type: String, enum: ['SALE', 'MANUAL', 'RECEIVABLE', 'INVESTMENT', 'TRANSFER'], default: 'MANUAL' },
  amount: { type: Number, required: true },
  description: { type: String, default: '' }
}, { timestamps: true });

CashFlowDeletionLogSchema.index({ companyId: 1, deletedAt: 1 });
CashFlowDeletionLogSchema.index({ companyId: 1, businessDate: 1 });
CashFlowDeletionLogSchema.index({ companyId: 1, entryId: 1 }, { unique: true });

export default mongoose.model('CashFlowDeletionLog', CashFlowDeletionLogSchema);
