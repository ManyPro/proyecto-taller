import mongoose from 'mongoose';

const WorkOrderItemSchema = new mongoose.Schema({
  refId: { type: mongoose.Types.ObjectId },
  sku: { type: String, default: '' },
  name: { type: String, default: '' },
  qty: { type: Number, default: 1 }
}, { _id: true });

const WorkOrderSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  saleId: { type: mongoose.Types.ObjectId, ref: 'Sale', required: true, index: true },
  status: { type: String, enum: ['open','in-progress','closed','cancelled'], default: 'open', index: true },
  technician: { type: String, default: '' },
  customer: {
    idNumber: { type: String, default: '' },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  items: { type: [WorkOrderItemSchema], default: [] },
  notes: { type: String, default: '' },
  scheduledAt: { type: Date },
  startedAt: { type: Date },
  closedAt: { type: Date },
}, { timestamps: true });

WorkOrderSchema.index({ companyId: 1, status: 1, createdAt: -1 });
WorkOrderSchema.index({ companyId: 1, technician: 1, status: 1 });

export default mongoose.model('WorkOrder', WorkOrderSchema);
