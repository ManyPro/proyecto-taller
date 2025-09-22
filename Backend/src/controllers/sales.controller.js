import Sale from '../models/Sale.js';
import Item from '../models/Item.js';
import PriceEntry from '../models/PriceEntry.js';

const num = (n)=> Number.isFinite(Number(n)) ? Number(n) : 0;

function computeTotals(sale){
  const subtotal = (sale.items||[]).reduce((a,it)=> a + num(it.total), 0);
  sale.subtotal = Math.round(subtotal);
  sale.tax = 0; // ajusta si aplicas IVA
  sale.total = Math.round(sale.subtotal + sale.tax);
}

export const startSale = async (req,res)=>{
  const sale = await Sale.create({ companyId: req.companyId, status: 'open' });
  res.json(sale.toObject());
};

export const getSale = async (req,res)=>{
  const sale = await Sale.findOne({ _id: req.params.id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error:'No encontrado' });
  res.json(sale.toObject());
};

export const addItem = async (req,res)=>{
  const { id } = req.params;
  const { source, refId, sku, qty=1, unitPrice } = req.body || {};
  const sale = await Sale.findOne({ _id:id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error:'Venta no encontrada' });
  if(sale.status !== 'open') return res.status(400).json({ error:'Venta cerrada' });

  let itemData = { source, qty: num(qty)||1, unitPrice: 0, total: 0, sku:'', name:'' };

  if(source === 'inventory'){
    let it = null;
    if(refId) it = await Item.findOne({ _id: refId, companyId: req.companyId }).lean();
    if(!it && sku) it = await Item.findOne({ sku: String(sku).trim().toUpperCase(), companyId: req.companyId }).lean();
    if(!it) return res.status(404).json({ error:'Item inventario no encontrado' });
    itemData = { ...itemData,
      refId: it._id, sku: it.sku, name: it.name || it.sku,
      unitPrice: num(unitPrice ?? it.salePrice)
    };
  } else if (source === 'price'){
    const pe = await PriceEntry.findOne({ _id: refId, companyId: req.companyId }).lean();
    if(!pe) return res.status(404).json({ error:'Entrada de precios no encontrada' });
    itemData = { ...itemData,
      refId: pe._id,
      sku: `${pe.brand}-${pe.line}-${pe.engine}-${pe.year||''}`.toUpperCase(),
      name: `SERVICIO: ${pe.brand} ${pe.line} ${pe.engine} ${pe.year||''}`.trim(),
      unitPrice: num(unitPrice ?? pe.total)
    };
  } else {
    return res.status(400).json({ error:'source inválido' });
  }

  itemData.total = Math.round(itemData.unitPrice * (itemData.qty||1));
  sale.items.push(itemData);
  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};

export const updateItem = async (req,res)=>{
  const { id, itemId } = req.params;
  const { qty, unitPrice } = req.body || {};
  const sale = await Sale.findOne({ _id:id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error:'Venta no encontrada' });
  const it = sale.items.id(itemId);
  if(!it) return res.status(404).json({ error:'Ítem no encontrado' });
  if(qty != null) it.qty = num(qty);
  if(unitPrice != null) it.unitPrice = num(unitPrice);
  it.total = Math.round(num(it.unitPrice) * num(it.qty));
  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};

export const removeItem = async (req,res)=>{
  const { id, itemId } = req.params;
  const sale = await Sale.findOne({ _id:id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error:'Venta no encontrada' });
  sale.items.id(itemId)?.deleteOne();
  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};

export const setCustomerVehicle = async (req,res)=>{
  const { id } = req.params;
  const { customer = {}, vehicle = {} } = req.body || {};
  const sale = await Sale.findOne({ _id:id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error:'Venta no encontrada' });
  sale.customer = {
    type: customer.type || sale.customer?.type || '',
    idNumber: (customer.idNumber||'').trim(),
    name: (customer.name||'').trim(),
    phone: (customer.phone||'').trim(),
    email: (customer.email||'').trim(),
    address: (customer.address||'').trim()
  };
  sale.vehicle = {
    plate: (vehicle.plate||'').toUpperCase(),
    brand: (vehicle.brand||'').toUpperCase(),
    line:  (vehicle.line||'').toUpperCase(),
    engine:(vehicle.engine||'').toUpperCase(),
    year:  vehicle.year ?? null,
    mileage: vehicle.mileage ?? null
  };
  await sale.save();
  res.json(sale.toObject());
};

export const closeSale = async (req,res)=>{
  const { id } = req.params;
  const sale = await Sale.findOne({ _id:id, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error:'Venta no encontrada' });
  if(sale.items.length === 0) return res.status(400).json({ error:'La venta no tiene ítems' });
  sale.status = 'closed';
  computeTotals(sale);
  await sale.save();
  res.json({ ok:true, sale: sale.toObject(), pdfUrl: null });
};

export const addByQR = async (req,res)=>{
  const { saleId, code } = req.body || {};
  if(!saleId || !code) return res.status(400).json({ error:'saleId y code requeridos' });
  const sale = await Sale.findOne({ _id:saleId, companyId: req.companyId });
  if(!sale) return res.status(404).json({ error:'Venta no encontrada' });
  const it = await Item.findOne({ sku: String(code).trim().toUpperCase(), companyId: req.companyId }).lean();
  if(!it) return res.status(404).json({ error:'SKU no encontrado' });
  const itemData = {
    source:'inventory',
    refId: it._id,
    sku: it.sku,
    name: it.name || it.sku,
    qty: 1,
    unitPrice: num(it.salePrice),
    total: Math.round(num(it.salePrice))
  };
  sale.items.push(itemData);
  computeTotals(sale);
  await sale.save();
  res.json(sale.toObject());
};
