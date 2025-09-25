import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Item from '../models/Item.js';
import PriceEntry from '../models/PriceEntry.js';
import Counter from '../models/Counter.js';
import StockMove from '../models/StockMove.js';
import CustomerProfile from '../models/CustomerProfile.js';

const asNum = (n) => Number.isFinite(Number(n)) ? Number(n) : 0;

function computeTotals(sale) {
  const subtotal = (sale.items || []).reduce((a, it) => a + asNum(it.total), 0);
  sale.subtotal = Math.round(subtotal);
  sale.tax = 0;
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

const push = (req, event, data) => {
  try { const fx = req.app.get('sseSend'); if (fx) fx(req.companyId, event, data); } catch {}
};

export const startSale = async (req, res) => {
  const sale = await Sale.create({ companyId: req.companyId, status: 'draft', items: [] });
  push(req, 'sale:created', { id: sale._id, at: Date.now() });
  res.json(sale.toObject());
};

export const getSale = async (req, res) => {
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  res.json(sale.toObject());
};

export const addItem = async (req, res) => {
  const { id } = req.params;
  const { source, refId, sku, qty = 1, unitPrice } = req.body || {};

  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

  let itemData = null;
  const src = (source === 'service') ? 'price' : source;

  if (src === 'inventory') {
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
  } else if (src === 'price') {
    if (refId) {
      const pe = await PriceEntry.findOne({ _id: refId, companyId: String(req.companyId) });
      if (!pe) return res.status(404).json({ error: 'PriceEntry not found' });
      const q = asNum(qty) || 1;
      const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : asNum(pe.total || pe.price);
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
      const q = asNum(qty) || 1;
      const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : 0;
      itemData = {
        source: 'price',
        refId: new mongoose.Types.ObjectId(),
        sku: (sku || '').toString(),
        name: (req.body?.name || 'Servicio'),
        qty: q,
        unitPrice: up,
        total: Math.round(q * up)
      };
    }
  } else if (src === 'service') {
    const q = asNum(qty) || 1;
    const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : 0;
    itemData = {
      source: 'service',
      refId: new mongoose.Types.ObjectId(),
      sku: (sku || '').toString(),
      name: (req.body?.name || 'Servicio'),
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

  if (sale.vehicle?.plate) {
    const plate = String(sale.vehicle.plate || '').toUpperCase();
    await CustomerProfile.findOneAndUpdate(
      { companyId: req.companyId, 'vehicle.plate': plate },
      {
        companyId: req.companyId,
        customer: {
          idNumber: sale.customer?.idNumber || '',
          name:     sale.customer?.name || '',
          phone:    sale.customer?.phone || '',
          email:    sale.customer?.email || '',
          address:  sale.customer?.address || ''
        },
        vehicle: {
          plate,
          brand:  sale.vehicle?.brand || '',
          line:   sale.vehicle?.line || '',
          engine: sale.vehicle?.engine || '',
          year:   sale.vehicle?.year ?? null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  push(req, 'sale:updated', { id: sale._id, at: Date.now() });
  res.json(sale.toObject());
};

export const updateItem = async (req, res) => {
  const { id, itemId } = req.params;
  const { qty, unitPrice } = req.body || {};

  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });
  const it = sale.items.id(itemId);
  if (!it) return res.status(404).json({ error: 'Item not found' });

  if (qty != null && Number.isFinite(Number(qty))) it.qty = asNum(qty);
  if (unitPrice != null && Number.isFinite(Number(unitPrice))) it.unitPrice = asNum(unitPrice);
  it.total = Math.round(asNum(it.qty) * asNum(it.unitPrice));

  computeTotals(sale);
  await sale.save();

  if (sale.vehicle?.plate) {
    const plate = String(sale.vehicle.plate || '').toUpperCase();
    await CustomerProfile.findOneAndUpdate(
      { companyId: req.companyId, 'vehicle.plate': plate },
      {
        companyId: req.companyId,
        customer: {
          idNumber: sale.customer?.idNumber || '',
          name:     sale.customer?.name || '',
          phone:    sale.customer?.phone || '',
          email:    sale.customer?.email || '',
          address:  sale.customer?.address || ''
        },
        vehicle: {
          plate,
          brand:  sale.vehicle?.brand || '',
          line:   sale.vehicle?.line || '',
          engine: sale.vehicle?.engine || '',
          year:   sale.vehicle?.year ?? null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  push(req, 'sale:updated', { id: sale._id, at: Date.now() });
  res.json(sale.toObject());
};

export const removeItem = async (req, res) => {
  const { id, itemId } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

  sale.items.id(itemId)?.deleteOne();
  computeTotals(sale);
  await sale.save();

  if (sale.vehicle?.plate) {
    const plate = String(sale.vehicle.plate || '').toUpperCase();
    await CustomerProfile.findOneAndUpdate(
      { companyId: req.companyId, 'vehicle.plate': plate },
      {
        companyId: req.companyId,
        customer: {
          idNumber: sale.customer?.idNumber || '',
          name:     sale.customer?.name || '',
          phone:    sale.customer?.phone || '',
          email:    sale.customer?.email || '',
          address:  sale.customer?.address || ''
        },
        vehicle: {
          plate,
          brand:  sale.vehicle?.brand || '',
          line:   sale.vehicle?.line || '',
          engine: sale.vehicle?.engine || '',
          year:   sale.vehicle?.year ?? null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  push(req, 'sale:updated', { id: sale._id, at: Date.now() });
  res.json(sale.toObject());
};

export const setCustomerVehicle = async (req, res) => {
  const { id } = req.params;
  const { customer = {}, vehicle = {}, notes } = req.body || {};
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status === 'closed') return res.status(400).json({ error: 'Closed sale cannot be edited' });

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
  if (sale.vehicle?.plate) {
    const plate = String(sale.vehicle.plate || '').toUpperCase();
    await CustomerProfile.findOneAndUpdate(
      { companyId: req.companyId, 'vehicle.plate': plate },
      {
        companyId: req.companyId,
        customer: {
          idNumber: sale.customer?.idNumber || '',
          name:     sale.customer?.name || '',
          phone:    sale.customer?.phone || '',
          email:    sale.customer?.email || '',
          address:  sale.customer?.address || ''
        },
        vehicle: {
          plate,
          brand:  sale.vehicle?.brand || '',
          line:   sale.vehicle?.line || '',
          engine: sale.vehicle?.engine || '',
          year:   sale.vehicle?.year ?? null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  push(req, 'sale:updated', { id: sale._id, at: Date.now() });
  res.json(sale.toObject());
};

export const closeSale = async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sale = await Sale.findOne({ _id: id, companyId: req.companyId }).session(session);
      if (!sale) throw new Error('Sale not found');
      if (sale.status !== 'draft') throw new Error('Sale not open (draft)');
      if (!sale.items?.length) throw new Error('Sale has no items');

      for (const it of sale.items) {
        if (String(it.source) !== 'inventory') continue;
        const q = asNum(it.qty) || 0;
        if (q <= 0) continue;

        const upd = await Item.updateOne(
          { _id: it.refId, companyId: req.companyId, stock: { $gte: q } },
          { $inc: { stock: -q } }
        ).session(session);

        if (upd.matchedCount === 0) {
          const exists = await Item.findOne({ _id: it.refId, companyId: req.companyId }).session(session);
          if (!exists) throw new Error(`Inventory item not found (${it.sku || it.refId})`);
          throw new Error(`Insufficient stock for ${exists.sku || exists.name}`);
        }

        await StockMove.create([{
          companyId: req.companyId,
          itemId: it.refId,
          qty: q,
          reason: 'OUT',
          meta: { saleId: sale._id, sku: it.sku, name: it.name }
        }], { session });
      }

      computeTotals(sale);
      sale.status = 'closed';
      sale.closedAt = new Date();
      if (!Number.isFinite(Number(sale.number))) {
        sale.number = await getNextSaleNumber(req.companyId);
      }
      await sale.save({ session });
    });

    const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
    if (sale?.vehicle?.plate) {
      const plate = String(sale.vehicle.plate||'').toUpperCase();
      await CustomerProfile.findOneAndUpdate(
        { companyId: req.companyId, 'vehicle.plate': plate },
        {
          companyId: req.companyId,
          customer: {
            idNumber: sale.customer?.idNumber || '',
            name:     sale.customer?.name || '',
            phone:    sale.customer?.phone || '',
            email:    sale.customer?.email || '',
            address:  sale.customer?.address || ''
          },
          vehicle: {
            plate,
            brand:  sale.vehicle?.brand || '',
            line:   sale.vehicle?.line || '',
            engine: sale.vehicle?.engine || '',
            year:   sale.vehicle?.year ?? null
          }
        }, { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    push(req, 'sale:closed', { id, at: Date.now() });
    res.json({ ok: true, sale: sale.toObject() });
  } catch (err) {
    await session.abortTransaction().catch(()=>{});
    res.status(400).json({ error: err?.message || 'Cannot close sale' });
  } finally {
    session.endSession();
  }
};

export const cancelSale = async (req, res) => {
  const { id } = req.params;
  const sale = await Sale.findOne({ _id: id, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status === 'closed') return res.status(400).json({ error: 'Closed sale cannot be cancelled' });
  await Sale.deleteOne({ _id: id, companyId: req.companyId });
  push(req, 'sale:cancelled', { id, at: Date.now() });
  res.json({ ok: true });
};

export const addByQR = async (req, res) => {
  const { saleId, payload } = req.body || {};
  if (!saleId || !payload) return res.status(400).json({ error: 'saleId and payload are required' });

  const sale = await Sale.findOne({ _id: saleId, companyId: req.companyId });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (sale.status !== 'draft') return res.status(400).json({ error: 'Sale not open (draft)' });

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
      push(req, 'sale:updated', { id: sale._id, at: Date.now() });
      return res.json(sale.toObject());
    }
  }

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

  if (sale.vehicle?.plate) {
    const plate = String(sale.vehicle.plate || '').toUpperCase();
    await CustomerProfile.findOneAndUpdate(
      { companyId: req.companyId, 'vehicle.plate': plate },
      {
        companyId: req.companyId,
        customer: {
          idNumber: sale.customer?.idNumber || '',
          name:     sale.customer?.name || '',
          phone:    sale.customer?.phone || '',
          email:    sale.customer?.email || '',
          address:  sale.customer?.address || ''
        },
        vehicle: {
          plate,
          brand:  sale.vehicle?.brand || '',
          line:   sale.vehicle?.line || '',
          engine: sale.vehicle?.engine || '',
          year:   sale.vehicle?.year ?? null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  push(req, 'sale:updated', { id: sale._id, at: Date.now() });
  res.json(sale.toObject());
};

export const listSales = async (req, res) => {
  const { status, from, to, plate, page = 1, limit = 50 } = req.query || {};
  const q = { companyId: req.companyId };
  if (status) q.status = String(status);
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (plate) {
    q['vehicle.plate'] = String(plate).toUpperCase();
  }
  const pg = Math.max(1, Number(page || 1));
  const lim = Math.max(1, Math.min(500, Number(limit || 50)));

  const [items, total] = await Promise.all([
    Sale.find(q).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
    Sale.countDocuments(q)
  ]);
  res.json({ items, page: pg, limit: lim, total });
};

export const summarySales = async (req, res) => {
  const { from, to, plate } = req.query || {};
  const q = { companyId: req.companyId, status: 'closed' };
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (plate) {
    q['vehicle.plate'] = String(plate).toUpperCase();
  }
  const rows = await Sale.aggregate([
    { $match: q },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: { $ifNull: ['$total', 0] } } } }
  ]);
  const agg = rows[0] || { count: 0, total: 0 };
  res.json({ count: agg.count, total: agg.total });
};

export const getProfileByPlate = async (req, res) => {
  const plate = String(req.params.plate || '').trim().toUpperCase();
  if (!plate) return res.status(400).json({ error: 'plate required' });
  const prof = await CustomerProfile.findOne({ companyId: req.companyId, 'vehicle.plate': plate });
  if (!prof) return res.json(null);
  res.json(prof.toObject());
};
