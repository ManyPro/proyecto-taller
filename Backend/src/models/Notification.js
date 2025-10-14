import mongoose from 'mongoose';

// Simple notification model for internal events (sales, work orders, etc.)
// type examples: 'sale.created', 'workOrder.created'
// data: payload with identifiers { saleId, workOrderId, ... }
const notificationSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  type: { type: String, required: true, trim: true, index: true },
  data: { type: Object, default: {} },
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

notificationSchema.index({ companyId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ companyId: 1, type: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
