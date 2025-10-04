// Template Editor Frontend Logic (MVP)
// Depends on api.js (API.templates namespace) and shared util patterns.
// Provides: list, create/update, preview, activate, variable insertion helpers.

// Converted to ES module wrapper: executes immediately.
(function(){
  const state = {
    templates: [],
    editing: null, // current template object (may be unsaved)
    mode: 'code', // 'code' | 'visual'
    blocks: [], // visual blocks
    selectedBlockId: null,
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
    // Reset visual canvas when loading existing
    state.blocks = [];
    renderCanvas();
  }

  async function saveTemplate(activate){
    if(!state.editing) return;
    // Si estamos en modo visual, sincronizar HTML/CSS generados antes de leer payload
    if(state.mode==='visual'){
      const built = buildHtmlFromBlocks();
      qs('tpl-html').value = built.html;
      // Insertar CSS base sólo si el usuario no ha agregado nada
      if(!qs('tpl-css').value.trim()) qs('tpl-css').value = built.css;
    }
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
      const contentHtml = qs('tpl-html').value;
      const contentCss = qs('tpl-css').value;
      const resp = await API.templates.preview({ type, contentHtml, contentCss }).catch(()=>null);
      let docHtml;
      if(resp && resp.rendered){
        docHtml = `<html><head><style>${resp.css||''}</style></head><body>${resp.rendered}</body></html>`;
      } else {
        docHtml = `<html><head><style>${contentCss}</style></head><body>${contentHtml}</body></html>`;
      }
      qs('tpl-preview-frame').srcdoc = docHtml;
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
    // Visual mode toggle
    const toggle = qs('tpl-mode-toggle');
    toggle && toggle.addEventListener('click', ()=>{
      if(state.mode === 'code'){
        // Pasar a visual: intentar parsear HTML simple a bloques si está vacío el canvas
        if(state.blocks.length === 0){ attemptImportHtml(); }
        state.mode = 'visual';
      } else {
        if(state.blocks.length && !confirm('Al salir del modo visual se regenerará el HTML. Continuar?')) return;
        // Generar HTML desde blocks
        const { html, css } = buildHtmlFromBlocks();
        if(!qs('tpl-html').value.trim() || confirm('¿Reemplazar el HTML actual con el generado visual?')){
          qs('tpl-html').value = html;
          if(!qs('tpl-css').value.trim()) qs('tpl-css').value = css;
        }
        state.mode = 'code';
      }
      applyMode();
    });
    // Bloques: botones agregar
    on(qs('tpl-add-title'),'click', ()=> addBlock({ kind:'title', text:'Título Principal'}));
    on(qs('tpl-add-text'),'click', ()=> addBlock({ kind:'text', text:'Parrafo de ejemplo. Haz click para editar.' }));
    on(qs('tpl-add-logo'),'click', ()=> addBlock({ kind:'logo' }));
    on(qs('tpl-add-table'),'click', ()=> addBlock({ kind:'itemsTable', columns:['Cant','Descripción','Unit','Total'] }));
    on(qs('tpl-clear-canvas'),'click', ()=>{ if(confirm('¿Vaciar diseño visual?')){ state.blocks=[]; renderCanvas(); }});
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
    applyMode();
  }

  // Basic tab activation observer (depends on existing nav script). If tabs code triggers custom event, listen. Else run on DOMContentLoaded.
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initWhenVisible);
  } else {
    initWhenVisible();
  }
  // ====== Visual Editor Logic ======
  function applyMode(){
    const visualBox = qs('tpl-visual-editor');
    const htmlLabel = document.querySelector('label[for="tpl-html"]');
    const modeLabel = qs('tpl-mode-label');
    if(state.mode === 'visual'){
      visualBox?.classList.remove('hidden');
      qs('tpl-html').style.opacity = '0.25';
      qs('tpl-html').disabled = true;
      qs('tpl-css').disabled = false;
      modeLabel.textContent = 'Visual';
    } else {
      visualBox?.classList.add('hidden');
      qs('tpl-html').style.opacity = '1';
      qs('tpl-html').disabled = false;
      qs('tpl-css').disabled = false;
      modeLabel.textContent = 'Código';
    }
  }

  function addBlock(block){
    block.id = 'b'+Math.random().toString(36).slice(2,8);
    state.blocks.push(block);
    renderCanvas();
  }

  function renderCanvas(){
    const canvas = qs('tpl-canvas');
    if(!canvas) return;
    const empty = qs('tpl-canvas-empty');
    empty && (empty.style.display = state.blocks.length? 'none':'block');
    canvas.querySelectorAll('.vblock').forEach(el=> el.remove());
    state.blocks.forEach(b=>{
      const el = document.createElement('div');
      el.className = 'vblock';
      el.style.border = '1px solid var(--border-color)';
      el.style.padding = '6px';
      el.style.background = '#fff';
      el.style.cursor='pointer';
      el.dataset.id = b.id;
      el.innerHTML = renderBlockLabel(b);
      el.addEventListener('click',()=> editBlock(b.id));
      canvas.appendChild(el);
    });
  }

  function renderBlockLabel(b){
    switch(b.kind){
      case 'title': return `<strong>🅣 ${escapeHtml(b.text||'Título')}</strong>`;
      case 'text': return `🅟 ${(escapeHtml(shorten(b.text||'',60))||'(texto)')}`;
      case 'logo': return '🖼 Logo empresa ({{company.logoUrl}})';
      case 'itemsTable': return '📋 Tabla de Items';
      default: return b.kind;
    }
  }

  function editBlock(id){
    const b = state.blocks.find(x=>x.id===id); if(!b) return;
    const panel = document.createElement('div');
    panel.className='card';
    panel.style.position='fixed'; panel.style.top='20px'; panel.style.right='20px'; panel.style.maxWidth='320px'; panel.style.zIndex='9999';
    panel.innerHTML = `<div class='row between' style='align-items:center;'><strong>Editar bloque</strong><button class='close small'>&times;</button></div><div id='blk-body' style='margin-top:6px;font-size:12px;'></div>`;
    const body = panel.querySelector('#blk-body');
    let inner='';
    if(b.kind==='title' || b.kind==='text'){
      inner += `<label style='font-weight:600;'>Contenido</label><textarea id='blk-text' style='width:100%;height:80px;'>${escapeHtml(b.text||'')}</textarea>`;
      inner += `<div style='margin-top:4px;font-size:11px;' class='muted'>Puedes insertar variables haciendo click en la lista a la derecha.</div>`;
    }
    if(b.kind==='itemsTable'){
      inner += `<div class='muted' style='font-size:12px;'>Tabla dinámica de items de venta / cotización. Columnas fijas.</div>`;
    }
    if(b.kind==='logo'){
      inner += `<div class='muted' style='font-size:12px;'>Muestra el logo de la empresa si está configurado.</div>`;
    }
    inner += `<div class='row' style='margin-top:8px;gap:6px;justify-content:flex-end;'><button id='blk-del' class='danger small'>Borrar</button><button id='blk-ok' class='small'>Cerrar</button></div>`;
    body.innerHTML = inner;
    document.body.appendChild(panel);
    panel.querySelector('.close').onclick = ()=> panel.remove();
    panel.querySelector('#blk-ok').onclick = ()=>{ if(b.kind==='title'||b.kind==='text'){ b.text = panel.querySelector('#blk-text').value; renderCanvas(); } panel.remove(); };
    panel.querySelector('#blk-del').onclick = ()=>{ if(confirm('¿Eliminar bloque?')){ state.blocks = state.blocks.filter(x=>x.id!==b.id); renderCanvas(); panel.remove(); } };
  }

  function buildHtmlFromBlocks(){
    let htmlParts = [];
    state.blocks.forEach(b=>{
      if(b.kind==='title'){ htmlParts.push(`<h1>${escapeHtml(b.text||'')}</h1>`); }
      else if(b.kind==='text'){ htmlParts.push(`<p>${escapeHtml(b.text||'')}</p>`); }
      else if(b.kind==='logo'){ htmlParts.push(`<div class='logo-box'>{{#if company.logoUrl}}<img class='logo' src='{{company.logoUrl}}' alt='logo'>{{/if}}</div>`); }
      else if(b.kind==='itemsTable'){
        htmlParts.push(`<table class='items'>\n<thead><tr><th>Cant</th><th>Descripción</th><th>Unit</th><th>Total</th></tr></thead>\n<tbody>{{#each sale.items}}<tr><td>{{qty}}</td><td>{{description}}</td><td>{{money unitPrice}}</td><td>{{money total}}</td></tr>{{/each}}</tbody>\n</table>`);
      }
    });
    const css = `.logo{max-height:60px;} .logo-box{margin-bottom:12px;} table.items{width:100%;border-collapse:collapse;margin:10px 0;} table.items th,table.items td{border:1px solid #ccc;padding:4px;font-size:12px;text-align:left;} h1{margin:4px 0 10px;font-size:20px;}`;
    return { html: htmlParts.join('\n'), css };
  }

  function attemptImportHtml(){
    const raw = qs('tpl-html').value.trim();
    if(!raw) return;
    // Intento simple: detectar h1, p, tabla items
    const blocks=[];
    const div=document.createElement('div'); div.innerHTML = raw;
    div.querySelectorAll('h1').forEach(h=> blocks.push({kind:'title', text:h.textContent||'Título'}));
    div.querySelectorAll('p').forEach(p=> blocks.push({kind:'text', text:p.textContent||''}));
    if(/sale\.items/.test(raw)) blocks.push({kind:'itemsTable', columns:['Cant','Descripción','Unit','Total']});
    if(/logoUrl/.test(raw)) blocks.push({kind:'logo'});
    if(blocks.length){ blocks.forEach(b=> b.id='b'+Math.random().toString(36).slice(2,8)); state.blocks = blocks; }
  }

  function escapeHtml(str=''){ return str.replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function shorten(s,max){ return s.length>max? s.slice(0,max-1)+'…': s; }
})();
