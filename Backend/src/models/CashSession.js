import mongoose from 'mongoose';

const BalanceSnapshotSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  name: { type: String, default: '' },
  balance: { type: Number, default: 0 }
}, { _id: false });

const CashSessionSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN', index: true },
  openedAt: { type: Date, required: true },
  closedAt: { type: Date, default: null },
  openingBalances: { type: [BalanceSnapshotSchema], default: [] },
  closingBalances: { type: [BalanceSnapshotSchema], default: [] }
}, { timestamps: true });

CashSessionSchema.index({ companyId: 1, status: 1 });
CashSessionSchema.index({ companyId: 1, closedAt: -1 });

export default mongoose.model('CashSession', CashSessionSchema);
