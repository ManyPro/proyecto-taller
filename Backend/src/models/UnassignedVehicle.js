import mongoose from 'mongoose';

const UnassignedVehicleSchema = new mongoose.Schema({
  companyId: { type: String, index: true, required: true },
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerProfile' },
  
  // Datos del cliente
  customer: {
    idNumber: { type: String, default: '' },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  
  // Datos del vehículo del cliente (desde legacy)
  vehicleData: {
    plate: { type: String, uppercase: true, trim: true, default: '' },
    brand: { type: String, default: '' }, // Marca desde legacy
    line: { type: String, default: '' },  // Línea desde legacy
    engine: { type: String, default: '' }, // Cilindraje desde legacy
    year: { type: Number, default: null }
  },
  
  // Vehículo sugerido de la BD (si hay similitud)
  suggestedVehicle: {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    make: { type: String, default: '' },
    line: { type: String, default: '' },
    displacement: { type: String, default: '' },
    matchType: { 
      type: String, 
      enum: ['exact', 'engine_similarity'], 
      default: null 
    }, // Tipo de coincidencia encontrada
    confidence: { type: String, default: '' } // Descripción de la similitud
  },
  
  // Estado de la asignación
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'deleted'],
    default: 'pending',
    index: true
  },
  
  // Notas adicionales
  notes: { type: String, default: '' },
  
  // Metadatos
  source: { type: String, default: 'import' }, // Origen: import, manual, etc.
  legacyData: { type: Object, default: {} } // Datos originales del CSV legacy
}, { timestamps: true });

// Índices para búsquedas rápidas
UnassignedVehicleSchema.index({ companyId: 1, status: 1 });
UnassignedVehicleSchema.index({ companyId: 1, 'vehicleData.plate': 1 });
UnassignedVehicleSchema.index({ profileId: 1 });

export default mongoose.model('UnassignedVehicle', UnassignedVehicleSchema);

