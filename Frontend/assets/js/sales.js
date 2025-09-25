// assets/js/sales.js
import API from './api.js';
import { buildWorkOrderPdf, buildInvoicePdf } from './pdf.js';
const $=(s)=>document.querySelector(s);
const money=(n)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
const clone=(id)=>{const t=document.getElementById(id);return t?.content?.firstElementChild?.cloneNode(true);};
let __lastScan=null,__lastTs=0; const should=(v)=>{const n=Date.now();if(v===__lastScan&&(n-__lastTs)<2000)return false;__lastScan=v;__lastTs=n;return true;};
function parse(raw){ if(!raw) return null; let t=String(raw).trim().replace(/\u00A0/g,' ').replace(/\s+/g,' ').trim();
  try{ if(/^https?:\/\//i.test(t)){ const u=new URL(t); const last=u.pathname.split('/').filter(Boolean).pop(); if(last) t=last; } }catch{}
  const ids=t.match(/[a-f0-9]{24}/ig); if(ids?.length) return {type:'id',value:ids[ids.length-1]}; if(/^[A-Z0-9\-_]+$/i.test(t)) return {type:'sku',value:t.toUpperCase()}; return null; }
export function initSales(){ const tab=document.getElementById('ventas'); if(!tab) return;
  let current=null; const KEY=`sales:openTabs:${API.getActiveCompany?.()||'default'}`; let open=[]; try{open=JSON.parse(localStorage.getItem(KEY)||'[]');}catch{open=[];}
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(open));}catch{}};
  function tabs(){ const w=document.getElementById('saleTabs'); if(!w) return; w.replaceChildren(); for(const id of open){ const n=clone('tpl-sale-tab'); n.querySelector('.label').textContent=id.slice(-6).toUpperCase(); if(current&&current._id===id) n.classList.add('active'); n.onclick=()=>sw(id); n.querySelector('.close').onclick=(e)=>{e.stopPropagation();cancel(id);}; w.appendChild(n);} }
  function addTab(id){ if(!open.includes(id)){open.push(id);save();} tabs(); } function rmTab(id){ open=open.filter(x=>x!==id); save(); tabs(); }
  async function sw(id){ current=await API.sales.get(id); addTab(id); render(); mini(); wo(); }
  async function cancel(id){ if(!confirm('¿Deseas cancelar la venta?'))return; await API.sales.cancel(id); rmTab(id); if(current&&current._id===id){current=null; render(); mini(); wo();} }
  const body=$('#sales-body'), tot=$('#sales-total');
  function render(){ if(!body) return; body.replaceChildren(); (current?.items||[]).forEach(it=>{ const row=clone('tpl-sale-row'); row.querySelector('[data-sku]').textContent=it.sku||''; row.querySelector('[data-name]').textContent=it.name||'';
      const qty=row.querySelector('.qty'); qty.value=String(it.qty||1); row.querySelector('[data-unit]').textContent=money(it.unitPrice||0); row.querySelector('[data-total]').textContent=money(it.total||0);
      qty.onchange=async()=>{ const v=Number(qty.value||1)||1; current=await API.sales.updateItem(current._id,it._id,{qty:v}); render(); wo(); };
      const act=row.querySelector('.actions'); const bE=document.createElement('button'); bE.textContent='Editar'; bE.onclick=async()=>{ const v=prompt('Nuevo precio unitario:',String(it.unitPrice||0)); if(v==null)return; const up=Number(v)||0; current=await API.sales.updateItem(current._id,it._id,{unitPrice:up}); render(); wo(); };
      const bZ=document.createElement('button'); bZ.textContent='Precio 0'; bZ.onclick=async()=>{ current=await API.sales.updateItem(current._id,it._id,{unitPrice:0}); render(); wo(); };
      const bD=document.createElement('button'); bD.textContent='Quitar'; bD.onclick=async()=>{ await API.sales.removeItem(current._id,it._id); current=await API.sales.get(current._id); render(); wo(); };
      act.append(bE,' ',bZ,' ',bD); body.appendChild(row); }); if(tot) tot.textContent=money(current?.total||0); }
  function mini(){ const c=current?.customer||{}, v=current?.vehicle||{}; const lp=$('#sv-mini-plate'),ln=$('#sv-mini-name'),lr=$('#sv-mini-phone'); if(lp) lp.textContent=v.plate||'—'; if(ln) ln.textContent=`Cliente: ${c.name||'—'}`; if(lr) lr.textContent=`Cel: ${c.phone||'—'}`; }
  function wo(){ const b=$('#sv-wo-body'); if(!b) return; b.replaceChildren(); for(const it of (current?.items||[])){ const tr=document.createElement('tr'), t1=document.createElement('td'), t2=document.createElement('td'); t2.className='t-center'; t1.textContent=it.name||''; t2.textContent=String(it.qty||1); tr.append(t1,t2); b.appendChild(tr);} }
  $('#sales-start')?.addEventListener('click',async()=>{ current=await API.sales.start(); if(!current.name) current.name=`Venta · ${String(current._id).slice(-6).toUpperCase()}`; addTab(current._id); render(); mini(); wo(); });
  $('#sales-add-sku')?.addEventListener('click',async()=>{ if(!current) return alert('Crea primero una venta'); const sku=String($('#sales-sku').value||'').trim().toUpperCase(); if(!sku) return; current=await API.sales.addItem(current._id,{source:'inventory',sku,qty:1}); $('#sales-sku').value=''; render(); wo(); });
  $('#sv-print-wo')?.addEventListener('click',async()=>{ if(!current) return; await buildWorkOrderPdf(current); });
  $('#sales-print')?.addEventListener('click',async()=>{ if(!current) return; await buildInvoicePdf(current); });
  $('#sales-close')?.addEventListener('click',async()=>{ if(!current) return; try{ current=await API.sales.close(current._id); alert('Venta cerrada'); rmTab(current._id); current=null; render(); mini(); wo(); }catch(e){ alert(e?.message||'No se pudo cerrar'); } });
  $('#sales-scan-qr')?.addEventListener('click',()=>openQR());
  async function openQR(){ if(!current) return alert('Crea primero una venta'); const body=$('#modalBody'), btnClose=$('#modalClose'); openM(); body.innerHTML=`
      <div class="qr"><div class="row"><select id="qr-cam"></select><button id="qr-start">Iniciar</button><button id="qr-stop">Detener</button></div>
      <label><input id="qr-autoclose" type="checkbox" checked/> Cerrar al agregar</label>
      <video id="qr-video" autoplay playsinline></video><canvas id="qr-canvas" class="hidden"></canvas>
      <input id="qr-manual" placeholder="Ingresar código manualmente (fallback)"/><button id="qr-add-manual">Agregar</button>
      <div id="qr-msg" class="muted"></div><ul id="qr-history" class="muted small"></ul></div>`;
    btnClose.onclick=()=>{ stop(); closeM(); };
    const video=$('#qr-video'), canvas=$('#qr-canvas'), ctx=canvas.getContext('2d',{willReadFrequently:true});
    const sel=$('#qr-cam'), msg=$('#qr-msg'), list=$('#qr-history'), ac=$('#qr-autoclose'); let stream=null, running=false, det=null;
    async function cams(){ try{ const d=await navigator.mediaDevices.enumerateDevices(); const cams=d.filter(x=>x.kind==='videoinput'); sel.replaceChildren(...cams.map((c,i)=>{ const o=document.createElement('option'); o.value=c.deviceId; o.textContent=c.label||('Cam '+(i+1)); return o; })); }catch{} }
    function stop(){ try{ video.pause(); }catch{}; try{ (stream?.getTracks()||[]).forEach(t=>t.stop()); }catch{}; running=false; }
    async function start(){ try{ stop(); const cs={video: sel.value?{deviceId:{exact:sel.value}}:{facingMode:'environment'}, audio:false}; stream=await navigator.mediaDevices.getUserMedia(cs); video.srcObject=stream; await video.play(); running=true; if(window.BarcodeDetector){ det=new BarcodeDetector({formats:['qr_code']}); tickN(); } else { tickC(); } msg.textContent=''; }catch(e){ stop(); msg.textContent='No se pudo abrir cámara: '+(e?.name||e?.message||'desconocido'); } }
    function onCode(code){ const li=document.createElement('li'); li.textContent=code; list.prepend(li); if(!should(code)) return; const p=parse(code); if(!p){ msg.textContent='Código no reconocido'; return; }
      (async()=>{ try{ if(p.type==='id'){ current=await API.sales.addItem(current._id,{source:'inventory',refId:p.value,qty:1}); } else { current=await API.sales.addItem(current._id,{source:'inventory',sku:p.value,qty:1}); } render(); wo(); if(ac.checked){ stop(); closeM(); } }catch(e){ msg.textContent=e?.message||'No se pudo agregar'; } })(); }
    async function tickN(){ if(!running) return; try{ const codes=await det.detect(video); if(codes?.[0]?.rawValue) onCode(codes[0].rawValue); }catch{} requestAnimationFrame(tickN); }
    function tickC(){ if(!running) return; try{ const w=video.videoWidth,h=video.videoHeight; if(!w||!h) return requestAnimationFrame(tickC); canvas.width=w; canvas.height=h; ctx.drawImage(video,0,0,w,h); if(window.jsQR){ const img=ctx.getImageData(0,0,w,h); const qr=window.jsQR(img.data,w,h); if(qr?.data) onCode(qr.data);} }catch{} requestAnimationFrame(tickC); }
    $('#qr-start').onclick=start; $('#qr-stop').onclick=()=>{ stop(); }; $('#qr-add-manual').onclick=()=>{ const v=($('#qr-manual').value||'').trim(); if(!v) return; onCode(v); };
    cams();
  }
  function openM(){ const m=$('#modal'); if(!m) return; m.classList.remove('hidden'); document.body.style.overflow='hidden'; }
  function closeM(){ const m=$('#modal'); if(!m) return; m.classList.add('hidden'); document.body.style.overflow=''; }
  tabs();
}
