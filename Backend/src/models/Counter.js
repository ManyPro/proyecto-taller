// Backend/src/models/Counter.js
import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, unique: true },
  quoteSeq:  { type: Number, default: 0 }, // consecutivo de cotizaciones por empresa
  saleSeq:   { type: Number, default: 0 }, // consecutivo de ventas por empresa
}, { timestamps: true });

export default mongoose.model('Counter', CounterSchema);
