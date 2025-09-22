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
    const sku = String($('#sales-sku').value||'').trim();
    if(!sku) return;
    current = await API.sales.addItem(current._id, { source:'inventory', sku, qty:1 });
    $('#sales-sku').value = '';
    render();
  };

  // ====== Slice 2: PICKERS ======
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
          <thead><tr><th>SKU</th><th>Nombre</th><th>Stock</th><th>Precio</th><th></th></tr></thead>
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

    const renderSlice = ()=>{
      const chunk = all.slice(0, shown);
      $('#p-inv-body').innerHTML = chunk.map(it=>`
        <tr>
          <td>${it.sku||''}</td>
          <td>${it.name||''}</td>
          <td>${Number(it.stock||0)}</td>
          <td>${money(it.salePrice||0)}</td>
          <td><button data-add="${it._id}">Agregar</button></td>
        </tr>
      `).join('') || `<tr><td colspan="99">Sin resultados</td></tr>`;
      $('#p-inv-count').textContent = chunk.length ? `${chunk.length}/${all.length}` : '';
      // binds
      $('#p-inv-body').querySelectorAll('button[data-add]').forEach(btn=>{
        btn.onclick = async ()=>{
          const id = btn.getAttribute('data-add');
          current = await API.sales.addItem(current._id, { source:'inventory', refId: id, qty: 1 });
          render();
        };
      });
    };

    const doSearch = async ()=>{
      const sku = String($('#p-inv-sku').value||'').trim();
      const name = String($('#p-inv-name').value||'').trim();
      try {
        // Si tu backend ignora paginación, hacemos paginado en cliente
        const res = await API.inventory.itemsList({ sku, name });
        all = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
        shown = Math.min(PAGE, all.length);
        renderSlice();
      } catch(e) {
        alert(e?.message || 'No se pudo buscar inventario');
      }
    };

    $('#p-inv-search').onclick = doSearch;
    $('#p-inv-sku').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });
    $('#p-inv-name').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });
    $('#p-inv-more').onclick = ()=>{ shown = Math.min(shown + PAGE, all.length); renderSlice(); };

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
        <table class="table">
          <thead><tr><th>Marca</th><th>Línea</th><th>Motor</th><th>Año</th><th>Total</th><th></th></tr></thead>
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

    let all = []; let shown = 0; const PAGE = 20;

    const renderSlice = ()=>{
      const chunk = all.slice(0, shown);
      $('#p-pr-body').innerHTML = chunk.map(pe=>`
        <tr>
          <td>${pe.brand||''}</td>
          <td>${pe.line||''}</td>
          <td>${pe.engine||''}</td>
          <td>${pe.year ?? ''}</td>
          <td>${money(pe.total||0)}</td>
          <td><button data-add="${pe._id}">Agregar</button></td>
        </tr>
      `).join('') || `<tr><td colspan="99">Sin resultados</td></tr>`;
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
