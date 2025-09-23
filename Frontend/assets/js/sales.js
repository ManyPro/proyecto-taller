/* assets/js/sales.js
   Ventas (panel derecho) + Cotizaciones mini y Orden de Trabajo (panel izquierdo)
*/

import { API } from "./api.js";

/* ===================== helpers ===================== */
const $  = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
const money = (n) => '$' + Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');

function openModal(){
  const modal = $('#modal'); if(!modal) return ()=>{};
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const onKey = (e)=>{ if(e.key==='Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  return ()=>document.removeEventListener('keydown', onKey);
}
function closeModal(){
  const modal = $('#modal'); if(!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

/* ========= QR PNG (preview/descarga desde backend) ========= */
const qrCache = new Map(); // itemId -> objectURL
async function getQRObjectURL(itemId, size=128){
  if(qrCache.has(itemId)) return qrCache.get(itemId);
  const tok = API.token.get?.();
  const res = await fetch(`${API.base}/api/v1/inventory/items/${itemId}/qr.png?size=${size}`, {
    headers: tok ? { 'Authorization': `Bearer ${tok}` } : {},
    cache: 'no-store', credentials: 'omit'
  });
  if(!res.ok) throw new Error('QR no disponible');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  qrCache.set(itemId, url);
  return url;
}
function downloadBlobUrl(url, filename='qr.png'){
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
}

/* ========= PDF helpers ========= */
async function fetchCompanySafe(){
  try{
    const tok = API.token.get?.();
    const r = await fetch(`${API.base}/api/v1/auth/company/me`, {
      headers: tok ? { 'Authorization': `Bearer ${tok}` } : {},
      cache:'no-store', credentials:'omit'
    });
    if (!r.ok) return null;
    return await r.json();
  }catch{ return null; }
}
async function buildSalePdf(sale){
  const jsPDF = window.jspdf?.jsPDF;
  if(!jsPDF){ alert('No se encontró jsPDF'); return; }
  const doc = new jsPDF('p','mm','a4');

  const when = window.dayjs ? dayjs(sale.createdAt).format('DD/MM/YYYY HH:mm') : new Date().toLocaleString();
  const nro = sale.number ? String(sale.number).padStart(5,'0') : (sale._id || '').slice(-6).toUpperCase();
  doc.setFontSize(14); doc.text('FACTURA / COMPROBANTE', 14, 16);
  doc.setFontSize(10);
  doc.text(`No: ${nro}`, 196, 22, { align: 'right' });
  doc.text(`Fecha: ${when}`, 196, 27, { align: 'right' });
  doc.text(`Estado: ${sale.status?.toUpperCase() || 'OPEN'}`, 196, 32, { align: 'right' });

  const y0=40; doc.setFontSize(11); doc.text('Cliente',14,y0); doc.text('Vehículo',110,y0);
  const c = sale.customer || {}, v = sale.vehicle || {};
  doc.setFontSize(10);
  doc.text([`Nombre: ${c.name||'-'}`, `Identificación: ${c.idNumber||'-'}`, `Tel: ${c.phone||'-'}`, `Email: ${c.email||'-'}`, `Dirección: ${c.address||'-'}`], 14, y0+6);
  doc.text([`Placa: ${v.plate||'-'}`, `Marca: ${v.brand||'-'}`, `Línea: ${v.line||'-'}`, `Motor: ${v.engine||'-'}`, `Año: ${v.year||'-'}  |  Km: ${v.mileage ?? '-'}`], 110, y0+6);

  const head=[['SKU','Descripción','Cant.','Unit','Total']];
  const body=(sale.items||[]).map(it=>[it.sku||'',it.name||'',String(it.qty||1),money(it.unitPrice||0),money(it.total||0)]);
  const startY=y0+36;
  if(typeof doc.autoTable==='function'){
    doc.autoTable({startY, head, body, styles:{fontSize:9,cellPadding:2}, headStyles:{fillColor:[15,23,42]}, theme:'grid'});
    const endY = doc.lastAutoTable.finalY || (startY+10);
    const right = (x)=>196-x;
    doc.setFontSize(11);
    doc.text(`Subtotal: ${money(sale.subtotal||0)}`, right(0), endY+8, {align:'right'});
    doc.text(`Impuestos: ${money(sale.tax||0)}`, right(0), endY+14, {align:'right'});
    doc.setFontSize(13);
    doc.text(`TOTAL: ${money(sale.total||0)}`, right(0), endY+22, {align:'right'});
  }
  doc.setFontSize(9); doc.text('Gracias por su compra.', 14, 290);
  return doc;
}

/* ===================== Estado de ventas ===================== */
let current = null; // venta activa
const OPEN_KEY = `sales:openTabs:${API.getActiveCompany?.() || 'default'}`;
let openTabs = [];
try { openTabs = JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); } catch { openTabs = []; }
function saveTabs(){ try { localStorage.setItem(OPEN_KEY, JSON.stringify(openTabs)); } catch{} }
function addOpen(id){ if(!openTabs.includes(id)){ openTabs.push(id); saveTabs(); } renderSaleTabs(); }
function removeOpen(id){ openTabs = openTabs.filter(x => x !== id); saveTabs(); renderSaleTabs(); }

/* ======================== UI Ventas ======================== */
export function initSales(){
  const tab = document.getElementById('tab-ventas');
  if(!tab) return;

  /* refs Ventas (derecha) */
  const tableBody = $('#sales-body');
  const totalEl   = $('#sales-total');

  async function switchTo(id){
    current = await API.sales.get(id);
    addOpen(id);
    renderSale(); renderMiniCustomer(); renderWorkOrder();
  }

  function renderSaleTabs(){
    const wrap = document.getElementById('saleTabs');
    if(!wrap) return;
    wrap.innerHTML = openTabs.map(id => `
      <span class="sales-tab ${current && current._id===id ? 'active':''}" data-id="${id}">
        Vta ${String(id).slice(-4).toUpperCase()} <b class="close" data-x="${id}">×</b>
      </span>
    `).join('') || `<span class="sales-tab">— sin ventas abiertas —</span>`;
    wrap.querySelectorAll('.sales-tab').forEach(el => {
      el.onclick = () => { const id = el.dataset.id; if(id) switchTo(id); };
    });
    wrap.querySelectorAll('[data-x]').forEach(el => {
      el.onclick = (e)=>{ e.stopPropagation(); removeOpen(el.dataset.x); if (current?._id===el.dataset.x){ current=null; renderSale(); } };
    });
  }

  function renderSale(){
    if(!current){ tableBody.innerHTML=''; totalEl.textContent='$0'; return; }
    tableBody.innerHTML = (current.items||[]).map(it=>`
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

    tableBody.querySelectorAll('tr').forEach(tr=>{
      const itemId = tr.dataset.id;
      tr.querySelector('.qty').onchange = async (e)=>{ 
        const qty = Number(e.target.value||0);
        current = await API.sales.updateItem(current._id, itemId, { qty });
        renderSale(); renderWorkOrder();
      };
      tr.querySelector('.u').onchange = async (e)=>{ 
        const unitPrice = Number(e.target.value||0);
        current = await API.sales.updateItem(current._id, itemId, { unitPrice });
        renderSale(); renderWorkOrder();
      };
      tr.querySelector('[data-del]').onclick = async ()=>{ 
        current = await API.sales.removeItem(current._id, itemId);
        renderSale(); renderWorkOrder();
      };
    });
  }

  /* ===== mini cliente/vehículo ===== */
  function renderMiniCustomer(){
    const c = current?.customer || {};
    const v = current?.vehicle || {};
    $('#sv-mini-plate').textContent = v?.plate ? v.plate.toUpperCase() : '—';
    $('#sv-mini-name').textContent  = `Cliente: ${c?.name || '—'}`;
    $('#sv-mini-phone').textContent = `Cel: ${c?.phone || '—'}`;
  }

  function openCVModal(){
    const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
    if(!modal || !bodyM) return alert('No se encontró el modal global');
    bodyM.innerHTML = '';
    const tpl = $('#sales-cv-template');
    const node = tpl.content.cloneNode(true);
    bodyM.appendChild(node);

    const c = current?.customer || {}, v = current?.vehicle || {};
    $('#c-name').value = c.name || ''; $('#c-id').value = c.idNumber || '';
    $('#c-phone').value= c.phone || ''; $('#c-email').value= c.email || '';
    $('#c-address').value = c.address || '';
    $('#v-plate').value = v.plate || ''; $('#v-brand').value = v.brand || '';
    $('#v-line').value  = v.line  || ''; $('#v-engine').value = v.engine || '';
    $('#v-year').value  = v.year  || ''; $('#v-mile').value   = v.mileage || '';

    $('#sales-save-cv').onclick = async ()=>{
      if(!current) return;
      const customer = {
        name: $('#c-name').value, idNumber: $('#c-id').value,
        phone: $('#c-phone').value, email: $('#c-email').value, address: $('#c-address').value
      };
      const vehicle = {
        plate: $('#v-plate').value, brand: $('#v-brand').value, line: $('#v-line').value,
        engine: $('#v-engine').value, year: Number($('#v-year').value || 0) || null, mileage: Number($('#v-mile').value || 0) || null
      };
      current = await API.sales.setCustomerVehicle(current._id, { customer, vehicle });
      renderMiniCustomer();
      closeModal();
    };

    const cleanupKey = openModal();
    closeBtn && (closeBtn.onclick = () => { cleanupKey?.(); closeModal(); });
  }
  $('#sv-edit-cv').onclick = openCVModal;

  /* ===== acciones base ventas ===== */
  $('#sales-start').onclick = async ()=>{ current = await API.sales.start(); addOpen(current._id); renderSale(); renderMiniCustomer(); renderWorkOrder(); };

  $('#sales-add-sku').onclick = async ()=>{
    if(!current) return alert('Crea primero una venta');
    const sku = String($('#sales-sku').value||'').trim().toUpperCase();
    if(!sku) return;
    current = await API.sales.addItem(current._id, { source:'inventory', sku, qty:1 });
    $('#sales-sku').value = '';
    renderSale(); renderWorkOrder();
  };

  $('#sales-share-wa').onclick = async ()=>{
    if(!current) return;
    const company = await fetchCompanySafe();
    const nro = current.number ? String(current.number).padStart(5,'0') : (current._id || '').slice(-6).toUpperCase();
    const when = window.dayjs ? dayjs(current.createdAt).format('DD/MM/YYYY HH:mm') : new Date().toLocaleString();
    const lines = (current.items||[]).map(it => `• ${it.sku||''} x${it.qty||1} — ${it.name||''} — ${money(it.total||0)}`);
    const header = `*${company?.name || 'Taller'}*%0A*Venta No.* ${nro} — ${when}`;
    const body   = lines.join('%0A') || '— sin ítems —';
    const footer = `%0A*TOTAL:* ${money(current.total||0)}`;
    const url = `https://wa.me/?text=${header}%0A%0A${body}%0A%0A${footer}`;
    window.open(url, '_blank');
  };

  $('#sales-print').onclick = async ()=>{ if(!current) return; const doc = await buildSalePdf(current); doc.save(`venta_${current.number||current._id}.pdf`); };

  $('#sales-close').onclick = async ()=>{
    if(!current) return;
    try{
      await API.sales.close(current._id);
      removeOpen(current._id);
      current = null;
      renderSale(); renderMiniCustomer(); renderWorkOrder();
    }catch(e){ alert(e?.message || 'No se pudo cerrar'); }
  };

  renderSaleTabs();

  /* =================== Panel izquierdo =================== */
  // ------ Cotizaciones mini ------
  let miniQuote = null;

  function renderMiniQuote(){
    const hdr = $('#sv-q-header'), tbody = $('#sv-q-body');
    if(!miniQuote){ hdr.textContent = '— ninguna cotización cargada —'; tbody.innerHTML=''; return; }
    hdr.textContent = `Cotización ${miniQuote.number || '—'} — ${miniQuote.vehicle?.plate || '—'} — ${miniQuote.customer?.name || '—'}`;

    const rows = (miniQuote.items||[]).map((r,i)=>`
      <tr data-i="${i}">
        <td>${String(r.kind||'').toUpperCase().startsWith('SERV') ? 'Serv.' : 'Prod.'}</td>
        <td>${r.description || ''}</td>
        <td class="t-center">${r.qty || 1}</td>
        <td class="t-right">${money(r.unitPrice||0)}</td>
        <td class="t-right">${money(r.subtotal || ((r.qty||1)*(r.unitPrice||0)))}</td>
        <td class="t-center"><button class="secondary" data-pass>→</button></td>
      </tr>
    `).join('');
    tbody.innerHTML = rows;

    tbody.querySelectorAll('[data-pass]').forEach(btn=>{
      btn.onclick = ()=>{ if(!current) return alert('Crea primero una venta'); openInventoryPicker(); };
    });
    renderWorkOrder();
  }

  // ---- Orden de trabajo (muestra ítems de la venta actual) ----
  function renderWorkOrder(){
    const tbody = $('#sv-wo-body');
    const items = current?.items || [];
    tbody.innerHTML = items.map(it=>`
      <tr><td>${it.name || ''}</td><td class="t-center">${it.qty || 1}</td></tr>
    `).join('');
  }

  $('#sv-q-to-sale').onclick = ()=>{
    if(!current) return alert('Crea primero una venta');
    if(!miniQuote?.items?.length) return alert('No hay ítems en la cotización');
    openPricesPicker(); // estrategia: mapear equivalentes vs lista de precios
  };

  $('#sv-print-wo').onclick = ()=>{
    if(!current) return alert('Crea primero una venta');
    const jsPDF = window.jspdf?.jsPDF; if(!jsPDF) return alert('No se encontró jsPDF');
    const doc = new jsPDF('p','mm','a4');
    doc.setFontSize(16); doc.text('ORDEN DE TRABAJO', 14, 18);
    const c = current.customer || {}, v = current.vehicle || {};
    doc.setFontSize(11);
    doc.text(`Cliente: ${c.name||'-'}`, 14, 28);
    doc.text(`Tel: ${c.phone||'-'}  •  Email: ${c.email||'-'}`, 14, 34);
    doc.text(`Placa: ${v.plate||'-'}  •  Vehículo: ${[v.brand,v.line,v.year].filter(Boolean).join(' ')||'-'}`, 14, 40);
    const head = [['Descripción','Cant.']], body = (current.items||[]).map(it => [it.name||'', String(it.qty||1)]);
    const startY = 48;
    if(typeof doc.autoTable==='function'){
      doc.autoTable({ startY, head, body, styles:{fontSize:10, cellPadding:2}, headStyles:{ fillColor:[15,23,42] }, theme:'grid' });
    }
    doc.save(`OT_${(current.number||'OPEN')}.pdf`);
  };

  /* =================== Picker de COTIZACIONES (modal) =================== */
  async function openQuotePicker(){
    const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
    if(!modal || !bodyM) return alert('No se encontró el modal global');
    bodyM.innerHTML = '';

    // Clonamos el template del index (sin inyectar HTML desde JS)
    const tpl = $('#pick-quote-template');
    if(!tpl) return alert('Falta <template id="pick-quote-template"> en index.html');
    bodyM.appendChild(tpl.content.cloneNode(true));

    const cleanupKey = openModal();
    closeBtn && (closeBtn.onclick = () => { cleanupKey?.(); closeModal(); });

    // Refs del modal
    const iText = $('#pq-text'), iFrom = $('#pq-from'), iTo = $('#pq-to');
    const btnSearch = $('#pq-search'), btnClear = $('#pq-clear'), btnMore = $('#pq-more');
    const tbody = $('#pq-body'), countEl = $('#pq-count');
    const pvMeta = $('#pq-meta'), pvBody = $('#pq-items');

    // Estado de resultados
    let all = []; let shown = 0; const PAGE = 20;

    function fmtDate(d){ try{ return (window.dayjs? dayjs(d).format('DD/MM/YYYY HH:mm') : new Date(d).toLocaleString()); }catch{ return '-'; } }

    function renderPreview(q){
      pvMeta.textContent = q ? `#${q.number || '—'} — ${q.vehicle?.plate || '—'} — ${q.customer?.name || '—'}` : '—';
      pvBody.innerHTML = (q?.items||[]).map(r => `
        <tr>
          <td>${String(r.kind||'').toUpperCase().startsWith('SERV')?'Serv.':'Prod.'}</td>
          <td>${r.description||''}</td>
          <td class="t-center">${r.qty ?? 1}</td>
          <td class="t-right">${money(r.unitPrice||0)}</td>
          <td class="t-right">${money(r.subtotal || ((r.qty||1)*(r.unitPrice||0)))}</td>
        </tr>
      `).join('');
    }

    function renderSlice(){
      const chunk = all.slice(0, shown);
      tbody.innerHTML = chunk.map((q,i)=>`
        <tr data-i="${i}">
          <td>${q.number || '—'}</td>
          <td>${fmtDate(q.createdAt)}</td>
          <td>${q.vehicle?.plate || '—'}</td>
          <td>${q.customer?.name || '—'}</td>
          <td class="t-right">${(q.items||[]).length}</td>
          <td class="t-right">${money(q.total||0)}</td>
          <td class="t-right"><button data-use="${i}">Usar</button></td>
        </tr>
      `).join('') || `<tr><td colspan="99">Sin resultados</td></tr>`;
      countEl.textContent = chunk.length ? `${chunk.length}/${all.length}` : '';

      // Interacciones
      tbody.querySelectorAll('tr').forEach(tr=>{
        tr.ondblclick = ()=>{ const i = Number(tr.dataset.i); if(!isNaN(i)) useQuote(chunk[i]); };
        tr.onmouseenter = ()=>{ const i = Number(tr.dataset.i); if(!isNaN(i)) renderPreview(chunk[i]); };
      });
      tbody.querySelectorAll('[data-use]').forEach(btn=>{
        btn.onclick = ()=>{ const i = Number(btn.dataset.use); if(!isNaN(i)) useQuote(chunk[i]); };
      });
    }

    function useQuote(q){
      miniQuote = q;
      renderMiniQuote();
      cleanupKey?.(); closeModal();
    }

    async function doSearch(){
      const params = {
        q: String(iText.value||'').trim(),
        from: iFrom.value || undefined,
        to:   iTo.value   || undefined
      };
      try{
        // Preferimos API.quotesSearch({q,from,to}); si no, reusamos quotesList con toQuery
        const list = API.quotesSearch
          ? await API.quotesSearch(params)
          : await API.quotesList(('?' + new URLSearchParams(Object.entries(params).filter(([_,v])=>v)).toString()));
        all = Array.isArray(list?.data) ? list.data : (Array.isArray(list) ? list : []);
        shown = Math.min(PAGE, all.length);
        renderSlice();
        renderPreview(all[0]);
      }catch(e){ alert(e?.message || 'No se pudo listar cotizaciones'); }
    }

    btnSearch.onclick = doSearch;
    btnClear.onclick  = ()=>{ iText.value=''; iFrom.value=''; iTo.value=''; doSearch(); };
    iText.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });

    btnMore.onclick = ()=>{ shown = Math.min(shown + PAGE, all.length); renderSlice(); };

    // Primera carga: recientes
    doSearch();
  }

  // Botones de cotizaciones mini
  $('#sv-loadQuote').onclick = openQuotePicker;
  $('#sv-newQuote').onclick  = ()=>{ miniQuote = { number: 'NUEVA', items: [], customer:{}, vehicle:{} }; renderMiniQuote(); };

  /* =================== Pickers de Inventario / Precios =================== */
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

    async function fetchItems(params){
      const r = await API.inventory.itemsList(params);
      return Array.isArray(r) ? r : (r.items || r.data || []);
    }

    const renderSlice = async ()=>{
      const chunk = all.slice(0, shown);
      const rows = await Promise.all(chunk.map(async it => {
        let thumb = '';
        try {
          const f = Array.isArray(it.files) ? it.files[0] : null;
          const url = f?.url || f?.secureUrl || f?.path || null;
          if (url) thumb = `<img src="${url}" alt="img" class="thumb">`;
        } catch {}

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

      $('#p-inv-body').querySelectorAll('button[data-add]').forEach(btn=>{
        btn.onclick = async ()=>{
          const id = btn.getAttribute('data-add');
          current = await API.sales.addItem(current._id, { source:'inventory', refId: id, qty: 1 });
          renderSale(); renderWorkOrder();
        };
      });
      $('#p-inv-body').querySelectorAll('img[data-qr]').forEach(img=>{
        img.onclick = async ()=>{
          const id = img.getAttribute('data-qr');
          try { const url = await getQRObjectURL(id, 256); downloadBlobUrl(url, `qr_${id}.png`); }
          catch(e){ alert('No se pudo descargar el QR'); }
        };
      });
    };

    const doSearch = async ()=>{
      const rawSku = String($('#p-inv-sku').value||'').trim();
      const sku = rawSku.toUpperCase();
      const name = String($('#p-inv-name').value||'').trim();

      try {
        let list = await fetchItems({ sku, name });
        if (!list.length && (sku || name)) {
          const q = [sku, name].filter(Boolean).join(' ');
          list = await fetchItems({ q }) || await fetchItems({ text: q });
        }
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
      } catch(e) { alert(e?.message || 'No se pudo buscar inventario'); }
    };

    $('#p-inv-search').onclick = doSearch;
    $('#p-inv-sku').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });
    $('#p-inv-name').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });
    $('#p-inv-more').onclick = async ()=>{ shown = Math.min(shown + PAGE, all.length); await renderSlice(); };

    doSearch();
  }

  async function openPricesPicker(){
    if(!current) return alert('Crea primero una venta');
    const modal = $('#modal'), bodyM = $('#modalBody'), closeBtn = $('#modalClose');
    if(!modal || !bodyM) return alert('No se encontró el modal global');

    let services = [];
    try { services = (await API.servicesList())?.items || (await API.servicesList()) || []; } catch {}
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
        <th>Total</th><th></th>
      `;
    };
    renderHead();

    let all = []; let shown = 0; const PAGE = 25;

    async function fetchPrices(params){
      const r = await API.pricesList(params);
      const data = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : (r.items || []));
      return data;
    }

    function renderSlice(){
      const vars = selectedSvc?.variables || [];
      const chunk = all.slice(0, shown);
      $('#p-pr-body').innerHTML = chunk.map(row=>{
        const cols = vars.map(v => money(row?.variables?.[v.key] ?? 0)).join('</td><td>');
        return `
          <tr>
            <td>${row.brand||''}</td>
            <td>${row.line||row.model||''}</td>
            <td>${row.engine||''}</td>
            <td>${row.year||''}</td>
            <td class="t-right">${cols}</td>
            <td class="t-right">${money(row.total||0)}</td>
            <td class="t-right"><button data-add="${row._id}">Agregar</button></td>
          </tr>
        `;
      }).join('') || `<tr><td colspan="99">Sin resultados</td></tr>`;
      $('#p-pr-count').textContent = chunk.length ? `${chunk.length}/${all.length}` : '';

      $('#p-pr-body').querySelectorAll('button[data-add]').forEach(btn=>{
        btn.onclick = async ()=>{
          current = await API.sales.addItem(current._id, { source:'prices', refId: btn.dataset.add, qty:1 });
          renderSale(); renderWorkOrder();
        };
      });
    }

    async function doSearch(){
      const brand  = $('#p-pr-brand').value || undefined;
      const line   = $('#p-pr-line').value  || undefined;
      const engine = $('#p-pr-engine').value|| undefined;
      const year   = $('#p-pr-year').value  || undefined;
      const svcId  = ($('#p-pr-svc').value || selectedSvc?._id) || undefined;

      try{
        const list = await fetchPrices({ brand, line, engine, year, svcId });
        all = list || []; shown = Math.min(PAGE, all.length);
        renderSlice();
      }catch(e){ alert(e?.message || 'No se pudo buscar lista de precios'); }
    }

    $('#p-pr-search').onclick = doSearch;
    $('#p-pr-svc').onchange = ()=>{ selectedSvc = services.find(s=>s._id===$('#p-pr-svc').value) || selectedSvc; renderHead(); doSearch(); };
    $('#p-pr-more').onclick = ()=>{ shown = Math.min(shown + PAGE, all.length); renderSlice(); };

    doSearch();
  }

  // Render inicial
  renderSale();
  renderMiniCustomer();
  renderWorkOrder();
}
