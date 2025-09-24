/* Ventas (sin HTML en JS) */
import API from './api.js';

const $ = (s)=>document.querySelector(s);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
const clone = (id)=>{ const t=document.getElementById(id); return t?.content?.firstElementChild?.cloneNode(true); };
function openModal(){ const m=$('#modal'); if(!m) return; m.classList.remove('hidden'); document.body.style.overflow='hidden'; const onKey=(e)=>{ if(e.key==='Escape') closeModal(); }; document.addEventListener('keydown', onKey); return ()=>document.removeEventListener('keydown', onKey); }
function closeModal(){ const m=$('#modal'); if(!m) return; m.classList.add('hidden'); document.body.style.overflow=''; }

/* ===================== Estado de ventas ===================== */
let current=null;
const OPEN_KEY = `sales:openTabs:${API.getActiveCompany?.() || 'default'}`;
let openTabs=[]; try{ openTabs=JSON.parse(localStorage.getItem(OPEN_KEY)||'[]'); }catch{ openTabs=[]; }
function saveTabs(){ try{ localStorage.setItem(OPEN_KEY, JSON.stringify(openTabs)); }catch{} }
function addOpen(id){ if(!openTabs.includes(id)){ openTabs.push(id); saveTabs(); } renderSaleTabs(); }
function removeOpen(id){ openTabs=openTabs.filter(x=>x!==id); saveTabs(); renderSaleTabs(); }

/* ======================== UI Ventas ======================== */
export function initSales(){
  const tab = document.getElementById('tab-ventas'); if(!tab) return;
  const tableBody = $('#sales-body'); const totalEl = $('#sales-total');

  async function switchTo(id){ current = await API.sales.get(id); addOpen(id); renderSale(); renderMiniCustomer(); renderWorkOrder(); }

  function renderSaleTabs(){
    const wrap = document.getElementById('saleTabs'); if(!wrap) return;
    wrap.replaceChildren();
    for(const id of openTabs){
      const n = clone('tpl-sale-tab');
      n.querySelector('.label').textContent = id.slice(-6).toUpperCase();
      if(current && current._id===id) n.classList.add('active');
      n.onclick = ()=>switchTo(id);
      n.querySelector('.close').onclick = (e)=>{ e.stopPropagation(); removeOpen(id); if(current && current._id===id){ current=null; renderSale(); renderMiniCustomer(); renderWorkOrder(); } };
      wrap.appendChild(n);
    }
  }

  function renderSale(){
    tableBody.replaceChildren();
    const items = current?.items || [];
    for(const it of items){
      const row = clone('tpl-sale-row');
      row.querySelector('[data-sku]').textContent = it.sku||'';
      row.querySelector('[data-name]').textContent = it.name||'';
      const qty = row.querySelector('.qty'); qty.value = String(it.qty||1);
      row.querySelector('[data-unit]').textContent  = money(it.unitPrice||0);
      row.querySelector('[data-total]').textContent = money(it.total||0);
      qty.onchange = async ()=>{
        const v=Number(qty.value||1)||1;
        current = await API.sales.updateItem(current._id, it._id, { qty:v });
        renderSale(); renderWorkOrder();
      };
      row.querySelector('.remove').onclick = async ()=>{
        await API.sales.removeItem(current._id, it._id);
        current = await API.sales.get(current._id);
        renderSale(); renderWorkOrder();
      };
      tableBody.appendChild(row);
    }
    totalEl.textContent = money(current?.total || 0);
  }

  function renderMiniCustomer(){
    const c = current?.customer || {}, v=current?.vehicle||{};
    $('#sv-mini-plate').textContent = v.plate || '—';
    $('#sv-mini-name').textContent  = `Cliente: ${c.name||'—'}`;
    $('#sv-mini-phone').textContent = `Cel: ${c.phone||'—'}`;
  }

  function renderWorkOrder(){
    const body = $('#sv-wo-body'); body.replaceChildren();
    for(const it of (current?.items||[])){
      const tr = document.createElement('tr');
      const td1=document.createElement('td'); td1.textContent = it.name||'';
      const td2=document.createElement('td'); td2.className='t-center'; td2.textContent=String(it.qty||1);
      tr.append(td1, td2); body.appendChild(tr);
    }
  }

  async function openCVModal(){
    const modal=$('#modal'), body=$('#modalBody'), btnClose=$('#modalClose');
    body.replaceChildren();
    const frag = document.getElementById('sales-cv-template')?.content?.cloneNode(true);
    if(!frag) return;
    body.appendChild(frag);
    const cleanup=openModal(); btnClose.onclick=()=>{ cleanup?.(); closeModal(); };
    const c={...(current?.customer||{})}, v={...(current?.vehicle||{})};
    const f=(id)=>body.querySelector(id);
    f('#c-name').value=c.name||''; f('#c-id').value=c.idNumber||''; f('#c-phone').value=c.phone||''; f('#c-email').value=c.email||''; f('#c-address').value=c.address||'';
    f('#v-plate').value=v.plate||''; f('#v-brand').value=v.brand||''; f('#v-line').value=v.line||''; f('#v-engine').value=v.engine||''; f('#v-year').value=v.year||''; f('#v-mile').value=v.mileage||'';
    body.querySelector('#sales-save-cv').onclick = async ()=>{
      await API.sales.setCustomerVehicle(current._id, {
        customer: { name:f('#c-name').value, idNumber:f('#c-id').value, phone:f('#c-phone').value, email:f('#c-email').value, address:f('#c-address').value },
        vehicle:  { plate:f('#v-plate').value.toUpperCase(), brand:f('#v-brand').value, line:f('#v-line').value, engine:f('#v-engine').value, year:f('#v-year').value, mileage:Number(f('#v-mile').value||0) }
      });
      current = await API.sales.get(current._id);
      renderMiniCustomer(); const cl = cleanup; closeModal(); cl?.();
    };
  }

  // ===== Pickers =====
  async function openInventoryPicker(){
    if(!current) return alert('Crea primero una venta');
    const modal=$('#modal'), body=$('#modalBody'), btnClose=$('#modalClose');
    body.replaceChildren(); const root = clone('tpl-inv-picker'); body.appendChild(root);
    const cleanup=openModal(); btnClose.onclick=()=>{ cleanup?.(); closeModal(); };

    const iName = body.querySelector('#p-inv-name');
    const iSku = body.querySelector('#p-inv-sku');
    const iIntake = body.querySelector('#p-inv-intake');
    const tbody = body.querySelector('#p-inv-body');
    const count = body.querySelector('#p-inv-count');

    let all=[]; let shown=0; const PAGE=50;
    async function doSearch(){
      const items = await API.inventory.itemsList({ name:iName.value||'', sku:iSku.value||'', intakeId:iIntake.value||'' });
      all = items||[]; shown = Math.min(PAGE, all.length); renderSlice();
    }
    function renderSlice(){
      tbody.replaceChildren();
      for(const it of all.slice(0,shown)){
        const tr = clone('tpl-inv-row');
        tr.querySelector('[data-sku]').textContent = it.sku||'';
        tr.querySelector('[data-name]').textContent = it.name||'';
        tr.querySelector('[data-stock]').textContent = String(it.stock||0);
        tr.querySelector('[data-price]').textContent = money(it.salePrice||0);
        const img = tr.querySelector('img.thumb'); img.src = (it.mediaUrls||[])[0] || ''; img.alt='img';
        tr.querySelector('button.add').onclick = async ()=>{
          current = await API.sales.addItem(current._id, { source:'inventory', itemId:it._id, qty:1 });
          renderSale(); renderWorkOrder();
        };
        tbody.appendChild(tr);
      }
      count.textContent = String(shown);
    }

    body.querySelector('#p-inv-search').onclick = doSearch;
    body.querySelector('#p-inv-more').onclick = ()=>{ shown=Math.min(shown+PAGE, all.length); renderSlice(); };
    body.querySelector('#p-inv-cancel').onclick = ()=>{ cleanup?.(); closeModal(); };
    doSearch();
  }

  async function openPricesPicker(){
    if(!current) return alert('Crea primero una venta');
    const modal=$('#modal'), body=$('#modalBody'), btnClose=$('#modalClose');
    body.replaceChildren(); const root = clone('tpl-price-picker'); body.appendChild(root);
    const cleanup=openModal(); btnClose.onclick=()=>{ cleanup?.(); closeModal(); };

    const iSvc = body.querySelector('#p-pr-svc');
    const iBrand=body.querySelector('#p-pr-brand'); const iLine=body.querySelector('#p-pr-line'); const iEngine=body.querySelector('#p-pr-engine'); const iYear=body.querySelector('#p-pr-year');
    const head = body.querySelector('#p-pr-head'); const tbody = body.querySelector('#p-pr-body'); const count=body.querySelector('#p-pr-count');

    // cargar servicios
    const services = await API.servicesList?.(); const list = Array.isArray(services?.data)?services.data:(Array.isArray(services)?services:[]);
    iSvc.replaceChildren(...(list||[]).map(s=>{ const o=document.createElement('option'); o.value=s._id; o.textContent=s.name; return o; }));

    let all=[]; let shown=0; const PAGE=50;
    function renderHead(svc){
      head.replaceChildren();
      ['Marca','Línea','Motor','Año', (svc?.name||'Precio')].forEach(txt=>{ const th=document.createElement('th'); th.textContent=txt; head.appendChild(th); });
      const th=document.createElement('th'); head.appendChild(th);
    }
    function renderSlice(svc){
      tbody.replaceChildren();
      for(const it of all.slice(0,shown)){
        const tr = clone('tpl-price-row');
        tr.querySelector('[data-brand]').textContent = it.brand||'';
        tr.querySelector('[data-line]').textContent  = it.line||'';
        tr.querySelector('[data-engine]').textContent= it.engine||'';
        tr.querySelector('[data-year]').textContent  = it.year||'';
        tr.querySelector('[data-price]').textContent = money(it.price||it.values?.PRICE||0);
        tr.querySelector('button.add').onclick = async ()=>{
          current = await API.sales.addItem(current._id, { source:'prices', priceId: it._id, svcId:iSvc.value, qty:1 });
          renderSale(); renderWorkOrder();
        };
        tbody.appendChild(tr);
      }
      count.textContent = String(shown);
    }
    async function doSearch(){
      const params={ serviceId:iSvc.value||'', brand:iBrand.value||'', line:iLine.value||'', engine:iEngine.value||'', year:iYear.value||'' };
      const res = await API.pricesList(params); const items = Array.isArray(res?.items)?res.items:(Array.isArray(res)?res:[]);
      all = items||[]; shown = Math.min(PAGE, all.length); renderHead(list.find(s=>s._id===iSvc.value)); renderSlice(list.find(s=>s._id===iSvc.value));
    }

    body.querySelector('#p-pr-search').onclick = doSearch;
    ;['p-pr-brand','p-pr-line','p-pr-engine','p-pr-year'].forEach(id=> body.querySelector('#'+id).addEventListener('keydown',(e)=>{ if(e.key==='Enter') doSearch(); }));
    iSvc.addEventListener('change', doSearch);
    body.querySelector('#p-pr-more').onclick = ()=>{ shown=Math.min(shown+PAGE, all.length); renderSlice(list.find(s=>s._id===iSvc.value)); };
    body.querySelector('#p-pr-cancel').onclick = ()=>{ cleanup?.(); closeModal(); };
    await doSearch();
  }

  // ===== Lector QR =====
  async function openQRScanner(){
    if(!current) return alert('Crea primero una venta');
    const body=$('#modalBody'), btnClose=$('#modalClose');
    body.replaceChildren(); body.appendChild(clone('tpl-qr-scanner'));
    const cleanup=openModal(); btnClose.onclick=()=>{ cleanup?.(); stopStream(); closeModal(); };

    const video=$('#qr-video'), canvas=$('#qr-canvas'), ctx=canvas.getContext('2d',{willReadFrequently:true});
    const sel=$('#qr-cam'), msg=$('#qr-msg'), list=$('#qr-history'), autoclose=$('#qr-autoclose');
    let stream=null, running=false, detector=null, useNative=await isNativeQRSupported();

    async function enumerateCams(){
      try{
        const devices=await navigator.mediaDevices.enumerateDevices();
        const cams=devices.filter(d=>d.kind==='videoinput');
        sel.replaceChildren(...cams.map((c,i)=>{ const o=document.createElement('option'); o.value=c.deviceId; o.textContent=c.label||('Cam '+(i+1)); return o; }));
      }catch(e){ msg.textContent='No se pudo enumerar cámaras'; }
    }
    async function start(){
      try{
        stopStream();
        const constraints={ video: sel.value ? {deviceId:{exact:sel.value}} : { facingMode:'environment' }, audio:false };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream; await video.play(); running=true;
        if(useNative){
          detector = new BarcodeDetector({formats:['qr_code']});
          tickNative();
        }else{
          tickCanvas();
        }
      }catch(e){ msg.textContent = 'No se pudo abrir cámara'; }
    }
    function stopStream(){ try{ video.pause(); }catch{}; try{ (stream?.getTracks()||[]).forEach(t=>t.stop()); }catch{}; running=false; }
    async function isNativeQRSupported(){ try{ return !!(window.BarcodeDetector); }catch{ return false; } }
    function onCode(code){
      const li=document.createElement('li'); li.textContent=code; list.prepend(li);
      API.sales.addByQR(current._id, { code }).then(()=>{ if(autoclose.checked){ cleanup?.(); stopStream(); closeModal(); } renderSale(); renderWorkOrder(); });
    }
    async function tickNative(){
      if(!running) return;
      try{
        const codes=await detector.detect(video);
        if(codes?.[0]?.rawValue){ onCode(codes[0].rawValue); }
      }catch{}
      requestAnimationFrame(tickNative);
    }
    function tickCanvas(){
      if(!running) return;
      try{
        const w=video.videoWidth, h=video.videoHeight;
        if(!w || !h) return requestAnimationFrame(tickCanvas);
        canvas.width=w; canvas.height=h; ctx.drawImage(video,0,0,w,h);
        // jsQR fallback omitido por brevedad en esta refactor (se puede agregar)
      }catch{}
      requestAnimationFrame(tickCanvas);
    }

    $('#qr-start').onclick = start;
    $('#qr-stop').onclick  = ()=>{ stopStream(); };
    $('#qr-add-manual').onclick = ()=>{ const code=$('#qr-manual').value||''; if(!code) return; onCode(code); };

    enumerateCams();
  }

  // ===== Botones =====
  $('#sv-edit-cv').onclick = openCVModal;
  $('#sales-start').onclick = async ()=>{ current = await API.sales.start(); addOpen(current._id); renderSale(); renderMiniCustomer(); renderWorkOrder(); };
  $('#sales-add-sku').onclick = async ()=>{ if(!current) return alert('Crea primero una venta'); const sku=String($('#sales-sku').value||'').trim().toUpperCase(); if(!sku) return; current = await API.sales.addItem(current._id,{source:'inventory',sku,qty:1}); $('#sales-sku').value=''; renderSale(); renderWorkOrder(); };
  $('#sales-share-wa').onclick = async ()=>{
    if(!current) return;
    const company = await (typeof fetchCompanySafe==='function' ? fetchCompanySafe() : Promise.resolve(null));
    const nro = current.number ? String(current.number).padStart(5,'0') : (current._id||'').slice(-6).toUpperCase();
    const when = window.dayjs ? dayjs(current.createdAt).format('DD/MM/YYYY HH:mm') : new Date().toLocaleString();
    const lines = (current.items||[]).map(it=>`• ${it.sku||''} x${it.qty||1} — ${it.name||''} — ${money(it.total||0)}`);
    const header = `*${company?.name || 'Taller'}*%0A*Venta No.* ${nro} — ${when}`;
    const body   = lines.join('%0A') || '— sin ítems —';
    const footer = `%0A*TOTAL:* ${money(current.total||0)}`;
    window.open(`https://wa.me/?text=${header}%0A%0A${body}%0A%0A${footer}`, '_blank');
  };
  $('#sales-print').onclick = async ()=>{ if(!current) return; const doc = await buildSalePdf(current); doc.save(`venta_${current.number||current._id}.pdf`); };
  $('#sales-close').onclick = async ()=>{ if(!current) return; try{ await API.sales.close(current._id); removeOpen(current._id); current=null; renderSale(); renderMiniCustomer(); renderWorkOrder(); }catch(e){ alert(e?.message||'No se pudo cerrar'); } };
  $('#sales-add-inv').onclick = openInventoryPicker;
  $('#sales-add-prices').onclick = openPricesPicker;
  $('#sales-scan-qr').onclick = openQRScanner;

  renderSaleTabs();
}
