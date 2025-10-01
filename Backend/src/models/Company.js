import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true },
    // Legacy reset fields (pueden quedar vacíos en modo local)
    passwordResetTokenHash: { type: String, default: '' },
    passwordResetExpires: { type: Date, default: null },
    // Lista de técnicos configurables por empresa (mayúsculas)
    technicians: { type: [String], default: [] },
    // Preferencias de la empresa
    preferences: {
      laborPercents: { type: [Number], default: [30, 40, 50] }
    }
  },
  { timestamps: true }
);

export default mongoose.model('Company', CompanySchema);
