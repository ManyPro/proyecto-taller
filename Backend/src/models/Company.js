import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true },
    publicCatalogEnabled: { type: Boolean, default: false },

    features: {
      type: Object,
      default: {}
    },

    featureOptions: {
      type: Object,
      default: {
        inventario: {
          ingresoVehiculo: true,
          ingresoCompra: true,
          marketplace: true,
          publicCatalogFields: true
        },
        ventas: {
          importarCotizacion: true,
          ordenesTrabajo: true
        },
        precios: {
          importarCSV: true
        },
        templates: {
          duplicar: true,
          activar: true
        }
      }
    },

    restrictions: {
      type: Object,
      default: {}
    },

    passwordResetTokenHash: { type: String, default: '' },
    passwordResetExpires: { type: Date, default: null },

    technicians: {
      type: [{
        name: { type: String, required: true, trim: true },
        identification: { type: String, default: '', trim: true },
        basicSalary: { type: Number, default: null }, // Salario básico mensual
        workHoursPerMonth: { type: Number, default: null }, // Horas de trabajo por mes
        basicSalaryPerDay: { type: Number, default: null }, // Salario básico por día
        contractType: { type: String, default: '', trim: true } // Tipo de contrato
      }],
      default: []
    },

    preferences: {
      laborPercents: { type: [Number], default: [30, 40, 50] },
      laborKinds: { type: [String], default: ['MOTOR', 'SUSPENSION', 'FRENOS'] },
      whatsAppNumber: { type: String, default: '' }
    }
  },
  { timestamps: true }
);

export default mongoose.model('Company', CompanySchema);
