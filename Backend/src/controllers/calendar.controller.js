import CalendarEvent from "../models/CalendarEvent.js";
import Note from "../models/Note.js";
import mongoose from "mongoose";

export const listEvents = async (req, res) => {
  const { from, to } = req.query;
  
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  
  if (from || to) {
    q.$or = [
      // Eventos que empiezan en el rango
      { startDate: { $gte: new Date(from || '1970-01-01'), $lte: new Date(to || '2100-12-31') } },
      // Eventos que terminan en el rango
      { endDate: { $gte: new Date(from || '1970-01-01'), $lte: new Date(to || '2100-12-31') } },
      // Eventos que abarcan el rango completo
      { 
        startDate: { $lte: new Date(from || '1970-01-01') },
        endDate: { $gte: new Date(to || '2100-12-31') }
      }
    ];
  }
  
  const events = await CalendarEvent.find(q)
    .sort({ startDate: 1 })
    .lean();
  
  res.json({ items: events });
};

export const createEvent = async (req, res) => {
  const { title, description, startDate, endDate, allDay, hasNotification, notificationAt, color } = req.body || {};
  
  if (!title || !startDate) {
    return res.status(400).json({ error: "title y startDate son requeridos" });
  }
  
  const event = await CalendarEvent.create({
    title: String(title).trim(),
    description: description || '',
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : undefined,
    allDay: Boolean(allDay),
    hasNotification: Boolean(hasNotification),
    notificationAt: hasNotification && notificationAt ? new Date(notificationAt) : undefined,
    color: color || '#3b82f6',
    eventType: 'event',
    companyId: new mongoose.Types.ObjectId(req.companyId),
    userId: req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined
  });
  
  res.status(201).json({ item: event });
};

export const updateEvent = async (req, res) => {
  const { id } = req.params;
  const body = { ...req.body };
  
  if (body.startDate) body.startDate = new Date(body.startDate);
  if (body.endDate) body.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.notificationAt) body.notificationAt = body.notificationAt ? new Date(body.notificationAt) : null;
  if (body.hasNotification !== undefined) body.hasNotification = Boolean(body.hasNotification);
  if (body.allDay !== undefined) body.allDay = Boolean(body.allDay);
  
  const event = await CalendarEvent.findOneAndUpdate(
    { _id: id, companyId: new mongoose.Types.ObjectId(req.companyId) },
    body,
    { new: true }
  );
  
  if (!event) return res.status(404).json({ error: "Evento no encontrado" });
  res.json({ item: event });
};

export const deleteEvent = async (req, res) => {
  const { id } = req.params;
  const del = await CalendarEvent.findOneAndDelete({
    _id: id,
    companyId: new mongoose.Types.ObjectId(req.companyId),
  });
  
  if (!del) return res.status(404).json({ error: "Evento no encontrado" });
  res.status(204).end();
};

// Sincronizar recordatorios de notas como eventos del calendario
export const syncNoteReminders = async (req, res) => {
  const companyId = new mongoose.Types.ObjectId(req.companyId);
  
  // Obtener todas las notas con recordatorios
  const notes = await Note.find({
    companyId,
    reminderAt: { $exists: true, $ne: null }
  }).lean();
  
  const synced = [];
  
  for (const note of notes) {
    // Buscar si ya existe un evento para este recordatorio
    let event = await CalendarEvent.findOne({
      companyId,
      noteId: note._id,
      eventType: 'reminder'
    });
    
    if (event) {
      // Actualizar evento existente
      event.startDate = new Date(note.reminderAt);
      event.title = `Recordatorio: ${note.plate}`;
      event.description = note.text || '';
      event.hasNotification = true;
      event.notificationAt = new Date(note.reminderAt);
      event.color = '#f59e0b'; // Color amarillo/naranja para recordatorios
      await event.save();
    } else {
      // Crear nuevo evento
      event = await CalendarEvent.create({
        title: `Recordatorio: ${note.plate}`,
        description: note.text || '',
        startDate: new Date(note.reminderAt),
        allDay: false,
        hasNotification: true,
        notificationAt: new Date(note.reminderAt),
        color: '#f59e0b',
        eventType: 'reminder',
        noteId: note._id,
        companyId,
        userId: note.userId ? new mongoose.Types.ObjectId(note.userId) : undefined
      });
    }
    
    synced.push(event);
  }
  
  // Eliminar eventos de recordatorios para notas que ya no tienen recordatorio
  const noteIds = notes.map(n => n._id);
  await CalendarEvent.deleteMany({
    companyId,
    eventType: 'reminder',
    noteId: { $nin: noteIds }
  });
  
  res.json({ synced: synced.length, items: synced });
};

