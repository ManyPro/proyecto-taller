import { Router } from 'express';
import Company from '../models/Company.clean.js';
import TechnicianConfig from '../models/TechnicianConfig.js';
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
  let { laborPercents, whatsAppNumber } = req.body || {};
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
  if (typeof whatsAppNumber === 'string') {
    req.companyDoc.preferences ||= {};
    // store as-is; client should send E.164 or local
    req.companyDoc.preferences.whatsAppNumber = whatsAppNumber.trim();
  }
  await req.companyDoc.save();
  res.json({ preferences: req.companyDoc.preferences });
});

// ========== Features (flags por empresa) ==========
// GET actual
router.get('/features', (req, res) => {
  const features = req.companyDoc.features || {};
  const featureOptions = req.companyDoc.featureOptions || {};
  const restrictions = req.companyDoc.restrictions || {};
  res.json({ features, featureOptions, restrictions });
});

// PATCH merge parcial de flags
router.patch('/features', async (req, res) => {
  const patch = req.body || {};
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    return res.status(400).json({ error: 'payload invÃ¡lido' });
  }
  req.companyDoc.features ||= {};
  Object.keys(patch).forEach(k => {
    const v = !!patch[k];
    req.companyDoc.features[k] = v;
  });
  await req.companyDoc.save();
  res.json({ features: req.companyDoc.features });
});

// GET /company/feature-options
router.get('/feature-options', (req, res) => {
  res.json({ featureOptions: req.companyDoc.featureOptions || {} });
});

// PATCH /company/feature-options
router.patch('/feature-options', async (req, res) => {
  const patch = req.body || {};
  req.companyDoc.featureOptions ||= {};
  Object.entries(patch).forEach(([moduleName, moduleOpts]) => {
    if(typeof moduleOpts !== 'object' || Array.isArray(moduleOpts)) return;
    req.companyDoc.featureOptions[moduleName] ||= {};
    Object.entries(moduleOpts).forEach(([k,v]) => { req.companyDoc.featureOptions[moduleName][k] = !!v; });
  });
  await req.companyDoc.save();
  res.json({ featureOptions: req.companyDoc.featureOptions });
});

// GET /company/restrictions
router.get('/restrictions', (req, res) => {
  res.json({ restrictions: req.companyDoc.restrictions || {} });
});

// PATCH /company/restrictions (empresa puede ver pero no deberÃ­a poder cambiar; mantener para futuros casos)
router.patch('/restrictions', async (req, res) => {
  const patch = req.body || {};
  req.companyDoc.restrictions ||= {};
  Object.entries(patch).forEach(([area, cfg]) => {
    if(typeof cfg !== 'object' || Array.isArray(cfg)) return;
    req.companyDoc.restrictions[area] ||= {};
    Object.entries(cfg).forEach(([k,v]) => { req.companyDoc.restrictions[area][k] = !!v; });
  });
  await req.companyDoc.save();
  res.json({ restrictions: req.companyDoc.restrictions });
});

// ========== Toggle CatÃ¡logo PÃºblico ==========
// Permite activar/desactivar el catÃ¡logo pÃºblico segmentado para la empresa autenticada.
// PATCH /api/v1/company/public-catalog { "enabled": true|false }
router.patch('/public-catalog', async (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) requerido' });
  if (!req.companyDoc.active) return res.status(400).json({ error: 'Empresa inactiva, no se puede cambiar el catÃ¡logo' });
  req.companyDoc.publicCatalogEnabled = enabled;
  await req.companyDoc.save();
  res.json({ publicCatalogEnabled: req.companyDoc.publicCatalogEnabled });
});

export default router;

// ===== Technician config (labor kinds + technician rates) =====
// GET /api/v1/company/tech-config
router.get('/tech-config', async (req, res) => {
  let cfg = await TechnicianConfig.findOne({ companyId: req.companyDoc._id });
  if (!cfg) {
    // bootstrap from Company preferences if present
    const kinds = req.companyDoc?.preferences?.laborKinds || ['MOTOR','SUSPENSION','FRENOS'];
    cfg = await TechnicianConfig.create({ companyId: req.companyDoc._id, laborKinds: kinds, technicians: [] });
  }
  res.json({ config: cfg.toObject() });
});

// PUT /api/v1/company/tech-config
router.put('/tech-config', async (req, res) => {
  const body = req.body || {};
  const kinds = Array.isArray(body.laborKinds) ? body.laborKinds.map(s=>String(s||'').trim().toUpperCase()).filter(Boolean) : undefined;
  const techs = Array.isArray(body.technicians) ? body.technicians : undefined;
  let cfg = await TechnicianConfig.findOne({ companyId: req.companyDoc._id });
  if (!cfg) cfg = new TechnicianConfig({ companyId: req.companyDoc._id });
  if (kinds) cfg.laborKinds = Array.from(new Set(kinds));
  if (techs) {
    const cleaned = [];
    for (const t of techs) {
      const name = String(t?.name||'').trim().toUpperCase(); if (!name) continue;
      const active = !!t?.active;
      const colorRaw = String(t?.color||'').trim();
      const color = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(colorRaw) ? colorRaw.toUpperCase() : '#2563EB';
      const rates = Array.isArray(t?.rates) ? t.rates.map(r=>({ kind: String(r?.kind||'').trim().toUpperCase(), percent: Number(r?.percent||0) })) : [];
      const valRates = rates.filter(r=> r.kind && Number.isFinite(r.percent) && r.percent>=0 && r.percent<=100);
      cleaned.push({ name, active, color, rates: valRates });
    }
    cfg.technicians = cleaned;
  }
  await cfg.save();
  res.json({ config: cfg.toObject() });
});

