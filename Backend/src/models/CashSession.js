import mongoose from 'mongoose';

const CashSessionSnapshotSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Account' },
  name: { type: String, default: '' },
  type: { type: String, enum: ['CASH', 'BANK'], default: 'CASH' },
  balance: { type: Number, default: 0 }
}, { _id: false });

const CashSessionReportRowSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Account' },
  name: { type: String, default: '' },
  type: { type: String, enum: ['CASH', 'BANK'], default: 'CASH' },
  openingBalance: { type: Number, default: 0 },
  income: { type: Number, default: 0 },
  expense: { type: Number, default: 0 },
  currentBalance: { type: Number, default: 0 }
}, { _id: false });

const CashSessionSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  businessDate: { type: Date, required: true, index: true },
  status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN', index: true },
  openedAt: { type: Date, required: true },
  closedAt: { type: Date, default: null },
  openingSnapshot: { type: [CashSessionSnapshotSchema], default: [] },
  closingSnapshot: { type: [CashSessionSnapshotSchema], default: [] },
  reportRows: { type: [CashSessionReportRowSchema], default: [] },
  totals: {
    initialBalance: { type: Number, default: 0 },
    income: { type: Number, default: 0 },
    expense: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    deletedIncomeAdjustments: { type: Number, default: 0 },
    deletedExpenseAdjustments: { type: Number, default: 0 }
  }
}, { timestamps: true });

CashSessionSchema.index({ companyId: 1, businessDate: 1 }, { unique: true });

export default mongoose.model('CashSession', CashSessionSchema);
