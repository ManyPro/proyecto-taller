import Note from "../models/Note.js";
import mongoose from "mongoose";

const ALLOWED_RESP = ['DAVID', 'VALENTIN', 'SEBASTIAN', 'GIOVANNY', 'SANDRA', 'CEDIEL'];
const normResp = (v) => String(v || '').trim().toUpperCase();

export const listNotes = async (req, res) => {
  const { plate, from, to, page = 1, limit = 50 } = req.query;

  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  if (plate) q.plate = String(plate).toUpperCase().trim();

  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to)   q.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }

  const items = await Note.find(q)
    .sort({ createdAt: -1 })
    .skip((+page - 1) * (+limit))
    .limit(Math.min(+limit, 200))
    .lean();

  res.json({ items });
};

// Helper para parsear fechas correctamente (misma lógica que calendar)
const parseDate = (dateStr) => {
  if (!dateStr) return undefined;
  if (dateStr instanceof Date) return dateStr;
  if (typeof dateStr === 'string' && dateStr.includes('Z')) {
    return new Date(dateStr);
  }
  if (typeof dateStr === 'string' && dateStr.includes('T')) {
    if (!dateStr.match(/[+-]\d{2}:\d{2}$/) && !dateStr.endsWith('Z')) {
      return new Date(dateStr + 'Z');
    }
    return new Date(dateStr);
  }
  return new Date(dateStr);
};

export const createNote = async (req, res) => {
  const { plate, text, type, amount, technician, media, reminderAt } = req.body || {};
  const responsible = normResp(req.body?.responsible);
  if (!plate) return res.status(400).json({ error: "plate requerido" });
  if (!ALLOWED_RESP.includes(responsible)) {
    return res.status(400).json({ error: "responsible inválido" });
  }

  const doc = await Note.create({
    plate: String(plate).toUpperCase().trim(),
    text: text || "",
    type: type || "GENERICA",
    responsible,
    amount: type === "PAGO" ? Number(amount || 0) : 0,
    technician: technician ? String(technician).toUpperCase().trim() : undefined,
    media: Array.isArray(media) ? media : [],
    reminderAt: reminderAt ? parseDate(reminderAt) : undefined,
    companyId: new mongoose.Types.ObjectId(req.companyId),
    userId: req.userId ? new mongoose.Types.ObjectId(req.userId) : undefined
  });

  res.status(201).json({ item: doc });
};

export const updateNote = async (req, res) => {
  const { id } = req.params;
  const body = { ...req.body };

  if (body.plate) body.plate = String(body.plate).toUpperCase().trim();
  if (body.technician) body.technician = String(body.technician).toUpperCase().trim();

  if (body.responsible !== undefined) {
    const r = normResp(body.responsible);
    if (!ALLOWED_RESP.includes(r)) return res.status(400).json({ error: "responsible inválido" });
    body.responsible = r;
  }

  if (body.type === "PAGO" && body.amount !== undefined) body.amount = Number(body.amount);
  if (body.type === "GENERICA") body.amount = 0;

  if (body.reminderAt !== undefined) {
    body.reminderAt = body.reminderAt ? parseDate(body.reminderAt) : null;
  }

  const note = await Note.findOneAndUpdate(
    { _id: id, companyId: new mongoose.Types.ObjectId(req.companyId) },
    body,
    { new: true }
  );
  if (!note) return res.status(404).json({ error: "Nota no encontrada" });
  res.json({ item: note });
};

export const deleteNote = async (req, res) => {
  const { id } = req.params;
  const del = await Note.findOneAndDelete({
    _id: id,
    companyId: new mongoose.Types.ObjectId(req.companyId),
  });
  if (!del) return res.status(404).json({ error: "Nota no encontrada" });
  res.status(204).end();
};
