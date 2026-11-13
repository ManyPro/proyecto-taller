import test from 'node:test';
import assert from 'node:assert/strict';
import Handlebars from 'handlebars';
import { normalizeTemplateHtml } from '../../controllers/templates.controller.js';

const quoteTable = (tbody) => `
<div class="tpl-element items-table">
  <table class="quote-table">
    <thead>
      <tr><th>Detalle</th><th>Cantidad</th><th>Precio</th><th>Total</th></tr>
    </thead>
    ${tbody}
    <tfoot>
      <tr><td colspan="3">SUBTOTAL</td><td>{{money Q.subtotal}}</td></tr>
      <tr><td colspan="3">IVA (19%)</td><td>{{money Q.iva}}</td></tr>
      <tr><td colspan="3">TOTAL</td><td>{{money quote.total}}</td></tr>
    </tfoot>
  </table>
</div>`;

const healthyTbody = `<tbody>
  {{#if quote.itemsGrouped.hasCombos}}
  <tr><td colspan="4">COMBOS</td></tr>
  {{#each quote.itemsGrouped.combos}}
  <tr><td><strong>{{name}}</strong></td><td>{{qty}}</td><td>{{money unitPrice}}</td><td>{{money total}}</td></tr>
  {{#each items}}
  <tr><td>• {{name}}</td><td>{{qty}}</td><td>{{money unitPrice}}</td><td></td></tr>
  {{/each}}
  {{/each}}
  {{/if}}
  {{#if quote.itemsGrouped.hasProducts}}
  {{#each quote.itemsGrouped.products}}
  <tr><td>{{name}}</td><td>{{qty}}</td><td>{{money unitPrice}}</td><td>{{money total}}</td></tr>
  {{/each}}
  {{/if}}
  {{#if quote.itemsGrouped.hasServices}}
  {{#each quote.itemsGrouped.services}}
  <tr><td>{{name}}</td><td>{{qty}}</td><td>{{money unitPrice}}</td><td>{{money total}}</td></tr>
  {{/each}}
  {{/if}}
</tbody>`;

test('una cotización no se reescribe con los ítems de una venta', () => {
  const html = quoteTable(healthyTbody);
  const out = normalizeTemplateHtml(html);
  assert.match(out, /quote\.itemsGrouped\.combos/);
  assert.doesNotMatch(out, /sale\.itemsGrouped/);
  assert.doesNotMatch(out, /\{\{#each sale\.items\}\}/);
});

test('una cotización ya corrupta vuelve a leer quote.itemsGrouped', () => {
  const corrupted = quoteTable(`<tbody>
    {{#if sale.itemsGrouped.hasCombos}}
    {{#each sale.itemsGrouped.combos}}
    <tr><td>{{name}}</td><td>{{qty}}</td><td>{{money unitPrice}}</td><td>{{money total}}</td></tr>
    {{/each}}
    {{/if}}
    {{#unless sale.itemsGrouped.hasProducts}}{{#unless sale.itemsGrouped.hasServices}}{{#unless sale.itemsGrouped.hasCombos}}
    <tr><td colspan="4">Sin ítems</td></tr>
    {{/unless}}{{/unless}}{{/unless}}
  </tbody>`);
  const out = normalizeTemplateHtml(corrupted);
  assert.match(out, /quote\.itemsGrouped\.combos/);
  assert.doesNotMatch(out, /sale\.items/);
});

test('el detalle del combo se imprime con nombre, cantidad y precios', () => {
  const out = normalizeTemplateHtml(quoteTable(healthyTbody));
  const hb = Handlebars.create();
  hb.registerHelper('money', (v) => {
    const n = Number(v || 0);
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
  });
  const rendered = hb.compile(out)({
    Q: { subtotal: 1190000, iva: 0, total: 1190000 },
    quote: {
      total: 1190000,
      ivaEnabled: false,
      itemsGrouped: {
        hasCombos: true,
        hasProducts: false,
        hasServices: false,
        combos: [{
          name: 'CAMBIO DE IMPULSADORES',
          qty: 1,
          unitPrice: 1190000,
          total: 1190000,
          items: [
            { name: 'IMPULSADORES', qty: 1, unitPrice: 520000 },
            { name: 'CHELAC', qty: 1, unitPrice: 20000 },
            { name: 'MANO DE OBRA', qty: 1, unitPrice: 650000 }
          ]
        }],
        products: [],
        services: []
      }
    }
  });
  assert.match(rendered, /CAMBIO DE IMPULSADORES/);
  assert.match(rendered, /IMPULSADORES/);
  assert.match(rendered, /CHELAC/);
  assert.match(rendered, /MANO DE OBRA/);
  assert.match(rendered, /1\.190\.000/);
  assert.doesNotMatch(rendered, /Sin ítems/);
});

test('una remisión sigue usando sale.itemsGrouped', () => {
  const html = `<table class="remission-table"><tbody>
    {{#each sale.items}}
    <tr><td>{{name}}</td><td>{{qty}}</td><td>{{money unitPrice}}</td><td>{{money total}}</td></tr>
    {{/each}}
  </tbody></table>`;
  const out = normalizeTemplateHtml(html);
  assert.match(out, /sale\.itemsGrouped\.products/);
  assert.doesNotMatch(out, /quote\.itemsGrouped/);
});
