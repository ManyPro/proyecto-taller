import PriceEntry from '../models/PriceEntry.js';
import Service from '../models/Service.js';
import xlsx from 'xlsx'; // default import para xlsx 0.18.x

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

// ===== LIST/CRUD =====
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

// ===== IMPORTAR XLSX =====
const NUM_KEYS = ['VALOR','PRECIO','COSTO']; // ayuda mínimo
const normalizeNumber = (v) => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\s+/g,'').replace(/\$/g,'').replace(/\./g,'').replace(/,/g,'.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export const importPrices = async (req, res) => {
  const { serviceId, mapping: mappingRaw, mode = 'upsert' } = req.body || {};
  if (!serviceId) return res.status(400).json({ error: 'serviceId es requerido' });
  if (!req.file?.buffer) return res.status(400).json({ error: 'Archivo .xlsx requerido en campo "file"' });

  const service = await Service.findOne({ _id: serviceId, companyId: req.companyId }).lean();
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });

  // Parse XLSX (primera hoja)
  let rows = [];
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.SheetNames[0];
    rows = xlsx.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });
  } catch (e) {
    return res.status(400).json({ error: 'XLSX inválido' });
  }

  // Mapping
  let mapping;
  try { mapping = mappingRaw ? JSON.parse(mappingRaw) : {}; }
  catch { return res.status(400).json({ error: 'mapping JSON inválido' }); }

  const mBrand  = String(mapping?.brand  || 'marca').toLowerCase();
  const mLine   = String(mapping?.line   || 'linea').toLowerCase();
  const mEngine = String(mapping?.engine || 'motor').toLowerCase();
  const mYear   = String(mapping?.year   || 'año').toLowerCase();
  const mValues = mapping?.values || {};

  // Overwrite opcional
  if (String(mode).toLowerCase() === 'overwrite') {
    await PriceEntry.deleteMany({ companyId: req.companyId, serviceId });
  }

  let inserted = 0, updated = 0;
  const errors = [];

  for (let i=0; i<rows.length; i++){
    const r = rows[i];
    const pick = (key) => {
      const k = Object.keys(r).find(h => String(h).trim().toLowerCase() === key);
      return k ? r[k] : '';
    };

    const brand  = String(pick(mBrand)).toUpperCase();
    const line   = String(pick(mLine)).toUpperCase();
    const engine = String(pick(mEngine)).toUpperCase();
    const year   = Number(pick(mYear)) || 0;

    if (!brand || !line || !engine || !year) {
      errors.push({ row: i+2, error: 'Faltan campos clave (marca/linea/motor/año)' });
      continue;
    }

    // Variables
    const vars = {};
    for (const vdef of (service.variables||[])) {
      const col = mValues[vdef.key] || vdef.key.toLowerCase();
      const raw = pick(String(col).toLowerCase());
      vars[vdef.key] = (vdef.type === 'number' || NUM_KEYS.some(k => vdef.key.includes(k)))
        ? normalizeNumber(raw)
        : (raw ?? '');
    }

    // Upsert
    try {
      const base = { companyId: req.companyId, serviceId, brand, line, engine, year, variables: vars };
      base.total = await computeTotal(base);
      const filter = { companyId: req.companyId, serviceId, brand, line, engine, year };
      const exists = await PriceEntry.findOne(filter).lean();
      if (exists) {
        await PriceEntry.updateOne(filter, { $set: { variables: vars, total: base.total } });
        updated++;
      } else {
        await PriceEntry.create(base);
        inserted++;
      }
    } catch (e) {
      errors.push({ row: i+2, error: e.message || 'Error al guardar' });
    }
  }

  res.json({ inserted, updated, errors });
};

// ===== EXPORTAR CSV =====
export const exportCsv = async (req, res) => {
  const { serviceId, brand, line, engine, year } = req.query;
  const q = { companyId: req.companyId };
  if (serviceId) q.serviceId = serviceId;
  if (brand) q.brand = String(brand).toUpperCase();
  if (line) q.line = String(line).toUpperCase();
  if (engine) q.engine = String(engine).toUpperCase();
  if (year) q.year = Number(year);

  const items = await PriceEntry.find(q).sort({ brand:1, line:1, engine:1, year:1 }).lean();

  // Cabeceras dinámicas por servicio
  let varsKeys = [];
  if (serviceId) {
    const svc = await Service.findOne({ _id: serviceId, companyId: req.companyId }).lean();
    varsKeys = (svc?.variables||[]).map(v=>v.key);
  } else if (items[0]) {
    varsKeys = Object.keys(items[0].variables || {});
  }

  const headers = ['BRAND','LINE','ENGINE','YEAR', ...varsKeys, 'TOTAL'];
  const lines = [headers.join(',')];
  for (const it of items) {
    const row = [
      `"${(it.brand||'').replace(/"/g,'""')}"`,
      `"${(it.line||'').replace(/"/g,'""')}"`,
      `"${(it.engine||'').replace(/"/g,'""')}"`,
      it.year ?? '',
      ...varsKeys.map(k => Number.isFinite(Number(it.variables?.[k])) ? Number(it.variables?.[k]) : `"${String(it.variables?.[k]??'').replace(/"/g,'""')}"`),
      it.total ?? 0
    ];
    lines.push(row.join(','));
  }

  const csv = '\uFEFF' + lines.join('\n'); // BOM para Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="prices_export.csv"');
  res.send(csv);
};
