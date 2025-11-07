import mongoose from 'mongoose';

const EmployeeLoanSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  technicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'Technician', index: true },
  technicianName: { type: String, required: true, index: true }, // Nombre del técnico/empleado
  amount: { type: Number, required: true, min: 0 }, // Monto del préstamo
  description: { type: String, default: '' }, // Descripción del préstamo
  loanDate: { type: Date, required: true, default: Date.now }, // Fecha del préstamo
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Account' }, // Cuenta de donde sale
  cashFlowEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashFlowEntry' }, // Referencia a la salida de caja
  status: { 
    type: String, 
    enum: ['pending', 'partially_paid', 'paid', 'cancelled'], 
    default: 'pending',
    index: true 
  },
  paidAmount: { type: Number, default: 0 }, // Monto pagado hasta ahora
  settlementIds: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // Liquidaciones donde se ha descontado
  notes: { type: String, default: '' } // Notas adicionales
}, { timestamps: true });

// Índices para búsquedas eficientes
EmployeeLoanSchema.index({ companyId: 1, technicianName: 1, status: 1 });
EmployeeLoanSchema.index({ companyId: 1, status: 1, loanDate: -1 });

export default mongoose.model('EmployeeLoan', EmployeeLoanSchema);

