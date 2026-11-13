import mongoose from 'mongoose';

const CounterSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, unique: true },
  quoteSeq: { type: Number, default: 0 }, // ya lo usas para cotizaciones
  saleSeq:  { type: Number, default: 0 },  // <— necesario para ventas
  diagnosisSeq: { type: Number, default: 0 }
});

export default mongoose.model('Counter', CounterSchema);
