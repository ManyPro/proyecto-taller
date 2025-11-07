/* Lista de precios - Nuevo modelo: Vehículo primero, luego servicios/productos */
import { API } from './api.esm.js';
import { initVehicles } from './vehicles.js';

const $ = (s)=>document.querySelector(s);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
function openModal(){ const m=$('#modal'); if(!m) return; m.classList.remove('hidden'); document.body.style.overflow='hidden'; const onKey=(e)=>{ if(e.key==='Escape') closeModal(); }; document.addEventListener('keydown', onKey); return ()=>document.removeEventListener('keydown', onKey); }
function closeModal(){ const m=$('#modal'); if(!m) return; m.classList.add('hidden'); document.body.style.overflow=''; }
const clone=(id)=>document.getElementById(id)?.content?.firstElementChild?.cloneNode(true);

function normalizeNumber(v){ if(v==null || v==='') return 0; if(typeof v==='number') return v; const s=String(v).replace(/\s+/g,'').replace(/\$/g,'').replace(/\./g,'').replace(/,/g,'.'); const n=Number(s); return Number.isFinite(n)?n:0; }

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

  const fVehicleSearch=$('#pf-vehicle-search'), fVehicleId=$('#pf-vehicle-id'), fVehicleDropdown=$('#pf-vehicle-dropdown'), fVehicleSelected=$('#pf-vehicle-selected');
  const fSearch=$('#pf-search'), fClear=$('#pf-clear');
  const btnNewService=$('#pe-new-service'), btnNewProduct=$('#pe-new-product');
  const actionsBar=$('#pe-actions-bar');
  const head=$('#pe-head'), body=$('#pe-body');
  
  let selectedVehicle = null;
  let vehicleSearchTimeout = null;

  // Acciones adicionales (import/export) – mantenemos usando DOM APIs
  const filtersBar=document.getElementById('filters-bar')||tab;
  const addBtn=(id, cls, text)=>{ const b=document.createElement('button'); b.id=id; b.className=cls; b.textContent=text; filtersBar?.appendChild(b); return b; };
  const btnImport=addBtn('pe-import','secondary','Importar XLSX');
  const btnExport=addBtn('pe-export','secondary','Exportar CSV');

  function renderTableHeader(){
    head.replaceChildren();
    if(!selectedVehicle) {
      head.innerHTML = '<tr><th colspan="4" style="text-align:center;padding:24px;color:var(--muted);">Selecciona un vehículo para ver sus servicios y productos</th></tr>';
      return;
    }
    const tr=document.createElement('tr');
    ['Tipo', 'Nombre', 'Precio', 'Acciones'].forEach(txt=>{
      const th=document.createElement('th'); th.textContent=txt; tr.appendChild(th);
    });
    head.appendChild(tr);
  }

  const rowTemplateId='tpl-price-edit-row';

  function rowToNode(r){
    const tr=clone(rowTemplateId);
    
    // Mostrar tipo
    const vehicleCell = tr.querySelector('[data-vehicle]');
    if (vehicleCell) {
      const typeBadge = r.type === 'product' ? '<span style="background:var(--primary,#3b82f6);color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">PRODUCTO</span>' : '<span style="background:var(--success,#10b981);color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">SERVICIO</span>';
      vehicleCell.innerHTML = typeBadge;
    }
    
    // Mostrar nombre
    const nameCell = tr.querySelector('[data-name]');
    if (nameCell) {
      nameCell.textContent = r.name || 'Sin nombre';
      nameCell.style.fontWeight = '500';
    }
    
    const inPrice=tr.querySelector('input[data-price]'); 
    if (inPrice) inPrice.value = r.total || r.price || 0;

    const saveBtn = tr.querySelector('button.save');
    if (saveBtn) {
      const newSaveBtn = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
      newSaveBtn.addEventListener('click', async ()=>{
        const payload = {
          name: r.name,
          type: r.type,
          total: normalizeNumber(inPrice?.value || 0)
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
        if(confirm('¿Borrar este servicio/producto?')){ 
          await API.priceDelete(r._id); 
          loadPrices(); 
        } 
      });
    }
    return tr;
  }

  async function loadPrices(params={}){
    if (!selectedVehicle) {
      body.replaceChildren();
      renderTableHeader();
      return;
    }
    params = { ...(params||{}), vehicleId: selectedVehicle._id };
    const r = await API.pricesList(params);
    const rows = Array.isArray(r?.items) ? r.items : (Array.isArray(r) ? r : []);
    body.replaceChildren(...rows.map(rowToNode));
    renderTableHeader();
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
    `;
    fVehicleDropdown.style.display = 'none';
    actionsBar.style.display = 'flex';
    loadPrices();
  }

  function clearFilters(){ 
    selectedVehicle = null;
    fVehicleId.value = '';
    fVehicleSearch.value = '';
    fVehicleSelected.innerHTML = '';
    fVehicleDropdown.style.display = 'none';
    actionsBar.style.display = 'none';
    body.replaceChildren();
    renderTableHeader();
  }

  // Eventos UI
  if (fVehicleSearch) {
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
  }

  // Cerrar dropdown al hacer click fuera
  document.addEventListener('click', (e) => {
    if (fVehicleSearch && fVehicleDropdown && !fVehicleSearch.contains(e.target) && !fVehicleDropdown.contains(e.target)) {
      fVehicleDropdown.style.display = 'none';
    }
  });

  if (fSearch) fSearch.onclick = ()=> loadPrices();
  if (fClear) fClear.onclick  = ()=> { clearFilters(); };
  
  // Crear nuevo servicio
  if (btnNewService) {
    btnNewService.onclick = async ()=>{
      if(!selectedVehicle) return alert('Selecciona un vehículo primero');
      const name = prompt('Nombre del servicio:', '');
      if(!name || !name.trim()) return;
      try {
        const payload = {
          vehicleId: selectedVehicle._id,
          name: name.trim(),
          type: 'service',
          total: 0
        };
        await API.priceCreate(payload);
        loadPrices();
      } catch(e) {
        alert('Error al crear servicio: ' + (e?.message || 'Error desconocido'));
      }
    };
  }
  
  // Crear nuevo producto
  if (btnNewProduct) {
    btnNewProduct.onclick = async ()=>{
      if(!selectedVehicle) return alert('Selecciona un vehículo primero');
      const name = prompt('Nombre del producto:', '');
      if(!name || !name.trim()) return;
      try {
        const payload = {
          vehicleId: selectedVehicle._id,
          name: name.trim(),
          type: 'product',
          total: 0
        };
        await API.priceCreate(payload);
        loadPrices();
      } catch(e) {
        alert('Error al crear producto: ' + (e?.message || 'Error desconocido'));
      }
    };
  }

  // Import / Export
  if (btnExport) {
    btnExport.onclick = async ()=>{
      if(!selectedVehicle) return alert('Selecciona un vehículo');
      const blob = await API.pricesExport({ vehicleId: selectedVehicle._id });
      const a=document.createElement('a'); const ts=new Date().toISOString().slice(0,10).replace(/-/g,'');
      a.href=URL.createObjectURL(blob); a.download=`precios_${selectedVehicle.make}_${selectedVehicle.line}_${ts}.csv`; a.click(); URL.revokeObjectURL(a.href);
    };
  }

  if (btnImport) {
    btnImport.onclick = ()=>{
      if(!selectedVehicle) return alert('Selecciona un vehículo');
      alert('Importación por implementar');
    };
  }

  // Tabs internas (Lista de precios / Vehículos)
  document.querySelectorAll('.payroll-tabs button[data-subtab]').forEach(b => {
    b.addEventListener('click', () => switchSubTab(b.dataset.subtab));
  });

  // Inicializar gestión de vehículos
  initVehicles();

  // Renderizar tabla vacía inicialmente
  renderTableHeader();
}
