/* Lista de precios (sin HTML en JS) */
import { API } from './api.esm.js';
import { initVehicles } from './vehicles.js';

const $ = (s)=>document.querySelector(s);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
function openModal(){ const m=$('#modal'); if(!m) return; m.classList.remove('hidden'); document.body.style.overflow='hidden'; const onKey=(e)=>{ if(e.key==='Escape') closeModal(); }; document.addEventListener('keydown', onKey); return ()=>document.removeEventListener('keydown', onKey); }
function closeModal(){ const m=$('#modal'); if(!m) return; m.classList.add('hidden'); document.body.style.overflow=''; }
const clone=(id)=>document.getElementById(id)?.content?.firstElementChild?.cloneNode(true);

function normalizeNumber(v){ if(v==null || v==='') return 0; if(typeof v==='number') return v; const s=String(v).replace(/\s+/g,'').replace(/\$/g,'').replace(/\./g,'').replace(/,/g,'.'); const n=Number(s); return Number.isFinite(n)?n:0; }
function safeEvalFront(expr, vars={}){ const cleaned=String(expr||'').trim().toUpperCase(); if(!cleaned) return 0; if(!/^[\d+\-*/().\sA-Z0-9_]+$/.test(cleaned)) return 0; const replaced=cleaned.replace(/[A-Z_][A-Z0-9_]*/g,(k)=>{ const v=Number(vars[k]??0); return Number.isFinite(v)?String(v):'0'; }); try{ return Function('\"use strict\"; return ('+replaced+')')(); }catch{ return 0; } }

// Función para cambiar entre tabs
function switchSubTab(name) {
  document.querySelectorAll('.payroll-tabs button[data-subtab]').forEach(b => {
    b.classList.toggle('active', b.dataset.subtab === name);
  });
  document.querySelectorAll('[data-subsection]').forEach(sec => {
    sec.classList.toggle('hidden', sec.dataset.subsection !== name);
  });
}

export function initPrices(){
  const tab = $('#tab-precios'); if(!tab) return;

  const svcSelect=$('#svc-select'), svcVarsBtn=$('#svc-vars'), svcNewBtn=$('#svc-new');
  const fVehicleSearch=$('#pf-vehicle-search'), fVehicleId=$('#pf-vehicle-id'), fVehicleDropdown=$('#pf-vehicle-dropdown'), fVehicleSelected=$('#pf-vehicle-selected');
  const fSearch=$('#pf-search'), fClear=$('#pf-clear'), btnNew=$('#pe-new');
  const head=$('#pe-head'), body=$('#pe-body');
  
  let selectedVehicle = null;
  let vehicleSearchTimeout = null;

  // Acciones adicionales (import/export/rename/clear) – mantenemos usando DOM APIs
  const filtersBar=document.getElementById('filters-bar')||tab;
  const addBtn=(id, cls, text)=>{ const b=document.createElement('button'); b.id=id; b.className=cls; b.textContent=text; filtersBar?.appendChild(b); return b; };
  const btnImport=addBtn('pe-import','secondary','Importar XLSX');
  const btnExport=addBtn('pe-export','secondary','Exportar CSV');
  const btnRename=addBtn('svc-rename','secondary','Renombrar servicio');
  const btnClearAll=addBtn('svc-clear','danger','Vaciar servicio');

  let services=[]; let currentService=null;

  function renderSvcOptions(){
    if(!svcSelect) return;
    svcSelect.replaceChildren(...(services||[]).map(s=>{ const o=document.createElement('option'); o.value=s._id; o.textContent=s.name; return o; }));
  }

  function renderTableHeader(){
    head.replaceChildren();
    if(!currentService) return;
    const tr=document.createElement('tr');
    ['Vehículo', ...(currentService.variables||[]).map(v=>v.label||v.key), 'Precio', 'Acciones'].forEach(txt=>{
      const th=document.createElement('th'); th.textContent=txt; tr.appendChild(th);
    });
    head.appendChild(tr);
  }

  const rowTemplateId='tpl-price-edit-row';

  function rowToNode(r){
    const tr=clone(rowTemplateId);
    
    // Mostrar vehículo (desde vehicleId o campos legacy)
    const vehicleCell = tr.querySelector('[data-vehicle]');
    if (vehicleCell) {
      if (r.vehicleId && (r.vehicleId.make || typeof r.vehicleId === 'object')) {
        const v = typeof r.vehicleId === 'object' ? r.vehicleId : r.vehicleId;
        vehicleCell.innerHTML = `
          <div style="font-weight:600;">${v.make || ''} ${v.line || ''}</div>
          <div style="font-size:12px;color:var(--muted);">Cilindraje: ${v.displacement || ''}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}</div>
        `;
      } else {
        vehicleCell.innerHTML = `
          <div>${r.brand || ''} ${r.line || ''}</div>
          <div style="font-size:12px;color:var(--muted);">${r.engine || ''} ${r.year || ''}</div>
        `;
      }
    }
    
    const inPrice=tr.querySelector('input[data-price]'); 
    if (inPrice) inPrice.value = r.total || r.price || 0;

    const saveBtn = tr.querySelector('button.save');
    if (saveBtn) {
      // Remover listeners anteriores si existen
      const newSaveBtn = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
      newSaveBtn.addEventListener('click', async ()=>{
        const payload = {
          vehicleId: (r.vehicleId?._id || r.vehicleId) || null,
          variables: r.variables || {},
          price: normalizeNumber(inPrice?.value || 0)
        };
        await API.priceUpdate(r._id, payload); 
        loadPrices();
      });
    }
    
    const deleteBtn = tr.querySelector('button.delete');
    if (deleteBtn) {
      const newDeleteBtn = deleteBtn.cloneNode(true);
      deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
      newDeleteBtn.addEventListener('click', async ()=>{ 
        if(confirm('¿Borrar fila?')){ 
          await API.priceDelete(r._id); 
          loadPrices(); 
        } 
      });
    }
    return tr;
  }

  async function loadServices(){
    const r = await API.servicesList();
    services = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : []);
    renderSvcOptions();
    if(services[0]){ currentService = services[0]; svcSelect.value = currentService._id; renderTableHeader(); await loadPrices(); }
  }

  async function loadPrices(params={}){
    params = { ...(params||{}), serviceId: currentService?._id };
    if (selectedVehicle) {
      params.vehicleId = selectedVehicle._id;
    }
    const r = await API.pricesList(params);
    const rows = Array.isArray(r?.items) ? r.items : (Array.isArray(r) ? r : []);
    body.replaceChildren(...rows.map(rowToNode));
  }

  // Búsqueda de vehículos
  async function searchVehicles(query) {
    if (!query || query.length < 2) {
      fVehicleDropdown.style.display = 'none';
      return;
    }
    try {
      const r = await API.vehicles.search({ q: query, limit: 10 });
      const vehicles = Array.isArray(r?.items) ? r.items : [];
      if (vehicles.length === 0) {
        fVehicleDropdown.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px;">No se encontraron vehículos</div>';
        fVehicleDropdown.style.display = 'block';
        return;
      }
      fVehicleDropdown.replaceChildren(...vehicles.map(v => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);';
        div.innerHTML = `
          <div style="font-weight:600;">${v.make} ${v.line}</div>
          <div style="font-size:12px;color:var(--muted);">Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}</div>
        `;
        div.addEventListener('click', () => {
          selectVehicle(v);
        });
        div.addEventListener('mouseenter', () => {
          div.style.background = 'var(--hover, rgba(0,0,0,0.05))';
        });
        div.addEventListener('mouseleave', () => {
          div.style.background = '';
        });
        return div;
      }));
      fVehicleDropdown.style.display = 'block';
    } catch (err) {
      console.error('Error al buscar vehículos:', err);
    }
  }

  function selectVehicle(vehicle) {
    selectedVehicle = vehicle;
    fVehicleId.value = vehicle._id;
    fVehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
    fVehicleSelected.innerHTML = `
      <span style="color:var(--success, #10b981);">✓</span> 
      <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
      <br><span style="font-size:11px;color:var(--muted);">Filtrando precios para este vehículo. Puedes crear nuevos precios con "Nueva fila".</span>
    `;
    fVehicleDropdown.style.display = 'none';
    loadPrices();
  }

  function clearFilters(){ 
    selectedVehicle = null;
    fVehicleId.value = '';
    fVehicleSearch.value = '';
    fVehicleSelected.innerHTML = '';
    fVehicleDropdown.style.display = 'none';
    loadPrices(); // Recargar para mostrar todos los precios
  }

  // Eventos UI
  fVehicleSearch.addEventListener('input', (e) => {
    clearTimeout(vehicleSearchTimeout);
    vehicleSearchTimeout = setTimeout(() => {
      searchVehicles(e.target.value);
    }, 300);
  });

  fVehicleSearch.addEventListener('focus', () => {
    if (fVehicleSearch.value.length >= 2) {
      searchVehicles(fVehicleSearch.value);
    }
  });

  // Cerrar dropdown al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!fVehicleSearch.contains(e.target) && !fVehicleDropdown.contains(e.target)) {
      fVehicleDropdown.style.display = 'none';
    }
  });

  fSearch.onclick = ()=> loadPrices();
  fClear.onclick  = ()=> { clearFilters(); loadPrices(); };
  svcSelect.onchange = ()=>{ currentService = services.find(s=>s._id===svcSelect.value) || null; renderTableHeader(); loadPrices(); };
  
  // Crear nuevo servicio
  svcNewBtn.onclick = async ()=>{
    const name = prompt('Nombre del nuevo servicio:', '');
    if(!name || !name.trim()) return;
    try {
      const newSvc = await API.serviceCreate({ name: name.trim(), variables: [] });
      await loadServices();
      if(newSvc?._id) {
        svcSelect.value = newSvc._id;
        currentService = newSvc;
        renderTableHeader();
        loadPrices();
      }
    } catch(e) {
      alert('Error al crear servicio: ' + (e?.message || 'Error desconocido'));
    }
  };
  
  // Editar variables del servicio
  svcVarsBtn.onclick = ()=>{
    if(!currentService) return alert('Selecciona un servicio primero');
    const body=$('#modalBody'), closeBtn=$('#modalClose'); 
    body.replaceChildren();
    
    const node = document.createElement('div');
    node.className = 'card';
    node.innerHTML = `
      <h3>Variables del servicio: ${currentService.name}</h3>
      <p class="muted" style="font-size:13px;margin-bottom:16px;">
        Las variables permiten personalizar precios según diferentes criterios (ej: tipo de trabajo, complejidad, etc.)
      </p>
      <div id="vars-list" style="margin-bottom:16px;"></div>
      <div class="row" style="gap:8px;margin-bottom:16px;">
        <input id="var-key" placeholder="Clave (ej: TIPO)" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);text-transform:uppercase;" />
        <input id="var-label" placeholder="Etiqueta (ej: Tipo de trabajo)" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        <button id="var-add" class="secondary" style="padding:8px 16px;">➕ Agregar</button>
      </div>
      <div class="row" style="gap:8px;">
        <button id="vars-save" style="flex:1;padding:10px;">💾 Guardar cambios</button>
        <button id="vars-cancel" class="secondary" style="flex:1;padding:10px;">Cancelar</button>
      </div>
    `;
    body.appendChild(node);
    
    const varsList = node.querySelector('#vars-list');
    const varKey = node.querySelector('#var-key');
    const varLabel = node.querySelector('#var-label');
    const varAdd = node.querySelector('#var-add');
    const varsSave = node.querySelector('#vars-save');
    const varsCancel = node.querySelector('#vars-cancel');
    
    let variables = [...(currentService.variables || [])];
    
    function renderVars() {
      varsList.innerHTML = '';
      if(variables.length === 0) {
        varsList.innerHTML = '<p class="muted" style="text-align:center;padding:16px;">No hay variables definidas</p>';
        return;
      }
      variables.forEach((v, idx) => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;background:var(--card-alt);border-radius:6px;margin-bottom:8px;';
        div.innerHTML = `
          <div style="flex:1;">
            <strong>${v.key || ''}</strong> - ${v.label || ''}
          </div>
          <button class="danger" style="padding:4px 8px;font-size:12px;" data-var-index="${idx}">🗑️</button>
        `;
        div.querySelector('button').onclick = () => {
          variables.splice(idx, 1);
          renderVars();
        };
        varsList.appendChild(div);
      });
    }
    
    varAdd.onclick = () => {
      const key = varKey.value.trim().toUpperCase();
      const label = varLabel.value.trim();
      if(!key) return alert('La clave es requerida');
      if(variables.some(v => v.key === key)) return alert('Ya existe una variable con esa clave');
      variables.push({ key, label: label || key });
      varKey.value = '';
      varLabel.value = '';
      renderVars();
    };
    
    varsSave.onclick = async () => {
      try {
        await API.serviceUpdate(currentService._id, { variables });
        await loadServices();
        currentService = services.find(s=>s._id===currentService._id) || null;
        renderTableHeader();
        closeModal();
      } catch(e) {
        alert('Error al guardar: ' + (e?.message || 'Error desconocido'));
      }
    };
    
    varsCancel.onclick = () => closeModal();
    
    renderVars();
    const cleanup = openModal();
    closeBtn.onclick = () => { cleanup?.(); closeModal(); };
  };
  
  btnNew.onclick = async ()=>{
    if(!currentService) return alert('Selecciona un servicio primero');
    if(!selectedVehicle) return alert('Selecciona un vehículo de la base de datos para crear un precio específico para ese vehículo');
    const payload={ 
      vehicleId: selectedVehicle._id,
      serviceId: currentService._id,
      variables: {},
      price: 0
    };
    await API.priceCreate(payload); 
    loadPrices();
  };

  // Import / Export / Rename / Clear
  btnExport.onclick = async ()=>{
    if(!currentService) return alert('Selecciona un servicio');
    const blob = await API.pricesExport({ serviceId: currentService._id });
    const a=document.createElement('a'); const ts=new Date().toISOString().slice(0,10).replace(/-/g,'');
    a.href=URL.createObjectURL(blob); a.download=`precios_${currentService.key||currentService._id}_${ts}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  btnImport.onclick = ()=>{
    const body=$('#modalBody'), closeBtn=$('#modalClose'); body.replaceChildren();
    const node=clone('tpl-import-prices'); body.appendChild(node);
    const cleanup=openModal(); closeBtn.onclick=()=>{ cleanup?.(); closeModal(); };
    body.querySelector('#imp-title').textContent = `Importar XLSX a ${currentService?.name||''}`;
    const example={ brand:'marca', line:'linea', engine:'motor', year:'año', values:Object.fromEntries((currentService?.variables||[]).map(v=>[v.key, v.key.toLowerCase()])) };
    body.querySelector('#imp-map').value = JSON.stringify(example, null, 2);
    body.querySelector('#imp-cancel').onclick = ()=>{ cleanup?.(); closeModal(); };
    body.querySelector('#imp-run').onclick = async ()=>{
      const f = body.querySelector('#imp-file').files[0]; if(!f) return alert('Selecciona un archivo .xlsx');
      let mapping; try{ mapping = JSON.parse(body.querySelector('#imp-map').value || '{}'); }catch{ return alert('JSON de mapeo inválido'); }
      const mode = body.querySelector('#imp-mode').value || 'upsert';
      const fd=new FormData(); fd.append('file', f); fd.append('serviceId', currentService._id); fd.append('mode', mode); fd.append('mapping', JSON.stringify(mapping));
      const res = await API.pricesImport(fd);
      const resDiv = body.querySelector('#imp-res'); resDiv.textContent = `Insertados: ${res.inserted||0} — Actualizados: ${res.updated||0} — Errores: ${(res.errors||[]).length}`;
      await loadPrices();
    };
  };

  btnRename.onclick = async ()=>{
    const newName = prompt('Nuevo nombre del servicio:', currentService?.name||''); if(!newName) return;
    await API.serviceUpdate(currentService._id, { name:newName }); await loadServices();
  };
  btnClearAll.onclick = async ()=>{
    if(!currentService) return; if(!confirm('¿Vaciar todo el servicio?')) return;
    await API.serviceDelete(currentService._id); await loadServices();
  };

  // Tabs internas (Lista de precios / Vehículos)
  document.querySelectorAll('.payroll-tabs button[data-subtab]').forEach(b => {
    b.addEventListener('click', () => switchSubTab(b.dataset.subtab));
  });

  // Inicializar gestión de vehículos
  initVehicles();

  loadServices();
}
