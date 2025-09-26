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

// ---------- estado ----------
let es = null;         // EventSource (SSE)
let current = null;    // venta actual
let openTabs = [];     // ids de ventas abiertas
let starting = false;  // evita doble clic en "Nueva venta"

const tabsKey = ()=> `sales:openTabs:${(API.getActiveCompany?.() || '').toLowerCase()}`;
const saveTabs = ()=> { try{ localStorage.setItem(tabsKey(), JSON.stringify(openTabs)); }catch{} };
const loadTabs = ()=> { try{ openTabs = JSON.parse(localStorage.getItem(tabsKey())||'[]'); }catch{ openTabs=[]; } };

// ---------- tabs ----------
function labelFor(id){
  if (current && id===current._id) {
    const plate = current?.vehicle?.plate || '';
    return plate ? `VENTA - ${plate.toUpperCase()}` : id.slice(-6).toUpperCase();
  }
  return id.slice(-6).toUpperCase();
}
async function switchTo(id){
  try {
    current = await API.sales.get(id);
    if (!openTabs.includes(id)) { openTabs.push(id); saveTabs(); }
    renderTabs(); renderSale(); renderWO();
  } catch(e){ console.error(e); }
}
function renderTabs(){
  const cont = document.getElementById('saleTabs'); if (!cont) return;
  cont.innerHTML = '';
  for(const id of openTabs){
    const tab = clone('tpl-sale-tab');
    tab.querySelector('.label').textContent = labelFor(id);
    if (current && id===current._id) tab.classList.add('active');
    tab.addEventListener('click', ()=> switchTo(id));
    tab.querySelector('.close').addEventListener('click', async (e)=>{
      e.stopPropagation();
      if (!confirm('¿Cancelar esta venta?')) return;
      try{ await API.sales.cancel(id); }catch{}
      openTabs = openTabs.filter(x=>x!==id); saveTabs();
      if (current && current._id===id){ current=null; renderSale(); }
      renderTabs();
    });
    cont.appendChild(tab);
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
      renderSale(); renderWO();
    });

    const actions = tr.querySelector('td:last-child');
    const btnEdit = document.createElement('button'); btnEdit.textContent='Editar $'; btnEdit.className='secondary';
    btnEdit.onclick = async ()=>{
      const v = prompt('Nuevo precio unitario:', String(it.unitPrice||0)); if (v==null) return;
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: Number(v)||0 });
      renderSale(); renderWO();
    };
    const btnZero = document.createElement('button'); btnZero.textContent='Precio 0'; btnZero.className='secondary';
    btnZero.onclick = async ()=>{
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: 0 });
      renderSale(); renderWO();
    };
    const btnDel = tr.querySelector('button.remove');
    btnDel.onclick = async ()=>{
      await API.sales.removeItem(current._id, it._id);
      current = await API.sales.get(current._id);
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

  let stream=null, running=false, detector=null, lastCode=null, lastTs=0;

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
  function accept(v){ const t=Date.now(); if (lastCode===v && t-lastTs<1200) return false; lastCode=v; lastTs=t; return true; }
  function onCode(code){
    if (!accept(code)) return;
    const li=document.createElement('li'); li.textContent=code; list.prepend(li);
    const m = String(code||'').match(/[a-f0-9]{24}/i);
    (async ()=>{
      try{
        if (m) current = await API.sales.addItem(current._id, { source:'inventory', refId:m[0], qty:1 });
        else   current = await API.sales.addItem(current._id, { source:'inventory', sku:String(code).toUpperCase(), qty:1 });
        renderSale(); renderWO(); if (autoclose.checked){ stop(); closeModal(); }
      }catch(e){ msg.textContent = e?.message || 'No se pudo agregar'; }
    })();
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
    <div id="qh-list" class="list" style="max-height:300px; overflow:auto; margin-top:8px;"></div>`;
  openModal(node);
  const list=node.querySelector('#qh-list'); const q=node.querySelector('#qh-text');
  async function fetchList(){
    const res = await API.quotesList(q.value ? ('?q='+encodeURIComponent(q.value)) : '');
    list.innerHTML='';
    (res?.items||res||[]).forEach(qq=>{
      const btn=document.createElement('button'); btn.className='secondary';
      btn.textContent = `${(qq.number||'').toString().padStart(5,'0')} - ${qq?.client?.name||''} (${qq?.vehicle?.plate||''})`;
      btn.style.cssText='display:block;width:100%;text-align:left;margin-top:6px;';
      btn.onclick = ()=>{ closeModal(); renderQuoteMini(qq); };
      list.appendChild(btn);
    });
  }
  node.querySelector('#qh-apply').onclick = fetchList;
  fetchList();
}
function renderQuoteMini(q){
  const head=document.getElementById('sv-q-header'), body=document.getElementById('sv-q-body');
  head.textContent = q ? `Cotización #${String(q.number||'').toString().padStart(5,'0')} - ${q?.client?.name||''}` : '— ninguna cotización cargada —';
  body.innerHTML='';
  (q?.items||[]).forEach(it=>{
    const unit=Number(it.unitPrice??it.unit??0)||0;
    const qty =Number(it.qty||1)||1;
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${it.type||'—'}</td><td>${it.description||it.name||''}</td><td class="t-center">${qty}</td><td class="t-right">${money(unit)}</td><td class="t-right">${money(qty*unit)}</td><td class="t-center"><button class="add secondary">→</button></td>`;
    tr.querySelector('button.add').onclick = async ()=>{
      if(!current) current = await API.sales.start();
      current = await API.sales.addItem(current._id, {
        source: (it.source||'service')==='product' ? 'inventory' : 'service',
        sku: it.sku||'',
        name: it.description||it.name||'Servicio',
        qty, unitPrice: unit
      });
      renderSale(); renderWO();
    };
    body.appendChild(tr);
  });

  const btnAll = document.getElementById('sv-q-to-sale');
  if (btnAll){
    btnAll.onclick = async ()=>{
      if(!q?.items?.length) return;
      if(!current) current = await API.sales.start();
      for(const it of q.items){
        const unit=Number(it.unitPrice??it.unit??0)||0;
        const qty =Number(it.qty||1)||1;
        current = await API.sales.addItem(current._id, {
          source: (it.source||'service')==='product' ? 'inventory' : 'service',
          sku: it.sku||'',
          name: it.description||it.name||'Servicio',
          qty, unitPrice: unit
        });
      }
      renderSale(); renderWO();
    };
  }
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
      closeModal(); renderMini(); renderTabs();
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
      tr.innerHTML = `<td>${String(s.number||'').toString().padStart(5,'0')}</td><td>${s?.vehicle?.plate||''}</td><td>${d}</td><td class="t-right">${money(s.total||0)}</td>`;
      body.appendChild(tr); acc += Number(s.total||0);
    });
    total.textContent = money(acc);
  }
  $('#sh-search',node).onclick = load;
  load();
}

// ---------- live (SSE) ----------
function connectLive(){
  if (es || !API?.live?.connect) return;
  try{
    es = API.live.connect((event, data)=>{
      if (data?.id && current?._id===data.id){
        API.sales.get(current._id).then(s=>{ current=s; renderSale(); renderWO(); });
      }
    });
  }catch(e){ console.warn('SSE no disponible:', e?.message||e); }
}

// ---------- init ----------
export function initSales(){
  const ventas = document.getElementById('tab-ventas'); if (!ventas) return;

  loadTabs(); renderTabs();

  if (openTabs.length){
    API.sales.get(openTabs[openTabs.length-1])
      .then(s=>{ current=s; renderTabs(); renderSale(); renderWO(); })
      .catch(()=>{});
  }

  document.getElementById('sales-start')?.addEventListener('click', async (ev)=>{
    if (starting) return; starting=true;
    const btn = ev.currentTarget; if (btn) btn.disabled=true;
    try{
      const s = await API.sales.start();
      current = s;
      if (!openTabs.includes(current._id)) openTabs.push(current._id);
      saveTabs(); renderTabs(); renderSale(); renderWO();
    }catch(e){ alert(e?.message||'No se pudo crear la venta'); }
    finally{ starting=false; if(btn) btn.disabled=false; }
  });

  document.getElementById('sales-scan-qr')?.addEventListener('click', openQR);
  document.getElementById('sales-add-general')?.addEventListener('click', openAddPicker);
  document.getElementById('sales-add-manual')?.addEventListener('click', openAddManual);
  document.getElementById('sales-history')?.addEventListener('click', openSalesHistory);
  document.getElementById('sv-edit-cv')?.addEventListener('click', openEditCV);

  document.getElementById('sales-close')?.addEventListener('click', async ()=>{
    if (!current) return;
    try{
      await API.sales.close(current._id);
      alert('Venta cerrada');
      openTabs = openTabs.filter(x=>x!==current._id); saveTabs();
      current = null; renderTabs(); renderSale(); renderWO();
    }catch(e){ alert(e?.message||'No se pudo cerrar'); }
  });

  // imprimir rápido (placeholder)
  document.getElementById('sales-print')?.addEventListener('click', async ()=>{
    if (!current) return;
    try{
      const fresh = await API.sales.get(current._id);
      const txt = `Factura simple\n\n# ${String(fresh.number||'').padStart(5,'0')}  Total: ${money(fresh.total||0)}`;
      const win = window.open('', '_blank'); win.document.write(`<pre>${txt}</pre>`);
      win.document.close(); win.focus(); win.print();
    }catch(e){ alert(e?.message||'No se pudo imprimir'); }
  });

  connectLive();
}
