import Template from '../models/Template.js';
import Sale from '../models/Sale.js';
import Quote from '../models/Quote.js';
import Company from '../models/Company.js';
import Order from '../models/Order.js';
import Item from '../models/Item.js';
import PayrollSettlement from '../models/PayrollSettlement.js';
import PayrollPeriod from '../models/PayrollPeriod.js';
import Handlebars from 'handlebars';
import QRCode from 'qrcode';

// Helpers para armar contexto base multi-documento
// Params:
//  - type: tipo de plantilla (invoice, workOrder, quote, sticker, order)
//  - sampleType (opcional): fuerza el tipo de documento para el contexto (si distinto al type de la plantilla)
//  - sampleId (opcional): id especÃ­fico del documento
async function buildContext({ companyId, type, sampleType, sampleId }) {
  const ctx = { company: {}, now: new Date(), meta: { requestedType: type, sampleType: sampleType || null } };
  const company = await Company.findOne({ _id: companyId });
  if (company) {
    ctx.company = {
      name: company.name || company.email || '',
      email: company.email,
      phone: company.phone || '',
      address: company.address || '',
      logoUrl: company.logoUrl || ''
    };
  }

  const effective = sampleType || type;

  // Venta (invoice/workOrder comparten sale)
  if (['invoice','workOrder','sale'].includes(effective)) {
    let sale = null;
    if (sampleId) sale = await Sale.findOne({ _id: sampleId, companyId });
    else sale = await Sale.findOne({ companyId, status: 'closed' }).sort({ createdAt: -1 });
    if (sale) {
      const saleObj = sale.toObject();
      // Asegurar que items esté presente y sea un array
      if (!saleObj.items || !Array.isArray(saleObj.items)) {
        saleObj.items = [];
      }
      // Asegurar que cada item tenga las propiedades necesarias
      // NO filtrar items vacíos aquí, dejarlos pasar para que el template decida
      saleObj.items = saleObj.items.map(item => ({
        sku: item.sku || '',
        name: item.name || '',
        qty: Number(item.qty) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        total: Number(item.total) || (Number(item.qty) || 0) * (Number(item.unitPrice) || 0)
      }));
      
      // Asegurar que customer esté presente
      if (!saleObj.customer) {
        saleObj.customer = { name: '', email: '', phone: '', address: '' };
      }
      // Asegurar que vehicle esté presente
      if (!saleObj.vehicle) {
        saleObj.vehicle = { plate: '', brand: '', line: '', engine: '', year: null, mileage: null };
      }
      // Asegurar que el número de remisión esté presente y formateado
      // Si no tiene número pero tiene _id, usar el _id como fallback temporal
      if (!saleObj.number || !Number.isFinite(Number(saleObj.number))) {
        // Si la venta no tiene número asignado, intentar obtenerlo del contador
        // Pero solo si es una venta cerrada (para no afectar el contador)
        if (saleObj.status === 'closed') {
          // Para ventas cerradas sin número, usar un número temporal basado en _id
          saleObj.number = saleObj._id ? parseInt(saleObj._id.toString().slice(-6), 16) % 100000 : 0;
        } else {
          saleObj.number = null;
        }
      }
      // Formatear número de remisión
      if (saleObj.number && Number.isFinite(Number(saleObj.number))) {
        saleObj.formattedNumber = String(saleObj.number).padStart(5, '0');
      } else {
        saleObj.formattedNumber = '';
      }
      
      // Log para depuración
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildContext Sale]', {
          saleId: saleObj._id,
          saleNumber: saleObj.number,
          saleFormattedNumber: saleObj.formattedNumber,
          saleStatus: saleObj.status,
          itemsCount: saleObj.items.length,
          items: saleObj.items.map(i => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice, total: i.total })),
          customer: saleObj.customer,
          vehicle: saleObj.vehicle
        });
      }
      
      ctx.sale = saleObj;
    } else {
      // Log si no se encontró la venta
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildContext Sale]', {
          error: 'Sale not found',
          sampleId,
          companyId
        });
      }
    }
  }
  // CotizaciÃ³n
  if (effective === 'quote') {
    let quote = null;
    if (sampleId) quote = await Quote.findOne({ _id: sampleId, companyId });
    else quote = await Quote.findOne({ companyId }).sort({ createdAt: -1 });
    if (quote) {
      const quoteObj = quote.toObject();
      // Asegurar que items esté presente y sea un array
      if (!quoteObj.items || !Array.isArray(quoteObj.items)) {
        quoteObj.items = [];
      }
      // Asegurar que cada item tenga las propiedades necesarias
      // NO filtrar items vacíos aquí, dejarlos pasar para que el template decida
      quoteObj.items = quoteObj.items.map(item => ({
        sku: item.sku || '',
        description: item.description || '',
        qty: item.qty || null,
        unitPrice: Number(item.unitPrice) || 0,
        subtotal: Number(item.subtotal) || (item.qty ? Number(item.qty) : 1) * (Number(item.unitPrice) || 0)
      }));
      
      // Log para depuración
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildContext Quote]', {
          quoteId: quoteObj._id,
          quoteNumber: quoteObj.number,
          itemsCount: quoteObj.items.length,
          items: quoteObj.items.map(i => ({ description: i.description, qty: i.qty, unitPrice: i.unitPrice, subtotal: i.subtotal }))
        });
      }
      // Asegurar que customer esté presente
      if (!quoteObj.customer) {
        quoteObj.customer = { name: '', phone: '', email: '' };
      }
      // Asegurar que vehicle esté presente
      if (!quoteObj.vehicle) {
        quoteObj.vehicle = { plate: '', make: '', line: '', modelYear: '', displacement: '' };
      }
      ctx.quote = quoteObj;
    }
  }
  // Pedido (order)
  if (effective === 'order') {
    let order = null;
    if (sampleId) order = await Order.findOne({ _id: sampleId, companyId });
    else order = await Order.findOne({ companyId }).sort({ createdAt: -1 });
    if (order) ctx.order = order.toObject();
  }
  // Sticker / Item individual (admite variantes sticker-qr / sticker-brand)
  if (['sticker','sticker-qr','sticker-brand','item'].includes(effective)) {
    let item = null;
    if (sampleId) item = await Item.findOne({ _id: sampleId, companyId });
    else item = await Item.findOne({ companyId }).sort({ updatedAt: -1 });
    if (item) {
      ctx.item = item.toObject();
      try {
        const qrValue = ctx.item.sku || String(ctx.item._id || '');
        if (qrValue) {
          // MÃ¡rgenes mÃ­nimos para mejor densidad en stickers pequeÃ±os
          ctx.item.qr = await QRCode.toDataURL(qrValue, { margin: 0, scale: 4, color: { dark: '#000000', light: '#FFFFFF' } });
          ctx.item.qrText = qrValue;
        }
      } catch (e) {
        // No bloquear si falla QR; continuar sin QR
        ctx.item.qr = '';
      }
    }
  }
  // Liquidación de nómina (payroll)
  if (effective === 'payroll') {
    let settlement = null;
    if (sampleId) settlement = await PayrollSettlement.findOne({ _id: sampleId, companyId });
    else settlement = await PayrollSettlement.findOne({ companyId }).sort({ createdAt: -1 });
    if (settlement) {
      const settlementObj = settlement.toObject();
      const period = await PayrollPeriod.findOne({ _id: settlement.periodId, companyId });
      
      // Separar items por tipo
      const itemsByType = {
        earnings: (settlementObj.items || []).filter(i => i.type === 'earning'),
        deductions: (settlementObj.items || []).filter(i => i.type === 'deduction'),
        surcharges: (settlementObj.items || []).filter(i => i.type === 'surcharge')
      };
      
      ctx.settlement = {
        ...settlementObj,
        itemsByType,
        formattedGrossTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.grossTotal || 0),
        formattedDeductionsTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.deductionsTotal || 0),
        formattedNetTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.netTotal || 0)
      };
      
      if (period) {
        ctx.period = {
          ...period.toObject(),
          formattedStartDate: period.startDate ? new Date(period.startDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
          formattedEndDate: period.endDate ? new Date(period.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
          periodTypeLabel: period.periodType === 'monthly' ? 'Mensual' : period.periodType === 'biweekly' ? 'Quincenal' : period.periodType === 'weekly' ? 'Semanal' : period.periodType
        };
      }
    }
  }
  return ctx;
}

// ===== Handlebars helpers (whitelist) =====
let hbInitialized = false;
function ensureHB() {
  if (hbInitialized) return;
  Handlebars.registerHelper('money', (v) => {
    const n = Number(v || 0);
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
  });
  Handlebars.registerHelper('date', (v, fmt) => {
    const d = v ? new Date(v) : new Date();
    if (fmt === 'iso') return d.toISOString().slice(0, 10);
    return d.toLocaleString('es-CO');
  });
  Handlebars.registerHelper('pad', (v, len = 5) => String(v ?? '').toString().padStart(len, '0'));
  Handlebars.registerHelper('uppercase', (v) => String(v || '').toUpperCase());
  Handlebars.registerHelper('lowercase', (v) => String(v || '').toLowerCase());
  // Helper para verificar si un array tiene elementos
  Handlebars.registerHelper('hasItems', (items) => {
    return Array.isArray(items) && items.length > 0;
  });
  hbInitialized = true;
}

function renderHB(tpl, context) {
  ensureHB();
  try {
    const compiled = Handlebars.compile(tpl || '');
    return compiled(context || {});
  } catch (e) {
    return `<!-- render error: ${e.message} -->`;
  }
}

// Sanitizador simple (server-side) para evitar <script> y atributos on*
function sanitize(html=''){ if(!html) return ''; let out = String(html); out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,''); out = out.replace(/ on[a-z]+="[^"]*"/gi,''); out = out.replace(/ on[a-z]+='[^']*'/gi,''); return out; }

export async function listTemplates(req, res) {
  const { type } = req.query || {};
  const q = { companyId: req.companyId };
  if (type) q.type = type;
  const rows = await Template.find(q).sort({ type: 1, active: -1, updatedAt: -1 });
  res.json(rows);
}

export async function getTemplate(req, res) {
  const doc = await Template.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: 'not found' });
  res.json(doc);
}

export async function createTemplate(req, res) {
  let { type, contentHtml = '', contentCss = '', name = '', activate = false } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });
  contentHtml = sanitize(contentHtml);
  const last = await Template.findOne({ companyId: req.companyId, type }).sort({ version: -1 });
  const version = last ? (last.version + 1) : 1;
  if (activate) {
    await Template.updateMany({ companyId: req.companyId, type, active: true }, { $set: { active: false } });
  }
  const doc = await Template.create({ companyId: req.companyId, type, contentHtml, contentCss, name, version, active: !!activate });
  res.json(doc);
}

export async function updateTemplate(req, res) {
  const { id } = req.params;
  const { contentHtml, contentCss, name, activate } = req.body || {};
  const doc = await Template.findOne({ _id: id, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: 'not found' });
  if (contentHtml !== undefined) doc.contentHtml = sanitize(contentHtml);
  if (contentCss !== undefined) doc.contentCss = contentCss;
  if (name !== undefined) doc.name = name;
  if (activate !== undefined && activate) {
    await Template.updateMany({ companyId: req.companyId, type: doc.type, active: true }, { $set: { active: false } });
    doc.active = true;
  }
  await doc.save();
  res.json(doc);
}

export async function previewTemplate(req, res) {
  const { type, sampleId, sampleType, quoteData } = req.body || {};
  let { contentHtml = '', contentCss = '' } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });
  contentHtml = sanitize(contentHtml);
  const ctx = await buildContext({ companyId: req.companyId, type, sampleId, sampleType });
  
  // Si se proporcionan datos de cotización directamente (desde UI sin guardar), sobrescribir el contexto
  // O si hay quoteData y los items del contexto están vacíos, usar quoteData
  if (quoteData && type === 'quote') {
    const hasItemsInData = (quoteData.items || []).length > 0;
    const hasItemsInContext = (ctx.quote?.items || []).length > 0;
    
    // Usar quoteData si no hay sampleId o si los items del contexto están vacíos pero quoteData tiene items
    if (!sampleId || (!hasItemsInContext && hasItemsInData)) {
      ctx.quote = {
        number: quoteData.number || '',
        createdAt: quoteData.date || new Date(),
        customer: {
          name: quoteData.customer?.name || '',
          phone: quoteData.customer?.phone || '',
          email: quoteData.customer?.email || ''
        },
        vehicle: {
          plate: quoteData.vehicle?.plate || '',
          make: quoteData.vehicle?.make || '',
          line: quoteData.vehicle?.line || '',
          modelYear: quoteData.vehicle?.modelYear || '',
          displacement: quoteData.vehicle?.displacement || ''
        },
        validity: quoteData.validity || '',
        items: (quoteData.items || []).map(item => ({
          description: item.description || '',
          qty: item.qty || null,
          unitPrice: Number(item.unitPrice) || 0,
          subtotal: Number(item.subtotal) || (item.qty > 0 ? Number(item.qty) : 1) * (Number(item.unitPrice) || 0),
          sku: item.sku || ''
        })),
        total: quoteData.totals?.total || 0
      };
    }
  }
  
  // Log para depuración (solo en desarrollo)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Template Preview]', {
      type,
      sampleId,
      sampleType,
      hasQuoteData: !!quoteData,
      saleItemsCount: ctx.sale?.items?.length || 0,
      quoteItemsCount: ctx.quote?.items?.length || 0,
      saleNumber: ctx.sale?.number,
      saleFormattedNumber: ctx.sale?.formattedNumber,
      saleItems: ctx.sale?.items || [],
      quoteItems: ctx.quote?.items || [],
      saleCustomer: ctx.sale?.customer,
      saleVehicle: ctx.sale?.vehicle
    });
  }
  
  const html = renderHB(contentHtml, ctx);
  res.json({ rendered: html, css: contentCss, context: ctx });
}

// Obtener plantilla activa para un tipo (uso futuro impresiÃ³n)
export async function activeTemplate(req, res) {
  const { type } = req.params;
  const doc = await Template.findOne({ companyId: req.companyId, type, active: true }).sort({ updatedAt: -1 });
  if (!doc) return res.json(null);
  res.json(doc);
}

// Duplicar plantilla
export async function duplicateTemplate(req, res) {
  const { id } = req.params;
  const { name } = req.body || {};
  
  const original = await Template.findOne({ _id: id, companyId: req.companyId });
  if (!original) return res.status(404).json({ error: 'Template not found' });
  
  // Get next version number
  const last = await Template.findOne({ companyId: req.companyId, type: original.type }).sort({ version: -1 });
  const version = last ? (last.version + 1) : 1;
  
  // Create duplicate with new name
  const duplicateName = name || `${original.name} - Copia`;
  const duplicate = await Template.create({
    companyId: req.companyId,
    type: original.type,
    contentHtml: original.contentHtml,
    contentCss: original.contentCss,
    name: duplicateName,
    version: version,
    active: false // Duplicates are never active by default
  });
  
  res.json(duplicate);
}

// Eliminar plantilla
export async function deleteTemplate(req, res) {
  const { id } = req.params;
  const doc = await Template.findOne({ _id: id, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: 'not found' });
  
  // If this was the active template, we need to handle that
  const wasActive = doc.active;
  const templateType = doc.type;
  
  await Template.deleteOne({ _id: id, companyId: req.companyId });
  
  // If we deleted the active template, activate the most recent one of the same type
  if (wasActive) {
    const nextTemplate = await Template.findOne({ 
      companyId: req.companyId, 
      type: templateType 
    }).sort({ updatedAt: -1 });
    
    if (nextTemplate) {
      nextTemplate.active = true;
      await nextTemplate.save();
    }
  }
  
  res.json({ success: true, deletedId: id });
}

