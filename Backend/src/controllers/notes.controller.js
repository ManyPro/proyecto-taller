import Note from "../models/Note.js";
import mongoose from "mongoose";

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

export const createNote = async (req, res) => {
  const { plate, text, type, amount, technician, media } = req.body || {};
  if (!plate) return res.status(400).json({ error: "plate requerido" });

  const doc = await Note.create({
    plate: String(plate).toUpperCase().trim(),
    text: text || "",
    type: type || "GENERICA",
    amount: type === "PAGO" ? Number(amount || 0) : 0,
    technician: technician ? String(technician).toUpperCase().trim() : undefined,
    media: Array.isArray(media) ? media : [],
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
  if (body.type === "PAGO" && body.amount !== undefined) body.amount = Number(body.amount);
  if (body.type === "GENERICA") body.amount = 0;

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
