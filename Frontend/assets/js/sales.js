
// Frontend/assets/sales.js — COMPLETO
import API, { authToken } from './api.js';

// ===== Helpers UI =====
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const byId = (id) => document.getElementById(id);

const money = (n) => {
  try { return (Number(n)||0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
  catch { return String(Math.round(Number(n)||0)); }
};

function openModal(node){
  const modal = byId('modal'), body = byId('modalBody'), x = byId('modalClose');
  if(!modal || !body || !x) return alert('Modal no disponible');
  body.innerHTML = ''; body.appendChild(node);
  modal.classList.remove('hidden');
  const onClick = (e)=>{ if(e.target===modal) closeModal(); };
  const onEsc = (e)=>{ if(e.key==='Escape') closeModal(); };
  modal.addEventListener('click', onClick, { once:true });
  document.addEventListener('keydown', onEsc, { once:true });
  x.onclick = ()=> closeModal();
}
function closeModal(){
  const modal = byId('modal'); const body = byId('modalBody');
  if(body) body.innerHTML='';
  modal?.classList.add('hidden');
}

// ===== Estado =====
let current = null;            // venta abierta actualmente
let openTabs = [];             // array de IDs de ventas en UI
let currentQuote = null;       // cotización cargada en el bloque lateral

// Persistencia simple de tabs por empresa
const TABS_KEY = 'sales:openTabs';
function saveTabs(){ try{ localStorage.setItem(TABS_KEY, JSON.stringify(openTabs)); }catch{} }
function loadTabs(){ try{ openTabs = JSON.parse(localStorage.getItem(TABS_KEY)||'[]')||[]; }catch{ openTabs=[]; } }

// ===== Render =====
function renderHeader(){
  const lp = byId('sv-mini-plate'), ln = byId('sv-mini-name'), lr = byId('sv-mini-phone');
  const c=current?.customer||{}, v=current?.vehicle||{};
  if(lp) lp.textContent = v.plate || '—';
  if(ln) ln.textContent = `Cliente: ${c.name||'—'}`;
  if(lr) lr.textContent = `Cel: ${c.phone||'—'}`;
}

function renderItems(){
  const body = byId('sales-body'), total = byId('sales-total');
  if(!body) return;
  body.innerHTML='';
  (current?.items||[]).forEach(it=>{
    const trTpl = byId('tpl-sale-row');
    const tr = trTpl?.content?.firstElementChild?.cloneNode(true) || document.createElement('tr');
    tr.querySelector('[data-sku]').textContent = it.sku||'';
    tr.querySelector('[data-name]').textContent = it.name||'';
    const qty = tr.querySelector('.qty'); qty.value = String(it.qty||1);
    tr.querySelector('[data-unit]').textContent  = money(it.unitPrice||0);
    tr.querySelector('[data-total]').textContent = money(it.total||0);

    qty.addEventListener('change', async()=>{
      const v = Math.max(1, Number(qty.value||1)||1);
      current = await API.sales.updateItem(current._id, it._id, { qty:v });
      renderItems(); renderWO();
    });

    tr.querySelector('.remove')?.addEventListener('click', async()=>{
      try{
        current = await API.sales.removeItem(current._id, it._id);
        renderItems(); renderWO();
      }catch(e){ alert(e?.message||'No se pudo quitar'); }
    });

    body.appendChild(tr);
  });
  if(total){
    const t = (current?.items||[]).reduce((a, it)=> a + (Number(it.total)||0), 0);
    total.textContent = money(t);
  }
  renderHeader();
}

function renderTabs(){
  const wrap = byId('saleTabs'); if(!wrap) return;
  wrap.innerHTML='';
  openTabs.forEach(id=>{
    const tpl = byId('tpl-sale-tab');
    const node = tpl?.content?.firstElementChild?.cloneNode(true) || document.createElement('span');
    node.className='sales-tab';
    const label = node.querySelector('.label'); const x = node.querySelector('.close');
    label.textContent = `VENTA ${String(id).slice(-4)}`;
    if(current?._id===id) node.classList.add('active');
    label.onclick = async()=>{
      try{ current = await API.sales.get(id); renderTabs(); renderItems(); renderWO(); renderQuote(); }
      catch{ /* venta puede haber cerrado */ }
    };
    x.onclick = ()=>{
      openTabs = openTabs.filter(sid => sid!==id);
      if(current?._id===id) current = null;
      saveTabs(); renderTabs(); renderItems(); renderWO(); renderQuote();
    };
    wrap.appendChild(node);
  });
}

// ===== Orden de trabajo (mini) =====
function renderWO(){
  const body = byId('sv-wo-body'); if(!body) return;
  body.innerHTML='';
  (current?.items||[]).forEach(it=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${(it.name||it.sku||'').toString()}</td><td class="t-center">${Number(it.qty||1)}</td>`;
    body.appendChild(tr);
  });
}

// ===== Cotizaciones (bloque lateral) =====
function renderQuote(){
  const qBody = byId('sv-q-body');
  const qHeader = byId('sv-q-header');
  if(!qBody) return;
  qBody.innerHTML='';
  if(!currentQuote || !Array.isArray(currentQuote.items) || !currentQuote.items.length){
    if(qHeader) qHeader.textContent = '— ninguna cotización cargada —';
    return;
  }
  if(qHeader) qHeader.textContent = `Cotización #${currentQuote.number} — ${currentQuote.customer?.name||''} • ${currentQuote.vehicle?.plate||''}`;
  currentQuote.items.forEach((it, idx)=>{
    const tr = document.createElement('tr');
    const qty = Number(it.qty||1) || 1;
    const up  = Number(it.unitPrice||0) || 0;
    const tot = Number(it.subtotal||Math.round(qty*up)) || 0;
    tr.innerHTML = `
      <td>${it.kind||''}</td>
      <td>${it.description||''}</td>
      <td class="t-center">${qty}</td>
      <td class="t-right">${money(up)}</td>
      <td class="t-right">${money(tot)}</td>
      <td class="t-center"><button class="q-to-sale" data-i="${idx}">→</button></td>
    `;
    qBody.appendChild(tr);
  });
  // Delegación del botón por fila
  qBody.onclick = async (ev)=>{
    const b = ev.target.closest('button.q-to-sale');
    if(!b) return;
    const i = Number(b.dataset.i||-1);
    if(i<0) return;
    await pushQuoteLineToSale(currentQuote.items[i]);
  };
}

async function pushQuoteLineToSale(line){
  if(!current) return alert('Crea primero una venta');
  const qty = Number(line?.qty||1) || 1;
  const up  = Number(line?.unitPrice||0) || 0;
  const name= String(line?.description||'SERVICIO');
  // Sin enlace a inventario en el modelo de cotizaciones, agregamos como "price" (servicio)
  try{
    current = await API.sales.addItem(current._id, { source:'price', name, qty, unitPrice: up });
    renderItems(); renderWO();
  }catch(e){ alert(e?.message||'No se pudo pasar a venta'); }
}

async function pushAllQuoteToSale(){
  if(!current) return alert('Crea primero una venta');
  if(!currentQuote?.items?.length) return;
  for(const it of currentQuote.items){
    const qty = Number(it?.qty||1) || 1;
    const up  = Number(it?.unitPrice||0) || 0;
    const name= String(it?.description||'SERVICIO');
    try{
      current = await API.sales.addItem(current._id, { source:'price', name, qty, unitPrice: up });
    }catch(e){ /* continuar con el resto */ }
  }
  renderItems(); renderWO();
}

async function openQuotePicker(){
  const tpl = byId('tpl-quote-picker');
  if(!tpl) return alert('No hay plantilla para el picker de cotizaciones');
  const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const body = node.querySelector('#qpick-body');
  const txt  = node.querySelector('#qpick-text');
  const btnS = node.querySelector('#qpick-search');
  const btnC = node.querySelector('#qpick-cancel');

  async function load(q=''){
    body.innerHTML='<tr><td colspan="6" class="t-center muted">Cargando…</td></tr>';
    try{
      const qs = q ? `?q=${encodeURIComponent(q)}` : '';
      const list = await API.quotesList(qs);
      body.innerHTML='';
      (list||[]).forEach(doc=>{
        const tr = document.createElement('tr');
        const d = new Date(doc.createdAt);
        const total = Number(doc.total||0);
        tr.innerHTML = \`
          <td>\${doc.number||''}</td>
          <td>\${doc.customer?.name||''}</td>
          <td>\${doc.vehicle?.plate||''}</td>
          <td>\${isFinite(d.getTime())? d.toLocaleDateString(): ''}</td>
          <td class="t-right">\${money(total)}</td>
          <td class="t-center"><button class="pick" data-id="\${doc._id}">Usar</button></td>\`;
        body.appendChild(tr);
      });
      if(!body.children.length){
        body.innerHTML='<tr><td colspan="6" class="t-center muted">Sin resultados</td></tr>';
      }
    }catch(e){
      body.innerHTML = '<tr><td colspan="6" class="t-center">Error cargando</td></tr>';
    }
  }
  btnS.onclick = ()=> load(String(txt.value||'').trim());
  btnC.onclick = ()=> closeModal();
  body.onclick = async (ev)=>{
    const b = ev.target.closest('button.pick'); if(!b) return;
    const id = b.dataset.id;
    try{
      const tok = authToken.get();
      const res = await fetch(\`\${API.base}/api/v1/quotes/\${id}\`, {
        headers: tok ? { 'Authorization': 'Bearer '+tok } : {}
      });
      if(!res.ok) throw new Error('No se pudo cargar la cotización');
      currentQuote = await res.json();
      renderQuote();
      closeModal();
    }catch(e){ alert(e?.message||'No se pudo cargar la cotización'); }
  };
  load();
}

// ===== Cliente / vehículo =====
function openEditCV(){
  if(!current) return alert('Crea primero una venta');
  const tpl = byId('sales-cv-template');
  const node = tpl.content.firstElementChild.cloneNode(true);
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

  // Autocompletar por placa al hacer blur
  const plateInput = node.querySelector('#v-plate');
  if(plateInput){
    plateInput.addEventListener('blur', async ()=>{
      const p = String(plateInput.value||'').trim(); if(!p) return;
      try{
        const prof = await API.sales.profileByPlate(p);
        if(prof){
          const cc=prof.customer||{}, vv=prof.vehicle||{};
          node.querySelector('#c-name').value = cc.name||'';
          node.querySelector('#c-id').value   = cc.idNumber||'';
          node.querySelector('#c-phone').value= cc.phone||'';
          node.querySelector('#c-email').value= cc.email||'';
          node.querySelector('#c-address').value= cc.address||'';
          node.querySelector('#v-plate').value = vv.plate||p.toUpperCase();
          node.querySelector('#v-brand').value = vv.brand||'';
          node.querySelector('#v-line').value  = vv.line||'';
          node.querySelector('#v-engine').value= vv.engine||'';
          node.querySelector('#v-year').value  = vv.year ?? '';
        }
      }catch{}
    }, { once:true });
  }

  node.querySelector('#sales-save-cv').onclick = async()=>{
    try{
      const payload = {
        customer: {
          name: node.querySelector('#c-name').value.trim(),
          idNumber: node.querySelector('#c-id').value.trim(),
          phone: node.querySelector('#c-phone').value.trim(),
          email: node.querySelector('#c-email').value.trim(),
          address: node.querySelector('#c-address').value.trim()
        },
        vehicle: {
          plate: (node.querySelector('#v-plate').value||'').trim().toUpperCase(),
          brand: (node.querySelector('#v-brand').value||'').trim().toUpperCase(),
          line:  (node.querySelector('#v-line').value||'').trim().toUpperCase(),
          engine:(node.querySelector('#v-engine').value||'').trim().toUpperCase(),
          year: Number(node.querySelector('#v-year').value||'')||null,
          mileage: Number(node.querySelector('#v-mile').value||'')||null
        }
      };
      current = await API.sales.setCustomerVehicle(current._id, payload);
      closeModal(); renderHeader();
    }catch(e){ alert(e?.message||'No se pudo guardar'); }
  };
  node.querySelector('#sales-cancel-cv').onclick = ()=> closeModal();
}

async function clearCV(){
  if(!current) return;
  if(!confirm('¿Quitar datos de cliente y vehículo de esta venta?')) return;
  try{
    current = await API.sales.setCustomerVehicle(current._id, { customer:{}, vehicle:{} });
    renderHeader();
  }catch(e){ alert(e?.message||'No se pudo limpiar'); }
}

// ===== QR Scanner =====
function parseCode(raw){
  if(!raw) return null; let s=String(raw).trim();
  try{ if(/^https?:\/\//i.test(s)){ const u=new URL(s); s=u.pathname.split('/').filter(Boolean).pop()||s; } }catch{}
  const m=s.match(/[a-f0-9]{24}/ig); if(m?.length) return {type:'id',value:m[m.length-1]};
  if(/^[A-Z0-9\-_]+$/i.test(s)) return {type:'sku',value:s.toUpperCase()};
  const it = s.match(/^IT:([^:]+):([a-f0-9]{24}):(.+)$/i);
  if(it) return {type:'id', value:it[2]};
  return null;
}

async function ensureJsQR(){
  if(window.jsQR) return true;
  return new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = ()=> res(true);
    s.onerror = ()=> rej(new Error('No se pudo cargar jsQR'));
    document.head.appendChild(s);
  });
}

function openQR(){
  if(!current) return alert('Crea primero una venta');
  const tpl = byId('tpl-qr-scanner'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);

  const video = node.querySelector('video');
  const canvas = node.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const msg = node.querySelector('#qr-msg');
  const sel = node.querySelector('#qr-cam');
  const ac  = node.querySelector('#qr-autoclose');
  const list= node.querySelector('#qr-list');

  let stream=null, detector=null, running=false, lastCode='', lastTs=0;

  async function fillCams(){
    try{
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind==='videoinput');
      sel.innerHTML = cams.map(c => `<option value="\${c.deviceId}">\${c.label||'Cámara'}</option>`).join('');
    }catch{ sel.innerHTML='<option value="">Predeterminada</option>'; }
  }

  function stop(){
    try{ video.pause(); }catch{}
    try{ (stream?.getTracks()||[]).forEach(t=>t.stop()); }catch{}
    running=false;
  }

  async function start(){
    try{
      stop();
      const cs = { video: sel.value?{deviceId:{exact:sel.value}}:{facingMode:'environment'}, audio:false };
      stream = await navigator.mediaDevices.getUserMedia(cs);
      video.srcObject = stream; await video.play(); running=true;

      if(window.BarcodeDetector){
        detector = new BarcodeDetector({ formats:['qr_code'] });
        tickNative();
      } else {
        await ensureJsQR();
        tickCanvas();
      }
      msg.textContent='';
    }catch(e){
      msg.textContent='No se pudo abrir cámara: '+(e?.message||e?.name||'Desconocido');
    }
  }

  function accept(v){
    const t=Date.now();
    if(lastCode===v && t-lastTs<1200) return false;
    lastCode=v; lastTs=t; return true;
  }

  function onCode(code){
    if(!accept(code)) return;
    const li=document.createElement('li'); li.textContent=code; list.prepend(li);
    const p=parseCode(code);
    if(!p){ msg.textContent='Código no reconocido'; return; }
    (async()=>{
      try{
        if(p.type==='id'){
          current = await API.sales.addItem(current._id, { source:'inventory', refId:p.value, qty:1 });
        } else {
          current = await API.sales.addItem(current._id, { source:'inventory', sku:p.value, qty:1 });
        }
        renderItems(); renderWO();
        if(ac.checked){ stop(); closeModal(); }
      }catch(e){ msg.textContent=e?.message||'No se pudo agregar'; }
    })();
  }

  async function tickNative(){
    if(!running) return;
    try{
      const codes = await detector.detect(video);
      if(codes?.length){ onCode(codes[0].rawValue); }
    }catch{}
    requestAnimationFrame(tickNative);
  }

  function tickCanvas(){
    if(!running) return;
    try{
      const w = video.videoWidth || 640, h = video.videoHeight || 480;
      canvas.width=w; canvas.height=h;
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0,0,w,h);
      const res = window.jsQR ? window.jsQR(img.data, w, h) : null;
      if(res && res.data){ onCode(res.data); }
    }catch{}
    requestAnimationFrame(tickCanvas);
  }

  node.querySelector('#qr-start').onclick = start;
  node.querySelector('#qr-stop').onclick  = stop;
  node.querySelector('#qr-add-manual').onclick = ()=>{
    const v = String(node.querySelector('#qr-manual').value||'').trim();
    if(!v) return; onCode(v);
  };

  fillCams();
}

// ===== Pickers de Inventario y Lista de precios =====
function openInvPicker(){
  const tpl = byId('tpl-inv-picker'); if(!tpl) return alert('No hay plantilla de inventario');
  const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const name = node.querySelector('#p-inv-name');
  const sku  = node.querySelector('#p-inv-sku');
  const intake = node.querySelector('#p-inv-intake');
  const body = node.querySelector('#p-inv-body');
  const count= node.querySelector('#p-inv-count');

  async function load(){
    body.innerHTML = '<tr><td colspan="6" class="t-center muted">Cargando…</td></tr>';
    try{
      const items = await API.inventory.itemsList({ name: name.value||'', sku: sku.value||'', intake: intake.value||'' });
      body.innerHTML='';
      (items||[]).forEach(it=>{
        const trTpl = byId('tpl-inv-row');
        const tr = trTpl?.content?.firstElementChild?.cloneNode(true) || document.createElement('tr');
        tr.querySelector('.thumb').src = it.images?.[0]?.url || '';
        tr.querySelector('[data-sku]').textContent = it.sku||'';
        tr.querySelector('[data-name]').textContent = it.name||'';
        tr.querySelector('[data-stock]').textContent = Number(it.stock||0);
        tr.querySelector('[data-price]').textContent = money(it.salePrice||0);
        tr.querySelector('button.add').onclick = async()=>{
          try{
            current = await API.sales.addItem(current._id, { source:'inventory', refId: it._id, qty:1 });
            renderItems(); renderWO();
          }catch(e){ alert(e?.message||'No se pudo agregar'); }
        };
        body.appendChild(tr);
      });
      if(count) count.textContent = String(body.children.length);
      if(!body.children.length) body.innerHTML='<tr><td colspan="6" class="t-center muted">Sin resultados</td></tr>';
    }catch(e){
      body.innerHTML='<tr><td colspan="6" class="t-center">Error</td></tr>';
    }
  }
  node.querySelector('#p-inv-search').onclick = load;
  node.querySelector('#p-inv-cancel').onclick = ()=> closeModal();
  load();
}

function openPricePicker(){
  const tpl = byId('tpl-price-picker'); if(!tpl) return alert('No hay plantilla de precios');
  const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const svc = node.querySelector('#p-pr-svc');
  const brand = node.querySelector('#p-pr-brand');
  const line = node.querySelector('#p-pr-line');
  const engine = node.querySelector('#p-pr-engine');
  const year = node.querySelector('#p-pr-year');
  const body = node.querySelector('#p-pr-body');
  const count= node.querySelector('#p-pr-count');

  async function load(){
    body.innerHTML='<tr><td colspan="7" class="t-center muted">Cargando…</td></tr>';
    try{
      const rows = await API.pricesList({
        svc: svc?.value||'',
        brand: brand?.value||'',
        line: line?.value||'',
        engine: engine?.value||'',
        year: year?.value||''
      });
      body.innerHTML='';
      (rows||[]).forEach(pe=>{
        const trTpl = byId('tpl-price-row');
        const tr = trTpl?.content?.firstElementChild?.cloneNode(true) || document.createElement('tr');
        tr.querySelector('[data-brand]').textContent = pe.brand||'';
        tr.querySelector('[data-line]').textContent = pe.line||'';
        tr.querySelector('[data-engine]').textContent = pe.engine||'';
        tr.querySelector('[data-year]').textContent = pe.year||'';
        tr.querySelector('[data-price]').textContent = money(pe.total||pe.price||0);
        tr.querySelector('button.add').onclick = async()=>{
          try{
            current = await API.sales.addItem(current._id, { source:'price', refId: pe._id, qty:1 });
            renderItems(); renderWO();
          }catch(e){ alert(e?.message||'No se pudo agregar'); }
        };
        body.appendChild(tr);
      });
      if(count) count.textContent = String(body.children.length);
      if(!body.children.length) body.innerHTML='<tr><td colspan="7" class="t-center muted">Sin resultados</td></tr>';
    }catch(e){
      body.innerHTML='<tr><td colspan="7" class="t-center">Error</td></tr>';
    }
  }
  node.querySelector('#p-pr-search').onclick = load;
  node.querySelector('#p-pr-cancel').onclick = ()=> closeModal();
  load();
}

// ===== Acciones =====
async function startSale(){
  const s = await API.sales.start();
  current = s;
  if(!openTabs.includes(current._id)) openTabs.push(current._id);
  saveTabs(); renderTabs(); renderItems(); renderWO(); renderQuote();
}

async function closeSale(){
  if(!current) return;
  if(!confirm('¿Cerrar la venta actual?')) return;
  try{
    current = await API.sales.close(current._id);
    alert('Venta cerrada');
  }catch(e){ alert(e?.message||'No se pudo cerrar'); }
}

function shareWA(){
  if(!current) return;
  const url = `https://wa.me/?text=${encodeURIComponent(`VENTA ${String(current.number||'').padStart(5,'0')} Total: ${money(current.total||0)}`)}`;
  window.open(url, '_blank');
}

async function printWO(){ // Orden de trabajo
  if(!current) return;
  let pdf = null;
  try { pdf = await import('./pdf.js'); } catch {}
  if(!pdf || typeof pdf.buildWorkOrderPdf!=='function'){
    alert('PDF no disponible');
    return;
  }
  try{ pdf.buildWorkOrderPdf(current); }
  catch(e){ alert('Error al generar PDF: '+(e?.message||'desconocido')); }
}

// ===== Init =====
let inited=false;
export function initSales(){
  if(inited) return; inited=true;
  const root = byId('tab-ventas'); if(!root) return;

  loadTabs(); renderTabs();

  if(openTabs.length){
    API.sales.get(openTabs[openTabs.length-1]).then(s=>{ current=s; renderTabs(); renderItems(); renderWO(); renderQuote(); }).catch(()=>{});
  }

  byId('sales-start')?.addEventListener('click', ()=> startSale());
  byId('sales-scan-qr')?.addEventListener('click', ()=> openQR());
  byId('sv-edit-cv')?.addEventListener('click', ()=> openEditCV());
  byId('sv-clear-cv')?.addEventListener('click', ()=> clearCV());
  byId('sales-close')?.addEventListener('click', ()=> closeSale());
  byId('sales-print')?.addEventListener('click', ()=> printWO());
  byId('sales-share-wa')?.addEventListener('click', ()=> shareWA());

  // Agregar ítems
  byId('sales-add-sku')?.addEventListener('click', async()=>{
    const input = byId('sales-sku');
    const sku = String(input?.value||'').trim(); if(!sku) return;
    try{
      current = await API.sales.addItem(current._id, { source:'inventory', sku, qty:1 });
      input.value='';
      renderItems(); renderWO();
    }catch(e){ alert(e?.message||'No se pudo agregar'); }
  });
  byId('sales-add-inv')?.addEventListener('click', ()=> openInvPicker());
  byId('sales-add-prices')?.addEventListener('click', ()=> openPricePicker());

  // Cotizaciones
  byId('sv-loadQuote')?.addEventListener('click', ()=> openQuotePicker());
  byId('sv-q-to-sale')?.addEventListener('click', ()=> pushAllQuoteToSale());
}
