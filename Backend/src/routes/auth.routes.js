import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
// Eliminado flujo de email/token para modo local
import crypto from 'crypto'; // (podrÃ­a eliminarse si ya no se usan tokens)
import Company from '../models/Company.js';
import { authCompany } from '../middlewares/auth.js';

const router = Router();

function signCompany(company) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET no configurado');
  }
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
    if (exists) return res.status(409).json({ error: 'El email ya estÃ¡ registrado' });

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
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'JWT_SECRET no configurado' });
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
    console.error('[auth/company/login] Error:', e);
    return res.status(500).json({ error: 'Error en login' });
  }
});

/**
 * GET /api/v1/auth/company/me
 * header: Authorization: Bearer <token>
 */
router.get('/me', authCompany, async (req, res) => {
  try {
    if (!req.company?.id) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    const company = await Company.findById(req.company.id).lean();
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json({ company: { id: company._id, name: company.name, email: company.email } });
  } catch (err) {
    console.error('[auth/company/me] Error:', err);
    res.status(500).json({ error: 'Error al obtener información de empresa' });
  }
});

// Modo local: endpoint placeholder que siempre responde ok (no envÃ­a nada)
router.post('/password/forgot', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'email requerido' });
  // Respuesta genÃ©rica (sin token ni email real)
  return res.json({ ok: true, local: true });
});

/**
 * POST /api/v1/auth/company/password/reset
 * body: { email, token, password }
 */
// Nuevo flujo local: reset directo validando nombre de empresa
// POST /password/reset-local  body: { email, companyName, newPassword }
router.post('/password/reset-local', async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const companyName = String(req.body?.companyName || '').trim().toUpperCase();
    const newPassword = String(req.body?.newPassword || '');
    if (!email || !companyName || !newPassword) {
      return res.status(400).json({ error: 'email, companyName y newPassword requeridos' });
    }
    const company = await Company.findOne({ email });
    if (!company) return res.status(400).json({ error: 'Datos invÃ¡lidos' });
    if (String(company.name || '').toUpperCase() !== companyName) {
      return res.status(400).json({ error: 'Nombre de empresa no coincide' });
    }
    company.passwordHash = await bcrypt.hash(newPassword, 10);
    // Limpiar posibles campos legacy de reset
    company.passwordResetTokenHash = '';
    company.passwordResetExpires = null;
    await company.save();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Error en reset local' });
  }
});

export default router;

