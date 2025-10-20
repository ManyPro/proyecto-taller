import mongoose from 'mongoose';

// Clean re-write of Company schema to fix prior encoding/escape issues
const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true },

    // Public catalog toggle (feature for items)
    publicCatalogEnabled: { type: Boolean, default: false },

    // Features (module flags)
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

    // Sub-features per module (UI gating)
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

    // Restrictions (read-only preferences)
    restrictions: {
      type: Object,
      default: {
        cashflow: { hideBalances: false }
      }
    },

    // Password reset (legacy)
    passwordResetTokenHash: { type: String, default: '' },
    passwordResetExpires: { type: Date, default: null },

    // Legacy list of technicians (UPPERCASE strings)
    technicians: { type: [String], default: [] },

    // Company preferences
    preferences: {
      laborPercents: { type: [Number], default: [30, 40, 50] },
      laborKinds: { type: [String], default: ['MOTOR', 'SUSPENSION', 'FRENOS'] },
      whatsAppNumber: { type: String, default: '' }
    }
  },
  { timestamps: true }
);

export default mongoose.model('Company', CompanySchema);

