import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Company from '../models/Company.js';

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
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email y password son requeridos' });
    }
    const exists = await Company.findOne({ email: String(email).toLowerCase() }).lean();
    if (exists) return res.status(409).json({ error: 'El email ya está registrado' });

    const passwordHash = await bcrypt.hash(password, 10);
    const company = await Company.create({ name, email, passwordHash });

    const token = signCompany(company);
    return res.status(201).json({
      token,
      company: { id: company._id, name: company.name, email: company.email, publicCatalogEnabled: company.publicCatalogEnabled, features: company.features || {} }
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error al registrar empresa' });
  }
}

export async function loginCompany(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }
    const company = await Company.findOne({ email: String(email).toLowerCase() });
    if (!company) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, company.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = signCompany(company);
    return res.json({
      token,
      company: { id: company._id, name: company.name, email: company.email, publicCatalogEnabled: company.publicCatalogEnabled, features: company.features || {} }
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
  res.json({ company: { id: c._id, name: c.name, email: c.email, publicCatalogEnabled: c.publicCatalogEnabled, features: c.features || {} } });
  } catch {
    res.status(500).json({ error: 'Error al obtener empresa' });
  }
}
