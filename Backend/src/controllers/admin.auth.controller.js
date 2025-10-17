import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser.js';

function signAdmin(user){
  const payload = {
    sub: String(user._id),
    role: user.role,
    kind: 'admin'
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export async function adminLogin(req, res){
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'email y password requeridos' });
  const u = await AdminUser.findOne({ email: String(email).toLowerCase(), active: true });
  if(!u) return res.status(401).json({ error: 'Credenciales inválidas' });
  const ok = await bcrypt.compare(password, u.passwordHash);
  if(!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
  const token = signAdmin(u);
  res.json({ token, user: { id: u._id, email: u.email, role: u.role } });
}

export async function adminMe(req, res){
  const id = req.user?.id;
  if(!id) return res.status(401).json({ error: 'No autorizado' });
  const u = await AdminUser.findById(id).lean();
  if(!u) return res.status(404).json({ error: 'No encontrado' });
  res.json({ user: { id: u._id, email: u.email, role: u.role } });
}
