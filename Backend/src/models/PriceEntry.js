import mongoose from 'mongoose';

const PriceEntrySchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, index: true },

  // Nuevo: referencia al vehículo (global)
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null, index: true },

  // Legacy: mantener por compatibilidad (deprecated)
  brand:  { type: String, trim: true, uppercase: true, default: '' },
  line:   { type: String, trim: true, uppercase: true, default: '' },
  engine: { type: String, trim: true, uppercase: true, default: '' },
  year:   { type: Number, min: 1900, max: 2100 },

  // Clave → valor (número o texto)
  variables: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

  total: { type: Number, default: 0 }
}, { timestamps: true });

// Índice único: companyId + serviceId + vehicleId (nuevo)
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
