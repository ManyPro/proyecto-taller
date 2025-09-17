import mongoose from 'mongoose';

const PriceEntrySchema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, index: true },

  brand:  { type: String, trim: true, uppercase: true, index: true }, // RENAULT
  line:   { type: String, trim: true, uppercase: true, index: true }, // DUSTER
  model:  { type: String, trim: true, uppercase: true },              // opcional (variante)
  engine: { type: String, trim: true, uppercase: true, index: true }, // 1.6 / 2.0 / DIÉSEL...
  year:   { type: Number, index: true },

  // valores por variable (clave=>valor)
  variables: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  total:     { type: Number, default: 0 },

  createdBy: { type: String }
}, { timestamps: true });

PriceEntrySchema.index({ companyId: 1, serviceId: 1, brand: 1, line: 1, engine: 1, year: 1 });

export default mongoose.model('PriceEntry', PriceEntrySchema);
