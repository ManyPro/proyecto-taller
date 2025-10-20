import { Router } from 'express';
import Company from '../models/Company.js';
import { authAdmin, requireAdminRole } from '../middlewares/auth.js';

const router = Router();

// All routes require admin; developer can manage all companies, admin can only see its assigned companies in future.
router.use(authAdmin);

// List companies (developer only)
router.get('/companies', requireAdminRole('developer'), async (req, res) => {
  const list = await Company.find({}).select('name email active features featureOptions restrictions publicCatalogEnabled').lean();
  res.json({ items: list });
});

// Patch top-level features (developer only)
router.patch('/companies/:id/features', requireAdminRole('developer'), async (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  const c = await Company.findById(id);
  if(!c) return res.status(404).json({ error: 'Empresa no encontrada' });
  c.features ||= {};
  Object.entries(body).forEach(([k,v]) => { c.features[k] = !!v; });
  await c.save();
  res.json({ features: c.features });
});

// Patch fine-grained feature options (developer only)
router.patch('/companies/:id/feature-options', requireAdminRole('developer'), async (req, res) => {
  const id = req.params.id;
  const patch = req.body || {};
  const c = await Company.findById(id);
  if(!c) return res.status(404).json({ error: 'Empresa no encontrada' });
  c.featureOptions ||= {};
  // deep merge shallowly by module
  Object.entries(patch).forEach(([moduleName, moduleOpts]) => {
    if(typeof moduleOpts !== 'object' || Array.isArray(moduleOpts)) return;
    c.featureOptions[moduleName] ||= {};
    Object.entries(moduleOpts).forEach(([k,v]) => { c.featureOptions[moduleName][k] = !!v; });
  });
  await c.save();
  res.json({ featureOptions: c.featureOptions });
});

// Patch restrictions (developer or admin) - admin UI to hide balances, etc.
router.patch('/companies/:id/restrictions', requireAdminRole('developer','admin'), async (req, res) => {
  const id = req.params.id;
  const patch = req.body || {};
  const c = await Company.findById(id);
  if(!c) return res.status(404).json({ error: 'Empresa no encontrada' });
  c.restrictions ||= {};
  Object.entries(patch).forEach(([area, cfg]) => {
    if(typeof cfg !== 'object' || Array.isArray(cfg)) return;
    c.restrictions[area] ||= {};
    Object.entries(cfg).forEach(([k,v]) => { c.restrictions[area][k] = !!v; });
  });
  await c.save();
  res.json({ restrictions: c.restrictions });
});

export default router;

