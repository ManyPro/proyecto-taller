import mongoose from 'mongoose';

const CashFlowEntrySchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
  date: { type: Date, default: Date.now, index: true },
  kind: { type: String, enum: ['IN','OUT'], required: true },
  source: { type: String, enum: ['SALE','MANUAL'], default: 'MANUAL', index: true },
  sourceRef: { type: mongoose.Schema.Types.ObjectId },
  description: { type: String, default: '' },
  amount: { type: Number, required: true }, // siempre positivo
  balanceAfter: { type: Number, default: 0 },
  meta: { type: Object, default: {} }
}, { timestamps: true });

CashFlowEntrySchema.index({ companyId: 1, accountId: 1, date: -1 });
CashFlowEntrySchema.index({ companyId: 1, source: 1, sourceRef: 1 });

export default mongoose.model('CashFlowEntry', CashFlowEntrySchema);
