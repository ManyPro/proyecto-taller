import PriceEntry from '../models/PriceEntry.js';
import Service from '../models/Service.js';
import xlsx from 'xlsx'; // 0.18.x

// ============ helpers ============
function cleanStr(v) {
  return String(v ?? '').trim().toUpperCase();
}
function num(v) {
  if (v === '' || v == null) return 0;
  const s = String(v).replace(/\s+/g,'').replace(/\$/g,'').replace(/\./g,'').replace(/,/g,'.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function safeEval(expr, vars = {}) {
  const cleaned = String(expr || '').trim().toUpperCase();
  if (!cleaned) return 0;
  if (!/^[\d+\-*/().\sA-Z0-9_]+$/.test(cleaned)) return 0;
  const replaced = cleaned.replace(/[A-Z_][A-Z0-9_]*/g, (k) => {
    const v = Number(vars[k] ?? 0);
    return Number.isFinite(v) ? String(v) : '0';
  });
  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${replaced});`)();
  } catch {
    return 0;
  }
}
async function getService(companyId, serviceId) {
  if (!serviceId) return null;
  return await Service.findOne({ _id: serviceId, companyId }).lean();
}
function computeTotal(service, variables = {}) {
  const map = {};
  for (const [k, v] of Object.entries(variables || {})) {
    map[String(k).toUpperCase()] = num(v);
  }
  const formula = (service?.formula || '').toUpperCase();
  return safeEval(formula, map);
}

// ============ list ============
export const listPrices = async (req, res) => {
  const { serviceId, brand, line, engine, year } = req.query || {};
  const q = { companyId: req.companyId };
  if (serviceId) q.serviceId = serviceId;
  if (brand) q.brand = cleanStr(brand);
  if (line) q.line = cleanStr(line);
  if (engine) q.engine = cleanStr(engine);
  if (year) q.year = Number(year);

  const items = await PriceEntry.find(q).sort({ brand: 1, line: 1, engine: 1, year: 1 }).lean();
  res.json({ items });
};

// ============ create ============
export const createPrice = async (req, res) => {
  const { serviceId, brand, line, engine, year, variables = {} } = req.body || {};
  if (!serviceId) return res.status(400).json({ error: 'serviceId requerido' });
  const svc = await getService(req.companyId, serviceId);
  if (!svc) return res.status(404).json({ error: 'Servicio no encontrado' });

  const doc = {
    companyId: req.companyId,
    serviceId,
    brand: cleanStr(brand),
    line: cleanStr(line),
    engine: cleanStr(engine),
    year: Number(year) || null,
    variables,
    total: computeTotal(svc, variables)
  };
  try {
    const created = await PriceEntry.create(doc);
    res.json(created.toObject());
  } catch (e) {
    // Si ya existe por índice único, intenta actualizar
    if (e?.code === 11000) {
      const filter = {
        companyId: req.companyId, serviceId: serviceId,
        brand: doc.brand, line: doc.line, engine: doc.engine, year: doc.year
      };
      const up = await PriceEntry.findOneAndUpdate(filter, { variables, total: doc.total }, { new: true, upsert: true });
      return res.json(up.toObject());
    }
    throw e;
  }
};

// ============ update ============
export const updatePrice = async (req, res) => {
  const id = req.params.id;
  const { brand, line, engine, year, variables = {} } = req.body || {};
  const row = await PriceEntry.findOne({ _id: id, companyId: req.companyId });
  if (!row) return res.status(404).json({ error: 'No encontrado' });

  const svc = await getService(req.companyId, row.serviceId);
  const total = computeTotal(svc, variables);

  row.brand = cleanStr(brand ?? row.brand);
  row.line = cleanStr(line ?? row.line);
  row.engine = cleanStr(engine ?? row.engine);
  row.year = year != null ? Number(year) : row.year;
  row.variables = variables;
  row.total = total;

  await row.save();
  res.json(row.toObject());
};

// ============ delete (single) ============
export const deletePrice = async (req, res) => {
  const id = req.params.id;
  const del = await PriceEntry.deleteOne({ _id: id, companyId: req.companyId });
  res.json({ deleted: del?.deletedCount || 0 });
};

// ============ delete ALL by service (nuevo, eficiente) ============
export const deleteAllPrices = async (req, res) => {
  const { serviceId } = req.query || {};
  if (!serviceId) return res.status(400).json({ error: 'serviceId requerido' });
  const del = await PriceEntry.deleteMany({ companyId: req.companyId, serviceId });
  res.json({ deleted: del?.deletedCount || 0 });
};

// ============ import XLSX ============
export const importPrices = async (req, res) => {
  const { serviceId, mapping: mappingRaw, mode = 'upsert' } = req.body || {};
  if (!serviceId) return res.status(400).json({ error: 'serviceId es requerido' });
  if (!req.file?.buffer) return res.status(400).json({ error: 'Archivo .xlsx requerido en campo "file"' });

  const svc = await getService(req.companyId, serviceId);
  if (!svc) return res.status(404).json({ error: 'Servicio no encontrado' });

  // Leer primera hoja
  let rows = [];
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  } catch {
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
  const mValues = mapping?.values || {}; // { VARKEY: "nombre_columna" }

  if (mode === 'overwrite') {
    await PriceEntry.deleteMany({ companyId: req.companyId, serviceId });
  }

  let inserted = 0, updated = 0;
  const byKey = (r) => ({
    companyId: req.companyId,
    serviceId,
    brand: cleanStr(r.brand),
    line: cleanStr(r.line),
    engine: cleanStr(r.engine),
    year: r.year ?? null
  });

  for (const raw of rows) {
    const row = Object.fromEntries(Object.entries(raw).map(([k,v]) => [String(k).toLowerCase(), v]));
    const doc = {
      brand: row[mBrand] ?? '',
      line: row[mLine] ?? '',
      engine: row[mEngine] ?? '',
      year: (row[mYear] !== '' && row[mYear] != null) ? Number(row[mYear]) : null,
      variables: {}
    };
    for (const [K, col] of Object.entries(mValues)) {
      doc.variables[K] = row[String(col).toLowerCase()];
    }
    const total = computeTotal(svc, doc.variables);
    const filter = byKey(doc);
    const update = { ...filter, variables: doc.variables, total };

    const resUp = await PriceEntry.findOneAndUpdate(filter, update, { new: true, upsert: true, setDefaultsOnInsert: true });
    if (resUp.createdAt && (resUp.createdAt === resUp.updatedAt)) inserted++; else updated++;
  }

  res.json({ inserted, updated, errors: [] });
};

// ============ export CSV ============
export const exportCsv = async (req, res) => {
  const { serviceId, brand, line, engine, year } = req.query || {};
  const q = { companyId: req.companyId };
  if (serviceId) q.serviceId = serviceId;
  if (brand) q.brand = cleanStr(brand);
  if (line) q.line = cleanStr(line);
  if (engine) q.engine = cleanStr(engine);
  if (year) q.year = Number(year);

  const items = await PriceEntry.find(q).sort({ brand: 1, line: 1, engine: 1, year: 1 }).lean();

  // columnas dinámicas de variables
  const varsKeys = Array.from(new Set(items.flatMap(it => Object.keys(it.variables || {})))).sort();

  const header = ['brand','line','engine','year', ...varsKeys, 'total'];
  const lines = [header.join(',')];

  for (const it of items) {
    const row = [
      `"${String(it.brand||'').replace(/"/g,'""')}"`,
      `"${String(it.line||'').replace(/"/g,'""')}"`,
      `"${String(it.engine||'').replace(/"/g,'""')}"`,
      it.year ?? ''
    ];
    for (const k of varsKeys) {
      const val = it.variables?.[k];
      const isNum = Number.isFinite(Number(val));
      row.push(isNum ? Number(val) : `"${String(val ?? '').replace(/"/g,'""')}"`);
    }
    row.push(it.total ?? 0);
    lines.push(row.join(','));
  }

  const csv = '\uFEFF' + lines.join('\n'); // BOM para Excel
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="prices_export.csv"');
  res.send(csv);
};
