import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true },
  publicCatalogEnabled: { type: Boolean, default: false }, // habilita catálogo público segmentado
    // Legacy reset fields (pueden quedar vacíos en modo local)
    passwordResetTokenHash: { type: String, default: '' },
    passwordResetExpires: { type: Date, default: null },
    // Lista de técnicos configurables por empresa (mayúsculas)
    technicians: { type: [String], default: [] },
    // Preferencias de la empresa
    preferences: {
      laborPercents: { type: [Number], default: [30, 40, 50] },
      // Número de WhatsApp para contacto público (E.164 o local). Ej: +573001234567
      whatsAppNumber: { type: String, default: '' }
    }
  },
  { timestamps: true }
);

export default mongoose.model('Company', CompanySchema);
