import mongoose from 'mongoose';

const VariableSchema = new mongoose.Schema({
  key:   { type: String, required: true, uppercase: true, trim: true }, // p.ej. ACEITE_CERT
  label: { type: String, required: true, trim: true },                   // “Aceite certificado”
  type:  { type: String, enum: ['number','text'], default: 'number' },   // tipos simples MVP
  unit:  { type: String, trim: true },
  defaultValue: { type: mongoose.Schema.Types.Mixed, default: 0 }
}, { _id: false });

const ServiceSchema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true },
  name:      { type: String, required: true, trim: true },               // "Cambio de aceite"
  key:       { type: String, required: true, uppercase: true, trim: true, index: true },
  variables: { type: [VariableSchema], default: [] },
  formula:   { type: String, default: '' }, // p.ej. ACEITE_CERT + ACEITE_SELLADO + FILTRO_ACEITE + FILTRO_AIRE + MO
  createdBy: { type: String }
}, { timestamps: true });

ServiceSchema.index({ companyId: 1, key: 1 }, { unique: true });

export default mongoose.model('Service', ServiceSchema);
