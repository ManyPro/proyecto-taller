import { API } from "./api.js"; // asumimos que ya gestiona Bearer

const $ = (s)=>document.querySelector(s);
const money = (n)=>'$'+Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');

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

  // Actions
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

  $('#sales-add-inv').onclick = ()=> alert('TODO: selector desde Inventario');
  $('#sales-add-prices').onclick = ()=> alert('TODO: selector desde Lista de Precios');

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
