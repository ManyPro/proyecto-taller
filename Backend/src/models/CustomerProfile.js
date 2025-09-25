import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true },
  plate: { type: String, required: true, index: true },
  customer: {
    name: String,
    idNumber: String,
    phone: String,
    email: String,
    address: String
  },
  vehicle: {
    brand: String,
    line: String,
    engine: String,
    year: Number
  }
}, { timestamps: true });

schema.index({ companyId: 1, plate: 1 }, { unique: true });

export default mongoose.model('CustomerProfile', schema);
