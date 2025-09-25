import Sale from '../models/Sale.js';
import Item from '../models/Item.js';
import PriceEntry from '../models/PriceEntry.js';
import Counter from '../models/Counter.js';

const asNum = (n) => Number.isFinite(Number(n)) ? Number(n) : 0;

function computeTotals(sale) {
  const subtotal = (sale.items || []).reduce((a, it) => a + asNum(it.total), 0);
  sale.subtotal = Math.round(subtotal);
  sale.tax = 0; // Ajusta IVA si aplica
  sale.total = Math.round(sale.subtotal + sale.tax);
}

async function getNextSaleNumber(companyId) {
  const c = await Counter.findOneAndUpdate(
    { companyId },
    { $inc: { saleSeq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return c.saleSeq;
}

// Crear venta vacía (status=open)
export const startSale = async (req, res) => {
  const sale = await Sale.create({ companyId: req.companyId, status: 'open', items: [] });
  res.json(sale.toObject());
};

// Obtener venta por id (filtrada por companyId)
export const getSale = async (req, res) => {
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  res.json(sale.toObject());
};

// Agregar ítem (source='inventory' | 'price')
export const addItem = async (req, res) => {
  const { id } = req.params;
  const { source, refId, sku, qty = 1, unitPrice } = req.body || {};

  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'open') return res.status(400).json({ error: 'Sale is closed' });

  let itemData = null;

  if (source === 'inventory') {
    let it = null;
    if (refId) it = await Item.findOne({ _id: refId, companyId: req.companyId });
    if (!it && sku) it = await Item.findOne({ sku: String(sku).trim().toUpperCase(), companyId: req.companyId });
    if (!it) return res.status(404).json({ error: 'Item not found' });

    const q = asNum(qty) || 1;
    const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : asNum(it.salePrice);

    itemData = {
      source: 'inventory',
      refId: it._id,
      sku: it.sku,
      name: it.name || it.sku,
      qty: q,
      unitPrice: up,
      total: Math.round(q * up)
    };
  } else if (source === 'price') {
    if (!refId) return res.status(400).json({ error: 'refId is required for price source' });
    const pe = await PriceEntry.findOne({ _id: refId, companyId: String(req.companyId) });
    if (!pe) return res.status(404).json({ error: 'PriceEntry not found' });

    const q = asNum(qty) || 1;
    const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : asNum(pe.total);

    itemData = {
      source: 'price',
      refId: pe._id,
      sku: `SRV-${String(pe._id).slice(-6)}`,
      name: `${pe.brand || ''} ${pe.line || ''} ${pe.engine || ''} ${pe.year || ''}`.trim(),
      qty: q,
      unitPrice: up,
      total: Math.round(q * up)
    };
  } else {
    return res.status(400).json({ error: 'unsupported source' });
  }

  sale.items.push(itemData);
  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};

// Actualizar ítem (qty, unitPrice)
export const updateItem = async (req, res) => {
  const { id, itemId } = req.params;
  const { qty, unitPrice } = req.body || {};

  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });

  const it = sale.items.id(itemId);
  if (!it) return res.status(404).json({ error: 'Item not found' });

  if (qty != null && Number.isFinite(Number(qty))) it.qty = asNum(qty);
  if (unitPrice != null && Number.isFinite(Number(unitPrice))) it.unitPrice = asNum(unitPrice);
  it.total = Math.round(asNum(it.qty) * asNum(it.unitPrice));

  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};

// Eliminar ítem
export const removeItem = async (req, res) => {
  const { id, itemId } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });

  sale.items.id(itemId)?.deleteOne();
  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};

// Cliente / Vehículo
export const setCustomerVehicle = async (req, res) => {
  const { id } = req.params;
  const { customer = {}, vehicle = {}, notes } = req.body || {};
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });

  sale.customer = {
    type: customer.type || sale.customer?.type || '',
    idNumber: (customer.idNumber || '').trim(),
    name: (customer.name || '').trim(),
    phone: (customer.phone || '').trim(),
    email: (customer.email || '').trim(),
    address: (customer.address || '').trim()
  };
  sale.vehicle = {
    plate: (vehicle.plate || '').toUpperCase(),
    brand: (vehicle.brand || '').toUpperCase(),
    line: (vehicle.line || '').toUpperCase(),
    engine: (vehicle.engine || '').toUpperCase(),
    year: vehicle.year ?? null,
    mileage: vehicle.mileage ?? null
  };
  if (typeof notes === 'string') sale.notes = notes;

  await sale.save();
  res.json(sale.toObject());
};

// Cerrar venta → asigna número secuencial por empresa
export const closeSale = async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (!sale.items?.length) return res.status(400).json({ error: 'Sale has no items' });

  computeTotals(sale);

  if (sale.status !== 'closed') {
    sale.status = 'closed';
    sale.closedAt = new Date();
    if (!Number.isFinite(Number(sale.number))) {
      sale.number = await getNextSaleNumber(req.companyId);
    }
    await sale.save();
  }

  res.json({ ok: true, sale: sale.toObject() });
};

// Agregar por QR (acepta IT:<itemId> | IT:<companyId>:<itemId> | SKU)
export const addByQR = async (req, res) => {
  const { saleId, payload } = req.body || {};
  if (!saleId || !payload) return res.status(400).json({ error: 'saleId and payload are required' });

  const sale = await Sale.findOne({ _id: saleId, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'open') return res.status(400).json({ error: 'Sale is closed' });

  const s = String(payload || '').trim();

  if (s.toUpperCase().startsWith('IT:')) {
    const parts = s.split(':').map(p => p.trim()).filter(Boolean);
    let itemId = null;
    if (parts.length === 2) itemId = parts[1];
    if (parts.length >= 3) itemId = parts[2];

    if (itemId) {
      const it = await Item.findOne({ _id: itemId, companyId: req.companyId });
      if (!it) return res.status(404).json({ error: 'Item not found for QR' });

      const q = 1;
      const up = asNum(it.salePrice);
      sale.items.push({
        source: 'inventory',
        refId: it._id,
        sku: it.sku,
        name: it.name || it.sku,
        qty: q,
        unitPrice: up,
        total: Math.round(q * up)
      });
      computeTotals(sale);
      await sale.save();
      return res.json(sale.toObject());
    }
  }

  // Fallback: tratar como SKU
  const it = await Item.findOne({ sku: s.toUpperCase(), companyId: req.companyId });
  if (!it) return res.status(404).json({ error: 'SKU not found' });

  const q = 1;
  const up = asNum(it.salePrice);
  sale.items.push({
    source: 'inventory',
    refId: it._id,
    sku: it.sku,
    name: it.name || it.sku,
    qty: q,
    unitPrice: up,
    total: Math.round(q * up)
  });
  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};

// Listado (paginado + filtros básicos)
export const listSales = async (req, res) => {
  const { status, from, to, page = 1, limit = 50 } = req.query || {};
  const q = { companyId: req.companyId };
  if (status) q.status = String(status);
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  const pg = Math.max(1, Number(page || 1));
  const lim = Math.max(1, Math.min(500, Number(limit || 50)));

  const [items, total] = await Promise.all([
    Sale.find(q).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
    Sale.countDocuments(q)
  ]);
  res.json({ items, page: pg, limit: lim, total });
};

// Resumen de Caja (solo cerradas)
export const summarySales = async (req, res) => {
  const { from, to } = req.query || {};
  const q = { companyId: req.companyId, status: 'closed' };
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  const rows = await Sale.aggregate([
    { $match: q },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: { $ifNull: ['$total', 0] } } } }
  ]);
  const agg = rows[0] || { count: 0, total: 0 };
  res.json({ count: agg.count, total: agg.total });
};


export const cancelSale = async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status === 'closed') return res.status(400).json({ error: 'Sale already closed' });
  sale.status = 'cancelled';
  sale.cancelledAt = new Date();
  await sale.save();
  res.json(sale.toObject());
};
