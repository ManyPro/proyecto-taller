import PriceEntry from '../models/PriceEntry.js';
import Service from '../models/Service.js';
import xlsx from 'xlsx';

// Eval seguro/sencillo: solo números, (), +-*/ y variables A_Z0-9_
function safeEval(expr, vars = {}) {
  const cleaned = String(expr || '').trim();
  if (!cleaned) return 0;
  if (!/^[\d+\-*/().\sA-Z0-9_]+$/.test(cleaned)) throw new Error('Fórmula inválida');

  // Reemplaza variables por su número (o 0)
  const replaced = cleaned.replace(/[A-Z_][A-Z0-9_]*/g, (k) => {
    const v = Number(vars[k] ?? 0);
    return Number.isFinite(v) ? String(v) : '0';
  });
  // Evalúa con Function aislado
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${replaced});`)();
}

async function computeTotal(entry) {
  const service = await Service.findOne({ _id: entry.serviceId, companyId: entry.companyId }).lean();
  if (!service) return 0;
  const map = Object.fromEntries(Object.entries(entry.variables || {}).map(([k, v]) => [String(k).toUpperCase(), v]));
  return Number(safeEval(service.formula || '', map) || 0);
}

export const listPrices = async (req, res) => {
  const { serviceId, brand, line, engine, year, limit = 200 } = req.query;
  const q = { companyId: req.companyId };
  if (serviceId) q.serviceId = serviceId;
  if (brand) q.brand = String(brand).toUpperCase();
  if (line) q.line = String(line).toUpperCase();
  if (engine) q.engine = String(engine).toUpperCase();
  if (year) q.year = Number(year);

  const items = await PriceEntry.find(q).sort({ brand:1, line:1, engine:1, year:1 }).limit(Number(limit)).lean();
  res.json({ items });
};

export const createPrice = async (req, res) => {
  const body = req.body || {};
  body.companyId = req.companyId;
  body.createdBy = req.userId || null;
  body.variables = body.variables || {};
  body.total = await computeTotal(body);

  const saved = await PriceEntry.create(body);
  res.status(201).json(saved);
};

export const updatePrice = async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};
  const prev = await PriceEntry.findOne({ _id: id, companyId: req.companyId });
  if (!prev) return res.status(404).json({ error: 'Registro no encontrado' });

  // merge y recalcula
  if (body.variables) prev.variables = body.variables;
  if (body.brand)  prev.brand = String(body.brand).toUpperCase();
  if (body.line)   prev.line = String(body.line).toUpperCase();
  if (body.engine) prev.engine = String(body.engine).toUpperCase();
  if (body.year != null) prev.year = Number(body.year);
  prev.total = await computeTotal(prev);

  await prev.save();
  res.json(prev.toObject());
};

export const deletePrice = async (req, res) => {
  const { id } = req.params;
  const ok = await PriceEntry.findOneAndDelete({ _id: id, companyId: req.companyId });
  if (!ok) return res.status(404).json({ error: 'Registro no encontrado' });
  res.json({ ok: true });
};
