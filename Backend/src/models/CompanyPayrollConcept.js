import mongoose from 'mongoose';

const CompanyPayrollConceptSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  type: { type: String, enum: ['earning','deduction','surcharge'], required: true },
  amountType: { type: String, enum: ['fixed','percent'], required: true },
  defaultValue: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  ordering: { type: Number, default: 0 },
  // Concepto variable: completa un monto fijo si el total es menor
  isVariable: { type: Boolean, default: false },
  variableFixedAmount: { type: Number, default: 0 } // Monto fijo a completar
}, { timestamps: true });

CompanyPayrollConceptSchema.index({ companyId: 1, code: 1 }, { unique: true });

export default mongoose.model('CompanyPayrollConcept', CompanyPayrollConceptSchema);


