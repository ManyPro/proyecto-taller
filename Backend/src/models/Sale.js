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
  paymentMethods: { type: [{ method: String, amount: Number, accountId: { type: mongoose.Schema.Types.ObjectId } }], default: [] },
  paymentReceiptUrl: { type: String, default: '' },
  // Información estructurada del comprobante / recibo (imagen o PDF) asociado al cierre
  // Se mantiene paymentReceiptUrl para retro-compatibilidad con versiones anteriores.
  receiptMedia: {
    url: { type: String, default: '' },
    mimetype: { type: String, default: '' },
    originalname: { type: String, default: '' },
    size: { type: Number, default: null },
    uploadedAt: { type: Date }
  },
    // ===== Crédito (ventas a pagar después) =====
    credit: {
      enabled: { type: Boolean, default: false, index: true }, // true si la venta se cerró como crédito
      status: { type: String, default: 'NONE', enum: ['NONE','OPEN','OVERDUE','SETTLED'], index: true },
      dueDate: { type: Date },            // fecha límite de pago
      settledAt: { type: Date },          // cuándo se marcó pagado
      notes: { type: String, default: '' },
      alertCount: { type: Number, default: 0 },
      lastAlertAt: { type: Date },
      totalDue: { type: Number, default: 0 },   // importe total que quedó pendiente (al cerrar)
      totalPaid: { type: Number, default: 0 }   // total abonado posteriormente (cuando se implemente pagos parciales)
    },
  laborValue: { type: Number, default: 0 },            // valor base mano de obra
  laborPercent: { type: Number, default: 0 },          // porcentaje asignado al técnico
  laborShare: { type: Number, default: 0 },            // valor calculado = laborValue * laborPercent/100
  closedAt: { type: Date },
  cancelledAt: { type: Date }
}, { timestamps: true });

// Asegurar consistencia de subtotal antes de guardar si falta
SaleSchema.pre('save', function(next){
  if(this.isModified('items') || this.isModified('total') || this.isModified('tax') || this.subtotal === 0){
    const itemsSum = (this.items||[]).reduce((acc,it)=> acc + (Number(it.total)|| (Number(it.qty||0)*Number(it.unitPrice||0))), 0);
    if(!this.subtotal || this.subtotal === 0){
      // Si hay tax y total definidos, intentar inferir
      if(this.total && this.tax){
        const inferred = Number(this.total) - Number(this.tax);
        if(inferred >= 0) this.subtotal = inferred;
      }
      if(!this.subtotal || this.subtotal === 0){
        this.subtotal = itemsSum;
      }
    }
    // Si total no coincide con subtotal+tax y total es 0, recalcular
    if((!this.total || this.total === 0) && (this.subtotal || itemsSum)){
      this.total = (this.subtotal || itemsSum) + (this.tax||0);
    }
  }
  next();
});

// Índices adicionales para agilizar reporte técnico (consultas por closedAt y técnicos)
try {
  SaleSchema.index({ companyId: 1, closedAt: -1 });
  SaleSchema.index({ companyId: 1, closedAt: -1, technician: 1 });
  SaleSchema.index({ companyId: 1, closedAt: -1, initialTechnician: 1 });
  SaleSchema.index({ companyId: 1, closedAt: -1, closingTechnician: 1 });
  // Índices para créditos
  SaleSchema.index({ companyId: 1, 'credit.enabled': 1, 'credit.status': 1 });
  SaleSchema.index({ companyId: 1, 'credit.dueDate': 1, 'credit.status': 1 });
} catch(e) { /* ignore duplicate index definition in dev hot reload */ }

export default mongoose.model('Sale', SaleSchema);
