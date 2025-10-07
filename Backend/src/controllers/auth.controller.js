import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Company from '../models/Company.js';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeText = (value) => String(value || '').trim();

function signCompany(company) {
  const payload = {
    sub: String(company._id),
    companyId: String(company._id),
    email: company.email,
    role: 'company'
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export async function registerCompany(req, res) {
  try {
    const { name, email, password } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeText(name) || (normalizedEmail ? normalizedEmail.split('@')[0].toUpperCase() : '');
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'name, email y password son requeridos' });
    }
    const exists = await Company.findOne({ email: normalizedEmail }).lean();
    if (exists) return res.status(409).json({ error: 'El email ya esta registrado' });

    const passwordHash = await bcrypt.hash(password, 10);
    const company = await Company.create({
      name: normalizedName || 'EMPRESA',
      email: normalizedEmail,
      passwordHash
    });

    const token = signCompany(company);
    return res.status(201).json({
      token,
      company: { id: company._id, name: company.name, email: company.email }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error al registrar empresa' });
  }
}

export async function loginCompany(req, res) {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }
    const company = await Company.findOne({ email: normalizedEmail });
    if (!company) return res.status(401).json({ error: 'Credenciales invalidas' });

    const ok = await bcrypt.compare(password, company.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Credenciales invalidas' });

    const token = signCompany(company);
    return res.json({
      token,
      company: { id: company._id, name: company.name, email: company.email }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error en login' });
  }
}

export async function meCompany(req, res) {
  try {
    const companyId = req.company?.id;
    if (!companyId) return res.status(401).json({ error: 'No autorizado' });
    const c = await Company.findById(companyId).lean();
    if (!c) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json({ company: { id: c._id, name: c.name, email: c.email } });
  } catch {
    res.status(500).json({ error: 'Error al obtener empresa' });
  }
}

export async function forgotPasswordLocal(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'email requerido' });
  return res.json({ ok: true, local: true });
}

export async function resetPasswordLocal(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const companyName = normalizeText(req.body?.companyName).toUpperCase();
    const newPassword = String(req.body?.newPassword || '');
    if (!email || !companyName || !newPassword) {
      return res.status(400).json({ error: 'email, companyName y newPassword requeridos' });
    }
    const company = await Company.findOne({ email });
    if (!company) return res.status(400).json({ error: 'Datos invalidos' });
    if (normalizeText(company.name || '').toUpperCase() !== companyName) {
      return res.status(400).json({ error: 'Nombre de empresa no coincide' });
    }
    company.passwordHash = await bcrypt.hash(newPassword, 10);
    company.passwordResetTokenHash = '';
    company.passwordResetExpires = null;
    await company.save();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Error en reset local' });
  }
}




