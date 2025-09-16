// Backend/src/models/Quote.js
import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  kind:       { type: String, enum: ['Producto', 'Servicio'], required: true },
  description:{ type: String, required: true, trim: true },
  qty:        { type: Number, default: null },             // opcional
  unitPrice:  { type: Number, required: true, min: 0 },
  subtotal:   { type: Number, required: true, min: 0 },    // qty*unitPrice o unitPrice si no hay qty
}, { _id: false });

const QuoteSchema = new mongoose.Schema({
  companyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  seq:        { type: Number, required: true },            // 27
  number:     { type: String, required: true },            // "00027"

  customer: {
    name:     { type: String, trim: true },
    phone:    { type: String, trim: true },
    email:    { type: String, trim: true }
  },
  vehicle: {
    plate:       { type: String, trim: true },
    make:        { type: String, trim: true },
    line:        { type: String, trim: true },
    modelYear:   { type: String, trim: true },
    displacement:{ type: String, trim: true },
  },

  validity:   { type: String, default: '' },               // ej. "8 días" (opcional)
  currency:   { type: String, default: 'COP' },

  items:      { type: [ItemSchema], default: [] },
  total:      { type: Number, required: true, min: 0 },
}, { timestamps: true });

QuoteSchema.index({ companyId: 1, seq: 1 }, { unique: true });
QuoteSchema.index({ companyId: 1, number: 1 }, { unique: true });

export default mongoose.model('Quote', QuoteSchema);
