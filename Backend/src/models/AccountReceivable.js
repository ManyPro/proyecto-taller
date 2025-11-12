import mongoose from 'mongoose';

const AccountReceivableSchema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true },
  
  // Referencia a la venta que generó esta cuenta por cobrar
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
  saleNumber: { type: String, default: '' }, // Número de remisión para fácil referencia
  
  // Cliente asociado
  customer: {
    idNumber: { type: String, default: '' },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  
  // Vehículo asociado
  vehicle: {
    plate: { type: String, uppercase: true, trim: true, default: '', index: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    brand: { type: String, default: '' },
    line: { type: String, default: '' },
    engine: { type: String, default: '' },
    year: { type: Number, default: null }
  },
  
  // Empresa asociada (si aplica)
  companyAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyAccount', default: null, index: true },
  
  // Montos
  totalAmount: { type: Number, required: true, default: 0 }, // Monto total de la cuenta
  paidAmount: { type: Number, default: 0 }, // Monto pagado hasta ahora
  balance: { type: Number, default: 0 }, // Saldo pendiente (totalAmount - paidAmount)
  
  // Estado
  status: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // Fechas
  dueDate: { type: Date, default: null }, // Fecha de vencimiento (opcional)
  paidAt: { type: Date, default: null }, // Fecha de pago completo
  
  // Historial de pagos
  payments: [{
    amount: { type: Number, required: true },
    paymentDate: { type: Date, default: Date.now },
    paymentMethod: { type: String, default: '' }, // Efectivo, Transferencia, etc.
    notes: { type: String, default: '' },
    createdBy: { type: String, default: '' } // Usuario que registró el pago
  }],
  
  // Notas adicionales
  notes: { type: String, default: '' },
  
  // Metadatos
  source: { type: String, default: 'sale' }, // sale, manual, etc.
  meta: { type: Object, default: {} }
}, { timestamps: true });

// Índices para búsquedas rápidas
AccountReceivableSchema.index({ companyId: 1, status: 1 });
AccountReceivableSchema.index({ companyId: 1, 'vehicle.plate': 1 });
AccountReceivableSchema.index({ companyId: 1, companyAccountId: 1, status: 1 });
AccountReceivableSchema.index({ companyId: 1, 'customer.idNumber': 1 });
AccountReceivableSchema.index({ companyId: 1, createdAt: -1 });

// Calcular balance antes de guardar
AccountReceivableSchema.pre('save', function(next) {
  this.balance = Math.max(0, this.totalAmount - this.paidAmount);
  
  // Actualizar estado según el balance
  if (this.balance <= 0) {
    this.status = 'paid';
    if (!this.paidAt) {
      this.paidAt = new Date();
    }
  } else if (this.paidAmount > 0) {
    this.status = 'partial';
  } else {
    this.status = 'pending';
  }
  
  next();
});

export default mongoose.model('AccountReceivable', AccountReceivableSchema);

