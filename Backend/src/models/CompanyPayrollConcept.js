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
  variableFixedAmount: { type: Number, default: 0 }, // Monto fijo a completar
  // Base para cálculo de porcentajes
  percentBaseType: { 
    type: String, 
    enum: ['total_gross', 'specific_concept', 'fixed_value'], 
    default: 'total_gross' 
  }, // Tipo de base: total bruto, concepto específico, o valor fijo
  percentBaseConceptId: { type: mongoose.Schema.Types.ObjectId, default: null }, // ID del concepto específico si percentBaseType es 'specific_concept'
  percentBaseFixedValue: { type: Number, default: 0 } // Valor fijo si percentBaseType es 'fixed_value'
}, { timestamps: true });

CompanyPayrollConceptSchema.index({ companyId: 1, code: 1 }, { unique: true });

export default mongoose.model('CompanyPayrollConcept', CompanyPayrollConceptSchema);


