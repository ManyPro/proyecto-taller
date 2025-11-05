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

const TechnicianSettlementSchema = new mongoose.Schema({
  technicianId: { type: mongoose.Schema.Types.ObjectId, default: null },
  technicianName: { type: String, required: true },
  items: { type: [ItemSchema], default: [] },
  grossTotal: { type: Number, default: 0 },
  deductionsTotal: { type: Number, default: 0 },
  netTotal: { type: Number, default: 0 }
}, { _id: false });

const PayrollSettlementSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  periodId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: 'PayrollPeriod', unique: true },
  selectedConceptIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // Conceptos seleccionados para aplicar
  technicians: { type: [TechnicianSettlementSchema], default: [] }, // Liquidaciones por técnico
  totalGrossTotal: { type: Number, default: 0 },
  totalDeductionsTotal: { type: Number, default: 0 },
  totalNetTotal: { type: Number, default: 0 },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  approvedAt: { type: Date, default: null },
  paidCashflowIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // Múltiples pagos posibles
  pdfUrl: { type: String, default: '' },
  status: { type: String, enum: ['draft','approved','paid'], default: 'draft', index: true }
}, { timestamps: true });

// Índice único por período (una liquidación por período)
PayrollSettlementSchema.index({ companyId: 1, periodId: 1 }, { unique: true });

export default mongoose.model('PayrollSettlement', PayrollSettlementSchema);


