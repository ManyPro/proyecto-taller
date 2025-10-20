#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Template from '../src/models/Template.js';
import Company from '../src/models/Company.js';

// Util: timestamp string
const ts = () => new Date().toISOString().replace(/[:.]/g,'-');

// Base CSS y HTML (mismos que seed_templates_production.js)
const baseCss = `
  :root { --primary:#1E3A8A; --text:#222; --muted:#666; --border:#ddd; }
  body { font-family: Arial, Helvetica, sans-serif; color:var(--text); }
  .doc { width: 21cm; min-height: 27cm; margin: 0 auto; padding: 18mm 18mm 16mm; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 16px; gap:16px; }
  .brand { font-size: 18px; font-weight: 700; }
  .right { text-align:right; }
  .muted { color:var(--muted); }
  h1 { margin:0; font-size: 22px; letter-spacing: 1px; color: var(--primary); }
  .logo-wrap { width: 160px; height: 46px; display:flex; align-items:center; }
  .logo-wrap img { max-height: 46px; max-width: 160px; object-fit: contain; }
  table { width:100%; border-collapse: collapse; }
  th, td { border:1px solid var(--border); padding:6px 8px; font-size: 12px; }
  th { background:#f5f7fb; font-weight:700; color:#111; }
  .no-border td, .no-border th { border:none; }
  .totals td { border:none; }
  .t-right { text-align:right; }
  .t-center { text-align:center; }
  .section { margin-top: 10px; }
  .small { font-size: 12px; }
  .hr { border-top: 1px solid #e5e7eb; margin: 10px 0; }
`;

const invoiceHtml = `
  <div class="doc">
    <div class="header">
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <div class="logo-wrap">{{#if company.logoUrl}}<img src="{{company.logoUrl}}" alt="logo" />{{/if}}</div>
        <div class="brand">{{company.name}}</div>
        <div class="small">{{company.address}}</div>
        <div class="small">Tel: {{company.phone}} · {{company.email}}</div>
      </div>
      <div class="right">
        <h1>FACTURA</h1>
        <div># {{pad sale.number 5}}</div>
        <div class="muted">Fecha: {{date sale.closedAt}}</div>
      </div>
    </div>

    <table class="no-border">
      <tr>
        <td>
          <div class="small"><strong>CLIENTE</strong></div>
          <div>{{sale.customer.name}}</div>
          <div class="small muted">CC/NIT: {{sale.customer.idNumber}} · Tel: {{sale.customer.phone}} · {{sale.customer.email}}</div>
          <div class="small">{{sale.customer.address}}</div>
        </td>
        <td>
          <div class="small"><strong>VEHÍCULO</strong></div>
          <div>Placa: {{uppercase sale.vehicle.plate}} · Marca: {{sale.vehicle.brand}} · Línea: {{sale.vehicle.line}}</div>
          <div class="small muted">Motor: {{sale.vehicle.engine}} · Año: {{sale.vehicle.year}} · Km: {{sale.vehicle.mileage}}</div>
        </td>
      </tr>
    </table>

    <div class="section">
      <table>
        <thead>
          <tr><th class="t-center" style="width:60px;">Cant.</th><th>Descripción</th><th style="width:110px;">Precio Unit.</th><th style="width:110px;">Total</th></tr>
        </thead>
        <tbody>
          {{#each sale.items}}
          <tr>
            <td class="t-center">{{qty}}</td>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{name}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{/each}}
          {{#unless sale.items}}
          <tr><td colspan="4" class="muted">Sin ítems. {{#if sale.notes}}Notas: {{sale.notes}}{{/if}}</td></tr>
          {{/unless}}
        </tbody>
      </table>
    </div>

    <table class="no-border section">
      <tr>
        <td></td>
        <td style="width:240px;">
          <table class="totals" style="width:100%">
            <tr><td>Subtotal:</td><td class="t-right">{{money sale.subtotal}}</td></tr>
            <tr><td>IVA:</td><td class="t-right">{{money sale.tax}}</td></tr>
            <tr><td><strong>TOTAL:</strong></td><td class="t-right"><strong>{{money sale.total}}</strong></td></tr>
          </table>
        </td>
      </tr>
    </table>

    {{#if sale.notes}}
    <div class="section small"><strong>Observaciones:</strong> {{sale.notes}}</div>
    {{/if}}
    <div class="hr"></div>
    <div class="small muted">Garantía de 30 días en mano de obra. Documento generado por sistema.</div>
  </div>
`;

const workOrderHtml = `
  <div class="doc">
    <div class="header">
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <div class="logo-wrap">{{#if company.logoUrl}}<img src="{{company.logoUrl}}" alt="logo" />{{/if}}</div>
        <div class="brand">{{company.name}}</div>
        <div class="small">{{company.address}}</div>
        <div class="small">Tel: {{company.phone}} · {{company.email}}</div>
      </div>
      <div class="right">
        <h1>ORDEN DE TRABAJO</h1>
        <div># {{pad sale.number 5}}</div>
        <div class="muted">Fecha: {{date sale.createdAt}}</div>
      </div>
    </div>

    <table class="no-border">
      <tr>
        <td>
          <div class="small"><strong>CLIENTE</strong></div>
          <div>{{sale.customer.name}}</div>
          <div class="small muted">CC/NIT: {{sale.customer.idNumber}} · Tel: {{sale.customer.phone}}</div>
        </td>
        <td>
          <div class="small"><strong>VEHÍCULO</strong></div>
          <div>Placa: {{uppercase sale.vehicle.plate}} · Marca: {{sale.vehicle.brand}} · Línea: {{sale.vehicle.line}}</div>
          <div class="small muted">Motor: {{sale.vehicle.engine}} · Año: {{sale.vehicle.year}} · Km: {{sale.vehicle.mileage}}</div>
          <div class="small">Técnico: {{sale.technician}}</div>
        </td>
      </tr>
    </table>

    <div class="section">
      <table>
        <thead><tr><th style="width:60px;" class="t-center">Cant.</th><th>Trabajo / Insumo</th><th style="width:110px;">Unit</th><th style="width:110px;">Total</th></tr></thead>
        <tbody>
          {{#each sale.items}}
          <tr>
            <td class="t-center">{{qty}}</td>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{name}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{/each}}
          {{#unless sale.items}}
          <tr><td colspan="4" class="muted">Sin ítems. {{#if sale.notes}}Notas: {{sale.notes}}{{/if}}</td></tr>
          {{/unless}}
        </tbody>
      </table>
    </div>

    {{#if sale.notes}}
      <div class="section small"><strong>Observaciones del ingreso:</strong> {{sale.notes}}</div>
    {{/if}}
    <div class="hr"></div>
    <div class="small muted">Firma Cliente: __________________________ &nbsp;&nbsp; Fecha: {{date now 'iso'}}</div>
  </div>
`;

const quoteHtml = `
  <div class="doc">
    <div class="header">
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <div class="logo-wrap">{{#if company.logoUrl}}<img src="{{company.logoUrl}}" alt="logo" />{{/if}}</div>
        <div class="brand">{{company.name}}</div>
        <div class="small">{{company.address}}</div>
        <div class="small">Tel: {{company.phone}} · {{company.email}}</div>
      </div>
      <div class="right">
        <h1>COTIZACIÓN</h1>
        <div># {{quote.number}}</div>
        <div class="muted">Fecha: {{date quote.createdAt}}</div>
      </div>
    </div>
    <table class="no-border">
      <tr>
        <td>
          <div class="small"><strong>CLIENTE</strong></div>
          <div>{{quote.customer.name}}</div>
          <div class="small muted">Tel: {{quote.customer.phone}} · {{quote.customer.email}}</div>
        </td>
        <td>
          <div class="small"><strong>VEHÍCULO</strong></div>
          <div>Placa: {{uppercase quote.vehicle.plate}} · Marca: {{quote.vehicle.make}} · Línea: {{quote.vehicle.line}}</div>
          <div class="small muted">Cilindraje: {{quote.vehicle.displacement}} · Modelo: {{quote.vehicle.modelYear}}</div>
        </td>
      </tr>
    </table>
    <div class="section">
      <table>
        <thead><tr><th style="width:60px;" class="t-center">Cant.</th><th>Descripción</th><th style="width:110px;">Unit</th><th style="width:110px;">Subtotal</th></tr></thead>
        <tbody>
          {{#each quote.items}}
          <tr>
            <td class="t-center">{{qty}}</td>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{description}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money subtotal}}</td>
          </tr>
          {{/each}}
          {{#unless quote.items}}
          <tr><td colspan="4" class="muted">Sin ítems</td></tr>
          {{/unless}}
        </tbody>
      </table>
    </div>
    <table class="no-border section"><tr><td></td><td style="width:240px;">
      <table class="totals" style="width:100%">
        <tr><td><strong>TOTAL:</strong></td><td class="t-right"><strong>{{money quote.total}}</strong></td></tr>
      </table>
    </td></tr></table>
    <div class="hr"></div>
    <div class="small muted">Validez: {{quote.validity}} · Moneda: {{quote.currency}}</div>
  </div>
`;

function isInvoiceValid(t){
  const h = (t?.contentHtml||'').toLowerCase();
  return h.includes('{{sale.customer.name') && h.includes('{{#each sale.items') && h.includes('{{money sale.total');
}
function isWorkOrderValid(t){
  const h = (t?.contentHtml||'').toLowerCase();
  return h.includes('{{sale.vehicle.plate') && (h.includes('{{sale.technician') || h.includes('técnico'));
}
function isQuoteValid(t){
  const h = (t?.contentHtml||'').toLowerCase();
  return h.includes('{{quote.customer.name') && h.includes('{{#each quote.items') && h.includes('{{money quote.total');
}

function decideObsolete(t){
  if (!t?.contentHtml || String(t.contentHtml).trim()==='') return true;
  const h = t.contentHtml;
  // Marcadamente obsoleto: placeholders incorrectos típicos
  const badTokens = ['{{sale.customername}}','{{date sale.date}}'];
  if (badTokens.some(b=> h.includes(b))) return true;
  return false;
}

async function upsert(companyId, type, name, html, css, activate){
  if (activate) await Template.updateMany({ companyId, type, active: true }, { $set: { active: false } });
  const last = await Template.findOne({ companyId, type }).sort({ version: -1 });
  const version = last ? last.version + 1 : 1;
  const doc = await Template.create({ companyId, type, name, contentHtml: html, contentCss: css, version, active: !!activate });
  return doc;
}

async function setActiveTemplate(companyId, type, id){
  await Template.updateMany({ companyId, type, active: true }, { $set: { active: false } });
  await Template.updateOne({ _id: id, companyId, type }, { $set: { active: true } });
}

async function run(){
  const uri = process.env.MONGODB_URI || process.env.MONGO;
  if(!uri){ console.error('MONGODB_URI no configurado'); process.exit(1); }
  const args = process.argv.slice(2);
  const APPLY = args.includes('--apply');
  const PURGE = args.includes('--purge');
  const UPGRADE = args.includes('--upgrade');
  const backupDir = path.join(process.cwd(), 'Backend', 'tmp');
  try { fs.mkdirSync(backupDir, { recursive: true }); } catch {}
  const backupPath = path.join(backupDir, `templates_backup_${ts()}.json`);

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'taller' });
  const companies = await Company.find({});
  const report = [];

  for (const c of companies){
    const cid = String(c._id);
    const templates = await Template.find({ companyId: cid });
    const byType = (t)=> templates.filter(x=>x.type===t);
    const inv = byType('invoice');
    const wo  = byType('workOrder');
    const qt  = byType('quote');

    const actions = { company: { id: cid, name: c.name||c.email||'' }, created: [], preservedActive: [], activatedNow: [], purged: [] };
    // Política: NO tocar formatos custom existentes; crear por defecto si faltan y activar solo si no hay activo para el tipo.
    // Invoice
    if (inv.length === 0){
      if (APPLY){ const d = await upsert(cid,'invoice','Factura Producción', invoiceHtml, baseCss, true); actions.created.push({type:'invoice', id: d._id}); }
      else actions.created.push({type:'invoice', preview:true});
    } else {
      const act = inv.find(t=>t.active) || null;
      if (act && UPGRADE && /producci[óo]n/i.test(String(act.name||''))){
        if (APPLY){ const d = await upsert(cid,'invoice','Factura Producción', invoiceHtml, baseCss, true); actions.activatedNow.push({ type:'invoice', id:String(d._id), upgradedFrom:String(act._id) }); }
        else actions.activatedNow.push({ type:'invoice', preview:true, upgradedFrom:String(act._id) });
      } else if (act) actions.preservedActive.push({ type:'invoice', id: String(act._id) });
      else {
        // No hay activo: activar Producción si existe; si no, crear y activar Producción
        const prod = inv.find(t=> /producci[óo]n/i.test(t.name||'')) || inv.find(isInvoiceValid);
        if (APPLY){
          if (prod) { await setActiveTemplate(cid,'invoice', prod._id); actions.activatedNow.push({ type:'invoice', id:String(prod._id) }); }
          else { const d = await upsert(cid,'invoice','Factura Producción', invoiceHtml, baseCss, true); actions.created.push({type:'invoice', id:d._id}); actions.activatedNow.push({ type:'invoice', id:String(d._id) }); }
        } else actions.activatedNow.push({ type:'invoice', preview:true });
      }
    }
    // WorkOrder
    if (wo.length === 0){
      if (APPLY){ const d=await upsert(cid,'workOrder','Orden de Trabajo Producción', workOrderHtml, baseCss, true); actions.created.push({type:'workOrder', id:d._id}); }
      else actions.created.push({type:'workOrder', preview:true});
    } else {
      const act = wo.find(t=>t.active) || null;
      if (act && UPGRADE && /producci[óo]n/i.test(String(act.name||''))){
        if (APPLY){ const d=await upsert(cid,'workOrder','Orden de Trabajo Producción', workOrderHtml, baseCss, true); actions.activatedNow.push({ type:'workOrder', id:String(d._id), upgradedFrom:String(act._id) }); }
        else actions.activatedNow.push({ type:'workOrder', preview:true, upgradedFrom:String(act._id) });
      } else if (act) actions.preservedActive.push({ type:'workOrder', id: String(act._id) });
      else {
        const prod = wo.find(t=> /producci[óo]n/i.test(t.name||'')) || wo.find(isWorkOrderValid);
        if (APPLY){
          if (prod) { await setActiveTemplate(cid,'workOrder', prod._id); actions.activatedNow.push({ type:'workOrder', id:String(prod._id) }); }
          else { const d=await upsert(cid,'workOrder','Orden de Trabajo Producción', workOrderHtml, baseCss, true); actions.created.push({type:'workOrder', id:d._id}); actions.activatedNow.push({ type:'workOrder', id:String(d._id) }); }
        } else actions.activatedNow.push({ type:'workOrder', preview:true });
      }
    }
    // Quote
    if (qt.length === 0){
      if (APPLY){ const d=await upsert(cid,'quote','Cotización Producción', quoteHtml, baseCss, true); actions.created.push({type:'quote', id:d._id}); }
      else actions.created.push({type:'quote', preview:true});
    } else {
      const act = qt.find(t=>t.active) || null;
      if (act && UPGRADE && /producci[óo]n/i.test(String(act.name||''))){
        if (APPLY){ const d=await upsert(cid,'quote','Cotización Producción', quoteHtml, baseCss, true); actions.activatedNow.push({ type:'quote', id:String(d._id), upgradedFrom:String(act._id) }); }
        else actions.activatedNow.push({ type:'quote', preview:true, upgradedFrom:String(act._id) });
      } else if (act) actions.preservedActive.push({ type:'quote', id: String(act._id) });
      else {
        const prod = qt.find(t=> /producci[óo]n/i.test(t.name||'')) || qt.find(isQuoteValid);
        if (APPLY){
          if (prod) { await setActiveTemplate(cid,'quote', prod._id); actions.activatedNow.push({ type:'quote', id:String(prod._id) }); }
          else { const d=await upsert(cid,'quote','Cotización Producción', quoteHtml, baseCss, true); actions.created.push({type:'quote', id:d._id}); actions.activatedNow.push({ type:'quote', id:String(d._id) }); }
        } else actions.activatedNow.push({ type:'quote', preview:true });
      }
    }

    if (PURGE){
      const doomed = templates.filter(t=> decideObsolete(t) && !t.active);
      if (doomed.length){
        // backup
        try { fs.appendFileSync(backupPath, JSON.stringify({ companyId: cid, remove: doomed.map(d=>d.toObject()) })+"\n"); } catch {}
        if (APPLY){ await Template.deleteMany({ _id: { $in: doomed.map(d=>d._id) }, companyId: cid }); actions.purged = doomed.map(d=>({type:d.type, id:d._id})); }
        else actions.purged = doomed.map(d=>({type:d.type, id:String(d._id), preview:true}));
      }
    }

    report.push(actions);
  }

  await mongoose.disconnect();
  console.log(JSON.stringify({ apply: APPLY, purge: PURGE, backupPath, companies: report }, null, 2));
}

run().catch(e=>{ console.error('normalize_templates_all_companies error', e); process.exit(1); });
