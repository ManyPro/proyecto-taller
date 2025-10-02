import mongoose from 'mongoose';

const SaleItemSchema = new mongoose.Schema({
  source: { type: String, enum: ['inventory', 'price', 'service'], required: true },
  refId: { type: mongoose.Schema.Types.ObjectId, required: false },
  sku: { type: String, default: '' },
  name: { type: String, default: '' },
  qty: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
}, { _id: true });

const SaleSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  number: { type: Number, index: true },       // se asigna al cerrar
  name: { type: String, default: '' },         // "Venta · ABC123" o "Venta · 84F1A2"
  status: { type: String, default: 'draft', enum: ['draft', 'closed', 'cancelled'], index: true },
  // Técnico asignado (para empresas que lo usan, p.ej. Casa DUSTER)
  technician: { type: String, default: '', index: true },
  // Historial de técnico: quién fue asignado inicialmente y quién cerró
  initialTechnician: { type: String, default: '', index: true },
  closingTechnician: { type: String, default: '', index: true },
  technicianAssignedAt: { type: Date },
  technicianClosedAt: { type: Date },
  items: { type: [SaleItemSchema], default: [] },
  customer: {
    type: { type: String, default: '' },
    idNumber: { type: String, default: '' },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  vehicle: {
    plate: { type: String, default: '' },
    brand: { type: String, default: '' },
    line: { type: String, default: '' },
    engine: { type: String, default: '' },
    year: { type: Number, default: null },
    mileage: { type: Number, default: null }
  },
  notes: { type: String, default: '' },
  subtotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  // Datos de pago y mano de obra (se establecen al cerrar la venta)
  paymentMethod: { type: String, default: '' },
  paymentReceiptUrl: { type: String, default: '' },
  laborValue: { type: Number, default: 0 },            // valor base mano de obra
  laborPercent: { type: Number, default: 0 },          // porcentaje asignado al técnico
  laborShare: { type: Number, default: 0 },            // valor calculado = laborValue * laborPercent/100
  closedAt: { type: Date },
  cancelledAt: { type: Date }
}, { timestamps: true });

// Índices adicionales para agilizar reporte técnico (consultas por closedAt y técnicos)
try {
  SaleSchema.index({ companyId: 1, closedAt: -1 });
  SaleSchema.index({ companyId: 1, closedAt: -1, technician: 1 });
  SaleSchema.index({ companyId: 1, closedAt: -1, initialTechnician: 1 });
  SaleSchema.index({ companyId: 1, closedAt: -1, closingTechnician: 1 });
} catch(e) { /* ignore duplicate index definition in dev hot reload */ }

export default mongoose.model('Sale', SaleSchema);
