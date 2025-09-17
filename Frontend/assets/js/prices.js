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

  // ----- Modal Variables -----
  function openVarsModal(){
    if(!currentService) return;
    const modal = document.getElementById('modal');
    const bodyM = document.getElementById('modalBody');
    const close = document.getElementById('modalClose');

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
    close.onclick = closeAll;
    document.getElementById('vars-close').onclick = closeAll;

    document.getElementById('vars-add').onclick = () => {
      const i = (currentService.variables||[]).length;
      (currentService.variables||[]).push({ key:'VAR_'+(i+1), label:'Variable '+(i+1), type:'number', defaultValue:0 });
      openVarsModal();
    };
    bodyM.querySelectorAll('button[data-del]').forEach(b=>{
      b.onclick = () => {
        const i = Number(b.dataset.del);
        currentService.variables.splice(i,1);
        openVarsModal();
      };
    });

    document.getElementById('vars-save').onclick = async () => {
      const vars = [];
      bodyM.querySelectorAll('#vars-body tr').forEach(tr=>{
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
      closeAll();
    };
  }

  // Boot
  (async () => {
    await ensureService();
    await loadPrices();
  })();
}
