// Template Editor Frontend Logic (MVP)
// Depends on api.js (API.templates namespace) and shared util patterns.
// Provides: list, create/update, preview, activate, variable insertion helpers.

(function(){
  const state = {
    templates: [],
    editing: null, // current template object (may be unsaved)
    exampleSnippets: {
      invoice: `<!-- Ejemplo Factura -->\n<div class="doc">\n  <h1>Factura {{sale.number}}</h1>\n  <div class="row">Cliente: {{sale.customerName}}</div>\n  <div class="row">Fecha: {{date sale.closedAt}}</div>\n  <table class="items">\n    <thead><tr><th>Cant</th><th>Descripción</th><th>PU</th><th>Total</th></tr></thead>\n    <tbody>\n      {{#each sale.items}}\n      <tr><td>{{qty}}</td><td>{{description}}</td><td>{{money unitPrice}}</td><td>{{money total}}</td></tr>\n      {{/each}}\n    </tbody>\n  </table>\n  <h3>Total: {{money sale.total}}</h3>\n</div>`,
      quote: `<!-- Ejemplo Cotización -->\n<h1>COTIZACIÓN {{quote.number}}</h1>\n<p>Cliente: {{quote.customerName}}</p>\n<ul>\n{{#each quote.items}}<li>{{qty}} x {{description}} = {{money total}}</li>{{/each}}\n</ul>`,
      workOrder: `<!-- Ejemplo Orden de Trabajo -->\n<h1>OT {{sale.number}}</h1>\n<p>Vehículo: {{sale.vehicle.plate}} ({{sale.vehicle.brand}})</p>\n<ol>\n{{#each sale.items}}<li>{{description}} - {{money total}}</li>{{/each}}\n</ol>` ,
      sticker: `<!-- Ejemplo Sticker -->\n<div class="sticker">\n  {{company.name}} - {{sale.number}}\n  {{#each sale.items}}<div>{{description}} ({{qty}})</div>{{/each}}\n</div>`
    }
  };

  // Static variable map (will fetch context dynamic later if needed)
  const VAR_GROUPS = {
    company: ['company.name','company.address','company.phone','company.email','company.ruc'],
    sale: ['sale.number','sale.date','sale.total','sale.subtotal','sale.tax','sale.customerName','sale.customerPhone','sale.status'],
    quote: ['quote.number','quote.date','quote.total','quote.customerName','quote.validUntil'],
    loops: ['{{#each sale.items}} ... {{/each}}','{{#each quote.items}} ... {{/each}}','{{#each sale.paymentMethods}} ... {{/each}}'],
    helpers: ['{{money value}}','{{date value}}','{{uppercase text}}','{{lowercase text}}','{{pad value 5}}']
  };

  function qs(id){ return document.getElementById(id);} 
  function on(el, ev, fn){ el && el.addEventListener(ev, fn); }
  function setMsg(msg, isErr){ const box = qs('tpl-msg'); if(!box) return; box.textContent = msg||''; box.style.color = isErr? 'var(--danger-color)': 'var(--muted-color)'; }

  async function refreshList(){
    const typeFilter = qs('tpl-type-filter').value;
    try {
      const data = await API.templates.list();
      state.templates = data;
      renderList(typeFilter);
    } catch(err){ console.error(err); setMsg('Error listando plantillas', true); }
  }

  function renderList(typeFilter){
    const tbody = qs('tpl-rows');
    if(!tbody) return;
    const rows = state.templates.filter(t=> !typeFilter || t.type===typeFilter).sort((a,b)=> (a.type.localeCompare(b.type) || b.version - a.version));
    if(!rows.length){ tbody.innerHTML = '<tr><td colspan="6" class="muted">(sin resultados)</td></tr>'; return; }
    tbody.innerHTML = rows.map(t=>{
      const act = t.active? '✅':'—';
      const d = t.updatedAt? new Date(t.updatedAt).toLocaleString() : '';
      return `<tr data-id="${t._id}">
        <td>${t.type}</td><td>${t.name||''}</td><td>${t.version||1}</td><td>${act}</td><td style="font-size:11px;">${d}</td>
        <td><button class="small tpl-edit" data-id="${t._id}">Editar</button> <button class="small secondary tpl-activate" data-id="${t._id}">Activar</button></td>
      </tr>`;
    }).join('');
  }

  function loadVars(){
    const box = qs('tpl-vars');
    if(!box) return;
    const parts = [];
    Object.entries(VAR_GROUPS).forEach(([group, vars])=>{
      parts.push(`<div style="font-weight:600;margin-top:4px;">${group}</div>`);
      vars.forEach(v=>{
        const label = v.replace(/{{|}}/g,'');
        parts.push(`<div class="click var-item" data-insert="${v}"><code>${v}</code></div>`);
      });
    });
    box.innerHTML = parts.join('');
    box.querySelectorAll('.var-item').forEach(el=>{
      el.addEventListener('click', ()=> insertAtCursor(qs('tpl-html'), el.dataset.insert));
    });
  }

  function insertAtCursor(textarea, text){
    if(!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + text + after;
    const pos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.focus();
  }

  function newTemplate(){
    const type = qs('tpl-type-filter').value || 'invoice';
    state.editing = { _id:null, type, name:'', html: state.exampleSnippets[type] || '', css:'', active:false };
    bindEditing();
  }

  function duplicateActive(){
    const type = qs('tpl-type-filter').value || 'invoice';
    const actives = state.templates.filter(t=> t.type===type && t.active);
    const base = actives[0];
    if(!base){ setMsg('No hay activa para duplicar', true); return; }
    state.editing = { _id:null, type: base.type, name:(base.name||'')+' copia', html: base.html, css: base.css || '', active:false };
    bindEditing();
  }

  function bindEditing(){
    if(!state.editing) return;
    qs('tpl-editor-type').value = state.editing.type;
    qs('tpl-name').value = state.editing.name || '';
    qs('tpl-html').value = state.editing.html || '';
    qs('tpl-css').value = state.editing.css || '';
    qs('tpl-editor-title').textContent = state.editing._id? 'Editar plantilla':'Nueva plantilla';
    setMsg('');
  }

  async function saveTemplate(activate){
    if(!state.editing) return;
    const payload = {
      type: qs('tpl-editor-type').value,
      name: qs('tpl-name').value.trim() || undefined,
      html: qs('tpl-html').value,
      css: qs('tpl-css').value
    };
    try {
      let saved;
      if(state.editing._id){
        saved = await API.templates.update(state.editing._id, payload);
      } else {
        saved = await API.templates.create(payload);
      }
      state.editing = saved;
      if(activate){
        await API.templates.activate(saved._id);
        setMsg('Guardado y activado');
      } else {
        setMsg('Guardado');
      }
      await refreshList();
      bindEditing();
    } catch(err){ console.error(err); setMsg('Error guardando', true); }
  }

  async function previewTemplate(){
    if(!state.editing) return;
    const type = qs('tpl-editor-type').value;
    try {
      const html = qs('tpl-html').value;
      const css = qs('tpl-css').value;
      // We'll call preview endpoint with temporary content (need backend support to override? currently preview expects stored template) -> fallback: client side inline assembly
      // For MVP: if editing existing saved template, ask server; else render locally skeleton.
      let docHtml;
      if(state.editing._id){
        docHtml = await API.templates.preview(state.editing._id, { sample: true }).catch(()=> null);
      }
      if(!docHtml){
        docHtml = `<html><head><style>${css}</style></head><body>${html}</body></html>`;
      }
      const frame = qs('tpl-preview-frame');
      frame.srcdoc = docHtml;
      setMsg('Vista previa actualizada');
    } catch(err){ console.error(err); setMsg('Error en vista previa', true); }
  }

  async function activateTemplate(id){
    try { await API.templates.activate(id); setMsg('Activada'); await refreshList(); } catch(err){ console.error(err); setMsg('Error activando', true);} }

  async function loadTemplate(id){
    try { const t = await API.templates.get(id); state.editing = t; bindEditing(); setMsg('Plantilla cargada'); }
    catch(err){ console.error(err); setMsg('Error cargando', true);} }

  function attachEvents(){
    on(qs('tpl-refresh'),'click', refreshList);
    on(qs('tpl-type-filter'),'change', refreshList);
    on(qs('tpl-new'),'click', newTemplate);
    on(qs('tpl-dup'),'click', duplicateActive);
    on(qs('tpl-save'),'click', ()=> saveTemplate(false));
    on(qs('tpl-save-activate'),'click', ()=> saveTemplate(true));
    on(qs('tpl-preview'),'click', previewTemplate);
    on(qs('tpl-insert-item-loop'),'click', ()=> insertAtCursor(qs('tpl-html'), '{{#each sale.items}}\n<tr><td>{{qty}}</td><td>{{description}}</td><td>{{money unitPrice}}</td><td>{{money total}}</td></tr>\n{{/each}}'));
    document.addEventListener('click', (e)=>{
      const editBtn = e.target.closest('.tpl-edit');
      if(editBtn){ loadTemplate(editBtn.dataset.id); }
      const actBtn = e.target.closest('.tpl-activate');
      if(actBtn){ activateTemplate(actBtn.dataset.id); }
    });
    on(qs('tpl-editor-type'),'change', ()=>{ if(state.editing){ state.editing.type = qs('tpl-editor-type').value; }});
  }

  function ensureExampleSnippet(){
    const pre = qs('tpl-example-box');
    if(!pre) return;
    const typeSel = qs('tpl-editor-type');
    function update(){ pre.textContent = state.exampleSnippets[typeSel.value] || '—'; }
    on(typeSel,'change', update);
    update();
  }

  function initWhenVisible(){
    // Initialize only if the formatos tab exists
    if(!qs('tab-formatos')) return;
    loadVars();
    attachEvents();
    ensureExampleSnippet();
    refreshList();
  }

  // Basic tab activation observer (depends on existing nav script). If tabs code triggers custom event, listen. Else run on DOMContentLoaded.
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initWhenVisible);
  } else {
    initWhenVisible();
  }
})();
