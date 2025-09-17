import { API } from "./api.js";

// Servicio por defecto “Cambio de aceite”
const DEFAULT_SERVICE = {
  name: "Cambio de aceite",
  key: "CAMBIO_ACEITE",
  variables: [
    { key:"VISCOSIDAD",    label:"Viscosidad", type:"text",   defaultValue:"5W-30" },
    { key:"ACEITE_CERT",   label:"Aceite certificado", type:"number", defaultValue:0 },
    { key:"ACEITE_SELLADO",label:"Aceite sellado",    type:"number", defaultValue:0 },
    { key:"FILTRO_AIRE",   label:"Filtro de aire",    type:"number", defaultValue:0 },
    { key:"FILTRO_ACEITE", label:"Filtro de aceite",  type:"number", defaultValue:0 },
    { key:"MO",            label:"Mano de obra",      type:"number", defaultValue:0 }
  ],
  formula: "ACEITE_CERT + ACEITE_SELLADO + FILTRO_ACEITE + FILTRO_AIRE + MO"
};

const $ = (s) => document.querySelector(s);
const money = (n)=>'$'+Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');

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

  // NUEVO: botones importar/exportar
  const filtersBar = document.getElementById('filters-bar');
  const btnImport = document.createElement('button');
  btnImport.id = 'pe-import';
  btnImport.className = 'secondary';
  btnImport.textContent = 'Importar XLSX';
  const btnExport = document.createElement('button');
  btnExport.id = 'pe-export';
  btnExport.className = 'secondary';
  btnExport.textContent = 'Exportar CSV';
  filtersBar?.appendChild(btnImport);
  filtersBar?.appendChild(btnExport);

  let services = [];
  let currentService = null;

  function renderSvcOptions(){
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
    services = res?.items || [];
    let svc = services.find(s=>String(s.key).toUpperCase()==='CAMBIO_ACEITE');
    if(!svc){
      svc = await API.serviceCreate(DEFAULT_SERVICE);
      services.push(svc);
    }
    currentService = svc;
    renderSvcOptions();
    svcSelect.value = svc._id;
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
  }

  function collectRow(tr){
    const get = (sel)=> tr.querySelector(sel)?.value || '';
    const vars = {};
    tr.querySelectorAll('input[data-k]').forEach(i=>{
      const k = i.dataset.k;
      vars[k] = (i.type === 'number') ? Number(i.value||0) : i.value;
    });
    return {
      brand:  get('input[data-f="brand"]').toUpperCase(),
      line:   get('input[data-f="line"]').toUpperCase(),
      engine: get('input[data-f="engine"]').toUpperCase(),
      year:   Number(get('input[data-f="year"]')||0),
      variables: vars
    };
  }

  btnNew.onclick = () => {
    if(!currentService) return alert('Selecciona un servicio');
    const fake = { brand:'', line:'', engine:'', year:'', variables: {}, total: 0 };
    const tr = document.createElement('tr');
    tr.innerHTML = rowToHTML(fake);
    body.prepend(tr);
    bindRowActions();
  };

  fSearch.onclick = loadPrices;
  fClear.onclick = ()=>{ fBrand.value=''; fLine.value=''; fEngine.value=''; fYear.value=''; loadPrices(); };

  svcSelect.onchange = () => {
    const id = svcSelect.value;
    currentService = services.find(s=>s._id===id) || currentService;
    renderTableHeader(); loadPrices();
  };

  svcVarsBtn.onclick = () => openVarsModal();
  svcNewBtn.onclick  = async () => { await API.serviceCreate(DEFAULT_SERVICE); await ensureService(); await loadPrices(); };

  // ====== NUEVO: IMPORTAR / EXPORTAR ======
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
    a.download = `precios_${currentService.key}_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  function openImportModal(){
    if(!currentService) return alert('Selecciona un servicio');
    const modal = document.getElementById('modal');
    const bodyM = document.getElementById('modalBody');
    const closeBtn = document.getElementById('modalClose');

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
    modal.classList.remove('hidden');
    const closeAll = () => modal.classList.add('hidden');
    closeBtn.onclick = closeAll;
    document.getElementById('imp-cancel').onclick = closeAll;

    document.getElementById('imp-run').onclick = async () => {
      const f = document.getElementById('imp-file').files[0];
      if(!f) return alert('Selecciona un archivo .xlsx');
      let mapping;
      try { mapping = JSON.parse(document.getElementById('imp-map').value || '{}'); }
      catch { return alert('JSON de mapeo inválido'); }
      const mode = document.getElementById('imp-mode').value || 'upsert';

      const fd = new FormData();
      fd.append('file', f);
      fd.append('serviceId', currentService._id);
      fd.append('mode', mode);
      fd.append('mapping', JSON.stringify(mapping));

      try {
        const res = await API.pricesImport(fd);
        document.getElementById('imp-res').innerHTML =
          `<div class="card">Insertados: <b>${res.inserted||0}</b> — Actualizados: <b>${res.updated||0}</b> — Errores: <b>${(res.errors||[]).length}</b></div>`;
        await loadPrices();
      } catch(e) {
        alert(e?.message || 'Fallo la importación');
      }
    };
  }

  // ----- Modal Variables -----
  function openVarsModal(){
    if(!currentService) return;
    const modal = document.getElementById('modal');
    const bodyM = document.getElementById('modalBody');
    const closeBtn = document.getElementById('modalClose');

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
      <div class="row">
        <button id="vars-add" class="secondary">Añadir variable</button>
      </div>
      <label>Fórmula (usa las CLAVES)</label>
      <input id="formula" value="${currentService.formula || ''}">
      <div class="row">
        <button id="vars-save">Guardar</button>
        <button id="vars-close" class="secondary">Cancelar</button>
      </div>`;
    modal.classList.remove('hidden');
    const closeAll = () => modal.classList.add('hidden');
    closeBtn.onclick = closeAll;
    document.getElementById('vars-close').onclick = closeAll;

    document.getElementById('vars-add').onclick = () => {
      const i = (currentService.variables||[]).length;
      (currentService.variables||[]).push({ key:'VAR_'+(i+1), label:'Variable '+(i+1), type:'number', defaultValue:0 });
      openVarsModal();
    };
    document.getElementById('vars-body').querySelectorAll('button[data-del]').forEach(b=>{
      b.onclick = () => {
        const i = Number(b.dataset.del);
        currentService.variables.splice(i,1);
        openVarsModal();
      };
    });

    document.getElementById('vars-save').onclick = async () => {
      const vars = [];
      document.querySelectorAll('#vars-body tr').forEach(tr=>{
        const g = (f)=> tr.querySelector(`[data-f="${f}"]`)?.value || '';
        vars.push({
          label: g('label').trim(),
          key:   g('key').trim().toUpperCase(),
          type:  g('type') || 'number',
          unit:  g('unit') || '',
          defaultValue: (g('type')==='number') ? Number(g('defaultValue')||0) : (g('defaultValue')||'')
        });
      });
      const formula = (document.getElementById('formula').value || '').toUpperCase();
      currentService = await API.serviceUpdate(currentService._id, { variables: vars, formula });
      const idx = services.findIndex(s=>s._id===currentService._id);
      if (idx>=0) services[idx] = currentService;
      renderTableHeader();
      await loadPrices();
      modal.classList.add('hidden');
    };
  }

  // Boot
  (async () => {
    await ensureService();
    await loadPrices();
  })();
}
