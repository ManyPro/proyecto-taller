import { Router } from 'express';
import Note from '../models/Note.js';
import { authUser, authCompany } from '../middlewares/auth.js';

const router = Router();

// GET /api/v1/notes?plate=ABC123&from=2025-09-01&to=2025-09-15&limit=50
router.get('/', authUser, async (req, res) => {
  const { plate, from, to, limit = 50 } = req.query;

  const q = {};
  if (plate) q.plate = String(plate).toUpperCase().trim();

  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(to);
  }

  const docs = await Note.find(q)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .lean();

  res.json({ items: docs });
});

// POST /api/v1/notes  (requiere Authorization Bearer)
// body: { plate, text, type, amount, technician, media: [{ url, publicId, mimetype }], companyId? }
router.post('/', authCompany, async (req, res) => {
  const { plate, text, type, amount, technician, media } = req.body || {};
  if (!plate) return res.status(400).json({ error: 'plate requerido' });

  const doc = await Note.create({
    plate,
    text,
    type,
    amount,
    technician,
    media: Array.isArray(media) ? media : [],
    companyId: req.company?.id,
    userId: req.user?.id
  });

  res.status(201).json({ item: doc });
});

export default router;
