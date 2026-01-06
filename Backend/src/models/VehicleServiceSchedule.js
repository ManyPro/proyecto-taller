import mongoose from 'mongoose';

/**
 * VehicleServiceSchedule: Planilla base de servicios por vehículo
 * Esta planilla es compartida por todos los clientes que tienen el mismo vehículo
 * Los datos específicos del cliente (KM, historial) se calculan al consultar
 */
const ServiceScheduleItemSchema = new mongoose.Schema({
  serviceName: { type: String, required: true, trim: true }, // Nombre del servicio (ej: "Cambio de aceite")
  serviceKey: { type: String, trim: true }, // Key del servicio si está vinculado
  system: { type: String, trim: true }, // Sistema al que pertenece (ej: Motor, Filtración)
  mileageInterval: { type: Number, required: true }, // Intervalo en km (mínimo, ej: 10000)
  mileageIntervalMax: { type: Number, default: null }, // Intervalo máximo en km (opcional, para rangos)
  monthsInterval: { type: Number, default: 0 }, // Intervalo en meses
  notes: { type: String, trim: true, default: '' } // Notas adicionales
}, { _id: true });

const VehicleServiceScheduleSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  vehicleId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Vehicle',
    required: true
  },
  // Servicios programados (planilla base del vehículo)
  services: { type: [ServiceScheduleItemSchema], default: [] },
  // Notas adicionales
  notes: { type: String, default: '' }
}, { timestamps: true });

// Índice único por vehículo y empresa
VehicleServiceScheduleSchema.index(
  { companyId: 1, vehicleId: 1 },
  { unique: true }
);

/**
 * Calcula el estado de los servicios para un cliente específico basado en su kilometraje e historial
 * @param {Number} currentMileage - Kilometraje actual del cliente
 * @param {Array} serviceHistory - Historial de servicios realizados por el cliente [{serviceKey, lastPerformedMileage, lastPerformedDate}]
 * @returns {Array} Servicios con estados calculados para el cliente
 */
VehicleServiceScheduleSchema.methods.calculateServicesForCustomer = function(currentMileage, serviceHistory = []) {
  if (!currentMileage || currentMileage <= 0) {
    return this.services.map(service => ({
      ...service.toObject(),
      lastPerformedMileage: null,
      lastPerformedDate: null,
      nextDueMileage: null,
      nextDueDate: null,
      status: 'pending'
    }));
  }

  // Crear mapa de historial por serviceKey
  const historyMap = new Map();
  serviceHistory.forEach(h => {
    if (h.serviceKey) {
      historyMap.set(h.serviceKey, h);
    }
  });

  return this.services.map(service => {
    const history = historyMap.get(service.serviceKey);
    const lastPerformedMileage = history?.lastPerformedMileage || null;
    const lastPerformedDate = history?.lastPerformedDate || null;

    // Calcular próximo vencimiento por kilometraje
    let nextDueMileage = null;
    if (service.mileageInterval && service.mileageInterval > 0) {
      if (lastPerformedMileage !== null) {
        nextDueMileage = lastPerformedMileage + service.mileageInterval;
      } else {
        nextDueMileage = currentMileage + service.mileageInterval;
      }
    }

    // Calcular próximo vencimiento por fecha (si aplica)
    let nextDueDate = null;
    if (service.monthsInterval > 0) {
      if (lastPerformedDate) {
        const nextDate = new Date(lastPerformedDate);
        nextDate.setMonth(nextDate.getMonth() + service.monthsInterval);
        nextDueDate = nextDate;
      } else {
        const nextDate = new Date();
        nextDate.setMonth(nextDate.getMonth() + service.monthsInterval);
        nextDueDate = nextDate;
      }
    }

    // Determinar estado basado en kilometraje
    let status = 'pending';
    if (nextDueMileage !== null) {
      if (currentMileage >= nextDueMileage) {
        status = 'overdue';
      } else if (currentMileage >= nextDueMileage - (service.mileageInterval * 0.1)) {
        // 10% antes del intervalo = "due" (próximo)
        status = 'due';
      } else {
        status = 'pending';
      }
    }

    // Si el servicio está completado (tiene historial reciente), mantenerlo como completado
    if (lastPerformedMileage !== null && lastPerformedMileage > 0) {
      // Verificar si el servicio ya fue realizado y no ha llegado el próximo
      if (nextDueMileage && currentMileage < nextDueMileage) {
        status = 'completed';
      }
    }

    return {
      ...service.toObject(),
      lastPerformedMileage,
      lastPerformedDate,
      nextDueMileage,
      nextDueDate,
      status
    };
  });
};

export default mongoose.model('VehicleServiceSchedule', VehicleServiceScheduleSchema);

