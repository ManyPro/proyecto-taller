import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// ✅ Importante: NO declarar de nuevo el índice con `CompanySchema.index(...)`
// para evitar el warning de índice duplicado.

export default mongoose.model('Company', CompanySchema);
