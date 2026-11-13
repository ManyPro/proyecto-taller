import mongoose from 'mongoose';

const gmailProcessedMessageSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  messageId: { type: String, required: true, trim: true },
  processedAt: { type: Date, default: Date.now }
}, { versionKey: false });

gmailProcessedMessageSchema.index({ companyId: 1, messageId: 1 }, { unique: true });

export default mongoose.model('GmailProcessedMessage', gmailProcessedMessageSchema);
