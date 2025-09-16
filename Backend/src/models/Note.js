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

    // Nuevo: Persona encargada (multi-tenant friendly, almacenamos en MAYÚSCULAS controladas)
    responsible: {
      type: String,
      required: true,
      enum: ['DAVID', 'VALENTIN', 'SEBASTIAN', 'GIOVANNY', 'SANDRA', 'CEDIEL']
    },

    // Si es PAGO, se usa amount (ya estaba)
    amount: { type: Number, default: 0 },

    // Mantengo technician por compatibilidad (opcional)
    technician: { type: String, uppercase: true, trim: true },

    media: [MediaSchema],

    // Multi-tenant
    companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Types.ObjectId }
  },
  { timestamps: true }
);

// índices útiles por empresa
NoteSchema.index({ companyId: 1, createdAt: -1 });
NoteSchema.index({ companyId: 1, plate: 1, createdAt: -1 });

export default mongoose.model('Note', NoteSchema);
