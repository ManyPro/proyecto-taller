import mongoose from 'mongoose';

/**
 * MaintenanceTemplate: Plantilla de servicios de mantenimiento por vehículo
 * Basado en el Excel de mantenimiento Renault
 */
const MaintenanceTemplateSchema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true },
  // ID del servicio (ej: REN-010)
  serviceId: { 
    type: String, 
    required: true, 
    trim: true, 
    uppercase: true,
    index: true 
  },
  // Sistema al que pertenece (Motor, Filtración, Diagnóstico, etc.)
  system: { 
    type: String, 
    required: true, 
    trim: true 
  },
  // Nombre del servicio
  serviceName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  // Tipo de servicio (CAMBIO, REVISIÓN, etc.)
  serviceType: { 
    type: String, 
    required: true, 
    trim: true,
    uppercase: true 
  },
  // Intervalo en kilómetros
  mileageInterval: { 
    type: Number, 
    default: null 
  },
  // Intervalo en meses
  monthsInterval: { 
    type: Number, 
    default: null 
  },
  // Condición (ej: "Lo que ocurra primero")
  condition: { 
    type: String, 
    default: '' 
  },
  // A qué vehículos aplica (ej: "Todos Renault (CO)")
  appliesTo: { 
    type: String, 
    default: '' 
  },
  // Notas para mostrar en web
  notes: { 
    type: String, 
    default: '' 
  },
  // Fuente/referencia
  source: { 
    type: String, 
    default: '' 
  },
  // Vehículos específicos (opcional - para filtrado)
  vehicleIds: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Vehicle' 
  }],
  // Marcas específicas (opcional)
  makes: [{ 
    type: String, 
    trim: true, 
    uppercase: true 
  }],
  // Líneas específicas (opcional)
  lines: [{ 
    type: String, 
    trim: true, 
    uppercase: true 
  }],
  // Es servicio común (para mostrar primero en listas)
  isCommon: { 
    type: Boolean, 
    default: false,
    index: true 
  },
  // Orden de prioridad (menor = más importante)
  priority: { 
    type: Number, 
    default: 100 
  },
  // Activo
  active: { 
    type: Boolean, 
    default: true,
    index: true 
  }
}, { timestamps: true });

// Índice único por companyId y serviceId
MaintenanceTemplateSchema.index(
  { companyId: 1, serviceId: 1 },
  { unique: true }
);

// Índice para búsquedas por sistema
MaintenanceTemplateSchema.index({ companyId: 1, system: 1, active: 1 });

// Índice para servicios comunes
MaintenanceTemplateSchema.index({ companyId: 1, isCommon: 1, active: 1 });

// Índice para búsquedas por vehículo
MaintenanceTemplateSchema.index({ companyId: 1, vehicleIds: 1, active: 1 });

export default mongoose.model('MaintenanceTemplate', MaintenanceTemplateSchema);

