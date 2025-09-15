import Note from "../models/Note.js";
import mongoose from "mongoose";

export const listNotes = async (req, res) => {
  const { plate, from, to, page=1, limit=20 } = req.query;
  const q = { companyId: new mongoose.Types.ObjectId(req.companyId) };
  if (plate) q.plate = plate.toUpperCase().trim();
  if (from || to) q.createdAt = {};
  if (from) q.createdAt.$gte = new Date(from);
  if (to)   q.createdAt.$lte = new Date(to+"T23:59:59.999Z");
  const data = await Note.find(q).sort({ createdAt: -1 }).skip((+page-1)*+limit).limit(+limit);
  res.json({ data });
};

export const createNote = async (req, res) => {
  const body = req.body;
  body.companyId = req.companyId;
  body.plate = body.plate.toUpperCase().trim();
  const note = await Note.create(body);
  res.status(201).json({ note });
};

export const updateNote = async (req, res) => {
  const { id } = req.params;
  const body = req.body;
  if (body.plate) body.plate = body.plate.toUpperCase().trim();
  const note = await Note.findOneAndUpdate({ _id: id, companyId: req.companyId }, body, { new: true });
  if (!note) return res.status(404).json({ error: "Nota no encontrada" });
  res.json({ note });
};

export const deleteNote = async (req, res) => {
  const { id } = req.params;
  const del = await Note.findOneAndDelete({ _id: id, companyId: req.companyId });
  if (!del) return res.status(404).json({ error: "Nota no encontrada" });
  res.status(204).end();
};
