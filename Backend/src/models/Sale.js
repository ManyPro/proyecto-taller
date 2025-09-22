import mongoose from 'mongoose';

const SaleItemSchema = new mongoose.Schema({
  source:    { type: String, enum: ['inventory', 'price'], required: true },
  refId:     { type: mongoose.Schema.Types.ObjectId, required: false },
  sku:       { type: String, trim: true, uppercase: true },
  name:      { type: String, trim: true },
  qty:       { type: Number, default: 1, min: 0 },
  unitPrice: { type: Number, default: 0, min: 0 },
  total:     { type: Number, default: 0, min: 0 },
}, { _id: true });

const SaleSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  status:    { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  number:    { type: Number, index: true, sparse: true }, // consecutivo por empresa
  items:     { type: [SaleItemSchema], default: [] },

  customer: {
    name:     { type: String, trim: true },
    idNumber: { type: String, trim: true },
    phone:    { type: String, trim: true },
    email:    { type: String, trim: true },
    address:  { type: String, trim: true },
  },

  vehicle: {
    plate:   { type: String, trim: true, uppercase: true, index: true },
    brand:   { type: String, trim: true, uppercase: true },
    line:    { type: String, trim: true, uppercase: true },
    engine:  { type: String, trim: true, uppercase: true },
    year:    { type: Number },
    mileage: { type: Number }
  },

  notes:    { type: String, trim: true },

  subtotal: { type: Number, default: 0 },
  tax:      { type: Number, default: 0 },
  total:    { type: Number, default: 0 },

  closedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('Sale', SaleSchema);
