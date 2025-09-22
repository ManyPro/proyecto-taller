import { API } from "./api.js"; // gestiona Bearer

const $ = (s)=>document.querySelector(s);
const money = (n)=>'$'+Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');

function openModal() {
  const modal = $('#modal'); if (!modal) return () => {};
  modal.classList.remove('hidden');
  const onKey = (e)=>{ if (e.key === 'Escape') closeModal(); };
  const onOverlay = (e)=>{ if (e.target === modal) closeModal(); };
  document.addEventListener('keydown', onKey);
  modal.addEventListener('click', onOverlay, { once:true });
  document.body.style.overflow = 'hidden';
  return () => document.removeEventListener('keydown', onKey);
}
function closeModal(){
  const modal = $('#modal'); if(!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ===== Helpers de imagen QR (requiere Bearer) =====
const qrCache = new Map(); // itemId -> objectURL
async function getQRObjectURL(itemId, size=128){
  if(qrCache.has(itemId)) return qrCache.get(itemId);
  const tok = API.token.get();
  const res = await fetch(`${API.base}/api/v1/inventory/items/${itemId}/qr.png?size=${size}`, {
    headers: tok ? { 'Authorization': `Bearer ${tok}` } : {},
    cache: 'no-store',
    credentials: 'omit'
  });
  if(!res.ok) throw new Error('QR no disponible');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  qrCache.set(itemId, url);
  return url;
}
function downloadBlobUrl(url, filename='qr.png'){
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
}

// ====== UI Ventas ======
export function initSales(){
  const tab = document.getElementById('tab-ventas');
  if(!tab) return; // si no existe la sección, no arranca

  tab.innerHTML = `
    <div class="row between">
      <div>
        <label>Destino:</label>
        <select id="sales-dest">
          <option value="sale" selected>Venta</option>
          <option value="quote">Cotización</option>
        </select>
        <button id="sales-start">Nueva venta</button>
      </div>
      <div>
        <button id="sales-print" class="secondary">Imprimir</button>
        <button id="sales-close" class="danger">Cerrar venta</button>
      </div>
    </div>

    <div class="row">
      <input id="sales-sku" placeholder="Escanea/ingresa SKU o QR" />
      <button id="sales-add-sku">Agregar</button>
      <button id="sales-add-inv" class="secondary">Agregar de Inventario</button>
      <button id="sales-add-prices" class="secondary">Agregar de Lista de Precios</button>
    </div>

    <div class="grid">
      <div>
        <table class="table" id="sales-table">
          <thead>
            <tr><th>SKU</th><th>Descripción</th><th>Cant.</th><th>Unit</th><th>Total</th><th></th></tr>
          </thead>
          <tbody id="sales-body"></tbody>
          <tfoot>
            <tr><td colspan="4" class="t-right">Total</td><td id="sales-total">$0</td><td></td></tr>
          </tfoot>
        </table>
      </div>
      <aside>
        <div class="card">
          <h3>Cliente & Vehículo</h3>
          <div class="col">
            <input id="c-name" placeholder="Nombre/Empresa">
            <input id="c-id" placeholder="Identificación">
            <input id="c-phone" placeholder="Teléfono">
            <input id="c-email" placeholder="Email">
            <input id="c-address" placeholder="Dirección">
          </div>
          <div class="col">
            <input id="v-plate" placeholder="Placa (ABC123)">
            <input id="v-brand" placeholder="Marca">
            <input id="v-line" placeholder="Línea">
            <input id="v-engine" placeholder="Motor">
            <input id="v-year" placeholder="Año" type="number">
            <input id="v-mile" placeholder="Kilometraje" type="number">
          </div>
          <button id="sales-save-cv">Guardar Cliente/Auto</button>
        </div>
      </aside>
    </div>
  `;

  let current = null; // venta actual

  const body = $('#sales-body');
  const totalEl = $('#sales-total');

  function render(){
    if(!current){ body.innerHTML=''; totalEl.textContent='$0'; return; }
    body.innerHTML = (current.items||[]).map(it=>`
      <tr data-id="${it._id}">
        <td>${it.sku||''}</td>
        <td>${it.name||''}</td>
        <td><input type="number" min="0" step="1" value="${it.qty||1}" class="qty"></td>
        <td><input type="number" min="0" step="1" value="${it.unitPrice||0}" class="u"></td>
        <td>${money(it.total||0)}</td>
        <td><button class="danger" data-del>Eliminar</button></td>
      </tr>
    `).join('');
    totalEl.textContent = money(current.total||0);

    // Bind qty/unit updates
    body.querySelectorAll('tr').forEach(tr=>{
      const itemId = tr.dataset.id;
      tr.querySelector('.qty').onchange = async (e)=>{
        const qty = Number(e.target.value||0);
        current = await API.sales.updateItem(current._id, itemId, { qty });
        render();
      };
      tr.querySelector('.u').onchange = async (e)=>{
        const unitPrice = Number(e.target.value||0);
        current = await API.sales.updateItem(current._id, itemId, { unitPrice });
        render();
      };
      tr.querySelector('[data-del]').onclick = async ()=>{
        current = await API.sales.removeItem(current._id, itemId);
        render();
      };
    });
  }

  // Actions base
  $('#sales-start').onclick = async ()=>{
    current = await API.sales.start();
    render();
  };

  $('#sales-add-sku').onclick = async ()=>{
    if(!current) return alert('Crea primero una venta');
    const sku = String($('#sales-sku').value||'').trim().toUpperCase(); // normalizamos a MAYÚSCULAS
    if(!sku) return;
    current = await API.sales.addItem(current._id, { source:'inventory', sku, qty:1 });
    $('#sales-sku').value = '';
    render();
  };

  // ====== PICKERS (Inventario / Precios) ======
  $('#sales-add-inv').onclick = () => openInventoryPicker();
  $('#sales-add-prices').onclick = () => openPricesPicker();

  async function openInventoryPicker(){
    if(!current) return alert('Crea primero una venta');
    const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
    if(!modal || !bodyM) return alert('No se encontró el modal global');

    bodyM.innerHTML = `
      <h3>Agregar de Inventario</h3>
      <div class="picker-head">
        <div><label>SKU</label><input id="p-inv-sku" placeholder="SKU exacto"></div>
        <div><label>Nombre</label><input id="p-inv-name" placeholder="Buscar por nombre"></div>
        <div><button id="p-inv-search">Buscar</button></div>
      </div>
      <div class="picker-table table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Vista</th><th>SKU</th><th>Nombre</th><th>Stock</th><th>Precio</th><th>QR</th><th></th>
            </tr>
          </thead>
          <tbody id="p-inv-body"></tbody>
        </table>
      </div>
      <div class="picker-actions row">
        <button id="p-inv-more" class="secondary">Cargar más</button>
        <span class="muted" id="p-inv-count"></span>
      </div>
    `;
    const cleanupKey = openModal();
    closeBtn && (closeBtn.onclick = () => { cleanupKey?.(); closeModal(); });

    let all = []; let shown = 0; const PAGE = 20;

    const renderSlice = async ()=>{
      const chunk = all.slice(0, shown);
      const rows = await Promise.all(chunk.map(async it => {
        // Miniatura del ítem (primer archivo si existe)
        let thumb = '';
        try {
          const f = Array.isArray(it.files) ? it.files[0] : null;
          const url = f?.url || f?.secureUrl || f?.path || null;
          if (url) thumb = `<img src="${url}" alt="img" class="thumb">`;
        } catch {}

        // QR (objectURL con Bearer, miniatura clickeable para descargar)
        let qrCell = '—';
        try {
          const qrUrl = await getQRObjectURL(it._id, 96);
          qrCell = `<img src="${qrUrl}" alt="QR" class="thumb-qr" title="Click para descargar" data-qr="${it._id}">`;
        } catch {}

        return `
          <tr>
            <td class="w-fit">${thumb || '—'}</td>
            <td>${it.sku||''}</td>
            <td>${it.name||''}</td>
            <td>${Number(it.stock||0)}</td>
            <td>${money(it.salePrice||0)}</td>
            <td class="w-fit">${qrCell}</td>
            <td><button data-add="${it._id}">Agregar</button></td>
          </tr>
        `;
      }));
      $('#p-inv-body').innerHTML = rows.join('') || `<tr><td colspan="99">Sin resultados</td></tr>`;
      $('#p-inv-count').textContent = chunk.length ? `${chunk.length}/${all.length}` : '';

      // binds agregar
      $('#p-inv-body').querySelectorAll('button[data-add]').forEach(btn=>{
        btn.onclick = async ()=>{
          const id = btn.getAttribute('data-add');
          current = await API.sales.addItem(current._id, { source:'inventory', refId: id, qty: 1 });
          render();
        };
      });
      // binds QR download
      $('#p-inv-body').querySelectorAll('img[data-qr]').forEach(img=>{
        img.onclick = async ()=>{
          const id = img.getAttribute('data-qr');
          try {
            const url = await getQRObjectURL(id, 256);
            downloadBlobUrl(url, `qr_${id}.png`);
          } catch(e){ alert('No se pudo descargar el QR'); }
        };
      });
    };

    // --- Helper normalizado: siempre devuelve array (r | r.items | r.data) ---
    async function fetchItems(params){
      const r = await API.inventory.itemsList(params);
      return Array.isArray(r) ? r : (r.items || r.data || []);
    }

    const doSearch = async ()=>{
      const rawSku = String($('#p-inv-sku').value||'').trim();
      const sku = rawSku.toUpperCase();            // normalizar a mayúsculas
      const name = String($('#p-inv-name').value||'').trim();

      try {
        // 1) intento directo con sku/name
        let list = await fetchItems({ sku, name });

        // 2) si no hay, intenta con 'q'
        if (!list.length && (sku || name)) {
          const q = [sku, name].filter(Boolean).join(' ');
          list = await fetchItems({ q });
        }

        // 3) si no hay, intenta con 'text'
        if (!list.length && (sku || name)) {
          const q = [sku, name].filter(Boolean).join(' ');
          list = await fetchItems({ text: q });
        }

        // 4) si sigue vacío, trae todo y filtra en cliente
        if (!list.length && (sku || name)) {
          const allSrv = await fetchItems({});
          const needle = (sku || name).toLowerCase();
          list = (allSrv || []).filter(it => {
            const s = String(it.sku||'').toLowerCase();
            const n = String(it.name||'').toLowerCase();
            return s.includes(needle) || n.includes(needle);
          });
        }

        all = list || [];
        shown = Math.min(PAGE, all.length);
        await renderSlice();
      } catch(e) {
        alert(e?.message || 'No se pudo buscar inventario');
      }
    };

    $('#p-inv-search').onclick = doSearch;
    $('#p-inv-sku').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });
    $('#p-inv-name').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });
    $('#p-inv-more').onclick = async ()=>{ shown = Math.min(shown + PAGE, all.length); await renderSlice(); };

    // Primer load vacío
    doSearch();
  }

  async function openPricesPicker(){
    if(!current) return alert('Crea primero una venta');
    const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
    if(!modal || !bodyM) return alert('No se encontró el modal global');

    // Traer servicios para filtrar por servicio
    let services = [];
    try { services = (await API.servicesList())?.items || (await API.servicesList()) || []; } catch {}

    // Servicio seleccionado y sus variables (para columnas dinámicas)
    let selectedSvc = services[0] || { variables: [] };

    bodyM.innerHTML = `
      <h3>Agregar de Lista de Precios</h3>
      <div class="picker-head">
        <div>
          <label>Servicio</label>
          <select id="p-pr-svc">
            ${services.map(s=>`<option value="${s._id}">${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="row" style="gap:8px; align-items:end;">
          <div><label>Marca</label><input id="p-pr-brand" placeholder="Ej. RENAULT"></div>
          <div><label>Línea</label><input id="p-pr-line" placeholder="Ej. LOGAN"></div>
          <div><label>Motor</label><input id="p-pr-engine" placeholder="Ej. 1.6"></div>
          <div><label>Año</label><input id="p-pr-year" type="number" placeholder="Ej. 2020"></div>
          <div><button id="p-pr-search">Buscar</button></div>
        </div>
      </div>

      <div class="picker-table table-wrap">
        <table class="table" id="p-pr-table">
          <thead><tr id="p-pr-head"></tr></thead>
          <tbody id="p-pr-body"></tbody>
        </table>
      </div>
      <div class="picker-actions row">
        <button id="p-pr-more" class="secondary">Cargar más</button>
        <span class="muted" id="p-pr-count"></span>
      </div>
    `;
    const cleanupKey = openModal();
    closeBtn && (closeBtn.onclick = () => { cleanupKey?.(); closeModal(); });

    const headEl = $('#p-pr-head');
    const renderHead = ()=>{
      const vars = selectedSvc?.variables || [];
      headEl.innerHTML = `
        <th>Marca</th><th>Línea</th><th>Motor</th><th>Año</th>
        ${vars.map(v=>`<th>${v.label}</th>`).join('')}
        <th>Total</th><th></th>`;
    };

    let all = []; let shown = 0; const PAGE = 20;

    const renderSlice = ()=>{
      const vars = selectedSvc?.variables || [];
      const chunk = all.slice(0, shown);
      $('#p-pr-body').innerHTML = chunk.map(pe=>{
        const cells = vars.map(v => {
          const val = pe.variables?.[v.key] ?? (v.type==='number' ? 0 : '');
          return `<td>${v.type==='number' ? money(val) : (val||'')}</td>`;
        }).join('');
        return `
          <tr>
            <td>${pe.brand||''}</td>
            <td>${pe.line||''}</td>
            <td>${pe.engine||''}</td>
            <td>${pe.year ?? ''}</td>
            ${cells}
            <td>${money(pe.total||0)}</td>
            <td><button data-add="${pe._id}">Agregar</button></td>
          </tr>
        `;
      }).join('') || `<tr><td colspan="99">Sin resultados</td></tr>`;
      $('#p-pr-count').textContent = chunk.length ? `${chunk.length}/${all.length}` : '';
      // binds
      $('#p-pr-body').querySelectorAll('button[data-add]').forEach(btn=>{
        btn.onclick = async ()=>{
          const id = btn.getAttribute('data-add');
          current = await API.sales.addItem(current._id, { source:'price', refId: id, qty: 1 });
          render();
        };
      });
    };

    const doSearch = async ()=>{
      const serviceId = ($('#p-pr-svc')?.value || '').trim();
      selectedSvc = services.find(s=>s._id===serviceId) || selectedSvc;
      renderHead();
      const brand  = String($('#p-pr-brand').value||'').trim();
      const line   = String($('#p-pr-line').value||'').trim();
      const engine = String($('#p-pr-engine').value||'').trim();
      const year   = String($('#p-pr-year').value||'').trim();
      try {
        const params = { serviceId, brand, line, engine, year };
        const res = await API.pricesList(params);
        all = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
        shown = Math.min(PAGE, all.length);
        renderSlice();
      } catch(e) {
        alert(e?.message || 'No se pudo buscar lista de precios');
      }
    };

    $('#p-pr-search').onclick = doSearch;
    ['p-pr-brand','p-pr-line','p-pr-engine','p-pr-year'].forEach(id=>{
      document.getElementById(id).addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });
    });
    $('#p-pr-svc')?.addEventListener('change', doSearch);
    $('#p-pr-more').onclick = ()=>{ shown = Math.min(shown + PAGE, all.length); renderSlice(); };

    // Primer load
    renderHead();
    doSearch();
  }

  $('#sales-save-cv').onclick = async ()=>{
    if(!current) return alert('Crea primero una venta');
    const customer = {
      name: $('#c-name').value, idNumber: $('#c-id').value,
      phone: $('#c-phone').value, email: $('#c-email').value, address: $('#c-address').value
    };
    const vehicle = {
      plate: $('#v-plate').value, brand: $('#v-brand').value, line: $('#v-line').value,
      engine: $('#v-engine').value, year: Number($('#v-year').value||0)||null, mileage: Number($('#v-mile').value||0)||null
    };
    current = await API.sales.setCustomerVehicle(current._id, { customer, vehicle });
    render();
  };

  $('#sales-close').onclick = async ()=>{
    if(!current) return;
    const res = await API.sales.close(current._id);
    if(res?.ok){ alert('Venta cerrada'); current = res.sale; render(); }
  };
}
