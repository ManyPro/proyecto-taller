window.VAR_CATALOG = [
  { label: 'Nombre del cliente', value: '{{sale.customerName}}', group: 'Cliente y contacto', tags: ['cliente', 'nombre', 'comprador', 'persona'] },
  { label: 'Teléfono del cliente', value: '{{sale.customerPhone}}', group: 'Cliente y contacto', tags: ['cliente', 'teléfono', 'contacto'] },
  { label: 'Correo del cliente', value: '{{sale.customerEmail}}', group: 'Cliente y contacto', tags: ['cliente', 'correo', 'email'] },
  { label: 'Dirección de entrega', value: '{{sale.deliveryAddress}}', group: 'Cliente y contacto', tags: ['cliente', 'dirección', 'entrega'] },
  { label: 'Nombre de la empresa', value: '{{company.name}}', group: 'Empresa', tags: ['empresa', 'nombre'] },
  { label: 'Dirección de la empresa', value: '{{company.address}}', group: 'Empresa', tags: ['empresa', 'dirección'] },
  { label: 'Teléfono de la empresa', value: '{{company.phone}}', group: 'Empresa', tags: ['empresa', 'teléfono'] },
  { label: 'Correo de la empresa', value: '{{company.email}}', group: 'Empresa', tags: ['empresa', 'correo', 'email'] },
  { label: 'Documento de la empresa (NIT/RUT)', value: '{{company.ruc}}', group: 'Empresa', tags: ['empresa', 'documento', 'nit', 'ruc'] },
  { label: 'Número de documento', value: '{{sale.number}}', group: 'Documento', tags: ['número', 'factura', 'venta'] },
  { label: 'Fecha de emisión', value: '{{date sale.date}}', group: 'Documento', tags: ['fecha', 'emisión'] },
  { label: 'Estado de la venta', value: '{{uppercase sale.status}}', group: 'Documento', tags: ['estado', 'estatus'] },
  { label: 'Asesor asignado', value: '{{sale.attendedBy}}', group: 'Documento', tags: ['asesor', 'responsable'] },
  { label: 'Notas internas', value: '{{sale.notes}}', group: 'Documento', tags: ['notas', 'comentarios'] },
  { label: 'Subtotal de la venta', value: '{{money sale.subtotal}}', group: 'Totales', tags: ['subtotal', 'venta'] },
  { label: 'Impuesto de la venta', value: '{{money sale.tax}}', group: 'Totales', tags: ['impuesto', 'IVA'] },
  { label: 'Total a cobrar', value: '{{money sale.total}}', group: 'Totales', tags: ['total', 'venta'] },
  { label: 'Número de cotización', value: '{{quote.number}}', group: 'Cotización', tags: ['cotización', 'número'] },
  { label: 'Fecha de la cotización', value: '{{date quote.date}}', group: 'Cotización', tags: ['cotización', 'fecha'] },
  { label: 'Validez de la cotización', value: '{{date quote.validUntil}}', group: 'Cotización', tags: ['cotización', 'validez', 'vence'] },
  { label: 'Total de la cotización', value: '{{money quote.total}}', group: 'Cotización', tags: ['cotización', 'total'] },
  { label: 'Nombre del contacto (cotización)', value: '{{quote.customerName}}', group: 'Cotización', tags: ['cotización', 'cliente', 'nombre'] },
  { label: 'Placa del vehículo', value: '{{sale.vehicle.plate}}', group: 'Vehículo', tags: ['vehículo', 'placa'] },
  { label: 'Marca del vehículo', value: '{{sale.vehicle.brand}}', group: 'Vehículo', tags: ['vehículo', 'marca'] },
  { label: 'Línea del vehículo', value: '{{sale.vehicle.line}}', group: 'Vehículo', tags: ['vehículo', 'línea', 'modelo'] },
  { label: 'Año del vehículo', value: '{{sale.vehicle.year}}', group: 'Vehículo', tags: ['vehículo', 'año'] },
  { label: 'Motor del vehículo', value: '{{sale.vehicle.engine}}', group: 'Vehículo', tags: ['vehículo', 'motor'] },
  { label: 'Ítems de la venta (tabla)', value: '{{#each sale.items}}\n<tr>\n  <td>{{qty}}</td>\n  <td>{{description}}</td>\n  <td>{{money unitPrice}}</td>\n  <td>{{money total}}</td>\n</tr>\n{{/each}}', group: 'Tablas y bucles', tags: ['tabla', 'ítems', 'venta'] },
  { label: 'Ítems de la cotización (tabla)', value: '{{#each quote.items}}\n<tr>\n  <td>{{qty}}</td>\n  <td>{{description}}</td>\n  <td>{{money total}}</td>\n</tr>\n{{/each}}', group: 'Tablas y bucles', tags: ['tabla', 'ítems', 'cotización'] },
  { label: 'Métodos de pago (tabla)', value: '{{#each sale.paymentMethods}}\n<tr>\n  <td>{{method}}</td>\n  <td>{{money amount}}</td>\n</tr>\n{{/each}}', group: 'Tablas y bucles', tags: ['tabla', 'pagos'] },
  { label: 'Helper dinero', value: '{{money value}}', group: 'Helpers', tags: ['helper', 'dinero'] },
  { label: 'Helper fecha', value: '{{date value}}', group: 'Helpers', tags: ['helper', 'fecha'] },
  { label: 'Helper mayúsculas', value: '{{uppercase text}}', group: 'Helpers', tags: ['helper', 'mayúsculas'] },
  { label: 'Helper minúsculas', value: '{{lowercase text}}', group: 'Helpers', tags: ['helper', 'minúsculas'] },
  { label: 'Helper ceros a la izquierda', value: '{{pad value 5}}', group: 'Helpers', tags: ['helper', 'ceros'] },
  { label: 'Número de orden de trabajo', value: '{{sale.workOrderNumber}}', group: 'Documento', tags: ['orden', 'trabajo'] },
  { label: 'Valor para QR (número de venta)', value: 'sale.number', group: 'Extras', tags: ['qr', 'código', 'venta'] }
];

const GROUP_ORDER = [
  'Cliente y contacto',
  'Documento',
  'Totales',
  'Empresa',
  'Vehículo',
  'Cotización',
  'Tablas y bucles',
  'Helpers',
  'Extras'
];

window.PRESETS = {
  'invoice-basic': {
    name: 'Factura r\u00E1pida',
    html: `<div class="doc">
  <h1>Factura {{sale.number}}</h1>
  <p>Cliente: {{sale.customerName}}</p>
  <table class="items">
    <thead>
      <tr><th>Cant</th><th>Descripci\u00F3n</th><th>Unit</th><th>Total</th></tr>
    </thead>
    <tbody>
      {{#each sale.items}}
      <tr>
        <td>{{qty}}</td>
        <td>{{description}}</td>
        <td>{{money unitPrice}}</td>
        <td>{{money total}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <p style="text-align:right;">Total: {{money sale.total}}</p>
</div>`,
    css: `.doc{max-width:720px;margin:0 auto;font-family:Arial,sans-serif;font-size:12px;color:#222;line-height:1.4;}
h1{font-size:20px;margin:0 0 12px;}
table.items{width:100%;border-collapse:collapse;margin-top:12px;}
table.items th,table.items td{border:1px solid #ccc;padding:6px;text-align:left;}
table.items th{background:#f1f1f1;}`
  },
  'quote-minimal': {
    name: 'Cotizaci\u00F3n minimal',
    html: `<div class="doc">
  <h1>Cotizaci\u00F3n {{quote.number}}</h1>
  <p>Cliente: {{quote.customerName}}</p>
  <p>V\u00E1lida hasta: {{date quote.validUntil}}</p>
  <ul>
    {{#each quote.items}}
    <li>{{qty}} x {{description}} - {{money total}}</li>
    {{/each}}
  </ul>
  <p style="text-align:right;">Total: {{money quote.total}}</p>
</div>`,
    css: `.doc{max-width:640px;margin:0 auto;font-family:Arial,sans-serif;font-size:12px;color:#222;}
h1{font-size:22px;margin:0 0 10px;}
ul{padding-left:18px;}
li{margin:4px 0;}`
  },
  'work-order': {
    name: 'Orden de trabajo b\u00E1sica',
    html: `<div class="doc">
  <h1>Orden de trabajo {{sale.number}}</h1>
  <p><strong>Veh\u00EDculo:</strong> {{sale.vehicle.brand}} {{sale.vehicle.line}} - Placa {{sale.vehicle.plate}}</p>
  <p><strong>Cliente:</strong> {{sale.customerName}}</p>
  <ol>
    {{#each sale.items}}
    <li>{{description}} ({{qty}}) - {{money total}}</li>
    {{/each}}
  </ol>
  <p><strong>Responsable:</strong> {{sale.attendedBy}}</p>
</div>`,
    css: `.doc{max-width:720px;margin:0 auto;font-family:Arial,sans-serif;font-size:12px;color:#222;}
h1{font-size:22px;margin:0 0 10px;}
ol{padding-left:18px;}
li{margin:4px 0;}`
  },
  'blank-canvas': {
    name: 'Lienzo en blanco',
    html: `<div class="doc">
  <h1>T\u00EDtulo del documento</h1>
  <p>Empieza a escribir aqu\u00ED.</p>
</div>`,
    css: `.doc{max-width:720px;margin:0 auto;font-family:Arial,sans-serif;font-size:12px;color:#222;line-height:1.4;}`
  }
};

const TYPE_LABELS = {
  invoice: 'Factura',
  quote: 'Cotizaci\u00F3n',
  workOrder: 'Orden de trabajo',
  sticker: 'Sticker'
};

function initFriendlyTemplates(){
  const root = document.getElementById('tab-formatos');
  if(!root) return;

  const htmlField = document.getElementById('tpl-html');
  const cssField = document.getElementById('tpl-css');
  const msgBox = document.getElementById('tpl-msg');
  const varsBox = document.getElementById('tpl-vars');
  const searchInput = document.getElementById('tpl-var-search');
  const searchResults = document.getElementById('tpl-var-search-results');
  const presetPanel = document.getElementById('tpl-quick-presets');
  const nameInput = document.getElementById('tpl-name');
  const typeSelect = document.getElementById('tpl-editor-type');
  const modeToggle = document.getElementById('tpl-mode-toggle');

  if(!htmlField || !varsBox) return;

  const categories = buildGroupedCatalog();
  renderCatalog(varsBox, categories);
  attachVariableCards(varsBox, msgBox);

  if(searchInput && searchResults){
    searchInput.addEventListener('input', ()=> renderSearch(searchInput, searchResults, msgBox));
    renderSearch(searchInput, searchResults, msgBox);
  }

  if(presetPanel){
    presetPanel.addEventListener('click', event=>{
      const btn = event.target.closest('.tpl-preset');
      if(!btn) return;
      const preset = PRESETS[btn.dataset.preset];
      if(!preset) return;
      if(htmlField.value.trim().length && !confirm('Esto reemplazará el contenido actual. ¿Continuar?')) return;
      htmlField.value = preset.html;
      if(cssField) cssField.value = preset.css;
      if(msgBox) msgBox.textContent = `Plantilla base "${preset.name}" cargada`;
      setStep(2);
      updateSelectionChip();
    });
  }

  if(nameInput) nameInput.addEventListener('input', updateSelectionChip);
  if(typeSelect) typeSelect.addEventListener('change', updateSelectionChip);

  if(modeToggle){
    modeToggle.addEventListener('click', ()=> setTimeout(updateSelectionChip, 120));
  }
  document.addEventListener('click', event=>{
    if(event.target.closest('.tpl-edit') || event.target.closest('#tpl-new') || event.target.closest('#tpl-dup') || event.target.closest('#tpl-save')){
      setTimeout(updateSelectionChip, 120);
    }
  });

  htmlField.addEventListener('input', ()=> setStep(htmlField.value.trim() ? 2 : 1));
  if(cssField) cssField.addEventListener('input', ()=> setStep(cssField.value.trim() ? 2 : 1));

  updateSelectionChip();
  setStep(1);
}

function buildGroupedCatalog(){
  const grouped = {};
  VAR_CATALOG.forEach(item=>{
    const key = item.group || 'Otros';
    if(!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });
  const ordered = GROUP_ORDER.concat(Object.keys(grouped).filter(key => GROUP_ORDER.indexOf(key) === -1));
  return ordered
    .map(group => ({ group, items: grouped[group] }))
    .filter(entry => entry.items && entry.items.length);
}

function renderCatalog(container, categories){
  const content = categories.map(({ group, items })=>{
    const cards = items.map(renderVarCard).join('');
    return `<details class="var-group" open><summary style="cursor:pointer;font-weight:600;">${escapeHtml(group)}</summary><div class="var-group-body">${cards}</div></details>`;
  }).join('');
  container.innerHTML = content;
}

function renderVarCard(item){
  const label = escapeHtml(item.label || 'Variable');
  const value = escapeHtml(item.value || '');
  return `<div class="var-card var-item" data-insert="${value}" data-label="${label}" style="border:1px solid var(--border-color);background:#fff;border-radius:6px;padding:6px 8px;margin:4px 0;cursor:pointer;">
    <div style="font-weight:600;font-size:12px;">${label}</div>
    <code style="font-size:11px;display:block;margin-top:4px;word-break:break-all;">${value}</code>
    <div class="muted" style="font-size:10px;margin-top:2px;">Clic para insertar o copiar</div>
  </div>`;
}

function attachVariableCards(container, msgBox){
  container.querySelectorAll('[data-insert]').forEach(card=>{
    card.addEventListener('click', ()=>{
      insertVariable(card.dataset.insert);
      if(msgBox) msgBox.textContent = `Insertado: ${card.dataset.label || card.dataset.insert}`;
      setStep(3);
    });
  });
}

function renderSearch(input, resultsBox, msgBox){
  const term = input.value.trim().toLowerCase();
  if(!term){
    resultsBox.innerHTML = '<div class="muted" style="font-size:12px;">Escribe lo que necesitas para ver sugerencias.</div>';
    return;
  }
  const hits = VAR_CATALOG.filter(item=>{
    const haystack = (item.label + ' ' + item.value + ' ' + (item.tags || []).join(' ')).toLowerCase();
    return haystack.includes(term);
  }).slice(0, 20);

  if(!hits.length){
    resultsBox.innerHTML = '<div class="muted" style="font-size:12px;">Sin coincidencias.</div>';
    return;
  }
  resultsBox.innerHTML = hits.map(renderVarCard).join('');
  attachVariableCards(resultsBox, msgBox);
}

function insertVariable(text){
  if(!text) return;
  const htmlField = document.getElementById('tpl-html');
  const active = document.activeElement;
  const target = active && typeof active.value === 'string' && !active.readOnly && !active.disabled && active !== document.getElementById('tpl-var-search')
    ? active
    : htmlField;
  insertAtCursor(target, text);
  if(window.navigator && navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).catch(()=>{});
  }
}

function insertAtCursor(field, text){
  if(!field || typeof field.value !== 'string') return;
  const start = field.selectionStart !== undefined ? field.selectionStart : field.value.length;
  const end = field.selectionEnd !== undefined ? field.selectionEnd : field.value.length;
  const before = field.value.substring(0, start);
  const after = field.value.substring(end);
  field.value = before + text + after;
  const pos = start + text.length;
  if(field.setSelectionRange){
    field.setSelectionRange(pos, pos);
  }
  field.focus();
}

function setStep(step){
  const items = document.querySelectorAll('.tpl-step-item');
  items.forEach((el, index)=>{
    if(index <= step - 1){
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

function updateSelectionChip(){
  const chip = document.getElementById('tpl-selected-info');
  const typeSelect = document.getElementById('tpl-editor-type');
  const nameInput = document.getElementById('tpl-name');
  if(!chip) return;
  const typeLabel = TYPE_LABELS[typeSelect?.value] || typeSelect?.value || 'Formato';
  const nameValue = nameInput ? nameInput.value.trim() : '';
  chip.textContent = `${nameValue || 'Sin nombre'} - ${typeLabel}`;
  chip.title = `Tipo: ${typeLabel}`;
}

function escapeHtml(str = ''){
  return str.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}

document.addEventListener('DOMContentLoaded', initFriendlyTemplates);
