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
import { parseDate, localToUTC, createDateRange, now } from "../lib/dateTime.js";

const DEFAULT_APPOINTMENT_COLOR = '#2563EB';
const isValidHexColor = (value) => /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(String(value || '').trim());

/** @returns {string} '' o #RRGGBB mayúsculas */
const normalizeHexColor = (value) => {
  let c = String(value || '').trim();
  if (!c) return '';
  if (!c.startsWith('#')) c = `#${c}`;
  const m = c.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return '';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  return `#${h.toUpperCase()}`;
};

const hexToRgb = (hex) => {
  const n = normalizeHexColor(hex).slice(1);
  if (n.length !== 6) return null;
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
};

const hueFromHex = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return h * 360;
};

/**
 * Colores legacy de citas (morado/rosa → Milo, verde → Sandra, amarillo → Giovanny).
 * No toca citas azules u otros tonos.
 */
const legacyColorBucketFromHex = (hex) => {
  const n = normalizeHexColor(hex);
  if (!n) return null;
  const exact = {
    '#8B5CF6': 'purple_pink',
    '#7C3AED': 'purple_pink',
    '#A855F7': 'purple_pink',
    '#C026D3': 'purple_pink',
    '#D946EF': 'purple_pink',
    '#E879F9': 'purple_pink',
    '#EC4899': 'purple_pink',
    '#F472B6': 'purple_pink',
    '#10B981': 'green',
    '#059669': 'green',
    '#22C55E': 'green',
    '#16A34A': 'green',
    '#F59E0B': 'yellow',
    '#EAB308': 'yellow',
    '#FBBF24': 'yellow',
    '#CA8A04': 'yellow',
  };
  if (exact[n]) return exact[n];
  const h = hueFromHex(n);
  if (h == null) return null;
  if (h >= 245 && h <= 345) return 'purple_pink';
  if (h >= 85 && h <= 175) return 'green';
  if (h >= 28 && h <= 62) return 'yellow';
  return null;
};

const normTechName = (s) =>
  String(s || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * Técnicos que pueden agendar citas (misma lista que el calendario).
 * Si hay al menos uno con isAppointmentTechnician (configurado en Nómina), solo esos.
 * Si ninguno (empresa sin pestaña Nómina o sin marcar agenda), se aceptan todos los técnicos de empresa.
 */
const getSchedulingTechnicianEntries = (company) => {
  const raw = Array.isArray(company?.technicians) ? company.technicians : [];
  const objects = raw
    .map((t) => {
      if (typeof t === 'string') {
        const n = String(t).trim();
        if (!n) return null;
        return {
          name: n,
          isAppointmentTechnician: false,
          appointmentColor: DEFAULT_APPOINTMENT_COLOR,
        };
      }
      if (!t || !String(t.name || '').trim()) return null;
      return {
        name: String(t.name).trim(),
        isAppointmentTechnician: t.isAppointmentTechnician === true,
        appointmentColor: isValidHexColor(t.appointmentColor)
          ? normalizeHexColor(t.appointmentColor)
          : DEFAULT_APPOINTMENT_COLOR,
      };
    })
    .filter(Boolean);
  const onlyAgenda = objects.filter((t) => t.isAppointmentTechnician === true);
  if (onlyAgenda.length > 0) return onlyAgenda;
  return objects;
};

/**
 * Encuentra técnico de agenda por bucket de color legacy (Milo/Mili, Sandra, Giovanny).
 */
const findTechByLegacyBucket = (appointmentTechs, bucket) => {
  if (!bucket || !appointmentTechs.length) return null;
  /** Nombre más largo primero (p. ej. MILI vs MIL) para no colgar todo en el primero genérico. */
  const sorted = [...appointmentTechs].sort(
    (a, b) => normTechName(b.name).length - normTechName(a.name).length
  );
  for (const t of sorted) {
    const name = normTechName(t.name);
    if (bucket === 'purple_pink') {
      if (name.includes('MIL') || name.includes('MILI') || name.includes('MILO')) return t;
    } else if (bucket === 'green') {
      if (name.includes('SANDRA')) return t;
    } else if (bucket === 'yellow') {
      if (name.includes('GIO')) return t;
    }
  }
  return null;
};

const schedulerFromNoteResponsible = (note, appointmentTechs) => {
  const resp = normTechName(note.responsible);
  if (!resp) return null;
  const tech = appointmentTechs.find((t) => normTechName(t.name) === resp);
  if (!tech) return null;
  const color = isValidHexColor(tech.appointmentColor)
    ? normalizeHexColor(tech.appointmentColor)
    : DEFAULT_APPOINTMENT_COLOR;
  return { scheduledByTechnician: normTechName(tech.name), color };
};

async function resolveAppointmentTechnician(companyId, rawTechnicianName) {
  const normalizedName = String(rawTechnicianName || '').trim().toUpperCase();
  if (!normalizedName) {
    return { error: 'Debes seleccionar quién agenda la cita' };
  }
  const company = await Company.findById(companyId).select({ technicians: 1 }).lean();
  const eligible = getSchedulingTechnicianEntries(company);
  const tech = eligible.find((t) => normTechName(t.name) === normalizedName);
  if (!tech) {
    return {
      error:
        'La persona seleccionada no está en la lista de técnicos de la empresa. Pedí a un administrador que cargue técnicos o habilite Nómina.',
    };
  }
  const appointmentColor = isValidHexColor(tech.appointmentColor)
    ? normalizeHexColor(tech.appointmentColor)
    : DEFAULT_APPOINTMENT_COLOR;
  return { scheduledByTechnician: normalizedName, appointmentColor };
}

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
    plate, customer, vehicleId, quoteId, scheduledByTechnician
  } = req.body || {};
  
  if (!title || !startDate) {
    return res.status(400).json({ error: "title y startDate son requeridos" });
  }
  
  const companyId = new mongoose.Types.ObjectId(req.companyId);
  const scheduler = await resolveAppointmentTechnician(req.companyId, scheduledByTechnician);
  if (scheduler.error) {
    return res.status(400).json({ error: scheduler.error });
  }
  
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
    color: scheduler.appointmentColor || color || '#3b82f6',
    scheduledByTechnician: scheduler.scheduledByTechnician,
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
  if (body.scheduledByTechnician !== undefined) {
    const scheduler = await resolveAppointmentTechnician(req.companyId, body.scheduledByTechnician);
    if (scheduler.error) {
      return res.status(400).json({ error: scheduler.error });
    }
    body.scheduledByTechnician = scheduler.scheduledByTechnician;
    body.color = scheduler.appointmentColor;
  }
  
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

  const company = await Company.findById(companyId).select({ technicians: 1 }).lean();
  const appointmentTechs = getSchedulingTechnicianEntries(company);

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
    const sched = schedulerFromNoteResponsible(note, appointmentTechs);
    const reminderColor = sched?.color || '#F59E0B';
    const reminderTech = sched?.scheduledByTechnician || '';

    if (event) {
      event.startDate = reminderDate;
      event.title = `Recordatorio: ${note.plate}`;
      event.description = note.text || '';
      event.hasNotification = true;
      event.notificationAt = reminderDate;
      event.color = reminderColor;
      event.scheduledByTechnician = reminderTech;
      await event.save();
    } else {
      event = await CalendarEvent.create({
        title: `Recordatorio: ${note.plate}`,
        description: note.text || '',
        startDate: reminderDate,
        allDay: false,
        hasNotification: true,
        notificationAt: reminderDate,
        color: reminderColor,
        scheduledByTechnician: reminderTech,
        eventType: 'reminder',
        noteId: note._id,
        companyId,
        userId: note.userId ? new mongoose.Types.ObjectId(note.userId) : undefined
      });
    }

    synced.push(event);
  }

  // Eliminar eventos de recordatorios para notas que ya no tienen recordatorio
  const noteIds = notes.map((n) => n._id);
  await CalendarEvent.deleteMany({
    companyId,
    eventType: 'reminder',
    noteId: { $nin: noteIds }
  });

  res.json({ synced: synced.length, items: synced });
};

/**
 * Citas (eventType event): sin técnico, infiere técnico por color legacy y guarda color de nómina.
 * Con técnico ya guardado, alinea siempre `color` al appointmentColor de ese técnico (un solo tono por persona).
 */
export const syncAgendaColors = async (req, res) => {
  const companyId = new mongoose.Types.ObjectId(req.companyId);

  const company = await Company.findById(companyId).select({ technicians: 1 }).lean();
  const appointmentTechs = getSchedulingTechnicianEntries(company);
  if (!appointmentTechs.length) {
    return res.json({ updated: 0, message: 'No hay técnicos de agenda en la empresa' });
  }

  const events = await CalendarEvent.find({
    companyId,
    eventType: 'event',
  }).lean();

  let updated = 0;
  const details = [];

  for (const ev of events) {
    const hasTech = String(ev.scheduledByTechnician || '').trim().length > 0;

    if (hasTech) {
      const tech = appointmentTechs.find(
        (t) => normTechName(t.name) === normTechName(ev.scheduledByTechnician)
      );
      if (tech) {
        const canon = isValidHexColor(tech.appointmentColor)
          ? normalizeHexColor(tech.appointmentColor)
          : DEFAULT_APPOINTMENT_COLOR;
        const current = normalizeHexColor(ev.color);
        if (canon && current !== canon) {
          await CalendarEvent.updateOne(
            { _id: ev._id, companyId },
            { $set: { color: canon } }
          );
          updated += 1;
          details.push({ id: String(ev._id), action: 'color_aligned', color: canon });
        }
      }
      continue;
    }

    const bucket = legacyColorBucketFromHex(ev.color);
    if (!bucket) continue;

    const tech = findTechByLegacyBucket(appointmentTechs, bucket);
    if (!tech) continue;

    const canonColor = isValidHexColor(tech.appointmentColor)
      ? normalizeHexColor(tech.appointmentColor)
      : DEFAULT_APPOINTMENT_COLOR;
    const techName = normTechName(tech.name);

    await CalendarEvent.updateOne(
      { _id: ev._id, companyId },
      {
        $set: {
          scheduledByTechnician: techName,
          color: canonColor,
        },
      }
    );
    updated += 1;
    details.push({
      id: String(ev._id),
      action: 'technician_from_legacy_color',
      scheduledByTechnician: techName,
      color: canonColor,
      bucket,
    });
  }

  res.json({ updated, details });
};

// Buscar cliente/vehículo por placa para autocompletar
export const searchByPlate = async (req, res) => {
  // Normalizar placa: eliminar espacios y convertir a mayúsculas
  let plate = String(req.params.plate || '').trim().toUpperCase();
  plate = plate.replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
  
  if (!plate || plate.length < 3) {
    return res.status(400).json({ error: 'Placa requerida (mínimo 3 caracteres)' });
  }
  
  const companyId = String(req.companyId);
  
  try {
    // Buscar perfil de cliente (buscar tanto en plate como en vehicle.plate)
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
    // Usar now() del dateTime util para garantizar UTC
    // notificationAt está guardado en UTC, así que comparamos en UTC
    const currentTime = now();
    
    // Buscar eventos con notificación pendiente (hasta 5 minutos después de la hora programada)
    // Ventana de 10 minutos: 5 minutos antes y 5 minutos después de la hora programada
    const fiveMinutesAgo = new Date(currentTime.getTime() - 5 * 60 * 1000);
    const fiveMinutesFromNow = new Date(currentTime.getTime() + 5 * 60 * 1000);
    
    // Debug: Log de la ventana de tiempo (solo en desarrollo)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[checkCalendarNotifications] Buscando notificaciones entre ${fiveMinutesAgo.toISOString()} y ${fiveMinutesFromNow.toISOString()}`);
    }
    
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
        
        // Log con información de la hora para debugging
        const notificationTime = event.notificationAt ? new Date(event.notificationAt).toISOString() : 'N/A';
        console.log(`[checkCalendarNotifications] Notificación creada para evento ${event._id} de empresa ${event.companyId} - Hora programada: ${notificationTime}`);
      } catch (err) {
        console.error(`[checkCalendarNotifications] Error procesando evento ${event._id}:`, err);
      }
    }
  } catch (err) {
    console.error('[checkCalendarNotifications] Error general:', err);
  }
};

