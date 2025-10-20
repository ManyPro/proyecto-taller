import { Router } from 'express';
import { adminLogin, adminMe } from '../controllers/admin.auth.controller.js';
import { authAdmin, requireAdminRole } from '../middlewares/auth.js';
import Company from '../models/Company.clean.js';
import AdminSignupRequest from '../models/AdminSignupRequest.js';
import AdminUser from '../models/AdminUser.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

// Public admin login
router.post('/auth/login', adminLogin);

// Authenticated admin
router.get('/auth/me', authAdmin, adminMe);

// ==== Admin signup flow (public + developer) ====
function signAdminToken(user){
  const payload = { sub: String(user._id), role: user.role, kind: 'admin' };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}
function genCode(){
  const n = Math.floor(Math.random()*1000000); // 0..999999
  return String(n).padStart(6,'0');
}

// Step 1 (public): Request signup code
router.post('/signup/request', async (req, res) => {
  const email = String(req.body?.email||'').toLowerCase().trim();
  if(!email) return res.status(400).json({ error: 'email requerido' });
  const exists = await AdminUser.findOne({ email });
  if(exists) return res.status(409).json({ error: 'El usuario ya existe' });
  // Reuse existing pending/approved request to avoid spam
  let r = await AdminSignupRequest.findOne({ email, status: { $in: ['pending','approved'] } }).sort({ createdAt: -1 });
  if(!r){ r = await AdminSignupRequest.create({ email, status: 'pending' }); }
  return res.json({ requestId: String(r._id), status: r.status });
});

// Step 2 (developer): List pending/approved requests
router.get('/signup/requests', authAdmin, requireAdminRole('developer'), async (req, res) => {
  const list = await AdminSignupRequest.find({ status: { $in: ['pending','approved'] } })
    .sort({ createdAt: -1 })
    .populate('assignedCompanies', 'name email')
    .lean();
  const companies = await Company.find({}).select('name email').lean();
  res.json({ items: list, companies });
});

// Step 3 (developer): Approve a request -> generate code returned to dev
router.post('/signup/requests/:id/approve', authAdmin, requireAdminRole('developer'), async (req, res) => {
  const id = req.params.id;
  const r = await AdminSignupRequest.findById(id);
  if(!r) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if(r.status === 'completed') return res.status(400).json({ error: 'Solicitud ya completada' });
  const code = genCode();
  r.codeHash = await bcrypt.hash(code, 10);
  r.status = 'approved';
  r.approvedBy = req.user?.id || null;
  // Opcionalmente, asignar compañías enviadas en el body
  const assign = req.body?.companies || [];
  if(Array.isArray(assign) && assign.length){
    r.assignedCompanies = assign;
  }
  await r.save();
  res.json({ requestId: String(r._id), code }); // dev comparte el código al solicitante
});

// Step 4 (public): Confirm signup with email + code + password -> create AdminUser
router.post('/signup/confirm', async (req, res) => {
  const email = String(req.body?.email||'').toLowerCase().trim();
  const password = String(req.body?.password||'');
  const code = String(req.body?.code||'').trim();
  if(!email || !password || !code) return res.status(400).json({ error: 'email, password y code requeridos' });
  const existing = await AdminUser.findOne({ email });
  if(existing) return res.status(409).json({ error: 'El usuario ya existe' });
  const reqDoc = await AdminSignupRequest.findOne({ email, status: 'approved' }).sort({ createdAt: -1 });
  if(!reqDoc || !reqDoc.codeHash) return res.status(400).json({ error: 'Solicitud no aprobada o no encontrada' });
  const ok = await bcrypt.compare(code, reqDoc.codeHash);
  if(!ok) return res.status(401).json({ error: 'Código inválido' });
  // Create admin user
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await AdminUser.create({ email, passwordHash, role: 'admin', companies: reqDoc.assignedCompanies || [], active: true });
  // Close request
  reqDoc.status = 'completed'; reqDoc.usedAt = new Date(); await reqDoc.save();
  // Issue token to login immediately
  const token = signAdminToken(user);
  return res.json({ token, user: { id: user._id, email: user.email, role: user.role } });
});

// Companies listing (developer only)
router.get('/companies', authAdmin, requireAdminRole('developer','admin'), async (req, res) => {
  if(req.user?.role === 'developer'){
    const list = await Company.find({}).select('name email active features featureOptions restrictions publicCatalogEnabled').lean();
    return res.json({ items: list, role: 'developer' });
  }
  // Admins: return only assigned companies
  const admin = await AdminUser.findById(req.user?.id).populate({
    path: 'companies',
    select: 'name email active features featureOptions restrictions publicCatalogEnabled'
  }).lean();
  const items = admin?.companies?.map?.(c => ({
    _id: c._id,
    name: c.name,
    email: c.email,
    active: c.active,
    features: c.features,
    featureOptions: c.featureOptions,
    restrictions: c.restrictions,
    publicCatalogEnabled: c.publicCatalogEnabled
  })) || [];
  res.json({ items, role: 'admin' });
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

// List admins (developer only)
router.get('/admins', authAdmin, requireAdminRole('developer'), async (req, res) => {
  const list = await AdminUser.find({ role: 'admin' }).select('email role companies').lean();
  res.json({ items: list });
});

// Assign/update companies for an admin user (developer only)
router.patch('/admins/:id/companies', authAdmin, requireAdminRole('developer'), async (req, res) => {
  const id = req.params.id;
  const companies = Array.isArray(req.body?.companies) ? req.body.companies : [];
  const user = await AdminUser.findById(id);
  if(!user) return res.status(404).json({ error: 'Admin no encontrado' });
  if(user.role !== 'admin') return res.status(400).json({ error: 'Solo admins pueden recibir asignaciones' });
  user.companies = companies;
  await user.save();
  res.json({ ok: true, user: { id: user._id, email: user.email, companies: user.companies } });
});

export default router;
