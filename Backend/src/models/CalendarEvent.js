import mongoose from 'mongoose';

const CalendarEventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    allDay: { type: Boolean, default: false },
    
    // Si el evento tiene notificación
    hasNotification: { type: Boolean, default: false },
    notificationAt: { type: Date },
    
    // Tipo de evento: 'event' (evento del calendario) o 'reminder' (recordatorio de nota)
    eventType: { 
      type: String, 
      enum: ['event', 'reminder'], 
      default: 'event' 
    },
    
    // Si es un recordatorio de nota, referencia a la nota
    noteId: { type: mongoose.Types.ObjectId, ref: 'Note' },
    
    // Color del evento (opcional)
    color: { type: String, default: '#3b82f6' },
    
    // Multi-tenant
    companyId: { type: mongoose.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Types.ObjectId }
  },
  { timestamps: true }
);

// Índices útiles
CalendarEventSchema.index({ companyId: 1, startDate: 1 });
CalendarEventSchema.index({ companyId: 1, startDate: 1, endDate: 1 });
CalendarEventSchema.index({ companyId: 1, noteId: 1 });
CalendarEventSchema.index({ companyId: 1, notificationAt: 1 });

export default mongoose.model('CalendarEvent', CalendarEventSchema);

