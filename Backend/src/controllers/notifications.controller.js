import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

export const listNotifications = async (req, res) => {
  const { unread, limit } = req.query;
  const lim = Math.min(parseInt(limit || '30', 10), 100);
  const filter = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  if(unread) filter.read = false;
  const data = await Notification.find(filter).sort({ createdAt: -1 }).limit(lim);
  res.json({ data });
};

export const markNotificationRead = async (req, res) => {
  const { id } = req.params;
  if(!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Notificación no encontrada' });
  const doc = await Notification.findOneAndUpdate({ _id: id, companyId: req.companyId }, { $set: { read: true } }, { new: true });
  if(!doc) return res.status(404).json({ error: 'Notificación no encontrada' });
  res.json({ notification: doc });
};

export const markAllNotificationsRead = async (req, res) => {
  await Notification.updateMany({ companyId: req.companyId, read: false }, { $set: { read: true } });
  res.json({ ok: true });
};
