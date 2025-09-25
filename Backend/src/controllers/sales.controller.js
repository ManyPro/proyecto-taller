import Sale from '../models/Sale.js';
import Item from '../models/Item.js';
import StockMove from '../models/StockMove.js';
import PriceEntry from '../models/PriceEntry.js';
import Counter from '../models/Counter.js';

/** Helpers **/
const asNum = (n) => Number.isFinite(Number(n)) ? Number(n) : 0;

function computeTotals(sale) {
  const subtotal = (sale.items || []).reduce((a, it) => a + asNum(it.total), 0);
  sale.subtotal = Math.round(subtotal);
  sale.tax = 0; // Ajusta IVA/IVA incluido si aplica
  sale.total = Math.round(sale.subtotal + sale.tax);
}

async function getNextSaleNumber(companyId) {
  const c = await Counter.findOneAndUpdate(
    { companyId, key: 'sale_number' },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return c.seq || 1;
}

/** START: crea venta draft persistente */
export const startSale = async (req, res) => {
  const companyId = req.companyId;
  const sale = await Sale.create({
    companyId,
    status: 'draft',
    name: '', // se definirá luego por placa o id corto
    items: []
  });
  if (!sale.name) sale.name = `Venta · ${String(sale._id).slice(-6).toUpperCase()}`;
  await sale.save();
  return res.json(sale.toObject());
};

/** GET una venta */
export const getSale = async (req, res) => {
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  return res.json(sale.toObject());
};

/** PATCH metadatos: por ahora name (y notas si existiera) */
export const patchSale = async (req, res) => {
  const { id } = req.params;
  const { name, notes } = req.body || {};
  const set = {};
  if (name != null) set.name = String(name);
  if (notes != null) set.notes = String(notes);
  const sale = await Sale.findOneAndUpdate(
    { _id: id, companyId: req.companyId },
    { $set: set },
    { new: true }
  );
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  return res.json(sale.toObject());
};

/** Listar ventas (soporta ?status=draft|closed|cancelled) */
export const listSales = async (req, res) => {
  const { status } = req.query || {};
  const q = { companyId: req.companyId };
  if (status) q.status = status;
  const items = await Sale.find(q).sort({ updatedAt: -1 });
  return res.json({ data: items });
};

/** setCustomerVehicle: guarda cliente/vehículo y renombra por placa */
export const setCustomerVehicle = async (req, res) => {
  const { id } = req.params;
  const { customer, vehicle } = req.body || {};
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (customer) sale.customer = customer;
  if (vehicle) {
    sale.vehicle = vehicle;
    const plate = (vehicle.plate || '').trim().toUpperCase();
    if (plate) sale.name = `Venta · ${plate}`;
    else if (!sale.name) sale.name = `Venta · ${String(sale._id).slice(-6).toUpperCase()}`;
  }
  await sale.save();
  return res.json(sale.toObject());
};

/** Agregar ítem a la venta */
export const addItem = async (req, res) => {
  const { id } = req.params;
  const { source, refId, sku, qty } = req.body || {};
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (!source) return res.status(400).json({ error: 'source required' });

  const q = asNum(qty) || 1;

  if (source === 'inventory') {
    let itemDoc = null;
    if (refId) itemDoc = await Item.findOne({ _id: refId, companyId: req.companyId });
    else if (sku) itemDoc = await Item.findOne({ sku: String(sku).toUpperCase(), companyId: req.companyId });
    if (!itemDoc) return res.status(404).json({ error: 'Item not found' });

    const up = asNum(itemDoc.salePrice || itemDoc.price || 0);
    sale.items.push({
      source: 'inventory',
      refId: itemDoc._id,
      sku: itemDoc.sku,
      name: itemDoc.name || itemDoc.sku,
      qty: q,
      unitPrice: up,
      total: Math.round(q * up)
    });
  } else if (source === 'price') {
    const pe = await PriceEntry.findOne({ _id: refId, companyId: req.companyId });
    if (!pe) return res.status(404).json({ error: 'Price entry not found' });
    const up = asNum(pe.price || pe.values?.PRICE || 0);
    sale.items.push({
      source: 'price',
      refId: pe._id,
      sku: pe.code || '',
      name: pe.name || pe.description || pe.code || 'Precio',
      qty: q,
      unitPrice: up,
      total: Math.round(q * up)
    });
  } else if (source === 'service') {
    // Si tienes un modelo Service, cámbialo; por ahora línea libre por refId/sku + name en body
    const up = asNum(req.body.unitPrice || 0);
    sale.items.push({
      source: 'service',
      refId: refId || null,
      sku: sku || '',
      name: req.body.name || 'Servicio',
      qty: q,
      unitPrice: up,
      total: Math.round(q * up)
    });
  } else {
    return res.status(400).json({ error: 'invalid source' });
  }

  computeTotals(sale);
  await sale.save();
  return res.json(sale.toObject());
};

/** Actualizar ítem (qty / unitPrice) */
export const updateItem = async (req, res) => {
  const { id, lineId } = req.params;
  const { qty, unitPrice } = req.body || {};
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  const it = sale.items.id(lineId);
  if (!it) return res.status(404).json({ error: 'Line not found' });

  if (qty != null && Number.isFinite(Number(qty))) it.qty = asNum(qty);
  if (unitPrice != null && Number.isFinite(Number(unitPrice))) it.unitPrice = asNum(unitPrice);
  it.total = Math.round(asNum(it.qty) * asNum(it.unitPrice));

  computeTotals(sale);
  await sale.save();
  return res.json(sale.toObject());
};

/** Eliminar ítem */
export const removeItem = async (req, res) => {
  const { id, lineId } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  const it = sale.items.id(lineId);
  if (!it) return res.status(404).json({ error: 'Line not found' });
  it.deleteOne();
  computeTotals(sale);
  await sale.save();
  return res.json(sale.toObject());
};

/** addByQR (compatibilidad) – resuelve a inventory por refId/sku */
export const addByQR = async (req, res) => {
  const { id } = req.params;
  const raw = String(req.body?.code || '').trim();
  if (!raw) return res.status(400).json({ error: 'code required' });
  // extrae último ObjectId o usa como SKU
  const ids = raw.match(/[a-f0-9]{24}/ig);
  const refId = ids?.length ? ids[ids.length - 1] : null;
  const sku = !refId && /^[A-Z0-9\-_]+$/i.test(raw) ? raw.toUpperCase() : null;
  req.body = { source: 'inventory', refId, sku, qty: 1 };
  return addItem(req, res);
};

/** Cerrar venta: fija totales, descuenta stock y numera */
export const closeSale = async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not in draft' });

  computeTotals(sale);

  const session = await Sale.startSession();
  session.startTransaction();
  try {
    for (const line of sale.items) {
      if (line.source !== 'inventory' || !line.refId) continue;
      const qty = asNum(line.qty || 1);
      const upd = await Item.updateOne(
        { _id: line.refId, companyId: req.companyId, stock: { $gte: qty } },
        { $inc: { stock: -qty } }
      ).session(session);
      if (upd.matchedCount === 0 || upd.modifiedCount === 0) {
        throw new Error(`Stock insuficiente para ${line.sku || line.name}`);
      }
      await StockMove.create([{
        companyId: req.companyId,
        itemId: line.refId,
        qty: -qty,
        type: 'sale',
        direction: 'out',
        saleId: sale._id,
        ts: new Date()
      }], { session });
    }

    sale.status = 'closed';
    sale.closedAt = new Date();
    if (!sale.number) sale.number = await getNextSaleNumber(req.companyId);
    await sale.save({ session });

    await session.commitTransaction();
    session.endSession();
    return res.json(sale.toObject());
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ error: err.message || 'No se pudo cerrar la venta' });
  }
};

/** Cancelar venta (endpoint dedicado) */
export const cancelSale = async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status === 'closed') return res.status(400).json({ error: 'Sale already closed' });
  if (sale.status === 'cancelled') return res.json(sale.toObject());
  sale.status = 'cancelled';
  sale.cancelledAt = new Date();
  await sale.save();
  return res.json(sale.toObject());
};

/** Paginado opcional (por si lo usas en dashboard) */
export const listSalesPaged = async (req, res) => {
  const { page = 1, limit = 50, status } = req.query || {};
  const pg = Math.max(1, Number(page));
  const lim = Math.min(200, Math.max(1, Number(limit)));
  const q = { companyId: req.companyId };
  if (status) q.status = status;
  const [items, total] = await Promise.all([
    Sale.find(q).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
    Sale.countDocuments(q)
  ]);
  res.json({ items, page: pg, limit: lim, total });
};

/** Resumen de ventas cerradas (conteo/total) */
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
