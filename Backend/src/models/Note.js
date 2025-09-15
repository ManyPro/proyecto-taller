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
    companyId: { type: String },
    userId: { type: String }
  },
  { timestamps: true }
);

NoteSchema.index({ plate: 1, createdAt: -1 });

export default mongoose.model('Note', NoteSchema);
