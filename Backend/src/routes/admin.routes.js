import { Router } from 'express';
import { adminLogin, adminMe } from '../controllers/admin.auth.controller.js';
import { authAdmin, requireAdminRole } from '../middlewares/auth.js';
import Company from '../models/Company.js';

const router = Router();

// Public admin login
router.post('/auth/login', adminLogin);

// Authenticated admin
router.get('/auth/me', authAdmin, adminMe);

// Companies listing (developer only)
router.get('/companies', authAdmin, requireAdminRole('developer'), async (req, res) => {
  const q = {};
  const list = await Company.find(q).select('name email active features publicCatalogEnabled').lean();
  res.json({ items: list });
});

// Update company features (developer or admin)
router.patch('/companies/:id/features', authAdmin, requireAdminRole('developer','admin'), async (req, res) => {
  const id = req.params.id;
  const patch = req.body || {};
  const c = await Company.findById(id);
  if(!c) return res.status(404).json({ error: 'Empresa no encontrada' });
  c.features ||= {};
  Object.entries(patch).forEach(([k,v]) => { c.features[k] = !!v; });
  await c.save();
  res.json({ features: c.features });
});

export default router;
