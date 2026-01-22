// assets/js/catalog.js
import { API } from './api.esm.js';

const apiBase = API.base || '';

function toQuery(params={}){ const q=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null && String(v).trim()!=='') q.set(k,v);}); const s=q.toString(); return s?`?${s}`:''; }
async function fetchJSON(path){ const res = await fetch(apiBase + path); const txt = await res.text(); let body; try{ body=JSON.parse(txt);}catch{ body=txt;} if(!res.ok) throw new Error(body?.error || res.statusText); return body; }
async function postJSON(path, body){
  const res = await fetch(apiBase + path, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  const txt = await res.text(); let data; try{ data=JSON.parse(txt);}catch{ data=txt; }
  if(!res.ok) throw new Error(data?.error || res.statusText); return data;
}

const state = {
  filters: { page:1, limit:20 },
  items: [],
  meta: {},
  cart: new Map(), // id -> { item, qty }
  theme: 'dark'
};

function money(n){ const v=Math.round((n||0)*100)/100; try{ return v.toLocaleString('es-CO',{ style:'currency', currency:'COP'});}catch{ return '$'+v; } }

function applyTheme(){ document.body.classList.toggle('theme-light', state.theme==='light'); const btn=document.getElementById('toggleTheme'); if(btn){ btn.textContent = state.theme==='light'? 'Oscuro':'Claro'; } }
function toggleTheme(){ state.theme = state.theme==='light'? 'dark':'light'; try{ localStorage.setItem('catalog:theme', state.theme);}catch{} applyTheme(); }
function initTheme(){ try{ const t= localStorage.getItem('catalog:theme'); if(t==='light'||t==='dark') state.theme=t; }catch{} applyTheme(); }

async function buildItemCard(it){
  const img = (it.images && it.images[0] && it.images[0].url) || 'assets/favicon.svg';
  const price = money(it.price||0);
  const tags = Array.isArray(it.tags)? it.tags.slice(0,6):[];
  const tagsHtml = tags.map(t=>`<span>${t}</span>`).join('');
  const card = document.createElement('div');
  card.className='item-card';
  
  // Cargar template de card de item
  if (window.TemplateLoader && window.TemplateRenderer) {
    const templateEl = await window.TemplateLoader.loadTemplate('components/item-card.html');
    if (templateEl) {
      const templateHtml = templateEl.outerHTML;
      const renderedHtml = window.TemplateRenderer.renderTemplate(templateHtml, {
        image: img,
        name: it.name,
        price: price,
        tags: tagsHtml,
        id: it.id
      }, { safe: true }); // safe: true para permitir HTML en tags
      card.innerHTML = renderedHtml;
    } else {
      // Fallback
      card.innerHTML = `\n    <img src="${img}" alt="${it.name}" loading="lazy"/>\n    <div class='item-name'>${it.name}</div>\n    <div class='item-price'>${price}</div>\n    <div class='item-tags'>${tagsHtml}</div>\n    <div class='card-actions'>\n      <button class='secondary' data-detail='${it.id}'>Ver</button>\n      <button data-add='${it.id}'>Agregar</button>\n    </div>`;
    }
  } else {
    // Fallback si las utilidades no están disponibles
    card.innerHTML = `\n    <img src="${img}" alt="${it.name}" loading="lazy"/>\n    <div class='item-name'>${it.name}</div>\n    <div class='item-price'>${price}</div>\n    <div class='item-tags'>${tagsHtml}</div>\n    <div class='card-actions'>\n      <button class='secondary' data-detail='${it.id}'>Ver</button>\n      <button data-add='${it.id}'>Agregar</button>\n    </div>`;
  }
  
  card.querySelector('[data-add]').onclick = () => addToCart(it);
  card.querySelector('[data-detail]').onclick = () => openDetail(it.id);
  return card;
}

async function renderItems(){
  const grid = document.getElementById('itemsGrid');
  const pag = document.getElementById('pagination');
  if(!grid||!pag) return;
  grid.innerHTML='';
  if(!state.items.length){ 
    // Cargar template de mensaje vacío
    if (window.TemplateLoader && window.TemplateRenderer) {
      const templateEl = await window.TemplateLoader.loadTemplate('components/empty-items.html');
      if (templateEl) {
        grid.innerHTML = templateEl.outerHTML;
      } else {
        grid.innerHTML = `<div class='empty'>No hay items publicados que coincidan.</div>`;
      }
    } else {
      grid.innerHTML = `<div class='empty'>No hay items publicados que coincidan.</div>`;
    }
    pag.innerHTML=''; 
    return; 
  }
  for (const it of state.items) {
    const card = await buildItemCard(it);
    grid.appendChild(card);
  }
  renderPagination();
}

function renderPagination(){
  const pag = document.getElementById('pagination');
  pag.innerHTML='';
  const { page=1 } = state.filters; const pages = state.meta.pages || 1;
  function makeBtn(p){ const b=document.createElement('button'); b.textContent=String(p); if(p===page) b.disabled=true; b.onclick=()=>{ state.filters.page=p; loadItems(); }; return b; }
  if(pages<=1) return;
  const maxButtons = 10;
  let start = Math.max(1, page-4); let end = Math.min(pages, start+maxButtons-1); if(end-start<maxButtons-1){ start = Math.max(1, end-maxButtons+1); }
  if(page>1){ const prev = document.createElement('button'); prev.textContent='«'; prev.onclick=()=>{ state.filters.page = Math.max(1,page-1); loadItems(); }; pag.appendChild(prev); }
  for(let p=start;p<=end;p++){ pag.appendChild(makeBtn(p)); }
  if(page<pages){ const next = document.createElement('button'); next.textContent='»'; next.onclick=()=>{ state.filters.page = Math.min(pages,page+1); loadItems(); }; pag.appendChild(next); }
}

async function updateCartUI(){
  const box = document.getElementById('cartBox'); if(!box) return;
  const listEl = document.getElementById('cartItems'); const countEl = document.getElementById('cartCount'); const totalEl = document.getElementById('cartTotal'); const checkoutBtn = document.getElementById('cartCheckout');
  listEl.innerHTML='';
  let total = 0; let count=0;
  state.cart.forEach(entry => { total += (entry.item.price||0) * entry.qty; count += entry.qty; });
  countEl.textContent=String(count);
  totalEl.textContent=money(total);
  checkoutBtn.disabled = count===0;
  for (const { item, qty } of state.cart.values()) {
    const row = document.createElement('div');
    row.className='cart-item';
    
    // Cargar template de fila de carrito
    if (window.TemplateLoader && window.TemplateRenderer) {
      const templateEl = await window.TemplateLoader.loadTemplate('components/cart-row.html');
      if (templateEl) {
        const templateHtml = templateEl.outerHTML;
        const renderedHtml = window.TemplateRenderer.renderTemplate(templateHtml, {
          name: item.name,
          qty: qty,
          id: item.id
        });
        row.innerHTML = renderedHtml;
      } else {
        // Fallback
        row.innerHTML = `<span style='flex:1;'>${item.name}</span><input type='number' min='1' step='1' value='${qty}' data-id='${item.id}' /><button class='danger' data-rm='${item.id}'>x</button>`;
      }
    } else {
      // Fallback si las utilidades no están disponibles
      row.innerHTML = `<span style='flex:1;'>${item.name}</span><input type='number' min='1' step='1' value='${qty}' data-id='${item.id}' /><button class='danger' data-rm='${item.id}'>x</button>`;
    }
    
    row.querySelector('input').onchange = async (e) => { const v=parseInt(e.target.value||'1',10); if(v<1) e.target.value='1'; state.cart.get(item.id).qty = Math.max(1,v); await updateCartUI(); };
    row.querySelector('[data-rm]').onclick = async () => { state.cart.delete(item.id); await updateCartUI(); };
    listEl.appendChild(row);
  }
}

async function addToCart(it){
  const existing = state.cart.get(it.id);
  if(existing){ existing.qty = Math.min(existing.qty+1, 999); } else { state.cart.set(it.id,{ item: it, qty:1 }); }
  await updateCartUI();
}

async function openDetail(id){
  try{
    const data = await fetchJSON(`/api/v1/public/catalog/items/${id}`);
    const it = data.item;
    if(!it){ alert('Item no encontrado'); return; }
    const imgs = Array.isArray(it.images)? it.images : [];
    const content = `\n      <h3>${it.name}</h3>\n      <div style='display:flex;gap:8px;flex-wrap:wrap;'>${imgs.map(im=>`<img src='${im.url}' alt='${im.alt||''}' style='width:120px;height:90px;object-fit:cover;border-radius:6px;'/>`).join('')}</div>\n      <p style='font-size:13px;line-height:1.3;margin-top:10px;'>${(it.description||'').replace(/</g,'&lt;')}</p>\n      <div style='margin-top:10px;font-weight:600;'>Precio: ${money(it.price||0)}</div>\n      <div style='display:flex;gap:8px;margin-top:14px;'><button id='d-add'>Agregar al carrito</button><button class='secondary' id='d-close'>Cerrar</button></div>`;
    openModal(content);
    document.getElementById('d-close').onclick = closeModal;
    document.getElementById('d-add').onclick = () => { addToCart(it); closeModal(); };
  }catch(e){ alert('Error detalle: '+ e.message); }
}

async function ensureModal(){ 
  let m=document.getElementById('public-modal'); 
  if(m) return m; 
  m=document.createElement('div'); 
  m.id='public-modal'; 
  m.className = 'js-modal-overlay';
  m.style.background = 'rgba(0,0,0,.55)'; // Mantener background específico
  m.style.zIndex = '1000'; // Mantener z-index específico
  m.classList.add('js-hide'); // Inicialmente oculto
  
  // Cargar template de modal box
  if (window.TemplateLoader && window.TemplateRenderer) {
    const templateEl = await window.TemplateLoader.loadTemplate('modals/public-modal-box.html');
    if (templateEl) {
      const templateHtml = templateEl.outerHTML;
      m.innerHTML = window.TemplateRenderer.renderTemplate(templateHtml, { content: '' }, { safe: true });
    } else {
      // Fallback
      m.innerHTML='<div id="public-modal-box" style="background:var(--card);color:var(--text);padding:18px 20px;border-radius:12px;max-width:600px;width:92vw;max-height:80vh;overflow:auto;position:relative;"></div>';
    }
  } else {
    // Fallback si las utilidades no están disponibles
    m.innerHTML='<div id="public-modal-box" style="background:var(--card);color:var(--text);padding:18px 20px;border-radius:12px;max-width:600px;width:92vw;max-height:80vh;overflow:auto;position:relative;"></div>';
  }
  
  document.body.appendChild(m); 
  return m; 
}
async function openModal(html){ 
  const m=await ensureModal(); 
  const box=m.querySelector('#public-modal-box'); 
  box.innerHTML= html; 
  m.classList.remove('js-hide');
  m.classList.add('js-show-flex'); 
}
function closeModal(){ const m=ensureModal(); m.classList.add('js-hide');
 m.classList.remove('js-show'); }

function readFilters(){
  const fq=document.getElementById('f-q');
  const fc=document.getElementById('f-category');
  const ft=document.getElementById('f-tags');
  const fs=document.getElementById('f-stock');
  const fl=document.getElementById('f-limit');
  state.filters.page=1; // reset
  state.filters.limit= fl?.value || 20;
  state.filters.q = fq?.value.trim() || undefined;
  state.filters.category = fc?.value.trim() || undefined;
  const tagsRaw = ft?.value.trim();
  state.filters.tags = tagsRaw? tagsRaw : undefined;
  state.filters.stock = fs?.value ? 1 : undefined;
}

async function loadItems(){
  try{
    const q= toQuery(state.filters);
    const data = await fetchJSON(`/api/v1/public/catalog/items${q}`);
    state.items = data.data || [];
    state.meta = data.meta || {};
    await renderItems();
  }catch(e){
    console.error(e); alert('Error cargando catálogo: '+ e.message);
  }
}

function bindFilters(){
  const apply = document.getElementById('f-apply');
  const clear = document.getElementById('f-clear');
  apply.onclick = ()=>{ readFilters(); loadItems(); };
  clear.onclick = ()=>{ ['f-q','f-category','f-tags'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); const fs=document.getElementById('f-stock'); if(fs) fs.value=''; readFilters(); loadItems(); };
  ['f-q','f-category','f-tags'].forEach(id=>{ const el=document.getElementById(id); el && el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ readFilters(); loadItems(); }});});
}

function initEvents(){ document.getElementById('toggleTheme')?.addEventListener('click', toggleTheme); document.getElementById('cartCheckout')?.addEventListener('click', ()=> alert('Checkout próximamente')); }

function boot(){ initTheme(); bindFilters(); initEvents(); readFilters(); loadItems(); updateCartUI(); }

// Checkout modal
function openCheckoutModal(){
  if(state.cart.size===0){ alert('El carrito está vacío'); return; }
  let total = 0; state.cart.forEach(e => { total += (e.item.price||0)*e.qty; });
  const itemsHtml = Array.from(state.cart.values()).map(e => `<div style='display:flex;justify-content:space-between;font-size:12px;'><span>${e.item.name}</span><span>x${e.qty} • ${money(e.item.price||0)}</span></div>`).join('');
  // Recuperar último método de entrega elegido
  let lastDelivery = 'pickup';
  try { const saved = localStorage.getItem('catalog:deliveryMethod'); if(['pickup','home-bogota','store'].includes(saved)) lastDelivery = saved; } catch(_) {}
  openModal(`
    <h3>Checkout</h3>
    <div style='margin:6px 0 10px;padding:10px;background:var(--card-alt,#0f172a);border-radius:8px;'>
      ${itemsHtml || '<em>Sin items</em>'}
      <div style='margin-top:6px;font-weight:700;'>Total estimado: ${money(total)}</div>
      <div style='font-size:11px;opacity:.7;'>Pago: contra entrega (pay-on-delivery). No realizas ningún pago en línea.</div>
    </div>
    <form id='checkoutForm' style='display:flex;flex-direction:column;gap:8px;'>
      <label>Identificación* <input id='co-idNumber' required placeholder='CC / NIT' /></label>
      <label>Nombre* <input id='co-name' required /></label>
      <label>Celular* <input id='co-phone' required /></label>
      <label>Correo <input id='co-email' type='email' /></label>
      <label>Dirección <input id='co-address' /></label>
      <label>Método de entrega*
        <select id='co-delivery' required>
          <option value='pickup' ${lastDelivery==='pickup'?'selected':''}>Recolección en punto</option>
          <option value='home-bogota' ${lastDelivery==='home-bogota'?'selected':''}>Envío gratis Bogotá</option>
          <option value='store' ${lastDelivery==='store'?'selected':''}>Retiro en taller</option>
        </select>
      </label>
      <label style='display:flex;align-items:center;gap:6px;font-size:12px;'>
        <input type='checkbox' id='co-install' /> Requiere instalación en taller
      </label>
      <div id='co-delivery-hint' style='font-size:11px; line-height:1.3; background:var(--card-alt); padding:6px 8px; border-radius:6px;'></div>
      <div id='co-lookup-msg' style='font-size:11px;min-height:14px;'></div>
      <div style='display:flex;gap:8px;justify-content:flex-end;margin-top:4px;'>
        <button type='button' class='secondary' id='co-cancel'>Cancelar</button>
        <button type='submit' id='co-submit'>Confirmar pedido</button>
      </div>
    </form>
  `);
  bindCheckoutEvents();
}

function bindCheckoutEvents(){
  const form = document.getElementById('checkoutForm');
  const idEl = document.getElementById('co-idNumber');
  const nameEl = document.getElementById('co-name');
  const phoneEl = document.getElementById('co-phone');
  const emailEl = document.getElementById('co-email');
  const addressEl = document.getElementById('co-address');
  const deliveryEl = document.getElementById('co-delivery');
  const installEl = document.getElementById('co-install');
  const cancelBtn = document.getElementById('co-cancel');
  const submitBtn = document.getElementById('co-submit');
  const lookupMsg = document.getElementById('co-lookup-msg');
  const deliveryHint = document.getElementById('co-delivery-hint');

  let lastLookup = ''; let lookupTimer=null;

  async function lookupProfile(force=false){
    const idVal = (idEl.value||'').trim();
    if(!idVal || (!force && idVal === lastLookup)) return;
    lastLookup = idVal;
    lookupMsg.textContent='Buscando registro...'; lookupMsg.style.opacity='1';
    try{
      const data = await fetchJSON(`/api/v1/public/catalog/customer?idNumber=${encodeURIComponent(idVal)}`);
      if(data && data.profile){
        lookupMsg.textContent='Datos cargados';
        if(!nameEl.value) nameEl.value = data.profile.name || '';
        if(!phoneEl.value) phoneEl.value = data.profile.phone || '';
        if(!emailEl.value) emailEl.value = data.profile.email || '';
        if(!addressEl.value) addressEl.value = data.profile.address || '';
      } else {
        lookupMsg.textContent='Sin registro previo';
      }
    }catch(e){ lookupMsg.textContent='Error búsqueda'; }
    setTimeout(()=>{
      lookupMsg.style.opacity='.6'; // Mantener opacidad específica
    },2500);
  }

  idEl.addEventListener('input', () => {
    if(lookupTimer) clearTimeout(lookupTimer);
    lookupTimer = setTimeout(()=> lookupProfile(false), 500);
  });
  idEl.addEventListener('blur', () => lookupProfile(true));

  cancelBtn.onclick = () => { closeModal(); };

  function updateDeliveryHint(){
    const m = deliveryEl.value;
    let text = '';
    if(m==='pickup') text = 'Recolección en punto: coordinaremos un lugar y horario. Lleva tu identificación.';
    else if(m==='home-bogota') text = 'Envío gratis dentro de Bogotá urbano. Te contactaremos para ventana de entrega. No incluye instalación.';
    else if(m==='store') text = 'Retiro en taller: podrás coordinar instalación y pruebas si aplica.';
    if(installEl.checked && m==='home-bogota'){
      text += '\n⚠ Instalación requiere tu presencia; cambiaremos el método a Retiro en taller.';
    }
    deliveryHint.textContent = text;
  }

  function enforceInstallDeliveryRule(){
    if(installEl.checked && deliveryEl.value==='home-bogota'){
      deliveryEl.value='store';
      showTransientMessage('Instalación no disponible con envío a domicilio. Ajustado a Retiro en taller.');
    }
  }

  function showTransientMessage(msg){
    if(!deliveryHint) return;
    const old = deliveryHint.textContent;
    deliveryHint.textContent = msg;
    deliveryHint.style.color = 'var(--accent,#0ea5e9)';
    setTimeout(()=>{ deliveryHint.style.color=''; updateDeliveryHint(); }, 2500);
  }

  installEl.addEventListener('change', ()=>{ enforceInstallDeliveryRule(); updateDeliveryHint(); });
  deliveryEl.addEventListener('change', ()=>{ enforceInstallDeliveryRule(); updateDeliveryHint(); try{ localStorage.setItem('catalog:deliveryMethod', deliveryEl.value); }catch{} });
  updateDeliveryHint();

  form.onsubmit = async (e) => {
    e.preventDefault();
    // Basic validation
    const idNumber = idEl.value.trim();
    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();
    if(!idNumber || !name || !phone){ alert('Completa identificación, nombre y celular'); return; }
    submitBtn.disabled = true; submitBtn.textContent='Enviando...';
    try{
      const itemsPayload = Array.from(state.cart.values()).map(e => ({ id: e.item.id, qty: e.qty }));
      const body = {
        items: itemsPayload,
        customer: { idNumber, name, phone, email: emailEl.value.trim(), address: addressEl.value.trim() },
        deliveryMethod: deliveryEl.value,
        requiresInstallation: !!installEl.checked
      };
      const resp = await postJSON('/api/v1/public/catalog/checkout', body);
      closeModal();
      state.cart.clear(); await updateCartUI();
      openModal(`<h3>Pedido recibido</h3><p style='font-size:13px;'>Tu solicitud fue registrada. ID interno: <b>${resp?.sale?.id || '(desconocido)'}</b>. Te contactaremos para coordinar la entrega.</p><div style='text-align:right;margin-top:14px;'><button id='ok-done'>Cerrar</button></div>`);
      document.getElementById('ok-done').onclick = () => closeModal();
    }catch(err){
      submitBtn.disabled=false; submitBtn.textContent='Confirmar pedido';
      alert('Error en checkout: '+ err.message);
    }
  };
}

// Hook checkout button
(function(){
  const btn = document.getElementById('cartCheckout');
  if(btn){ btn.onclick = () => openCheckoutModal(); }
})();

if(document.body?.dataset?.page === 'catalog-public'){ boot(); }
