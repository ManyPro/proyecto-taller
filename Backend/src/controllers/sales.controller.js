import Sale from '../models/Sale.js';
import Item from '../models/Item.js';
import PriceEntry from '../models/PriceEntry.js';
import Counter from '../models/Counter.js';

const asNum = (n)=> Number.isFinite(Number(n)) ? Number(n) : 0;

function computeTotals(sale){
  const subtotal = (sale.items||[]).reduce((a,it)=> a + asNum(it.total), 0);
  sale.subtotal = Math.round(subtotal);
  sale.tax = 0; // ajusta IVA si aplica
  sale.total = Math.round(sale.subtotal + sale.tax);
}

async function getNextSaleNumber(companyId){
  const c = await Counter.findOneAndUpdate(
    { companyId },
    { $inc: { saleSeq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return c.saleSeq;
}

export const startSale = async (req,res)=>{
  const sale = await Sale.create({ companyId: req.companyId, status: 'open' });
  res.json(sale.toObject());
};

export const getSale = async (req,res)=>{
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error: 'Sale not found' });
  res.json(sale.toObject());
};

export const addItem = async (req,res)=>{
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error: 'Sale not found' });

  const { source, refId, sku, qty=1, unitPrice } = req.body || {};
  if (!source) return res.status(400).json({ error: 'source is required' });

  let itemData = null;

  if (source === 'inventory') {
    let it = null;
    if (refId) {
      it = await Item.findOne({ _id: refId, companyId: req.companyId });
    } else if (sku) {
      it = await Item.findOne({ sku: String(sku).toUpperCase(), companyId: req.companyId });
    }
    if (!it) return res.status(404).json({ error: 'Item not found' });

    const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : asNum(it.salePrice);
    const q = asNum(qty) || 1;

    itemData = {
      source: 'inventory',
      refId: it._id,
      sku: it.sku,
      name: it.name || it.sku,
      qty: q,
      unitPrice: up,
      total: Math.round(q * up)
    };
  }

  if (source === 'price') {
    if (!refId) return res.status(400).json({ error: 'refId is required for price source' });
    const pe = await PriceEntry.findOne({ _id: refId, companyId: String(req.companyId) });
    if (!pe) return res.status(404).json({ error: 'PriceEntry not found' });

    const up = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : asNum(pe.total);
    const q = asNum(qty) || 1;

    itemData = {
      source: 'price',
      refId: pe._id,
      sku: `SRV-${String(pe._id).slice(-6)}`,
      name: `${pe.brand||''} ${pe.line||''} ${pe.engine||''} ${pe.year||''}`.trim(),
      qty: q,
      unitPrice: up,
      total: Math.round(q * up)
    };
  }

  if (!itemData) return res.status(400).json({ error: 'unsupported source' });

  sale.items.push(itemData);
  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};

export const updateItem = async (req,res)=>{
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error: 'Sale not found' });

  const it = sale.items.id(req.params.itemId);
  if(!it) return res.status(404).json({ error: 'Item not found' });

  const { qty, unitPrice } = req.body || {};
  if (Number.isFinite(Number(qty))) it.qty = asNum(qty);
  if (Number.isFinite(Number(unitPrice))) it.unitPrice = asNum(unitPrice);
  it.total = Math.round(asNum(it.qty) * asNum(it.unitPrice));

  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};

export const removeItem = async (req,res)=>{
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error: 'Sale not found' });

  const it = sale.items.id(req.params.itemId);
  if(!it) return res.status(404).json({ error: 'Item not found' });

  it.remove();
  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};

export const setCustomerVehicle = async (req,res)=>{
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error: 'Sale not found' });

  const { customer, vehicle, notes } = req.body || {};
  if (customer) sale.customer = { ...(sale.customer||{}), ...customer };
  if (vehicle)  sale.vehicle  = { ...(sale.vehicle ||{}), ...vehicle };
  if (typeof notes === 'string') sale.notes = notes;

  await sale.save();
  res.json(sale.toObject());
};

export const closeSale = async (req,res)=>{
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error: 'Sale not found' });

  computeTotals(sale);

  if (sale.status !== 'closed') {
    sale.status = 'closed';
    sale.closedAt = new Date();
    if (!Number.isFinite(Number(sale.number))) {
      sale.number = await getNextSaleNumber(req.companyId);
    }
    await sale.save();
  }
  res.json({ ok:true, sale: sale.toObject() });
};

// --- addByQR robusto: acepta IT:<itemId> | IT:<companyId>:<itemId> | SKU ---
export const addByQR = async (req,res)=>{
  const { saleId, payload } = req.body || {};
  if (!saleId || !payload) return res.status(400).json({ error: 'saleId and payload are required' });

  const sale = await Sale.findOne({ _id: saleId, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error: 'Sale not found' });

  const s = String(payload||'').trim();

  // IT:...
  if (s.toUpperCase().startsWith('IT:')) {
    const parts = s.split(':').map(p=>p.trim()).filter(Boolean);
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
