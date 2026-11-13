import mongoose from 'mongoose';

const gmailInboxConnectionSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, unique: true, index: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  refreshToken: { type: String, required: true },
  historyId: { type: String, default: '' },
  connectedAt: { type: Date, default: Date.now },
  lastCheckedAt: { type: Date, default: null },
  lastError: { type: String, default: '' }
}, { versionKey: false });

export default mongoose.model('GmailInboxConnection', gmailInboxConnectionSchema);
