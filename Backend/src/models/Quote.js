import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  kind:        { type: String, enum: ['Producto', 'Servicio', 'Combo'], required: true },
  description: { type: String, required: true, trim: true },
  qty:         { type: Number, default: null },
  unitPrice:   { type: Number, required: true, min: 0 },
  subtotal:    { type: Number, required: true, min: 0 },
  // Metadatos de origen para reutilizar en ventas
  source:      { type: String, enum: ['inventory', 'price', 'manual'], default: 'manual' },
  refId:       { type: mongoose.Schema.Types.ObjectId }, // Item o PriceEntry según source
  sku:         { type: String, trim: true }
}, { _id: false });

const QuoteSchema = new mongoose.Schema({
  companyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  seq:        { type: Number, required: true },
  number:     { type: String, required: true },

  customer: {
    name:     { type: String, trim: true },
    phone:    { type: String, trim: true },
    email:    { type: String, trim: true }
  },
  vehicle: {
    plate:        { type: String, trim: true },
    vehicleId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null }, // Referencia al vehículo de la BD
    make:         { type: String, trim: true },
    line:         { type: String, trim: true },
    modelYear:    { type: String, trim: true },
    displacement: { type: String, trim: true },
  },

  validity:   { type: String, default: '' },
  currency:   { type: String, default: 'COP' },
  specialNotes: { type: [String], default: [] }, // Notas especiales para la cotización

  items:      { type: [ItemSchema], default: [] },
  total:      { type: Number, required: true, min: 0 },
}, { timestamps: true });

// Unicidad por empresa
QuoteSchema.index({ companyId: 1, seq: 1 }, { unique: true });
QuoteSchema.index({ companyId: 1, number: 1 }, { unique: true });

// Índices sugeridos para filtros del historial
QuoteSchema.index({ companyId: 1, 'vehicle.plate': 1, createdAt: -1 });
QuoteSchema.index({ companyId: 1, 'customer.name': 1, createdAt: -1 });

export default mongoose.model('Quote', QuoteSchema);
