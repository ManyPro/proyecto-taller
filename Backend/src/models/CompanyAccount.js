import mongoose from 'mongoose';

const CompanyAccountSchema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  contact: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  // Placas asociadas a esta empresa
  plates: [{ type: String, uppercase: true, trim: true }],
  // Estado
  active: { type: Boolean, default: true, index: true },
  // Metadatos
  notes: { type: String, default: '' }
}, { timestamps: true });

CompanyAccountSchema.index({ companyId: 1, active: 1 });
CompanyAccountSchema.index({ companyId: 1, name: 1 });

export default mongoose.model('CompanyAccount', CompanyAccountSchema);

