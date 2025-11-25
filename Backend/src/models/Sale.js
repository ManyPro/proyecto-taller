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
  // Origen de la venta (internal = creada en panel, catalog = checkout público)
  origin: { type: String, enum: ['internal','catalog'], default: 'internal', index: true },
  // Técnico asignado (para empresas que lo usan, p.ej. Casa DUSTER)
  technician: { type: String, default: '', index: true },
  // Historial de técnico: quién fue asignado inicialmente y quién cerró
  initialTechnician: { type: String, default: '', index: true },
  closingTechnician: { type: String, default: '', index: true },
  technicianAssignedAt: { type: Date },
  technicianClosedAt: { type: Date },
  items: { type: [SaleItemSchema], default: [] },
  // Slots abiertos pendientes de completar (para combos abiertos)
  // Array de { comboPriceId, slotIndex, slotName, qty, estimatedPrice }
  openSlots: { type: [{
    comboPriceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceEntry', required: true },
    slotIndex: { type: Number, required: true }, // Índice del slot en comboProducts
    slotName: { type: String, required: true }, // Nombre del slot abierto
    qty: { type: Number, default: 1, min: 1 },
    estimatedPrice: { type: Number, default: 0 }, // Precio estimado del slot
    completed: { type: Boolean, default: false }, // true cuando se escaneó el QR
    completedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null } // Item asignado al completar
  }], default: [] },
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
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null }, // Referencia al vehículo de la BD
    brand: { type: String, default: '' },
    line: { type: String, default: '' },
    engine: { type: String, default: '' },
    year: { type: Number, default: null },
    mileage: { type: Number, default: null }
  },
  notes: { type: String, default: '' },
  specialNotes: { type: [String], default: [] }, // Notas especiales para la remisión
  subtotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  // Datos de pago y mano de obra (se establecen al cerrar la venta)
  paymentMethod: { type: String, default: '' },
  paymentMethods: { type: [{ method: String, amount: Number, accountId: { type: mongoose.Schema.Types.ObjectId } }], default: [] },
  paymentReceiptUrl: { type: String, default: '' },
  // Método único para catálogo (pay-on-delivery) si viene del checkout público
  payMethod: { type: String, enum: ['pay-on-delivery',''], default: '' },
  // Modalidad de entrega (pickup = recolección, home-bogota = envío gratis Bogotá, store = retiro en punto)
  deliveryMethod: { type: String, enum: ['pickup','home-bogota','store',''], default: '' },
  // Requiere creación automática de orden de trabajo (instalación en taller)
  requiresInstallation: { type: Boolean, default: false },
  laborValue: { type: Number, default: 0 },            // valor base mano de obra
  laborPercent: { type: Number, default: 0 },          // porcentaje asignado al técnico
  laborShare: { type: Number, default: 0 },            // valor calculado = laborValue * laborPercent/100
  // Identificador de origen (import legacy)
  legacyOrId: { type: String, default: '', index: true },
  // Nuevo: despiece de comisiones por técnico y tipo de maniobra
  laborCommissions: { type: [{
    technician: { type: String, default: '' },        // nombre técnico
    kind: { type: String, default: '' },              // tipo de maniobra (motor, suspensión, etc.)
    laborValue: { type: Number, default: 0 },         // base de mano de obra para esta línea
    percent: { type: Number, default: 0 },            // % de participación
    share: { type: Number, default: 0 }               // valor = laborValue * percent/100
  }], default: [] },
  investmentAmount: { type: Number, default: 0 },      // inversión aplicada al cierre de venta
  closedAt: { type: Date },
  cancelledAt: { type: Date },
  // Empresa asociada (si la venta está vinculada a una empresa cliente)
  companyAccountId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CompanyAccount', 
    default: null,
    index: true 
  }
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
// Índice para consultas por placa (historial de vehículos)
try {
  SaleSchema.index({ companyId: 1, closedAt: -1 });
  SaleSchema.index({ companyId: 1, closedAt: -1, technician: 1 });
  SaleSchema.index({ companyId: 1, closedAt: -1, initialTechnician: 1 });
  SaleSchema.index({ companyId: 1, closedAt: -1, closingTechnician: 1 });
  SaleSchema.index({ companyId: 1, 'vehicle.plate': 1, closedAt: -1 });
  SaleSchema.index({ companyId: 1, status: 1, closedAt: -1 });
} catch(e) { /* ignore duplicate index definition in dev hot reload */ }

export default mongoose.model('Sale', SaleSchema);
