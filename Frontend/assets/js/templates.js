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
    theme: { primary:'#222222', accent:'#0055aa', font:'Arial, sans-serif', baseSize:12 },
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
      const groupId = 'grp-'+group;
      parts.push(`<details class='var-group' open><summary style='cursor:pointer;font-weight:600;'>${group}</summary><div id='${groupId}'></div></details>`);
    });
    box.innerHTML = parts.join('');
    // Insert vars inside their group containers
    Object.entries(VAR_GROUPS).forEach(([group, vars])=>{
      const groupBox = box.querySelector('#grp-'+group);
      if(!groupBox) return;
      groupBox.innerHTML = vars.map(v=>{
        return `<div class='click var-item' data-insert='${v}' style='padding:2px 4px;border-radius:3px;font-size:11px;'><code>${v}</code></div>`;
      }).join('');
    });
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
      // Nuevos controles de contexto
      const sampleTypeSel = qs('tpl-sample-type');
      const sampleIdInput = qs('tpl-sample-id');
      const sampleType = sampleTypeSel ? sampleTypeSel.value || null : null;
      const sampleId = sampleIdInput ? (sampleIdInput.value.trim() || null) : null;
      const resp = await API.templates.preview({ type, contentHtml, contentCss, sampleType, sampleId }).catch(()=>null);
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
    // Añadir botones nuevos si no existen (cliente, vehículo, totales)
    (function ensureExtraButtons(){
      const bar = qs('tpl-visual-editor')?.querySelector('.row .row');
      if(!bar) return;
      const createBtn=(id,label,handler)=>{ if(qs(id)) return; const b=document.createElement('button'); b.id=id; b.className='small secondary'; b.textContent=label; b.addEventListener('click',handler); bar.appendChild(b); };
      createBtn('tpl-add-customer','Cliente', ()=> addBlock({ kind:'customer' }));
      createBtn('tpl-add-vehicle','Vehículo', ()=> addBlock({ kind:'vehicle' }));
      createBtn('tpl-add-totals','Totales', ()=> addBlock({ kind:'totals' }));
      createBtn('tpl-add-qr','QR', ()=> addBlock({ kind:'qr', variable:'sale.number' }));
      createBtn('tpl-add-sign','Firma', ()=> addBlock({ kind:'signature', label:'Firma Cliente' }));
      createBtn('tpl-add-payments','Pagos', ()=> addBlock({ kind:'paymentsSummary' }));
      createBtn('tpl-add-cols2','2 Cols', ()=> addBlock({ kind:'twoColumns', left:'Columna izquierda', right:'Columna derecha' }));
    })();
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
    // Inject context selector controls if not present
    const toolbar = qs('tpl-editor-toolbar') || document.querySelector('#tpl-editor-title')?.parentElement;
    if(toolbar && !qs('tpl-sample-type')){
      const wrap = document.createElement('div');
      wrap.style.display='flex'; wrap.style.flexWrap='wrap'; wrap.style.gap='6px'; wrap.style.margin='6px 0';
      wrap.innerHTML = `
        <label style='font-size:11px;display:flex;flex-direction:column;'>Doc contexto
          <select id='tpl-sample-type' style='min-width:130px;'>
            <option value=''>Auto</option>
            <option value='sale'>Venta</option>
            <option value='quote'>Cotización</option>
            <option value='order'>Pedido</option>
            <option value='item'>Item</option>
          </select>
        </label>
        <label style='font-size:11px;display:flex;flex-direction:column;'>ID específico
          <input id='tpl-sample-id' placeholder='Opcional _id Mongo' style='min-width:220px;font-size:12px;' />
        </label>
        <fieldset style='display:flex;gap:6px;align-items:flex-end;border:1px solid var(--border-color);padding:4px;'>
          <legend style='font-size:11px;'>Theme</legend>
          <label style='font-size:10px;'>Primario<input type='color' id='tpl-th-primary' value='#222222' style='width:48px;padding:0;border:0;'></label>
          <label style='font-size:10px;'>Acento<input type='color' id='tpl-th-accent' value='#0055aa' style='width:48px;padding:0;border:0;'></label>
          <label style='font-size:10px;'>Font<select id='tpl-th-font' style='font-size:11px;'><option value='Arial, sans-serif'>Arial</option><option value="'Segoe UI',sans-serif">Segoe</option><option value='Tahoma, sans-serif'>Tahoma</option><option value='Courier New, monospace'>Courier</option></select></label>
          <label style='font-size:10px;'>Base px<input type='number' id='tpl-th-size' value='12' min='9' max='20' style='width:60px;font-size:11px;'></label>
        </fieldset>`;
      toolbar.parentElement.insertBefore(wrap, toolbar.nextSibling);
      wrap.addEventListener('change', e=>{
        state.theme.primary = qs('tpl-th-primary').value;
        state.theme.accent = qs('tpl-th-accent').value;
        state.theme.font = qs('tpl-th-font').value;
        state.theme.baseSize = parseInt(qs('tpl-th-size').value)||12;
      });
    }
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
      el.draggable = true;
      el.innerHTML = renderBlockLabel(b);
      el.addEventListener('click',()=> editBlock(b.id));
      el.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/plain', b.id); el.style.opacity='0.4'; });
      el.addEventListener('dragend', ()=>{ el.style.opacity='1'; });
      el.addEventListener('dragover', (e)=>{ e.preventDefault(); el.style.outline='2px dashed var(--primary-color)'; });
      el.addEventListener('dragleave', ()=>{ el.style.outline='none'; });
      el.addEventListener('drop', (e)=>{ e.preventDefault(); el.style.outline='none'; const src=e.dataTransfer.getData('text/plain'); if(src && src!==b.id){ reorderBlock(src, b.id); } });
      canvas.appendChild(el);
    });
  }

  function reorderBlock(srcId, targetId){
    const a=state.blocks; const from=a.findIndex(x=>x.id===srcId); const to=a.findIndex(x=>x.id===targetId); if(from<0||to<0) return; const [blk]=a.splice(from,1); a.splice(to,0,blk); renderCanvas(); }

  function renderBlockLabel(b){
    switch(b.kind){
      case 'title': return `<strong>🅣 ${escapeHtml(b.text||'Título')}</strong>`;
      case 'text': return `🅟 ${(escapeHtml(shorten(b.text||'',60))||'(texto)')}`;
      case 'logo': return '🖼 Logo empresa ({{company.logoUrl}})';
      case 'itemsTable': return '📋 Tabla de Items';
      case 'customer': return '👤 Datos Cliente';
      case 'vehicle': return '🚗 Datos Vehículo';
      case 'totals': return 'Σ Totales';
      case 'qr': return '🔳 QR '+escapeHtml(b.variable||'variable');
      case 'signature': return '✍️ '+escapeHtml(b.label||'Firma');
      case 'paymentsSummary': return '💲 Resumen Pagos';
      case 'twoColumns': return '⬛⬛ Dos Columnas';
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
    if(b.kind==='itemsTable') inner += `<div class='muted' style='font-size:12px;'>Tabla dinámica de items de venta / cotización. Columnas fijas.</div>`;
    if(b.kind==='logo') inner += `<div class='muted' style='font-size:12px;'>Muestra el logo de la empresa si existe.</div>`;
    if(b.kind==='customer') inner += `<div class='muted' style='font-size:12px;'>Se rellena con datos del cliente: nombre, teléfono, email si existen.</div>`;
    if(b.kind==='vehicle') inner += `<div class='muted' style='font-size:12px;'>Incluye placa, marca, línea, motor y año del vehículo si están disponibles.</div>`;
    if(b.kind==='totals') inner += `<div class='muted' style='font-size:12px;'>Muestra subtotal y total de la venta / cotización.</div>`;
    if(b.kind==='qr') inner += `<div style='font-size:12px;' class='muted'>Genera un QR de la variable. Ej: sale.number, item.sku, company.name</div><label style='font-size:11px;'>Variable<input id='blk-var' value='${escapeHtml(b.variable||'sale.number')}' style='width:100%;font-size:12px;'/></label>`;
    if(b.kind==='signature') inner += `<div class='muted' style='font-size:12px;'>Línea de firma con etiqueta personalizable.</div><label style='font-size:11px;'>Etiqueta<input id='blk-label' value='${escapeHtml(b.label||'Firma Cliente')}' style='width:100%;font-size:12px;'/></label>`;
    if(b.kind==='paymentsSummary') inner += `<div class='muted' style='font-size:12px;'>Lista cada método de pago (sale.paymentMethods) y muestra total.</div>`;
    if(b.kind==='twoColumns') inner += `<div class='muted' style='font-size:12px;'>Dos columnas de texto independientes.</div><label style='font-size:11px;'>Izquierda<textarea id='blk-left' style='width:100%;height:50px;font-size:12px;'>${escapeHtml(b.left||'')}</textarea></label><label style='font-size:11px;'>Derecha<textarea id='blk-right' style='width:100%;height:50px;font-size:12px;'>${escapeHtml(b.right||'')}</textarea></label>`;
    if(b.kind==='title' || b.kind==='text'){
      inner += `<fieldset style='margin-top:8px;border:1px solid var(--border-color);padding:4px;'><legend style='font-size:11px;'>Estilos</legend>
        <label style='font-size:11px;'>Alineación <select id='blk-align'><option value='left'>Izquierda</option><option value='center'>Centro</option><option value='right'>Derecha</option></select></label>
        <label style='font-size:11px;'>Tamaño <select id='blk-size'><option value='normal'>Normal</option><option value='small'>Pequeño</option><option value='big'>Grande</option></select></label>
      </fieldset>`;
    }
    inner += `<div class='row' style='margin-top:8px;gap:6px;justify-content:flex-end;'><button id='blk-del' class='danger small'>Borrar</button><button id='blk-ok' class='small'>Cerrar</button></div>`;
    body.innerHTML = inner;
    document.body.appendChild(panel);
    panel.querySelector('.close').onclick = ()=> panel.remove();
    if((b.kind==='title'||b.kind==='text') && b.style){
      const a = panel.querySelector('#blk-align'); const s = panel.querySelector('#blk-size');
      if(a) a.value = b.style.align||'left'; if(s) s.value = b.style.size||'normal';
    }
    panel.querySelector('#blk-ok').onclick = ()=>{ 
      if(b.kind==='title'||b.kind==='text'){ 
        b.text = panel.querySelector('#blk-text').value; 
        b.style = { align: panel.querySelector('#blk-align')?.value||'left', size: panel.querySelector('#blk-size')?.value||'normal' };
        renderCanvas(); 
      } else if(b.kind==='qr') {
        b.variable = panel.querySelector('#blk-var').value.trim()||'sale.number';
        renderCanvas();
      } else if(b.kind==='signature') {
        b.label = panel.querySelector('#blk-label').value.trim()||'Firma';
        renderCanvas();
      } else if(b.kind==='twoColumns') {
        b.left = panel.querySelector('#blk-left').value;
        b.right = panel.querySelector('#blk-right').value;
        renderCanvas();
      }
      panel.remove(); 
    };
    panel.querySelector('#blk-del').onclick = ()=>{ if(confirm('¿Eliminar bloque?')){ state.blocks = state.blocks.filter(x=>x.id!==b.id); renderCanvas(); panel.remove(); } };
  }

  function buildHtmlFromBlocks(){
    let htmlParts = [];
    state.blocks.forEach(b=>{
      if(b.kind==='title' || b.kind==='text'){
        const tag = b.kind==='title' ? 'h1' : 'p';
        const clsParts = [];
        if(b.style){
          if(b.style.align && b.style.align!=='left') clsParts.push(`align-${b.style.align}`);
          if(b.style.size && b.style.size!=='normal') clsParts.push(`size-${b.style.size}`);
        }
        const cls = clsParts.length? ` class='${clsParts.join(' ')}'` : '';
        htmlParts.push(`<${tag}${cls}>${escapeHtml(b.text||'')}</${tag}>`);
      }
      else if(b.kind==='logo'){ htmlParts.push(`<div class='logo-box'>{{#if company.logoUrl}}<img class='logo' src='{{company.logoUrl}}' alt='logo'>{{/if}}</div>`); }
      else if(b.kind==='itemsTable'){
        htmlParts.push(`<table class='items'>\n<thead><tr><th>Cant</th><th>Descripción</th><th>Unit</th><th>Total</th></tr></thead>\n<tbody>{{#each sale.items}}<tr><td>{{qty}}</td><td>{{description}}</td><td>{{money unitPrice}}</td><td>{{money total}}</td></tr>{{/each}}</tbody>\n</table>`);
      }
      else if(b.kind==='customer'){
        htmlParts.push(`<div class='customer-box'><strong>Cliente:</strong> {{sale.customerName}} {{#if sale.customerPhone}}Tel: {{sale.customerPhone}}{{/if}} {{#if sale.customerEmail}}Email: {{sale.customerEmail}}{{/if}}</div>`);
      }
      else if(b.kind==='vehicle'){
        htmlParts.push(`<div class='vehicle-box'><strong>Vehículo:</strong> {{sale.vehicle.plate}} {{sale.vehicle.brand}} {{sale.vehicle.line}} {{sale.vehicle.engine}} {{sale.vehicle.year}}</div>`);
      }
      else if(b.kind==='totals'){
        htmlParts.push(`<div class='totals-box'><table class='totals'><tbody><tr><td>Subtotal</td><td>{{money sale.subtotal}}</td></tr><tr><td><strong>Total</strong></td><td><strong>{{money sale.total}}</strong></td></tr></tbody></table></div>`);
      }
      else if(b.kind==='qr'){
        // Placeholder: genera contenedor con data-var; script liviano inline puede reemplazarse server side.
        htmlParts.push(`<div class='qr-box' data-var='${escapeHtml(b.variable||'sale.number')}'><canvas class='qr-canvas'></canvas></div>`);
      }
      else if(b.kind==='signature'){
        htmlParts.push(`<div class='sign-box'><div class='sign-line'></div><div class='sign-label'>${escapeHtml(b.label||'Firma')}</div></div>`);
      }
      else if(b.kind==='paymentsSummary'){
        htmlParts.push(`<div class='payments-box'><table class='payments'><thead><tr><th>Método</th><th>Valor</th></tr></thead><tbody>{{#each sale.paymentMethods}}<tr><td>{{method}}</td><td>{{money amount}}</td></tr>{{/each}}<tr><td style='font-weight:600;'>Total</td><td style='font-weight:600;'>{{money sale.total}}</td></tr></tbody></table></div>`);
      }
      else if(b.kind==='twoColumns'){
        htmlParts.push(`<div class='cols2'><div class='col left'>${escapeHtml(b.left||'')}</div><div class='col right'>${escapeHtml(b.right||'')}</div></div>`);
      }
    });
    const css = `:root{--th-primary:${state.theme.primary};--th-accent:${state.theme.accent};--th-font:${state.theme.font};--th-base:${state.theme.baseSize}px;} body{font-family:var(--th-font);font-size:var(--th-base);} .logo{max-height:60px;} .logo-box{margin-bottom:12px;} table.items{width:100%;border-collapse:collapse;margin:10px 0;} table.items th{background:var(--th-primary);color:#fff;} table.items th,table.items td{border:1px solid #ccc;padding:4px;font-size:12px;text-align:left;} h1{margin:4px 0 10px;font-size:20px;color:var(--th-accent);} .customer-box,.vehicle-box,.totals-box{margin:6px 0;font-size:12px;} table.totals td{padding:2px 6px;font-size:12px;} .align-center{text-align:center;} .align-right{text-align:right;} .size-small{font-size:11px;} .size-big{font-size:22px;} .qr-box{display:inline-block;padding:4px;border:1px solid #999;margin:4px;} .qr-box canvas{width:80px;height:80px;} .sign-box{margin-top:24px;text-align:center;font-size:12px;} .sign-line{border-top:1px solid #000;margin:0 auto 4px;height:0;width:180px;} .sign-label{font-style:italic;} .payments-box{margin:8px 0;} table.payments{width:100%;border-collapse:collapse;font-size:12px;} table.payments th{background:var(--th-primary);color:#fff;} table.payments th,table.payments td{border:1px solid #ccc;padding:3px 4px;text-align:left;} .cols2{display:flex;gap:12px;} .cols2 .col{flex:1;font-size:12px;}`;
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
