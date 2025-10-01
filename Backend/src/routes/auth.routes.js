import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendMail } from '../lib/mailer.js';
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

/**
 * POST /api/v1/auth/company/password/forgot
 * body: { email }
 * Genera un token temporal y (placeholder) lo "envía" (se devuelve en respuesta si NODE_ENV !== 'production')
 */
router.post('/password/forgot', async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email requerido' });
    const company = await Company.findOne({ email });
    if (!company) {
      // Para no filtrar existencia: responder ok igual
      return res.json({ ok: true });
    }
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(rawToken, 10);
    company.passwordResetTokenHash = hash;
    company.passwordResetExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 min
    await company.save();

    // URL destino (frontend): usar FRONTEND_BASE o derivar de header/origin
    const base = process.env.FRONTEND_BASE_URL || req.headers.origin || '';
    const resetUrl = base ? `${base.replace(/\/$/, '')}/reset.html?token=${rawToken}&email=${encodeURIComponent(email)}` : rawToken;

    // Enviar correo (si SMTP configurado) siempre que tengamos resetUrl
    try {
      await sendMail({
        to: email,
        subject: 'Recuperación de contraseña',
        text: `Solicitaste un reseteo de contraseña. Si no fuiste tú, ignora este correo.\n\nEnlace (válido 30 min): ${resetUrl}`,
        html: `<p>Solicitaste un reseteo de contraseña (válido 30 min).</p><p><a href="${resetUrl}">Haz clic aquí para resetear</a></p><p>Si no fuiste tú, ignora este correo.</p>`
      });
    } catch (mailErr) {
      console.warn('[auth.routes] Error enviando email de reset:', mailErr.message);
    }

    return res.json({ ok: true, ...(process.env.NODE_ENV !== 'production' ? { debugToken: rawToken, resetUrl } : {}) });
  } catch (e) {
    return res.status(500).json({ error: 'Error generando token' });
  }
});

/**
 * POST /api/v1/auth/company/password/reset
 * body: { email, token, password }
 */
router.post('/password/reset', async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const token = String(req.body?.token || '');
    const password = String(req.body?.password || '');
    if (!email || !token || !password) return res.status(400).json({ error: 'email, token y password son requeridos' });
    const company = await Company.findOne({ email });
    if (!company || !company.passwordResetTokenHash || !company.passwordResetExpires) return res.status(400).json({ error: 'Token inválido' });
    if (company.passwordResetExpires.getTime() < Date.now()) return res.status(400).json({ error: 'Token expirado' });
    const ok = await bcrypt.compare(token, company.passwordResetTokenHash);
    if (!ok) return res.status(400).json({ error: 'Token inválido' });

    company.passwordHash = await bcrypt.hash(password, 10);
    company.passwordResetTokenHash = '';
    company.passwordResetExpires = null;
    await company.save();

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Error reseteando password' });
  }
});

export default router;
