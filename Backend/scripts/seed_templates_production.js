#!/usr/bin/env node
import 'dotenv/config';
import mongoose from 'mongoose';
import Template from '../src/models/Template.js';

/*
 Seed de plantillas de producción para: invoice, workOrder, quote.
 - Usa helpers existentes: {{money ...}}, {{date ...}}, {{pad ...}}, {{uppercase ...}}
 - Contexto esperado:
   - company: { name, address, phone, email, logoUrl }
   - sale: { number, customer{...}, vehicle{...}, items[], subtotal, tax, total, closedAt, createdAt, notes, technician }
   - quote: { number, customer{...}, vehicle{...}, items[], total, createdAt }

 Uso:
   node scripts/seed_templates_production.js --company <companyId>
   Opcionales: --activate (activa como formato por defecto)  --nameSuffix "Prod"
*/

function args() {
  const out = {}; const a = process.argv.slice(2);
  for (let i=0;i<a.length;i++) { const t=a[i]; if(!t.startsWith('--')) continue; const k=t.slice(2); const n=a[i+1]; if(n && !n.startsWith('--')){ out[k]=n; i++; } else out[k]=true; }
  return out;
}

const argv = args();
const companyId = argv.company || argv.c;
if (!companyId) { console.error('Falta --company <companyId>'); process.exit(1); }
const activate = !!argv.activate;
const nameSuffix = argv.nameSuffix ? String(argv.nameSuffix) : 'Producción';

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

const payrollHtml = `
  <div class="doc">
    <div class="header">
      <div style="display:flex; gap:10px; align-items:flex-start;">
        <div class="logo-wrap">{{#if company.logoUrl}}<img src="{{company.logoUrl}}" alt="logo" />{{/if}}</div>
        <div class="brand">{{company.name}}</div>
        <div class="small">{{company.address}}</div>
        <div class="small">Tel: {{company.phone}} · {{company.email}}</div>
      </div>
      <div class="right">
        <h1>COMPROBANTE DE PAGO DE NÓMINA</h1>
        <div class="muted">Fecha: {{date now}}</div>
      </div>
    </div>

    <table class="no-border">
      <tr>
        <td>
          <div class="small"><strong>TÉCNICO</strong></div>
          <div style="font-size: 16px; font-weight: 600;">{{settlement.technicianName}}</div>
        </td>
        <td>
          <div class="small"><strong>PERÍODO</strong></div>
          <div>{{period.formattedStartDate}} → {{period.formattedEndDate}}</div>
          <div class="small muted">{{period.periodTypeLabel}}</div>
        </td>
      </tr>
    </table>

    {{#if settlement.itemsByType.earnings}}
    <div class="section">
      <h3 style="margin: 0 0 8px 0; font-size: 14px; color: var(--primary);">INGRESOS</h3>
      <table>
        <thead>
          <tr><th style="text-align:left;">Concepto</th><th style="width:140px;text-align:right;">Valor</th></tr>
        </thead>
        <tbody>
          {{#each settlement.itemsByType.earnings}}
          <tr>
            <td>{{name}}</td>
            <td class="t-right">{{money value}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
    {{/if}}

    {{#if settlement.itemsByType.surcharges}}
    <div class="section">
      <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #f59e0b;">RECARGOS</h3>
      <table>
        <thead>
          <tr><th style="text-align:left;">Concepto</th><th style="width:140px;text-align:right;">Valor</th></tr>
        </thead>
        <tbody>
          {{#each settlement.itemsByType.surcharges}}
          <tr>
            <td>{{name}}</td>
            <td class="t-right">{{money value}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
    {{/if}}

    {{#if settlement.itemsByType.deductions}}
    <div class="section">
      <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #ef4444;">DESCUENTOS</h3>
      <table>
        <thead>
          <tr><th style="text-align:left;">Concepto</th><th style="width:140px;text-align:right;">Valor</th></tr>
        </thead>
        <tbody>
          {{#each settlement.itemsByType.deductions}}
          <tr>
            <td>{{name}}</td>
            <td class="t-right">{{money value}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
    {{/if}}

    <table class="no-border section">
      <tr>
        <td></td>
        <td style="width:280px;">
          <table class="totals" style="width:100%">
            <tr><td>Total bruto:</td><td class="t-right">{{settlement.formattedGrossTotal}}</td></tr>
            <tr><td>Total descuentos:</td><td class="t-right">{{settlement.formattedDeductionsTotal}}</td></tr>
            <tr style="border-top: 2px solid var(--primary); padding-top: 8px;"><td style="font-weight: 700; font-size: 16px;">NETO A PAGAR:</td><td class="t-right" style="font-weight: 700; font-size: 16px; color: #10b981;">{{settlement.formattedNetTotal}}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <div class="hr"></div>
    <div class="small muted">Documento generado por sistema. Este comprobante es válido para efectos contables.</div>
  </div>
`;

async function upsertTemplate(companyId, type, name, contentHtml, contentCss, activate=false){
  const last = await Template.findOne({ companyId, type }).sort({ version: -1 });
  const version = last ? last.version + 1 : 1;
  if (activate) await Template.updateMany({ companyId, type, active: true }, { $set: { active: false } });
  const doc = await Template.create({ companyId, type, name, contentHtml, contentCss, version, active: !!activate });
  return doc;
}

async function run(){
  const uri = process.env.MONGODB_URI || process.env.MONGO;
  if(!uri){ console.error('MONGODB_URI no configurado'); process.exit(1); }
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'taller' });
  const opts = { activate };
  const inv = await upsertTemplate(companyId, 'invoice', `Factura ${nameSuffix}`, invoiceHtml, baseCss, opts.activate);
  const wo  = await upsertTemplate(companyId, 'workOrder', `Orden de Trabajo ${nameSuffix}`, workOrderHtml, baseCss, opts.activate);
  const qt  = await upsertTemplate(companyId, 'quote', `Cotización ${nameSuffix}`, quoteHtml, baseCss, opts.activate);
  const py  = await upsertTemplate(companyId, 'payroll', `Nómina ${nameSuffix}`, payrollHtml, baseCss, opts.activate);
  console.log('Plantillas creadas:', { invoice: inv._id, workOrder: wo._id, quote: qt._id, payroll: py._id });
  await mongoose.disconnect();
}

run().catch(e=>{ console.error('seed_templates_production error', e); process.exit(1); });
