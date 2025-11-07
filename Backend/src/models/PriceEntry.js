import mongoose from 'mongoose';

const PriceEntrySchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  
  // Nuevo modelo: vehicleId es requerido para nuevos registros (validación en controlador)
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null, index: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null, index: true }, // Opcional ahora
  
  // Nombre del servicio/producto (opcional para compatibilidad legacy)
  name: { type: String, trim: true, default: '' },
  // Tipo: 'service' o 'product'
  type: { type: String, enum: ['service', 'product'], default: 'service', index: true },

  // Legacy: mantener por compatibilidad (deprecated)
  brand:  { type: String, trim: true, uppercase: true, default: '' },
  line:   { type: String, trim: true, uppercase: true, default: '' },
  engine: { type: String, trim: true, uppercase: true, default: '' },
  year:   { type: Number, min: 1900, max: 2100 },

  // Clave → valor (número o texto) - para servicios con variables
  variables: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

  total: { type: Number, default: 0 }
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
