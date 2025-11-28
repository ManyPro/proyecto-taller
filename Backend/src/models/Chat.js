import mongoose from 'mongoose';

const InventoryHistoryItemSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  sku: { type: String, trim: true },
  name: { type: String, trim: true },
  searchedAt: { type: Date, default: Date.now }
}, { _id: false });

const ChatCommentSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const ChatSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Cliente vinculado
  customer: {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true }
  },
  
  // Vehículo vinculado
  vehicle: {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    year: { type: String, trim: true, default: '' }
  },
  
  // Técnico asignado
  technician: { type: String, trim: true, default: '' },
  
  // Contexto del chat
  context: { type: String, trim: true, default: '' },
  
  // Plataforma (Messenger, TikTok, Instagram, WhatsApp)
  platform: {
    type: String,
    enum: ['Messenger', 'TikTok', 'Instagram', 'WhatsApp'],
    default: 'WhatsApp'
  },
  
  // Precio de cotización
  quotePrice: { type: Number, default: null },
  
  // Historial de items consultados del inventario
  inventoryHistory: {
    type: [InventoryHistoryItemSchema],
    default: []
  },
  
  // Comentarios del chat
  comments: {
    type: [ChatCommentSchema],
    default: []
  },
  
  // Escalado a ADMIN
  escalatedToAdmin: { type: Boolean, default: false },
  
  // Chat activo
  active: { type: Boolean, default: true, index: true }
}, { timestamps: true });

// Índices útiles
ChatSchema.index({ companyId: 1, active: 1, createdAt: -1 });
ChatSchema.index({ companyId: 1, 'customer.phone': 1 });

export default mongoose.model('Chat', ChatSchema);

