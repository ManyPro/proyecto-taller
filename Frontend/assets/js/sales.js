/* assets/js/sales.js — FRONTEND PURO
   Hace funcionar la pestaña de Ventas: botones, render de tabla, QR (fallback jsQR) y SSE.
   Requiere que api.js exponga API con:
     API.sales.{start,get,addItem,updateItem,removeItem,setCustomerVehicle,close,list,cancel}
     API.inventory.itemsList (picker)
     API.servicesList, API.pricesList  (picker de precios)
     API.live.connect()                 (SSE; opcional)
*/
import { API } from './api.js';

// ---------- helpers ----------
const $  = (s, r=document)=>r.querySelector(s);
const clone = (id)=>document.getElementById(id)?.content?.firstElementChild?.cloneNode(true);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));

function padSaleNumber(n){
  return String(n ?? '').toString().padStart(5,'0');
}

function describeCustomer(customer){
  const c = customer || {};
  const parts = [];
  if (c.name) parts.push(c.name);
  if (c.idNumber) parts.push('ID: ' + c.idNumber);
  if (c.phone) parts.push('Tel: ' + c.phone);
  if (c.email) parts.push(c.email);
  if (c.address) parts.push(c.address);
  return parts.join(' | ') || 'N/A';
}

function describeVehicle(vehicle){
  const v = vehicle || {};
  const parts = [];
  if (v.plate) parts.push(v.plate);
  const specs = [v.brand, v.line, v.engine].filter(Boolean).join(' ');
  if (specs) parts.push(specs.trim());
  if (v.year) parts.push('Año ' + v.year);
  if (v.mileage != null) parts.push((v.mileage || 0) + ' km');
  return parts.join(' | ') || 'N/A';
}

function printSaleTicket(sale){
  if (!sale) return;
  const number = padSaleNumber(sale.number || sale._id || '');
  const linesOut = [
    'Factura simple',
    '',
    '# ' + number + '  Total: ' + money(sale.total || 0),
    '',
    'Cliente: ' + describeCustomer(sale.customer),
    'Vehículo: ' + describeVehicle(sale.vehicle),
    '',
    'Items:'
  ];
  (sale.items || []).forEach(it => {
    linesOut.push('- ' + (it.qty || 0) + ' x ' + (it.name || it.sku || '') + ' (' + money(it.total || 0) + ')');
  });
  const txt = linesOut.join('\n');
  const win = window.open('', '_blank');
  if (!win) { alert('No se pudo abrir ventana de impresión'); return; }
  win.document.write('<pre>' + txt + '</pre>');
  win.document.close();
  win.focus();
  win.print();
  try { win.close(); } catch {}
}


// ---------- estado ----------
let es = null;         // EventSource (SSE)
let current = null;    // venta actual
let openSales = [];    // ventas abiertas (draft) compartidas
let starting = false;  // evita doble clic en "Nueva venta"
let salesRefreshTimer = null;
let lastQuoteLoaded = null; // referencia a la cotización mostrada en el mini panel

function labelForSale(sale) {
  const plate = sale?.vehicle?.plate || '';
  return plate ? `VENTA - ${plate.toUpperCase()}` : String(sale?._id || '').slice(-6).toUpperCase();
}

function syncCurrentIntoOpenList() {
  if (!current?._id) return;
  const idx = openSales.findIndex((s) => s._id === current._id);
  const copy = JSON.parse(JSON.stringify(current));
  if (idx >= 0) openSales[idx] = copy;
  else openSales.unshift(copy);
}

async function refreshOpenSales(options = {}) {
  const { focusId = null, preferCurrent = null } = options;
  try {
    const res = await API.sales.list({ status: 'draft', limit: 100 });
    const items = Array.isArray(res?.items) ? res.items : [];
    openSales = items;
    let targetId = focusId || preferCurrent?._id || current?._id || null;
    if (targetId) {
      const found = openSales.find((s) => s._id === targetId);
      if (found) {
        current = found;
      } else if (preferCurrent) {
        current = preferCurrent;
        syncCurrentIntoOpenList();
      } else if (current && current._id === targetId) {
        current = null;
      }
    }
    if (!current && openSales.length) current = openSales[0];
    renderTabs();
    renderSale();
    renderWO();
  } catch (err) {
    console.error('refreshOpenSales failed', err);
  }
}

function startSalesAutoRefresh() {
  if (salesRefreshTimer) return;
  salesRefreshTimer = setInterval(() => {
    refreshOpenSales({ focusId: current?._id || null });
  }, 10000);
}

function stopSalesAutoRefresh() {
  if (!salesRefreshTimer) return;
  clearInterval(salesRefreshTimer);
  salesRefreshTimer = null;
}


// ---------- tabs ----------
async function switchTo(id){
  try{
    const sale = await API.sales.get(id);
    current = sale;
    syncCurrentIntoOpenList();
    renderTabs(); renderSale(); renderWO();
  }catch(e){ console.error(e); }
}

function renderTabs(){
  const cont = document.getElementById('saleTabs'); if (!cont) return;
  cont.innerHTML = '';
  for (const sale of openSales){
    if (!sale?._id) continue;
    const id = sale._id;
    const tab = clone('tpl-sale-tab');
    tab.querySelector('.label').textContent = labelForSale(sale);
    if (current && id===current._id) tab.classList.add('active');
    tab.addEventListener('click', ()=> switchTo(id));
    tab.querySelector('.close').addEventListener('click', async (e)=>{
      e.stopPropagation();
      if (!confirm('Cancelar esta venta?')) return;
      try{ await API.sales.cancel(id); }catch(err){ alert(err?.message||'No se pudo cancelar'); }
      if (current && current._id===id) current=null;
      await refreshOpenSales();
    });
    cont.appendChild(tab);
  }
  if (!openSales.length){
    const hint = document.createElement('div');
    hint.className = 'tab-empty';
    hint.textContent = 'No hay ventas abiertas';
    cont.appendChild(hint);
  }
}

// ---------- mini resumen cliente/vehículo ----------
function renderMini(){
  const lp = document.getElementById('sv-mini-plate'), ln = document.getElementById('sv-mini-name'), lr = document.getElementById('sv-mini-phone');
  const c = current?.customer || {}, v = current?.vehicle || {};
  if (lp) lp.textContent = v.plate || '—';
  if (ln) ln.textContent = `Cliente: ${c.name || '—'}`;
  if (lr) lr.textContent = `Cel: ${c.phone || '—'}`;
}

// ---------- tabla de venta ----------
function renderSale(){
  const body = document.getElementById('sales-body'), total = document.getElementById('sales-total');
  if (!body) return;
  body.innerHTML = '';

  (current?.items||[]).forEach(it=>{
    const tr = clone('tpl-sale-row');
    tr.querySelector('[data-sku]').textContent = it.sku || '';
    tr.querySelector('[data-name]').textContent = it.name || '';
    const qty = tr.querySelector('.qty'); qty.value = String(it.qty||1);
    tr.querySelector('[data-unit]').textContent  = money(it.unitPrice||0);
    tr.querySelector('[data-total]').textContent = money(it.total||0);

    qty.addEventListener('change', async ()=>{
      const v = Math.max(1, Number(qty.value||1) || 1);
      current = await API.sales.updateItem(current._id, it._id, { qty: v });
      syncCurrentIntoOpenList();
        renderTabs();
      renderSale(); renderWO();
    });

    const actions = tr.querySelector('td:last-child');
    const btnEdit = document.createElement('button'); btnEdit.textContent='Editar $'; btnEdit.className='secondary';
    btnEdit.onclick = async ()=>{
      const v = prompt('Nuevo precio unitario:', String(it.unitPrice||0)); if (v==null) return;
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: Number(v)||0 });
      syncCurrentIntoOpenList();
        renderTabs();
      renderSale(); renderWO();
    };
    const btnZero = document.createElement('button'); btnZero.textContent='Precio 0'; btnZero.className='secondary';
    btnZero.onclick = async ()=>{
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: 0 });
      syncCurrentIntoOpenList();
        renderTabs();
      renderSale(); renderWO();
    };
    const btnDel = tr.querySelector('button.remove');
    btnDel.onclick = async ()=>{
      await API.sales.removeItem(current._id, it._id);
      current = await API.sales.get(current._id);
      syncCurrentIntoOpenList();
        renderTabs();
      renderSale(); renderWO();
    };
    actions.prepend(btnEdit); actions.prepend(btnZero);

    body.appendChild(tr);
  });

  if (total) total.textContent = money(current?.total||0);
  renderMini(); renderTabs();
}

// ---------- orden de trabajo (preview simple) ----------
function renderWO(){
  const b = document.getElementById('sv-wo-body'); if (!b) return;
  b.innerHTML = '';
  for(const it of (current?.items||[])){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.name||''}</td><td class="t-center">${String(it.qty||1)}</td>`;
    b.appendChild(tr);
  }
}

// ---------- modal genérico ----------
function openModal(node){
  const modal = document.getElementById('modal'), slot = document.getElementById('modalBody'), x = document.getElementById('modalClose');
  if (!modal||!slot||!x) return;
  slot.replaceChildren(node);
  modal.classList.remove('hidden');
  x.onclick = ()=> modal.classList.add('hidden');
}
function closeModal(){ const m = document.getElementById('modal'); if (m) m.classList.add('hidden'); }

// ---------- QR ----------
function openQR(){
  if (!current) return alert('Crea primero una venta');
  const tpl = document.getElementById('tpl-qr-scanner'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);

  const video = node.querySelector('#qr-video');
  const canvas = node.querySelector('#qr-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sel = node.querySelector('#qr-cam');
  const msg = node.querySelector('#qr-msg');
  const list = node.querySelector('#qr-history');
  const autoclose = node.querySelector('#qr-autoclose');
  const manualInput = node.querySelector('#qr-manual');
  const manualBtn = node.querySelector('#qr-add-manual');

  let stream=null, running=false, detector=null, lastCode='', lastTs=0;

  async function fillCams(){
    try{
      const devs = await navigator.mediaDevices.enumerateDevices();
      const cams = devs.filter(d=>d.kind==='videoinput');
      sel.replaceChildren(...cams.map((c,i)=>{
        const o=document.createElement('option'); o.value=c.deviceId; o.textContent=c.label||('Cam '+(i+1)); return o;
      }));
    }catch{}
  }

  function stop(){ try{ video.pause(); }catch{}; try{ (stream?.getTracks()||[]).forEach(t=>t.stop()); }catch{}; running=false; }
  async function start(){
    try{
      stop();
      const cs = { video: sel.value ? { deviceId:{ exact: sel.value } } : { facingMode:'environment' }, audio:false };
      stream = await navigator.mediaDevices.getUserMedia(cs);
      video.srcObject = stream; await video.play();
      running = true;
      if (window.BarcodeDetector) { detector = new BarcodeDetector({ formats: ['qr_code'] }); tickNative(); }
      else { tickCanvas(); }
      msg.textContent='';
    }catch(e){ msg.textContent='No se pudo abrir cámara: '+(e?.message||e?.name||'Desconocido'); }
  }
  function accept(value){
    const normalized = String(value || '').trim().toUpperCase();
    const t = Date.now();
    if (lastCode === normalized && t - lastTs < 1200) return false;
    lastCode = normalized;
    lastTs = t;
    return true;
  }

  function parseInventoryCode(raw){
    const text = String(raw || '').trim();
    if (!text) return { itemId:'', sku:'', raw:text };
    const upper = text.toUpperCase();
    if (upper.startsWith('IT:')){
      const parts = text.split(':').map(p => p.trim()).filter(Boolean);
      return {
        companyId: parts[1] || '',
        itemId: parts[2] || '',
        sku: parts[3] || ''
      };
    }
    const match = text.match(/[a-f0-9]{24}/i);
    return { companyId:'', itemId: match ? match[0] : '', sku:'', raw:text };
  }

  async function handleCode(raw, fromManual = false){
    const text = String(raw || '').trim();
    if (!text) return;
    if (!fromManual && !accept(text)) return;
    const li=document.createElement('li'); li.textContent=text; list.prepend(li);
    const parsed = parseInventoryCode(text);
    try{
      if (parsed.itemId){
        current = await API.sales.addItem(current._id, { source:'inventory', refId: parsed.itemId, qty:1 });
      } else {
        const candidate = (parsed.sku || text).toUpperCase();
        current = await API.sales.addItem(current._id, { source:'inventory', sku:candidate, qty:1 });
      }
      syncCurrentIntoOpenList();
      renderTabs();
      renderSale(); renderWO();
      if (autoclose.checked && !fromManual){ stop(); closeModal(); }
      msg.textContent = '';
    }catch(e){ msg.textContent = e?.message || 'No se pudo agregar'; }
  }

  function onCode(code){
    handleCode(code);
  }
  async function tickNative(){ if(!running) return; try{ const codes=await detector.detect(video); if(codes?.[0]?.rawValue) onCode(codes[0].rawValue); }catch{} requestAnimationFrame(tickNative); }
  function tickCanvas(){
    if(!running) return;
    try{
      const w = video.videoWidth|0, h = video.videoHeight|0;
      if(!w||!h){ requestAnimationFrame(tickCanvas); return; }
      canvas.width=w; canvas.height=h;
      ctx.drawImage(video,0,0,w,h);
      const img = ctx.getImageData(0,0,w,h);
      if (window.jsQR){
        const qr = window.jsQR(img.data, w, h);
        if (qr && qr.data) onCode(qr.data);
      }
    }catch{}
    requestAnimationFrame(tickCanvas);
  }

  manualBtn?.addEventListener('click', () => {
    const val = manualInput?.value.trim();
    if (!val) return;
    handleCode(val, true);
    manualInput.value = '';
    manualInput.focus();
  });
  manualInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const val = manualInput.value.trim();
      if (val) {
        handleCode(val, true);
        manualInput.value = '';
      }
    }
  });

  node.querySelector('#qr-start').onclick = start;
  node.querySelector('#qr-stop').onclick  = stop;
  fillCams();
}

// ---------- agregar manual ----------
function openAddManual(){
  if (!current) return alert('Crea primero una venta');
  const tpl = document.getElementById('tpl-add-manual'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  node.querySelector('#am-cancel').onclick = ()=> closeModal();
  node.querySelector('#am-add').onclick = async ()=>{
    const name = node.querySelector('#am-name').value.trim();
    const qty  = Number(node.querySelector('#am-qty').value||1)||1;
    const price= Number(node.querySelector('#am-price').value||0)||0;
    const sku  = node.querySelector('#am-sku').value.trim();
    if (!name) return alert('Descripción requerida');
    current = await API.sales.addItem(current._id, { source:'service', sku, name, qty, unitPrice:price });
    syncCurrentIntoOpenList();
    renderTabs();
    closeModal(); renderSale(); renderWO();
  };
}

// ---------- agregar general (picker) ----------
function openAddPicker(){
  if (!current) return alert('Crea primero una venta');
  const node = document.createElement('div'); node.className='card';
  node.innerHTML = `<h3>Agregar</h3>
    <div class="row" style="gap:8px;">
      <button id="go-inv" class="secondary">Desde inventario</button>
      <button id="go-pr"  class="secondary">Desde lista de precios</button>
    </div>`;
  openModal(node);
  node.querySelector('#go-inv').onclick = ()=>{ closeModal(); openPickerInventory(); };
  node.querySelector('#go-pr').onclick  = ()=>{ closeModal(); openPickerPrices(); };
}

// ---------- pickers ----------
async function openPickerInventory(){
  const tpl = document.getElementById('tpl-inv-picker'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const body=node.querySelector('#p-inv-body'), cnt=node.querySelector('#p-inv-count');
  const qName=node.querySelector('#p-inv-name'), qSku=node.querySelector('#p-inv-sku');
  let page=1, limit=20;
  async function load(reset=false){
    if(reset){ body.innerHTML=''; page=1; }
    const items = await API.inventory.itemsList({ name:qName.value||'', sku:qSku.value||'', page, limit });
    cnt.textContent = items.length;
    body.innerHTML = '';
    for(const it of items){
      const tr = clone('tpl-inv-row');
      tr.querySelector('img.thumb').src = (it.media?.[0]?.thumbUrl || it.media?.[0]?.url || '') || '';
      tr.querySelector('[data-sku]').textContent = it.sku||'';
      tr.querySelector('[data-name]').textContent = it.name||'';
      tr.querySelector('[data-stock]').textContent = it.stock ?? 0;
      tr.querySelector('[data-price]').textContent = money(it.salePrice||0);
      tr.querySelector('button.add').onclick = async ()=>{
        current = await API.sales.addItem(current._id, { source:'inventory', refId: it._id, qty:1 });
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale(); renderWO();
      };
      body.appendChild(tr);
    }
  }
  node.querySelector('#p-inv-search').onclick = ()=> load(true);
  node.querySelector('#p-inv-more').onclick   = ()=> { page++; load(); };
  node.querySelector('#p-inv-cancel').onclick = ()=> closeModal();
  load(true);
}

async function openPickerPrices(){
  const tpl = document.getElementById('tpl-price-picker'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const head=node.querySelector('#p-pr-head'), body=node.querySelector('#p-pr-body'), cnt=node.querySelector('#p-pr-count');
  const svc=node.querySelector('#p-pr-svc');
  const b=node.querySelector('#p-pr-brand'), l=node.querySelector('#p-pr-line'), e=node.querySelector('#p-pr-engine'), y=node.querySelector('#p-pr-year');
  head.innerHTML = '<th>Marca</th><th>Línea</th><th>Motor</th><th>Año</th><th class="t-right">Precio</th><th></th>';
  try{
    const svcs = await API.servicesList();
    svc.replaceChildren(...(svcs||[]).map(s=>{ const o=document.createElement('option'); o.value=s._id; o.textContent=s.name||('Servicio '+s._id.slice(-6)); return o; }));
  }catch{}
  let page=1, limit=20;
  async function load(reset=false){
    if(reset){ body.innerHTML=''; page=1; }
    const rows = await API.pricesList({ serviceId: svc.value||'', brand:b.value||'', line:l.value||'', engine:e.value||'', year:y.value||'', page, limit });
    cnt.textContent = rows.length;
    body.innerHTML = '';
    for(const pe of rows){
      const tr = clone('tpl-price-row');
      tr.querySelector('[data-brand]').textContent = pe.brand||'';
      tr.querySelector('[data-line]').textContent  = pe.line||'';
      tr.querySelector('[data-engine]').textContent= pe.engine||'';
      tr.querySelector('[data-year]').textContent  = pe.year||'';
      tr.querySelector('[data-price]').textContent = money(pe.total||pe.price||0);
      tr.querySelector('button.add').onclick = async ()=>{
        current = await API.sales.addItem(current._id, { source:'price', refId: pe._id, qty:1 });
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale(); renderWO();
      };
      body.appendChild(tr);
    }
  }
  node.querySelector('#p-pr-search').onclick = ()=> load(true);
  node.querySelector('#p-pr-more').onclick   = ()=> { page++; load(); };
  node.querySelector('#p-pr-cancel').onclick = ()=> closeModal();
  load(true);
}

// ---------- cotización → venta (mini) ----------
async function loadQuote(){
  const node=document.createElement('div'); node.className='card';
  node.innerHTML=`<h3>Selecciona una cotización</h3>
    <div class="row" style="gap:6px;">
      <input id="qh-text" placeholder="Buscar por cliente/placa..." />
      <button id="qh-apply" class="secondary">Buscar</button>
    </div>
    <div id="qh-list" class="list" style="max-height:300px; overflow:auto; margin-top:8px;"></div>
    <div class="row" style="margin-top:8px; justify-content:space-between; align-items:center;">
      <div id="qh-meta" style="font-size:12px; opacity:.8;">Página 1</div>
      <div style="display:flex; gap:6px;">
        <button id="qh-prev" class="secondary" disabled>◀</button>
        <button id="qh-next" class="secondary" disabled>▶</button>
      </div>
    </div>`;
  openModal(node);
  const list=node.querySelector('#qh-list'); const q=node.querySelector('#qh-text');
  const metaEl = node.querySelector('#qh-meta');
  const btnPrev = node.querySelector('#qh-prev');
  const btnNext = node.querySelector('#qh-next');
  let page=1; const pageSize=25;

  async function fetchList(reset=false){
    if(reset) page=1;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if(q.value) params.set('q', q.value);
    const url='?'+params.toString();
    let raw=null; let items=[]; let metadata=null;
    try{
      raw = await API.quotesListRaw(url);
      if (Array.isArray(raw)) { items = raw; metadata = null; }
      else { items = raw.items||[]; metadata = raw.metadata||null; }
    }catch(e){
      list.innerHTML = `<div style="padding:8px;color:#c00;">Error: ${e?.message||'No se pudo cargar'}</div>`; return;
    }
    list.innerHTML='';
    items.forEach(qq=>{
      const btn=document.createElement('button'); btn.className='secondary';
      btn.textContent = `${(qq.number||'').toString().padStart(5,'0')} - ${qq?.client?.name||qq?.customer?.name||''} (${qq?.vehicle?.plate||''})`;
      btn.style.cssText='display:block;width:100%;text-align:left;margin-top:6px;';
      btn.onclick = ()=>{ closeModal(); renderQuoteMini(qq); try{ localStorage.setItem('sales:lastQuoteId', qq.id||qq._id||''); }catch{} };
      list.appendChild(btn);
    });
    if(items.length===0){
      const empty=document.createElement('div'); empty.style.cssText='padding:8px;opacity:.7;';
      empty.textContent = 'No hay cotizaciones en esta página';
      list.appendChild(empty);
    }
    if(metadata){
      metaEl.textContent = `Página ${metadata.page} de ${metadata.pages} (Total ${metadata.total})`;
      btnPrev.disabled = !metadata.hasPrev;
      btnNext.disabled = !metadata.hasNext;
    } else {
      metaEl.textContent = `Página ${page}`;
      btnPrev.disabled = page<=1;
      btnNext.disabled = items.length < pageSize;
    }
  }
  node.querySelector('#qh-apply').onclick = ()=> fetchList(true);
  btnPrev.onclick = ()=>{ if(page>1){ page--; fetchList(); } };
  btnNext.onclick = ()=>{ page++; fetchList(); };
  fetchList();
}
function renderQuoteMini(q){
  const head=document.getElementById('sv-q-header'), body=document.getElementById('sv-q-body');
  head.textContent = q ? `Cotización #${String(q.number||'').toString().padStart(5,'0')} - ${q?.client?.name||''}` : '— ninguna cotización cargada —';
  body.innerHTML='';
  lastQuoteLoaded = q || null;
  (q?.items||[]).forEach(it=>{
    const unit=Number(it.unitPrice??it.unit??0)||0;
    const qty =Number(it.qty||1)||1;
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${it.type||'—'}</td><td>${it.description||it.name||''}</td><td class="t-center">${qty}</td><td class="t-right">${money(unit)}</td><td class="t-right">${money(qty*unit)}</td><td class="t-center"><button class="add secondary">→</button></td>`;
    tr.querySelector('button.add').onclick = async ()=>{
      if(!current){
        current = await API.sales.start();
        syncCurrentIntoOpenList();
        renderTabs();
      }
      current = await API.sales.addItem(current._id, {
        source: (it.source||'service')==='product' ? 'inventory' : 'service',
        sku: it.sku||'',
        name: it.description||it.name||'Servicio',
        qty, unitPrice: unit
      });
      syncCurrentIntoOpenList();
        renderTabs();
      renderSale(); renderWO();
      // Marcar visualmente como agregado
      tr.classList.add('added');
      const btn = tr.querySelector('button.add'); if (btn){ btn.disabled = true; btn.textContent = '✔'; }
    };
    body.appendChild(tr);
  });

  const btnAll = document.getElementById('sv-q-to-sale');
  if (btnAll){
    btnAll.onclick = async ()=>{
      if(!q?.items?.length) return;
      if(!current){
        current = await API.sales.start();
        syncCurrentIntoOpenList();
        renderTabs();
      }
      try {
        const batchPayload = q.items.map(it => {
          const unit=Number(it.unitPrice??it.unit??0)||0;
          const qty =Number(it.qty||1)||1;
          return {
            source: (it.source||'service')==='product' ? 'inventory' : 'service',
            sku: it.sku||'',
            name: it.description||it.name||'Servicio',
            qty,
            unitPrice: unit
          };
        });
        current = await API.sales.addItemsBatch(current._id, batchPayload);
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale(); renderWO();
      } catch(e){
        alert(e?.message||'No se pudo agregar items (batch)');
      }
      // Refrescar marca visual
      Array.from(document.querySelectorAll('#sv-q-body tr')).forEach(tr=>{
        tr.classList.add('added');
        const b=tr.querySelector('button.add'); if(b){ b.disabled=true; b.textContent='✔'; }
      });
    };
  }
}

// Aplica cliente/vehículo desde la última cotización cargada
async function applyQuoteCustomerVehicle(){
  if(!lastQuoteLoaded){ alert('Primero selecciona una cotización'); return; }
  try{
    if(!current){
      current = await API.sales.start();
      syncCurrentIntoOpenList();
      renderTabs();
    }
    const q = lastQuoteLoaded;
    const payload = {
      customer: {
        name: q?.client?.name || q?.customer?.name || '',
        phone: q?.client?.phone || q?.customer?.phone || '',
        email: q?.client?.email || q?.customer?.email || '',
        address: ''
      },
      vehicle: {
        plate: (q?.vehicle?.plate||'').toUpperCase(),
        brand: (q?.vehicle?.make||q?.vehicle?.brand||'').toUpperCase(),
        line:  (q?.vehicle?.line||'').toUpperCase(),
        engine: (q?.vehicle?.displacement||'').toUpperCase(),
        year: q?.vehicle?.modelYear ? Number(q.vehicle.modelYear)||null : null,
        mileage: null
      }
    };
    current = await API.sales.setCustomerVehicle(current._id, payload);
    syncCurrentIntoOpenList();
    renderTabs(); renderMini();
  }catch(e){ alert(e?.message||'No se pudo aplicar datos'); }
}

// ---------- editar cliente/vehículo ----------
function openEditCV(){
  if(!current) return alert('Crea primero una venta');
  const node = clone('sales-cv-template');
  const c=current.customer||{}, v=current.vehicle||{};
  node.querySelector('#c-name').value = c.name||'';
  node.querySelector('#c-id').value   = c.idNumber||'';
  node.querySelector('#c-phone').value= c.phone||'';
  node.querySelector('#c-email').value= c.email||'';
  node.querySelector('#c-address').value= c.address||'';
  node.querySelector('#v-plate').value = v.plate||'';
  node.querySelector('#v-brand').value = v.brand||'';
  node.querySelector('#v-line').value  = v.line||'';
  node.querySelector('#v-engine').value= v.engine||'';
  node.querySelector('#v-year').value  = v.year??'';
  node.querySelector('#v-mile').value  = v.mileage??'';
  openModal(node);

  const plateInput = $('#v-plate', node);
  const mileageInput = $('#v-mile', node);
  const watchSelectors = ['#c-name','#c-id','#c-phone','#c-email','#c-address','#v-brand','#v-line','#v-engine','#v-year','#v-mile'];
  watchSelectors.forEach((sel)=>{ const input=$(sel,node); if(input) input.addEventListener('input',()=>{ input.dataset.dirty='1'; }); });

  let lastLookupPlate = '';
  let loadingProfile = false;

  const applyProfile = (profile, plateCode) => {
    if (!profile) return;
    const cust = profile.customer || {};
    const veh = profile.vehicle || {};
    const assign = (selector, value) => {
      const input = $(selector, node);
      if (!input) return;
      if (input.dataset.dirty === '1' && input.dataset.prefilledPlate === plateCode) return;
      const normalized = value == null ? '' : String(value);
      input.value = normalized;
      input.dataset.prefilledPlate = plateCode;
      if (normalized) delete input.dataset.dirty;
    };

    assign('#c-name', cust.name || '');
    assign('#c-id', cust.idNumber || '');
    assign('#c-phone', cust.phone || '');
    assign('#c-email', cust.email || '');
    assign('#c-address', cust.address || '');
    assign('#v-brand', veh.brand || '');
    assign('#v-line', veh.line || '');
    assign('#v-engine', veh.engine || '');
    assign('#v-year', veh.year != null ? veh.year : '');

    if (plateInput) {
      plateInput.value = plateCode;
      plateInput.dataset.prefilledPlate = plateCode;
    }

    if (mileageInput) {
      if (mileageInput.dataset.dirty !== '1') mileageInput.value = '';
      if (veh.mileage != null && veh.mileage !== '') {
        mileageInput.placeholder = `Ultimo: ${veh.mileage}`;
      } else {
        mileageInput.placeholder = '';
      }
    }
  };

  const loadProfile = async (force=false) => {
    if (!plateInput || loadingProfile) return;
    let raw = plateInput.value.trim().toUpperCase();
    plateInput.value = raw;
    if (!raw) return;
    if (!force && raw === lastLookupPlate) return;
    loadingProfile = true;
    try{
      const profile = await API.sales.profileByPlate(raw);
      if (profile) {
        applyProfile(profile, raw);
      }
    }catch(err){ console.warn('No se pudo cargar perfil', err?.message||err); }
    finally{
      loadingProfile = false;
      lastLookupPlate = raw;
    }
  };

  if (plateInput) {
    plateInput.addEventListener('input', (ev)=>{
      const upper = ev.target.value.toUpperCase();
      if (ev.target.value !== upper) ev.target.value = upper;
    });
    plateInput.addEventListener('change', ()=> loadProfile(true));
    plateInput.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter') {
        ev.preventDefault();
        loadProfile(true);
      }
    });
  }

  if (mileageInput) {
    mileageInput.addEventListener('input', ()=>{ mileageInput.dataset.dirty='1'; });
  }

  if (plateInput && plateInput.value && !c.name && !c.phone && !v.brand && !v.line && !v.engine) {
    loadProfile(true);
  }

  node.querySelector('#sales-save-cv').onclick = async ()=>{
    const payload = {
      customer:{
        name: $('#c-name',node).value.trim(),
        idNumber: $('#c-id',node).value.trim(),
        phone: $('#c-phone',node).value.trim(),
        email: $('#c-email',node).value.trim(),
        address: $('#c-address',node).value.trim()
      },
      vehicle:{
        plate: $('#v-plate',node).value.trim(),
        brand: $('#v-brand',node).value.trim(),
        line:  $('#v-line',node).value.trim(),
        engine:$('#v-engine',node).value.trim(),
        year:  Number($('#v-year',node).value||'')||null,
        mileage:Number($('#v-mile',node).value||'')||null
      }
    };
    try{
      current = await API.sales.setCustomerVehicle(current._id, payload);
      syncCurrentIntoOpenList();
        renderTabs();
      closeModal(); renderMini();
    }catch(e){ alert(e?.message||'No se pudo guardar'); }
  };
}

// ---------- historial ----------
function openSalesHistory(){
  const node = clone('tpl-sales-history');
  openModal(node);
  const from=$('#sh-from',node), to=$('#sh-to',node), plate=$('#sh-plate',node);
  const body=$('#sh-body',node), total=$('#sh-total',node);
  async function load(){
    const params = { status:'closed' };
    if(from.value) params.from=from.value;
    if(to.value)   params.to=to.value;
    if(plate.value) params.plate = plate.value.trim();
    const res = await API.sales.list(params);
    body.innerHTML=''; let acc=0;
    (res?.items||[]).forEach(s=>{
      const tr=document.createElement('tr');
      const date=new Date(s.createdAt); const d=date.toLocaleDateString();
      const num = padSaleNumber(s.number || s._id || '');
      tr.innerHTML = `<td>${num}</td><td>${s?.vehicle?.plate||''}</td><td>${d}</td><td class="t-right">${money(s.total||0)}</td><td class="t-right"><button class="secondary" data-id="${s._id}">Ver</button></td>`;
      tr.querySelector('button').onclick = ()=> openSaleHistoryDetail(s._id);
      body.appendChild(tr); acc += Number(s.total||0);
    });
    total.textContent = money(acc);
  }
  $('#sh-search',node).onclick = load;
  load();
}

async function openSaleHistoryDetail(id){
  if (!id) return;
  try{
    const sale = await API.sales.get(id);
    const node = clone('tpl-sale-history-detail');
    if (!node) return;
    node.querySelector('[data-number]').textContent = padSaleNumber(sale.number || sale._id || '');
    node.querySelector('[data-date]').textContent = sale.createdAt ? new Date(sale.createdAt).toLocaleString() : '';
    node.querySelector('[data-status]').textContent = sale.status || 'N/A';
    node.querySelector('[data-customer]').textContent = describeCustomer(sale.customer);
    node.querySelector('[data-vehicle]').textContent = describeVehicle(sale.vehicle);
    const itemsBody = node.querySelector('[data-items]');
    itemsBody.innerHTML = '';
    (sale.items || []).forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${it.sku || ''}</td><td>${it.name || ''}</td><td class="t-center">${it.qty || 0}</td><td class="t-right">${money(it.unitPrice || 0)}</td><td class="t-right">${money(it.total || 0)}</td>`;
      itemsBody.appendChild(tr);
    });
    node.querySelector('[data-subtotal]').textContent = money(sale.subtotal || 0);
    node.querySelector('[data-total]').textContent = money(sale.total || 0);
    const printBtn = node.querySelector('[data-print]');
    if (printBtn) printBtn.onclick = () => printSaleTicket(sale);
    openModal(node);
  }catch(e){ alert(e?.message || 'No se pudo cargar la venta'); }
}
// ---------- live (SSE) ----------
function connectLive(){
  if (es || !API?.live?.connect) return;
  try{
    es = API.live.connect((event, data)=>{
      if (event === 'sale:started'){
        refreshOpenSales({ focusId: current?._id || null });
        return;
      }
      if (!data?.id) return;
      if (event === 'sale:updated'){
        if (current && current._id === data.id){
          API.sales.get(current._id)
            .then((s)=>{ current = s; syncCurrentIntoOpenList(); renderTabs(); renderSale(); renderWO(); })
            .catch((err)=> { console.warn('No se pudo refrescar venta en vivo', err); refreshOpenSales({ focusId: current?._id || null }); });
        } else {
          refreshOpenSales({ focusId: current?._id || null });
        }
        return;
      }
      if (event === 'sale:closed' || event === 'sale:cancelled'){
        if (current && current._id === data.id) current = null;
        refreshOpenSales({ focusId: current?._id || null });
      }
    });
  }catch(e){ console.warn('SSE no disponible:', e?.message||e); }
}

// ---------- init ----------
export function initSales(){
  const ventas = document.getElementById('tab-ventas'); if (!ventas) return;

  refreshOpenSales();
  startSalesAutoRefresh();

  document.getElementById('sales-start')?.addEventListener('click', async (ev)=>{
    if (starting) return; starting=true;
    const btn = ev.currentTarget; if (btn) btn.disabled=true;
    try{
      const s = await API.sales.start();
      current = s;
      syncCurrentIntoOpenList();
        renderTabs(); renderSale(); renderWO();
      await refreshOpenSales({ focusId: s._id, preferCurrent: s });
    }catch(e){ alert(e?.message||'No se pudo crear la venta'); }
    finally{ starting=false; if(btn) btn.disabled=false; }
  });

  document.getElementById('sales-scan-qr')?.addEventListener('click', openQR);
  document.getElementById('sales-add-general')?.addEventListener('click', openAddPicker);
  document.getElementById('sales-add-manual')?.addEventListener('click', openAddManual);
  document.getElementById('sales-history')?.addEventListener('click', openSalesHistory);
  document.getElementById('sv-edit-cv')?.addEventListener('click', openEditCV);
  document.getElementById('sv-loadQuote')?.addEventListener('click', loadQuote);
  document.getElementById('sv-applyQuoteCV')?.addEventListener('click', applyQuoteCustomerVehicle);

  // Restaurar última cotización cargada (si existe)
  try {
    const lastQuoteId = localStorage.getItem('sales:lastQuoteId');
    if (lastQuoteId) {
      API.quoteGet(lastQuoteId).then(q=>{ if(q) renderQuoteMini(q); }).catch(()=>{});
    }
  } catch {}

  document.getElementById('sales-close')?.addEventListener('click', async ()=>{
    if (!current) return;
    try{
      await API.sales.close(current._id);
      alert('Venta cerrada');
      current = null;
      await refreshOpenSales();
    }catch(e){ alert(e?.message||'No se pudo cerrar'); }
  });

  document.getElementById('sales-print')?.addEventListener('click', async ()=>{
    if (!current) return;
    try{
      const fresh = await API.sales.get(current._id);
      printSaleTicket(fresh);
    }catch(e){ alert(e?.message||'No se pudo imprimir'); }
  });

  connectLive();
}

