import mongoose from 'mongoose';

const TechnicianAssignmentSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  technicianId: { type: mongoose.Schema.Types.ObjectId, required: false, index: true },
  technicianName: { type: String, required: false, index: true }, // mayúsculas sugeridas lado cliente
  conceptId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'CompanyPayrollConcept', index: true },
  valueOverride: { type: Number, default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// No se puede hacer unique condicional simple; agregamos dos índices para cubrir ambos casos
TechnicianAssignmentSchema.index({ companyId: 1, technicianId: 1, conceptId: 1 }, { unique: true, partialFilterExpression: { technicianId: { $type: 'objectId' } } });
TechnicianAssignmentSchema.index({ companyId: 1, technicianName: 1, conceptId: 1 }, { unique: true, partialFilterExpression: { technicianName: { $type: 'string' } } });

export default mongoose.model('TechnicianAssignment', TechnicianAssignmentSchema);


