import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Company from '../models/Company.js';
import { authCompany } from '../middlewares/auth.js';

const router = Router();

function signCompany(company) {
  const payload = {
    sub: String(company._id),
    companyId: String(company._id),
    email: company.email,
    role: 'company'
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

/**
 * POST /api/v1/auth/company/register
 * body: { name?, email, password }
 */
router.post('/register', async (req, res) => {
  try {
    let { name, email, password } = req.body || {};
    email = String(email || '').toLowerCase().trim();
    name = String(name || '').trim() || (email ? email.split('@')[0].toUpperCase() : '');

    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }
    const exists = await Company.findOne({ email }).lean();
    if (exists) return res.status(409).json({ error: 'El email ya está registrado' });

    const passwordHash = await bcrypt.hash(password, 10);
    const company = await Company.create({ name: name || 'EMPRESA', email, passwordHash });

    const token = signCompany(company);
    return res.status(201).json({
      token,
      company: { id: company._id, name: company.name, email: company.email }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error al registrar empresa' });
  }
});

/**
 * POST /api/v1/auth/company/login
 * body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const email = String((req.body?.email || '')).toLowerCase().trim();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }
    const company = await Company.findOne({ email });
    if (!company) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, company.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = signCompany(company);
    return res.json({
      token,
      company: { id: company._id, name: company.name, email: company.email }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error en login' });
  }
});

/**
 * GET /api/v1/auth/company/me
 * header: Authorization: Bearer <token>
 */
router.get('/me', authCompany, async (req, res) => {
  const company = await Company.findById(req.company.id).lean();
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json({ company: { id: company._id, name: company.name, email: company.email } });
});

export default router;
