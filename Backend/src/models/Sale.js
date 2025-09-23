import mongoose from 'mongoose';

const SaleItemSchema = new mongoose.Schema({
  source: { type: String, enum: ['inventory', 'price'], required: true },
  refId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sku: { type: String, default: '' },
  name: { type: String, default: '' },
  qty: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
}, { _id: true });

const SaleSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  number: { type: Number, index: true },       // se asigna al cerrar
  status: { type: String, default: 'open', enum: ['open', 'closed'] },
  items: { type: [SaleItemSchema], default: [] },
  customer: {
    type: { type: String, default: '' },
    idNumber: { type: String, default: '' },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  vehicle: {
    plate: { type: String, default: '' },
    brand: { type: String, default: '' },
    line: { type: String, default: '' },
    engine: { type: String, default: '' },
    year: { type: Number, default: null },
    mileage: { type: Number, default: null }
  },
  notes: { type: String, default: '' },
  subtotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  closedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('Sale', SaleSchema);
