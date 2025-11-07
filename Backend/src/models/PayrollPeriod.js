import mongoose from 'mongoose';

const PayrollPeriodSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  periodType: { type: String, enum: ['monthly','biweekly','weekly'], default: 'monthly' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ['open','closed'], default: 'open', index: true }
}, { timestamps: true });

// Índice compuesto para búsquedas eficientes (sin unique para permitir períodos cerrados duplicados)
PayrollPeriodSchema.index({ companyId: 1, startDate: 1, endDate: 1 });

export default mongoose.model('PayrollPeriod', PayrollPeriodSchema);


