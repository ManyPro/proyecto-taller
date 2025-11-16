import mongoose from 'mongoose';

/**
 * ClientCompanyLink: Vincula placas/clientes a empresas
 * - Para empresas recurrentes: link permanente hasta que se elimine
 * - Para empresas particulares: link temporal solo para la venta específica
 */
const ClientCompanyLinkSchema = new mongoose.Schema({
  companyId: { type: String, required: true, index: true }, // ID del taller
  companyAccountId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CompanyAccount', 
    required: true, 
    index: true 
  },
  
  // Información del cliente/vehículo
  plate: { 
    type: String, 
    uppercase: true, 
    trim: true, 
    required: true, 
    index: true 
  },
  customerIdNumber: { type: String, default: '', index: true },
  customerName: { type: String, default: '' },
  customerPhone: { type: String, default: '' },
  
  // Tipo de link: 'permanent' (recurrente) o 'temporary' (particular - solo para una venta)
  linkType: { 
    type: String, 
    enum: ['permanent', 'temporary'], 
    required: true,
    index: true 
  },
  
  // Para links temporales: referencia a la venta específica
  saleId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Sale', 
    default: null,
    index: true 
  },
  
  // Fecha de creación del link
  linkedAt: { type: Date, default: Date.now },
  
  // Fecha de desvinculación (si se elimina el link)
  unlinkedAt: { type: Date, default: null },
  
  // Estado
  active: { type: Boolean, default: true, index: true },
  
  // Metadatos
  notes: { type: String, default: '' }
}, { timestamps: true });

// Índices compuestos para búsquedas eficientes
ClientCompanyLinkSchema.index({ companyId: 1, plate: 1, active: 1 });
ClientCompanyLinkSchema.index({ companyAccountId: 1, active: 1 });
ClientCompanyLinkSchema.index({ companyId: 1, companyAccountId: 1, active: 1 });
ClientCompanyLinkSchema.index({ saleId: 1, active: 1 });

export default mongoose.model('ClientCompanyLink', ClientCompanyLinkSchema);

