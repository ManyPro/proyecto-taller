import Company from "../models/Company.js";
import jwt from "jsonwebtoken";

function sign(company) {
  return jwt.sign({ companyId: company._id.toString(), email: company.email }, process.env.JWT_SECRET, { expiresIn: "15d" });
}

export const registerCompany = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Faltan campos" });
    const exists = await Company.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(400).json({ error: "Email ya registrado" });
    const c = new Company({ name, email: email.toLowerCase().trim() });
    await c.setPassword(password);
    await c.save();
    const token = sign(c);
    res.status(201).json({ token, company: { id: c._id, name: c.name, email: c.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const loginCompany = async (req, res) => {
  try {
    const { email, password } = req.body;
    const c = await Company.findOne({ email: (email||'').toLowerCase().trim() });
    if (!c) return res.status(401).json({ error: "Credenciales inválidas" });
    const ok = await c.validatePassword(password||"");
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });
    const token = sign(c);
    res.json({ token, company: { id: c._id, name: c.name, email: c.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const me = async (req, res) => {
  res.json({ companyId: req.companyId, email: req.companyEmail });
};
