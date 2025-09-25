// assets/js/sales.js
import API from './api.js';
import { buildWorkOrderPdf, buildInvoicePdf, money } from './pdf.js';

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const clone = (id) => {
  const t = document.getElementById(id);
  return t?.content?.firstElementChild?.cloneNode(true);
};

function fmt(n){ return money(n); }
function byId(id){ return document.getElementById(id); }

let current = null;
let openTabs = [];
const tabsKey = () => `sales:openTabs:${(window.API?.getActiveCompany?.()||'').toLowerCase()}`;

function saveTabs(){ try{ localStorage.setItem(tabsKey(), JSON.stringify(openTabs)); }catch{} }
function loadTabs(){ try{ openTabs = JSON.parse(localStorage.getItem(tabsKey())||'[]'); }catch{ openTabs=[]; } }

function renderTabs(){
  const cont = byId('saleTabs'); if(!cont) return;
  cont.innerHTML='';
  for(const id of openTabs){
    const tab = clone('tpl-sale-tab');
    tab.querySelector('.label').textContent = (id===current?._id ? (current?.name||id.slice(-6)) : id.slice(-6)).toUpperCase();
    if(current && id===current._id) tab.classList.add('active');
    tab.addEventListener('click', ()=> switchTo(id));
    tab.querySelector('.close').addEventListener('click', async (e)=>{
      e.stopPropagation();
      if(!confirm('¿Deseas cancelar la venta?')) return;
      try{ await API.sales.cancel(id); }catch{}
      openTabs = openTabs.filter(x=>x!==id); saveTabs(); if(current&&current._id===id){ current=null; render(); }
      renderTabs();
    });
    cont.appendChild(tab);
  }
}

async function switchTo(id){
  current = await API.sales.get(id);
  if(!openTabs.includes(id)){ openTabs.push(id); saveTabs(); }
  renderTabs(); render(); renderWO();
}

function mini(){
  const lp = byId('sv-mini-plate'), ln = byId('sv-mini-name'), lr = byId('sv-mini-phone');
  const c=current?.customer||{}, v=current?.vehicle||{};
  if(lp) lp.textContent = v.plate || '—';
  if(ln) ln.textContent = `Cliente: ${c.name||'—'}`;
  if(lr) lr.textContent = `Cel: ${c.phone||'—'}`;
}

function render(){
  const body = byId('sales-body'); const total = byId('sales-total');
  if(!body) return;
  body.innerHTML='';
  (current?.items||[]).forEach(it=>{
    const tr = clone('tpl-sale-row');
    tr.querySelector('[data-sku]').textContent = it.sku||'';
    tr.querySelector('[data-name]').textContent = it.name||'';
    const qty = tr.querySelector('.qty'); qty.value = String(it.qty||1);
    tr.querySelector('[data-unit]').textContent = fmt(it.unitPrice||0);
    tr.querySelector('[data-total]').textContent = fmt(it.total||0);
    qty.addEventListener('change', async()=>{
      const v = Math.max(1, Number(qty.value||1));
      current = await API.sales.updateItem(current._id, it._id, { qty:v });
      render(); renderWO();
    });
    // acciones: quitar + editar precio + precio 0
    const actions = tr.querySelector('td:last-child');
    const btnEdit = document.createElement('button'); btnEdit.textContent='Editar $';
    btnEdit.className='secondary'; btnEdit.onclick=async()=>{
      const v = prompt('Nuevo precio unitario:', String(it.unitPrice||0)); if(v==null) return;
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: Number(v)||0 });
      render(); renderWO();
    };
    const btnZero = document.createElement('button'); btnZero.textContent='Precio 0'; btnZero.className='secondary';
    btnZero.onclick=async()=>{ current = await API.sales.updateItem(current._id, it._id, { unitPrice: 0 }); render(); renderWO(); };
    const btnDel = tr.querySelector('button.remove');
    btnDel.onclick = async ()=>{ await API.sales.removeItem(current._id, it._id); current = await API.sales.get(current._id); render(); renderWO(); };
    actions.prepend(btnEdit); actions.prepend(btnZero);
    body.appendChild(tr);
  });
  if(total) total.textContent = fmt(current?.total||0);
  mini();
}

function renderWO(){
  const b = byId('sv-wo-body'); if(!b) return;
  b.innerHTML='';
  for(const it of (current?.items||[])){
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); const td2 = document.createElement('td'); td2.className='t-center';
    td1.textContent = it.name||''; td2.textContent = String(it.qty||1);
    tr.append(td1,td2); b.appendChild(tr);
  }
}

function openModal(node){
  const modal = byId('modal'); const slot=byId('modalBody'); const x=byId('modalClose');
  if(!modal||!slot||!x) return;
  slot.replaceChildren(node); modal.classList.remove('hidden');
  x.onclick = ()=>{ modal.classList.add('hidden'); };
}
function closeModal(){ const m=byId('modal'); if(m) m.classList.add('hidden'); }

// ===== Scanner =====
let __lastCode=null,__lastTs=0;
function shouldAccept(v){ const t=Date.now(); if(__lastCode===v && t-__lastTs<1500) return False; __lastCode=v; __lastTs=t; return True; }

function parseCode(raw){
  if(!raw) return null; let s=String(raw).trim(); try{ if(/^https?:\/\//i.test(s)){ const u=new URL(s); s=u.pathname.split('/').filter(Boolean).pop()||s; } }catch{}
  const m=s.match(/[a-f0-9]{24}/ig); if(m?.length) return {type:'id',value:m[m.length-1]};
  if(/^[A-Z0-9\-_]+$/i.test(s)) return {type:'sku',value:s.toUpperCase()};
  return null;
}

function openQR(){
  if(!current) return alert('Crea primero una venta');
  const tpl = document.getElementById('tpl-qr-scanner'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const video = node.querySelector('#qr-video'); const canvas = node.querySelector('#qr-canvas'); const ctx = canvas.getContext('2d',{willReadFrequently:true});
  const sel = node.querySelector('#qr-cam'); const msg = node.querySelector('#qr-msg'); const list = node.querySelector('#qr-history'); const ac = node.querySelector('#qr-autoclose');
  let stream=null, running=false, detector=null;

  async function fillCams(){ try{ const devs = await navigator.mediaDevices.enumerateDevices(); const cams=devs.filter(d=>d.kind==='videoinput'); sel.replaceChildren(...cams.map((c,i)=>{ const o=document.createElement('option'); o.value=c.deviceId; o.textContent=c.label||('Cam '+(i+1)); return o; })); }catch{} }
  function stop(){ try{ video.pause(); }catch{}; try{ (stream?.getTracks()||[]).forEach(t=>t.stop()); }catch{}; running=false; }
  async function start(){ try{
      stop(); const cs={ video: sel.value?{deviceId:{exact:sel.value}}:{facingMode:'environment'}, audio:false };
      stream=await navigator.mediaDevices.getUserMedia(cs); video.srcObject=stream; await video.play(); running=true;
      if(window.BarcodeDetector){ detector=new BarcodeDetector({formats:['qr_code']}); tickNative(); } else { tickCanvas(); }
      msg.textContent='';
    }catch(e){ msg.textContent='No se pudo abrir cámara: '+(e?.message||e?.name||'Desconocido'); }
  }
  function onCode(code){ const li=document.createElement('li'); li.textContent=code; list.prepend(li);
    if(code===__lastCode) return; __lastCode=code;
    const p=parseCode(code); if(!p){ msg.textContent='Código no reconocido'; return; }
    (async()=>{
      try{
        if(p.type==='id'){ current=await API.sales.addItem(current._id,{source:'inventory',refId:p.value,qty:1}); }
        else { current=await API.sales.addItem(current._id,{source:'inventory',sku:p.value,qty:1}); }
        render(); renderWO(); if(ac.checked){ stop(); closeModal(); }
      }catch(e){ msg.textContent=e?.message||'No se pudo agregar'; }
    })();
  }
  async function tickNative(){ if(!running) return; try{ const codes=await detector.detect(video); if(codes?.[0]?.rawValue) onCode(codes[0].rawValue); }catch{} requestAnimationFrame(tickNative); }
  function tickCanvas(){ if(!running) return; try{ const w=video.videoWidth,h=video.videoHeight; if(!w||!h) return requestAnimationFrame(tickCanvas); canvas.width=w; canvas.height=h; ctx.drawImage(video,0,0,w,h); if(window.jsQR){ const img=ctx.getImageData(0,0,w,h); const qr=window.jsQR(img.data,w,h); if(qr?.data) onCode(qr.data); } }catch{} requestAnimationFrame(tickCanvas); }

  node.querySelector('#qr-start').onclick=start; node.querySelector('#qr-stop').onclick=stop; node.querySelector('#qr-add-manual').onclick=()=>{ const v=String(node.querySelector('#qr-manual').value||'').trim(); if(!v) return; onCode(v); };
  fillCams();
}

// ===== Agregar manual =====
function openAddManual(){
  if(!current) return alert('Crea primero una venta');
  const tpl = document.getElementById('tpl-add-manual'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  node.querySelector('#am-cancel').onclick=()=>closeModal();
  node.querySelector('#am-add').onclick=async()=>{
    const name = node.querySelector('#am-name').value.trim(); const qty = Number(node.querySelector('#am-qty').value||1)||1; const price = Number(node.querySelector('#am-price').value||0)||0;
    const sku = node.querySelector('#am-sku').value.trim();
    if(!name) return alert('Descripción requerida');
    current = await API.sales.addItem(current._id, { source:'service', sku, name, qty, unitPrice:price });
    closeModal(); render(); renderWO();
  };
}

// ===== Agregar general (picker) =====
function openAddPicker(){
  if(!current) return alert('Crea primero una venta');
  const node=document.createElement('div'); node.innerHTML=`
    <div class="card">
      <h3>Agregar</h3>
      <div class="row" style="gap:8px;">
        <button id="go-inv" class="secondary">Desde inventario</button>
        <button id="go-pr" class="secondary">Desde lista de precios</button>
      </div>
    </div>`;
  openModal(node);
  node.querySelector('#go-inv').onclick=()=>{ closeModal(); openPickerInventory(); };
  node.querySelector('#go-pr').onclick=()=>{ closeModal(); openPickerPrices(); };
}

async function openPickerInventory(){
  const tpl = document.getElementById('tpl-inv-picker'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const body = node.querySelector('#p-inv-body'); const cnt = node.querySelector('#p-inv-count'); const intake = node.querySelector('#p-inv-intake');
  const qName=node.querySelector('#p-inv-name'), qSku=node.querySelector('#p-inv-sku');
  let page=1, pageSize=20;
  async function load(reset=false){
    if(reset){ body.innerHTML=''; page=1; }
    const items = await API.inventory.itemsList({ name:qName.value||'', sku:qSku.value||'', page, limit:pageSize });
    cnt.textContent=items.length; body.innerHTML='';
    for(const it of items){
      const tr = clone('tpl-inv-row');
      tr.querySelector('img.thumb').src = (it.media?.[0]?.thumbUrl || it.media?.[0]?.url || '') || '';
      tr.querySelector('[data-sku]').textContent = it.sku||'';
      tr.querySelector('[data-name]').textContent = it.name||'';
      tr.querySelector('[data-stock]').textContent = it.stock??0;
      tr.querySelector('[data-price]').textContent = fmt(it.salePrice||0);
      tr.querySelector('button.add').onclick = async ()=>{
        current = await API.sales.addItem(current._id, {source:'inventory', refId: it._id, qty:1});
        render(); renderWO();
      };
      body.appendChild(tr);
    }
  }
  node.querySelector('#p-inv-search').onclick=()=>load(true);
  node.querySelector('#p-inv-more').onclick=()=>{ page++; load(); };
  node.querySelector('#p-inv-cancel').onclick=()=>closeModal();
  load(true);
}

async function openPickerPrices(){
  const tpl = document.getElementById('tpl-price-picker'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const head=node.querySelector('#p-pr-head'); const body=node.querySelector('#p-pr-body'); const cnt=node.querySelector('#p-pr-count');
  const svc=node.querySelector('#p-pr-svc'); const b=node.querySelector('#p-pr-brand'), l=node.querySelector('#p-pr-line'), e=node.querySelector('#p-pr-engine'), y=node.querySelector('#p-pr-year');
  // columnas estáticas (mínimas)
  head.innerHTML = '<th>Marca</th><th>Línea</th><th>Motor</th><th>Año</th><th class="t-right">Precio</th><th></th>';
  // load services catalog
  try{ const svcs = await API.servicesList(); svc.replaceChildren(...(svcs||[]).map(s=>{ const o=document.createElement('option'); o.value=s._id; o.textContent=s.name||('Servicio '+s._id.slice(-6)); return o; })); }catch{}
  let page=1, pageSize=20;
  async function load(reset=false){
    if(reset){ body.innerHTML=''; page=1; }
    const rows = await API.pricesList({ serviceId: svc.value||'', brand:b.value||'', line:l.value||'', engine:e.value||'', year:y.value||'', page, limit:pageSize });
    cnt.textContent = rows.length;
    body.innerHTML='';
    for(const pe of rows){
      const tr = clone('tpl-price-row');
      tr.querySelector('[data-brand]').textContent = pe.brand||'';
      tr.querySelector('[data-line]').textContent = pe.line||'';
      tr.querySelector('[data-engine]').textContent = pe.engine||'';
      tr.querySelector('[data-year]').textContent = pe.year||'';
      tr.querySelector('[data-price]').textContent = fmt(pe.total||pe.price||0);
      tr.querySelector('button.add').onclick = async ()=>{
        current = await API.sales.addItem(current._id, {source:'price', refId: pe._id, qty:1});
        render(); renderWO();
      };
      body.appendChild(tr);
    }
  }
  node.querySelector('#p-pr-search').onclick=()=>load(true);
  node.querySelector('#p-pr-more').onclick=()=>{ page++; load(); };
  node.querySelector('#p-pr-cancel').onclick=()=>closeModal();
  load(true);
}

// ===== Usar cotización creada (traer ítems y pasarlos a venta) =====
async function loadQuote(){
  // Abrimos modal con listado de cotizaciones desde backend (simple)
  const node=document.createElement('div'); node.className='card'; node.innerHTML=`
    <h3>Selecciona una cotización</h3>
    <div class="row" style="gap:6px;">
      <input id="qh-text" placeholder="Buscar por cliente/placa..." />
      <button id="qh-apply" class="secondary">Buscar</button>
    </div>
    <div id="qh-list" class="list" style="max-height:300px; overflow:auto; margin-top:8px;"></div>`;
  openModal(node);
  const list=node.querySelector('#qh-list'); const q=node.querySelector('#qh-text');
  async function fetchList(){
    const res = await API.quotesList(q.value?('?q='+encodeURIComponent(q.value)):''); // API existente
    list.innerHTML='';
    (res?.items||res||[]).forEach(qq=>{
      const btn=document.createElement('button'); btn.className='secondary'; btn.textContent=`${(qq.number||'').toString().padStart(5,'0')} - ${qq?.client?.name||''} (${qq?.vehicle?.plate||''})`;
      btn.style.display='block'; btn.style.width='100%'; btn.style.textAlign='left'; btn.style.marginTop='6px';
      btn.onclick=()=>{ closeModal(); renderQuoteMini(qq); };
      list.appendChild(btn);
    });
  }
  node.querySelector('#qh-apply').onclick=fetchList;
  fetchList();
}

function renderQuoteMini(q){
  const head = byId('sv-q-header'); const body=byId('sv-q-body');
  head.textContent = q ? `Cotización #${String(q.number||'').toString().padStart(5,'0')} - ${q?.client?.name||''}` : '— ninguna cotización cargada —';
  body.innerHTML='';
  (q?.items||[]).forEach(it=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${it.type||'—'}</td><td>${it.description||it.name||''}</td><td class="t-center">${it.qty||1}</td><td class="t-right">${fmt(it.unit||0)}</td><td class="t-right">${fmt((it.qty||1)*(it.unit||0))}</td><td class="t-center"><button class="add secondary">→</button></td>`;
    tr.querySelector('button.add').onclick=async()=>{
      if(!current) current = await API.sales.start();
      current = await API.sales.addItem(current._id, { source: (it.source||'service')==='product'?'inventory':'service', sku: it.sku||'', name: it.description||it.name||'Servicio', qty: it.qty||1, unitPrice: it.unit||0 });
      render(); renderWO();
    };
    body.appendChild(tr);
  });
  const btnAll = byId('sv-q-to-sale');
  if(btnAll){ btnAll.onclick = async()=>{
    if(!q?.items?.length) return;
    if(!current) current = await API.sales.start();
    for(const it of q.items){
      current = await API.sales.addItem(current._id, { source: (it.source||'service')==='product'?'inventory':'service', sku: it.sku||'', name: it.description||it.name||'Servicio', qty: it.qty||1, unitPrice: it.unit||0 });
    }
    render(); renderWO();
  };}
}

// ===== Eventos raíz =====
export function initSales(){
  const ventas = document.getElementById('tab-ventas'); if(!ventas) return;
  // Oculta la vieja card de "Agregar SKU / Inventario / Lista de precios" si quedara en DOM (por si no se eliminó por HTML)
  $$('#tab-ventas .card input#sales-sku')?.forEach(inp=> inp.closest('.card')?.classList?.add('hidden'));

  loadTabs(); renderTabs();

  byId('sales-start')?.addEventListener('click', async()=>{
    current = await API.sales.start();
    if(!openTabs.includes(current._id)) openTabs.push(current._id);
    saveTabs(); renderTabs(); render(); renderWO();
  });

  byId('sales-scan-qr')?.addEventListener('click', openQR);
  byId('sales-add-general')?.addEventListener('click', openAddPicker);
  byId('sales-add-manual')?.addEventListener('click', openAddManual);
  byId('sales-close')?.addEventListener('click', async()=>{
    if(!current) return;
    try{ const r = await API.sales.close(current._id); alert('Venta cerrada'); openTabs = openTabs.filter(x=>x!==current._id); saveTabs(); current=null; renderTabs(); render(); }
    catch(e){ alert(e?.message||'No se pudo cerrar'); }
  });
  byId('sv-print-wo')?.addEventListener('click', ()=>{ if(current) buildWorkOrderPdf(current); });
  byId('sales-print')?.addEventListener('click', ()=>{ if(current) buildInvoicePdf(current); });
  byId('sv-loadQuote')?.addEventListener('click', loadQuote);
}

// auto init
try{ initSales(); }catch(e){ console.warn('initSales error', e); }
