import mongoose from 'mongoose';

/**
 * VehicleServiceSchedule: Planilla de servicios por kilometraje
 * Permite rastrear qué servicios deben realizarse según el kilometraje del vehículo
 */
const ServiceScheduleItemSchema = new mongoose.Schema({
  serviceName: { type: String, required: true, trim: true }, // Nombre del servicio (ej: "Cambio de aceite")
  serviceKey: { type: String, trim: true }, // Key del servicio si está vinculado
  mileageInterval: { type: Number, required: true }, // Intervalo en km (ej: 10000)
  lastPerformedMileage: { type: Number, default: null }, // Último kilometraje en que se realizó
  lastPerformedDate: { type: Date, default: null }, // Última fecha en que se realizó
  nextDueMileage: { type: Number, default: null }, // Próximo kilometraje en que debe realizarse
  status: {
    type: String,
    enum: ['pending', 'due', 'overdue', 'completed'],
    default: 'pending'
  }
}, { _id: true });

const VehicleServiceScheduleSchema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true },
  plate: { 
    type: String, 
    required: true, 
    uppercase: true, 
    trim: true, 
    index: true 
  },
  customerProfileId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CustomerProfile', 
    default: null,
    index: true 
  },
  // Kilometraje actual del vehículo
  currentMileage: { type: Number, default: null },
  // Fecha de última actualización del kilometraje
  mileageUpdatedAt: { type: Date, default: null },
  // Servicios programados
  services: { type: [ServiceScheduleItemSchema], default: [] },
  // Notas adicionales
  notes: { type: String, default: '' }
}, { timestamps: true });

// Índice único por placa y empresa
VehicleServiceScheduleSchema.index(
  { companyId: 1, plate: 1 },
  { unique: true }
);

// Índice para búsquedas por estado de servicios
VehicleServiceScheduleSchema.index({ companyId: 1, 'services.status': 1 });

/**
 * Actualiza el kilometraje actual y recalcula los servicios pendientes
 */
VehicleServiceScheduleSchema.methods.updateMileage = function(newMileage) {
  this.currentMileage = newMileage;
  this.mileageUpdatedAt = new Date();
  
  // Recalcular estado de cada servicio
  this.services.forEach(service => {
    if (service.lastPerformedMileage !== null) {
      service.nextDueMileage = service.lastPerformedMileage + service.mileageInterval;
      
      if (newMileage >= service.nextDueMileage) {
        service.status = 'overdue';
      } else if (newMileage >= service.nextDueMileage - (service.mileageInterval * 0.1)) {
        // 10% antes del intervalo = "due"
        service.status = 'due';
      } else {
        service.status = 'pending';
      }
    } else {
      // Si nunca se ha realizado, está pendiente
      service.status = 'pending';
    }
  });
};

/**
 * Marca un servicio como realizado
 */
VehicleServiceScheduleSchema.methods.markServiceCompleted = function(serviceId, mileage, date = null) {
  const service = this.services.id(serviceId);
  if (!service) return false;
  
  service.lastPerformedMileage = mileage;
  service.lastPerformedDate = date || new Date();
  service.nextDueMileage = mileage + service.mileageInterval;
  service.status = 'completed';
  
  // Si el kilometraje actual es menor, actualizarlo
  if (this.currentMileage === null || mileage > this.currentMileage) {
    this.currentMileage = mileage;
    this.mileageUpdatedAt = new Date();
  }
  
  // Recalcular estados de otros servicios
  this.updateMileage(this.currentMileage);
  
  return true;
};

export default mongoose.model('VehicleServiceSchedule', VehicleServiceScheduleSchema);

