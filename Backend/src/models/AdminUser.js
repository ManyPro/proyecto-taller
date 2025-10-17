import mongoose from 'mongoose';

const AdminUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['developer', 'admin'], required: true },
    companies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model('AdminUser', AdminUserSchema);
