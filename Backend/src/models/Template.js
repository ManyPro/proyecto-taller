import mongoose from 'mongoose';

// Tipos de documento soportados inicialmente
const DOC_TYPES = ['quote','invoice','workOrder','sticker'];

const TemplateSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  type: { type: String, required: true, enum: DOC_TYPES, index: true },
  name: { type: String, default: '' },
  contentHtml: { type: String, default: '' },
  contentCss: { type: String, default: '' },
  version: { type: Number, default: 1 },
  active: { type: Boolean, default: false, index: true },
  meta: { type: Object, default: {} }
}, { timestamps: true });

TemplateSchema.index({ companyId: 1, type: 1, version: -1 });
TemplateSchema.index({ companyId: 1, type: 1, active: 1 });

export default mongoose.model('Template', TemplateSchema);
export const TEMPLATE_DOC_TYPES = DOC_TYPES;