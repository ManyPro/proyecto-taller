// Backend/src/models/CustomerProfile.js
import mongoose from 'mongoose';

const CustomerProfileSchema = new mongoose.Schema({
  companyId: { type: String, index: true, required: true },
  customer: {
    idNumber: { type: String, default: '' },
    name:     { type: String, default: '' },
    phone:    { type: String, default: '' },
    email:    { type: String, default: '' },
    address:  { type: String, default: '' }
  },
  vehicle: {
    plate:  { type: String, index: true, required: true }, // ABC123
    brand:  { type: String, default: '' },
    line:   { type: String, default: '' },
    engine: { type: String, default: '' },
    year:   { type: Number, default: null }
    // NO guardamos mileage/kilometraje aquí a propósito
  }
}, { timestamps: true });

CustomerProfileSchema.index({ companyId: 1, 'vehicle.plate': 1 }, { unique: true });

export default mongoose.model('CustomerProfile', CustomerProfileSchema);
