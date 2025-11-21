import mongoose from 'mongoose';

const PriceEntrySchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  
  // Nuevo modelo: vehicleId es requerido para nuevos registros (validación en controlador)
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null, index: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null, index: true }, // Opcional ahora
  
  // Nombre del servicio/producto (opcional para compatibilidad legacy)
  name: { type: String, trim: true, default: '' },
  // Tipo: 'service', 'product', 'combo' o 'inversion'
  type: { type: String, enum: ['service', 'product', 'combo', 'inversion'], default: 'service', index: true },
  
  // Vincular producto con item del inventario (solo para type: 'product')
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null, index: true },
  
  // Productos del combo (solo para type: 'combo')
  // Array de productos que incluye el combo, cada uno puede estar vinculado a un item del inventario
  // Si isOpenSlot=true, el itemId se asignará al momento de crear la venta mediante QR
  comboProducts: [{
    name: { type: String, trim: true, required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null }, // Opcional: vincular con inventario
    qty: { type: Number, default: 1, min: 1 },
    unitPrice: { type: Number, default: 0, min: 0 }, // Precio estimado para slots abiertos
    isOpenSlot: { type: Boolean, default: false } // true = slot abierto que requiere QR al crear venta
  }],

  // Rango de años opcional: solo aplicar precio si el año del vehículo está en este rango
  yearFrom: { type: Number, min: 1900, max: 2100, default: null },
  yearTo: { type: Number, min: 1900, max: 2100, default: null },

  // Legacy: mantener por compatibilidad (deprecated)
  brand:  { type: String, trim: true, uppercase: true, default: '' },
  line:   { type: String, trim: true, uppercase: true, default: '' },
  engine: { type: String, trim: true, uppercase: true, default: '' },
  year:   { type: Number, min: 1900, max: 2100 },

  // Clave → valor (número o texto) - para servicios con variables
  variables: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

  total: { type: Number, default: 0 },
  
  // Valor de mano de obra y tipo (para combos y productos)
  laborValue: { type: Number, default: 0, min: 0 }, // Valor base de mano de obra
  laborKind: { type: String, trim: true, default: '' } // Tipo de mano de obra (MOTOR, SUSPENSION, FRENOS, etc.)
}, { timestamps: true });

// Índice único: companyId + vehicleId + name + type (nuevo modelo) - sparse para permitir datos legacy sin name
PriceEntrySchema.index(
  { companyId: 1, vehicleId: 1, name: 1, type: 1 },
  { unique: true, sparse: true, partialFilterExpression: { vehicleId: { $ne: null }, name: { $ne: '' } } }
);

// Índice legacy: companyId + serviceId + vehicleId (mantener compatibilidad)
PriceEntrySchema.index(
  { companyId: 1, serviceId: 1, vehicleId: 1 },
  { unique: true, sparse: true }
);

// Índice legacy (mantener por compatibilidad)
PriceEntrySchema.index(
  { companyId: 1, serviceId: 1, brand: 1, line: 1, engine: 1, year: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model('PriceEntry', PriceEntrySchema);
