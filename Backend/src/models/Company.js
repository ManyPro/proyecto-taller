import mongoose from 'mongoose';

const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true },
  publicCatalogEnabled: { type: Boolean, default: false }, // habilita catálogo público segmentado
    // Conjunto de funcionalidades habilitadas por empresa
    // Si una clave no existe, el front asumirá true por retrocompatibilidad.
    features: {
      type: Object,
      default: {
        notas: true,
        ventas: true,
        cotizaciones: true,
        inventario: true,
        precios: true,
        cashflow: true,
        templates: true,
        skus: true,
        techreport: true
      }
    },
    // Sub-funciones por módulo (todas habilitadas por defecto para compatibilidad)
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
    // Restricciones administradas por Admin (no visibles para empresa)
    restrictions: {
      type: Object,
      default: {
        cashflow: { hideBalances: false }
      }
    },
    // Legacy reset fields (pueden quedar vacíos en modo local)
    passwordResetTokenHash: { type: String, default: '' },
    passwordResetExpires: { type: Date, default: null },
    // Lista simple (legacy) de t�cnicos (may�sculas)\ntechnicians: { type: [String], default: [] },\n    // Perfiles de t�cnico con tasas por tipo de maniobra\n    technicianProfiles: { type: [{\n      name: { type: String, required: true, uppercase: true, trim: true },\n      active: { type: Boolean, default: true },\n      rates: { type: [{ kind: String, percent: Number }], default: [] }\n    }], default: [] },
    // Preferencias de la empresa
    preferences: {
      laborPercents: { type: [Number], default: [30, 40, 50] },\n      laborKinds: { type: [String], default: ['MOTOR','SUSPENSION','FRENOS'] },
      // Número de WhatsApp para contacto público (E.164 o local). Ej: +573001234567
      whatsAppNumber: { type: String, default: '' }
    }
  },
  { timestamps: true }
);

export default mongoose.model('Company', CompanySchema);

