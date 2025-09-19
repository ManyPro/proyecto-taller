import { API, authToken } from "./api.js";

const DEFAULT_CERT = {
  name: "Cambio de Aceite Certificado",
  key: "CAMBIO_ACEITE_CERT",
  variables: [
    { key:"VISCOSIDAD",    label:"Viscosidad", type:"text",   defaultValue:"5W-30" },
    { key:"ACEITE_CERT",   label:"Aceite certificado", type:"number", defaultValue:0 },
    { key:"ACEITE_SELLADO",label:"Aceite sellado",    type:"number", defaultValue:0 },
    { key:"FILTRO_AIRE",   label:"Filtro de aire",    type:"number", defaultValue:0 },
    { key:"FILTRO_ACEITE", label:"Filtro de aceite",  type:"number", defaultValue:0 },
    { key:"MO",            label:"Mano de obra",      type:"number", defaultValue:0 }
  ],
  // Para el certificado, usualmente cuenta ACEITE_CERT
  formula: "ACEITE_CERT + FILTRO_ACEITE + FILTRO_AIRE + MO"
};

const $ = (s) => document.querySelector(s);
const money = (n)=>'$'+Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');

function openModal() {
  const modal = $('#modal'); if (!modal) return;
  modal.classList.remove('hidden');
  const onKey = (e)=>{ if (e.key === 'Escape') closeModal(); };
  const onOverlay = (e)=>{ if (e.target === modal) closeModal(); };
  document.addEventListener('keydown', onKey);
  modal.addEventListener('click', onOverlay, { once:true });
  document.body.style.overflow = 'hidden';
  return () => document.removeEventListener('keydown', onKey);
}
function closeModal() {
  const modal = $('#modal'); if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}
function normalizeNumber(v){
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\s+/g,'').replace(/\$/g,'').replace(/\./g,'').replace(/,/g,'.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function safeEvalFront(expr, vars = {}) {
  const cleaned = String(expr || '').trim().toUpperCase();
  if (!cleaned) return 0;
  if (!/^[\d+\-*/().\sA-Z0-9_]+$/.test(cleaned)) return 0;
  const replaced = cleaned.replace(/[A-Z_][A-Z0-9_]*/g, (k) => {
    const v = Number(vars[k] ?? 0);
    return Number.isFinite(v) ? String(v) : '0';
  });
  try { return Function(`"use strict"; return (${replaced});`)(); } catch { return 0; }
}

export function initPrices(){
  const tab = $('#tab-precios'); if(!tab) return;

  const svcSelect = $('#svc-select');
  const svcVarsBtn= $('#svc-vars');
  const svcNewBtn = $('#svc-new');

  const fBrand  = $('#pf-brand');
  const fLine   = $('#pf-line');
  const fEngine = $('#pf-engine');
  const fYear   = $('#pf-year');
  const fSearch = $('#pf-search');
  const fClear  = $('#pf-clear');
  const btnNew  = $('#pe-new');

  const head = $('#pe-head');
  const body = $('#pe-body');

  // Barra de filtros (inyectamos acciones necesarias)
  const filtersBar = document.getElementById('filters-bar') || svcSelect?.closest('.row') || tab;
  const btnImport = document.createElement('button');
  btnImport.id = 'pe-import'; btnImport.className = 'secondary'; btnImport.textContent = 'Importar XLSX';
  const btnExport = document.createElement('button');
  btnExport.id = 'pe-export'; btnExport.className = 'secondary'; btnExport.textContent = 'Exportar CSV';
  const btnRename = document.createElement('button');
  btnRename.id = 'svc-rename'; btnRename.className = 'secondary'; btnRename.textContent = 'Renombrar servicio';
  const btnClearAll = document.createElement('button');
  btnClearAll.id = 'svc-clear'; btnClearAll.className = 'danger'; btnClearAll.textContent = 'Vaciar servicio';

  filtersBar?.appendChild(btnImport);
  filtersBar?.appendChild(btnExport);
  filtersBar?.appendChild(btnRename);
  filtersBar?.appendChild(btnClearAll);

  let services = [];
  let currentService = null;

  function renderSvcOptions(){
    if (!svcSelect) return;
    svcSelect.innerHTML = (services||[]).map(s=>`<option value="${s._id}">${s.name}</option>`).join('');
  }

  function renderTableHeader(){
    if(!currentService){ head.innerHTML=''; return; }
    const vars = currentService.variables || [];
    head.innerHTML = `
      <tr>
        <th>Marca</th><th>Línea</th><th>Motor</th><th>Año</th>
        ${vars.map(v=>`<th>${v.label}</th>`).join('')}
        <th>Total</th><th></th>
      </tr>`;
  }

  function rowToHTML(r){
    const vars = currentService.variables || [];
    const cells = vars.map(v=>{
      const val = (r.variables && r.variables[v.key]) ?? v.defaultValue ?? (v.type==='number'?0:'');
      const type = v.type === 'text' ? 'text' : 'number';
      const step = v.type === 'number' ? '0.01' : null;
      return `<td><input data-k="${v.key}" type="${type}" ${step?'step="'+step+'"':''} value="${val ?? ''}"></td>`;
    }).join('');
    return `
      <tr data-id="${r._id || ''}">
        <td><input data-f="brand"  value="${r.brand||''}"></td>
        <td><input data-f="line"   value="${r.line||''}"></td>
        <td><input data-f="engine" value="${r.engine||''}"></td>
        <td><input data-f="year"   type="number" value="${r.year||''}"></td>
        ${cells}
        <td class="t">${money(r.total||0)}</td>
        <td class="actions">
          ${r._id ? `<button data-act="save">Guardar</button><button class="danger" data-act="del">Eliminar</button>` : `<button data-act="create">Crear</button>`}
        </td>
      </tr>`;
  }

  async function ensureService(){
    const res = await API.servicesList();
    services = res?.items || res || [];
    // Preferimos un servicio "Cambio de Aceite Certificado"; si no existe, usamos cualquiera
    let svc = services.find(s => String(s.name).toUpperCase().includes('ACEITE') ) || services[0];

    // Si NO hay ningún servicio, creamos el base CERT
    if(!svc){
      svc = await API.serviceCreate(DEFAULT_CERT);
      services.push(svc);
    }

    // Si existe pero no se llama exactamente así, lo renombramos
    if (svc && svc.name !== DEFAULT_CERT.name) {
      svc = await API.serviceUpdate(svc._id, { name: DEFAULT_CERT.name }); // sólo nombre
      const idx = services.findIndex(x=>x._id===svc._id); if (idx>=0) services[idx]=svc;
    }

    currentService = svc;
    renderSvcOptions();
    if (svcSelect) svcSelect.value = svc._id;
  }

  async function loadPrices(){
    const params = {
      serviceId: currentService?._id,
      brand: fBrand.value.trim(), line: fLine.value.trim(),
      engine: fEngine.value.trim(), year: fYear.value.trim()
    };
    const res = await API.pricesList(params);
    const rows = res?.items || [];
    renderTableHeader();
    body.innerHTML = rows.map(rowToHTML).join('') || `<tr><td colspan="99">Sin datos</td></tr>`;
    bindRowActions();
  }

  function collectRow(tr){
    const get = (sel)=> tr.querySelector(sel)?.value || '';
    const vars = {};
    tr.querySelectorAll('input[data-k]').forEach(i=>{
      const k = i.dataset.k;
      vars[k] = (i.type === 'number') ? normalizeNumber(i.value) : i.value;
    });
    return {
      brand:  (get('input[data-f="brand"]') || '').toUpperCase(),
      line:   (get('input[data-f="line"]') || '').toUpperCase(),
      engine: (get('input[data-f="engine"]') || '').toUpperCase(),
      year:   Number(get('input[data-f="year"]')||0),
      variables: vars
    };
  }

  function previewTotal(tr){
    if(!currentService) return;
    const data = collectRow(tr);
    const map = Object.fromEntries(Object.entries(data.variables||{}).map(([k,v])=>[String(k).toUpperCase(), Number(v)||0]));
    const t = safeEvalFront(currentService.formula || '', map);
    const td = tr.querySelector('.t'); if (td) td.textContent = money(t);
  }

  function bindRowActions(){
    body.querySelectorAll('button[data-act]').forEach(btn=>{
      btn.onclick = async () => {
        const tr = btn.closest('tr'); const id = tr.dataset.id || null;
        const payload = collectRow(tr);

        if(btn.dataset.act === 'create'){
          payload.serviceId = currentService._id;
          const saved = await API.priceCreate(payload);
          tr.outerHTML = rowToHTML(saved); bindRowActions();
        }
        if(btn.dataset.act === 'save' && id){
          const saved = await API.priceUpdate(id, payload);
          tr.outerHTML = rowToHTML(saved); bindRowActions();
        }
        if(btn.dataset.act === 'del' && id){
          if(confirm('¿Eliminar fila?')){
            await API.priceDelete(id);
            tr.remove();
          }
        }
      };
    });
    body.querySelectorAll('tr').forEach(tr=>{
      tr.querySelectorAll('input').forEach(inp=>{
        inp.oninput = () => previewTotal(tr);
      });
    });
  }

  // --------- Botones base existentes ----------
  if (btnNew) btnNew.onclick = () => {
    if(!currentService) return alert('Selecciona un servicio');
    const fake = { brand:'', line:'', engine:'', year:'', variables: {}, total: 0 };
    const tr = document.createElement('tr');
    tr.innerHTML = rowToHTML(fake);
    body.prepend(tr);
    bindRowActions();
  };

  if (fSearch) fSearch.onclick = loadPrices;
  if (fClear)  fClear.onclick = ()=>{ fBrand.value=''; fLine.value=''; fEngine.value=''; fYear.value=''; loadPrices(); };
  [fBrand,fLine,fEngine,fYear].forEach(el=> el?.addEventListener('keydown', e=>{ if(e.key==='Enter') fSearch?.click(); }));

  if (svcSelect) svcSelect.onchange = () => {
    const id = svcSelect.value;
    currentService = services.find(s=>s._id===id) || currentService;
    renderTableHeader(); loadPrices();
  };

  if (svcVarsBtn) svcVarsBtn.onclick = () => openVarsModal();
  if (svcNewBtn)  svcNewBtn.onclick  = async () => {
    const name = prompt('Nombre del nuevo servicio:', 'Cambio de Aceite Certificado');
    if (!name) return;
    const key = (prompt('Clave (MAYÚSCULAS_SIN_ESPACIOS):', name.replace(/\s+/g,'_').toUpperCase()) || '').toUpperCase();
    const base = (currentService?.variables && currentService.variables.length) ? currentService.variables : DEFAULT_CERT.variables;
    const formula = prompt('Fórmula (usa las CLAVES en mayúsculas):', currentService?.formula || DEFAULT_CERT.formula) || DEFAULT_CERT.formula;
    const svc = await API.serviceCreate({ name, key, variables: base, formula });
    services.push(svc);
    renderSvcOptions();
    if (svcSelect) svcSelect.value = svc._id;
    currentService = svc;
    await loadPrices();
  };

  // --------- Botones necesarios ----------
  btnRename.onclick = async () => {
    if (!currentService) return;
    const svc = await API.serviceUpdate(currentService._id, { name: DEFAULT_CERT.name });
    const idx = services.findIndex(s=>s._id===svc._id); if (idx>=0) services[idx] = svc;
    currentService = svc;
    renderSvcOptions();
    if (svcSelect) svcSelect.value = svc._id;
    alert('Servicio renombrado a: ' + DEFAULT_CERT.name);
  };

  btnClearAll.onclick = async () => {
    if (!currentService) return;
    if (!confirm(`Esto eliminará TODOS los registros de "${currentService.name}". ¿Continuar?`)) return;
    const BASE = (typeof window!=='undefined' && window.API_BASE) ? window.API_BASE : '';
    const tok = (authToken && typeof authToken.get==='function') ? authToken.get() : null;
    const res = await fetch(`${BASE}/api/v1/prices?serviceId=${encodeURIComponent(currentService._id)}`, {
      method: 'DELETE',
      headers: tok ? { 'Authorization': `Bearer ${tok}` } : {},
      cache: 'no-store',
      credentials: 'omit'
    });
    const body = await res.json().catch(()=> ({}));
    if (!res.ok) return alert(body?.error || 'No se pudo borrar');
    alert(`Eliminados: ${body.deleted || 0}`);
    await loadPrices();
  };

  // ----- Modal Variables -----
  function openVarsModal(){
    if(!currentService) return;
    const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
    const rows = (currentService.variables||[]).map((v,i)=>`
      <tr>
        <td><input data-i="${i}" data-f="label" value="${v.label}"></td>
        <td><input data-i="${i}" data-f="key"   value="${v.key}"></td>
        <td>
          <select data-i="${i}" data-f="type">
            <option value="number" ${v.type==='number'?'selected':''}>Número</option>
            <option value="text"   ${v.type==='text'  ?'selected':''}>Texto</option>
          </select>
        </td>
        <td><input data-i="${i}" data-f="unit" value="${v.unit||''}"></td>
        <td><input data-i="${i}" data-f="defaultValue" value="${v.defaultValue??''}"></td>
        <td><button data-del="${i}">Eliminar</button></td>
      </tr>`).join('');
    bodyM.innerHTML = `
      <h3>Variables de ${currentService.name}</h3>
      <table class="table">
        <thead><tr><th>Etiqueta</th><th>Clave</th><th>Tipo</th><th>Unidad</th><th>Default</th><th></th></tr></thead>
        <tbody id="vars-body">${rows || '<tr><td colspan="6">Sin variables</td></tr>'}</tbody>
      </table>
      <div class="row"><button id="vars-add" class="secondary">Añadir variable</button></div>
      <label>Fórmula (usa las CLAVES)</label>
      <input id="formula" value="${(currentService.formula || '').toUpperCase()}">
      <div class="row">
        <button id="vars-save">Guardar</button>
        <button id="vars-close" class="secondary">Cancelar</button>
      </div>`;
    const cleanupKey = openModal();
    closeBtn.onclick = () => { cleanupKey?.(); closeModal(); };
    $('#vars-close').onclick = () => { cleanupKey?.(); closeModal(); };
    $('#vars-add').onclick = () => {
      const i = (currentService.variables||[]).length;
      (currentService.variables||[]).push({ key:'VAR_'+(i+1), label:'Variable '+(i+1), type:'number', defaultValue:0 });
      openVarsModal();
    };
    $('#vars-body').querySelectorAll('button[data-del]').forEach(b=>{
      b.onclick = () => {
        const i = Number(b.dataset.del);
        currentService.variables.splice(i,1);
        openVarsModal();
      };
    });
    $('#vars-save').onclick = async () => {
      const vars = [];
      document.querySelectorAll('#vars-body tr').forEach(tr=>{
        const g = (f)=> tr.querySelector(`[data-f="${f}"]`)?.value || '';
        vars.push({
          label: g('label').trim(),
          key:   g('key').trim().toUpperCase(),
          type:  g('type') || 'number',
          unit:  g('unit') || '',
          defaultValue: (g('type')==='number') ? normalizeNumber(g('defaultValue')) : (g('defaultValue')||'')
        });
      });
      const formula = (document.getElementById('formula').value || '').toUpperCase();
      currentService = await API.serviceUpdate(currentService._id, { variables: vars, formula });
      const idx = services.findIndex(s=>s._id===currentService._id);
      if (idx>=0) services[idx] = currentService;
      renderTableHeader();
      await loadPrices();
      closeModal();
    };
  }

  // ====== IMPORTAR / EXPORTAR ======
  btnImport.onclick = () => openImportModal();
  btnExport.onclick = async () => {
    if(!currentService) return alert('Selecciona un servicio');
    const params = {
      serviceId: currentService._id,
      brand: fBrand.value.trim(), line: fLine.value.trim(),
      engine: fEngine.value.trim(), year: fYear.value.trim()
    };
    const blob = await API.pricesExport(params);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0,10).replace(/-/g,'');
    a.href = URL.createObjectURL(blob);
    a.download = `precios_${currentService.key || currentService._id}_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  function openImportModal(){
    if(!currentService) return alert('Selecciona un servicio');
    const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
    const example = {
      brand: "marca",
      line: "linea",
      engine: "motor",
      year: "año",
      values: Object.fromEntries((currentService.variables||[]).map(v=>[v.key, v.key.toLowerCase()]))
    };
    bodyM.innerHTML = `
      <h3>Importar XLSX a ${currentService.name}</h3>
      <p>1) Selecciona un archivo .xlsx (primera hoja).<br>
         2) Ajusta el mapeo (encabezados exactos tal como vienen en el Excel).<br>
         3) Modo: <b>upsert</b> actualiza por (marca, línea, motor, año); <b>overwrite</b> borra todo el servicio y reimporta.</p>
      <div class="row"><input type="file" id="imp-file" accept=".xlsx" /></div>
      <label>Mapeo columnas → campos (JSON)</label>
      <textarea id="imp-map" rows="8">${JSON.stringify(example, null, 2)}</textarea>
      <div class="row">
        <select id="imp-mode">
          <option value="upsert" selected>upsert (recomendado)</option>
          <option value="overwrite">overwrite (borra y vuelve a cargar)</option>
        </select>
        <button id="imp-run">Importar</button>
        <button id="imp-cancel" class="secondary">Cancelar</button>
      </div>
      <div id="imp-res" class="list"></div>
    `;
    const cleanupKey = openModal();
    closeBtn.onclick = () => { cleanupKey?.(); closeModal(); };
    $('#imp-cancel').onclick = () => { cleanupKey?.(); closeModal(); };
    $('#imp-run').onclick = async () => {
      const f = $('#imp-file').files[0];
      if(!f) return alert('Selecciona un archivo .xlsx');
      let mapping;
      try { mapping = JSON.parse($('#imp-map').value || '{}'); }
      catch { return alert('JSON de mapeo inválido'); }
      const mode = $('#imp-mode').value || 'upsert';

      const fd = new FormData();
      fd.append('file', f);
      fd.append('serviceId', currentService._id);
      fd.append('mode', mode);
      fd.append('mapping', JSON.stringify(mapping));

      try {
        const res = await API.pricesImport(fd);
        $('#imp-res').innerHTML =
          `<div class="card">Insertados: <b>${res.inserted||0}</b> — Actualizados: <b>${res.updated||0}</b> — Errores: <b>${(res.errors||[]).length}</b></div>`;
        await loadPrices();
      } catch(e) {
        alert(e?.message || 'Falló la importación');
      }
    };
  }

  // Boot
  (async () => {
    await ensureService();
    await loadPrices();
  })();
}
