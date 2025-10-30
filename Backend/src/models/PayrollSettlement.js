import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  conceptId: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyPayrollConcept' },
  name: { type: String, required: true },
  type: { type: String, enum: ['earning','deduction','surcharge'], required: true },
  base: { type: Number, default: 0 },
  value: { type: Number, required: true },
  calcRule: { type: String, default: '' },
  notes: { type: String, default: '' }
}, { _id: false });

const PayrollSettlementSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  technicianId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  technicianName: { type: String, default: '', index: true },
  periodId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: 'PayrollPeriod' },
  items: { type: [ItemSchema], default: [] },
  grossTotal: { type: Number, default: 0 },
  deductionsTotal: { type: Number, default: 0 },
  netTotal: { type: Number, default: 0 },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  approvedAt: { type: Date, default: null },
  paidCashflowId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'CashFlowEntry' },
  pdfUrl: { type: String, default: '' },
  status: { type: String, enum: ['draft','approved','paid'], default: 'draft', index: true }
}, { timestamps: true });

PayrollSettlementSchema.index({ companyId: 1, technicianId: 1, periodId: 1 }, { unique: true });

export default mongoose.model('PayrollSettlement', PayrollSettlementSchema);


