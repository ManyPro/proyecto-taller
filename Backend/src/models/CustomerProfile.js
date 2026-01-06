import mongoose from 'mongoose';

const CustomerProfileSchema = new mongoose.Schema({
  companyId: { type: String, index: true, required: true },
  // Número de identificación principal (para autocompletar rápido). Se duplica de customer.idNumber para index directo.
  identificationNumber: { type: String, trim: true, default: '', index: true },
  plate: { type: String, uppercase: true, trim: true, default: '' },
  customer: {
    idNumber: { type: String, default: '' },
    name:     { type: String, default: '' },
    phone:    { type: String, default: '' },
    email:    { type: String, default: '' },
    address:  { type: String, default: '' }
  },
  vehicle: {
    plate:  { type: String, index: true, required: true, uppercase: true, trim: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    brand:  { type: String, default: '' },
    line:   { type: String, default: '' },
    engine: { type: String, default: '' },
    year:   { type: Number, default: null },
    mileage: { type: Number, default: null }
  },
  // Historial de servicios realizados por este cliente
  serviceHistory: [{
    serviceKey: { type: String, required: true, trim: true }, // ID del servicio (ej: REN-010)
    lastPerformedMileage: { type: Number, required: true }, // Kilometraje en que se realizó
    lastPerformedDate: { type: Date, required: true }, // Fecha en que se realizó
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null } // Venta asociada (opcional)
  }]
}, { timestamps: true });

CustomerProfileSchema.index(
  { companyId: 1, plate: 1 },
  { unique: true, partialFilterExpression: { plate: { $type: 'string' } } }
);

CustomerProfileSchema.pre('save', function(next) {
  if (this.vehicle?.plate) {
    this.plate = String(this.vehicle.plate).trim().toUpperCase();
  }
  // Sincronizar identificationNumber si falta
  if (!this.identificationNumber && this.customer?.idNumber) {
    this.identificationNumber = String(this.customer.idNumber).trim();
  }
  next();
});

export default mongoose.model('CustomerProfile', CustomerProfileSchema);
