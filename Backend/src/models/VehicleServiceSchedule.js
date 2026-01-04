import mongoose from 'mongoose';

/**
 * VehicleServiceSchedule: Planilla de servicios por kilometraje
 * Permite rastrear qué servicios deben realizarse según el kilometraje del vehículo
 */
const ServiceScheduleItemSchema = new mongoose.Schema({
  serviceName: { type: String, required: true, trim: true }, // Nombre del servicio (ej: "Cambio de aceite")
  serviceKey: { type: String, trim: true }, // Key del servicio si está vinculado
  system: { type: String, trim: true }, // Sistema al que pertenece (ej: Motor, Filtración)
  mileageInterval: { type: Number, required: true }, // Intervalo en km (ej: 10000)
  monthsInterval: { type: Number, default: 0 }, // Intervalo en meses
  lastPerformedMileage: { type: Number, default: null }, // Último kilometraje en que se realizó
  lastPerformedDate: { type: Date, default: null }, // Última fecha en que se realizó
  nextDueMileage: { type: Number, default: null }, // Próximo kilometraje en que debe realizarse
  nextDueDate: { type: Date, default: null }, // Próxima fecha en que debe realizarse
  status: {
    type: String,
    enum: ['pending', 'due', 'overdue', 'completed'],
    default: 'pending'
  },
  notes: { type: String, trim: true, default: '' } // Notas adicionales
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
  if (newMileage === null || newMileage === undefined) return;
  
  const oldMileage = this.currentMileage;
  this.currentMileage = newMileage;
  this.mileageUpdatedAt = new Date();
  
  // Recalcular estado de cada servicio
  this.services.forEach(service => {
    // Si el servicio ya está completado, no recalcular
    if (service.status === 'completed') return;
    
    // Si no tiene un intervalo definido, no se puede calcular
    if (!service.mileageInterval || service.mileageInterval <= 0) {
      service.status = 'pending';
      return;
    }
    
    // Calcular próximo vencimiento por kilometraje
    if (service.lastPerformedMileage !== null) {
      // Si ya se realizó, calcular desde el último realizado
      service.nextDueMileage = service.lastPerformedMileage + service.mileageInterval;
    } else {
      // Si nunca se ha realizado, calcular desde el kilometraje actual
      service.nextDueMileage = newMileage + service.mileageInterval;
    }
    
    // Calcular próximo vencimiento por fecha (si aplica)
    if (service.monthsInterval > 0) {
      if (service.lastPerformedDate) {
        const nextDate = new Date(service.lastPerformedDate);
        nextDate.setMonth(nextDate.getMonth() + service.monthsInterval);
        service.nextDueDate = nextDate;
      } else {
        const nextDate = new Date();
        nextDate.setMonth(nextDate.getMonth() + service.monthsInterval);
        service.nextDueDate = nextDate;
      }
    }
    
    // Determinar estado basado en kilometraje
    if (service.nextDueMileage !== null) {
      if (newMileage >= service.nextDueMileage) {
        service.status = 'overdue';
      } else if (newMileage >= service.nextDueMileage - (service.mileageInterval * 0.1)) {
        // 10% antes del intervalo = "due" (próximo)
        service.status = 'due';
      } else {
        service.status = 'pending';
      }
    } else {
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

