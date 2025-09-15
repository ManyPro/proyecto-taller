import mongoose from 'mongoose';

const MediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String },
    mimetype: { type: String }
  },
  { _id: false }
);

const NoteSchema = new mongoose.Schema(
  {
    plate: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: ['GENERICA', 'PAGO'], default: 'GENERICA' },
    text: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    technician: { type: String, uppercase: true, trim: true },
    media: [MediaSchema],

    // ✅ multi-tenant consistente con el resto de modelos
    companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Types.ObjectId }
  },
  { timestamps: true }
);

// índices útiles
NoteSchema.index({ companyId: 1, createdAt: -1 });
NoteSchema.index({ companyId: 1, plate: 1, createdAt: -1 });

export default mongoose.model('Note', NoteSchema);
