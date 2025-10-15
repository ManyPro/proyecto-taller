import mongoose from 'mongoose';

const SKUSchema = new mongoose.Schema({
  // Código único del SKU
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  
  // Tipo de repuesto/categoría
  category: {
    type: String,
    required: true,
    trim: true,
    enum: [
      'MOTOR',
      'TRANSMISION',
      'FRENOS',
      'SUSPENSION',
      'ELECTRICO',
      'CARROCERIA',
      'INTERIOR',
      'FILTROS',
      'ACEITES',
      'NEUMATICOS',
      'OTROS'
    ]
  },
  
  // Descripción del repuesto
  description: {
    type: String,
    required: true,
    trim: true
  },
  
  // Estado de impresión del sticker
  printStatus: {
    type: String,
    enum: ['pending', 'printed', 'applied'],
    default: 'pending'
  },
  
  // Fecha de impresión
  printedAt: {
    type: Date,
    default: null
  },
  
  // Notas del item
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  
  // Información adicional
  brand: {
    type: String,
    trim: true
  },
  
  partNumber: {
    type: String,
    trim: true
  },
  
  location: {
    type: String,
    trim: true
  },
  
  // Empresa propietaria
  companyId: {
    type: mongoose.Types.ObjectId,
    required: true,
    index: true,
    ref: 'Company'
  },
  
  // Metadatos
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  createdBy: {
    type: String,
    trim: true
  }
});

// Índices
SKUSchema.index({ companyId: 1, category: 1 });
SKUSchema.index({ companyId: 1, code: 1 }, { unique: true });
SKUSchema.index({ companyId: 1, printStatus: 1 });

// Middleware para actualizar updatedAt
SKUSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.updatedAt = new Date();
  }
  next();
});

// Método estático para generar el siguiente SKU basado en un prefijo
SKUSchema.statics.getNextSKUCode = async function(companyId, prefix) {
  // Buscar todos los SKUs que empiecen con el prefijo
  const regex = new RegExp(`^${prefix.toUpperCase()}(\\d+)$`, 'i');
  const existingSKUs = await this.find({
    companyId: companyId,
    code: { $regex: regex }
  }).select('code').sort({ code: 1 });
  
  if (existingSKUs.length === 0) {
    return `${prefix.toUpperCase()}01`;
  }
  
  // Extraer números y encontrar el más alto
  let maxNumber = 0;
  for (const sku of existingSKUs) {
    const match = sku.code.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) {
        maxNumber = num;
      }
    }
  }
  
  // Generar siguiente número con formato 01, 02, etc.
  const nextNumber = maxNumber + 1;
  const paddedNumber = nextNumber.toString().padStart(2, '0');
  return `${prefix.toUpperCase()}${paddedNumber}`;
};

// Método para obtener estadísticas por categoría
SKUSchema.statics.getStatsByCategory = async function(companyId) {
  return this.aggregate([
    { $match: { companyId } },
    {
      $group: {
        _id: '$category',
        total: { $sum: 1 },
        pending: {
          $sum: {
            $cond: [{ $eq: ['$printStatus', 'pending'] }, 1, 0]
          }
        },
        printed: {
          $sum: {
            $cond: [{ $eq: ['$printStatus', 'printed'] }, 1, 0]
          }
        },
        applied: {
          $sum: {
            $cond: [{ $eq: ['$printStatus', 'applied'] }, 1, 0]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

export default mongoose.model('SKU', SKUSchema);