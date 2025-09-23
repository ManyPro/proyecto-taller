// Frontend/assets/js/sales.js
// Ventas multi-pestaña + QR + PDF + WhatsApp + Cotizaciones mini → Venta + Orden de trabajo.

import { API } from './api.js';

// ---------- helpers ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function openModal() {
  const m = $('#modal'); if (!m) return ()=>{};
  m.classList.remove('hidden');
  const onKey = (e)=>{ if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  return ()=>document.removeEventListener('keydown', onKey);
}
function closeModal(){
  const m = $('#modal'); if (!m) return;
  m.classList.add('hidden'); document.body.style.overflow = '';
}
async function fetchCompanySafe(){ try{ return await API.me(); }catch{ return null; } }

// ---------- estado ventas ----------
const state = {
  current: null,           // venta activa
  cache: new Map(),        // id -> sale
  openTabs: [],            // ids abiertas
  titles: {},              // id -> título custom
  quote: null,             // cotización cargada en panel izquierdo

  keyTabs()  { return `sales:openTabs:${API.getActiveCompany?.()||'default'}`; },
  keyTitles(){ return `sales:titles:${API.getActiveCompany?.()||'default'}`; },

  load(){
    try{ this.openTabs = JSON.parse(localStorage.getItem(this.keyTabs())||'[]'); }catch{ this.openTabs = []; }
    try{ this.titles   = JSON.parse(localStorage.getItem(this.keyTitles())||'{}'); }catch{ this.titles = {}; }
  },
  saveTabs(){ try{ localStorage.setItem(this.keyTabs(), JSON.stringify(this.openTabs)); }catch{} },
  saveTitles(){ try{ localStorage.setItem(this.keyTitles(), JSON.stringify(this.titles)); }catch{} },
  addTab(id){ if (!this.openTabs.includes(id)) { this.openTabs.push(id); this.saveTabs(); } renderTabs(); },
  removeTab(id){ this.openTabs = this.openTabs.filter(x=>x!==id); this.saveTabs(); renderTabs(); },
};

function computeTitle(sale){
  const custom = state.titles[sale?._id];
  if (custom) return custom;
  const plate = sale?.vehicle?.plate?.toUpperCase();
  if (plate) return `Venta (${plate})`;
  const nro = sale?.number ? String(sale.number).padStart(4,'0') : (sale?._id||'').slice(-4).toUpperCase();
  return `Vta ${nro}`;
}

// ---------- render pestañas ----------
function renderTabs(){
  const wrap = $('#saleTabs'); if (!wrap) return;
  wrap.innerHTML = state.openTabs.map(id=>{
    const s = state.cache.get(id);
    const title = s ? computeTitle(s) : `Vta ${String(id).slice(-4).toUpperCase()}`;
    const act = state.current?._id===id ? 'active' : '';
    return `<span class="sale-tab ${act}" data-id="${id}" title="${title}">
      ${title} <b class="close" data-x="${id}">×</b>
    </span>`;
  }).join('') || `<span class="sale-tab muted">— sin ventas abiertas —</span>`;

  $$('#saleTabs [data-id]').forEach(el=>{
    el.onclick = ()=>switchTo(el.dataset.id);
    el.ondblclick = async ()=>{
      const id = el.dataset.id;
      const s = state.cache.get(id);
      const current = state.titles[id] || computeTitle(s || {});
      const name = prompt('Nombre de la venta', current || '');
      if (name && name.trim()){
        try{
          state.titles[id] = name.trim(); state.saveTitles(); renderTabs();
          // si quieres persistir en BD:
          await API.sales.update(id, { title: name.trim() });
          // refrescar cache
          const updated = await API.sales.get(id); state.cache.set(id, updated); if (state.current?._id===id) state.current = updated;
          renderMini(); renderTabs();
        }catch(e){ console.warn(e); }
      }
    };
  });
  $$('#saleTabs [data-x]').forEach(el=>{
    el.onclick = (ev)=>{ ev.stopPropagation(); const id = el.dataset.x;
      if (state.current?._id === id) state.current = null;
      state.removeTab(id); renderSale();
    };
  });
}

// ---------- render venta ----------
const bodyEl = $('#sales-body'); const totalEl = $('#sales-total');

function renderMini(){
  const s = state.current;
  $('#sv-mini-plate').textContent = s?.vehicle?.plate?.toUpperCase() || '—';
  $('#sv-mini-name').textContent  = 'Cliente: ' + (s?.customer?.name || '—');
  $('#sv-mini-phone').textContent = 'Cel: ' + (s?.customer?.phone || '—');
}

function bindRow(tr, itemId){
  tr.querySelector('.qty').onchange = async (e)=>{
    const qty = Number(e.target.value||0);
    state.current = await API.sales.updateItem(state.current._id, itemId, { qty });
    state.cache.set(state.current._id, state.current); renderSale();
  };
  tr.querySelector('.u').onchange = async (e)=>{
    const unitPrice = Number(e.target.value||0);
    state.current = await API.sales.updateItem(state.current._id, itemId, { unitPrice });
    state.cache.set(state.current._id, state.current); renderSale();
  };
  tr.querySelector('[data-del]').onclick = async ()=>{
    state.current = await API.sales.removeItem(state.current._id, itemId);
    state.cache.set(state.current._id, state.current); renderSale();
  };
}

function renderSale(){
  if (!state.current){
    bodyEl.innerHTML = ''; totalEl.textContent = '$0';
    renderMini(); renderTabs(); renderOT(); return;
  }
  const rows = (state.current.items||[]).map(it=>`
    <tr data-id="${it._id}">
      <td>${it.sku || ''}</td>
      <td>${it.name || ''}</td>
      <td><input type="number" class="qty" min="0" step="1" value="${it.qty||1}"></td>
      <td><input type="number" class="u"   min="0" step="1" value="${it.unitPrice||0}"></td>
      <td>${money(it.total||0)}</td>
      <td><button class="danger" data-del>Eliminar</button></td>
    </tr>
  `).join('');
  bodyEl.innerHTML = rows || `<tr><td colspan="99" class="muted">— sin ítems —</td></tr>`;
  totalEl.textContent = money(state.current.total||0);

  $$('#sales-body tr').forEach(tr=>{
    const id = tr.getAttribute('data-id');
    if (id) bindRow(tr, id);
  });

  renderMini();
  state.cache.set(state.current._id, state.current);
  renderTabs();
  renderOT(); // Orden de trabajo se alimenta de la venta
}

// ---------- Orden de trabajo (usa la venta activa) ----------
function renderOT(){
  const tb = $('#ot-body'); if (!tb) return;
  const items = state.current?.items || [];
  tb.innerHTML = items.map(it=>`
    <tr>
      <td>${it.name || it.sku || ''}</td>
      <td>${it.qty || 1}</td>
    </tr>
  `).join('') || `<tr><td colspan="2" class="muted">— sin ítems —</td></tr>`;
}
function printOT(){
  if (!state.current) return alert('No hay venta activa');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  const company = $('#appTitle')?.textContent || 'Taller Automotriz';
  doc.setFontSize(16); doc.text('ORDEN DE TRABAJO', 105, 14, { align:'center' });
  doc.setFontSize(11);
  const v = state.current.vehicle || {}, c = state.current.customer || {};
  doc.text(`Empresa: ${company}`, 14, 26);
  doc.text(`Cliente: ${c.name||'-'}  |  Cel: ${c.phone||'-'}`, 14, 33);
  doc.text(`Vehículo: ${v.plate||'-'}  ${v.brand||''} ${v.line||''} ${v.engine||''} ${v.year||''}`, 14, 40);

  const body = (state.current.items||[]).map((it,i)=>[i+1, it.name||it.sku||'', String(it.qty||1)]);
  doc.autoTable({ startY: 48, head:[['#','Descripción','Cant.']], body, styles:{ fontSize:10 }, theme:'grid' });
  doc.setFontSize(9); doc.text('Firma técnico: ___________________________', 14, 280);
  doc.save(`OT_${(state.current._id||'').slice(-6)}.pdf`);
}

// ---------- acciones de venta ----------
async function switchTo(id){
  state.current = await API.sales.get(id);
  state.cache.set(id, state.current); state.addTab(id); renderSale();
}
async function startSale(){
  const s = await API.sales.start();
  state.current = s; state.cache.set(s._id, s); state.addTab(s._id); renderSale();
}

// ---------- QR (nativo + jsQR fallback) ----------
async function isNativeQRSupported(){
  if (!('BarcodeDetector' in window)) return false;
  try{ const fmts = await window.BarcodeDetector.getSupportedFormats?.(); return Array.isArray(fmts) ? fmts.includes('qr_code') : true; }catch{return true;}
}
let jsQRPromise=null;
function ensureJsQR(){
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (jsQRPromise) return jsQRPromise;
  jsQRPromise = new Promise((resolve,reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    s.onload = ()=>resolve(window.jsQR); s.onerror=()=>reject(new Error('jsQR load error'));
    document.head.appendChild(s);
  }); return jsQRPromise;
}
function parseInventoryCode(raw=''){
  const s = String(raw||'').trim(); if (!s.toUpperCase().startsWith('IT:')) return null;
  const p = s.split(':').filter(Boolean); if (p.length===2) return { itemId:p[1] };
  if (p.length>=3) return { companyId:p[1]||null, itemId:p[2]||null, sku:(p[3]||'').toUpperCase()||null };
  return null;
}
async function openQRScanner(){
  if (!state.current) return alert('Crea primero una venta');
  const cleanup = openModal();
  $('#modalBody').innerHTML = `
    <h3>Lector de QR</h3>
    <div class="qrbar">
      <button id="qr-start" class="secondary">Iniciar</button>
      <button id="qr-stop"  class="secondary">Detener</button>
      <label style="margin-left:8px;"><input id="qr-autoclose" type="checkbox" checked> Cerrar al agregar</label>
    </div>
    <video id="qr-video" playsinline muted style="width:100%;max-height:300px;background:#000;border-radius:8px;margin-top:8px;"></video>
    <canvas id="qr-canvas" style="display:none;"></canvas>
    <div class="row" style="gap:8px;margin-top:8px;">
      <input id="qr-manual" placeholder="Ingresar código manualmente (fallback)">
      <button id="qr-add-manual">Agregar</button>
    </div>
    <div id="qr-msg" class="muted" style="margin-top:6px;">Permite la cámara para escanear</div>
  `;
  $('#modalClose').onclick = ()=>{ stop(); cleanup?.(); closeModal(); };

  const video = $('#qr-video'); const canvas=$('#qr-canvas'); const ctx=canvas.getContext('2d',{willReadFrequently:true});
  let stream=null, running=false, native=await isNativeQRSupported(), detector=null;

  async function start(){
    try{
      stop();
      stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
      video.srcObject = stream; await video.play(); running=true;
      if (native){ try{ detector = new window.BarcodeDetector({ formats:['qr_code'] }); }catch{ native=false; } }
      if (!native){ try{ await ensureJsQR(); }catch{} }
      $('#qr-msg').textContent = native ? 'Escanea un QR…' : 'Escaneo con jsQR activo…';
      tick();
    }catch{ $('#qr-msg').textContent='No se pudo abrir la cámara'; }
  }
  function stop(){ running=false; try{video.pause();}catch{} if (stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
  async function handle(code){
    const s = String(code||'').trim(); if (!s) return;
    const parsed = parseInventoryCode(s);
    try{
      if (parsed?.itemId){
        state.current = await API.sales.addItem(state.current._id, { source:'inventory', refId: parsed.itemId, qty:1 });
      } else {
        state.current = await API.sales.addItem(state.current._id, { source:'inventory', sku: s.toUpperCase(), qty:1 });
      }
      state.cache.set(state.current._id, state.current); renderSale();
      if ($('#qr-autoclose').checked){ stop(); cleanup?.(); closeModal(); }
    }catch(e){ $('#qr-msg').textContent = e?.message || 'No se pudo agregar'; }
  }
  async function tick(){
    if (!running) return;
    try{
      if (native && detector){
        const codes = await detector.detect(video);
        if (codes?.length){ await handle(codes[0].rawValue || codes[0].rawValue); await new Promise(r=>setTimeout(r,700)); }
      } else if (window.jsQR && video.readyState >= 2){
        const w=video.videoWidth,h=video.videoHeight; if (w && h){
          canvas.width=w; canvas.height=h; ctx.drawImage(video,0,0,w,h);
          const img = ctx.getImageData(0,0,w,h); const res = window.jsQR(img.data,w,h,{inversionAttempts:'attemptBoth'});
          if (res?.data){ await handle(res.data); await new Promise(r=>setTimeout(r,700)); }
        }
      }
    }catch{}
    requestAnimationFrame(tick);
  }
  $('#qr-start').onclick = start; $('#qr-stop').onclick = stop;
  $('#qr-add-manual').onclick = ()=>handle($('#qr-manual').value);
  if (navigator.mediaDevices?.getUserMedia) start();
}

// ---------- Cotizaciones MINI (panel izquierdo) ----------
function renderQuotePanel(){
  const legend = $('#q-legend');
  const tb = $('#q-body');
  if (!legend || !tb) return;
  if (!state.quote){
    legend.textContent = '— ninguna cotización cargada —';
    tb.innerHTML = '';
    return;
  }
  legend.textContent = `Cotización: ${state.quote.number ? `#${String(state.quote.number).padStart(4,'0')}` : (state.quote._id||'').slice(-6).toUpperCase()} — ${state.quote.customer?.name || ''}`;
  const items = state.quote.items || [];
  tb.innerHTML = items.map((it, i)=>`
    <tr>
      <td>${it.type?.toUpperCase?.() || (it.inventoryRefId ? 'INV' : (it.priceRefId ? 'PRC' : 'CUS'))}</td>
      <td>${it.description || it.name || it.sku || ''}</td>
      <td>${it.qty || 1}</td>
      <td>${money(it.unitPrice || 0)}</td>
      <td>${money((it.qty||1)*(it.unitPrice||0))}</td>
      <td><button data-pass="${i}">→ Venta</button></td>
    </tr>
  `).join('') || `<tr><td colspan="99" class="muted">— sin ítems —</td></tr>`;
  $$('#q-body [data-pass]').forEach(btn=>{
    btn.onclick = ()=>passQuoteLineToSale(items[Number(btn.dataset.pass)]);
  });
}
async function passQuoteLineToSale(line){
  if (!state.current) return alert('Primero crea/abre una venta (pestaña derecha).');
  try{
    // inventario
    if (line.inventoryRefId){
      state.current = await API.sales.addItem(state.current._id, {
        source: 'inventory',
        refId: line.inventoryRefId,
        qty: line.qty || 1
      });
    }
    // precio (servicio/tabla)
    else if (line.priceRefId){
      state.current = await API.sales.addItem(state.current._id, {
        source: 'price',
        refId: line.priceRefId,
        qty: line.qty || 1
      });
    }
    // custom/libre
    else{
      state.current = await API.sales.addItem(state.current._id, {
        source: 'custom',
        name: line.description || line.name || '',
        sku:  line.sku || '',
        unitPrice: line.unitPrice || 0,
        qty: line.qty || 1
      });
    }
    state.cache.set(state.current._id, state.current);
    renderSale();
  }catch(e){ alert(e?.message || 'No se pudo pasar a venta'); }
}
async function passQuoteAllToSale(){
  if (!state.quote) return;
  for (const line of (state.quote.items||[])) await passQuoteLineToSale(line);
}

async function openQuotePicker(){
  const tpl = $('#tpl-quote-picker'); if (!tpl) return alert('Falta plantilla de modal para buscar cotizaciones');
  const frag = tpl.content.cloneNode(true);
  $('#modalBody').innerHTML=''; $('#modalBody').appendChild(frag);
  const cleanup = openModal();
  $('#modalClose').onclick = ()=>{ cleanup?.(); closeModal(); };

  const qInput = $('#qp-q'); const listEl = $('#qp-list'); const moreBtn = $('#qp-more');
  let page=1, pageSize=10, lastQ='';
  async function load(reset=false){
    try{
      const q = String(qInput.value||'').trim();
      if (reset){ page=1; lastQ=q; listEl.innerHTML=''; }
      const res = await API.quotes.search({ q, page, pageSize });
      const items = Array.isArray(res?.items) ? res.items : [];
      listEl.insertAdjacentHTML('beforeend', items.map(it=>`
        <tr>
          <td>${it.number ? '#'+String(it.number).padStart(4,'0') : (it._id||'').slice(-6).toUpperCase()}</td>
          <td>${it.customer?.name || ''}</td>
          <td>${(it.items?.length || 0)}</td>
          <td>${money(it.total || 0)}</td>
          <td><button data-use="${it._id}">Usar</button></td>
        </tr>
      `).join(''));
      $$('#qp-list [data-use]').forEach(btn=>{
        btn.onclick = async ()=>{
          try{
            const q = await API.quotes.get(btn.dataset.use);
            state.quote = q; renderQuotePanel();
            cleanup?.(); closeModal();
          }catch(e){ alert(e?.message || 'No se pudo cargar la cotización'); }
        };
      });
      page += 1;
    }catch(e){ alert(e?.message || 'No se pudo buscar'); }
  }
  $('#qp-search').onclick = ()=>load(true);
  qInput.addEventListener('keydown', e=>{ if (e.key==='Enter') load(true); });
  moreBtn.onclick = ()=>load(false);
  load(true);
}

// ---------- PDF & WhatsApp ----------
function numberToMoney(n){ return '$' + Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function buildSalePdf(sale, company){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  const C = { name:company?.name||'Taller Automotriz', email:company?.email||'', nit:company?.nit||'', phone:company?.phone||'' };
  doc.setFontSize(14); doc.text(C.name, 14, 16);
  doc.setFontSize(10); if (C.nit) doc.text(`NIT: ${C.nit}`,14,22); if (C.phone) doc.text(`Tel: ${C.phone}`,14,27); if (C.email) doc.text(C.email,14,32);
  doc.setFontSize(16); doc.text('VENTA', 196, 16, { align:'right' });
  const nro = sale.number ? String(sale.number).padStart(5,'0') : (sale._id||'').slice(-6).toUpperCase();
  doc.setFontSize(10); doc.text(`No: ${nro}`,196,22,{align:'right'}); doc.text(`Estado: ${sale.status?.toUpperCase()||'OPEN'}`,196,27,{align:'right'});

  const y0=40; const c=sale.customer||{}, v=sale.vehicle||{};
  doc.setFontSize(11); doc.text('Cliente',14,y0); doc.text('Vehículo',110,y0);
  doc.setFontSize(10);
  doc.text([`Nombre: ${c.name||'-'}`,`Identificación: ${c.idNumber||'-'}`,`Tel: ${c.phone||'-'}`,`Email: ${c.email||'-'}`,`Dirección: ${c.address||'-'}`],14,y0+6);
  doc.text([`Placa: ${v.plate||'-'}`,`Marca: ${v.brand||'-'}`,`Línea: ${v.line||'-'}`,`Motor: ${v.engine||'-'}`,`Año: ${v.year||'-'}  |  Km: ${v.mileage??'-'}`],110,y0+6);

  const head=[['SKU','Descripción','Cant.','Unit','Total']];
  const body=(sale.items||[]).map(it=>[it.sku||'',it.name||'',String(it.qty||1),numberToMoney(it.unitPrice||0),numberToMoney(it.total||0)]);
  doc.autoTable({ startY:y0+36, head, body, styles:{fontSize:9, cellPadding:2}, headStyles:{fillColor:[15,23,42]}, theme:'grid' });

  const endY=doc.lastAutoTable.finalY||y0+36;
  doc.setFontSize(11);
  doc.text(`Subtotal: ${numberToMoney(sale.subtotal||0)}`,196,endY+8,{align:'right'});
  doc.text(`Impuestos: ${numberToMoney(sale.tax||0)}`,196,endY+14,{align:'right'});
  doc.setFontSize(13); doc.text(`TOTAL: ${numberToMoney(sale.total||0)}`,196,endY+22,{align:'right'});
  return doc;
}

// ---------- init ----------
export function initSales(){
  state.load(); renderTabs();

  // barra superior
  $('#sales-start')    && ($('#sales-start').onclick    = startSale);
  $('#sales-scan-qr')  && ($('#sales-scan-qr').onclick  = openQRScanner);
  $('#sales-add-sku')  && ($('#sales-add-sku').onclick  = async ()=>{
    if (!state.current) return alert('Crea primero una venta');
    const sku = String($('#sales-sku').value||'').trim().toUpperCase(); if (!sku) return;
    state.current = await API.sales.addItem(state.current._id, { source:'inventory', sku, qty:1 });
    $('#sales-sku').value='';
    state.cache.set(state.current._id, state.current); renderSale();
  });
  $('#sales-share-wa') && ($('#sales-share-wa').onclick = async ()=>{
    if (!state.current) return alert('Crea primero una venta');
    const company = await fetchCompanySafe();
    const nro = state.current.number ? String(state.current.number).padStart(5,'0') : (state.current._id||'').slice(-6).toUpperCase();
    const lines = (state.current.items||[]).map(it=>`• ${it.sku||''} x${it.qty||1} — ${it.name||''} — ${money(it.total||0)}`).join('%0A') || '— sin ítems —';
    const url = `https://wa.me/?text=*${encodeURIComponent(company?.name||'Taller')}*%0A*Venta No.* ${nro}%0A%0A${lines}%0A%0A*TOTAL:* ${money(state.current.total||0)}`;
    window.open(url,'_blank');
  });
  $('#sales-print') && ($('#sales-print').onclick = async ()=>{
    if (!state.current) return alert('Crea primero una venta');
    const doc = buildSalePdf(state.current, await fetchCompanySafe());
    const nro = state.current.number ? String(state.current.number).padStart(5,'0') : (state.current._id||'').slice(-6).toUpperCase();
    doc.save(`venta_${nro}.pdf`);
  });
  $('#sales-close') && ($('#sales-close').onclick = async ()=>{
    if (!state.current) return alert('No hay venta activa');
    if (!confirm('¿Cerrar la venta actual?')) return;
    await API.sales.close(state.current._id);
    const closedId = state.current._id; state.current = null; state.removeTab(closedId); renderSale();
  });

  // editar cliente / vehículo
  $('#sv-edit-cv') && ($('#sv-edit-cv').onclick = ()=>{
    if (!state.current) return alert('Crea primero una venta');
    const t = $('#sales-cv-template'); if (!t) return;
    const frag = t.content.cloneNode(true);
    $('#modalBody').innerHTML=''; $('#modalBody').appendChild(frag); const cleanup=openModal();
    $('#modalClose').onclick = ()=>{ cleanup?.(); closeModal(); };

    // prefill
    $('#c-name').value = state.current.customer?.name || '';
    $('#c-id').value   = state.current.customer?.idNumber || '';
    $('#c-phone').value= state.current.customer?.phone || '';
    $('#c-email').value= state.current.customer?.email || '';
    $('#c-address').value= state.current.customer?.address || '';

    $('#v-plate').value = state.current.vehicle?.plate || '';
    $('#v-brand').value = state.current.vehicle?.brand || '';
    $('#v-line').value  = state.current.vehicle?.line || '';
    $('#v-engine').value= state.current.vehicle?.engine || '';
    $('#v-year').value  = state.current.vehicle?.year || '';
    $('#v-mile').value  = state.current.vehicle?.mileage ?? '';

    $('#sales-save-cv').onclick = async ()=>{
      const customer = {
        name: $('#c-name').value, idNumber: $('#c-id').value,
        phone: $('#c-phone').value, email: $('#c-email').value, address: $('#c-address').value
      };
      const vehicle = {
        plate: $('#v-plate').value, brand: $('#v-brand').value, line: $('#v-line').value,
        engine: $('#v-engine').value, year: $('#v-year').value, mileage: Number($('#v-mile').value||0) || undefined
      };
      state.current = await API.sales.setCustomerVehicle(state.current._id, { customer, vehicle });
      state.cache.set(state.current._id, state.current); renderSale(); cleanup?.(); closeModal();
    };
  });

  // cotizaciones mini
  $('#q-use-existing') && ($('#q-use-existing').onclick = openQuotePicker);
  $('#q-create-new')  && ($('#q-create-new').onclick = async ()=>{
    try{
      const q = await API.quotes.create({ items: [] });
      state.quote = q; renderQuotePanel();
    }catch(e){ alert(e?.message || 'No se pudo crear cotización'); }
  });
  $('#q-pass-all') && ($('#q-pass-all').onclick = passQuoteAllToSale);

  // pestaña por defecto
  if (state.openTabs.length){ switchTo(state.openTabs[state.openTabs.length-1]).catch(()=>renderTabs()); }
  else { renderQuotePanel(); renderOT(); }
}
