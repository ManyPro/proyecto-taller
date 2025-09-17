// Backend/src/controllers/quotes.controller.js
import Counter from '../models/Counter.js';
import Quote from '../models/Quote.js';

/** Normaliza el tipo recibido desde el Frontend:
 *  'PRODUCTO'|'Servicio' -> 'Producto' ; 'SERVICIO'|'Servicio' -> 'Servicio'
 */
const normKind = (k) => {
  const s = String(k || '').trim().toUpperCase();
  return s === 'SERVICIO' ? 'Servicio' : 'Producto';
};

// Calcula subtotales/total y aplica normalización de items
function computeItems(itemsInput = []) {
  const items = [];
  let total = 0;
  for (const it of itemsInput) {
    if (!it) continue;
    const qtyRaw = it.qty;
    const qty = qtyRaw === null || qtyRaw === '' || qtyRaw === undefined ? null : Number(qtyRaw);
    const unitPrice = Number(it.unitPrice || 0);
    const multiplier = qty && qty > 0 ? qty : 1;
    const subtotal = multiplier * unitPrice;

    items.push({
      kind: normKind(it.kind),
      description: String(it.description || '').trim(),
      qty,                         // puede ser null
      unitPrice,
      subtotal
    });
    total += subtotal;
  }
  return { items, total };
}

export async function createQuote(req, res) {
  const companyId = req.companyId || req.company?.id;
  if (!companyId) return res.status(400).json({ error: 'Falta empresa (companyId)' });

  // Siguiente consecutivo atómico por empresa
  const counter = await Counter.findOneAndUpdate(
    { companyId },
    { $inc: { quoteSeq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const seq = counter.quoteSeq;
  const number = String(seq).padStart(5, '0');

  const { customer = {}, vehicle = {}, validity = '', items: itemsInput = [] } = req.body || {};
  const { items, total } = computeItems(itemsInput);

  const doc = await Quote.create({
    companyId,
    createdBy: req.userId || req.user?.id || undefined,
    seq, number,
    customer: {
      name:  customer.name  || '',
      phone: customer.phone || '',
      email: customer.email || ''
    },
    vehicle: {
      plate:        vehicle.plate        || '',
      make:         vehicle.make         || '',
      line:         vehicle.line         || '',
      modelYear:    vehicle.modelYear    || '',
      displacement: vehicle.displacement || ''
    },
    validity,
    items,
    total
  });

  res.status(201).json(doc);
}

export async function listQuotes(req, res) {
  const companyId = req.companyId || req.company?.id;
  const q = { companyId };

  // Filtros: q (cliente/placa), plate, from, to
  const { q: text, plate, from, to } = req.query || {};

  if (plate) q['vehicle.plate'] = new RegExp(`${plate}`, 'i');
  if (text) {
    const rx = new RegExp(`${text}`, 'i');
    q.$or = [{ 'customer.name': rx }, { 'vehicle.plate': rx }];
  }
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
    if (to)   q.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }

  const docs = await Quote.find(q).sort({ createdAt: -1 }).limit(200);
  res.json(docs);
}

export async function getQuote(req, res) {
  const companyId = req.companyId || req.company?.id;
  const doc = await Quote.findOne({ _id: req.params.id, companyId });
  if (!doc) return res.status(404).json({ error: 'No encontrada' });
  res.json(doc);
}

export async function updateQuote(req, res) {
  const companyId = req.companyId || req.company?.id;
  const exists = await Quote.findOne({ _id: req.params.id, companyId });
  if (!exists) return res.status(404).json({ error: 'No encontrada' });

  const { customer = {}, vehicle = {}, validity = '', items: itemsInput = [] } = req.body || {};
  const { items, total } = computeItems(itemsInput);

  exists.customer = {
    name:  customer.name  ?? exists.customer.name,
    phone: customer.phone ?? exists.customer.phone,
    email: customer.email ?? exists.customer.email
  };
  exists.vehicle = {
    plate:        vehicle.plate        ?? exists.vehicle.plate,
    make:         vehicle.make         ?? exists.vehicle.make,
    line:         vehicle.line         ?? exists.vehicle.line,
    modelYear:    vehicle.modelYear    ?? exists.vehicle.modelYear,
    displacement: vehicle.displacement ?? exists.vehicle.displacement
  };
  exists.validity = validity ?? exists.validity;
  exists.items = items;
  exists.total = total;

  await exists.save();
  res.json(exists);
}

export async function deleteQuote(req, res) {
  const companyId = req.companyId || req.company?.id;
  const r = await Quote.deleteOne({ _id: req.params.id, companyId });
  if (!r.deletedCount) return res.status(404).json({ error: 'No encontrada' });
  res.json({ ok: true });
}
