// Backend/src/models/Counter.js
import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, unique: true },
  quoteSeq:  { type: Number, default: 0 }, // consecutivo por empresa
}, { timestamps: true });

export default mongoose.model('Counter', CounterSchema);
