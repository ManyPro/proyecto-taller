import mongoose from 'mongoose';
import Item from '../models/Item.js';
import Sale from '../models/Sale.js';
import Notification from '../models/Notification.js';
import WorkOrder from '../models/WorkOrder.js';
import CustomerProfile from '../models/CustomerProfile.js';
import Company from '../models/Company.js';
import { publish } from '../lib/live.js';

// ---- Helpers ----
function coercePositiveInt(v, def){
  const n = parseInt(v,10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function sanitizeDescription(html){
  if(!html) return '';
  let out = String(html);
  // Remove script/style tags
  out = out.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/script>/gi,'');
  out = out.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/style>/gi,'');
  // Remove on* attributes
  out = out.replace(/on[a-zA-Z]+\s*=\s*"[^"]*"/g,'');
  out = out.replace(/on[a-zA-Z]+\s*=\s*'[^']*'/g,'');
  out = out.replace(/on[a-zA-Z]+\s*=\s*[^\s>]+/g,'');
  // Basic whitelist: allow p, b, i, br, ul, li, strong, em, span, div, img, a, h1-h4
  // Strip other tags but keep text
  out = out.replace(/<\/?(?!p|b|i|br|ul|li|strong|em|span|div|img|a|h[1-4])[^>]*>/gi,'');
  // Limit length
  if(out.length > 5000) out = out.slice(0,5000);
  return out.trim();
}

function mapPublicItem(doc){
  if(!doc) return null;
  const price = (Number.isFinite(doc.publicPrice) ? doc.publicPrice : doc.salePrice) || 0;
  // Public image policy: if no explicit publicImages, fallback to internal inventory images
  let images = Array.isArray(doc.publicImages) ? doc.publicImages.slice(0,10) : [];
  if(!images.length && Array.isArray(doc.images) && doc.images.length){
    images = doc.images.slice(0,10).map(m => ({ url: m.url, alt: doc.name || doc.sku || '' }));
  }
  return {
    id: String(doc._id),
    sku: doc.sku,
    name: doc.name,
    brand: doc.brand || '',
    price,
    stock: doc.stock || 0,
    category: doc.category || '',
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    images,
    description: sanitizeDescription(doc.publicDescription || ''),
    publishedAt: doc.publishedAt || null
  };
}

// GET /public/catalog/:companyId/info
export const getPublicCompanyInfo = async (req, res) => {
  const { companyId } = req.params;
  if(!mongoose.Types.ObjectId.isValid(companyId)) return res.status(400).json({ error: 'companyId invÃ¡lido' });
  const company = await Company.findById(companyId).select('name email address phone logoUrl preferences active');
  if(!company || company.active === false) return res.status(404).json({ error: 'Empresa no encontrada o inactiva' });
  res.setHeader('Cache-Control','public, max-age=120');
  res.json({
    company: {
      id: String(company._id),
      name: company.name || '',
      address: company.address || '',
      phone: company.phone || '',
      email: company.email || '',
      logoUrl: company.logoUrl || '',
      whatsAppNumber: company.preferences?.whatsAppNumber || ''
    }
  });
};

// GET /public/catalog/items
export const listPublishedItems = async (req, res) => {
  const { companyId } = req.params;
  if(!mongoose.Types.ObjectId.isValid(companyId)) return res.status(400).json({ error: 'companyId invÃ¡lido' });
  const company = await Company.findById(companyId).select('_id active publicCatalogEnabled');
  if(!company || company.active === false) return res.status(404).json({ error: 'Empresa no encontrada o inactiva' });
  // Nota: Permitimos listar el catÃ¡logo aunque publicCatalogEnabled sea false, para evitar bloqueo accidental.
  // El control de visibilidad se delega a "published" por Ã­tem y al UI que expone el enlace.
  const page = Math.min(coercePositiveInt(req.query.page,1), 5000);
  const limit = Math.min(coercePositiveInt(req.query.limit,40), 50);
  const skip = (page-1)*limit;
  const { q, category, tags, stock, brand } = req.query;

  const filter = { published: true, companyId: company._id };
  if(q){
    const r = new RegExp(String(q).trim().toUpperCase(), 'i');
    filter.$or = [{ name: r }, { sku: r }];
  }
  if(category){
    filter.category = new RegExp(String(category).trim(), 'i');
  }
  if(brand){
    filter.brand = new RegExp(String(brand).trim(), 'i');
  }
  if(tags){
    const arr = String(tags).split(',').map(s=>s.trim()).filter(Boolean);
    if(arr.length) filter.tags = { $in: arr };
  }
  // Por defecto, sÃ³lo con stock. Si stock=all, incluye agotados.
  const stockParam = String(stock||'').trim().toLowerCase();
  if(stockParam !== 'all'){
    filter.stock = { $gt: 0 };
  }

  const total = await Item.countDocuments(filter);
  const items = await Item.find(filter).sort({ publishedAt: -1, _id: -1 }).skip(skip).limit(limit);
  // Cache hint (override if middleware didn't)
  res.setHeader('Cache-Control','public, max-age=30, stale-while-revalidate=120');
  res.json({
    data: items.map(mapPublicItem),
    meta: { page, limit, total, pages: Math.ceil(total/limit) }
  });
};

// GET /public/catalog/items/:id
export const getPublishedItem = async (req, res) => {
  const { id, companyId } = req.params;
  if(!mongoose.Types.ObjectId.isValid(companyId)) return res.status(400).json({ error: 'companyId invÃ¡lido' });
  if(!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Item no encontrado' });
  const doc = await Item.findOne({ _id: id, companyId, published: true });
  if(!doc) return res.status(404).json({ error: 'Item no publicado para esta empresa' });
  res.setHeader('Cache-Control','public, max-age=60, stale-while-revalidate=300');
  res.json({ item: mapPublicItem(doc) });
};

// GET /public/catalog/customer?idNumber=123
export const lookupCustomerByIdNumber = async (req, res) => {
  const { companyId } = req.params;
  if(!mongoose.Types.ObjectId.isValid(companyId)) return res.status(400).json({ error: 'companyId invÃ¡lido' });
  const idNumber = String(req.query.idNumber||'').trim();
  if(!idNumber) return res.status(400).json({ error: 'Falta idNumber' });
  const profile = await CustomerProfile.findOne({ identificationNumber: idNumber, companyId });
  if(!profile) return res.json({ profile: null });
  res.json({ profile: {
    identificationNumber: profile.identificationNumber,
    name: profile.customer?.name || '',
    phone: profile.customer?.phone || '',
    email: profile.customer?.email || '',
    address: profile.customer?.address || ''
  }});
};

// POST /public/catalog/checkout
export const checkoutCatalog = async (req, res) => {
  const { companyId } = req.params;
  if(!mongoose.Types.ObjectId.isValid(companyId)) return res.status(400).json({ error: 'companyId invÃ¡lido' });
  const company = await Company.findById(companyId).select('_id active publicCatalogEnabled');
  // Relajar gating: permitir checkout si la empresa estÃ¡ activa, aunque publicCatalogEnabled sea false.
  if(!company || company.active === false) return res.status(404).json({ error: 'Empresa no encontrada o inactiva' });
  const b = req.body || {};
  const itemsReq = Array.isArray(b.items) ? b.items : [];
  if(!itemsReq.length) return res.status(400).json({ error: 'Carrito vacÃ­o' });

  // Customer data
  const customer = b.customer || {};
  const idNumber = String(customer.idNumber||'').trim();
  const custName = String(customer.name||'').trim();
  if(!idNumber || !custName) return res.status(400).json({ error: 'Faltan datos cliente (idNumber, name)' });

  const deliveryMethod = ['pickup','home-bogota','store'].includes(b.deliveryMethod) ? b.deliveryMethod : 'pickup';
  const requiresInstallation = !!b.requiresInstallation;

  // Regla: instalaciÃ³n en taller incompatible con envÃ­o a domicilio BogotÃ¡
  let finalDelivery = deliveryMethod;
  let adjusted = false;
  if(requiresInstallation && deliveryMethod === 'home-bogota') {
    finalDelivery = 'store'; // forzar retiro en taller
    adjusted = true;
  }

  // Load items and validate
  const itemIds = itemsReq.map(it => it.id).filter(id => mongoose.Types.ObjectId.isValid(id));
  const dbItems = await Item.find({ _id: { $in: itemIds }, published: true, companyId });
  const dbMap = new Map(dbItems.map(d => [String(d._id), d]));

  const saleItems = [];
  for(const reqItem of itemsReq){
    const qty = coercePositiveInt(reqItem.qty, 1);
    const id = String(reqItem.id);
    const doc = dbMap.get(id);
    if(!doc) return res.status(400).json({ error: `Item no publicado: ${id}` });
    if((doc.stock||0) < qty) return res.status(400).json({ error: `Stock insuficiente para ${doc.sku}` });
    const unitPrice = (Number.isFinite(doc.publicPrice) ? doc.publicPrice : doc.salePrice) || 0;
    saleItems.push({
      source: 'inventory',
      refId: doc._id,
      sku: doc.sku,
      name: doc.name,
      qty,
      unitPrice,
      total: unitPrice * qty
    });
  }

  const subtotal = saleItems.reduce((s,it)=> s + it.total, 0);
  const tax = 0; // No definido (puede calcularse luego)
  const total = subtotal + tax;

  // Create Sale (status draft, origin catalog). Assumption: internal team will close later.
  let sale = await Sale.create({
    companyId: company._id,
    origin: 'catalog',
    status: 'draft',
    items: saleItems,
    customer: {
      idNumber,
      name: custName,
      phone: String(customer.phone||'').trim(),
      email: String(customer.email||'').trim(),
      address: String(customer.address||'').trim()
    },
    notes: String(b.notes||'').trim(),
    subtotal,
    tax,
    total,
    payMethod: 'pay-on-delivery',
    deliveryMethod: finalDelivery,
    requiresInstallation
  });
  // PolÃ­tica de stock: no descontar en checkout. El descuento ocurre al cerrar la venta internamente.

  // Upsert customer profile (bÃ¡sico) con placa Ãºnica por cliente para evitar duplicados
  if (idNumber) {
    try {
      const companyIdStr = String(sale.companyId || '');
      const plateValue = `CATALOGO-${String(idNumber).trim().toUpperCase()}`; // Ãºnico por cliente
      await CustomerProfile.findOneAndUpdate(
        { companyId: companyIdStr, $or: [ { identificationNumber: idNumber }, { plate: plateValue } ] },
        {
          $set: {
            customer: {
              idNumber,
              name: custName,
              phone: String(customer.phone||'').trim(),
              email: String(customer.email||'').trim(),
              address: String(customer.address||'').trim()
            }
          },
          $setOnInsert: {
            companyId: companyIdStr,
            identificationNumber: idNumber,
            vehicle: { plate: plateValue },
            plate: plateValue
          }
        },
        { upsert: true, new: true }
      );
    } catch (e) {
      // Evitar que un E11000 por carrera bloquee el checkout
      if (!/E11000/.test(e?.message || '')) {
        console.error('customerProfile.upsert.error', e?.message);
      }
    }
  }

  // Notification
  await Notification.create({
    companyId: sale.companyId,
    type: 'sale.created',
    data: { saleId: sale._id, origin: 'catalog' }
  });
  try{ publish(String(sale.companyId||''), 'sale:created', { id: String(sale._id), origin: 'catalog' }); }catch{}

  // Crear WorkOrder si requiere instalaciÃ³n
  let workOrder = null;
  if(requiresInstallation){
    try {
      workOrder = await WorkOrder.create({
        companyId: sale.companyId,
        saleId: sale._id,
        customer: sale.customer,
        items: sale.items.map(it => ({ refId: it.refId, sku: it.sku, name: it.name, qty: it.qty })),
        notes: 'Generada desde checkout pÃºblico (instalaciÃ³n).'
      });
      await Notification.create({ companyId: sale.companyId, type: 'workOrder.created', data: { workOrderId: workOrder._id, saleId: sale._id } });
    } catch (e) {
      console.error('Error creando WorkOrder:', e.message);
    }
  }

  res.status(201).json({ 
    sale: { id: sale._id, status: sale.status, total: sale.total, deliveryMethod: finalDelivery, adjusted }, 
    workOrder: workOrder ? { id: workOrder._id } : null,
    message: adjusted ? 'InstalaciÃ³n requiere retiro en taller. MÃ©todo de entrega ajustado.' : undefined
  });
};

// GET /public/catalog/sitemap.txt (simple list of item URLs)
export const sitemapPlain = async (req, res) => {
  const { companyId } = req.params;
  if(!mongoose.Types.ObjectId.isValid(companyId)) return res.status(400).json({ error: 'companyId invÃ¡lido' });
  const base = (req.protocol + '://' + req.get('host'));
  const items = await Item.find({ published: true, companyId }).select('_id updatedAt');
  const lines = items.map(i => `${base}/catalog/${companyId}/item/${i._id}`);
  res.setHeader('Content-Type','text/plain');
  res.send(lines.join('\n'));
};

// GET /public/catalog/sitemap.xml (basic SEO sitemap)
export const sitemapXml = async (req, res) => {
  const { companyId } = req.params;
  if(!mongoose.Types.ObjectId.isValid(companyId)) return res.status(400).json({ error: 'companyId invÃ¡lido' });
  const base = (req.protocol + '://' + req.get('host'));
  const items = await Item.find({ published: true, companyId }).select('_id updatedAt');
  const urls = items.map(i => {
    const loc = `${base}/catalog/${companyId}/item/${i._id}`;
    const lastmod = i.updatedAt.toISOString();
    return `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  res.setHeader('Content-Type','application/xml');
  res.setHeader('Cache-Control','public, max-age=600');
  res.send(xml);
};

// GET /public/catalog/feed.csv?key=SECRET
export const feedCsv = async (req, res) => {
  const { companyId } = req.params;
  if(!mongoose.Types.ObjectId.isValid(companyId)) return res.status(400).json({ error: 'companyId invÃ¡lido' });
  const key = String(req.query.key||'');
  const expected = process.env.CATALOG_FEED_KEY || '';
  if(!expected || key !== expected) return res.status(403).json({ error: 'Forbidden' });
  const items = await Item.find({ published: true, stock: { $gt: 0 }, companyId }).limit(2000);
  const headers = ['id','sku','name','price','stock','category','tags','publishedAt'];
  const rows = [headers.join(',')];
  for(const it of items){
    const price = (Number.isFinite(it.publicPrice)?it.publicPrice:it.salePrice)||0;
    rows.push([
      it._id,
      `"${it.sku}"`,
      `"${it.name.replace(/"/g,'""')}"`,
      price,
      it.stock||0,
      `"${(it.category||'').replace(/"/g,'""')}"`,
      `"${(Array.isArray(it.tags)?it.tags.join('|'):'').replace(/"/g,'""')}"`,
      it.publishedAt ? it.publishedAt.toISOString() : ''
    ].join(','));
  }
  res.setHeader('Content-Type','text/csv');
  res.send(rows.join('\n'));
};

