// Frontend/assets/js/inventory.js (Fase 2: sin HTML embebido)
import { API } from "./api.js";
import { upper } from "./utils.js";

const state = { intakes: [], lastItemsParams: {}, items: [], selected: new Set() };

const apiBase = API.base || "";
const authHeader = () => {
  const t = API.token?.get?.();
  return t ? { Authorization: `Bearer ${t}` } : {};
};
async function request(path, { method = "GET", json } = {}) {
  const headers = { ...authHeader() };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${apiBase}${path}`, {
    method, headers, body: json !== undefined ? JSON.stringify(json) : undefined
  });
  const text = await res.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(body?.error || (typeof body === "string" ? body : res.statusText));
  return body;
}

const invAPI = {
  listVehicleIntakes: async () => {
    const r = await request("/api/v1/inventory/vehicle-intakes");
    const data = Array.isArray(r) ? r : (r.items || r.data || []);
    return { data };
  },
  saveVehicleIntake: (body) => request("/api/v1/inventory/vehicle-intakes", { method: "POST", json: body }),
  updateVehicleIntake: (id, body) => request(`/api/v1/inventory/vehicle-intakes/${id}`, { method: "PUT", json: body }),
  deleteVehicleIntake: (id) => request(`/api/v1/inventory/vehicle-intakes/${id}`, { method: "DELETE" }),
  listItems: async (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v!=null && v!=="" ));
    const r = await request(`/api/v1/inventory/items?${qs.toString()}`);
    const data = Array.isArray(r) ? r : (r.items || r.data || []);
    return { data };
  },
  createItem: (body) => request(`/api/v1/inventory/items`, { method: "POST", json: body }),
  updateItem: (id, body) => request(`/api/v1/inventory/items/${id}`, { method: "PUT", json: body }),
  deleteItem: (id) => request(`/api/v1/inventory/items/${id}`, { method: "DELETE" }),
};

const fmtMoney = (n) => {
  const v = Math.round((n || 0) * 100) / 100;
  try { return v.toLocaleString(); } catch { return String(v); }
};

// ===== Modal helpers (usa modal global del index) =====
const $ = (s)=>document.querySelector(s);
function openModal(){ const m=$('#modal'); if(!m) return; m.classList.remove('hidden'); document.body.style.overflow='hidden'; const onKey=(e)=>{ if(e.key==='Escape') closeModal(); }; document.addEventListener('keydown', onKey); return ()=>document.removeEventListener('keydown', onKey); }
function closeModal(){ const m=$('#modal'); if(!m) return; m.classList.add('hidden'); document.body.style.overflow=''; }
const clone=(id)=>document.getElementById(id)?.content?.firstElementChild?.cloneNode(true);

// ========= helpers QR =========
function buildQrPath(itemId, size = 256) { return `/api/v1/inventory/items/${itemId}/qr.png?size=${size}`; }
async function fetchQrBlob(itemId, size = 256) {
  const res = await fetch(`${apiBase}${buildQrPath(itemId, size)}`, { headers: { ...authHeader() } });
  if (!res.ok) throw new Error("No se pudo generar el QR");
  return await res.blob();
}
async function setImgWithQrBlob(imgEl, itemId, size = 256) {
  try {
    const blob = await fetchQrBlob(itemId, size);
    const url = URL.createObjectURL(blob);
    imgEl.src = url; imgEl.onload = () => URL.revokeObjectURL(url);
  } catch { imgEl.alt = "QR no disponible"; }
}
async function downloadQrPng(itemId, size = 720, filename = "qr.png") {
  const blob = await fetchQrBlob(itemId, size);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

// ========= Lightbox =========
function openLightbox(media) {
  const body = $('#modalBody'), closeBtn=$('#modalClose'); body.replaceChildren();
  if ((media.mimetype||'').startsWith('video/') || /\.mp4$/i.test(media.url||'')) {
    body.appendChild(clone('tpl-lightbox-video'));
    body.querySelector('#lb-video').src = media.url;
  } else {
    body.appendChild(clone('tpl-lightbox-img'));
    body.querySelector('#lb-img').src = media.url;
  }
  const cleanup=openModal(); closeBtn.onclick=()=>{ cleanup?.(); closeModal(); };
}

// ========= Selección / Stickers =========
let selectionBar;
function ensureSelectionBar(parent){
  if(selectionBar) return selectionBar;
  selectionBar = document.createElement('div');
  selectionBar.id = 'stickersBar';
  selectionBar.style.cssText = 'display:none;gap:8px;align-items:center;margin:10px 0;flex-wrap:wrap';
  parent.parentNode.insertBefore(selectionBar, parent);
  return selectionBar;
}
function updateSelectionBar(itemsList){
  const bar = ensureSelectionBar(itemsList);
  const n = state.selected.size;
  bar.replaceChildren();
  if(!n){ bar.style.display='none'; return; }
  bar.style.display='flex';
  const info = document.createElement('div'); info.className='muted'; info.style.fontWeight='600'; info.textContent = `Seleccionados: ${n}`;
  const btnClear = document.createElement('button'); btnClear.className='secondary'; btnClear.id='sel-clear'; btnClear.textContent='Limpiar selección';
  const btnPage  = document.createElement('button'); btnPage.className='secondary'; btnPage.id='sel-page'; btnPage.textContent='Seleccionar todos (página)';
  const btnPDF   = document.createElement('button'); btnPDF.id='sel-stickers'; btnPDF.textContent='Generar PDF stickers';
  btnClear.onclick = ()=>{ state.selected.clear(); itemsList.querySelectorAll('input.sel[type="checkbox"]').forEach(ch=>ch.checked=false); updateSelectionBar(itemsList); };
  btnPage.onclick  = ()=>{ itemsList.querySelectorAll('input.sel[type="checkbox"]').forEach(ch=>{ ch.checked=true; state.selected.add(ch.dataset.id); }); updateSelectionBar(itemsList); };
  btnPDF.onclick   = generateStickersFromSelection;
  bar.append(info, btnClear, btnPage, btnPDF);
}
function toggleSelected(itemsList, id, checked){ if(checked) state.selected.add(id); else state.selected.delete(id); updateSelectionBar(itemsList); }

// ========= Render helpers =========
function makeIntakeLabel(v){ return `${(v?.brand||'').trim()} ${(v?.model||'').trim()} ${(v?.engine||'').trim()}`.replace(/\s+/g,' ').trim().toUpperCase(); }

function mediaThumbEl(src, type){
  if((type||'').startsWith('video/') || /\.mp4$/i.test(src)){
    const v=document.createElement('video'); v.className='item-thumb'; v.src=src; v.muted=true; v.playsInline=true; return v;
  }else{
    const img=document.createElement('img'); img.className='item-thumb'; img.src=src; img.loading='lazy'; img.alt='media'; return img;
  }
}

// ========= INIT =========
export function initInventory(){
  // Entradas: crear
  const viBrand = document.getElementById("vi-brand"); upper(viBrand);
  const viModel = document.getElementById("vi-model"); upper(viModel);
  const viEngine = document.getElementById("vi-engine"); upper(viEngine);
  const viDate = document.getElementById("vi-date");
  const viPrice = document.getElementById("vi-price");
  const viSave = document.getElementById("vi-save");

  // Entradas: lista
  const viList = document.getElementById("vi-list");

  // Nuevo ítem
  const itSku = document.getElementById("it-sku"); upper(itSku);
  const itName = document.getElementById("it-name"); upper(itName);
  const itInternal = document.getElementById("it-internal");
  const itLocation = document.getElementById("it-location");
  const itVehicleTarget = document.getElementById("it-vehicleTarget"); upper(itVehicleTarget);
  const itVehicleIntakeId = document.getElementById("it-vehicleIntakeId");
  const itEntryPrice = document.getElementById("it-entryPrice");
  const itSalePrice = document.getElementById("it-salePrice");
  const itOriginal = document.getElementById("it-original");
  const itStock = document.getElementById("it-stock");
  const itFiles = document.getElementById("it-files");
  const itSave = document.getElementById("it-save");

  // Listado de ítems + filtros
  const itemsList = document.getElementById("itemsList");
  const qName = document.getElementById("q-name");
  const qSku = document.getElementById("q-sku");
  const qIntake = document.getElementById("q-intakeId");
  const qApply = document.getElementById("q-apply");
  const qClear = document.getElementById("q-clear");

  function renderIntakesList(){
    if(!viList) return;
    viList.replaceChildren();
    if(!state.intakes.length){
      const div=document.createElement('div'); div.className='muted'; div.textContent='No hay ingresos aún.'; viList.appendChild(div); return;
    }
    state.intakes.forEach(vi=>{
      const node = clone('tpl-inv-intake-row');
      node.querySelector('.brand').textContent = (vi.brand||'').toUpperCase();
      node.querySelector('.model').textContent = (vi.model||'').toUpperCase();
      node.querySelector('.engine').textContent = vi.engine||'';
      node.querySelector('.date').textContent = new Date(vi.intakeDate).toLocaleDateString();
      node.querySelector('.price').textContent = fmtMoney(vi.entryPrice || 0);
      node.querySelector('.edit').onclick = async ()=>{
        const newPrice = prompt('Nuevo precio de entrada:', vi.entryPrice ?? 0);
        if(newPrice==null) return;
        await invAPI.updateVehicleIntake(vi._id, { entryPrice: Number(newPrice) });
        await refreshIntakes();
      };
      node.querySelector('.delete').onclick = async ()=>{
        if(!confirm('¿Eliminar ingreso?')) return;
        await invAPI.deleteVehicleIntake(vi._id);
        await refreshIntakes();
      };
      viList.appendChild(node);
    });
  }

  function buildThumbGrid(it){
    const mediaWrap = document.createElement('div'); mediaWrap.className='item-media';
    const urls = Array.isArray(it.mediaUrls)?it.mediaUrls:[];
    urls.forEach((src, i)=>{
      const type = (it.mediaTypes||[])[i] || '';
      const el = mediaThumbEl(src, type);
      el.onclick = ()=> openLightbox({ url: src, mimetype:type });
      mediaWrap.appendChild(el);
    });
    // QR
    const qr = document.createElement('img'); qr.className='item-thumb qr-thumb'; qr.alt=`QR ${it.sku||it._id}`;
    mediaWrap.appendChild(qr);
    setImgWithQrBlob(qr, it._id, 180);
    return mediaWrap;
  }

  async function refreshIntakes(){
    const { data } = await invAPI.listVehicleIntakes();
    state.intakes = data || [];
    // combos
    if(itVehicleIntakeId){
      itVehicleIntakeId.replaceChildren(...state.intakes.map(v=>{ const o=document.createElement('option'); o.value=v._id; o.textContent=`${v.brand} ${v.model} ${v.engine} - ${new Date(v.intakeDate).toLocaleDateString()}`; return o; }));
    }
    if(qIntake){
      const first = document.createElement('option'); first.value=''; first.textContent='Todas las entradas';
      qIntake.replaceChildren(first, ...state.intakes.map(v=>{ const o=document.createElement('option'); o.value=v._id; o.textContent=`${v.brand} ${v.model} ${v.engine} - ${new Date(v.intakeDate).toLocaleDateString()}`; return o; }));
    }
    renderIntakesList();
    itVehicleIntakeId?.dispatchEvent(new Event('change'));
  }

  async function refreshItems(params={}){
    state.lastItemsParams = params;
    const { data } = await invAPI.listItems(params);
    state.items = data || [];
    itemsList.replaceChildren();

    state.items.forEach(it=>{
      const node = clone('tpl-inv-item');
      node.querySelector('.name').textContent = it.name || '';
      node.querySelector('.sku').textContent  = (it.sku || '').toUpperCase();
      node.querySelector('.stock').textContent = String(it.stock||0);
      const locEl = node.querySelector('.location'); if(locEl) locEl.textContent = it.location || '-';
      const intEl = node.querySelector('.internal'); if(intEl) intEl.textContent = it.internalName || '-';
      node.querySelector('.entry').textContent = `${fmtMoney(it.entryPrice ?? 0)}${it.entryPriceIsAuto ? " (prorrateado)" : ""}`;
      node.querySelector('.sale').textContent  = fmtMoney(it.salePrice ?? 0);
      node.querySelector('.target').textContent= it.vehicleTarget || '';
      const sel = node.querySelector('input.sel'); sel.dataset.id = it._id; sel.checked = state.selected.has(it._id);
      sel.onchange = (e)=> toggleSelected(itemsList, it._id, e.target.checked);

      // botones
      node.querySelector('button.edit').onclick = ()=> openEditItem(it);
      node.querySelector('button.delete').onclick = async ()=>{
        if(!confirm('¿Eliminar ítem? (stock debe ser 0)')) return;
        await invAPI.deleteItem(it._id);
        state.selected.delete(it._id);
        await refreshItems(state.lastItemsParams);
        updateSelectionBar(itemsList);
      };
      node.querySelector('button.qr').onclick    = ()=> openQrModal(it);
      node.querySelector('button.qr-dl').onclick = ()=> downloadQrPng(it._id, 720, `QR_${it.sku || it._id}.png`);

      // media
      node.querySelector('.item-media').replaceWith(buildThumbGrid(it));

      itemsList.appendChild(node);
    });

    updateSelectionBar(itemsList);
  }

  function openQrModal(it){
    const body=$('#modalBody'), btnClose=$('#modalClose'); body.replaceChildren();
    const card = document.createElement('div'); card.className='card';
    const h3 = document.createElement('h3'); h3.textContent='Código QR'; card.appendChild(h3);
    const img = document.createElement('img'); img.alt='QR'; img.style.maxWidth='256px'; card.appendChild(img);
    body.appendChild(card);
    setImgWithQrBlob(img, it._id, 256);
    const cleanup=openModal(); btnClose.onclick=()=>{ cleanup?.(); closeModal(); };
  }

  function openEditItem(it){
    const body=$('#modalBody'), btnClose=$('#modalClose'); body.replaceChildren();
    const node = clone('tpl-inv-edit'); body.appendChild(node);
    const cleanup=openModal(); btnClose.onclick=()=>{ cleanup?.(); closeModal(); };

    const sku = $('#e-it-sku'); const name=$('#e-it-name'); const intake=$('#e-it-intake');
    const target=$('#e-it-target'); const entry=$('#e-it-entry'); const sale=$('#e-it-sale');
    const internal=$('#e-it-internal'); const location=$('#e-it-location');
    const original=$('#e-it-original'); const stock=$('#e-it-stock'); const thumbs=$('#e-it-thumbs'); const files=$('#e-it-files'); const viewer=$('#e-it-viewer');

    // cargar valores
    sku.value = it.sku || ''; name.value = it.name || ''; if(internal) internal.value = it.internalName || ''; if(location) location.value = it.location || ''; target.value = it.vehicleTarget || '';
    entry.value = it.entryPrice ?? 0; sale.value = it.salePrice ?? 0;
    original.value = it.original ? 'true' : 'false'; stock.value = parseInt(it.stock||0,10);
    intake.replaceChildren(...state.intakes.map(v=>{ const o=document.createElement('option'); o.value=v._id; o.textContent=makeIntakeLabel(v); return o; }));
    intake.value = it.vehicleIntakeId || '';

    // thumbs
    thumbs.replaceChildren();
    (it.mediaUrls||[]).forEach((src,i)=>{
      const type = (it.mediaTypes||[])[i] || '';
      const el = mediaThumbEl(src,type);
      el.onclick = ()=> openLightbox({ url: src, mimetype:type });
      thumbs.appendChild(el);
    });

    // acciones
    $('#e-it-save').onclick = async ()=>{
      const payload = {
        sku: sku.value.trim().toUpperCase(),
        name: name.value.trim().toUpperCase(),
        vehicleIntakeId: intake.value || null,
        internalName: (internal?.value||'').trim(),
        location: (location?.value||'').trim(),
        vehicleTarget: target.value.trim().toUpperCase(),
        entryPrice: Number(entry.value||0),
        salePrice: Number(sale.value||0),
        original: original.value === 'true',
        stock: parseInt(stock.value||0,10)
      };
      await invAPI.updateItem(it._id, payload);
      closeModal(); await refreshItems(state.lastItemsParams);
    };
    $('#e-it-cancel').onclick = ()=>{ closeModal(); };
  }

  // Crear entrada
  viSave.onclick = async ()=>{
    const body = { brand:viBrand.value, model:viModel.value, engine:viEngine.value, intakeDate: viDate.value || new Date().toISOString(), entryPrice: Number(viPrice.value||0) };
    await invAPI.saveVehicleIntake(body); await refreshIntakes();
    viBrand.value=''; viModel.value=''; viEngine.value=''; viDate.value=''; viPrice.value='';
  };

  // Crear ítem
  itSave.onclick = async ()=>{
    const body = {
      sku: (itSku.value||"").trim().toUpperCase(),
      name: (itName.value||"").trim().toUpperCase(),
      internalName: (itInternal?.value||"").trim(),
      location: (itLocation?.value||"").trim(),
      vehicleTarget: (itVehicleTarget.value||"").trim().toUpperCase(),
      vehicleIntakeId: itVehicleIntakeId.value||"",
      entryPrice: itEntryPrice.value||0,
      salePrice: itSalePrice.value||0,
      original: itOriginal.value==='true',
      stock: itStock.value||0
    };
    await invAPI.createItem(body);
    itSku.value=''; itName.value=''; if(itInternal) itInternal.value=''; if(itLocation) itLocation.value=''; itVehicleTarget.value=''; itEntryPrice.value=''; itSalePrice.value=''; itOriginal.value='false'; itStock.value='0'; if(itFiles) itFiles.value='';
    await refreshItems(state.lastItemsParams);
  };

  // Búsqueda
  function doSearch(){
    const params = { name: (qName?.value||'').trim(), sku:(qSku?.value||'').trim(), vehicleIntakeId: (qIntake?.value||'') || undefined };
    refreshItems(params);
  }
  qApply && (qApply.onclick = doSearch);
  qClear && (qClear.onclick = ()=>{ [qName,qSku,qIntake].forEach(el=>el && (el.value='')); refreshItems({}); });

  // Init
  refreshIntakes();
  refreshItems({});
}
