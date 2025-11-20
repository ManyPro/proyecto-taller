import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

export const listNotifications = async (req, res) => {
  try {
    // Asegurar que req.companyId esté disponible (debería estar establecido por withCompanyDefaults)
    const companyId = req.companyId || req.company?.id || req.originalCompanyId;
    if (!companyId) {
      return res.status(403).json({ error: 'Company ID is required' });
    }
    const { unread, limit } = req.query;
    const lim = Math.min(parseInt(limit || '30', 10), 100);
    const filter = { companyId: new mongoose.Types.ObjectId(companyId) };
    if(unread) filter.read = false;
    const data = await Notification.find(filter).sort({ createdAt: -1 }).limit(lim);
    res.json({ data });
  } catch (error) {
    console.error('[notifications.listNotifications]', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    if (!req.companyId) {
      return res.status(403).json({ error: 'Company ID is required' });
    }
    const { id } = req.params;
    if(!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Notificación no encontrada' });
    const doc = await Notification.findOneAndUpdate({ _id: id, companyId: req.companyId }, { $set: { read: true } }, { new: true });
    if(!doc) return res.status(404).json({ error: 'Notificación no encontrada' });
    res.json({ notification: doc });
  } catch (error) {
    console.error('[notifications.markNotificationRead]', error);
    res.status(500).json({ error: 'Error al marcar notificación como leída' });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    if (!req.companyId) {
      return res.status(403).json({ error: 'Company ID is required' });
    }
    await Notification.updateMany({ companyId: req.companyId, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (error) {
    console.error('[notifications.markAllNotificationsRead]', error);
    res.status(500).json({ error: 'Error al marcar todas las notificaciones como leídas' });
  }
};
