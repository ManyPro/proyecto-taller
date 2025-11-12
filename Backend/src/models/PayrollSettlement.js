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
  technicianId: { type: mongoose.Schema.Types.ObjectId, required: false, index: true },
  technicianName: { type: String, required: true, index: true },
  periodId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: 'PayrollPeriod' },
  selectedConceptIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // Conceptos seleccionados para aplicar
  items: { type: [ItemSchema], default: [] },
  grossTotal: { type: Number, default: 0 },
  deductionsTotal: { type: Number, default: 0 },
  netTotal: { type: Number, default: 0 },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  approvedAt: { type: Date, default: null },
  paidCashflowId: { type: mongoose.Schema.Types.ObjectId, default: null, ref: 'CashFlowEntry' }, // Mantener para compatibilidad
  paidCashflowIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // Múltiples pagos parciales
  paidAmount: { type: Number, default: 0 }, // Monto total pagado hasta ahora
  pdfUrl: { type: String, default: '' },
  status: { type: String, enum: ['draft','approved','paid','partially_paid'], default: 'draft', index: true }
}, { timestamps: true });

// Índice único por técnico y período (una liquidación por técnico por período)
// Usar solo technicianName para la unicidad, ya que technicianId puede ser null
PayrollSettlementSchema.index({ companyId: 1, technicianName: 1, periodId: 1 }, { unique: true });
// Índice adicional para búsquedas por technicianId cuando existe (sparse: solo indexa cuando technicianId no es null)
PayrollSettlementSchema.index({ companyId: 1, technicianId: 1, periodId: 1 }, { unique: true, sparse: true });

export default mongoose.model('PayrollSettlement', PayrollSettlementSchema);


