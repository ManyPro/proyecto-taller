import mongoose from 'mongoose';

const AdminSignupRequestSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  status: { type: String, enum: ['pending','approved','completed','revoked'], default: 'pending', index: true },
  codeHash: { type: String, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  assignedCompanies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

AdminSignupRequestSchema.pre('save', function(next){
  this.updatedAt = new Date();
  next();
});

AdminSignupRequestSchema.index({ email: 1, status: 1 });

export default mongoose.model('AdminSignupRequest', AdminSignupRequestSchema);
