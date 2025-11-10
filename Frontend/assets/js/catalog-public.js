import { API } from './api.esm.js';

const apiBase = API.base || '';

function toQuery(params={}){ const q=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null && String(v).trim()!=='') q.set(k,v);}); const s=q.toString(); return s?`?${s}`:''; }
async function fetchJSON(path){ const res = await fetch(apiBase + path); const txt = await res.text(); let body; try{ body=JSON.parse(txt);}catch{ body=txt;} if(!res.ok) throw new Error(body?.error || res.statusText); return body; }
async function postJSON(path, body){ const res = await fetch(apiBase + path, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) }); const txt = await res.text(); let data; try{ data=JSON.parse(txt);}catch{ data=txt; } if(!res.ok) throw new Error(data?.error || res.statusText); return data; }

const state = { filters:{ page:1, limit:40, order:'recent', stock:1 }, items:[], meta:{}, cart:new Map(), theme:'dark', companyId:null, companyInfo:null };

function money(n){ const v=Math.round((n||0)*100)/100; try{ return v.toLocaleString('es-CO',{ style:'currency', currency:'COP'});}catch{ return '$'+v; } }
function applyTheme(){ document.body.classList.toggle('theme-light', state.theme==='light'); const btn=document.getElementById('toggleTheme'); if(btn){ btn.textContent = state.theme==='light'? 'Oscuro':'Claro'; } }
function toggleTheme(){ state.theme = state.theme==='light'? 'dark':'light'; try{ localStorage.setItem('catalog:theme', state.theme);}catch{} applyTheme(); }
function initTheme(){ try{ const t= localStorage.getItem('catalog:theme'); if(t==='light'||t==='dark') state.theme=t; }catch{} applyTheme(); }

function resolveCompanyId(){
  const url = new URL(window.location.href);
  const cid = url.searchParams.get('companyId');
  if(cid){ state.companyId = cid; return cid; }
  const el = document.querySelector('[data-company-id]');
  if(el){ state.companyId = el.getAttribute('data-company-id'); return state.companyId; }
  return null;
}

function buildItemCard(it){
  const img=(it.images && it.images[0] && it.images[0].url)||'assets/favicon.svg';
  const price=money(it.price||0);
  const tags=Array.isArray(it.tags)? it.tags.slice(0,6):[];
  const low = (it.stock||0) <= 1 && (it.stock||0) > 0;
  const out = (it.stock||0) === 0;
  const card=document.createElement('div');
  card.className='item-card';
  card.innerHTML=`
    <div class='media'>
      <img src="${img}" alt="${it.name}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;object-position:center;display:block;" />
      ${out? `<span class='badge low'>AGOTADO</span>`: low? `<span class='badge'>BAJO STOCK</span>`:''}
    </div>
    <div class='item-name'>${it.name}</div>
    ${it.brand? `<div class='item-brand'>Marca: ${it.brand}</div>`:''}
    <div class='item-price'>${price}</div>
    <div class='item-tags'>${tags.map(t=>`<span>${t}</span>`).join('')}</div>
    <div class='card-actions'>
      <button class='secondary' data-detail='${it.id}'>Ver</button>
      <button data-add='${it.id}' ${out? 'disabled':''}>Agregar</button>
    </div>`;
  card.querySelector('[data-add]')?.addEventListener('click', ()=>addToCart(it));
  card.querySelector('[data-detail]')?.addEventListener('click', ()=>openDetail(it.id));
  return card;
}
function renderItems(){ const grid=document.getElementById('itemsGrid'); const pag=document.getElementById('pagination'); if(!grid||!pag) return; grid.innerHTML=''; if(!state.items.length){ grid.innerHTML="<div class='empty'>No hay ítems publicados para esta empresa.</div>"; pag.innerHTML=''; return; } state.items.forEach(it=> grid.appendChild(buildItemCard(it))); renderPagination(); }
function renderPagination(){ const pag=document.getElementById('pagination'); pag.innerHTML=''; const { page=1 }=state.filters; const pages=state.meta.pages||1; function makeBtn(p){ const b=document.createElement('button'); b.textContent=String(p); if(p===page) b.disabled=true; b.onclick=()=>{ state.filters.page=p; loadItems();}; return b;} if(pages<=1) return; let start=Math.max(1,page-4); let end=Math.min(pages,start+9); if(end-start<9){ start=Math.max(1,end-9);} if(page>1){ const prev=document.createElement('button'); prev.textContent='«'; prev.onclick=()=>{ state.filters.page=Math.max(1,page-1); loadItems();}; pag.appendChild(prev);} for(let p=start;p<=end;p++){ pag.appendChild(makeBtn(p)); } if(page<pages){ const next=document.createElement('button'); next.textContent='»'; next.onclick=()=>{ state.filters.page=Math.min(pages,page+1); loadItems();}; pag.appendChild(next);} }

function updateCartUI(){ const listEl=document.getElementById('cartItems'); const countEl=document.getElementById('cartCount'); const totalEl=document.getElementById('cartTotal'); const checkoutBtn=document.getElementById('cartCheckout'); const badge=document.getElementById('cartBadge'); if(!listEl||!countEl||!totalEl||!checkoutBtn) return; listEl.innerHTML=''; let total=0; let count=0; state.cart.forEach(entry=>{ total+=(entry.item.price||0)*entry.qty; count+=entry.qty; }); countEl.textContent=String(count); totalEl.textContent=money(total); checkoutBtn.disabled=count===0; if(badge){ if(count>0){ badge.style.display='block'; badge.textContent=String(count);} else { badge.style.display='none'; } } state.cart.forEach(({item,qty})=>{ const row=document.createElement('div'); row.className='cart-item'; row.innerHTML=`<span style='flex:1;'>${item.name}</span><input type='number' min='1' step='1' value='${qty}' data-id='${item.id}' /><button class='danger' data-rm='${item.id}'>x</button>`; row.querySelector('input').onchange=e=>{ const v=parseInt(e.target.value||'1',10); if(v<1) e.target.value='1'; state.cart.get(item.id).qty=Math.max(1,v); updateCartUI();}; row.querySelector('[data-rm]').onclick=()=>{ state.cart.delete(item.id); updateCartUI();}; listEl.appendChild(row); }); }
function addToCart(it){ const existing=state.cart.get(it.id); if(existing){ existing.qty=Math.min(existing.qty+1,999);} else { state.cart.set(it.id,{ item:it, qty:1 }); } updateCartUI(); }

async function openDetail(id){
  try{
    const data=await fetchJSON(`/api/v1/public/catalog/${state.companyId}/items/${id}`);
    const it=data.item; if(!it){ alert('Item no encontrado'); return;}
    const imgs=Array.isArray(it.images)? it.images:[];
    const wa = state.companyInfo?.whatsAppNumber || '';
    const waUrl = wa? `https://wa.me/${wa.replace(/[^0-9+]/g,'')}` : '';
    const waText = encodeURIComponent(`Hola, me interesa ${it.name} (${it.sku||''}). ¿Está disponible?`);
    const contactBtn = wa? `<a href='${waUrl}?text=${waText}' target='_blank' rel='noopener' class='secondary' id='d-wa'>WhatsApp</a>`: '';
    const stockBadge = (it.stock||0)===0? '<span style="color:#ef4444;font-weight:700;">Agotado</span>' : (it.stock||0)<=1? '<span style="color:#f59e0b;">Bajo stock</span>':'';
    const content=`
      <div class="space-y-4">
        <h3 class='m-0 mb-2 text-lg font-semibold text-white dark:text-white theme-light:text-slate-900'>${it.name}</h3>
        ${it.brand? `<div class='text-xs opacity-80 text-slate-300 dark:text-slate-300 theme-light:text-slate-600'>Marca: ${it.brand}</div>`:''}
        <div class='flex gap-2 flex-wrap mt-2'>
          ${imgs.map(im=>`<img src='${im.url}' alt='${im.alt||''}' class='w-32 h-32 object-cover rounded-lg border-2 border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-300' style='width:128px;height:128px;object-fit:cover;object-position:center;' loading='lazy' referrerpolicy='no-referrer'/>`).join('')}
        </div>
        <p class='text-sm leading-relaxed mt-3 text-slate-300 dark:text-slate-300 theme-light:text-slate-600'>${(it.description||'').replace(/</g,'&lt;')}</p>
        <div class='mt-3 font-bold text-white dark:text-white theme-light:text-slate-900'>Precio: ${money(it.price||0)} ${stockBadge? '• '+stockBadge:''}</div>
        <div class='flex gap-2 mt-4 justify-end'>
          ${contactBtn}
          <button id='d-add' ${it.stock===0? 'disabled':''} class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">Agregar al carrito</button>
          <button class='px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900' id='d-close'>Cerrar</button>
        </div>
      </div>`;
    openModal(content);
    document.getElementById('d-close').onclick=closeModal;
    document.getElementById('d-add').onclick=()=>{ addToCart(it); closeModal(); };
  }catch(e){ alert('Error detalle: '+ e.message); }
}

function ensureModal(){ 
  let m=document.getElementById('public-modal'); 
  if(m) return m; 
  m=document.createElement('div'); 
  m.id='public-modal'; 
  m.className='fixed inset-0 z-50 hidden flex items-center justify-center p-4 bg-black/60 dark:bg-black/60 theme-light:bg-black/40 backdrop-blur-sm'; 
  m.innerHTML='<div id="public-modal-box" class="relative bg-slate-800 dark:bg-slate-800 theme-light:bg-white rounded-2xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 max-w-2xl w-full max-h-[80vh] overflow-auto p-5 custom-scrollbar"><button id="public-modal-close" class="absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center bg-red-600 dark:bg-red-600 theme-light:bg-red-500 hover:bg-red-700 dark:hover:bg-red-700 theme-light:hover:bg-red-600 text-white rounded-lg transition-colors duration-200 text-xl font-bold shadow-lg" title="Cerrar (ESC)">&times;</button></div>'; 
  document.body.appendChild(m); 
  return m; 
}
function openModal(html){ 
  const m=ensureModal(); 
  const box=m.querySelector('#public-modal-box'); 
  const closeBtn=m.querySelector('#public-modal-close');
  box.innerHTML= html + '<button id="public-modal-close" class="absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center bg-red-600 dark:bg-red-600 theme-light:bg-red-500 hover:bg-red-700 dark:hover:bg-red-700 theme-light:hover:bg-red-600 text-white rounded-lg transition-colors duration-200 text-xl font-bold shadow-lg" title="Cerrar (ESC)">&times;</button>'; 
  m.classList.remove('hidden'); 
  
  const closeModalHandler = () => {
    m.classList.add('hidden');
    document.removeEventListener('keydown', escHandler);
    m.removeEventListener('click', backdropHandler);
  };
  
  const escHandler = (e) => {
    if (e.key === 'Escape' && !m.classList.contains('hidden')) {
      closeModalHandler();
    }
  };
  
  const backdropHandler = (e) => {
    if (e.target === m) {
      closeModalHandler();
    }
  };
  
  document.addEventListener('keydown', escHandler);
  m.addEventListener('click', backdropHandler);
  const closeBtnUpdated = m.querySelector('#public-modal-close');
  if (closeBtnUpdated) {
    closeBtnUpdated.onclick = closeModalHandler;
  }
}
function closeModal(){ 
  const m=ensureModal(); 
  m.classList.add('hidden'); 
}

function readFilters(){
  const fq=document.getElementById('f-q');
  const fbrand=document.getElementById('f-brand');
  const fc=document.getElementById('f-category');
  const ft=document.getElementById('f-tags');
  const fs=document.getElementById('f-stock');
  const fl=document.getElementById('f-limit');
  const fo=document.getElementById('f-order');
  state.filters.page=1;
  state.filters.limit= fl?.value || 20;
  state.filters.order= fo?.value || 'recent';
  state.filters.q = fq?.value.trim() || undefined;
  state.filters.brand = fbrand?.value.trim() || undefined;
  state.filters.category = fc?.value.trim() || undefined;
  const tagsRaw = ft?.value.trim();
  state.filters.tags = tagsRaw? tagsRaw : undefined;
  const sval = fs?.value || '1';
  state.filters.stock = sval === 'all' ? 'all' : 1;
}
async function loadItems(){
  if(!state.companyId){ alert('Falta companyId'); return; }
  try{
    const grid=document.getElementById('itemsGrid'); const pag=document.getElementById('pagination');
    if(grid){ grid.innerHTML = Array.from({length:8}).map(()=>`<div class='item-card'><div class='media'><div class='skeleton' style='width:100%;aspect-ratio:4/3;border-radius:10px;'></div></div><div class='skeleton' style='height:16px;margin:10px 0 6px;border-radius:6px;'></div><div class='skeleton' style='height:14px;width:60%;border-radius:6px;'></div></div>`).join(''); if(pag) pag.innerHTML=''; }
    const q= toQuery(state.filters);
    const data= await fetchJSON(`/api/v1/public/catalog/${state.companyId}/items${q}`);
    let items=data.data||[]; state.meta=data.meta||{};
    // Client-side ordering for UX flexibility
    const order = state.filters.order;
    items = items.slice();
    if(order==='price-asc') items.sort((a,b)=> (a.price||0)-(b.price||0));
    else if(order==='price-desc') items.sort((a,b)=> (b.price||0)-(a.price||0));
    else if(order==='name-asc') items.sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')));
    // recent is default; keep backend order
    state.items = items; renderItems();
  }catch(e){
    console.error(e);
    const grid=document.getElementById('itemsGrid'); const pag=document.getElementById('pagination');
    if(grid){
      grid.innerHTML = `<div class='empty'>${(e?.message||'Error cargando catálogo')}</div>`;
      if(pag) pag.innerHTML='';
    } else {
      alert('Error cargando catálogo: '+ e.message);
    }
  }
}
function bindFilters(){
  const apply=document.getElementById('f-apply');
  const clear=document.getElementById('f-clear');
  apply.onclick=()=>{ readFilters(); loadItems(); };
  clear.onclick=()=>{
    ['f-q','f-category','f-tags','f-brand'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    const fs=document.getElementById('f-stock'); if(fs) fs.value='';
    const fo=document.getElementById('f-order'); if(fo) fo.value='recent';
    readFilters(); loadItems();
  };
  ['f-q','f-category','f-tags','f-brand'].forEach(id=>{ const el=document.getElementById(id); el && el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ readFilters(); loadItems(); }});});
}

function updateDeliveryHint(delivery, install){ let text=''; if(delivery==='pickup') text='Recolección en punto.'; else if(delivery==='home-bogota') text='Envío gratis Bogotá urbano.'; else if(delivery==='store') text='Retiro en taller.'; if(install && delivery==='home-bogota'){ text+='\n⚠ Instalación requiere presencia, ajusta a Retiro en taller.';} return text; }

function openCheckoutModal(){ if(state.cart.size===0){ alert('El carrito está vacío'); return; } let total=0; state.cart.forEach(e=>{ total+=(e.item.price||0)*e.qty; }); const itemsHtml= Array.from(state.cart.values()).map(e=>`<div class='flex justify-between text-xs'><span>${e.item.name}</span><span>x${e.qty} • ${money(e.item.price||0)}</span></div>`).join(''); let lastDelivery='pickup'; try{ const saved=localStorage.getItem('catalog:deliveryMethod'); if(['pickup','home-bogota','store'].includes(saved)) lastDelivery=saved; }catch{} openModal(`<div class="space-y-4"><h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Checkout</h3><div class='my-2 p-3 bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-slate-100 rounded-lg'>${itemsHtml||'<em class="text-slate-300 dark:text-slate-300 theme-light:text-slate-600">Sin items</em>'}<div class='mt-2 font-bold text-white dark:text-white theme-light:text-slate-900'>Total estimado: ${money(total)}</div><div class='text-xs opacity-70 text-slate-300 dark:text-slate-300 theme-light:text-slate-600'>Pago contra entrega.</div></div><form id='checkoutForm' class='flex flex-col gap-2'><div><label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Identificación*</label><input id='co-idNumber' required placeholder='CC / NIT' class="w-full p-2 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Nombre*</label><input id='co-name' required class="w-full p-2 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Celular*</label><input id='co-phone' required class="w-full p-2 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Correo</label><input id='co-email' type='email' class="w-full p-2 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Dirección</label><input id='co-address' class="w-full p-2 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Método entrega*</label><select id='co-delivery' required class="w-full p-2 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"><option value='pickup' ${lastDelivery==='pickup'?'selected':''}>Recolección</option><option value='home-bogota' ${lastDelivery==='home-bogota'?'selected':''}>Envío Bogotá</option><option value='store' ${lastDelivery==='store'?'selected':''}>Retiro taller</option></select></div><label class='flex items-center gap-2 text-xs'><input type='checkbox' id='co-install' class="w-4 h-4" /> Requiere instalación</label><div id='co-delivery-hint' class='text-xs leading-relaxed bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-slate-100 p-2 rounded-lg text-slate-300 dark:text-slate-300 theme-light:text-slate-600'></div><div id='co-lookup-msg' class='text-xs min-h-[14px] text-slate-300 dark:text-slate-300 theme-light:text-slate-600'></div><div class='flex gap-2 justify-end mt-2'><button type='button' id='co-cancel' class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button><button type='submit' id='co-submit' class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Confirmar pedido</button></div></form></div>`); bindCheckoutEvents(); }

function bindCheckoutEvents(){ const form=document.getElementById('checkoutForm'); const idEl=document.getElementById('co-idNumber'); const nameEl=document.getElementById('co-name'); const phoneEl=document.getElementById('co-phone'); const emailEl=document.getElementById('co-email'); const addressEl=document.getElementById('co-address'); const deliveryEl=document.getElementById('co-delivery'); const installEl=document.getElementById('co-install'); const cancelBtn=document.getElementById('co-cancel'); const submitBtn=document.getElementById('co-submit'); const lookupMsg=document.getElementById('co-lookup-msg'); const deliveryHint=document.getElementById('co-delivery-hint'); let lastLookup=''; let lookupTimer=null; async function lookupProfile(force=false){ const idVal=(idEl.value||'').trim(); if(!idVal || (!force && idVal===lastLookup)) return; lastLookup=idVal; lookupMsg.textContent='Buscando registro...'; lookupMsg.style.opacity='1'; try{ const data= await fetchJSON(`/api/v1/public/catalog/${state.companyId}/customer?idNumber=${encodeURIComponent(idVal)}`); if(data && data.profile){ lookupMsg.textContent='Datos cargados'; if(!nameEl.value) nameEl.value=data.profile.name||''; if(!phoneEl.value) phoneEl.value=data.profile.phone||''; if(!emailEl.value) emailEl.value=data.profile.email||''; if(!addressEl.value) addressEl.value=data.profile.address||''; } else { lookupMsg.textContent='Sin registro previo'; } }catch(e){ lookupMsg.textContent='Error búsqueda'; } setTimeout(()=>{ lookupMsg.style.opacity='.6'; },2500); }
  idEl.addEventListener('input', ()=>{ if(lookupTimer) clearTimeout(lookupTimer); lookupTimer=setTimeout(()=> lookupProfile(false),500); }); idEl.addEventListener('blur', ()=> lookupProfile(true)); cancelBtn.onclick=()=>{ closeModal(); }; function updateDeliveryHint(){ const m=deliveryEl.value; const text= updateDeliveryHintText(m); deliveryHint.textContent=text; }
  function updateDeliveryHintText(m){ let text=''; if(m==='pickup') text='Recolección en punto.'; else if(m==='home-bogota') text='Envío gratis Bogotá urbano.'; else if(m==='store') text='Retiro en taller.'; if(installEl.checked && m==='home-bogota'){ text+='\n⚠ Instalación requiere presencia, ajustado a Retiro en taller.';} return text; }
  function enforceInstallRule(){ if(installEl.checked && deliveryEl.value==='home-bogota'){ deliveryEl.value='store'; transientMsg('Instalación no disponible con envío a domicilio. Ajustado.'); } }
  function transientMsg(msg){ if(!deliveryHint) return; const old=deliveryHint.textContent; deliveryHint.textContent=msg; deliveryHint.style.color='var(--accent,#0ea5e9)'; setTimeout(()=>{ deliveryHint.style.color=''; deliveryHint.textContent=updateDeliveryHintText(deliveryEl.value); },2500); }
  installEl.addEventListener('change', ()=>{ enforceInstallRule(); deliveryHint.textContent=updateDeliveryHintText(deliveryEl.value); }); deliveryEl.addEventListener('change', ()=>{ enforceInstallRule(); deliveryHint.textContent=updateDeliveryHintText(deliveryEl.value); try{ localStorage.setItem('catalog:deliveryMethod', deliveryEl.value);}catch{} }); deliveryHint.textContent=updateDeliveryHintText(deliveryEl.value);
  form.onsubmit= async (e)=>{ e.preventDefault(); const idNumber=idEl.value.trim(); const name=nameEl.value.trim(); const phone=phoneEl.value.trim(); if(!idNumber || !name || !phone){ alert('Completa identificación, nombre y celular'); return; } submitBtn.disabled=true; submitBtn.textContent='Enviando...'; try{ const itemsPayload= Array.from(state.cart.values()).map(e=>({ id:e.item.id, qty:e.qty })); const body={ items:itemsPayload, customer:{ idNumber, name, phone, email: emailEl.value.trim(), address: addressEl.value.trim() }, deliveryMethod: deliveryEl.value, requiresInstallation: !!installEl.checked }; const resp= await postJSON(`/api/v1/public/catalog/${state.companyId}/checkout`, body); closeModal(); state.cart.clear(); updateCartUI(); openModal(`<div class="space-y-4"><h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Pedido recibido</h3><p class='text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-600'>Solicitud registrada. ID interna: <b class="text-white dark:text-white theme-light:text-slate-900">${resp?.sale?.id || '(desconocido)'}</b>.</p><div class='text-right mt-4'><button id='ok-done' class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Cerrar</button></div></div>`); document.getElementById('ok-done').onclick=()=> closeModal(); }catch(err){ submitBtn.disabled=false; submitBtn.textContent='Confirmar pedido'; alert('Error en checkout: '+ err.message); } };
}

(async function init(){
  if(document.body?.dataset?.page !== 'catalog-public') return;
  resolveCompanyId();
  if(!state.companyId){ console.warn('[Catalog] Falta companyId; añade ?companyId=<id> a la URL.'); return; }
  initTheme();
  bindFilters();
  document.getElementById('cartCheckout')?.addEventListener('click', ()=> openCheckoutModal());
  // Try load company public info for WhatsApp CTA
  try{
    const info = await fetchJSON(`/api/v1/public/catalog/${state.companyId}/info`);
    state.companyInfo = info.company || null;
    const waEl = document.getElementById('waHeader');
    if(state.companyInfo?.whatsAppNumber && waEl){
      const wa = state.companyInfo.whatsAppNumber.replace(/[^0-9+]/g,'');
      waEl.href = `https://wa.me/${wa}?text=${encodeURIComponent('Hola, tengo una consulta del catálogo.')}`;
      waEl.style.display = 'inline-block';
    }
  }catch{}
  readFilters();
  loadItems();
  updateCartUI();
  document.getElementById('toggleTheme')?.addEventListener('click', toggleTheme);
})();
