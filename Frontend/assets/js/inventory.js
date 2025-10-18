// Frontend/assets/inventory.js
import { API } from "./api.esm.js";
import { loadFeatureOptionsAndRestrictions, getFeatureOptions, gateElement } from './feature-gating.js';
import { upper } from "./utils.js";
import { bindStickersButton, downloadStickersPdf } from './pdf.js';

// ---- State ----
const state = {
  intakes: [],
  lastItemsParams: {},
  items: [],
  selected: new Set(),
  itemCache: new Map(),
  paging: { page: 1, limit: 10, pages: 1, total: 0 },
};

// ---- Helpers ----
function makeIntakeLabel(v) {
  if (!v) return "GENERAL";
  const kind = (v.intakeKind || "vehicle").toLowerCase();

  if (kind === "purchase") {
    const place = (v.purchasePlace || "").trim();
    const d = v.intakeDate ? new Date(v.intakeDate) : null;
    const ymd = d && isFinite(d) ? d.toISOString().slice(0, 10) : "";
    return `COMPRA: ${place}${ymd ? " " + ymd : ""}`.trim().toUpperCase();
  }

  return `${(v?.brand || "").trim()} ${(v?.model || "").trim()} ${(v?.engine || "").trim()}`
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase() || "GENERAL";
}

const fmtMoney = (n) => {
  const v = Math.round((n || 0) * 100) / 100;
  try {
    return v.toLocaleString();
  } catch {
    return String(v);
  }
};

const apiBase = API.base || "";
const authHeader = () => {
  const t = API.token?.get?.();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function request(path, { method = "GET", json } = {}) {
  const headers = { ...authHeader() };
  if (json !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(body?.error || (typeof body === "string" ? body : res.statusText));
  return body;
}

function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.set(k, v);
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

// --- Utils ---
function debounce(fn, wait = 200) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ---- API Facade ----
const invAPI = {
  // Vehicle Intakes
  listVehicleIntakes: async () => {
    const r = await request("/api/v1/inventory/vehicle-intakes");
    const data = Array.isArray(r) ? r : (r.items || r.data || []);
    return { data };
  },
  saveVehicleIntake: (body) =>
    request("/api/v1/inventory/vehicle-intakes", { method: "POST", json: body }),
  updateVehicleIntake: (id, body) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}`, { method: "PUT", json: body }),
  deleteVehicleIntake: (id) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}`, { method: "DELETE" }),
  recalcVehicleIntake: (id) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}/recalc`, { method: "POST" }),

  // Items
  listItems: async (params = {}) => {
    const r = await request(`/api/v1/inventory/items${toQuery(params)}`);
    const data = Array.isArray(r) ? r : (r.items || r.data || []);
    const meta = r?.meta || {};
    return { data, meta };
  },
  saveItem: (body) => request("/api/v1/inventory/items", { method: "POST", json: body }),
  updateItem: (id, body) => request(`/api/v1/inventory/items/${id}`, { method: "PUT", json: body }),
  deleteItem: (id) => request(`/api/v1/inventory/items/${id}`, { method: "DELETE" }),

  mediaUpload: (files) => API.mediaUpload(files),
  // Import template and upload
  downloadImportTemplate: async () => {
    const url = `${apiBase}/api/v1/inventory/items/import/template`;
    const res = await fetch(url, { headers: { ...authHeader() } });
    if(!res.ok) throw new Error('No se pudo descargar la plantilla');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plantilla-inventario.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
  },
  importExcel: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${apiBase}/api/v1/inventory/items/import/excel`, { method:'POST', headers: { ...authHeader() }, body: fd });
    const txt = await res.text(); let data; try{ data=JSON.parse(txt);}catch{ data=txt; }
    if(!res.ok) throw new Error(data?.error || 'Error importando');
    return data;
  }
};

// ---- Modal helpers ----
function invOpenModal(innerHTML) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  const close = document.getElementById("modalClose");
  if (!modal || !body || !close) return alert("No se encontró el modal en el DOM.");

  body.innerHTML = innerHTML;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");

  // Zoom logic for modal image
  setTimeout(() => {
    const img = document.getElementById("modal-img");
    const zoomIn = document.getElementById("zoom-in");
    const zoomOut = document.getElementById("zoom-out");
    let scale = 2;
    if (img) {
      img.style.transform = `scale(${scale})`;
      if (zoomIn) zoomIn.onclick = () => {
        scale = Math.min(scale + 0.2, 5);
        img.style.transform = `scale(${scale})`;
      };
      if (zoomOut) zoomOut.onclick = () => {
        scale = Math.max(scale - 0.2, 1);
        img.style.transform = `scale(${scale})`;
      };
      img.onwheel = (e) => {
        e.preventDefault();
        if (e.deltaY < 0) {
          scale = Math.min(scale + 0.1, 5);
        } else {
          scale = Math.max(scale - 0.1, 1);
        }
        img.style.transform = `scale(${scale})`;
      };
    }
    const closeModalBtn = document.getElementById("close-modal");
    if (closeModalBtn) closeModalBtn.onclick = () => invCloseModal();
  }, 50);

  const closeAll = () => invCloseModal();
  close.onclick = closeAll;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeAll();
  }, { once: true });

  function escListener(e) {
    if (e.key === "Escape") closeAll();
  }
  document.addEventListener("keydown", escListener, { once: true });
}

function invCloseModal() {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  if (body) body.innerHTML = "";
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

// Opens a stacked overlay above the main modal without closing it (used for image/video previews)
function invOpenOverlay(innerHTML) {
  const overlay = document.createElement('div');
  overlay.id = 'inv-stacked-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.6);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;';
  overlay.innerHTML = `<div id="inv-stacked-box" style="position:relative;background:var(--card,#0b1220);color:var(--text,#e5e7eb);padding:10px;border-radius:10px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.35)">
    <button id="inv-overlay-close" aria-label="Cerrar" style="position:absolute;top:6px;right:8px;line-height:1;border:0;background:transparent;font-size:24px;color:#94a3b8;cursor:pointer">&times;</button>
    ${innerHTML}
  </div>`;
  document.body.appendChild(overlay);
  const close = () => { try{ document.body.removeChild(overlay); }catch{} };
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) close(); });
  document.getElementById('inv-overlay-close')?.addEventListener('click', close);
  document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ close(); } }, { once: true });
}

function openLightbox(media) {
  const isVideo = (media.mimetype || "").startsWith("video/");
  invOpenModal(
    `<h3>Vista previa</h3>
     <div class="viewer">
       ${isVideo ? `<video controls src="${media.url}"></video>` : `<img src="${media.url}" alt="media" />`}
     </div>
     <div class="row"><button class="secondary" id="lb-close">Cerrar</button></div>`
  );
  document.getElementById("lb-close").onclick = invCloseModal;
}

// ---- QR helpers ----
function buildQrPath(itemId, size = 256) {
  return `/api/v1/inventory/items/${itemId}/qr.png?size=${size}`;
}

async function fetchQrBlob(itemId, size = 256) {
  const res = await fetch(`${apiBase}${buildQrPath(itemId, size)}`, { headers: { ...authHeader() } });
  if (!res.ok) throw new Error("No se pudo generar el QR");
  return await res.blob();
}

async function setImgWithQrBlob(imgEl, itemId, size = 256) {
  try {
    const blob = await fetchQrBlob(itemId, size);
    const url = URL.createObjectURL(blob);
    imgEl.src = url;
    imgEl.dataset.blobUrl = url;
  } catch (e) {
    imgEl.alt = "Error al cargar QR";
  }
}

async function downloadQrPng(itemId, size = 720, filename = "qr.png") {
  const blob = await fetchQrBlob(itemId, size);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildQrPayload(companyId, item) {
  return `IT:${companyId}:${item._id}:${(item.sku || "").toUpperCase()}`;
}

function openQrModal(item, companyId) {
  invOpenModal(
    `<h3>QR del ítem</h3>
     <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:8px;">
       <img id="qr-big" alt="QR ${item.sku || item._id}"
            style="width:300px;height:300px;background:#fff;padding:8px;border-radius:10px;border:1px solid #1f2937"/>
       <div class="row" style="gap:8px;">
         <button class="secondary" id="qr-download">Descargar PNG</button>
         <button class="secondary" id="qr-copy">Copiar payload</button>
       </div>
       <code style="font-size:12px;opacity:.8;word-break:break-all;" id="qr-payload"></code>
     </div>`
  );

  const img = document.getElementById("qr-big");
  setImgWithQrBlob(img, item._id, 300);

  const payload = buildQrPayload(companyId || (API.companyId?.get?.() || ""), item);
  document.getElementById("qr-payload").textContent = payload;

  const btnCopy = document.getElementById("qr-copy");
  btnCopy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      btnCopy.textContent = "¡Copiado!";
      setTimeout(() => (btnCopy.textContent = "Copiar payload"), 1200);
    } catch {
      alert("No se pudo copiar");
    }
  };

  document.getElementById("qr-download").onclick = () =>
    downloadQrPng(item._id, 720, `QR_${item.sku || item._id}.png`);
}

function ensureJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf?.jsPDF) return resolve(window.jspdf.jsPDF);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    s.onload = () => resolve(window.jspdf?.jsPDF);
    s.onerror = () => reject(new Error("No se pudo cargar jsPDF"));
    document.head.appendChild(s);
  });
}

// Cargar html2canvas on-demand
function ensureHtml2Canvas(){
  return new Promise((resolve, reject) => {
    if (window.html2canvas) return resolve(window.html2canvas);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => reject(new Error('No se pudo cargar html2canvas'));
    document.head.appendChild(s);
  });
}

// Cargar JSZip on-demand para empaquetar imágenes
function ensureJSZip(){
  return new Promise((resolve, reject) => {
    if (window.JSZip) return resolve(window.JSZip);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload = () => resolve(window.JSZip);
    s.onerror = () => reject(new Error('No se pudo cargar JSZip'));
    document.head.appendChild(s);
  });
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// Ejemplo: función que recoge items seleccionados en la UI
function getSelectedItems() {
  // Selecciona checkboxes marcados y devuelve objetos item desde el cache
  const boxes = Array.from(document.querySelectorAll('input[type="checkbox"][data-id]:checked'));
  return boxes
    .map((b) => state.itemCache.get(String(b.dataset.id)))
    .filter(Boolean);
}

// Solo ejecutar la lógica de Inventario cuando estamos en esa página
const __ON_INV_PAGE__ = (document.body?.dataset?.page === 'inventario');
if (__ON_INV_PAGE__) {
  // --- Busy Overlay (para operaciones largas) ---
  function getBusyOverlay(){
    let el = document.getElementById('busy-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'busy-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);display:none;align-items:center;justify-content:center;z-index:9999;';
    el.innerHTML = `<div style="background:var(--card);color:var(--text);padding:14px 18px;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.4);display:flex;gap:10px;align-items:center;font-size:14px;">
        <span class="spinner" style="width:16px;height:16px;border-radius:50%;border:2px solid #8aa; border-top-color: transparent; display:inline-block; animation:spin .8s linear infinite;"></span>
        <span id="busy-msg">Generando PDF...</span>
      </div>
      <style>@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>`;
    document.body.appendChild(el);
    return el;
  }
  function showBusy(msg){ const o=getBusyOverlay(); const m=o.querySelector('#busy-msg'); if(m) m.textContent=msg||'Procesando...'; o.style.display='flex'; }
  function hideBusy(){ const o=document.getElementById('busy-overlay'); if(o) o.style.display='none'; }
  const itSku = document.getElementById("it-sku"); upper(itSku);
  // Helper UI (sugerencia y botón +)
  const skuHelper = document.createElement('div');
  skuHelper.id = 'it-sku-helper';
  skuHelper.style.cssText = 'display:flex;gap:8px;align-items:center;margin:6px 0 10px 0;flex-wrap:wrap;';
  skuHelper.innerHTML = `
    <span id="it-sku-suggest" class="muted" style="font-size:12px;display:none;"></span>
    <button id="it-sku-create" class="secondary" style="display:none;">+ SKU</button>
  `;
  if (itSku && itSku.parentNode) {
    itSku.parentNode.insertBefore(skuHelper, itSku.nextSibling);
  }

  const elSkuSuggest = document.getElementById('it-sku-suggest');
  const elSkuCreate = document.getElementById('it-sku-create');

  function skuPrefix(raw){
    const s = String(raw || '').toUpperCase().trim();
    // Quitar dígitos al final, solo letras (y guiones) al inicio como prefijo
    const m = s.match(/^[A-Z-]+/);
    return m ? m[0] : '';
  }

  async function refreshSkuHelpers(){
    const code = (itSku?.value || '').toUpperCase().trim();
    const prefix = skuPrefix(code);
    // Sugerencia
    if (prefix && prefix.length >= 3) {
      try {
        const r = await API.skus.getSuggestion(prefix);
        const sug = r?.suggestion;
        if (sug) {
          elSkuSuggest.innerHTML = `💡 Sugerencia: <b>${sug}</b>`;
          elSkuSuggest.style.display = 'inline';
          elSkuSuggest.style.cursor = 'pointer';
          elSkuSuggest.title = 'Click para usar la sugerencia';
          elSkuSuggest.onclick = () => {
            itSku.value = sug;
            itSku.dispatchEvent(new Event('input'));
          };
        } else {
          elSkuSuggest.style.display = 'none';
        }
      } catch { elSkuSuggest.style.display = 'none'; }
    } else {
      elSkuSuggest.style.display = 'none';
    }

    // Mostrar botón + si el SKU exacto no existe
    if (!code) { elSkuCreate.style.display = 'none'; return; }
    try {
      await API.skus.getByCode(code);
      // Existe => ocultar +
      elSkuCreate.style.display = 'none';
    } catch {
      // No existe => mostrar +
      elSkuCreate.style.display = '';
    }
  }

  const refreshSkuHelpersDebounced = debounce(refreshSkuHelpers, 250);
  itSku?.addEventListener('input', refreshSkuHelpersDebounced);
  setTimeout(refreshSkuHelpers, 50);

  function openCreateSkuModal(code){
    const itName = document.getElementById('it-name');
    const defaultName = (itName?.value || '').toUpperCase().trim();
    const cats = ['MOTOR','TRANSMISION','FRENOS','SUSPENSION','ELECTRICO','CARROCERIA','INTERIOR','FILTROS','ACEITES','NEUMATICOS','OTROS'];
    invOpenModal(`
      <h3>Crear SKU</h3>
      <label>Código</label><input id="sku-new-code" value="${code}" readonly />
      <label>Nombre de repuesto</label><input id="sku-new-desc" value="${defaultName}" />
      <label>Categoría</label>
      <select id="sku-new-cat">${cats.map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
      <div style="margin-top:10px;display:flex;gap:8px;">
        <button id="sku-new-save">Crear</button>
        <button id="sku-new-cancel" class="secondary">Cancelar</button>
      </div>
    `);
    document.getElementById('sku-new-cancel').onclick = invCloseModal;
    document.getElementById('sku-new-save').onclick = async () => {
      try{
        const payload = {
          code: code,
          description: (document.getElementById('sku-new-desc').value||'').toUpperCase().trim() || code,
          category: document.getElementById('sku-new-cat').value,
        };
        await API.skus.create(payload);
        invCloseModal();
        elSkuCreate.style.display = 'none';
        // Refrescar sugerencia
        refreshSkuHelpers();
        alert('SKU creado para tracking.');
      }catch(e){ alert('No se pudo crear el SKU: '+e.message); }
    };
  }

  elSkuCreate?.addEventListener('click', () => {
    const code = (itSku?.value || '').toUpperCase().trim();
    if (!code) return;
    openCreateSkuModal(code);
  });
  const itName = document.getElementById("it-name"); upper(itName);
  const itInternal = document.getElementById("it-internal"); if (itInternal) upper(itInternal);
  const itLocation = document.getElementById("it-location"); if (itLocation) upper(itLocation);
  const itBrand = document.getElementById("it-brand"); if (itBrand) upper(itBrand);
  const itVehicleTarget = document.getElementById("it-vehicleTarget"); upper(itVehicleTarget);
  // Controles de Ingreso
  const viKindVehicle = document.getElementById('vi-kind-vehicle');
  const viKindPurchase = document.getElementById('vi-kind-purchase');
  const viFormVehicle = document.getElementById('vi-form-vehicle');
  const viFormPurchase = document.getElementById('vi-form-purchase');
  const viBrand = document.getElementById('vi-brand');
  const viModel = document.getElementById('vi-model');
  const viEngine = document.getElementById('vi-engine');
  const viDate = document.getElementById('vi-date');
  const viPrice = document.getElementById('vi-price');
  const viPPlace = document.getElementById('vi-p-place');
  const viPDate = document.getElementById('vi-p-date');
  const viPPrice = document.getElementById('vi-p-price');
  const viSave = document.getElementById('vi-save');
  const viList = document.getElementById('vi-list');
  function updateIntakeKindUI(){
    const isPurchase = !!viKindPurchase?.checked;
    if (viFormVehicle) viFormVehicle.classList.toggle('hidden', isPurchase);
    if (viFormPurchase) viFormPurchase.classList.toggle('hidden', !isPurchase);
  }
  viKindVehicle?.addEventListener('change', updateIntakeKindUI);
  viKindPurchase?.addEventListener('change', updateIntakeKindUI);
  // Default to purchase as requested
  if (viKindPurchase) viKindPurchase.checked = true;
  updateIntakeKindUI();
  const itVehicleIntakeId = document.getElementById("it-vehicleIntakeId");
  const itEntryPrice = document.getElementById("it-entryPrice");
  const itSalePrice = document.getElementById("it-salePrice");
  const itOriginal = document.getElementById("it-original");
  const itStock = document.getElementById("it-stock");
  const itFiles = document.getElementById("it-files");
  const itSave = document.getElementById("it-save");
  const itMinStock = document.getElementById("it-minStock");

  const itemsList = document.getElementById("itemsList");

  // Filtros
  const qName = document.getElementById("q-name");
  const qApply = document.getElementById("q-apply");
  const qSku = document.getElementById("q-sku");
  const qBrand = document.getElementById("q-brand");
  const qIntake = document.getElementById("q-intakeId");
  const qClear = document.getElementById("q-clear");
  const btnUnpublishZero = document.getElementById('btn-unpublish-zero');
  const btnPubGlobal = document.getElementById('pub-bulk-global');

  // Mini-toolbar selección stickers
  const selectionBar = document.createElement("div");
  selectionBar.id = "stickersBar";
  selectionBar.style.cssText = "display:none;gap:8px;align-items:center;margin:10px 0;flex-wrap:wrap";
  itemsList.parentNode.insertBefore(selectionBar, itemsList);

  function updateSelectionBar() {
    const n = state.selected.size;
    if (!n) {
      selectionBar.style.display = "none";
      selectionBar.innerHTML = "";
      return;
    }
    selectionBar.style.display = "flex";
    selectionBar.innerHTML = `
      <div class="muted" style="font-weight:600;">Seleccionados: ${n}</div>
      <button class="secondary" id="sel-clear">Limpiar selección</button>
      <button class="chip-button" id="sel-page"><span class="chip-icon">☑</span> Seleccionar todos (página)</button>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button id="sel-stickers-qr" class="secondary" title="Generar PDF - Solo QR">Solo QR</button>
        <button id="sel-stickers-brand" class="secondary" title="Generar PDF - Marca + QR">Marca + QR</button>
        <button id="sel-stock-in-bulk" class="secondary" title="Agregar stock a todos los seleccionados">Agregar stock (masivo)</button>
        <button id="sel-publish-bulk" class="secondary" title="Publicar/Despublicar ítems seleccionados, por entrada o SKUs">Publicación (masiva)</button>
      </div>
    `;
    selectionBar.querySelector("#sel-clear").onclick = () => {
      state.selected.clear();
      Array.from(itemsList.querySelectorAll('input[type="checkbox"][data-id]')).forEach((ch) => (ch.checked = false));
      updateSelectionBar();
    };
    selectionBar.querySelector("#sel-page").onclick = () => {
      Array.from(itemsList.querySelectorAll('input[type="checkbox"][data-id]')).forEach((ch) => {
        ch.checked = true;
        const id = String(ch.dataset.id);
        state.selected.add(id);
        const item = state.items.find((it) => String(it._id) === id);
        if (item) state.itemCache.set(id, item);
      });
      updateSelectionBar();
    };
    const btnQR = selectionBar.querySelector("#sel-stickers-qr");
    const btnBrand = selectionBar.querySelector("#sel-stickers-brand");
    if (btnQR) btnQR.onclick = () => generateStickersFromSelection('qr');
    if (btnBrand) btnBrand.onclick = () => generateStickersFromSelection('brand');
    const btnBulk = selectionBar.querySelector('#sel-stock-in-bulk');
    if (btnBulk) btnBulk.onclick = openBulkStockInModal;
    const btnPub = selectionBar.querySelector('#sel-publish-bulk');
    if (btnPub) btnPub.onclick = openBulkPublishModal;

    // Apply sub-feature gating for sticker options
    try{
      const fo = (typeof getFeatureOptions === 'function') ? getFeatureOptions() : {};
      const tpl = (fo.templates||{});
      const allowQR = (tpl.stickerQR !== false);
      const allowBrand = (tpl.stickerQRyMarca !== false);
      if (btnQR) btnQR.style.display = allowQR ? '' : 'none';
      if (btnBrand) btnBrand.style.display = allowBrand ? '' : 'none';
    }catch{}
  }

  function toggleSelected(itemOrId, checked) {
    const id = typeof itemOrId === 'object' ? itemOrId?._id : itemOrId;
    if (!id) return;
    const key = String(id);
    if (typeof itemOrId === 'object') {
      state.itemCache.set(key, itemOrId);
    }
    if (checked) state.selected.add(key);
    else state.selected.delete(key);
    updateSelectionBar();
  }

  // ---- Publicación MASIVA ----
  function openBulkPublishModal(){
    const optionsIntakes = [
      `<option value="">(por selección actual o SKUs)</option>`,
      ...state.intakes.map(v=>`<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
    ].join('');
    const selected = Array.from(state.selected);
    invOpenModal(`
      <h3>Publicación masiva</h3>
      <label>Acción</label>
      <select id="bpub-action">
        <option value="publish">Publicar</option>
        <option value="unpublish">Despublicar</option>
      </select>
      <label>Por entrada (opcional)</label>
      <select id="bpub-intake">${optionsIntakes}</select>
      <label>Por SKUs exactos (opcional, separados por comas)</label>
      <input id="bpub-skus" placeholder="SKU1,SKU2,SKU3"/>
      <div class=\"muted\" style=\"font-size:12px;\">Puedes publicar todos los de una procedencia (entrada) o escribir SKUs exactos. No es necesario seleccionar ítems.</div>
      <div style="margin-top:10px;display:flex;gap:8px;">
        <button id="bpub-run">Aplicar</button>
        <button id="bpub-cancel" class="secondary">Cancelar</button>
      </div>
    `);
    document.getElementById('bpub-cancel').onclick = invCloseModal;
    document.getElementById('bpub-run').onclick = async () => {
      const action = document.getElementById('bpub-action').value;
      const vehicleIntakeId = document.getElementById('bpub-intake').value || undefined;
      const skusRaw = (document.getElementById('bpub-skus').value||'').trim();
      const skus = skusRaw ? skusRaw.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean) : [];
      const body = { action };
      if (vehicleIntakeId) body.vehicleIntakeId = vehicleIntakeId;
      if (skus.length) body.skus = skus;
      if (!vehicleIntakeId && !skus.length) { alert('Indica una procedencia o uno o más SKUs.'); return; }
      try{
        showBusy('Aplicando publicación...');
        await request('/api/v1/inventory/items/publish/bulk', { method: 'POST', json: body });
        invCloseModal(); hideBusy();
        await refreshItems(state.lastItemsParams);
        showToast('Operación aplicada');
      }catch(e){ hideBusy(); alert('No se pudo aplicar publicación: '+e.message); }
    };
  }

  // Botón global en filtros: abrir publicación sin selección previa
  if (btnPubGlobal) btnPubGlobal.onclick = openBulkPublishModal;

  // Mantenimiento: despublicar todos los agotados (stock 0)
  if (btnUnpublishZero) btnUnpublishZero.onclick = () => {
    invOpenModal(`
      <h3>Despublicar agotados</h3>
      <p class="muted">Esta acción despublicará todos los ítems con stock igual a 0. No afecta precios ni stock.</p>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button id="u0-apply">Sí, despublicar</button>
        <button id="u0-cancel" class="secondary">Cancelar</button>
      </div>
    `);
    document.getElementById('u0-cancel').onclick = invCloseModal;
    document.getElementById('u0-apply').onclick = async () => {
      try{
        showBusy('Despublicando agotados...');
        const res = await request('/api/v1/inventory/items/maintenance/unpublish-zero-stock', { method:'POST' });
        invCloseModal(); hideBusy();
        await refreshItems(state.lastItemsParams);
        const count = res?.modified ?? res?.count ?? res?.matched ?? 0;
        showToast(`Despublicados ${count} ítems agotados`);
      }catch(e){ hideBusy(); alert('No se pudo despublicar: ' + e.message); }
    };
  };

  // ---- Intakes ----
  async function refreshIntakes() {
    const { data } = await invAPI.listVehicleIntakes();
    state.intakes = data || [];

    itVehicleIntakeId.innerHTML =
      `<option value="">— Sin procedencia —</option>` +
      state.intakes
        .map((v) => `<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
        .join("");

    if (qIntake) {
      qIntake.innerHTML =
        `<option value="">Todas las entradas</option>` +
        state.intakes
          .map((v) => `<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
          .join("");
    }

    renderIntakesList();
    itVehicleIntakeId.dispatchEvent(new Event("change"));
  }

  function renderIntakesList() {
    if (!viList) return;
    if (!state.intakes.length) {
      viList.innerHTML = `<div class="muted">No hay ingresos aún.</div>`;
      return;
    }
    viList.innerHTML = "";
    state.intakes.forEach((vi) => {
      const row = document.createElement("div");
      row.className = "note";
      row.innerHTML = `
        <div>
          ${vi.intakeKind === 'purchase' 
            ? `<div><b>COMPRA: ${(vi.purchasePlace||'').toUpperCase()}</b></div>`
            : `<div><b>${(vi.brand || "") + (vi.model ? " " + vi.model : "")}</b></div><div>${vi.engine || ""}</div>`}
        </div>
        <div class="content">
          <div>Fecha: ${new Date(vi.intakeDate).toLocaleDateString()}</div>
          <div>Precio entrada: <b>${fmtMoney(vi.entryPrice)}</b></div>
        </div>
        <div class="actions">
          <button class="secondary" data-edit="${vi._id}">Editar</button>
          <button class="secondary" data-recalc="${vi._id}">Recalcular</button>
          <button class="danger" data-del="${vi._id}">Eliminar</button>
        </div>`;

      row.querySelector("[data-edit]").onclick = () => openEditVehicleIntake(vi);
      row.querySelector("[data-del]").onclick = async () => {
        if (!confirm("¿Eliminar esta entrada? (debe no tener ítems vinculados)")) return;
        try {
          await invAPI.deleteVehicleIntake(vi._id);
          await refreshIntakes();
          await refreshItems({});
        } catch (e) {
          alert("No se pudo eliminar: " + e.message);
        }
      };
      row.querySelector("[data-recalc]").onclick = async () => {
        await invAPI.recalcVehicleIntake(vi._id);
        await refreshItems({});
        alert("Prorrateo recalculado.");
      };

      viList.appendChild(row);
    });
  }

  // --- Sub-feature gating for Inventario ---
  (async ()=>{
    await loadFeatureOptionsAndRestrictions();
    const fo = getFeatureOptions();
    const inv = (fo.inventario||{});
    // Ingresos: vehículo y compra
    const allowVeh = inv.ingresoVehiculo !== false; // default true
    const allowPurch = inv.ingresoCompra !== false; // default true
    gateElement(allowVeh, '#vi-kind-vehicle');
    gateElement(allowVeh, '#vi-form-vehicle');
    gateElement(allowPurch, '#vi-kind-purchase');
    gateElement(allowPurch, '#vi-form-purchase');

    // Catálogo público y publicación
    // If company has publicCatalogEnabled=false, treat any catalog sub-options as disabled
    let publicEnabled = true;
    try{ const me = await API.companyMe(); publicEnabled = (me?.company?.publicCatalogEnabled !== false); }catch{}
    const allowMarketplace = publicEnabled && (inv.marketplace !== false);
    const allowPublishOps = publicEnabled && (inv.publicar !== false);
    const allowUnpublishZero = publicEnabled && (inv.publicarAgotados !== false);
    // Buttons and selectionBar entries
    gateElement(allowPublishOps, '#pub-bulk-global');
    gateElement(allowUnpublishZero, '#btn-unpublish-zero');
    // Selection bar ids are created dynamically; hide container if all actions off
    if (!allowPublishOps) {
      // hide selection bar publish button once rendered
      const obs = new MutationObserver(()=>{
        const btn = document.getElementById('sel-publish-bulk'); if(btn) btn.style.display = 'none';
      });
      obs.observe(selectionBar, { childList:true, subtree:true }); setTimeout(()=>obs.disconnect(), 4000);
    }
  })();

  // ---- Items list ----
  function buildThumbGrid(it) {
    const media = Array.isArray(it.images) ? it.images : [];
    const cells = media
      .map((m, i) => {
        const isVid = (m.mimetype || "").startsWith("video/");
        const type = isVid ? "video" : "image";
        const src = m.url;
        return isVid
          ? `<video class="item-thumb" data-full="${src}" data-type="${type}" src="${src}" muted playsinline></video>`
          : `<img class="item-thumb" data-full="${src}" data-type="${type}" src="${src}" alt="${(it.name || "imagen") + " " + (i + 1)}" loading="lazy">`;
      })
      .join("");
    const qrCell = `<img id="qr-${it._id}" class="item-thumb qr-thumb" alt="QR ${it.sku || it._id}" loading="lazy"/>`;
    return `<div class="item-media">${cells}${qrCell}</div>`;
  }

  async function refreshItems(params = {}) {
    // Merge persisted paging with incoming params; reset to page 1 if filters changed
    const prev = state.lastItemsParams || {};
    const filters = { ...params };
    delete filters.page; delete filters.limit;
    const prevFilters = { ...prev }; delete prevFilters.page; delete prevFilters.limit;
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(prevFilters);
    const paging = state.paging || { page: 1, limit: 10 };
    const page = filtersChanged ? 1 : (params.page || prev.page || paging.page || 1);
    const limit = params.limit || prev.limit || paging.limit || 10;
    const nextParams = { ...filters, page, limit };
    state.lastItemsParams = nextParams;
    const { data, meta } = await invAPI.listItems(nextParams);
    state.items = data || [];
    // Update paging info if meta was returned
    if (meta && (meta.total != null || meta.pages != null || meta.page != null)) {
      state.paging = {
        page: meta.page || page || 1,
        pages: meta.pages || Math.max(1, Math.ceil((meta.total || state.items.length || 0) / (meta.limit || limit || 10))),
        total: meta.total || state.items.length || 0,
        limit: meta.limit || limit || 10,
        truncated: !!meta.truncated,
      };
    } else {
      // No meta -> single page with all items
      state.paging = { page: 1, pages: 1, total: state.items.length, limit: state.items.length || 10, truncated: false };
    }

    itemsList.innerHTML = "";
    state.items.forEach((it) => {
      const cacheKey = String(it._id);
      state.itemCache.set(cacheKey, it);
      const div = document.createElement("div");
      div.className = "note";

      const unit = it.entryPrice ?? 0;
      const total = unit * Math.max(0, it.stock || 0);
      const entradaTxt = `${fmtMoney(total)}${it.entryPriceIsAuto ? " (prorrateado)" : ""} - unit: ${fmtMoney(unit)}`;

      const thumbs = buildThumbGrid(it);
      const companyId = API.companyId?.get?.() || "";
  const internalLabel = it.internalName ? `Interno: ${it.internalName}` : "Interno: -";
  const brandLabel = it.brand ? `Marca: ${it.brand}` : "Marca: -";
  const locationLabel = it.location ? `Ubicacion: ${it.location}` : "Ubicacion: -";

      div.innerHTML = `
        <div class="inv-item-header">
          <label class="inv-checkbox">
            <input type="checkbox" data-id="${it._id}" ${state.selected.has(cacheKey) ? "checked" : ""} aria-label="Seleccionar item para stickers"/>
          </label>
          <div class="inv-item-info">
            <div class="inv-item-name">${it.name || ""}</div>
            <div class="inv-item-meta muted">
              <span>SKU: ${it.sku || ""}</span>
              <span>${internalLabel}</span>
              <span>${brandLabel}</span>
              <span>${locationLabel}</span>
            </div>
          </div>
        </div>
        ${thumbs}
        <div class="content">
          <div>Destino: ${it.vehicleTarget}${it.vehicleIntakeId ? " (entrada)" : ""}</div>
          <div>Entrada: ${entradaTxt} | Venta: ${fmtMoney(it.salePrice)}</div>
          <div>Stock: <b>${it.stock}</b> | Original: ${it.original ? "SI" : "No"}</div>
        </div>
        <div class="actions">
          <button class="secondary" data-edit="${it._id}">Editar</button>
          <button class="danger" data-del="${it._id}">Eliminar</button>
          <button class="secondary" data-qr-dl="${it._id}">Descargar QR</button>
          <button class="secondary" data-qr="${it._id}">Expandir codigo QR</button>
          <button class="secondary" data-stock-in="${it._id}">Agregar stock</button>
          <button class="secondary" data-mp="${it._id}">Marketplace</button>
        </div>`;

      div.querySelector(`input[type="checkbox"][data-id]`).onchange = (e) => toggleSelected(it, e.target.checked);

      const imgQr = div.querySelector(`#qr-${it._id}`);
      if (imgQr) setImgWithQrBlob(imgQr, it._id, 180);

      div.querySelector("[data-edit]").onclick = () => openEditItem(it);
      div.querySelector("[data-del]").onclick = async () => {
        if (!confirm("¿Eliminar ítem? (stock debe ser 0)")) return;
        try {
          await invAPI.deleteItem(it._id);
          state.selected.delete(cacheKey);
          state.itemCache.delete(cacheKey);
          refreshItems(state.lastItemsParams);
          updateSelectionBar();
        } catch (e) {
          alert("Error: " + e.message);
        }
      };
      div.querySelector("[data-qr]").onclick = () => openQrModal(it, companyId);
      div.querySelector("[data-qr-dl]").onclick = () => downloadQrPng(it._id, 720, `QR_${it.sku || it._id}.png`);
  div.querySelector("[data-stock-in]").onclick = () => openStockInModal(it);
    div.querySelector("[data-mp]").onclick = () => openMarketplaceHelper(it);

      div.addEventListener("click", (e) => {
        const el = e.target.closest(".item-thumb");
        if (!el || el.id === `qr-${it._id}`) return;
        const url = el.dataset.full || el.currentSrc || el.src;
        const type = el.dataset.type || "image";
        openLightbox({ url, mimetype: type === "video" ? "video/*" : "image/*" });
      });

      itemsList.appendChild(div);
    });

    renderPaginationControls();

    updateSelectionBar();
  }

  function renderPaginationControls() {
    const top = document.getElementById('itemsPaginationTop');
    const bottom = document.getElementById('itemsPaginationBottom');
    if (!top || !bottom) return;
    const { page, pages, total, limit } = state.paging || { page: 1, pages: 1, total: 0, limit: 10 };
    const start = total ? (Math.min((page - 1) * limit + 1, total)) : 0;
    const end = Math.min(page * limit, total);
    const info = total ? `Mostrando ${start}-${end} de ${total}` : 'Sin resultados';

    const disabledPrev = page <= 1 ? 'disabled' : '';
    const disabledNext = page >= pages ? 'disabled' : '';

    const build = () => `
      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;">
        <button id="inv-prev" class="secondary" ${disabledPrev}>◀ Anterior</button>
        <span class="muted">Página ${page} de ${pages} — ${info}</span>
        <button id="inv-next" class="secondary" ${disabledNext}>Siguiente ▶</button>
        <span class="muted" style="margin-left:8px;">Por página:</span>
        <select id="inv-limit" class="secondary">
          ${[10,20,40,80].map(n=>`<option value="${n}" ${n===limit?'selected':''}>${n}</option>`).join('')}
        </select>
      </div>`;

  // Ensure top pager is below filters/stickerBar
  top.innerHTML = build();
  // Ensure bottom pager is strictly below the list and also below selection tools
  bottom.innerHTML = build();

    const bind = (root) => {
      const prevBtn = root.querySelector('#inv-prev');
      const nextBtn = root.querySelector('#inv-next');
      const limitSel = root.querySelector('#inv-limit');
      if (prevBtn) prevBtn.onclick = () => gotoPage(page - 1);
      if (nextBtn) nextBtn.onclick = () => gotoPage(page + 1);
      if (limitSel) limitSel.onchange = () => setLimit(parseInt(limitSel.value,10));
    };
    bind(top);
    bind(bottom);
  }

  function gotoPage(p) {
    const { pages } = state.paging || { pages: 1 };
    const page = Math.max(1, Math.min(p, pages));
    const limit = state.paging?.limit || 10;
    const params = { ...state.lastItemsParams, page, limit };
    refreshItems(params);
  }

  function setLimit(n) {
    const limit = Math.max(1, Math.min(n || 10, 100));
    const params = { ...state.lastItemsParams, page: 1, limit };
    refreshItems(params);
  }
  // ---- Agregar Stock ----
  function openStockInModal(it){
    const optionsIntakes = [
      `<option value="">(sin entrada)</option>`,
      ...state.intakes.map(v=>`<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
    ].join('');
    invOpenModal(`
      <h3>Agregar stock a ${it.name || it.sku || it._id}</h3>
      <label>Cantidad</label><input id="stk-qty" type="number" min="1" step="1" value="1"/>
      <label>Anclar a procedencia (opcional)</label><select id="stk-intake">${optionsIntakes}</select>
      <label>Nota (opcional)</label><input id="stk-note" placeholder="ej: reposición, compra, etc."/>
      <div style="margin-top:10px;display:flex;gap:8px;">
        <button id="stk-save">Agregar</button>
        <button id="stk-cancel" class="secondary">Cancelar</button>
      </div>
    `);
    document.getElementById('stk-cancel').onclick = invCloseModal;
    document.getElementById('stk-save').onclick = async () => {
      const qty = parseInt(document.getElementById('stk-qty').value||'0',10);
      if (!Number.isFinite(qty) || qty<=0) return alert('Cantidad inválida');
      const vehicleIntakeId = document.getElementById('stk-intake').value || undefined;
      const note = document.getElementById('stk-note').value || '';
      try{
        await request(`/api/v1/inventory/items/${it._id}/stock-in`, { method: 'POST', json: { qty, vehicleIntakeId, note } });
        invCloseModal();
        await refreshItems(state.lastItemsParams);
        showToast('Stock agregado');
      }catch(e){ alert('No se pudo agregar stock: '+e.message); }
    };
  }

  function showToast(msg){
    const n = document.createElement('div');
    n.className='notification success show';
    n.textContent=msg||'OK';
    document.body.appendChild(n);
    setTimeout(()=>{ n.classList.remove('show'); setTimeout(()=>n.remove(), 300); }, 1700);
  }

  // ---- Agregar Stock MASIVO ----
  function openBulkStockInModal(){
    const selected = Array.from(state.selected);
    if (!selected.length) return alert('No hay ítems seleccionados.');
    // Recolectar datos básicos para mostrar resumen
    const items = selected.map(id => state.itemCache.get(id)).filter(Boolean);
    const optionsIntakes = [
      `<option value="">(sin entrada)</option>`,
      ...state.intakes.map(v=>`<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
    ].join('');
    const rows = items.map(it => `
      <div class="row" style="align-items:center;gap:10px;">
        <div style="flex:1;min-width:240px;">
          <div style="font-weight:600;">${(it?.sku||'')}</div>
          <div class="muted" style="font-size:12px;">${(it?.name||'')}</div>
        </div>
        <div>
          <input type="number" class="bstk-qty" data-id="${it?._id}" min="0" step="1" value="1" style="width:96px;"/>
        </div>
      </div>
    `).join('');

    invOpenModal(`
      <h3>Agregar stock (masivo)</h3>
      <div class="muted" style="font-size:12px;">Ítems seleccionados: ${items.length}. Coloca una cantidad por ítem (0 para omitir).</div>
      <div class="card" style="margin:8px 0;padding:8px;">
        <div class="row" style="align-items:center;gap:8px;">
          <span class="muted" style="font-size:12px;">Cantidad para todos</span>
          <input id="bstk-all" type="number" min="0" step="1" value="1" style="width:96px;"/>
          <button id="bstk-apply-all" class="secondary">Aplicar a todos</button>
        </div>
      </div>
      <div style="max-height:240px;overflow:auto;margin:6px 0 10px 0;display:flex;flex-direction:column;gap:8px;">${rows}</div>
      <label>Anclar a procedencia (opcional)</label>
      <select id="bstk-intake">${optionsIntakes}</select>
      <label>Nota (opcional)</label>
      <input id="bstk-note" placeholder="ej: reposición, compra, etc."/>
      <div style="margin-top:10px;display:flex;gap:8px;">
        <button id="bstk-save">Agregar</button>
        <button id="bstk-cancel" class="secondary">Cancelar</button>
      </div>
    `);
    document.getElementById('bstk-cancel').onclick = invCloseModal;
    const applyAllBtn = document.getElementById('bstk-apply-all');
    if (applyAllBtn) {
      applyAllBtn.onclick = () => {
        const v = parseInt(document.getElementById('bstk-all').value||'0',10);
        Array.from(document.querySelectorAll('.bstk-qty')).forEach(input => { input.value = String(Math.max(0, Number.isFinite(v)? v : 0)); });
      };
    }
    document.getElementById('bstk-save').onclick = async () => {
      const vehicleIntakeId = document.getElementById('bstk-intake').value || undefined;
      const note = document.getElementById('bstk-note').value || '';
      try{
        // Construir payload por ítem (qty > 0)
        const itemsPayload = Array.from(document.querySelectorAll('.bstk-qty'))
          .map(input => ({ id: String(input.dataset.id), qty: parseInt(input.value||'0',10) }))
          .filter(row => Number.isFinite(row.qty) && row.qty > 0);
        if (!itemsPayload.length) return alert('Indica cantidades (>0) para al menos un ítem.');
        if (itemsPayload.length > 500) return alert('Máximo 500 ítems por lote.');
        showBusy('Agregando stock (masivo)...');
        await request('/api/v1/inventory/items/stock-in/bulk', { method: 'POST', json: { items: itemsPayload, vehicleIntakeId, note } });
        invCloseModal(); hideBusy();
        await refreshItems(state.lastItemsParams);
        showToast('Stock agregado (masivo)');
      }catch(e){ hideBusy(); alert('No se pudo agregar stock masivo: '+e.message); }
    };
  }

  // ---- Crear entrada ----
  viSave.onclick = async () => {
    const isPurchase = viKindPurchase?.checked;
    const body = { intakeKind: isPurchase ? "purchase" : "vehicle" };

    if (isPurchase) {
      if (!viPPlace.value.trim()) return alert("Indica el lugar de compra");
      body.purchasePlace = viPPlace.value.trim();
      body.intakeDate = viPDate.value || undefined;
      body.entryPrice = viPPrice.value ? parseFloat(viPPrice.value) : undefined;
    } else {
      if (!viBrand.value.trim() || !viModel.value.trim() || !viEngine.value.trim())
        return alert("Completa Marca / Modelo / Cilindraje");

      body.brand = viBrand.value.trim();
      body.model = viModel.value.trim();
      body.engine = viEngine.value.trim();
      body.intakeDate = viDate.value || undefined;
      body.entryPrice = viPrice.value ? parseFloat(viPrice.value) : undefined;
    }

    await invAPI.saveVehicleIntake(body);

    [viBrand, viModel, viEngine, viDate, viPrice, viPPlace, viPDate, viPPrice].forEach((el) => {
      if (el) el.value = "";
    });

    if (viKindVehicle) {
      viKindVehicle.checked = true;
      updateIntakeKindUI();
    }

    await refreshIntakes();
    alert("Ingreso creado");
  };

  // ---- Autorelleno de destino al cambiar procedencia ----
  itVehicleIntakeId.addEventListener("change", () => {
    const id = itVehicleIntakeId.value;
    if (!id) {
      itVehicleTarget.value = "GENERAL";
      itVehicleTarget.readOnly = false;
      return;
    }
    const vi = state.intakes.find((v) => v._id === id);
    if (vi) {
      itVehicleTarget.value = makeIntakeLabel(vi);
      itVehicleTarget.readOnly = true;
    } else {
      itVehicleTarget.readOnly = false;
    }
  });

  // ---- Guardar ítem ----
  itSave.onclick = async () => {
    let vehicleTargetValue = (itVehicleTarget.value || "").trim();
    const selectedIntakeId = itVehicleIntakeId.value || undefined;

    if (selectedIntakeId && (!vehicleTargetValue || vehicleTargetValue === "GENERAL")) {
      const vi = state.intakes.find((v) => v._id === selectedIntakeId);
      if (vi) vehicleTargetValue = makeIntakeLabel(vi);
    }
    if (!vehicleTargetValue) vehicleTargetValue = "GENERAL";

    let images = [];
    if (itFiles && itFiles.files && itFiles.files.length > 0) {
      const up = await invAPI.mediaUpload(itFiles.files);
      images = (up && up.files) ? up.files : [];
    }

    const body = {
      sku: itSku.value.trim(),
      name: itName.value.trim(),
      internalName: itInternal ? itInternal.value.trim() : undefined,
      brand: itBrand ? itBrand.value.trim() : undefined,
      location: itLocation ? itLocation.value.trim() : undefined,
      vehicleTarget: vehicleTargetValue,
      vehicleIntakeId: selectedIntakeId,
      entryPrice: itEntryPrice.value ? parseFloat(itEntryPrice.value) : undefined,
      salePrice: parseFloat(itSalePrice.value || "0"),
      original: itOriginal.value === "true",
      stock: parseInt(itStock.value || "0", 10),
      images,
    };

    // minStock opcional
    const msRaw = itMinStock?.value;
    if (msRaw !== undefined && msRaw !== null && String(msRaw).trim() !== "") {
      const ms = parseInt(msRaw, 10);
      if (Number.isFinite(ms) && ms >= 0) body.minStock = ms;
    }

    if (!body.sku || !body.name || !body.salePrice) return alert("Completa SKU, nombre y precio de venta");

    await invAPI.saveItem(body);

    // Reset form
    itSku.value = "";
    itName.value = "";
    if (itInternal) itInternal.value = "";
  if (itBrand) itBrand.value = "";
    if (itLocation) itLocation.value = "";
    itVehicleTarget.value = "GENERAL";
    itVehicleIntakeId.value = "";
    itEntryPrice.value = "";
    itSalePrice.value = "";
    itOriginal.value = "false";
  itStock.value = "";
  if (itMinStock) itMinStock.value = "";
    if (itFiles) itFiles.value = "";
    itVehicleTarget.readOnly = false;

    await refreshItems({});
  };

  // ---- Filtros ----
  function doSearch() {
    const params = {
      name: qName.value.trim(),
      sku: qSku.value.trim(),
      brand: qBrand ? qBrand.value.trim() : undefined,
      vehicleIntakeId: qIntake.value || undefined,
    };
    // When searching, start from first page and keep current limit
    refreshItems({ ...params, page: 1, limit: state.paging?.limit || 10 });
  }

  qApply.onclick = doSearch;
  qClear.onclick = () => {
    qName.value = "";
    qSku.value = "";
    if (qBrand) qBrand.value = "";
    qIntake.value = "";
    refreshItems({ page: 1, limit: state.paging?.limit || 10 });
  };
  [qName, qSku, qBrand].forEach((el) => el && el.addEventListener("keydown", (e) => e.key === "Enter" && doSearch()));
  qIntake && qIntake.addEventListener("change", doSearch);

  // ---- Editar Ingreso ----
  function openEditVehicleIntake(vi) {
    const d = new Date(vi.intakeDate);
    const ymd = isFinite(d) ? d.toISOString().slice(0, 10) : "";

    invOpenModal(`
      <h3>Editar entrada</h3>
      <label>Tipo</label>
      <select id="e-vi-kind">
        <option value="vehicle" ${vi.intakeKind === "vehicle" ? "selected" : ""}>Vehículo</option>
        <option value="purchase" ${vi.intakeKind === "purchase" ? "selected" : ""}>Compra</option>
      </select>

      <div id="e-vi-box-vehicle" class="${vi.intakeKind === "purchase" ? "hidden" : ""}">
        <label>Marca</label><input id="e-vi-brand" value="${(vi.brand || "").toUpperCase()}"/>
        <label>Modelo</label><input id="e-vi-model" value="${(vi.model || "").toUpperCase()}"/>
        <label>Cilindraje</label><input id="e-vi-engine" value="${(vi.engine || "").toUpperCase()}"/>
      </div>

      <div id="e-vi-box-purchase" class="${vi.intakeKind === "vehicle" ? "hidden" : ""}">
        <label>Lugar de compra</label><input id="e-vi-place" value="${(vi.purchasePlace || "").toUpperCase()}"/>
      </div>

      <label>Fecha</label><input id="e-vi-date" type="date" value="${ymd}"/>
      <label>Precio de entrada</label><input id="e-vi-price" type="number" step="0.01" min="0" value="${Number(vi.entryPrice || 0)}"/>

      <div style="margin-top:10px;display:flex;gap:8px;">
        <button id="e-vi-save">Guardar cambios</button>
        <button id="e-vi-cancel" class="secondary">Cancelar</button>
      </div>
    `);

    const kind = document.getElementById("e-vi-kind");
    const boxV = document.getElementById("e-vi-box-vehicle");
    const boxP = document.getElementById("e-vi-box-purchase");
    const b = document.getElementById("e-vi-brand");
    const m = document.getElementById("e-vi-model");
    const e = document.getElementById("e-vi-engine");
    const place = document.getElementById("e-vi-place");
    const dt = document.getElementById("e-vi-date");
    const pr = document.getElementById("e-vi-price");
    const save = document.getElementById("e-vi-save");
    const cancel = document.getElementById("e-vi-cancel");

    upper(b); upper(m); upper(e); upper(place);

    kind.onchange = () => {
      const isP = kind.value === "purchase";
      boxP.classList.toggle("hidden", !isP);
      boxV.classList.toggle("hidden", isP);
    };

    cancel.onclick = invCloseModal;

    save.onclick = async () => {
      try {
        const payload = {
          intakeKind: kind.value,
          intakeDate: dt.value || undefined,
          entryPrice: parseFloat(pr.value || "0"),
        };
        if (kind.value === "purchase") {
          payload.purchasePlace = (place.value || "").toUpperCase().trim();
        } else {
          payload.brand = (b.value || "").toUpperCase().trim();
          payload.model = (m.value || "").toUpperCase().trim();
          payload.engine = (e.value || "").toUpperCase().trim();
        }
        await invAPI.updateVehicleIntake(vi._id, payload);
        invCloseModal();
        await refreshIntakes();
        await refreshItems(state.lastItemsParams);
      } catch (err) {
        alert("Error: " + err.message);
      }
    };
  }

  // ---- Editar Ítem ----
  function openEditItem(it) {
    const optionsIntakes = [
      `<option value="">(sin entrada)</option>`,
      ...state.intakes.map(
        (v) =>
          `<option value="${v._id}" ${String(it.vehicleIntakeId || "") === String(v._id) ? "selected" : ""}>
            ${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}
          </option>`
      ),
    ].join("");

    const images = Array.isArray(it.images) ? [...it.images] : [];

    invOpenModal(`
      <h3>Editar ítem</h3>
      <label>SKU</label><input id="e-it-sku" value="${it.sku || ""}"/>
      <label>Nombre</label><input id="e-it-name" value="${it.name || ""}"/>
      <label>Nombre interno</label><input id="e-it-internal" value="${it.internalName || ''}"/>
  <label>Marca</label><input id="e-it-brand" value="${it.brand || ''}"/>
      <label>Ubicación</label><input id="e-it-location" value="${it.location || ''}"/>
      <label>Entrada</label><select id="e-it-intake">${optionsIntakes}</select>
      <label>Destino</label><input id="e-it-target" value="${it.vehicleTarget || "GENERAL"}"/>
      <label>Precio entrada (opcional)</label><input id="e-it-entry" type="number" step="0.01" placeholder="vacío = AUTO si hay entrada" value="${it.entryPrice ?? ""}"/>
      <label>Precio venta</label><input id="e-it-sale" type="number" step="0.01" min="0" value="${Number(it.salePrice || 0)}"/>
      <label>Original</label>
      <select id="e-it-original">
        <option value="false" ${!it.original ? "selected" : ""}>No</option>
        <option value="true" ${it.original ? "selected" : ""}>Sí</option>
      </select>
      <label>Stock</label><input id="e-it-stock" type="number" step="1" min="0" value="${parseInt(it.stock || 0, 10)}"/>
  <label>Stock mínimo (opcional)</label><input id="e-it-min" type="number" step="1" min="0" placeholder="0 = sin alerta" value="${Number.isFinite(parseInt(it.minStock||0,10))? parseInt(it.minStock||0,10): ''}"/>

      <label>Imágenes/Videos</label>
      <div id="e-it-thumbs" class="thumbs"></div>
      <input id="e-it-files" type="file" multiple/>
      <div class="viewer" id="e-it-viewer" style="display:none"></div>

      <div style="margin-top:10px;display:flex;gap:8px;">
        <button id="e-it-save">Guardar cambios</button>
        <button id="e-it-cancel" class="secondary">Cancelar</button>
      </div>
    `);

    const sku = document.getElementById("e-it-sku");
    const name = document.getElementById("e-it-name");
    const intake = document.getElementById("e-it-intake");
    const target = document.getElementById("e-it-target");
    const entry = document.getElementById("e-it-entry");
    const sale = document.getElementById("e-it-sale");
    const original = document.getElementById("e-it-original");
    const stock = document.getElementById("e-it-stock");
    const files = document.getElementById("e-it-files");
  const minInput = document.getElementById("e-it-min");
    const eBrand = document.getElementById("e-it-brand");
    const thumbs = document.getElementById("e-it-thumbs");
    const viewer = document.getElementById("e-it-viewer");
    const save = document.getElementById("e-it-save");
    const cancel = document.getElementById("e-it-cancel");

    // Track ongoing uploads to prevent saving while media is uploading
    let pendingUploads = 0;
    const setSaveLoading = (loading) => {
      if (!save) return;
      if (loading) {
        save.disabled = true;
        save.dataset.loading = '1';
        if (!save.dataset._label) save.dataset._label = save.textContent || 'Guardar cambios';
        save.textContent = 'Subiendo imágenes...';
      } else {
        delete save.dataset.loading;
        save.disabled = false;
        save.textContent = save.dataset._label || 'Guardar cambios';
      }
    };

    function renderThumbs() {
      thumbs.innerHTML = "";
      images.forEach((m, idx) => {
        const label = document.createElement("span");
        label.className = "thumb-label";
        label.textContent = `Imagen ${idx + 1}`;
        label.style.marginRight = "8px";

        const previewBtn = document.createElement("button");
  previewBtn.className = "preview-btn thumb-icon-btn";
  previewBtn.title = "Vista previa";
  previewBtn.innerHTML = `<svg width='18' height='18' viewBox='0 0 20 20' fill='none'><path d='M1 10C3.5 5.5 8 3 12 5.5C16 8 18.5 13 17 15C15.5 17 10.5 17 7 15C3.5 13 1 10 1 10Z' stroke='#2563eb' stroke-width='2' fill='none'/><circle cx='10' cy='10' r='3' fill='#2563eb'/></svg>`;
        previewBtn.onclick = (ev) => {
          const isVideo = m.mimetype?.startsWith('video/');
          invOpenOverlay(
            `<div class='viewer-modal'>`+
            (isVideo
              ? `<video controls src='${m.url}' style='max-width:90vw;max-height:80vh;object-fit:contain;'></video>`
              : `<img src='${m.url}' alt='media' style='max-width:90vw;max-height:80vh;object-fit:contain;'/>`)
            + `</div>`
          );
        };

        const delBtn = document.createElement("button");
        delBtn.className = "del thumb-icon-btn";
        delBtn.title = "Quitar";
        delBtn.innerHTML = `<svg width='18' height='18' viewBox='0 0 20 20' fill='none'><circle cx='10' cy='10' r='9' stroke='#ef4444' stroke-width='2'/><line x1='6' y1='6' x2='14' y2='14' stroke='#ef4444' stroke-width='2'/><line x1='14' y1='6' x2='6' y2='14' stroke='#ef4444' stroke-width='2'/></svg>`;
        delBtn.setAttribute("data-del", idx);
        delBtn.onclick = () => {
          images.splice(idx, 1);
          renderThumbs();
          if (viewer.style.display !== "none") viewer.innerHTML = "";
        };

        const btnWrap = document.createElement("div");
        btnWrap.className = "thumb-btn-wrap";
        btnWrap.style.display = "flex";
  btnWrap.style.alignItems = "baseline";
        btnWrap.style.gap = "6px";
        btnWrap.style.margin = "10px 0";
        btnWrap.appendChild(label);
        btnWrap.appendChild(previewBtn);
        btnWrap.appendChild(delBtn);
        thumbs.appendChild(btnWrap);
      });
    }
    renderThumbs();

    intake.addEventListener("change", () => {
      const id = intake.value;
      if (!id) {
        target.readOnly = false;
        return;
      }
      const vi = state.intakes.find((v) => v._id === id);
      if (vi) {
        target.value = makeIntakeLabel(vi);
        target.readOnly = true;
      } else {
        target.readOnly = false;
      }
    });

    files.addEventListener("change", async () => {
      if (!files.files?.length) return;
      try {
        pendingUploads++;
        setSaveLoading(true);
        const up = await invAPI.mediaUpload(files.files);
        const list = (up && up.files) ? up.files : [];
        images.push(...list);
        files.value = "";
        renderThumbs();
      } catch (e) {
        alert("No se pudieron subir los archivos: " + e.message);
      } finally {
        pendingUploads = Math.max(0, pendingUploads - 1);
        if (pendingUploads === 0) setSaveLoading(false);
      }
    });

    cancel.onclick = invCloseModal;

    save.onclick = async () => {
      if (save?.dataset.loading === '1' || pendingUploads > 0) {
        alert('Espera a que termine la subida de imágenes antes de guardar.');
        return;
      }
      try {
        const body = {
          sku: (sku.value || "").trim().toUpperCase(),
          name: (name.value || "").trim().toUpperCase(),
          internalName: (document.getElementById('e-it-internal')?.value||'').trim().toUpperCase(),
          brand: (eBrand?.value||'').trim().toUpperCase(),
          location: (document.getElementById('e-it-location')?.value||'').trim().toUpperCase(),
          vehicleIntakeId: intake.value || null,
          vehicleTarget: (target.value || "GENERAL").trim().toUpperCase(),
          entryPrice: entry.value === "" ? "" : parseFloat(entry.value),
          salePrice: parseFloat(sale.value || "0"),
          original: original.value === "true",
          stock: parseInt(stock.value || "0", 10),
          images,
        };
        // minStock opcional
        const msRaw = minInput?.value;
        if (msRaw !== undefined && msRaw !== null && String(msRaw).trim() !== "") {
          const ms = parseInt(msRaw, 10);
          if (Number.isFinite(ms) && ms >= 0) body.minStock = ms;
        }
        await invAPI.updateItem(it._id, body);
        invCloseModal();
        await refreshIntakes();
        await refreshItems(state.lastItemsParams);
      } catch (err) {
        alert("Error: " + err.message);
      }
    };
  }

  // ---- Stickers ----

  function buildMarketplaceTitle(it){
    const brand = (it.brand||'').toString().trim();
    const name = (it.name||'').toString().trim();
    const sku = (it.sku||'').toString().trim();
    return `${brand? brand+ ' ' : ''}${name}${sku? ' • '+sku: ''}`.trim();
  }

  function buildMarketplaceDescription(it){
    const lines = [];
    const brand = it.brand ? `Marca: ${it.brand}` : '';
    if (brand) lines.push(brand);
    lines.push(`Precio: ${fmtMoney(it.salePrice||0)}`);
    lines.push(`Stock: ${Number(it.stock||0)}`);
    // Estado solicitado por el cliente
    lines.push('Estado: Original - Usado en perfecto estado.');
    lines.push('Entrega inmediata.');

    // Llamado claro para nuestra audiencia (mecánicos y dueños de vehículo)
    lines.push('Compatibilidad garantizada: te asesoramos para que compres el repuesto correcto.');

    // Mensaje de negociación
    lines.push('Precios negociables — estamos abiertos a llegar a un buen acuerdo.');

    // Contacto (placeholder editable en el modal antes de copiar)
    lines.push('WhatsApp: xxxx');

    // Link al catálogo público
    try{
      const base = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';
      const cid  = (typeof API !== 'undefined' && API.companyId?.get) ? (API.companyId.get() || '') : '';
      const u = new URL('catalogo.html', base);
      if (cid) u.searchParams.set('companyId', cid);
      lines.push('Catálogo completo 👉 ' + u.toString());
    }catch{}

    // Cierre con CTA
    lines.push('¿Tienes taller? ¿Eres mecánico? Escríbenos y te atendemos al instante.');
    return lines.filter(Boolean).join('\n');
  }

  // ---- Import Excel (amigable) ----
  (function bindImportExcel(){
    const btnTpl = document.getElementById('btn-download-template');
    const btnImp = document.getElementById('btn-import-excel');
    const fileEl = document.getElementById('excel-file');
    const statusEl = document.getElementById('import-status');
    if(!btnTpl || !btnImp || !fileEl || !statusEl) return;
    btnTpl.onclick = async ()=>{
      try{ btnTpl.disabled=true; await invAPI.downloadImportTemplate(); }
      catch(e){ alert(e.message); }
      finally{ btnTpl.disabled=false; }
    };
    btnImp.onclick = async ()=>{
      const f = fileEl.files?.[0];
      if(!f) { alert('Selecciona un archivo .xlsx'); return; }
      statusEl.textContent = 'Subiendo y procesando...';
      btnImp.disabled = true;
      try{
        const resp = await invAPI.importExcel(f);
        const s = resp?.summary || {};
        const errs = Array.isArray(s.errors)? s.errors: [];
        const lines = [
          'Importación terminada:',
          `• Creados: ${s.created||0}`,
          `• Actualizados: ${s.updated||0}`,
          `• Saltados (sin SKU/Nombre): ${s.skipped||0}`
        ];
        if(errs.length){
          lines.push('', 'Errores:');
          errs.slice(0,20).forEach(e=> lines.push(`- ${e.sku||'?'}: ${e.error||'Error'}`));
          if(errs.length>20) lines.push(`...y ${errs.length-20} más`);
        }
        statusEl.textContent = lines.join('\n');
        // refrescar lista
        await refreshItems(state.lastItemsParams);
      }catch(e){ statusEl.textContent = 'Error: ' + e.message; }
      finally{ btnImp.disabled=false; }
    };
  })();

  function downloadUrl(url, filename){
    const a = document.createElement('a');
    a.href = url; a.download = filename || '';
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function downloadAllImagesZip(item){
    try{
      const JSZip = await ensureJSZip();
      const zip = new JSZip();
      const media = Array.isArray(item.images) ? item.images : [];
      if (!media.length) throw new Error('Este ítem no tiene imágenes');
      const folder = zip.folder(`${item.sku||'ITEM'}_${(item.name||'').replace(/[^A-Za-z0-9_-]+/g,'_')}`) || zip;
      // Descargar como blobs y agregar al zip
      for (let i=0; i<media.length; i++){
        const m = media[i];
        const res = await fetch(m.url);
        if (!res.ok) throw new Error('Error descargando imagen');
        const blob = await res.blob();
        const ext = (m.mimetype||'image/jpeg').split('/')[1]||'jpg';
        const fname = `${String(i+1).padStart(2,'0')}.${ext}`;
        folder.file(fname, blob);
      }
      const content = await zip.generateAsync({type:'blob'});
      const fn = `${(item.sku||'ITEM')}_IMAGENES.zip`;
      const url = URL.createObjectURL(content);
      downloadUrl(url, fn);
      setTimeout(()=>URL.revokeObjectURL(url), 2000);
    }catch(e){ alert(e?.message||'No se pudo crear el ZIP'); }
  }

  function openMarketplaceHelper(item){
    const media = Array.isArray(item.images) ? item.images : [];
    const titleDefault = buildMarketplaceTitle(item);
    const descDefault  = buildMarketplaceDescription(item);
    const priceValue = Number(item.salePrice||0);
    const thumbs = media.map((m,i)=>`<div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
        ${(m.mimetype||'').startsWith('video/') ? `<video src="${m.url}" style="max-width:160px;max-height:120px;object-fit:contain;" muted></video>` : `<img src="${m.url}" style="max-width:160px;max-height:120px;object-fit:contain;"/>`}
        <button class="secondary" data-dl-index="${i}">Descargar</button>
      </div>`).join('') || '<div class="muted">Sin imágenes.</div>';

    invOpenModal(`
      <h3>Publicación Marketplace</h3>
      <div class="grid-2" style="gap:12px;">
        <div>
          <label>Título</label>
          <input id="mp-title" value="${titleDefault}" />
          <div class="row" style="gap:6px;margin:6px 0 12px 0;">
            <button class="secondary" id="mp-copy-title">Copiar título</button>
          </div>

          <label>Precio</label>
          <input id="mp-price" type="number" min="0" step="1" value="${Math.round(priceValue)}" />
          <div class="row" style="gap:6px;margin:6px 0 12px 0;">
            <button class="secondary" id="mp-copy-price">Copiar precio</button>
          </div>

          <label>Descripción</label>
          <textarea id="mp-desc" style="min-height:180px;white-space:pre-wrap;">${descDefault}</textarea>
          <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap;">
            <button class="secondary" id="mp-copy-desc">Copiar descripción</button>
            <button id="mp-copy-all">Copiar todo</button>
          </div>
          <div class="muted" style="font-size:12px;margin-top:6px;">Consejo: en Marketplace selecciona la categoría y estado (Nuevo/Usado) manualmente.</div>
        </div>
        <div>
          <h4>Imágenes</h4>
          <div id="mp-thumbs">${thumbs}</div>
          <div class="row" style="gap:6px;margin-top:8px;">
            <button class="secondary" id="mp-dl-first">Descargar principal</button>
            <button class="secondary" id="mp-dl-all">Descargar todas (ZIP)</button>
          </div>
        </div>
      </div>
    `);

    const titleEl = document.getElementById('mp-title');
    const priceEl = document.getElementById('mp-price');
    const descEl  = document.getElementById('mp-desc');
    document.getElementById('mp-copy-title').onclick = async ()=>{ try{ await navigator.clipboard.writeText(titleEl.value||''); }catch{ alert('No se pudo copiar'); } };
    document.getElementById('mp-copy-price').onclick = async ()=>{ try{ await navigator.clipboard.writeText(String(Math.round(Number(priceEl.value||0)))) }catch{ alert('No se pudo copiar'); } };
    document.getElementById('mp-copy-desc').onclick  = async ()=>{ try{ await navigator.clipboard.writeText(descEl.value||''); }catch{ alert('No se pudo copiar'); } };
    document.getElementById('mp-copy-all').onclick   = async ()=>{
      const txt = `${titleEl.value||''}\n\n$ ${Math.round(Number(priceEl.value||0))}\n\n${descEl.value||''}`;
      try{ await navigator.clipboard.writeText(txt); }catch{ alert('No se pudo copiar'); }
    };

    // Descargar primera imagen
    document.getElementById('mp-dl-first').onclick = ()=>{
      const m = media[0]; if(!m){ alert('No hay imágenes'); return; }
      const ext = (m.mimetype||'image/jpeg').split('/')[1]||'jpg';
      downloadUrl(m.url, `${(item.sku||'ITEM')}_1.${ext}`);
    };
    // Descargar todas como ZIP
    document.getElementById('mp-dl-all').onclick = ()=> downloadAllImagesZip(item);

    // Descargar individuales en la lista
    document.querySelectorAll('#mp-thumbs [data-dl-index]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const idx = parseInt(btn.getAttribute('data-dl-index'),10);
        const m = media[idx]; if(!m) return;
        const ext = (m.mimetype||'image/jpeg').split('/')[1]||'jpg';
        downloadUrl(m.url, `${(item.sku||'ITEM')}_${String(idx+1).padStart(2,'0')}.${ext}`);
      });
    });
  }
  async function generateStickersFromSelection(variant = 'qr') {
    if (!state.selected.size) return;
    const ids = Array.from(state.selected);
    const items = ids
      .map((id) => state.itemCache.get(String(id)))
      .filter(Boolean);
    if (!items.length) {
      alert("No se encontraron datos para los items seleccionados. Vuelve a mostrarlos en la lista antes de generar los stickers.");
      return;
    }
    if (items.length !== ids.length) {
      alert("Algunos items seleccionados no se pudieron cargar. Verificalos en la lista antes de generar los stickers.");
    }

    invOpenModal(
      `<h3>Generar stickers</h3>
       <p class="muted">Ajusta cuántos stickers imprimir por ítem (por defecto = stock actual).</p>
       <div class="table-wrap small">
         <table class="table">
           <thead>
             <tr><th>SKU</th><th>Nombre</th><th class="t-center">Stock</th><th class="t-center">Imprimir</th></tr>
           </thead>
           <tbody id="stk-rows"></tbody>
         </table>
       </div>
       <div class="row right" style="gap:8px;">
         <button class="secondary" id="stk-fill-stock">Usar stock</button>
         <button class="secondary" id="stk-clear">Poner 0</button>
         <button id="stk-generate">Generar PDF</button>
       </div>`
    );

    const rows = document.getElementById("stk-rows");
    rows.innerHTML = items
      .map(
        (it) => `
        <tr data-id="${it._id}">
          <td>${it.sku || ""}</td>
          <td>${it.name || ""}</td>
          <td class="t-center">${it.stock ?? 0}</td>
          <td class="t-center"><input type="number" min="0" step="1" value="${parseInt(it.stock || 0, 10)}" class="qty" style="width:90px"/></td>
        </tr>`
      )
      .join("");

    document.getElementById("stk-fill-stock").onclick = () => {
      rows.querySelectorAll("tr").forEach((tr) => {
        const id = tr.dataset.id;
        const it = items.find((x) => String(x._id) === String(id));
        tr.querySelector(".qty").value = parseInt(it?.stock || 0, 10);
      });
    };

    document.getElementById("stk-clear").onclick = () => {
      rows.querySelectorAll(".qty").forEach((inp) => (inp.value = 0));
    };

    document.getElementById("stk-generate").onclick = async () => {
      showBusy('Generando PDF de stickers...');
      const list = [];
      rows.querySelectorAll("tr").forEach((tr) => {
        const id = tr.dataset.id;
        const count = parseInt(tr.querySelector(".qty").value || "0", 10);
        const it = items.find((x) => String(x._id) === String(id));
        if (it && count > 0) list.push({ it, count });
      });
      if (!list.length) {
        hideBusy();
        alert("Coloca al menos 1 sticker.");
        return;
      }
      // Intentar usar la PLANTILLA ACTIVA del tipo seleccionado
      const type = (variant === 'brand') ? 'sticker-brand' : 'sticker-qr';
      try {
        const tpl = await API.templates.active(type);
        if (tpl && tpl.contentHtml) {
          // Construir copias por cantidad y renderizar con datos reales (sampleId)
          const tasks = [];
          list.forEach(({ it, count }) => {
            for (let i = 0; i < count; i++) {
              tasks.push(() => API.templates.preview({ type, contentHtml: tpl.contentHtml, contentCss: tpl.contentCss, sampleId: it._id }));
            }
          });

          // Ejecutar en serie para evitar saturar el backend
          const results = [];
          for (const job of tasks) {
            try {
              // eslint-disable-next-line no-await-in-loop
              const pv = await job();
              results.push(pv && (pv.rendered || ''));
            } catch (e) {
              results.push('');
            }
          }

          if (!results.length) throw new Error('No se pudieron renderizar los stickers.');

          // Generar PDF descargable (50mm x 30mm por sticker) usando html2canvas + jsPDF
          const html2canvas = await ensureHtml2Canvas();
          const jsPDF = await ensureJsPDF();

          // Asegurar que no haya selección activa ni foco que agregue bordes/handles
          try {
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
              document.activeElement.blur();
            }
            const sel = window.getSelection && window.getSelection();
            if (sel && sel.removeAllRanges) sel.removeAllRanges();
          } catch (_) {}

          const root = document.createElement('div');
          root.id = 'sticker-capture-root';
          root.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;background:#fff;z-index:-1;';
          document.body.appendChild(root);

          // Helper: wait for images to finish loading inside a container
          async function waitForImages(rootEl, timeoutMs = 3000) {
            const imgs = Array.from(rootEl.querySelectorAll('img'));
            if (!imgs.length) return;
            await Promise.all(imgs.map(img => new Promise((res) => {
              if (img.complete && img.naturalWidth > 0) return res();
              let done = false;
              const clean = () => { if (done) return; done = true; img.removeEventListener('load', onLoad); img.removeEventListener('error', onErr); clearTimeout(t); res(); };
              const onLoad = () => clean();
              const onErr = () => clean();
              const t = setTimeout(clean, timeoutMs);
              img.addEventListener('load', onLoad, { once: true });
              img.addEventListener('error', onErr, { once: true });
            })));
          }

          const images = [];
          for (const html of results) {
            // Para 'brand', el contenido puede tener 2 páginas (.editor-page[data-page="1"] y [data-page="2"]) que se deben capturar por separado
            const tmp = document.createElement('div');
            tmp.innerHTML = html || '';
            const pages = (variant === 'brand') ? Array.from(tmp.querySelectorAll('.editor-page')) : [];

            const captureSingleBox = async (contentFragment) => {
              const box = document.createElement('div');
              box.className = 'sticker-capture';
              box.style.cssText = 'width:5cm;height:3cm;overflow:hidden;background:#fff;';
              const style = document.createElement('style');
              style.textContent = `\n${(tpl.contentCss || '').toString()}\n` +
                `/* Ocultar handles y selección del editor durante el render */\n` +
                `.drag-handle,.resize-handle,.selection-box,.resizer,.handles,.ve-selected,.ce-selected,.selected{display:none!important;}\n` +
                `.sticker-capture, .sticker-capture *{outline:none!important;-webkit-tap-highlight-color:transparent!important;user-select:none!important;caret-color:transparent!important;}\n` +
                `.sticker-capture *::selection{background:transparent!important;color:inherit!important;}\n` +
                `img,svg,canvas{outline:none!important;border:none!important;-webkit-user-drag:none!important;}`;
              box.appendChild(style);
              const inner = document.createElement('div');
              if (contentFragment) {
                inner.appendChild(contentFragment);
              } else {
                inner.innerHTML = html || '';
              }
              try {
                inner.querySelectorAll('[contenteditable]')
                  .forEach(el => { el.setAttribute('contenteditable', 'false'); el.removeAttribute('contenteditable'); });
              } catch(_) {}
              box.appendChild(inner);
              root.appendChild(box);
              // Asegurarse que las imágenes (incluido el QR data:URL) estén cargadas
              try { await waitForImages(box, 4000); } catch(_) {}
              const canvas = await html2canvas(box, { scale: Math.max(2, window.devicePixelRatio || 2), backgroundColor: '#ffffff', useCORS: true, allowTaint: true, imageTimeout: 4000 });
              images.push(canvas.toDataURL('image/png'));
              root.removeChild(box);
            };

            if (pages.length >= 2) {
              // Clonar contenido de cada página y capturar en orden
              const p1 = pages.find(p => p.dataset.page === '1') || pages[0];
              const p2 = pages.find(p => p.dataset.page === '2') || pages[1];
              // Usar su contenido interno para evitar contenedor del editor
              const frag1 = document.createElement('div');
              frag1.innerHTML = p1.innerHTML;
              const frag2 = document.createElement('div');
              frag2.innerHTML = p2.innerHTML;
              // eslint-disable-next-line no-await-in-loop
              await captureSingleBox(frag1);
              // eslint-disable-next-line no-await-in-loop
              await captureSingleBox(frag2);
            } else {
              // Plantilla de 1 página (qr) o fallback si no se detectan páginas
              // eslint-disable-next-line no-await-in-loop
              await captureSingleBox(null);
            }
          }
          document.body.removeChild(root);

          if (!images.length) throw new Error('No se pudo rasterizar el contenido de los stickers');

          // Forzar orientación horizontal (5cm ancho x 3cm alto)
          const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [50, 30] });
          images.forEach((src, idx) => {
            if (idx > 0) doc.addPage([50, 30]);
            doc.addImage(src, 'PNG', 0, 0, 50, 30);
          });
          doc.save(`stickers-${variant}.pdf`);
          invCloseModal();
          hideBusy();
          return; // hecho con plantilla (PDF descargado)
        }
      } catch (e) {
        console.warn('Fallo plantilla activa; se usará el backend PDF por defecto:', e?.message || e);
      }

      // Fallback: backend PDF por variante (layout por defecto)
      const payload = [];
      list.forEach(({ it, count }) => {
        for (let i = 0; i < count; i++) payload.push({ sku: it.sku, name: it.name });
      });
      try {
        const base = API.base?.replace(/\/$/, '') || '';
        const variantPath = variant === 'brand' ? '/api/v1/media/stickers/pdf/brand' : '/api/v1/media/stickers/pdf/qr';
        const endpoint = base + variantPath;
        const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeader());
        const resp = await fetch(endpoint, { method: 'POST', headers, credentials: 'same-origin', body: JSON.stringify({ items: payload }) });
        if (!resp.ok) throw new Error('No se pudo generar PDF');
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `stickers-${variant}.pdf`; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        invCloseModal();
        hideBusy();
      } catch (err) {
        hideBusy();
        alert('Error creando stickers: ' + (err.message || err));
      }
    };
  }

  // ---- Publish management ----
  // Inject after itemsList rendering logic where each item div is built
  // Patch: enhance refreshItems to include publish toggle and public edit button
  // Find div.innerHTML assignment inside refreshItems and append new buttons
  // Added below inside refreshItems after existing action buttons creation:
  // (Non-destructive insertion)
  // PUBLISH MANAGEMENT START
  // Extend item actions with publish toggle & public edit
  // We locate after div.innerHTML build by selecting actions container
  (function(){
    const originalRefreshItems = refreshItems;
    refreshItems = async function(params={}){
      await originalRefreshItems(params);
      // After base rendering, augment each item row with publish controls
      const rows = itemsList.querySelectorAll('.note');
      rows.forEach(row => {
        const checkbox = row.querySelector('input[type="checkbox"][data-id]');
        const id = checkbox ? String(checkbox.dataset.id) : null;
        if(!id) return;
        const it = state.itemCache.get(id);
        if(!it) return;
        const actions = row.querySelector('.actions');
        if(!actions) return;
        if(!actions.querySelector(`[data-pub-toggle]`)){
          const btnToggle = document.createElement('button');
          btnToggle.className = 'secondary';
          btnToggle.setAttribute('data-pub-toggle', id);
          btnToggle.textContent = it.published ? 'Despublicar' : 'Publicar';
          actions.appendChild(btnToggle);
          btnToggle.onclick = () => openPublishToggle(it);
        }
        if(!actions.querySelector(`[data-pub-edit]`)){
          const btnEditPub = document.createElement('button');
          btnEditPub.className = 'secondary';
          btnEditPub.setAttribute('data-pub-edit', id);
          btnEditPub.textContent = 'Campos públicos';
          actions.appendChild(btnEditPub);
          btnEditPub.onclick = () => openEditPublicFields(it);
        }
      });
    };
  })();

  function openPublishToggle(it){
    invOpenModal(`<h3>${it.published ? 'Despublicar' : 'Publicar'} ítem</h3>
      <p class='muted'>${it.published ? 'Al despublicar el ítem dejará de aparecer en el catálogo público.' : 'Al publicar el ítem será visible en el catálogo público y se podrá comprar.'}</p>
      <div style='display:flex;gap:8px;justify-content:flex-end;margin-top:12px;'>
        <button id='pub-cancel' class='secondary'>Cancelar</button>
        <button id='pub-apply'>${it.published ? 'Despublicar' : 'Publicar'}</button>
      </div>`);
    const btnApply = document.getElementById('pub-apply');
    const btnCancel = document.getElementById('pub-cancel');
    btnCancel.onclick = invCloseModal;
    btnApply.onclick = async () => {
      try {
        const body = { published: !it.published };
        if(!it.published){
          body.publishedAt = new Date().toISOString();
        } else {
          body.publishedAt = null; // optional cleanup
        }
        await invAPI.updateItem(it._id, body);
        invCloseModal();
        await refreshItems(state.lastItemsParams);
      } catch(e){
        alert('Error actualizando publicación: '+ e.message);
      }
    };
  }

  function openEditPublicFields(it){
    const tagsStr = Array.isArray(it.tags)? it.tags.join(', ') : '';
    const imgs = Array.isArray(it.publicImages)? it.publicImages : [];
    invOpenModal(`<h3>Campos públicos</h3>
      <label>Precio público (opcional)</label><input id='pub-price' type='number' step='0.01' min='0' value='${Number.isFinite(it.publicPrice)? it.publicPrice : ''}' />
      <label>Categoría</label><input id='pub-category' value='${it.category||''}' />
      <label>Tags (coma)</label><input id='pub-tags' value='${tagsStr}' />
      <label>Descripción pública (HTML básico permitido)</label><textarea id='pub-description' rows='6'>${(it.publicDescription||'').replace(/</g,'&lt;')}</textarea>
      <div style='margin-top:10px;'>
        <div class='muted' style='font-size:12px;'>Imágenes públicas (máx 10)</div>
        <div id='pub-imgs' style='display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;'></div>
        <input id='pub-files' type='file' multiple accept='image/*' />
      </div>
      <div style='display:flex;gap:8px;justify-content:flex-end;margin-top:14px;'>
        <button id='pub-cancel' class='secondary'>Cancelar</button>
        <button id='pub-save'>Guardar</button>
      </div>`);
    const elPrice = document.getElementById('pub-price');
    const elCategory = document.getElementById('pub-category');
    const elTags = document.getElementById('pub-tags');
    const elDesc = document.getElementById('pub-description');
    const elImgsWrap = document.getElementById('pub-imgs');
    const elFiles = document.getElementById('pub-files');
    const btnCancel = document.getElementById('pub-cancel');
    const btnSave = document.getElementById('pub-save');
    let publicImages = imgs.map(m => ({ url: m.url, alt: m.alt||'' }));

    function renderPublicImages(){
      elImgsWrap.innerHTML='';
      publicImages.forEach((img, idx)=>{
        const box = document.createElement('div');
        box.style.cssText='width:90px;height:90px;position:relative;border:1px solid #ccc;border-radius:4px;overflow:hidden;background:#fff;';
        box.innerHTML = `<img src='${img.url}' alt='${img.alt||''}' style='width:100%;height:100%;object-fit:cover;' />`+
          `<button data-del='${idx}' style='position:absolute;top:2px;right:2px;background:#ef4444;color:#fff;border:none;border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer;'>x</button>`+
          `<input data-alt='${idx}' placeholder='ALT' value='${img.alt||''}' style='position:absolute;bottom:0;left:0;width:100%;box-sizing:border-box;font-size:10px;padding:2px;border:none;background:rgba(255,255,255,0.7);' />`;
        elImgsWrap.appendChild(box);
      });
      elImgsWrap.querySelectorAll('button[data-del]').forEach(btn=>{
        btn.onclick = () => { const i = parseInt(btn.dataset.del,10); publicImages.splice(i,1); renderPublicImages(); };
      });
      elImgsWrap.querySelectorAll('input[data-alt]').forEach(inp=>{
        inp.oninput = () => { const i = parseInt(inp.dataset.alt,10); publicImages[i].alt = inp.value.slice(0,80); };
      });
    }
    renderPublicImages();

    elFiles.onchange = async () => {
      if(!elFiles.files?.length) return;
      if(publicImages.length >= 10){ alert('Máximo 10 imágenes públicas'); elFiles.value=''; return; }
      try {
        const up = await invAPI.mediaUpload(elFiles.files);
        const list = (up && up.files)? up.files : [];
        list.forEach(f => { if(publicImages.length < 10) publicImages.push({ url: f.url, alt: '' }); });
        elFiles.value='';
        renderPublicImages();
      } catch(e){
        alert('Error subiendo imágenes: '+ e.message);
      }
    };

    btnCancel.onclick = invCloseModal;
    btnSave.onclick = async () => {
      try {
        const body = {};
        const priceVal = elPrice.value.trim();
        if(priceVal !== '') body.publicPrice = parseFloat(priceVal);
        else body.publicPrice = undefined; // remove
        body.category = elCategory.value.trim();
        body.tags = elTags.value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,30);
        body.publicDescription = elDesc.value.replace(/&lt;/g,'<').slice(0,5000);
        body.publicImages = publicImages.slice(0,10);
        // Validations
        if(body.publicPrice !== undefined && (!Number.isFinite(body.publicPrice) || body.publicPrice < 0)){
          return alert('Precio público inválido');
        }
        if(body.publicDescription.length > 5000){
          return alert('Descripción pública demasiado larga');
        }
        await invAPI.updateItem(it._id, body);
        invCloseModal();
        await refreshItems(state.lastItemsParams);
      } catch(e){
        alert('Error guardando campos públicos: '+ e.message);
      }
    };
  }
  // PUBLISH MANAGEMENT END

  // ---- Boot ----
  refreshIntakes();
  // Initial load: page 1, 10 per page
  refreshItems({ page: 1, limit: state.paging.limit });

}

// Export a no-op initializer to satisfy app.js imports
export function initInventory() {
  // The module already self-initializes on this page; keep this as a safe no-op.
}

