import mongoose from 'mongoose';

const SaleItemSchema = new mongoose.Schema({
  source: { type: String, enum: ['inventory', 'price'], required: true }, // de inventario o lista de precios
  refId: { type: mongoose.Types.ObjectId, required: false },               // Item._id o PriceEntry._id (opcional)
  sku:   { type: String, trim: true, uppercase: true },
  name:  { type: String, trim: true },
  qty:   { type: Number, default: 1, min: 0 },
  unitPrice: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0, min: 0 }
}, { _id: true });

const SaleSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },

  items: { type: [SaleItemSchema], default: [] },

  customer: {
    type: { type: String, trim: true },      // NATURAL / JURIDICA (opcional por ahora)
    idNumber: { type: String, trim: true },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    address: { type: String, trim: true }
  },

  vehicle: {
    plate: { type: String, trim: true, uppercase: true, index: true },
    brand: { type: String, trim: true, uppercase: true },
    line:  { type: String, trim: true, uppercase: true },
    engine:{ type: String, trim: true, uppercase: true },
    year:  { type: Number },
    mileage: { type: Number } // se captura por orden; no se “auto-completa” fijo
  },

  notes: { type: String, trim: true },

  subtotal: { type: Number, default: 0 },
  tax:      { type: Number, default: 0 },
  total:    { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Sale', SaleSchema);
