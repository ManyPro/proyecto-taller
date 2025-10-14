import { Router } from 'express';
import Company from '../models/Company.js';
import { authCompany } from '../middlewares/auth.js';

const router = Router();

// Middleware para cargar empresa
router.use(authCompany);
router.use(async (req, res, next) => {
  const company = await Company.findById(req.company.id);
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
  req.companyDoc = company;
  next();
});

// ========== Technicians CRUD ==========
router.get('/technicians', (req, res) => {
  res.json({ technicians: req.companyDoc.technicians || [] });
});

router.post('/technicians', async (req, res) => {
  const name = String(req.body?.name || '').trim().toUpperCase();
  if (!name) return res.status(400).json({ error: 'nombre requerido' });
  const list = new Set((req.companyDoc.technicians || []).map(t => t.toUpperCase()));
  list.add(name);
  req.companyDoc.technicians = Array.from(list).sort();
  await req.companyDoc.save();
  res.status(201).json({ technicians: req.companyDoc.technicians });
});

router.delete('/technicians/:name', async (req, res) => {
  const name = String(req.params.name || '').trim().toUpperCase();
  req.companyDoc.technicians = (req.companyDoc.technicians || []).filter(t => t.toUpperCase() !== name);
  await req.companyDoc.save();
  res.json({ technicians: req.companyDoc.technicians });
});

// ========== Preferences ==========
router.get('/preferences', (req, res) => {
  res.json({ preferences: req.companyDoc.preferences || { laborPercents: [] } });
});

router.put('/preferences', async (req, res) => {
  let { laborPercents } = req.body || {};
  if (laborPercents) {
    if (!Array.isArray(laborPercents)) return res.status(400).json({ error: 'laborPercents debe ser array' });
    laborPercents = laborPercents
      .map(n => Number(n))
      .filter(n => Number.isFinite(n) && n >= 0 && n <= 100)
      .map(n => Math.round(n));
    // quitar duplicados y ordenar
    laborPercents = Array.from(new Set(laborPercents)).sort((a,b)=>a-b);
    req.companyDoc.preferences ||= {};
    req.companyDoc.preferences.laborPercents = laborPercents;
  }
  await req.companyDoc.save();
  res.json({ preferences: req.companyDoc.preferences });
});

// ========== Toggle Catálogo Público ==========
// Permite activar/desactivar el catálogo público segmentado para la empresa autenticada.
// PATCH /api/v1/company/public-catalog { "enabled": true|false }
router.patch('/public-catalog', async (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) requerido' });
  if (!req.companyDoc.active) return res.status(400).json({ error: 'Empresa inactiva, no se puede cambiar el catálogo' });
  req.companyDoc.publicCatalogEnabled = enabled;
  await req.companyDoc.save();
  res.json({ publicCatalogEnabled: req.companyDoc.publicCatalogEnabled });
});

export default router;
