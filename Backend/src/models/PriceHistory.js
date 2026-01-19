import mongoose from 'mongoose';

const PriceHistorySchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  priceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PriceEntry', required: true, index: true },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
  lastPrice: { type: Number, default: 0 },
  lastComboProducts: { type: [Object], default: [] },
  lastUsedAt: { type: Date, default: Date.now },
  usedCount: { type: Number, default: 1, min: 0 }
}, { timestamps: true });

PriceHistorySchema.index({ companyId: 1, priceId: 1, vehicleId: 1 }, { unique: true });
PriceHistorySchema.index({ companyId: 1, vehicleId: 1, lastUsedAt: -1 });

export default mongoose.model('PriceHistory', PriceHistorySchema);
