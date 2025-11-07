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
  let currentPage = 1;
  let currentFilters = { name: '', type: '' };
  let paging = { page: 1, limit: 10, total: 0, pages: 1 };

  // Acciones adicionales (import/export) – mantenemos usando DOM APIs
  const filtersBar=document.getElementById('filters-bar')||tab;
  const addBtn=(id, cls, text)=>{ const b=document.createElement('button'); b.id=id; b.className=cls; b.textContent=text; filtersBar?.appendChild(b); return b; };
  const btnImport=addBtn('pe-import','secondary','📥 Importar');
  const btnExport=addBtn('pe-export','secondary','📤 Exportar');

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

  function renderPagination() {
    const paginationEl = $('#pe-pagination');
    if (!paginationEl || !selectedVehicle) return;
    
    if (paging.pages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }
    
    let html = '<div style="display:flex;align-items:center;gap:8px;justify-content:center;padding:12px;">';
    html += `<button class="secondary" ${paging.page <= 1 ? 'disabled' : ''} id="pe-prev">← Anterior</button>`;
    html += `<span style="color:var(--muted);font-size:13px;">Página ${paging.page} de ${paging.pages} (${paging.total} total)</span>`;
    html += `<button class="secondary" ${paging.page >= paging.pages ? 'disabled' : ''} id="pe-next">Siguiente →</button>`;
    html += '</div>';
    paginationEl.innerHTML = html;
    
    $('#pe-prev')?.addEventListener('click', () => {
      if (paging.page > 1) {
        currentPage = paging.page - 1;
        loadPrices();
      }
    });
    $('#pe-next')?.addEventListener('click', () => {
      if (paging.page < paging.pages) {
        currentPage = paging.page + 1;
        loadPrices();
      }
    });
  }

  async function loadPrices(params={}){
    if (!selectedVehicle) {
      body.replaceChildren();
      renderTableHeader();
      return;
    }
    params = { 
      ...(params||{}), 
      vehicleId: selectedVehicle._id,
      page: currentPage,
      limit: 10,
      name: currentFilters.name,
      type: currentFilters.type || undefined
    };
    const r = await API.pricesList(params);
    const rows = Array.isArray(r?.items) ? r.items : (Array.isArray(r) ? r : []);
    paging = {
      page: r.page || 1,
      limit: r.limit || 10,
      total: r.total || 0,
      pages: r.pages || 1
    };
    body.replaceChildren(...rows.map(rowToNode));
    renderTableHeader();
    renderPagination();
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
    $('#pe-filters').style.display = 'flex';
    currentPage = 1;
    currentFilters = { name: '', type: '' };
    $('#pe-filter-name').value = '';
    $('#pe-filter-type').value = '';
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
    const paginationEl = $('#pe-pagination');
    if (paginationEl) paginationEl.innerHTML = '';
    const filtersEl = $('#pe-filters');
    if (filtersEl) filtersEl.style.display = 'none';
    currentPage = 1;
    currentFilters = { name: '', type: '' };
    if (filterName) filterName.value = '';
    if (filterType) filterType.value = '';
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

  // Filtros
  const filterName = $('#pe-filter-name');
  const filterType = $('#pe-filter-type');
  let filterTimeout = null;
  
  if (filterName) {
    filterName.addEventListener('input', (e) => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        currentFilters.name = e.target.value.trim();
        currentPage = 1;
        loadPrices();
      }, 500);
    });
  }
  
  if (filterType) {
    filterType.addEventListener('change', (e) => {
      currentFilters.type = e.target.value;
      currentPage = 1;
      loadPrices();
    });
  }
  
  if (fSearch) fSearch.onclick = ()=> { 
    currentFilters.name = filterName?.value.trim() || '';
    currentFilters.type = filterType?.value || '';
    currentPage = 1; 
    loadPrices(); 
  };
  if (fClear) fClear.onclick  = ()=> { clearFilters(); };
  
  // Modal para crear servicio/producto
  function openCreateModal(type) {
    if(!selectedVehicle) return alert('Selecciona un vehículo primero');
    const body=$('#modalBody'), closeBtn=$('#modalClose'); 
    body.replaceChildren();
    
    const node = document.createElement('div');
    node.className = 'card';
    node.innerHTML = `
      <h3>${type === 'service' ? 'Nuevo Servicio' : 'Nuevo Producto'}</h3>
      <p class="muted" style="margin-bottom:16px;font-size:13px;">
        Vehículo: <strong>${selectedVehicle.make} ${selectedVehicle.line}</strong>
      </p>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Nombre</label>
        <input id="pe-modal-name" placeholder="${type === 'service' ? 'Ej: Cambio de aceite' : 'Ej: Filtro de aire'}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Precio</label>
        <input id="pe-modal-price" type="number" step="0.01" placeholder="0" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
      </div>
      <div id="pe-modal-msg" style="margin-bottom:16px;font-size:13px;"></div>
      <div class="row" style="gap:8px;">
        <button id="pe-modal-save" style="flex:1;padding:10px;">💾 Guardar</button>
        <button id="pe-modal-cancel" class="secondary" style="flex:1;padding:10px;">Cancelar</button>
      </div>
    `;
    body.appendChild(node);
    
    const nameInput = node.querySelector('#pe-modal-name');
    const priceInput = node.querySelector('#pe-modal-price');
    const msgEl = node.querySelector('#pe-modal-msg');
    const saveBtn = node.querySelector('#pe-modal-save');
    const cancelBtn = node.querySelector('#pe-modal-cancel');
    
    nameInput.focus();
    
    saveBtn.onclick = async () => {
      const name = nameInput.value.trim();
      const price = normalizeNumber(priceInput.value);
      
      if (!name) {
        msgEl.textContent = 'El nombre es requerido';
        msgEl.style.color = 'var(--danger, #ef4444)';
        return;
      }
      
      if (price < 0) {
        msgEl.textContent = 'El precio debe ser mayor o igual a 0';
        msgEl.style.color = 'var(--danger, #ef4444)';
        return;
      }
      
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
        const payload = {
          vehicleId: selectedVehicle._id,
          name: name,
          type: type,
          total: price
        };
        await API.priceCreate(payload);
        closeModal();
        loadPrices();
      } catch(e) {
        msgEl.textContent = 'Error: ' + (e?.message || 'Error desconocido');
        msgEl.style.color = 'var(--danger, #ef4444)';
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Guardar';
      }
    };
    
    cancelBtn.onclick = () => closeModal();
    
    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });
    priceInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });
    
    const cleanup = openModal();
    closeBtn.onclick = () => { cleanup?.(); closeModal(); };
  }
  
  // Crear nuevo servicio
  if (btnNewService) {
    btnNewService.onclick = () => openCreateModal('service');
  }
  
  // Crear nuevo producto
  if (btnNewProduct) {
    btnNewProduct.onclick = () => openCreateModal('product');
  }

  // Import / Export
  if (btnExport) {
  btnExport.onclick = async ()=>{
      if(!selectedVehicle) return alert('Selecciona un vehículo');
      try {
        btnExport.disabled = true;
        btnExport.textContent = 'Exportando...';
        const url = `${API.base || ''}/api/v1/prices/export?vehicleId=${selectedVehicle._id}`;
        const res = await fetch(url, { headers: { ...(API.token?.get ? { Authorization: `Bearer ${API.token.get()}` } : {}) } });
        if(!res.ok) throw new Error('No se pudo exportar');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const contentDisposition = res.headers.get('Content-Disposition');
        const filename = contentDisposition 
          ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') || 'precios.xlsx'
          : `precios-${new Date().toISOString().split('T')[0]}.xlsx`;
        a.download = filename;
        document.body.appendChild(a); 
        a.click(); 
        a.remove();
        URL.revokeObjectURL(a.href);
      } catch(e) {
        alert('Error al exportar: ' + e.message);
      } finally {
        btnExport.disabled = false;
        btnExport.textContent = '📤 Exportar';
      }
    };
  }

  if (btnImport) {
    btnImport.onclick = async ()=>{
      if(!selectedVehicle) return alert('Selecciona un vehículo');
      const body=$('#modalBody'), closeBtn=$('#modalClose'); 
      body.replaceChildren();
      
      const node = document.createElement('div');
      node.className = 'card';
      node.innerHTML = `
        <h3>Importar precios</h3>
        <p class="muted" style="margin-bottom:16px;font-size:13px;">
          Vehículo: <strong>${selectedVehicle.make} ${selectedVehicle.line}</strong>
        </p>
        <div style="margin-bottom:16px;">
          <button id="pe-download-template" class="secondary" style="width:100%;padding:10px;margin-bottom:8px;">📥 Descargar plantilla</button>
          <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Seleccionar archivo Excel (.xlsx)</label>
          <input type="file" id="pe-import-file" accept=".xlsx" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        </div>
        <div id="pe-import-msg" style="margin-bottom:16px;font-size:13px;"></div>
        <div class="row" style="gap:8px;">
          <button id="pe-import-run" style="flex:1;padding:10px;">📥 Importar</button>
          <button id="pe-import-cancel" class="secondary" style="flex:1;padding:10px;">Cancelar</button>
        </div>
      `;
      body.appendChild(node);
      
      const fileInput = node.querySelector('#pe-import-file');
      const msgEl = node.querySelector('#pe-import-msg');
      const runBtn = node.querySelector('#pe-import-run');
      const cancelBtn = node.querySelector('#pe-import-cancel');
      const templateBtn = node.querySelector('#pe-download-template');
      
      templateBtn.onclick = async () => {
        try {
          templateBtn.disabled = true;
          const url = `${API.base || ''}/api/v1/prices/import/template?vehicleId=${selectedVehicle._id}`;
          const res = await fetch(url, { headers: { ...(API.token?.get ? { Authorization: `Bearer ${API.token.get()}` } : {}) } });
          if(!res.ok) throw new Error('No se pudo descargar la plantilla');
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `plantilla-precios-${selectedVehicle.make}-${selectedVehicle.line}.xlsx`;
          document.body.appendChild(a); 
          a.click(); 
          a.remove();
          URL.revokeObjectURL(a.href);
        } catch(e) {
          alert('Error: ' + e.message);
        } finally {
          templateBtn.disabled = false;
        }
      };
      
      runBtn.onclick = async () => {
        const file = fileInput.files?.[0];
        if(!file) {
          msgEl.textContent = 'Selecciona un archivo .xlsx';
          msgEl.style.color = 'var(--danger, #ef4444)';
          return;
        }
        
        try {
          runBtn.disabled = true;
          runBtn.textContent = 'Importando...';
          msgEl.textContent = 'Subiendo y procesando...';
          msgEl.style.color = 'var(--muted)';
          
          const formData = new FormData();
          formData.append('file', file);
          formData.append('vehicleId', selectedVehicle._id);
          formData.append('mode', 'upsert');
          
          const url = `${API.base || ''}/api/v1/prices/import`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { ...(API.token?.get ? { Authorization: `Bearer ${API.token.get()}` } : {}) },
            body: formData
          });
          
          const text = await res.text();
          let data;
          try { data = JSON.parse(text); } catch { data = text; }
          
          if(!res.ok) throw new Error(data?.error || 'Error importando');
          
          const s = data || {};
          const errs = Array.isArray(s.errors) ? s.errors : [];
          const lines = [
            'Importación completada:',
            `• Creados: ${s.inserted || 0}`,
            `• Actualizados: ${s.updated || 0}`,
            errs.length > 0 ? `• Errores: ${errs.length}` : ''
          ].filter(Boolean);
          
          msgEl.innerHTML = lines.join('<br>');
          msgEl.style.color = errs.length > 0 ? 'var(--warning, #f59e0b)' : 'var(--success, #10b981)';
          
          if (errs.length > 0 && errs.length <= 10) {
            msgEl.innerHTML += '<br><br><strong>Errores:</strong><br>' + errs.map(e => `Fila ${e.row}: ${e.error}`).join('<br>');
          } else if (errs.length > 10) {
            msgEl.innerHTML += `<br><br><strong>Errores (mostrando primeros 10 de ${errs.length}):</strong><br>` + errs.slice(0, 10).map(e => `Fila ${e.row}: ${e.error}`).join('<br>');
          }
          
          await loadPrices();
        } catch(e) {
          msgEl.textContent = 'Error: ' + (e?.message || 'Error desconocido');
          msgEl.style.color = 'var(--danger, #ef4444)';
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = '📥 Importar';
        }
      };
      
      cancelBtn.onclick = () => closeModal();
      
      const cleanup = openModal();
      closeBtn.onclick = () => { cleanup?.(); closeModal(); };
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
