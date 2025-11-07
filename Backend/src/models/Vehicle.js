import mongoose from 'mongoose';

const VehicleSchema = new mongoose.Schema({
  // Marca del vehículo (ej: RENAULT, CHEVROLET, etc.)
  make: { 
    type: String, 
    required: true, 
    trim: true, 
    uppercase: true,
    index: true
  },
  
  // Línea del vehículo (ej: DUSTER, SANDERO, SPARK, etc.)
  line: { 
    type: String, 
    required: true, 
    trim: true, 
    uppercase: true,
    index: true
  },
  
  // Cilindraje (ej: 1.6, 2.0, 1.0, etc.)
  displacement: { 
    type: String, 
    required: true, 
    trim: true, 
    uppercase: true,
    index: true
  },
  
  // Modelo: puede ser un año fijo o un rango
  // Si es rango: "2018-2022" o "2018-2024"
  // Si es fijo: "2020"
  // Si es null/undefined: no tiene restricción de modelo
  modelYear: {
    type: String,
    trim: true,
    default: null,
    validate: {
      validator: function(v) {
        if (!v || v === '') return true; // Permitir vacío/null
        // Validar formato: año fijo (4 dígitos) o rango (YYYY-YYYY)
        return /^\d{4}$/.test(v) || /^\d{4}-\d{4}$/.test(v);
      },
      message: 'modelYear debe ser un año (YYYY) o un rango (YYYY-YYYY)'
    }
  },
  
  // Activo (para soft delete)
  active: { 
    type: Boolean, 
    default: true,
    index: true
  }
}, { 
  timestamps: true 
});

// Índice único: make + line + displacement + modelYear
// Si modelYear es null, se considera como parte de la combinación única
VehicleSchema.index(
  { make: 1, line: 1, displacement: 1, modelYear: 1 },
  { 
    unique: true,
    sparse: true,
    partialFilterExpression: { active: true }
  }
);

// Índices para búsquedas rápidas
VehicleSchema.index({ make: 1, line: 1 });
VehicleSchema.index({ make: 1, active: 1 });

// Método helper para verificar si un año está en el rango
VehicleSchema.methods.isYearInRange = function(year) {
  if (!this.modelYear) return true; // Sin restricción
  if (!year) return true; // Si no se especifica año, permitir
  
  const yearNum = Number(year);
  if (!Number.isFinite(yearNum)) return true;
  
  // Si es año fijo
  if (/^\d{4}$/.test(this.modelYear)) {
    return Number(this.modelYear) === yearNum;
  }
  
  // Si es rango
  if (/^\d{4}-\d{4}$/.test(this.modelYear)) {
    const [start, end] = this.modelYear.split('-').map(Number);
    return yearNum >= start && yearNum <= end;
  }
  
  return true;
};

// Método helper para obtener el rango de años
VehicleSchema.methods.getYearRange = function() {
  if (!this.modelYear) return null;
  if (/^\d{4}$/.test(this.modelYear)) {
    return { start: Number(this.modelYear), end: Number(this.modelYear) };
  }
  if (/^\d{4}-\d{4}$/.test(this.modelYear)) {
    const [start, end] = this.modelYear.split('-').map(Number);
    return { start, end };
  }
  return null;
};

export default mongoose.model('Vehicle', VehicleSchema);

