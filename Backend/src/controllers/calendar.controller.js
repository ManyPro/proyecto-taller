import CalendarEvent from "../models/CalendarEvent.js";
import Note from "../models/Note.js";
import CustomerProfile from "../models/CustomerProfile.js";
import Vehicle from "../models/Vehicle.js";
import Quote from "../models/Quote.js";
import Company from "../models/Company.js";
import Notification from "../models/Notification.js";
import { upsertProfileFromSource } from "./profile.helper.js";
import { publish } from "../lib/live.js";
import mongoose from "mongoose";
import { parseDate, localToUTC, createDateRange } from "../lib/dateTime.js";

export const listEvents = async (req, res) => {
  const { from, to } = req.query;
  
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  
  if (from || to) {
    // Usar el util de fechas para crear el rango correctamente
    const dateRange = createDateRange(from || '1970-01-01', to || '2100-12-31');
    const rangeStart = dateRange.from || new Date('1970-01-01');
    const rangeEnd = dateRange.to || new Date('2100-12-31');
    
    q.$or = [
      // Eventos que empiezan en el rango
      { startDate: { $gte: rangeStart, $lte: rangeEnd } },
      // Eventos que terminan en el rango
      { endDate: { $gte: rangeStart, $lte: rangeEnd } },
      // Eventos que abarcan el rango completo
      { 
        startDate: { $lte: rangeStart },
        endDate: { $gte: rangeEnd }
      }
    ];
  }
  
  const events = await CalendarEvent.find(q)
    .sort({ startDate: 1 })
    .lean();
  
  res.json({ items: events });
};

export const createEvent = async (req, res) => {
  const { 
    title, description, startDate, endDate, allDay, hasNotification, notificationAt, color,
    plate, customer, vehicleId, quoteId
  } = req.body || {};
  
  if (!title || !startDate) {
    return res.status(400).json({ error: "title y startDate son requeridos" });
  }
  
  const companyId = new mongoose.Types.ObjectId(req.companyId);
  
  // Si hay placa, cliente y teléfono, crear/actualizar perfil de cliente
  if (plate && customer?.name && customer?.phone) {
    const normalizedPlate = String(plate).trim().toUpperCase();
    try {
      await upsertProfileFromSource(
        req.companyId,
        {
          customer: {
            name: customer.name || '',
            phone: customer.phone || '',
            email: customer.email || '',
            idNumber: customer.idNumber || '',
            address: customer.address || ''
          },
          vehicle: {
            plate: normalizedPlate,
            vehicleId: vehicleId || null
          }
        },
        { 
          source: 'calendar',
          overwriteCustomer: true,  // Sobrescribir datos del cliente si se editaron manualmente
          overwriteVehicle: true    // Sobrescribir datos del vehículo si se editaron manualmente
        }
      );
    } catch (err) {
      console.error('Error creating/updating customer profile:', err);
      // No fallar la creación del evento si falla el perfil
    }
  }
  
  // Usar el util de fechas para parsear correctamente
  const event = await CalendarEvent.create({
    title: String(title).trim(),
    description: description || '',
    startDate: localToUTC(startDate),
    endDate: endDate ? localToUTC(endDate) : undefined,
    allDay: Boolean(allDay),
    hasNotification: Boolean(hasNotification),
    notificationAt: hasNotification && notificationAt ? localToUTC(notificationAt) : undefined,
    color: color || '#3b82f6',
    eventType: 'event',
    plate: plate ? String(plate).trim().toUpperCase() : '',
    customer: plate && customer ? {
      name: String(customer.name || '').trim(),
      phone: String(customer.phone || '').trim()
    } : {},
    vehicleId: vehicleId ? new mongoose.Types.ObjectId(vehicleId) : null,
    quoteId: quoteId ? new mongoose.Types.ObjectId(quoteId) : null,
    companyId,
    userId: req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined
  });
  
  res.status(201).json({ item: event });
};

export const updateEvent = async (req, res) => {
  const { id } = req.params;
  const body = { ...req.body };
  
  // Usar el util de fechas para parsear correctamente
  if (body.startDate) body.startDate = localToUTC(body.startDate);
  if (body.endDate) body.endDate = body.endDate ? localToUTC(body.endDate) : null;
  if (body.notificationAt) body.notificationAt = body.notificationAt ? localToUTC(body.notificationAt) : null;
  if (body.hasNotification !== undefined) body.hasNotification = Boolean(body.hasNotification);
  if (body.allDay !== undefined) body.allDay = Boolean(body.allDay);
  
  // Manejar nuevos campos
  if (body.plate) body.plate = String(body.plate).trim().toUpperCase();
  if (body.customer) {
    body.customer = {
      name: String(body.customer.name || '').trim(),
      phone: String(body.customer.phone || '').trim()
    };
  }
  if (body.vehicleId) body.vehicleId = new mongoose.Types.ObjectId(body.vehicleId);
  if (body.quoteId) body.quoteId = new mongoose.Types.ObjectId(body.quoteId);
  if (body.saleId) body.saleId = new mongoose.Types.ObjectId(body.saleId);
  
  // Si hay placa, cliente y teléfono, crear/actualizar perfil de cliente
  if (body.plate && body.customer?.name && body.customer?.phone) {
    try {
      await upsertProfileFromSource(
        req.companyId,
        {
          customer: {
            name: body.customer.name || '',
            phone: body.customer.phone || '',
            email: body.customer.email || '',
            idNumber: body.customer.idNumber || '',
            address: body.customer.address || ''
          },
          vehicle: {
            plate: body.plate,
            vehicleId: body.vehicleId || null
          }
        },
        { 
          source: 'calendar',
          overwriteCustomer: true,  // Sobrescribir datos del cliente si se editaron manualmente
          overwriteVehicle: true    // Sobrescribir datos del vehículo si se editaron manualmente
        }
      );
    } catch (err) {
      console.error('Error updating customer profile:', err);
      // No fallar la actualización del evento si falla el perfil
    }
  }
  
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
    
    // Parsear la fecha del recordatorio (puede venir como Date de MongoDB o como string)
    const reminderDate = parseDate(note.reminderAt);
    
    if (event) {
      // Actualizar evento existente
      event.startDate = reminderDate;
      event.title = `Recordatorio: ${note.plate}`;
      event.description = note.text || '';
      event.hasNotification = true;
      event.notificationAt = reminderDate;
      event.color = '#f59e0b'; // Color amarillo/naranja para recordatorios
      await event.save();
    } else {
      // Crear nuevo evento
      event = await CalendarEvent.create({
        title: `Recordatorio: ${note.plate}`,
        description: note.text || '',
        startDate: reminderDate,
        allDay: false,
        hasNotification: true,
        notificationAt: reminderDate,
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

// Buscar cliente/vehículo por placa para autocompletar
export const searchByPlate = async (req, res) => {
  const plate = String(req.params.plate || '').trim().toUpperCase();
  if (!plate) {
    return res.status(400).json({ error: 'Placa requerida' });
  }
  
  const companyId = String(req.companyId);
  
  try {
    // Buscar perfil de cliente
    const profile = await CustomerProfile.findOne({
      companyId,
      $or: [{ plate }, { 'vehicle.plate': plate }]
    }).sort({ updatedAt: -1 });
    
    if (!profile) {
      return res.json({ 
        found: false,
        profile: null,
        vehicle: null
      });
    }
    
    const profileObj = profile.toObject();
    
    // Buscar vehículo si hay vehicleId
    let vehicle = null;
    if (profileObj.vehicle?.vehicleId) {
      vehicle = await Vehicle.findById(profileObj.vehicle.vehicleId).lean();
    }
    
    return res.json({
      found: true,
      profile: {
        customer: {
          name: profileObj.customer?.name || '',
          phone: profileObj.customer?.phone || ''
        },
        vehicle: {
          plate: profileObj.vehicle?.plate || plate,
          vehicleId: profileObj.vehicle?.vehicleId || null,
          brand: profileObj.vehicle?.brand || '',
          line: profileObj.vehicle?.line || '',
          engine: profileObj.vehicle?.engine || '',
          year: profileObj.vehicle?.year || null
        }
      },
      vehicle: vehicle ? {
        _id: vehicle._id,
        make: vehicle.make,
        line: vehicle.line,
        displacement: vehicle.displacement,
        modelYear: vehicle.modelYear
      } : null
    });
  } catch (err) {
    console.error('Error searching by plate:', err);
    return res.status(500).json({ error: 'Error al buscar por placa' });
  }
};

// Buscar cotizaciones por placa o cliente
export const getQuotesByPlate = async (req, res) => {
  const plate = String(req.params.plate || '').trim();
  const companyId = new mongoose.Types.ObjectId(req.companyId);
  
  if (!plate) {
    return res.status(400).json({ error: 'Placa requerida' });
  }
  
  try {
    // Normalizar placa: eliminar espacios, convertir a mayúsculas para búsqueda
    const normalizedPlate = plate.trim().toUpperCase();
    
    // Buscar con expresión regular case-insensitive para tolerar mayúsculas/minúsculas
    // Esto asegura que encuentre cotizaciones sin importar cómo se guardó la placa
    const quotes = await Quote.find({
      companyId,
      'vehicle.plate': new RegExp(`^${normalizedPlate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
    
    return res.json({ items: quotes });
  } catch (err) {
    console.error('Error getting quotes by plate:', err);
    return res.status(500).json({ error: 'Error al buscar cotizaciones' });
  }
};

// Obtener configuración del calendario
export const getSettings = async (req, res) => {
  try {
    const company = await Company.findById(req.companyId).lean();
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    
    return res.json({
      companyName: company.name || '',
      address: company.preferences?.calendar?.address || '',
      mapsLink: company.preferences?.calendar?.mapsLink || ''
    });
  } catch (err) {
    console.error('Error getting calendar settings:', err);
    return res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

// Actualizar configuración del calendario
export const updateSettings = async (req, res) => {
  const { address, mapsLink } = req.body || {};
  
  try {
    const company = await Company.findById(req.companyId);
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    
    if (!company.preferences) {
      company.preferences = {};
    }
    if (!company.preferences.calendar) {
      company.preferences.calendar = {};
    }
    
    if (address !== undefined) {
      company.preferences.calendar.address = String(address || '').trim();
    }
    if (mapsLink !== undefined) {
      company.preferences.calendar.mapsLink = String(mapsLink || '').trim();
    }
    
    await company.save();
    
    return res.json({
      companyName: company.name || '',
      address: company.preferences.calendar.address || '',
      mapsLink: company.preferences.calendar.mapsLink || ''
    });
  } catch (err) {
    console.error('Error updating calendar settings:', err);
    return res.status(500).json({ error: 'Error al actualizar configuración' });
  }
};

// Función para verificar y disparar notificaciones de eventos del calendario
export const checkCalendarNotifications = async () => {
  try {
    const now = new Date();
    // Buscar eventos con notificación pendiente (hasta 5 minutos después de la hora programada)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    const eventsToNotify = await CalendarEvent.find({
      hasNotification: true,
      notificationAt: {
        $gte: fiveMinutesAgo,
        $lte: fiveMinutesFromNow
      },
      $or: [
        { notified: { $exists: false } }, // Eventos sin campo notified (legacy)
        { notified: false }, // Eventos explícitamente no notificados
        { notified: { $ne: true } } // Eventos que no son true
      ]
    }).lean();
    
    for (const event of eventsToNotify) {
      try {
        // Crear notificación en la base de datos
        const notification = await Notification.create({
          companyId: event.companyId,
          type: 'calendar.event',
          data: {
            eventId: event._id.toString(),
            title: event.title,
            description: event.description,
            startDate: event.startDate,
            plate: event.plate || '',
            customerName: event.customer?.name || ''
          }
        });
        
        // Marcar el evento como notificado
        await CalendarEvent.updateOne(
          { _id: event._id },
          { $set: { notified: true } }
        );
        
        // Publicar evento SSE para todos los dispositivos conectados de la empresa
        publish(String(event.companyId), 'notification', {
          id: notification._id.toString(),
          type: 'calendar.event',
          data: notification.data,
          createdAt: notification.createdAt
        });
        
        console.log(`[checkCalendarNotifications] Notificación creada para evento ${event._id} de empresa ${event.companyId}`);
      } catch (err) {
        console.error(`[checkCalendarNotifications] Error procesando evento ${event._id}:`, err);
      }
    }
  } catch (err) {
    console.error('[checkCalendarNotifications] Error general:', err);
  }
};

