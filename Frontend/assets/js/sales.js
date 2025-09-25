// assets/js/sales.js (completo, actualizado)
import API from './api.js';
import { buildWorkOrderPdf, buildInvoicePdf, money } from './pdf.js';

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const byId = (id) => document.getElementById(id);
const clone = (id) => {
  const t = document.getElementById(id);
  return t?.content?.firstElementChild?.cloneNode(true);
};
const fmt = (n)=> money(n);

// ===== Estado =====
let current = null;
let openTabs = [];
const tabsKey = () => `sales:openTabs:${(API.getActiveCompany?.()||'').toLowerCase()}`;

function saveTabs(){ try{ localStorage.setItem(tabsKey(), JSON.stringify(openTabs)); }catch{} }
function loadTabs(){ try{ openTabs = JSON.parse(localStorage.getItem(tabsKey())||'[]'); }catch{ openTabs=[]; } }

// ===== UI Pestañas =====
function labelFor(id){
  if(current && id===current._id){
    const p = current?.vehicle?.plate || '';
    return p ? `VENTA · ${p.toUpperCase()}` : id.slice(-6).toUpperCase();
  }
  return id.slice(-6).toUpperCase();
}

function renderTabs(){
  const cont = byId('saleTabs'); if(!cont) return;
  cont.innerHTML='';
  for(const id of openTabs){
    const tab = clone('tpl-sale-tab');
    tab.querySelector('.label').textContent = labelFor(id);
    if(current && id===current._id) tab.classList.add('active');
    tab.addEventListener('click', ()=> switchTo(id));
    tab.querySelector('.close').addEventListener('click', async (e)=>{
      e.stopPropagation();
      if(!confirm('¿Deseas cancelar la venta?')) return;
      try{ await API.sales.cancel(id); }catch{}
      openTabs = openTabs.filter(x=>x!==id); saveTabs();
      if(current && current._id===id){ current=null; render(); }
      renderTabs();
    });
    cont.appendChild(tab);
  }
}

async function switchTo(id){
  try{
    current = await API.sales.get(id);
    if(!openTabs.includes(id)){ openTabs.push(id); saveTabs(); }
    renderTabs(); render(); renderWO();
  }catch(e){ console.error(e); }
}

// ===== Mini resumen cliente/vehículo =====
function renderMini(){
  const lp = byId('sv-mini-plate'), ln = byId('sv-mini-name'), lr = byId('sv-mini-phone');
  const c=current?.customer||{}, v=current?.vehicle||{};
  if(lp) lp.textContent = v.plate || '—';
  if(ln) ln.textContent = `Cliente: ${c.name||'—'}`;
  if(lr) lr.textContent = `Cel: ${c.phone||'—'}`;
}

// ===== Tabla venta =====
function render(){
  const body = byId('sales-body'), total = byId('sales-total');
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
      const v = Math.max(1, Number(qty.value||1)||1);
      current = await API.sales.updateItem(current._id, it._id, { qty:v });
      render(); renderWO();
    });

    const actions = tr.querySelector('td:last-child');
    const btnEdit = document.createElement('button'); btnEdit.textContent='Editar $'; btnEdit.className='secondary';
    btnEdit.onclick = async()=>{
      const v = prompt('Nuevo precio unitario:', String(it.unitPrice||0)); if(v==null) return;
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: Number(v)||0 });
      render(); renderWO();
    };
    const btnZero = document.createElement('button'); btnZero.textContent='Precio 0'; btnZero.className='secondary';
    btnZero.onclick = async()=>{ current = await API.sales.updateItem(current._id, it._id, { unitPrice: 0 }); render(); renderWO(); };
    const btnDel = tr.querySelector('button.remove');
    btnDel.onclick = async()=>{ await API.sales.removeItem(current._id, it._id); current = await API.sales.get(current._id); render(); renderWO(); };
    actions.prepend(btnEdit); actions.prepend(btnZero);

    body.appendChild(tr);
  });
  if(total) total.textContent = fmt(current?.total||0);
  renderMini(); renderTabs();
}

// ===== Orden de trabajo (preview) =====
function renderWO(){
  const b = byId('sv-wo-body'); if(!b) return;
  b.innerHTML='';
  for(const it of (current?.items||[])){
    const tr=document.createElement('tr');
    const td1=document.createElement('td'); const td2=document.createElement('td'); td2.className='t-center';
    td1.textContent = it.name||''; td2.textContent = String(it.qty||1);
    tr.append(td1,td2); b.appendChild(tr);
  }
}

// ====== Modal genérico ======
function openModal(node){
  const modal = byId('modal'); const slot=byId('modalBody'); const x=byId('modalClose');
  if(!modal||!slot||!x) return;
  slot.replaceChildren(node); modal.classList.remove('hidden');
  x.onclick = ()=> modal.classList.add('hidden');
}
function closeModal(){ const m=byId('modal'); if(m) m.classList.add('hidden'); }

// ====== QR Scanner ======
function parseCode(raw){
  if(!raw) return null; let s=String(raw).trim();
  try{ if(/^https?:\/\//i.test(s)){ const u=new URL(s); s=u.pathname.split('/').filter(Boolean).pop()||s; } }catch{}
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
  let stream=null, running=false, detector=null, lastCode=null, lastTs=0;

  async function fillCams(){ try{ const devs = await navigator.mediaDevices.enumerateDevices(); const cams=devs.filter(d=>d.kind==='videoinput'); sel.replaceChildren(...cams.map((c,i)=>{ const o=document.createElement('option'); o.value=c.deviceId; o.textContent=c.label||('Cam '+(i+1)); return o; })); }catch{} }
  function stop(){ try{ video.pause(); }catch{}; try{ (stream?.getTracks()||[]).forEach(t=>t.stop()); }catch{}; running=false; }
  async function start(){ try{
      stop(); const cs={ video: sel.value?{deviceId:{exact:sel.value}}:{facingMode:'environment'}, audio:false };
      stream=await navigator.mediaDevices.getUserMedia(cs); video.srcObject=stream; await video.play(); running=true;
      if(window.BarcodeDetector){ detector=new BarcodeDetector({formats:['qr_code']}); tickNative(); } else { tickCanvas(); }
      msg.textContent='';
    }catch(e){ msg.textContent='No se pudo abrir cámara: '+(e?.message||e?.name||'Desconocido'); }
  }
  function accept(v){ const t=Date.now(); if(lastCode===v && t-lastTs<1200) return false; lastCode=v; lastTs=t; return true; }
  function onCode(code){ if(!accept(code)) return; const li=document.createElement('li'); li.textContent=code; list.prepend(li);
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

// ====== Agregar manual ======
function openAddManual(){
  if(!current) return alert('Crea primero una venta');
  const tpl = document.getElementById('tpl-add-manual'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  node.querySelector('#am-cancel').onclick=()=>closeModal();
  node.querySelector('#am-add').onclick=async()=>{
    const name = node.querySelector('#am-name').value.trim();
    const qty  = Number(node.querySelector('#am-qty').value||1)||1;
    const price= Number(node.querySelector('#am-price').value||0)||0;
    const sku  = node.querySelector('#am-sku').value.trim();
    if(!name) return alert('Descripción requerida');
    current = await API.sales.addItem(current._id, { source:'service', sku, name, qty, unitPrice:price });
    closeModal(); render(); renderWO();
  };
}

// ====== Pickers (inventario / precios) ======
async function openPickerInventory(){
  const tpl = document.getElementById('tpl-inv-picker'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const body=node.querySelector('#p-inv-body'), cnt=node.querySelector('#p-inv-count');
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
        current = await API.sales.addItem(current._id, { source:'inventory', refId: it._id, qty:1 });
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
  const head=node.querySelector('#p-pr-head'), body=node.querySelector('#p-pr-body'), cnt=node.querySelector('#p-pr-count');
  const svc=node.querySelector('#p-pr-svc'); const b=node.querySelector('#p-pr-brand'), l=node.querySelector('#p-pr-line'), e=node.querySelector('#p-pr-engine'), y=node.querySelector('#p-pr-year');
  head.innerHTML = '<th>Marca</th><th>Línea</th><th>Motor</th><th>Año</th><th class="t-right">Precio</th><th></th>';
  try{
    const svcs = await API.servicesList();
    svc.replaceChildren(...(svcs||[]).map(s=>{ const o=document.createElement('option'); o.value=s._id; o.textContent=s.name||('Servicio '+s._id.slice(-6)); return o; }));
  }catch{}
  let page=1, pageSize=20;
  async function load(reset=false){
    if(reset){ body.innerHTML=''; page=1; }
    const rows = await API.pricesList({ serviceId: svc.value||'', brand:b.value||'', line:l.value||'', engine:e.value||'', year:y.value||'', page, limit:pageSize });
    cnt.textContent=rows.length; body.innerHTML='';
    for(const pe of rows){
      const tr = clone('tpl-price-row');
      tr.querySelector('[data-brand]').textContent = pe.brand||'';
      tr.querySelector('[data-line]').textContent = pe.line||'';
      tr.querySelector('[data-engine]').textContent = pe.engine||'';
      tr.querySelector('[data-year]').textContent = pe.year||'';
      tr.querySelector('[data-price]').textContent = fmt(pe.total||pe.price||0);
      tr.querySelector('button.add').onclick = async ()=>{
        current = await API.sales.addItem(current._id, { source:'price', refId: pe._id, qty:1 });
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

// ====== Cargar cotización en mini y pasar ítems a venta ======
async function loadQuote(){
  const node=document.createElement('div'); node.className='card'; node.innerHTML=`
    <h3>Selecciona una cotización</h3>
    <div class="row" style="gap:6px;"><input id="qh-text" placeholder="Buscar por cliente/placa..." /><button id="qh-apply" class="secondary">Buscar</button></div>
    <div id="qh-list" class="list" style="max-height:300px; overflow:auto; margin-top:8px;"></div>`;
  openModal(node);
  const list=node.querySelector('#qh-list'); const q=node.querySelector('#qh-text');
  async function fetchList(){
    const res = await API.quotesList(q.value?('?q='+encodeURIComponent(q.value)):''); // usa backend
    list.innerHTML='';
    (res?.items||res||[]).forEach(qq=>{
      const btn=document.createElement('button'); btn.className='secondary';
      btn.textContent=`${(qq.number||'').toString().padStart(5,'0')} - ${qq?.client?.name||''} (${qq?.vehicle?.plate||''})`;
      btn.style.cssText='display:block;width:100%;text-align:left;margin-top:6px;';
      btn.onclick=()=>{ closeModal(); renderQuoteMini(qq); };
      list.appendChild(btn);
    });
  }
  node.querySelector('#qh-apply').onclick=fetchList;
  fetchList();
}

function renderQuoteMini(q){
  const head=byId('sv-q-header'), body=byId('sv-q-body');
  head.textContent = q ? `Cotización #${String(q.number||'').toString().padStart(5,'0')} - ${q?.client?.name||''}` : '— ninguna cotización cargada —';
  body.innerHTML='';
  (q?.items||[]).forEach(it=>{
    const tr=document.createElement('tr');
    const unit = Number(it.unitPrice ?? it.unit ?? 0) || 0;
    const qty  = Number(it.qty||1)||1;
    tr.innerHTML=`<td>${it.type||'—'}</td><td>${it.description||it.name||''}</td><td class="t-center">${qty}</td><td class="t-right">${fmt(unit)}</td><td class="t-right">${fmt(qty*unit)}</td><td class="t-center"><button class="add secondary">→</button></td>`;
    tr.querySelector('button.add').onclick=async()=>{
      if(!current) current = await API.sales.start();
      current = await API.sales.addItem(current._id, {
        source: (it.source||'service')==='product' ? 'inventory' : 'service',
        sku: it.sku||'',
        name: it.description||it.name||'Servicio',
        qty,
        unitPrice: unit
      });
      render(); renderWO();
    };
    body.appendChild(tr);
  });
  const btnAll = byId('sv-q-to-sale');
  if(btnAll){ btnAll.onclick = async()=>{
    if(!q?.items?.length) return;
    if(!current) current = await API.sales.start();
    for(const it of q.items){
      const unit = Number(it.unitPrice ?? it.unit ?? 0) || 0;
      const qty  = Number(it.qty||1)||1;
      current = await API.sales.addItem(current._id, {
        source: (it.source||'service')==='product' ? 'inventory' : 'service',
        sku: it.sku||'',
        name: it.description||it.name||'Servicio',
        qty,
        unitPrice: unit
      });
    }
    render(); renderWO();
  };}
}

// ====== Editar cliente/vehículo (modal) ======
function openEditCV(){
  if(!current) return alert('Crea primero una venta');
  const tpl = byId('sales-cv-template'); const node = tpl.content.firstElementChild.cloneNode(true);
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
  node.querySelector('#v-year').value  = v.year ?? '';
  node.querySelector('#v-mile').value  = v.mileage ?? '';
  openModal(node);
  node.querySelector('#sales-save-cv').onclick = async ()=>{
    const payload = {
      customer: {
        name: node.querySelector('#c-name').value.trim(),
        idNumber: node.querySelector('#c-id').value.trim(),
        phone: node.querySelector('#c-phone').value.trim(),
        email: node.querySelector('#c-email').value.trim(),
        address: node.querySelector('#c-address').value.trim()
      },
      vehicle: {
        plate: node.querySelector('#v-plate').value.trim(),
        brand: node.querySelector('#v-brand').value.trim(),
        line: node.querySelector('#v-line').value.trim(),
        engine: node.querySelector('#v-engine').value.trim(),
        year: Number(node.querySelector('#v-year').value||'') || null,
        mileage: Number(node.querySelector('#v-mile').value||'') || null
      }
    };
    try{
      current = await API.sales.setCustomerVehicle(current._id, payload);
      closeModal(); renderMini(); renderTabs();
    }catch(e){ alert(e?.message||'No se pudieron guardar los datos'); }
  };
}

// ====== Init y eventos ======
let starting=false;
export function initSales(){
  const ventas = document.getElementById('tab-ventas'); if(!ventas) return;

  loadTabs(); renderTabs();

  // Rehidratar última pestaña si existe
  if(openTabs.length){
    API.sales.get(openTabs[openTabs.length-1]).then(s=>{ current=s; renderTabs(); render(); renderWO(); }).catch(()=>{});
  }

  // Botones barra superior
  byId('sales-start')?.addEventListener('click', async (ev)=>{
    if(starting) return; starting=true;
    const btn = ev.currentTarget; if(btn) btn.disabled = true;
    try{
      const s = await API.sales.start();
      current = s;
      if(!openTabs.includes(current._id)) openTabs.push(current._id);
      saveTabs(); renderTabs(); render(); renderWO();
    }catch(e){ console.error('start sale error', e); alert(e?.message||'No se pudo crear la venta'); }
    finally{ starting=false; if(btn) btn.disabled=false; }
  });

  byId('sales-scan-qr')?.addEventListener('click', openQR);
  byId('sales-add-general')?.addEventListener('click', openAddPicker);
  byId('sales-add-manual')?.addEventListener('click', openAddManual);

  byId('sales-close')?.addEventListener('click', async ()=>{
    if(!current) return;
    try{
      await API.sales.close(current._id);
      alert('Venta cerrada');
      openTabs = openTabs.filter(x=>x!==current._id); saveTabs();
      current=null; renderTabs(); render(); renderWO();
    }catch(e){ alert(e?.message||'No se pudo cerrar'); }
  });

  byId('sv-print-wo')?.addEventListener('click', async ()=>{
    if(!current) return;
    try{ const fresh = await API.sales.get(current._id); buildWorkOrderPdf(fresh); }catch(e){ alert(e?.message||'No se pudo imprimir OT'); }
  });

  byId('sales-print')?.addEventListener('click', async ()=>{
    if(!current) return;
    try{ const fresh = await API.sales.get(current._id); await buildInvoicePdf(fresh); }catch(e){ alert(e?.message||'No se pudo generar la factura'); }
  });

  byId('sv-loadQuote')?.addEventListener('click', loadQuote);
  byId('sv-edit-cv')?.addEventListener('click', openEditCV);
}

// Auto-init
try{ initSales(); }catch(e){ console.warn('initSales error', e); }
