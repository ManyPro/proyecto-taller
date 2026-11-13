import mongoose from 'mongoose';

const DiagnosisDocumentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, required: true, trim: true },
    source: { type: String, required: true, trim: true },
    versionOrDate: { type: String, default: '', trim: true },
    application: { type: String, default: '', trim: true },
    section: { type: String, default: '', trim: true },
    engineCode: { type: String, default: '', trim: true },
    model: { type: String, default: '', trim: true },
    yearFrom: { type: Number, default: null },
    yearTo: { type: Number, default: null },
    ecu: { type: String, default: '', trim: true },
    kind: { type: String, enum: ['ficha', 'manual', 'boletin', 'procedimiento', 'antecedente'], default: 'ficha' },
    body: { type: String, default: '' },
    reviewed: { type: Boolean, default: false },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

DiagnosisDocumentSchema.index({ companyId: 1, engineCode: 1, model: 1, active: 1 });
DiagnosisDocumentSchema.index({ companyId: 1, reviewed: 1, updatedAt: -1 });

export default mongoose.model('DiagnosisDocument', DiagnosisDocumentSchema);
