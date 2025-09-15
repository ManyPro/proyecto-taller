import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema({
  fileId: { type: mongoose.Types.ObjectId, required: true },
  filename: String,
  mimetype: String,
  size: Number,
}, { _id: false });

const noteSchema = new mongoose.Schema({
  companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
  plate: { type: String, required: true, uppercase: true, index: true, trim: true },
  type: { type: String, enum: ["GENERICA", "PAGO"], required: true, index: true },
  content: { type: String, required: true, trim: true },
  media: { type: [mediaSchema], default: [] },
}, { timestamps: true });

noteSchema.index({ companyId: 1, createdAt: -1 });
noteSchema.index({ companyId: 1, plate: 1, createdAt: -1 });

export default mongoose.model("Note", noteSchema);
