import { API } from "./api.esm.js";
import { loadFeatureOptionsAndRestrictions, getFeatureOptions, gateElement } from './feature-gating.js';
import { upper } from "./utils.js";
import { bindStickersButton, downloadStickersPdf } from './pdf.js';
import { setupNumberInputsPasteHandler, setupNumberInputPasteHandler } from './number-utils.js';

// Export a no-op initializer to satisfy app.js imports
// This must be at the top to ensure the file is recognized as an ES6 module
export function initInventory() {
  // The module already self-initializes on this page; keep this as a safe no-op.
}

const state = {
  intakes: [],
  lastItemsParams: {},
  items: [],
  selected: new Set(),
  itemCache: new Map(),
  paging: { page: 1, limit: 15, pages: 1, total: 0 },
  permissions: {}
};

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

function debounce(fn, wait = 200) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

const invAPI = {
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
  getItemStockEntries: async (id) => {
    const r = await request(`/api/v1/inventory/items/${id}/stock-entries`);
    return r;
  },

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
  },
  exportInventory: async () => {
    const url = `${apiBase}/api/v1/inventory/items/export/excel`;
    const res = await fetch(url, { headers: { ...authHeader() } });
    if(!res.ok) throw new Error('No se pudo exportar el inventario');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const contentDisposition = res.headers.get('Content-Disposition');
    const filename = contentDisposition 
      ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') || 'inventario.xlsx'
      : `inventario-${new Date().toISOString().split('T')[0]}.xlsx`;
    a.download = filename;
    document.body.appendChild(a); 
    a.click(); 
    a.remove();
  }
};

function invOpenModal(innerHTML) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  const close = document.getElementById("modalClose");
  if (!modal || !body || !close) return alert("No se encontró el modal en el DOM.");

  body.innerHTML = innerHTML;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");

  // Enhanced modal setup
  setTimeout(() => {
    // Check if this is an image modal and force it
    const img = document.getElementById('modal-img');
    if (img) {
      // Image modal detected
      if (window.forceImageModal) {
        window.forceImageModal();
      }
    } else {
      // Setup modal (detects type and applies appropriate styling)
      if (window.setupModal) {
        window.setupModal();
      }
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
  overlay.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-5 bg-black/60 dark:bg-black/60 theme-light:bg-black/40 backdrop-blur-sm';
  overlay.innerHTML = `<div id="inv-stacked-box" class="relative bg-slate-800 dark:bg-slate-800 theme-light:bg-white rounded-xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-4 max-w-[95vw] max-h-[90vh] overflow-auto custom-scrollbar">
    <button id="inv-overlay-close" aria-label="Cerrar" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-red-600 dark:bg-red-600 theme-light:bg-red-500 hover:bg-red-700 dark:hover:bg-red-700 theme-light:hover:bg-red-600 text-white rounded-lg transition-colors duration-200 text-xl font-bold">&times;</button>
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
  // Detectar si es pantalla grande (PC)
  const isDesktop = window.innerWidth >= 768;
  // En PC: modal grande pero imagen pequeña (30% del viewport)
  // En móvil: mantener tamaño actual
  const maxSize = isDesktop ? '30vw' : '50vw';
  const maxHeight = isDesktop ? '30vh' : '50vh';
  const containerHeight = isDesktop ? '60vh' : '50vh'; // Contenedor para imagen + espacio
  
  invOpenModal(
    `<div class="image-lightbox flex flex-col items-center justify-start p-6" style="min-height: 80vh;">
       <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4 flex-shrink-0">Vista previa</h3>
       <div class="relative flex items-center justify-center w-full flex-shrink-0" style="min-height: ${containerHeight}; max-height: ${containerHeight}; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 20px;">
       ${isVideo ? 
           `<video controls src="${media.url}" class="object-contain rounded-lg" style="max-width: ${maxSize}; max-height: ${maxHeight}; width: auto; height: auto;"></video>` : 
           `<img src="${media.url}" alt="media" id="modal-img" class="object-contain rounded-lg cursor-zoom-in border-2 border-slate-600/30" style="max-width: ${maxSize}; max-height: ${maxHeight}; width: auto; height: auto; image-rendering: auto; transform: scale(1) translate(0px, 0px); display: block; margin: 0 auto;" />`
       }
       </div>
       ${!isVideo ? `
         <div class="zoom-controls mt-4 flex-shrink-0 flex justify-center gap-2">
           <button class="zoom-btn px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300" id="zoom-in" title="Acercar">+</button>
           <button class="zoom-btn px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300" id="zoom-out" title="Alejar">-</button>
           <button class="zoom-btn px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300" id="zoom-reset" title="Resetear">⌂</button>
         </div>
       ` : ''}
       <div class="mt-4 flex justify-end flex-shrink-0">
         <button class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300" id="lb-close">Cerrar</button>
     </div>
     </div>`
  );
  document.getElementById("lb-close").onclick = invCloseModal;
  
  // Configurar zoom solo para imágenes
  if (!isVideo) {
    // Esperar a que la imagen se cargue antes de configurar el zoom
    const img = document.getElementById("modal-img");
    if (img) {
      // Forzar tamaño máximo de la imagen al cargar
      const forceImageSize = () => {
        const isDesktop = window.innerWidth >= 768;
        const container = img.parentElement;
        
        if (container && img.naturalWidth && img.naturalHeight) {
          // Tamaños máximos fijos basados en viewport para consistencia
          const maxWidthPx = isDesktop ? window.innerWidth * 0.3 : window.innerWidth * 0.5;
          const maxHeightPx = isDesktop ? window.innerHeight * 0.3 : window.innerHeight * 0.5;
          
          // Calcular el tamaño manteniendo la proporción de la imagen
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const containerAspect = maxWidthPx / maxHeightPx;
          
          let finalWidth, finalHeight;
          if (imgAspect > containerAspect) {
            // La imagen es más ancha - limitar por ancho
            finalWidth = maxWidthPx;
            finalHeight = maxWidthPx / imgAspect;
          } else {
            // La imagen es más alta - limitar por alto
            finalHeight = maxHeightPx;
            finalWidth = maxHeightPx * imgAspect;
          }
          
          // Aplicar tamaño de forma consistente
          img.style.width = finalWidth + 'px';
          img.style.height = finalHeight + 'px';
          img.style.maxWidth = isDesktop ? '30vw' : '50vw';
          img.style.maxHeight = isDesktop ? '30vh' : '50vh';
          img.style.objectFit = 'contain';
          img.style.display = 'block';
          img.style.margin = '0 auto';
          img.style.border = '2px solid rgba(148, 163, 184, 0.3)';
          img.style.borderRadius = '0.5rem';
        } else if (container) {
          // Si la imagen aún no tiene dimensiones naturales, usar valores por defecto
          img.style.maxWidth = isDesktop ? '30vw' : '50vw';
          img.style.maxHeight = isDesktop ? '30vh' : '50vh';
          img.style.objectFit = 'contain';
          img.style.display = 'block';
          img.style.margin = '0 auto';
          img.style.border = '2px solid rgba(148, 163, 184, 0.3)';
          img.style.borderRadius = '0.5rem';
        }
        
    setupImageZoom();
      };
      
      if (img.complete) {
        forceImageSize();
      } else {
        img.onload = forceImageSize;
      }
    }
  }
}

function setupImageZoom() {
  const img = document.getElementById("modal-img");
  const zoomIn = document.getElementById("zoom-in");
  const zoomOut = document.getElementById("zoom-out");
  const zoomReset = document.getElementById("zoom-reset");
  
  if (!img) return;
  
  // Asegurar que la imagen empiece sin zoom y centrada
  let scale = 1;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let translateX = 0;
  let translateY = 0;
  
  // Resetear transformaciones iniciales
  img.style.transform = 'scale(1) translate(0px, 0px)';
  img.style.transformOrigin = 'center center';
  translateX = 0;
  translateY = 0;
  
  // Función para aplicar transformaciones
  const applyTransform = () => {
    img.style.transform = `scale(${scale}) translate(${translateX}px, ${translateY}px)`;
    img.style.transformOrigin = 'center center';
    img.classList.toggle('zoomed', scale > 1);
  };
  
  // Función para resetear zoom
  const resetZoom = () => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    applyTransform();
    // Asegurar que el contenedor no tenga scroll y restaurar tamaño inicial
    const container = img.parentElement;
    if (container) {
      container.scrollTop = 0;
      container.scrollLeft = 0;
      container.style.overflow = 'hidden';
    }
    // Restaurar tamaño máximo de la imagen
    const isDesktop = window.innerWidth >= 768;
    img.style.maxWidth = isDesktop ? '30vw' : '50vw';
    img.style.maxHeight = isDesktop ? '30vh' : '50vh';
  };
  
  // Asegurar que el contenedor nunca tenga scroll
  const container = img.parentElement;
  if (container) {
    container.style.overflow = 'hidden';
    container.style.overflowX = 'hidden';
    container.style.overflowY = 'hidden';
  }
  
  // Limitar el zoom mínimo para que la imagen siempre quepa completa
  const isDesktop = window.innerWidth >= 768;
  const minScale = 0.5; // Permitir zoom out hasta 50%
  
  // Click para zoom in/out
  img.onclick = (e) => {
    e.preventDefault();
    if (scale === 1) {
      scale = 2;
      applyTransform();
    } else {
      resetZoom();
    }
  };
  
  // Controles de zoom
  if (zoomIn) zoomIn.onclick = () => {
    scale = Math.min(scale + 0.3, 5);
    applyTransform();
  };
  
  if (zoomOut) zoomOut.onclick = () => {
    const minScale = 0.3; // Permitir zoom out hasta 30% para que siempre quepa
    scale = Math.max(scale - 0.3, minScale);
    applyTransform();
    // Si llegamos al mínimo, asegurar que la imagen quepa completa
    if (scale <= minScale + 0.1) {
      translateX = 0;
      translateY = 0;
      applyTransform();
    }
  };
  
  if (zoomReset) zoomReset.onclick = resetZoom;
  
  // Zoom con rueda del mouse
  img.onwheel = (e) => {
    e.preventDefault();
    const minScale = 0.3; // Permitir zoom out hasta 30% para que siempre quepa
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    scale = Math.max(minScale, Math.min(5, scale + delta));
    applyTransform();
    // Si llegamos al mínimo, asegurar que la imagen quepa completa
    if (scale <= minScale + 0.1) {
      translateX = 0;
      translateY = 0;
      applyTransform();
    }
  };
  
  // Arrastrar cuando está con zoom
  img.onmousedown = (e) => {
    if (scale > 1) {
      isDragging = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      img.style.cursor = 'grabbing';
    }
  };
  
  document.onmousemove = (e) => {
    if (isDragging && scale > 1) {
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      applyTransform();
    }
  };
  
  document.onmouseup = () => {
    if (isDragging) {
      isDragging = false;
      img.style.cursor = scale > 1 ? 'grab' : 'pointer';
    }
  };
  
  // Touch support para móviles
  let lastTouchDistance = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  
  img.ontouchstart = (e) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      lastTouchDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
    } else if (e.touches.length === 1 && scale > 1) {
      // Pan
      const touch = e.touches[0];
      lastTouchX = touch.clientX - translateX;
      lastTouchY = touch.clientY - translateY;
    }
  };
  
  img.ontouchmove = (e) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      const delta = (distance - lastTouchDistance) * 0.01;
      scale = Math.max(0.5, Math.min(5, scale + delta));
      lastTouchDistance = distance;
      applyTransform();
    } else if (e.touches.length === 1 && scale > 1) {
      // Pan
      const touch = e.touches[0];
      translateX = touch.clientX - lastTouchX;
      translateY = touch.clientY - lastTouchY;
      applyTransform();
    }
  };
}

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
console.log('🔍 Verificando página de inventario:', { 
  page: document.body?.dataset?.page, 
  __ON_INV_PAGE__, 
  readyState: document.readyState 
});
if (__ON_INV_PAGE__) {
  // Configurar handlers para pegar números con formato de miles en todos los campos numéricos
  document.addEventListener('DOMContentLoaded', () => {
    setupNumberInputsPasteHandler('input[type="number"]');
  });
  // También aplicar a campos que se crean dinámicamente
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          if (node.tagName === 'INPUT' && node.type === 'number') {
            // Usar la función individual para elementos individuales
            if (typeof setupNumberInputPasteHandler === 'function') {
              setupNumberInputPasteHandler(node);
            }
          }
          // También buscar inputs dentro del nodo agregado
          const inputs = node.querySelectorAll?.('input[type="number"]');
          if (inputs && typeof setupNumberInputPasteHandler === 'function') {
            inputs.forEach(input => setupNumberInputPasteHandler(input));
          }
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
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
  const viCardForm = document.getElementById('vi-card-form');
  const viKindRow = document.getElementById('vi-kind-row');
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
    const perms = state.permissions || {};
    const canVeh = perms.allowVehicle !== false;
    const canPurch = perms.allowPurchase !== false;
    if (viKindRow) viKindRow.style.display = (canVeh || canPurch) ? '' : 'none';
    if (viCardForm) viCardForm.style.display = (canVeh || canPurch) ? '' : 'none';
    if (viSave) viSave.disabled = !(canVeh || canPurch);

    if (!canVeh && !canPurch) {
      if (viFormVehicle) viFormVehicle.classList.add('hidden');
      if (viFormPurchase) viFormPurchase.classList.add('hidden');
      return;
    }

    if (!canVeh && viKindVehicle) viKindVehicle.checked = false;
    if (!canPurch && viKindPurchase) viKindPurchase.checked = false;
    if (!canVeh && canPurch && viKindPurchase) viKindPurchase.checked = true;
    const usePurchase = (!canVeh && canPurch) || (!!viKindPurchase?.checked && canPurch);
    if (viFormVehicle) viFormVehicle.classList.toggle('hidden', usePurchase);
    if (viFormPurchase) viFormPurchase.classList.toggle('hidden', !usePurchase);
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
  selectionBar.className = "hidden flex items-center gap-3 flex-wrap p-4 mb-4 rounded-lg bg-slate-800/50 border border-slate-700/50 theme-light:bg-slate-100 theme-light:border-slate-300";
  itemsList.parentNode.insertBefore(selectionBar, itemsList);

  function updateSelectionBar() {
    const n = state.selected.size;
    if (!n) {
      selectionBar.classList.add("hidden");
      selectionBar.innerHTML = "";
      return;
    }
    selectionBar.classList.remove("hidden");
    selectionBar.innerHTML = `
      <div class="text-slate-300 theme-light:text-slate-600 font-semibold text-sm">Seleccionados: ${n}</div>
      <button id="sel-clear" class="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Limpiar selección</button>
      <button id="sel-page" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 transition-colors font-medium flex items-center gap-2">
        <span>☑</span> Seleccionar todos (página)
      </button>
      <div class="flex gap-2 flex-wrap">
        <button id="sel-stickers-qr" class="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900" title="Generar stickers con QR">Generar stickers</button>
        <button id="sel-stock-in-bulk" class="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900" title="Agregar stock a todos los seleccionados">Agregar stock (masivo)</button>
        <button id="sel-publish-bulk" class="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900" title="Publicar/Despublicar ítems seleccionados, por entrada o SKUs">Publicación (masiva)</button>
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
    if (btnQR) btnQR.onclick = () => generateStickersFromSelection('qr');
    const btnBulk = selectionBar.querySelector('#sel-stock-in-bulk');
    if (btnBulk) btnBulk.onclick = openBulkStockInModal;
    const btnPub = selectionBar.querySelector('#sel-publish-bulk');
    if (btnPub) btnPub.onclick = openBulkPublishModal;

    // Apply sub-feature gating for sticker options
    try{
      const fo = (typeof getFeatureOptions === 'function') ? getFeatureOptions() : {};
      const tpl = (fo.templates||{});
      const allowQR = (tpl.stickerQR !== false);
      if (btnQR) btnQR.style.display = allowQR ? '' : 'none';
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

  // Declarar generateStickersFromSelection antes de usarla en updateSelectionBar
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
      `<div class="w-full max-w-4xl mx-auto">
         <div class="flex items-center justify-between mb-4">
           <h3 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900">Generar stickers</h3>
         </div>
         <p class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-6">Ajusta cuántos stickers imprimir por ítem (por defecto = stock actual).</p>
         <div class="overflow-x-auto mb-6">
           <table class="w-full border-collapse bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white rounded-lg overflow-hidden border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
             <thead>
               <tr class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-100">
                 <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider border-b border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">SKU</th>
                 <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider border-b border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Nombre</th>
                 <th class="px-4 py-3 text-center text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider border-b border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Stock</th>
                 <th class="px-4 py-3 text-center text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider border-b border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Imprimir</th>
               </tr>
             </thead>
             <tbody id="stk-rows" class="divide-y divide-slate-700/50 dark:divide-slate-700/50 theme-light:divide-slate-200"></tbody>
           </table>
         </div>
         <div class="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
           <button id="stk-fill-stock" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-200 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-300 text-slate-300 dark:text-slate-300 theme-light:text-slate-700 hover:text-white dark:hover:text-white theme-light:hover:text-slate-900 font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Usar stock</button>
           <button id="stk-clear" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-200 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-300 text-slate-300 dark:text-slate-300 theme-light:text-slate-700 hover:text-white dark:hover:text-white theme-light:hover:text-slate-900 font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Poner 0</button>
           <button id="stk-generate" class="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Generar PDF</button>
         </div>
       </div>`
    );

    const rows = document.getElementById("stk-rows");
    rows.innerHTML = items
      .map(
        (it) => `
        <tr data-id="${it._id}" class="hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-50 transition-colors">
          <td class="px-4 py-3 text-sm text-white dark:text-white theme-light:text-slate-900 font-mono">${it.sku || ""}</td>
          <td class="px-4 py-3 text-sm text-white dark:text-white theme-light:text-slate-900">${it.name || ""}</td>
          <td class="px-4 py-3 text-center text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-700 font-semibold">${it.stock ?? 0}</td>
          <td class="px-4 py-3 text-center">
            <input type="number" min="0" step="1" value="${parseInt(it.stock || 0, 10)}" class="qty w-24 px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          </td>
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
      try {
        const base = list[0]?.it?.sku || list[0]?.it?._id || 'stickers';
        await renderStickerPdf(list, `stickers-${base}`);
        invCloseModal();
        hideBusy();
        showToast('Stickers generados');
      } catch (err) {
        hideBusy();
        alert('Error generando stickers: ' + (err.message || err));
      }
    };
  }

  function openBulkPublishModal(){
    const optionsIntakes = [
      `<option value="">(por selección actual o SKUs)</option>`,
      ...state.intakes.map(v=>`<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
    ].join('');
    const selected = Array.from(state.selected);
    invOpenModal(`
      <div class="p-6">
        <h3 class="text-xl font-semibold text-white dark:text-white theme-light:text-slate-900 mb-6">Publicación masiva</h3>
        <div class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Acción</label>
            <select id="bpub-action" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200">
              <option value="publish">Publicar</option>
              <option value="unpublish">Despublicar</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Por entrada (opcional)</label>
            <select id="bpub-intake" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200">${optionsIntakes}</select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Por SKUs exactos (opcional, separados por comas)</label>
            <input id="bpub-skus" placeholder="SKU1,SKU2,SKU3" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 text-white dark:text-white theme-light:text-slate-900 placeholder-slate-400 dark:placeholder-slate-400 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"/>
          </div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-100 rounded-lg p-3 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">
            Puedes publicar todos los de una procedencia (entrada) o escribir SKUs exactos. No es necesario seleccionar ítems.
          </div>
        </div>
        <div class="flex gap-3 mt-6 justify-end">
          <button id="bpub-cancel" class="px-6 py-2.5 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900 font-semibold transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Cancelar</button>
          <button id="bpub-run" class="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold shadow-md hover:shadow-lg transition-all duration-200">Aplicar</button>
        </div>
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
      viList.innerHTML = `<div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-sm py-4">No hay ingresos aún.</div>`;
      return;
    }
    viList.innerHTML = "";
    state.intakes.forEach((vi) => {
      const row = document.createElement("div");
      row.className = "p-4 rounded-lg bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-50 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200";
      row.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div class="flex-1">
          ${vi.intakeKind === 'purchase' 
              ? `<div class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-1">COMPRA: ${(vi.purchasePlace||'').toUpperCase()}</div>`
              : `<div class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-1">${(vi.brand || "") + (vi.model ? " " + vi.model : "")}</div><div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${vi.engine || ""}</div>`}
            <div class="mt-2 text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-700">
          <div>Fecha: ${new Date(vi.intakeDate).toLocaleDateString()}</div>
              <div>Precio entrada: <b class="text-white dark:text-white theme-light:text-slate-900">${fmtMoney(vi.entryPrice)}</b></div>
        </div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button class="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900 text-sm" data-edit="${vi._id}">Editar</button>
            <button class="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900 text-sm" data-recalc="${vi._id}">Recalcular</button>
            <button class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white border border-red-500 transition-colors text-sm" data-del="${vi._id}">Eliminar</button>
          </div>
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

  (async ()=>{
    await loadFeatureOptionsAndRestrictions({ force: true });
    const fo = getFeatureOptions();
    const inv = (fo.inventario||{});
    const allowVeh = inv.ingresoVehiculo !== false;
    const allowPurch = inv.ingresoCompra !== false;
    const wrapRadio = (id, enabled) => {
      const input = document.getElementById(id);
      if (!input) return;
      const label = input.closest('label') || input.parentElement;
      if (label) label.style.display = enabled ? '' : 'none';
      input.disabled = !enabled;
      if (!enabled) input.checked = false;
    };
    wrapRadio('vi-kind-vehicle', allowVeh);
    wrapRadio('vi-kind-purchase', allowPurch);
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
    const allowCatalogFields = publicEnabled && (inv.publicCatalogFields !== false);
    state.permissions = {
      allowVehicle: allowVeh,
      allowPurchase: allowPurch,
      allowMarketplace,
      allowPublishOps,
      allowUnpublishZero,
      allowCatalogFields
    };
    updateIntakeKindUI();
    if (!allowVeh && allowPurch && viKindPurchase) {
      viKindPurchase.checked = true;
      updateIntakeKindUI();
    } else if (!allowPurch && allowVeh && viKindVehicle) {
      viKindVehicle.checked = true;
      updateIntakeKindUI();
    }
    // Buttons and selectionBar entries
    gateElement(allowPublishOps, '#pub-bulk-global');
    gateElement(allowUnpublishZero, '#btn-unpublish-zero');
    const pubBulkBtn = document.getElementById('pub-bulk-global');
    if (pubBulkBtn) {
      pubBulkBtn.disabled = !allowPublishOps;
      pubBulkBtn.title = allowPublishOps ? 'Publicación catálogo' : 'Función deshabilitada';
    }
    const unpublishBtn = document.getElementById('btn-unpublish-zero');
    if (unpublishBtn) {
      unpublishBtn.disabled = !allowUnpublishZero;
      unpublishBtn.title = allowUnpublishZero ? 'Despublicar agotados' : 'Función deshabilitada';
    }
    // Selection bar ids are created dynamically; hide container if all actions off
    if (!allowPublishOps) {
      // hide selection bar publish button once rendered
      const obs = new MutationObserver(()=>{
        const btn = document.getElementById('sel-publish-bulk'); if(btn) btn.style.display = 'none';
      });
      obs.observe(selectionBar, { childList:true, subtree:true }); setTimeout(()=>obs.disconnect(), 4000);
    }
    applyMarketplacePermissions();
  })();

  function applyMarketplacePermissions(){
    const allow = state.permissions?.allowMarketplace !== false;
    document.querySelectorAll('[data-mp]').forEach(btn=>{
      if(!(btn instanceof HTMLElement)) return;
      btn.style.display = allow ? '' : 'none';
      btn.disabled = !allow;
      btn.title = allow ? 'Scripts Facebook Marketplace' : 'Función deshabilitada';
      if (allow) {
        btn.onclick = () => {
          const id = btn.getAttribute('data-mp');
          const item = state.itemCache.get(String(id)) || state.items.find(it => String(it._id) === String(id));
          if (item) openMarketplaceHelper(item);
        };
      } else {
        btn.onclick = null;
      }
    });
  }

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
    console.log('🔄 refreshItems llamado con:', params);
    // Merge persisted paging with incoming params; reset to page 1 if filters changed
    const prev = state.lastItemsParams || {};
    const filters = { ...params };
    delete filters.page; delete filters.limit;
    const prevFilters = { ...prev }; delete prevFilters.page; delete prevFilters.limit;
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(prevFilters);
    const paging = state.paging || { page: 1, limit: 15 };
    const page = filtersChanged ? 1 : (params.page || prev.page || paging.page || 1);
    const limit = params.limit || prev.limit || paging.limit || 15;
    const nextParams = { ...filters, page, limit };
    state.lastItemsParams = nextParams;
    const { data, meta } = await invAPI.listItems(nextParams);
    state.items = data || [];
    console.log(`📦 refreshItems: Cargados ${state.items.length} items`, { params: nextParams, meta });
    // Update paging info if meta was returned
    if (meta && (meta.total != null || meta.pages != null || meta.page != null)) {
      state.paging = {
        page: meta.page || page || 1,
        pages: meta.pages || Math.max(1, Math.ceil((meta.total || state.items.length || 0) / (meta.limit || limit || 15))),
        total: meta.total || state.items.length || 0,
        limit: meta.limit || limit || 15,
        truncated: !!meta.truncated,
      };
    } else {
      // No meta -> single page with all items
      state.paging = { page: 1, pages: 1, total: state.items.length, limit: state.items.length || 15, truncated: false };
    }

    // Obtener itemsList cada vez que se ejecuta refreshItems (por si el DOM cambia)
    const itemsListEl = document.getElementById("itemsList");
    if (!itemsListEl) {
      console.error('❌ itemsList no encontrado en el DOM - reintentando en 100ms');
      setTimeout(() => refreshItems(params), 100);
      return;
    }

    itemsListEl.innerHTML = "";
    console.log(`📋 Renderizando ${state.items.length} items en itemsList`, { itemsList: !!itemsListEl, items: state.items.length });
    if (state.items.length === 0) {
      console.warn('⚠️ No hay items para renderizar. Verificando API...', { params: nextParams, meta });
    }
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
            <div class="inv-item-meta" style="color:var(--text);opacity:0.85;font-size:12px;">
              <span><strong style="font-weight:700;font-size:13px;">SKU:</strong> <strong style="font-weight:700;font-size:13px;">${it.sku || ""}</strong></span>
              <span> • ${internalLabel}</span>
              <span> • ${brandLabel}</span>
              <span> • ${locationLabel}</span>
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
          <button class="secondary" data-summary="${it._id}">Ver resumen</button>
          <button class="secondary" data-qr-dl="${it._id}">Descargar QR</button>
          <button class="secondary" data-qr="${it._id}">Expandir codigo QR</button>
          <button class="secondary" data-stock-in="${it._id}">Agregar stock</button>
          <button class="secondary" data-mp="${it._id}" ${it.marketplacePublished ? 'style="background:linear-gradient(135deg, #10b981, #059669);color:white;font-weight:600;box-shadow:0 2px 8px rgba(16,185,129,0.3);"' : ''}>${it.marketplacePublished ? '✓ Publicado' : 'Marketplace'}</button>
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
      div.querySelector("[data-summary]").onclick = () => openItemSummaryModal(it);
     div.querySelector("[data-stock-in]").onclick = () => openStockInModal(it);
     const mpBtn = div.querySelector("[data-mp]");
     if (!state.permissions?.allowMarketplace && mpBtn) {
        mpBtn.style.display = 'none';
        mpBtn.disabled = true;
        mpBtn.title = 'Función deshabilitada';
      } else if (mpBtn) {
        mpBtn.style.display = '';
        mpBtn.disabled = false;
        mpBtn.title = 'Scripts Facebook Marketplace';
        mpBtn.onclick = () => openMarketplaceHelper(it);
      }

      div.addEventListener("click", (e) => {
        const el = e.target.closest(".item-thumb");
        if (!el || el.id === `qr-${it._id}`) return;
        const url = el.dataset.full || el.currentSrc || el.src;
        const type = el.dataset.type || "image";
        openLightbox({ url, mimetype: type === "video" ? "video/*" : "image/*" });
      });

      itemsListEl.appendChild(div);
    });

    renderPaginationControls();

    updateSelectionBar();
    applyMarketplacePermissions();
  }

  function renderPaginationControls() {
    const top = document.getElementById('itemsPaginationTop');
    const bottom = document.getElementById('itemsPaginationBottom');
    if (!top || !bottom) return;
    const { page, pages, total, limit } = state.paging || { page: 1, pages: 1, total: 0, limit: 15 };
    const start = total ? (Math.min((page - 1) * limit + 1, total)) : 0;
    const end = Math.min(page * limit, total);
    const info = total ? `Mostrando ${start}-${end} de ${total}` : 'Sin resultados';

    const disabledPrev = page <= 1 ? 'disabled' : '';
    const disabledNext = page >= pages ? 'disabled' : '';

    const build = () => `
      <div class="flex flex-wrap items-center gap-4 w-full">
        <div class="flex items-center gap-3">
          <button id="inv-prev" class="px-4 py-2 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900 font-semibold transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 ${disabledPrev ? 'opacity-50 cursor-not-allowed' : ''}" ${disabledPrev ? 'disabled' : ''}>
            ◀ Anterior
          </button>
          <span class="text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-700 font-medium whitespace-nowrap">
            Página ${page} de ${pages}
          </span>
          <span class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 whitespace-nowrap">
            ${info}
          </span>
          <button id="inv-next" class="px-4 py-2 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900 font-semibold transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 ${disabledNext ? 'opacity-50 cursor-not-allowed' : ''}" ${disabledNext ? 'disabled' : ''}>
            Siguiente ▶
          </button>
        </div>
        <div class="flex items-center gap-2 ml-auto">
          <label class="text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-700 font-medium whitespace-nowrap">
            Por página:
          </label>
          <select id="inv-limit" class="px-3 py-2 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm font-medium">
            ${[15,20,30,40,60,80].map(n=>`<option value="${n}" ${n===limit?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
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
    const limit = state.paging?.limit || 15;
    const params = { ...state.lastItemsParams, page, limit };
    refreshItems(params);
  }

  function setLimit(n) {
    const limit = Math.max(1, Math.min(n || 15, 100));
    const params = { ...state.lastItemsParams, page: 1, limit };
    refreshItems(params);
  }

  function openStockInModal(it){
    const optionsIntakes = [
      `<option value="">(sin entrada)</option>`,
      ...state.intakes.map(v=>`<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
    ].join('');
    invOpenModal(`
      <div class="p-6">
        <h3 class="text-xl font-semibold text-white theme-light:text-slate-900 mb-4">Agregar stock a ${it.name || it.sku || it._id}</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Cantidad</label>
            <input id="stk-qty" type="number" min="1" step="1" value="1" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Anclar a procedencia (opcional)</label>
            <select id="stk-intake" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">${optionsIntakes}</select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Nota (opcional)</label>
            <input id="stk-note" placeholder="ej: reposición, compra, etc." class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button id="stk-save" class="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">Agregar</button>
          <button id="stk-generate-stickers" class="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">Generar Stickers</button>
          <button id="stk-cancel" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
        </div>
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

    // Botón para generar stickers usando el formato existente de la empresa
    document.getElementById('stk-generate-stickers').onclick = async () => {
      const qty = parseInt(document.getElementById('stk-qty').value||'0',10);
      if (!Number.isFinite(qty) || qty<=0) return alert('Cantidad inválida');
      const vehicleIntakeId = document.getElementById('stk-intake').value || undefined;
      const note = document.getElementById('stk-note').value || '';
      
      try {
        showBusy('Agregando stock y generando stickers...');
        
        // Primero agregar el stock
        await request(`/api/v1/inventory/items/${it._id}/stock-in`, { method: 'POST', json: { qty, vehicleIntakeId, note } });
        showToast('Stock agregado');
        
        // Usar exactamente la misma lógica que generateStickersFromSelection
        const list = [{ it, count: qty }];
        
        try {
          const base = it.sku || it._id || 'stickers';
          await renderStickerPdf(list, `stickers-${base}`);
          invCloseModal();
          await refreshItems(state.lastItemsParams);
          hideBusy();
          showToast('Stock agregado y stickers generados');
          return;
        } catch (err) {
          hideBusy();
          alert('Error generando stickers: ' + (err.message || err));
          return;
        }
        } catch (err) {
          hideBusy();
        alert('Error agregando stock: ' + (err.message || err));
      }
    };
  }

  function showToast(msg){
    const n = document.createElement('div');
    n.className='notification success show';
    n.textContent=msg||'OK';
    document.body.appendChild(n);
    setTimeout(()=>{ n.classList.remove('show'); setTimeout(()=>n.remove(), 300); }, 1700);
  }

  async function openItemSummaryModal(it) {
    try {
      showBusy('Cargando resumen del item...');
      const data = await invAPI.getItemStockEntries(it._id);
      hideBusy();
      
      const item = data.item || it;
      const stockEntries = data.stockEntries || [];
      const totalStock = stockEntries.reduce((sum, se) => sum + (se.qty || 0), 0);
      
      // Formatear información de cada entrada
      const entriesHtml = stockEntries.length > 0
        ? stockEntries.map(se => {
            const intakeLabel = se.intakeLabel || 'GENERAL';
            const entryDate = se.entryDate ? new Date(se.entryDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
            const entryPrice = se.entryPrice ? fmtMoney(se.entryPrice) : '-';
            const qty = se.qty || 0;
            
            return `
              <div class="border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg p-4 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-50">
                <div class="flex justify-between items-start mb-2">
                  <div class="flex-1">
                    <div class="text-sm font-semibold text-white theme-light:text-slate-900 mb-1">${intakeLabel}</div>
                    <div class="text-xs text-slate-400 theme-light:text-slate-600">Fecha de entrada: ${entryDate}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-lg font-bold text-blue-400 theme-light:text-blue-600">${qty} unidades</div>
                    ${entryPrice !== '-' ? `<div class="text-xs text-slate-400 theme-light:text-slate-600">Precio: $${entryPrice}</div>` : ''}
                  </div>
                </div>
                ${se.meta?.note ? `<div class="text-xs text-slate-400 theme-light:text-slate-600 mt-2 italic">Nota: ${se.meta.note}</div>` : ''}
              </div>
            `;
          }).join('')
        : '<div class="text-center py-8 text-slate-400 theme-light:text-slate-600">No hay entradas de stock registradas</div>';
      
      invOpenModal(`
        <div class="p-6 max-w-4xl">
          <h3 class="text-2xl font-bold text-white theme-light:text-slate-900 mb-6">📊 Resumen del Item</h3>
          
          <!-- Información general del item -->
          <div class="mb-6 p-4 rounded-lg bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-slate-100 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div class="text-sm text-slate-400 theme-light:text-slate-600 mb-1">Nombre</div>
                <div class="text-lg font-semibold text-white theme-light:text-slate-900">${item.name || '-'}</div>
              </div>
              <div>
                <div class="text-sm text-slate-400 theme-light:text-slate-600 mb-1">SKU</div>
                <div class="text-lg font-semibold text-white theme-light:text-slate-900">${item.sku || '-'}</div>
              </div>
              <div>
                <div class="text-sm text-slate-400 theme-light:text-slate-600 mb-1">Stock Total</div>
                <div class="text-2xl font-bold text-blue-400 theme-light:text-blue-600">${item.stock || 0}</div>
              </div>
              <div>
                <div class="text-sm text-slate-400 theme-light:text-slate-600 mb-1">Precio de Venta</div>
                <div class="text-lg font-semibold text-white theme-light:text-slate-900">$${fmtMoney(item.salePrice || 0)}</div>
              </div>
              ${item.entryPrice ? `
              <div>
                <div class="text-sm text-slate-400 theme-light:text-slate-600 mb-1">Precio de Entrada</div>
                <div class="text-lg font-semibold text-white theme-light:text-slate-900">$${fmtMoney(item.entryPrice)}</div>
              </div>
              ` : ''}
              ${item.location ? `
              <div>
                <div class="text-sm text-slate-400 theme-light:text-slate-600 mb-1">Ubicación</div>
                <div class="text-lg font-semibold text-white theme-light:text-slate-900">${item.location}</div>
              </div>
              ` : ''}
            </div>
          </div>
          
          <!-- Resumen de entradas -->
          <div class="mb-4">
            <h4 class="text-lg font-semibold text-white theme-light:text-slate-900 mb-3">
              📦 Entradas de Stock (${stockEntries.length} ${stockEntries.length === 1 ? 'entrada' : 'entradas'})
            </h4>
            ${totalStock !== (item.stock || 0) ? `
              <div class="mb-3 p-3 rounded-lg bg-yellow-900/30 dark:bg-yellow-900/30 theme-light:bg-yellow-50 border border-yellow-600/50 dark:border-yellow-600/50 theme-light:border-yellow-300">
                <div class="text-sm text-yellow-300 theme-light:text-yellow-700">
                  ⚠️ Nota: El stock total del item (${item.stock || 0}) no coincide exactamente con la suma de entradas (${totalStock}). 
                  Esto puede deberse a stock agregado sin entrada específica o ajustes manuales.
                </div>
              </div>
            ` : ''}
            <div class="space-y-3 max-h-96 overflow-y-auto">
              ${entriesHtml}
            </div>
          </div>
          
          <div class="flex gap-3 mt-6">
            <button id="summary-close" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cerrar</button>
          </div>
        </div>
      `);
      
      document.getElementById('summary-close').onclick = invCloseModal;
    } catch (e) {
      hideBusy();
      alert('Error al cargar el resumen: ' + e.message);
      console.error('Error loading item summary:', e);
    }
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
      <div class="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 theme-light:bg-slate-50 theme-light:border-slate-200">
        <div class="flex-1 min-w-[240px]">
          <div class="font-semibold text-white theme-light:text-slate-900 text-sm">${(it?.sku||'')}</div>
          <div class="text-slate-400 theme-light:text-slate-600 text-xs mt-1">${(it?.name||'')}</div>
        </div>
        <div>
          <input type="number" class="bstk-qty w-24 px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" data-id="${it?._id}" min="0" step="1" value="1"/>
        </div>
      </div>
    `).join('');

    invOpenModal(`
      <div class="p-6">
        <h3 class="text-xl font-semibold text-white theme-light:text-slate-900 mb-2">Agregar stock (masivo)</h3>
        <div class="text-sm text-slate-400 theme-light:text-slate-600 mb-4">Ítems seleccionados: ${items.length}. Coloca una cantidad por ítem (0 para omitir).</div>
        <div class="p-4 mb-4 rounded-lg bg-slate-800/30 border border-slate-700/30 theme-light:bg-slate-50 theme-light:border-slate-200">
          <div class="flex items-center gap-3 flex-wrap">
            <span class="text-sm text-slate-300 theme-light:text-slate-700 font-medium">Cantidad para todos</span>
            <input id="bstk-all" type="number" min="0" step="1" value="1" class="w-24 px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
            <button id="bstk-apply-all" class="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Aplicar a todos</button>
        </div>
      </div>
        <div class="max-h-60 overflow-y-auto custom-scrollbar mb-4 space-y-2">${rows}</div>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Anclar a procedencia (opcional)</label>
            <select id="bstk-intake" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">${optionsIntakes}</select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Nota (opcional)</label>
            <input id="bstk-note" placeholder="ej: reposición, compra, etc." class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button id="bstk-save" class="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">Agregar</button>
          <button id="bstk-cancel" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
        </div>
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
        showToast('Stock agregado (masivo)');
        
        invCloseModal(); 
        hideBusy();
        await refreshItems(state.lastItemsParams);
      }catch(e){ hideBusy(); alert('No se pudo agregar stock masivo: '+e.message); }
    };
  }

  // ---- Crear entrada ----
  if (viSave) {
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
  }

  // ---- Autorelleno de destino al cambiar procedencia ----
  if (itVehicleIntakeId) {
  itVehicleIntakeId.addEventListener("change", () => {
    const id = itVehicleIntakeId.value;
    if (!id) {
      if (itVehicleTarget) {
      itVehicleTarget.value = "GENERAL";
      itVehicleTarget.readOnly = false;
      }
      return;
    }
    const vi = state.intakes.find((v) => v._id === id);
    if (vi) {
      if (itVehicleTarget) {
      itVehicleTarget.value = makeIntakeLabel(vi);
      itVehicleTarget.readOnly = true;
      }
    } else {
      if (itVehicleTarget) itVehicleTarget.readOnly = false;
    }
  });
  }

  // ---- Guardar ítem ----
  if (itSave) {
  itSave.onclick = async () => {
    let vehicleTargetValue = (itVehicleTarget?.value || "").trim();
    const selectedIntakeId = itVehicleIntakeId?.value || undefined;

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
    if (itVehicleTarget) itVehicleTarget.value = "GENERAL";
    if (itVehicleIntakeId) itVehicleIntakeId.value = "";
    if (itEntryPrice) itEntryPrice.value = "";
    if (itSalePrice) itSalePrice.value = "";
    if (itOriginal) itOriginal.value = "false";
    if (itStock) itStock.value = "";
  if (itMinStock) itMinStock.value = "";
    if (itFiles) itFiles.value = "";
    if (itVehicleTarget) itVehicleTarget.readOnly = false;

    await refreshItems({});
  };
  }

  // ---- Filtros ----
  function doSearch() {
    const params = {
      name: qName?.value.trim() || "",
      sku: qSku?.value.trim() || "",
      brand: qBrand ? qBrand.value.trim() : undefined,
      vehicleIntakeId: qIntake?.value || undefined,
    };
    // When searching, start from first page and keep current limit
    refreshItems({ ...params, page: 1, limit: state.paging?.limit || 15 });
  }

  if (qApply) qApply.onclick = doSearch;
  if (qClear) {
  qClear.onclick = () => {
      if (qName) qName.value = "";
      if (qSku) qSku.value = "";
    if (qBrand) qBrand.value = "";
      if (qIntake) qIntake.value = "";
    refreshItems({ page: 1, limit: state.paging?.limit || 10 });
  };
  }
  [qName, qSku, qBrand].forEach((el) => el && el.addEventListener("keydown", (e) => e.key === "Enter" && doSearch()));
  if (qIntake) qIntake.addEventListener("change", doSearch);

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
      <div class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white/90 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
        <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-6">Editar ítem</h3>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">SKU</label>
            <input id="e-it-sku" value="${it.sku || ""}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Nombre</label>
            <input id="e-it-name" value="${it.name || ""}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Nombre interno</label>
            <input id="e-it-internal" value="${it.internalName || ''}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Marca</label>
            <input id="e-it-brand" value="${it.brand || ''}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Ubicación</label>
            <input id="e-it-location" value="${it.location || ''}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Entrada</label>
            <select id="e-it-intake" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200">${optionsIntakes}</select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Destino</label>
            <input id="e-it-target" value="${it.vehicleTarget || "GENERAL"}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Precio entrada (opcional)</label>
            <input id="e-it-entry" type="number" step="0.01" placeholder="vacío = AUTO si hay entrada" value="${it.entryPrice ?? ""}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Precio venta</label>
            <input id="e-it-sale" type="number" step="0.01" min="0" value="${Number(it.salePrice || 0)}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Original</label>
            <select id="e-it-original" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200">
        <option value="false" ${!it.original ? "selected" : ""}>No</option>
        <option value="true" ${it.original ? "selected" : ""}>Sí</option>
      </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Stock</label>
            <input id="e-it-stock" type="number" step="1" min="0" value="${parseInt(it.stock || 0, 10)}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Stock mínimo (opcional)</label>
            <input id="e-it-min" type="number" step="1" min="0" placeholder="0 = sin alerta" value="${Number.isFinite(parseInt(it.minStock||0,10))? parseInt(it.minStock||0,10): ''}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">0 = sin alerta. Te avisamos cuando el stock sea menor o igual a este número.</div>
          </div>
        </div>

        <div class="mb-6">
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Imágenes/Videos</label>
          <div id="e-it-thumbs" class="mb-3 space-y-2"></div>
          <input id="e-it-files" type="file" multiple class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          <div class="viewer hidden" id="e-it-viewer"></div>
        </div>

        <div class="flex gap-3 justify-end mt-6 pt-4 border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50">
          <button id="e-it-cancel" class="px-4 py-2.5 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Cancelar</button>
          <button id="e-it-save" class="px-6 py-2.5 bg-gradient-to-r from-green-600 to-green-700 dark:from-green-600 dark:to-green-700 theme-light:from-green-500 theme-light:to-green-600 hover:from-green-700 hover:to-green-800 dark:hover:from-green-700 dark:hover:to-green-800 theme-light:hover:from-green-600 theme-light:hover:to-green-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar cambios</button>
        </div>
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
      if (images.length === 0) {
        thumbs.innerHTML = '<p class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 italic">No hay imágenes/videos</p>';
        return;
      }
      images.forEach((m, idx) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "flex items-center gap-3 p-3 bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-slate-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300";
        
        const label = document.createElement("span");
        label.className = "text-sm font-medium text-white dark:text-white theme-light:text-slate-900 flex-1";
        label.textContent = `Imagen ${idx + 1}`;

        const previewBtn = document.createElement("button");
        previewBtn.className = "px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 text-xs font-semibold flex items-center gap-1";
  previewBtn.title = "Vista previa";
        previewBtn.innerHTML = `<svg width='14' height='14' viewBox='0 0 20 20' fill='none' stroke='currentColor'><path d='M1 10C3.5 5.5 8 3 12 5.5C16 8 18.5 13 17 15C15.5 17 10.5 17 7 15C3.5 13 1 10 1 10Z' stroke-width='2' fill='none'/><circle cx='10' cy='10' r='3' fill='currentColor'/></svg> Ver`;
        previewBtn.onclick = (ev) => {
          ev.preventDefault();
          const isVideo = m.mimetype?.startsWith('video/');
          invOpenOverlay(
            `<div class='flex flex-col items-center justify-center'>
              ${isVideo
                ? `<video controls src='${m.url}' class='max-w-[90vw] max-h-[80vh] object-contain rounded-lg'></video>`
                : `<img src='${m.url}' alt='media' class='max-w-[90vw] max-h-[80vh] object-contain rounded-lg'/>`}
            </div>`
          );
        };

        const delBtn = document.createElement("button");
        delBtn.className = "px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 text-xs font-semibold flex items-center gap-1";
        delBtn.title = "Quitar";
        delBtn.innerHTML = `<svg width='14' height='14' viewBox='0 0 20 20' fill='none' stroke='currentColor'><circle cx='10' cy='10' r='9' stroke-width='2'/><line x1='6' y1='6' x2='14' y2='14' stroke-width='2'/><line x1='14' y1='6' x2='6' y2='14' stroke-width='2'/></svg> Quitar`;
        delBtn.setAttribute("data-del", idx);
        delBtn.onclick = () => {
          images.splice(idx, 1);
          renderThumbs();
          if (viewer.style.display !== "none") viewer.innerHTML = "";
        };

        itemDiv.appendChild(label);
        itemDiv.appendChild(previewBtn);
        itemDiv.appendChild(delBtn);
        thumbs.appendChild(itemDiv);
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
    // Removido el SKU del título para uso público
    return `${brand? brand+ ' ' : ''}${name}`.trim();
  }

  function buildMarketplaceDescription(it){
  const lines = [];
  if (it.brand) lines.push(`Marca: ${it.brand}`);
  lines.push(`Precio: ${fmtMoney(it.salePrice || 0)}`);
  // Removido el stock de la descripción pública
  lines.push('Estado: Original - Usado en perfecto estado.');
  lines.push('Entrega inmediata.');
  lines.push('Compatibilidad garantizada: te asesoramos para que compres el repuesto correcto.');
  lines.push('Precios negociables - estamos abiertos a llegar a un buen acuerdo.');
  lines.push('¿Buscas otro repuesto? Pregúntanos por nuestro catálogo completo.');
  return lines.filter(Boolean).join('\n');
}
// ---- Import/Export Excel (amigable) ----
  (function bindImportExcel(){
    const btnTpl = document.getElementById('btn-download-template');
    const btnExp = document.getElementById('btn-export-inventory');
    const btnImp = document.getElementById('btn-import-excel');
    const fileEl = document.getElementById('excel-file');
    const statusEl = document.getElementById('import-status');
    if(!btnTpl || !btnImp || !fileEl || !statusEl) return;
    btnTpl.onclick = async ()=>{
      try{ btnTpl.disabled=true; await invAPI.downloadImportTemplate(); }
      catch(e){ alert(e.message); }
      finally{ btnTpl.disabled=false; }
    };
    if(btnExp){
      btnExp.onclick = async ()=>{
        try{ 
          btnExp.disabled=true; 
          btnExp.textContent = 'Exportando...';
          await invAPI.exportInventory(); 
        }
        catch(e){ alert('Error al exportar: ' + e.message); }
        finally{ 
          btnExp.disabled=false; 
          btnExp.textContent = '📥 Exportar inventario';
        }
      };
    }
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
  if (state.permissions?.allowMarketplace === false) {
    alert('Marketplace deshabilitado para esta empresa.');
    return;
  }
  const media = Array.isArray(item.images) ? item.images : [];
  const titleDefault = buildMarketplaceTitle(item);
  const descDefault  = buildMarketplaceDescription(item);
  const priceValue = Number(item.salePrice||0);
  const whatsappLink = 'https://wa.me/3043593520';
  // Removido el script sugerido
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

          <label>SKU (Uso interno)</label>
          <input id="mp-sku" value="${item.sku || ''}" readonly style="background-color: var(--card-alt);" />
          <div class="row" style="gap:6px;margin:6px 0 12px 0;">
            <button class="secondary" id="mp-copy-sku">Copiar SKU</button>
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
          
          <div style="margin-top:16px;padding:12px;background:var(--card-alt);border-radius:8px;border:1px solid var(--border);">
            <div class="row" style="gap:8px;align-items:center;">
              <input type="checkbox" id="mp-published" ${item.marketplacePublished ? 'checked' : ''} />
              <label for="mp-published" style="margin:0;font-weight:600;font-size:13px;">Marcar como publicado en Marketplace</label>
            </div>
            <div class="muted" style="font-size:11px;margin-top:4px;">Para evitar duplicados al publicar en Facebook Marketplace.</div>
          </div>
        </div>
      </div>
    `);

    const titleEl = document.getElementById('mp-title');
    const skuEl = document.getElementById('mp-sku');
    const priceEl = document.getElementById('mp-price');
    const descEl  = document.getElementById('mp-desc');
    const publishedEl = document.getElementById('mp-published');
    document.getElementById('mp-copy-title').onclick = async ()=>{ try{ await navigator.clipboard.writeText(titleEl.value||''); }catch{ alert('No se pudo copiar'); } };
    document.getElementById('mp-copy-sku').onclick = async ()=>{ try{ await navigator.clipboard.writeText(skuEl.value||''); }catch{ alert('No se pudo copiar'); } };
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
    
    // Manejar checkbox de publicado
    publishedEl.addEventListener('change', async () => {
      const published = publishedEl.checked;
      const originalState = !published;
      
      try {
        // Actualizar inmediatamente en la UI para feedback visual
        item.marketplacePublished = published;
        
        // Actualizar en cache y lista local
        if (state.itemCache.has(String(item._id))) {
          state.itemCache.get(String(item._id)).marketplacePublished = published;
        }
        const listItem = state.items.find(it => String(it._id) === String(item._id));
        if (listItem) {
          listItem.marketplacePublished = published;
        }
        
        // Enviar al servidor en background
        invAPI.updateItem(item._id, { marketplacePublished: published }).catch(error => {
          // Error actualizando estado
          // Revertir solo en caso de error
          item.marketplacePublished = originalState;
          publishedEl.checked = originalState;
          if (state.itemCache.has(String(item._id))) {
            state.itemCache.get(String(item._id)).marketplacePublished = originalState;
          }
          if (listItem) {
            listItem.marketplacePublished = originalState;
          }
          alert('Error al guardar. Intenta nuevamente.');
        });
        
      } catch (error) {
        // Error inesperado
        publishedEl.checked = originalState;
        alert('Error inesperado');
      }
    });

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

  // --- Nuevo motor de stickers 5cm x 3cm ---
  const STICKER_PX_PER_CM = 37.795275591;
  // Layout por defecto que coincide con el del editor (sin imagen del item)
  // Canvas: 5cm x 3cm = 189px x 113px aproximadamente
  const canvasWidth = Math.round(5 * STICKER_PX_PER_CM); // ~189px
  const canvasHeight = Math.round(3 * STICKER_PX_PER_CM); // ~113px
  
  // Márgenes del sticker
  const margin = 6;
  
  // QR: a la derecha, ocupa la mayor parte del espacio vertical disponible
  const qrW = 90; // Aumentado para que sea más grande
  const qrH = 90; // Aumentado para que sea más grande
  const qrX = canvasWidth - qrW - margin; // Alineado a la derecha con margen
  const qrY = margin; // Alineado arriba con margen
  
  // Área de texto a la izquierda (sin superponerse con QR)
  const textAreaX = margin;
  const textAreaW = qrX - textAreaX - 4; // Espacio entre texto y QR: 4px
  const textAreaY = margin;
  const textAreaH = canvasHeight - (margin * 2); // Altura total menos márgenes
  
  // SKU: arriba izquierda, altura suficiente para permitir wrap si es necesario
  const skuX = textAreaX;
  const skuY = textAreaY;
  const skuW = textAreaW;
  const skuH = 24; // Altura aumentada para permitir 2 líneas si el SKU es largo
  
  // Nombre: debajo del SKU, ocupa el resto del espacio vertical disponible
  const nameX = textAreaX;
  const nameY = skuY + skuH + 8; // Espacio aumentado a 8px entre SKU y nombre para evitar superposición
  const nameW = textAreaW;
  const nameH = textAreaH - skuH - 8; // Resto del espacio vertical menos el espacio entre elementos
  
  // STICKER_DEFAULT_LAYOUT y cloneStickerLayout eliminados - no se usan

  // Layout unificado: idéntico al sticker de recordatorio de aceite (backend)
  // Usa mismos márgenes, columnas, y fórmulas de tamaño/posición de logo y QR.
  function buildUnifiedStickerLayout(logoUrl) {
    // Sin márgenes ni gap para que el QR pueda ocupar todo el lado derecho
    const marginPx = 0;
    const gapPx = 0;

    const availableWidth = canvasWidth;
    const availableHeight = canvasHeight;

    // Columnas 50/50
    const leftColW = availableWidth * 0.5;
    const rightColW = availableWidth - leftColW;

    const leftColX = marginPx;
    const rightColX = leftColW + gapPx;
    const colY = marginPx;

    // Altura de la columna derecha
    const rightColH = availableHeight;

    // Logo pequeño sobre el QR
    const logoSize = Math.min(rightColW * 0.6, rightColH * 0.2);
    const logoX = rightColX + (rightColW - logoSize) / 2;
    const logoY = colY;

    // QR ocupa TODO el lado derecho (permitir deformación) y se sobrepone 2px para matar gaps
    const qrWidth = rightColW + 4;
    const qrHeight = rightColH + 4;
    const qrX = rightColX - 2;
    const qrY = colY - 2;

    // SKU centrado verticalmente en la columna izquierda (solo SKU)
    const skuX = leftColX;
    const skuH = availableHeight * 0.42; // proporción similar al bloque de texto del recordatorio
    const skuY = colY + (availableHeight - skuH) / 2;
    const skuW = leftColW;

    return {
      widthCm: 5,
      heightCm: 3,
      elements: [
        {
          id: 'logo',
          type: 'image',
          source: 'company-logo',
          url: logoUrl || STICKER_LOGO_URLS.CASA_RENAULT,
          x: logoX,
          y: logoY,
          w: logoSize,
          h: logoSize,
          fit: 'contain'
        },
        {
          id: 'sku',
          type: 'text',
          source: 'sku',
          x: skuX,
          y: skuY,
          w: skuW,
          h: skuH,
          fontSize: 18,
          fontWeight: '800',
          wrap: true,
          align: 'center',
          vAlign: 'center',
          lineHeight: 1.15
        },
        {
          id: 'qr',
          type: 'image',
          source: 'qr',
          x: qrX,
          y: qrY,
          w: qrWidth,
          h: qrHeight,
          fit: 'fill'
        }
      ]
    };
  }

  // Layout fijo para cada empresa (mismo formato, cambia sólo el logo)
  function getCasaRenaultStickerLayout() {
    return buildUnifiedStickerLayout(STICKER_LOGO_URLS.CASA_RENAULT);
  }

  function getServitecaShelbyStickerLayout() {
    return buildUnifiedStickerLayout(STICKER_LOGO_URLS.SERVITECA_SHELBY);
  }

  // IDs específicos de empresas configuradas para stickers
  // Actualizar estos IDs con los IDs reales de MongoDB
  // IDs de MongoDB para detección de empresas (opcional - si son null, se detecta por nombre)
  // Para obtener los IDs: ejecutar "node Backend/get-company-ids.js" después de crear las empresas
  const STICKER_COMPANY_IDS = {
    CASA_RENAULT: '68c871198d7595062498d7a1', // ID de MongoDB de Casa Renault (se detecta por nombre si es null)
    SERVITECA_SHELBY: '68cb18f4202d108152a26e4c' // ID de MongoDB de Serviteca Shelby (se detecta por nombre si es null)
  };

  // URLs de los logos de stickers (se pueden usar desde assets o desde uploads/public)
  const STICKER_LOGO_URLS = {
    CASA_RENAULT: 'assets/img/stickersrenault.png', // Imagen: stickersrenault.png
    SERVITECA_SHELBY: 'assets/img/stickersshelby.png' // Imagen: stickersshelby.png
  };

  // Función que detecta la empresa por ID y devuelve el layout correcto
  async function getStickerLayoutForCompany() {
    try {
      // Obtener información de la empresa actual
      const companyInfo = await API.companyMe().catch(() => null);
      const companyId = companyInfo?.company?.id || companyInfo?.company?._id || '';
      const companyName = (companyInfo?.company?.name || '').toLowerCase().trim();
      
      // Detectar empresa por ID (más preciso)
      const companyIdStr = String(companyId);
      
      if (STICKER_COMPANY_IDS.SERVITECA_SHELBY && companyIdStr === String(STICKER_COMPANY_IDS.SERVITECA_SHELBY)) {
        console.log('🏷️ Detectada Serviteca Shelby por ID - usando layout de Shelby');
        return getServitecaShelbyStickerLayout();
      } else if (STICKER_COMPANY_IDS.CASA_RENAULT && companyIdStr === String(STICKER_COMPANY_IDS.CASA_RENAULT)) {
        console.log('🏷️ Detectada Casa Renault por ID - usando layout de Renault');
        return getCasaRenaultStickerLayout();
      }
      
      // Fallback: Detectar por nombre si los IDs no están configurados
      if (companyName.includes('shelby')) {
        console.log('🏷️ Detectada Serviteca Shelby por nombre - usando layout de Shelby');
        return getServitecaShelbyStickerLayout();
      } else if (companyName.includes('renault')) {
        console.log('🏷️ Detectada Casa Renault por nombre - usando layout de Renault');
        return getCasaRenaultStickerLayout();
      }
      
      // Por defecto, usar layout de Casa Renault (compatibilidad)
      console.log('🏷️ Empresa no reconocida, usando layout por defecto (Casa Renault)');
      return getCasaRenaultStickerLayout();
    } catch (error) {
      console.warn('⚠️ Error detectando empresa, usando layout por defecto:', error);
      // Por defecto, usar layout de Casa Renault
      return getCasaRenaultStickerLayout();
    }
  }

  async function waitForImagesSafe(rootEl, timeoutMs = 4000) {
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

  // Ajusta dinámicamente el tamaño de fuente de los textos dentro del sticker
  // para que no se salgan de su cuadro (solo reduce, nunca aumenta).
  // CRÍTICO: Cada elemento se procesa de forma COMPLETAMENTE INDEPENDIENTE
  async function autoFitStickerTexts(rootEl) {
    if (!rootEl) return;

    const candidates = rootEl.querySelectorAll('.st-el');
    // CRÍTICO: Procesar cada elemento de forma INDEPENDIENTE
    // Usar Promise.all para procesar en paralelo, pero cada uno de forma aislada
    const promises = Array.from(candidates).map(async (wrapper) => {
      // Solo ajustar textos, no imágenes
      const hasImg = wrapper.querySelector('img');
      if (hasImg) return; // Saltar imágenes
      
      // CRÍTICO: Crear un scope aislado para cada elemento
      // Esto asegura que los cambios en un elemento NO afecten a otros
      await processElementIndependently(wrapper);
    });
    
    await Promise.all(promises);
  }
  
  // CRÍTICO: Procesar cada elemento de forma completamente independiente
  async function processElementIndependently(wrapper) {
    try {
      // CRÍTICO: Leer dimensiones REALES del wrapper desde el estilo inline que viene del layout
      // El layout genera HTML con estilos inline como: style="position:absolute;left:6px;top:6px;width:89px;height:24px;..."
      // Debemos leer estos valores directamente del estilo inline, NO de getBoundingClientRect
      // porque getBoundingClientRect puede estar afectado por zoom, transform, etc.
      
      const inlineStyle = wrapper.getAttribute('style') || '';
      
      // CRÍTICO: Extraer valores del estilo inline usando regex
      const extractPxValue = (style, prop) => {
        const regex = new RegExp(`${prop}:\\s*([\\d.]+)px`, 'i');
        const match = style.match(regex);
        return match ? parseFloat(match[1]) : null;
      };
      
      // Leer dimensiones y posición del estilo inline
      let wrapperLeft = extractPxValue(inlineStyle, 'left') || 0;
      let wrapperTop = extractPxValue(inlineStyle, 'top') || 0;
      let wrapperWidth = extractPxValue(inlineStyle, 'width') || 0;
      let wrapperHeight = extractPxValue(inlineStyle, 'height') || 0;
      
      // Si no se encontraron en el estilo inline, intentar leer del estilo computado
      if (!wrapperWidth || !wrapperHeight) {
        const wrapperStyle = window.getComputedStyle(wrapper);
        const wrapperRect = wrapper.getBoundingClientRect();
        
        // Intentar leer del estilo inline directamente
        const inlineWidth = wrapper.style.width;
        const inlineHeight = wrapper.style.height;
        
        if (inlineWidth && inlineWidth.includes('px')) {
          wrapperWidth = parseFloat(inlineWidth);
        } else {
          wrapperWidth = wrapperRect.width;
        }
        
        if (inlineHeight && inlineHeight.includes('px')) {
          wrapperHeight = parseFloat(inlineHeight);
        } else {
          wrapperHeight = wrapperRect.height;
        }
      }
      
      // Si aún no tenemos valores, usar getBoundingClientRect como último recurso
      if (!wrapperWidth || !wrapperHeight) {
        const wrapperRect = wrapper.getBoundingClientRect();
        wrapperWidth = wrapperWidth || wrapperRect.width;
        wrapperHeight = wrapperHeight || wrapperRect.height;
      }
      
      // CRÍTICO: Forzar dimensiones EXACTAS del wrapper desde el layout
      // Esto asegura que el wrapper respete las dimensiones definidas en el layout
      wrapper.style.setProperty('position', 'absolute', 'important');
      wrapper.style.setProperty('left', `${wrapperLeft}px`, 'important');
      wrapper.style.setProperty('top', `${wrapperTop}px`, 'important');
      wrapper.style.setProperty('width', `${wrapperWidth}px`, 'important');
      wrapper.style.setProperty('height', `${wrapperHeight}px`, 'important');
      wrapper.style.setProperty('max-width', `${wrapperWidth}px`, 'important');
      wrapper.style.setProperty('max-height', `${wrapperHeight}px`, 'important');
      wrapper.style.setProperty('min-width', `${wrapperWidth}px`, 'important');
      wrapper.style.setProperty('min-height', `${wrapperHeight}px`, 'important');
      
      // Obtener ID del elemento una sola vez para usar en toda la función
      const elementId = wrapper.getAttribute('data-id') || '';
      
      // Para SKU y nombre, usar overflow visible para que el texto se vea
      if (elementId === 'sku' || elementId === 'name') {
        wrapper.style.setProperty('overflow', 'visible', 'important');
        wrapper.style.setProperty('z-index', elementId === 'sku' ? '20' : '15', 'important');
      } else {
        wrapper.style.setProperty('overflow', 'hidden', 'important');
        wrapper.style.setProperty('z-index', '1', 'important');
      }
      wrapper.style.setProperty('box-sizing', 'border-box', 'important');
      
      // CRÍTICO: Leer padding del wrapper DESPUÉS de forzar dimensiones
      const wrapperStyle = window.getComputedStyle(wrapper);
      const paddingLeft = parseFloat(wrapperStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(wrapperStyle.paddingRight) || 0;
      const paddingTop = parseFloat(wrapperStyle.paddingTop) || 0;
      const paddingBottom = parseFloat(wrapperStyle.paddingBottom) || 0;
      
      // CRÍTICO: Calcular dimensiones del target restando padding del wrapper
      const targetWidth = Math.max(0, wrapperWidth - paddingLeft - paddingRight);
      const targetHeight = Math.max(0, wrapperHeight - paddingTop - paddingBottom);
      
      // El HTML de texto con wrap viene como: <div class="st-el"...><div>Texto</div></div>
      // CRÍTICO: Para SKU y nombre, siempre buscar el div interno primero
      let target = wrapper.querySelector('div');
      if (!target || target === wrapper) {
        // Si no hay div interno, usar el wrapper mismo como target
        target = wrapper;
        target.style.setProperty('white-space', 'normal', 'important');
        target.style.setProperty('word-wrap', 'break-word', 'important');
        target.style.setProperty('word-break', 'break-word', 'important');
        target.style.setProperty('overflow-wrap', 'break-word', 'important');
      }
      
      // CRÍTICO: Para elementos de nombre, usar configuración especial para asegurar visibilidad y wrap
      if (elementId === 'name') {
        // Para nombre, asegurar que el texto sea visible, haga wrap y ocupe TODO el espacio disponible
        target.style.setProperty('width', `${targetWidth}px`, 'important');
        target.style.setProperty('max-width', `${targetWidth}px`, 'important');
        target.style.setProperty('min-width', `${targetWidth}px`, 'important'); // Ancho mínimo para ocupar todo
        target.style.setProperty('height', `${targetHeight}px`, 'important'); // Altura fija para ocupar todo el espacio
        target.style.setProperty('max-height', `${targetHeight}px`, 'important');
        target.style.setProperty('min-height', `${targetHeight}px`, 'important'); // Altura mínima para ocupar todo
        target.style.setProperty('overflow', 'hidden', 'important'); // Hidden para que el texto no se salga del contenedor
        target.style.setProperty('color', '#000000', 'important'); // Asegurar color negro
        target.style.setProperty('font-size', '4px', 'important'); // Forzar 4px
        target.style.setProperty('visibility', 'visible', 'important');
        target.style.setProperty('opacity', '1', 'important');
        // CRÍTICO: Asegurar que el texto haga wrap correctamente y ocupe todo el espacio
        target.style.setProperty('white-space', 'normal', 'important');
        target.style.setProperty('word-wrap', 'break-word', 'important');
        target.style.setProperty('word-break', 'break-word', 'important');
        target.style.setProperty('overflow-wrap', 'break-word', 'important');
        target.style.setProperty('hyphens', 'auto', 'important');
        // CRÍTICO: Para nombre, asegurar que el contenedor padre use flex para centrar
        // y el texto interno use block para permitir saltos de línea
        const parent = target.parentElement;
        if (parent && parent.classList.contains('st-el') && parent.getAttribute('data-id') === 'name') {
          parent.style.setProperty('display', 'flex', 'important');
          parent.style.setProperty('align-items', 'center', 'important');
          parent.style.setProperty('justify-content', 'center', 'important');
          parent.style.setProperty('flex-direction', 'column', 'important');
        }
        // El texto interno usa block para permitir múltiples líneas
        target.style.setProperty('display', 'block', 'important');
        target.style.setProperty('text-align', 'center', 'important');
        target.style.setProperty('line-height', '1.5', 'important');
        target.style.setProperty('padding', '2px', 'important');
        target.style.setProperty('width', '100%', 'important');
        target.style.setProperty('max-width', '100%', 'important');
      } else {
        // CRÍTICO: Forzar dimensiones EXACTAS en el target para que ocupe TODO el espacio disponible
        // PERO permitir que el contenido haga wrap correctamente
        target.style.setProperty('width', `${targetWidth}px`, 'important');
        target.style.setProperty('max-width', `${targetWidth}px`, 'important');
        target.style.setProperty('min-width', '0', 'important'); // Permitir que se reduzca si es necesario
        // CRÍTICO: NO usar height fijo, usar max-height para permitir que el contenido crezca hasta el límite
        target.style.setProperty('max-height', `${targetHeight}px`, 'important');
        target.style.setProperty('min-height', '0', 'important');
        target.style.setProperty('height', 'auto', 'important'); // Permitir que la altura se ajuste al contenido
        // CRÍTICO: Usar overflow: hidden para cortar contenido que se salga
        target.style.setProperty('overflow', 'hidden', 'important');
      }
      // CRÍTICO: Mejorar wrap de texto - forzar todas las propiedades necesarias
      target.style.setProperty('word-wrap', 'break-word', 'important');
      target.style.setProperty('word-break', 'break-word', 'important');
      target.style.setProperty('overflow-wrap', 'break-word', 'important');
      target.style.setProperty('hyphens', 'auto', 'important');
      target.style.setProperty('-webkit-hyphens', 'auto', 'important');
      target.style.setProperty('-moz-hyphens', 'auto', 'important');
      target.style.setProperty('box-sizing', 'border-box', 'important');
      target.style.setProperty('white-space', 'normal', 'important'); // CRÍTICO: normal permite wrap
      // Para nombre, el display ya se configuró arriba como flex con wrap
      if (elementId !== 'name') {
        target.style.setProperty('display', 'block', 'important');
      }
      target.style.setProperty('margin', '0', 'important');
      // Para nombre, mantener el padding que viene del HTML
      if (elementId !== 'name') {
        target.style.setProperty('padding', '0', 'important');
      }
      
      // CRÍTICO: El overflow del wrapper ya se configuró arriba según el tipo de elemento (SKU/name: visible, otros: hidden)
      // No sobrescribir aquí para mantener la configuración correcta
      
      // Forzar reflow para que el navegador calcule las dimensiones correctamente
      void target.offsetHeight;
      void wrapper.offsetHeight;
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      // Obtener fontSize y lineHeight iniciales del estilo
      const targetStyle = window.getComputedStyle(target);
      let fontSize = parseFloat(targetStyle.fontSize || '0');
      if (!fontSize || fontSize <= 0) {
        // Para nombre, usar 4px por defecto
        if (elementId === 'name') {
          fontSize = 4;
        } else {
          fontSize = 12; // Default para otros elementos
        }
      }
      // CRÍTICO: Para nombre, asegurar que el fontSize sea exactamente 4px
      if (elementId === 'name') {
        fontSize = 4;
        target.style.setProperty('font-size', '4px', 'important');
      }
      
      // Obtener line-height inicial
      let lineHeight = parseFloat(targetStyle.lineHeight);
      if (!lineHeight || isNaN(lineHeight) || lineHeight <= 0) {
        lineHeight = fontSize * 1.2;
      } else if (lineHeight < 1) {
        lineHeight = fontSize * lineHeight;
      }
      const lineHeightRatio = lineHeight / fontSize;

      // CRÍTICO: Límites para el ajuste - permitir fuentes muy pequeñas
      // Determinar tamaño mínimo de fuente según el tipo de elemento (elementId ya está declarado arriba)
      let minFont = 2; // px - mínimo general
      if (elementId === 'sku') {
        minFont = 8; // SKU debe tener mínimo 8px para ser visible
      } else if (elementId === 'name') {
        minFont = 4; // Nombre debe tener exactamente 4px como solicitado
      }
      const minLineHeight = 3; // px - reducido proporcionalmente
      const maxIterations = 200; // Aumentado para mejor ajuste
      let iter = 0;

      // CRÍTICO: Función para verificar si el texto cabe correctamente
      const fits = () => {
        void target.offsetHeight;
        void wrapper.offsetHeight;
        
        // CRÍTICO: Verificar dimensiones REALES del target después del wrap
        const targetRect = target.getBoundingClientRect();
        const scrollWidth = target.scrollWidth;
        const scrollHeight = target.scrollHeight;
        
        // CRÍTICO: Verificar que el contenido NO se salga del contenedor
        // Usar tolerancia de 1px para evitar falsos positivos por redondeo
        const overflowsVert = scrollHeight > targetHeight + 1;
        const overflowsHoriz = scrollWidth > targetWidth + 1;
        
        // CRÍTICO: Si hay overflow, NO cabe - esto es lo más importante
        if (overflowsVert || overflowsHoriz) {
          return false;
        }
        
        // Si no hay overflow, está bien
        return true;
      };

      // Aplicar fontSize y lineHeight iniciales
      // CRÍTICO: Para nombre, asegurar que siempre sea 4px y visible
      if (elementId === 'name') {
        fontSize = 4;
        target.style.setProperty('font-size', '4px', 'important');
        target.style.setProperty('color', '#000000', 'important');
        target.style.setProperty('visibility', 'visible', 'important');
        target.style.setProperty('opacity', '1', 'important');
      } else {
        target.style.setProperty('font-size', `${fontSize}px`, 'important');
      }
      target.style.setProperty('line-height', `${lineHeight}px`, 'important');
      
      // Forzar reflow inicial
      void target.offsetHeight;
      void wrapper.offsetHeight;
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      // CRÍTICO: Verificar overflow inicial DESPUÉS de forzar dimensiones
      const targetRect = target.getBoundingClientRect();
      const scrollWidth = target.scrollWidth;
      const scrollHeight = target.scrollHeight;
      const hasOverflow = scrollWidth > targetWidth + 1 || scrollHeight > targetHeight + 1;
      
      // CRÍTICO: Si hay overflow, reducir fontSize INMEDIATAMENTE sin intentar expandir
      if (hasOverflow) {
        // Ir directamente al bucle de reducción de fontSize
      } else {
        // Si NO hay overflow, está bien - no necesitamos verificar uso de espacio vertical
        return; // El texto ya está bien ajustado
      }
      
      // Código para expandir line-height (solo si no hay overflow y queremos usar más espacio)
      if (false) {
        // Si NO hay overflow pero el texto NO ocupa suficiente espacio vertical, intentar expandir line-height
        // Calcular cuántas líneas de texto hay actualmente
        const currentLines = Math.ceil(scrollHeight / lineHeight) || 1;
        // Calcular el line-height necesario para ocupar más espacio vertical
        const targetLineHeight = targetHeight / currentLines;
        
        // Aumentar line-height si es razonable (máximo 2x el fontSize)
        if (targetLineHeight > lineHeight && targetLineHeight <= fontSize * 2.5) {
          lineHeight = targetLineHeight;
          target.style.setProperty('line-height', `${lineHeight}px`, 'important');
          void target.offsetHeight;
          await new Promise(resolve => requestAnimationFrame(resolve));
          
          // Verificar nuevamente después del ajuste
          const newScrollHeight = target.scrollHeight;
          const newHasOverflow = newScrollHeight > targetHeight + 2;
          
          // Si después de aumentar line-height hay overflow, revertir y reducir fontSize
          if (newHasOverflow) {
            lineHeight = fontSize * lineHeightRatio;
            target.style.setProperty('line-height', `${lineHeight}px`, 'important');
            void target.offsetHeight;
            // Continuar al bucle de reducción de fontSize
          }
        }
      }

      // CRÍTICO: Si hay overflow, reducir fontSize hasta que quepa
      // Este bucle es CRÍTICO para evitar que el texto se salga del contenedor
      // PERO para nombre, no reducir por debajo de 4px y asegurar visibilidad
      while (!fits() && fontSize > minFont && iter < maxIterations) {
        // CRÍTICO: Para nombre, no reducir más si ya está en 4px
        if (elementId === 'name' && fontSize <= 4) {
          // Asegurar que el texto sea visible incluso si hay overflow
          target.style.setProperty('color', '#000000', 'important');
          target.style.setProperty('visibility', 'visible', 'important');
          target.style.setProperty('opacity', '1', 'important');
          target.style.setProperty('overflow', 'visible', 'important');
          break; // Salir del bucle para nombre en 4px
        }
        
        const currentScrollWidth = target.scrollWidth;
        const currentScrollHeight = target.scrollHeight;
        
        // Calcular ratio de overflow
        const overflowRatioX = currentScrollWidth / Math.max(1, targetWidth);
        const overflowRatioY = currentScrollHeight / Math.max(1, targetHeight);
        const maxOverflow = Math.max(overflowRatioX, overflowRatioY);
        
        // CRÍTICO: Reducir fontSize más agresivamente si el overflow es grande
        let reductionStep;
        if (maxOverflow > 2.0) {
          reductionStep = 1.0; // Reducción grande para overflow muy grande
        } else if (maxOverflow > 1.5) {
          reductionStep = 0.5; // Reducción media
        } else {
          reductionStep = 0.2; // Reducción pequeña
        }
        
        fontSize = Math.max(minFont, fontSize - reductionStep);
        
        // Ajustar line-height proporcionalmente manteniendo el ratio
        lineHeight = Math.max(minLineHeight, fontSize * lineHeightRatio);
        
        // CRÍTICO: Para nombre, asegurar que siempre sea 4px y visible
        if (elementId === 'name') {
          fontSize = 4;
          target.style.setProperty('font-size', '4px', 'important');
          target.style.setProperty('color', '#000000', 'important');
          target.style.setProperty('visibility', 'visible', 'important');
          target.style.setProperty('opacity', '1', 'important');
        } else {
          target.style.setProperty('font-size', `${fontSize}px`, 'important');
        }
        target.style.setProperty('line-height', `${lineHeight}px`, 'important');
        iter += 1;
        
        // CRÍTICO: Forzar reflow después de cada cambio
        void target.offsetHeight;
        void wrapper.offsetHeight;
        
        // Pequeña pausa cada 5 iteraciones para permitir renderizado
        if (iter % 5 === 0) {
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }
      
      // CRÍTICO: Después de reducir, verificar que NO haya overflow
      // CRÍTICO: Para nombre, asegurar que siempre sea visible al final
      if (elementId === 'name') {
        target.style.setProperty('font-size', '4px', 'important');
        target.style.setProperty('color', '#000000', 'important');
        target.style.setProperty('visibility', 'visible', 'important');
        target.style.setProperty('opacity', '1', 'important');
        target.style.setProperty('overflow', 'visible', 'important');
      }
      
      void target.offsetHeight;
      void wrapper.offsetHeight;
      const finalScrollWidth = target.scrollWidth;
      const finalScrollHeight = target.scrollHeight;
      const finalHasOverflow = finalScrollWidth > targetWidth + 2 || finalScrollHeight > targetHeight + 2;
      
      // Si aún hay overflow después de todas las iteraciones, forzar tamaño mínimo
      if (finalHasOverflow && fontSize > minFont) {
        fontSize = minFont;
        lineHeight = Math.max(minLineHeight, fontSize * lineHeightRatio);
        target.style.setProperty('font-size', `${fontSize}px`, 'important');
        target.style.setProperty('line-height', `${lineHeight}px`, 'important');
        void target.offsetHeight;
        void wrapper.offsetHeight;
      }
      
      // CRÍTICO: Solo intentar expandir verticalmente si NO hay overflow
      if (!finalHasOverflow && finalScrollHeight < targetHeight * 0.90) {
        // Aumentar line-height para ocupar más espacio vertical
        const currentLines = Math.ceil(finalScrollHeight / lineHeight) || 1;
        const targetLineHeight = targetHeight / currentLines;
        if (targetLineHeight > lineHeight && targetLineHeight <= fontSize * 2.5) {
          lineHeight = targetLineHeight;
          target.style.setProperty('line-height', `${lineHeight}px`, 'important');
          void target.offsetHeight;
          void wrapper.offsetHeight;
          
          // Verificar que no se haya creado overflow
          const newScrollHeight = target.scrollHeight;
          if (newScrollHeight > targetHeight + 2) {
            // Si se creó overflow, revertir
            lineHeight = fontSize * lineHeightRatio;
            target.style.setProperty('line-height', `${lineHeight}px`, 'important');
            void target.offsetHeight;
          }
        }
      }
    } catch (err) {
      // Si hay un error procesando este elemento, continuar con los demás
      console.warn('Error procesando elemento:', err);
    }
  }

  // Función auxiliar: crear contenedor aislado para captura de stickers
  function createIsolatedCaptureContainer(widthPx, heightPx) {
    const root = document.createElement('div');
    root.id = 'sticker-pdf-capture-root';
    
    // CRÍTICO: Limpiar cualquier estilo que pueda venir por defecto
    root.removeAttribute('style');
    root.style.cssText = ''; // Limpiar completamente
    
    // Aplicar estilos directamente sin depender de CSS global
    // Usar setProperty para máxima prioridad y sobrescribir cualquier CSS global
    root.style.setProperty('position', 'fixed', 'important');
    root.style.setProperty('left', '-20000px', 'important');
    root.style.setProperty('top', '0', 'important');
    root.style.setProperty('width', `${widthPx}px`, 'important');
    root.style.setProperty('height', `${heightPx}px`, 'important');
    root.style.setProperty('min-width', `${widthPx}px`, 'important');
    root.style.setProperty('min-height', `${heightPx}px`, 'important');
    root.style.setProperty('max-width', `${widthPx}px`, 'important');
    root.style.setProperty('max-height', `${heightPx}px`, 'important');
    root.style.setProperty('overflow', 'visible', 'important');
    root.style.setProperty('z-index', '-9999', 'important');
    root.style.setProperty('background', '#fff', 'important');
      root.style.setProperty('transform', 'none', 'important');
    root.style.setProperty('-webkit-transform', 'none', 'important');
    root.style.setProperty('-moz-transform', 'none', 'important');
    root.style.setProperty('-ms-transform', 'none', 'important');
    root.style.setProperty('-o-transform', 'none', 'important');
      root.style.setProperty('zoom', '1', 'important');
      root.style.setProperty('scale', '1', 'important');
    root.style.setProperty('margin', '0', 'important');
    root.style.setProperty('padding', '0', 'important');
    root.style.setProperty('box-sizing', 'border-box', 'important');
    root.style.setProperty('display', 'block', 'important');
    root.style.setProperty('float', 'none', 'important');
    root.style.setProperty('clear', 'both', 'important');
    
    document.body.appendChild(root);
    return root;
  }

  // Función auxiliar: crear box de sticker con dimensiones exactas
  function createStickerBox(widthPx, heightPx) {
      const box = document.createElement('div');
      box.className = 'sticker-capture';
    
    // CRÍTICO: Limpiar cualquier estilo que pueda venir por defecto
    box.removeAttribute('style');
    box.style.cssText = ''; // Limpiar completamente
    
    // Establecer TODOS los estilos necesarios con setProperty para máxima prioridad
    box.style.setProperty('position', 'relative', 'important');
    box.style.setProperty('width', `${widthPx}px`, 'important');
    box.style.setProperty('height', `${heightPx}px`, 'important');
    box.style.setProperty('min-width', `${widthPx}px`, 'important');
    box.style.setProperty('min-height', `${heightPx}px`, 'important');
    box.style.setProperty('max-width', `${widthPx}px`, 'important');
    box.style.setProperty('max-height', `${heightPx}px`, 'important');
    box.style.setProperty('overflow', 'hidden', 'important');
    box.style.setProperty('background', '#fff', 'important');
    box.style.setProperty('box-sizing', 'border-box', 'important');
    box.style.setProperty('margin', '0', 'important');
    box.style.setProperty('padding', '0', 'important');
    box.style.setProperty('transform', 'none', 'important');
    box.style.setProperty('-webkit-transform', 'none', 'important');
    box.style.setProperty('-moz-transform', 'none', 'important');
    box.style.setProperty('-ms-transform', 'none', 'important');
    box.style.setProperty('-o-transform', 'none', 'important');
    box.style.setProperty('zoom', '1', 'important');
    box.style.setProperty('scale', '1', 'important');
    box.style.setProperty('display', 'block', 'important');
    box.style.setProperty('float', 'none', 'important');
    box.style.setProperty('clear', 'both', 'important');
    
    return box;
  }

  // Función auxiliar: generar CSS para sticker box
  function generateStickerCaptureCSS(widthPx, heightPx) {
    return `
      /* CRÍTICO: Proteger contra estilos globales - Reset completo para el contenedor de stickers */
      #sticker-pdf-capture-root {
        zoom: 1 !important;
        transform: none !important;
        -webkit-transform: none !important;
        -moz-transform: none !important;
        -ms-transform: none !important;
        -o-transform: none !important;
        scale: 1 !important;
        font-size: 16px !important; /* Reset font-size para evitar escalado */
      }
      
      /* CRÍTICO: Proteger contra zoom global del HTML */
      #sticker-pdf-capture-root * {
        zoom: 1 !important;
        transform: none !important;
        -webkit-transform: none !important;
        -moz-transform: none !important;
        -ms-transform: none !important;
        -o-transform: none !important;
        scale: 1 !important;
      }
      
        .sticker-capture {
          position: relative !important;
        width: ${widthPx}px !important;
        height: ${heightPx}px !important;
        max-width: ${widthPx}px !important;
        max-height: ${heightPx}px !important;
        min-width: ${widthPx}px !important;
        min-height: ${heightPx}px !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 0 !important;
          display: block !important;
          transform: none !important;
        zoom: 1 !important;
        scale: 1 !important;
        font-size: 16px !important; /* Reset font-size */
        }
        .sticker-wrapper {
          position: relative !important;
        width: ${widthPx}px !important;
        height: ${heightPx}px !important;
        max-width: ${widthPx}px !important;
        max-height: ${heightPx}px !important;
        min-width: ${widthPx}px !important;
        min-height: ${heightPx}px !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 0 !important;
          left: 0 !important;
          top: 0 !important;
        right: auto !important;
        bottom: auto !important;
          transform: none !important;
          -webkit-transform: none !important;
          -moz-transform: none !important;
          -ms-transform: none !important;
          -o-transform: none !important;
        zoom: 1 !important;
        scale: 1 !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        float: none !important;
        clear: both !important;
      }
      
      /* CRÍTICO: Asegurar que ningún CSS global afecte las dimensiones y colores */
      #sticker-pdf-capture-root * {
        box-sizing: border-box !important;
        zoom: 1 !important;
        transform: none !important;
        -webkit-transform: none !important;
        -moz-transform: none !important;
        -ms-transform: none !important;
        -o-transform: none !important;
        scale: 1 !important;
      }
      
      /* CRÍTICO: Proteger contra estilos de tema claro que cambian colores */
      #sticker-pdf-capture-root .st-el[data-id*="sku"] *,
      #sticker-pdf-capture-root .st-el[data-id*="name"] * {
        color: #000000 !important;
        background-color: inherit !important;
      }
      
      /* CRÍTICO: Proteger contra font-size global que cambia según viewport */
      #sticker-pdf-capture-root .st-el[data-id*="sku"] {
        font-size: inherit !important;
      }
      
      #sticker-pdf-capture-root .st-el[data-id*="name"] {
        font-size: inherit !important;
      }
      
      #sticker-pdf-capture-root .sticker-capture,
      #sticker-pdf-capture-root .sticker-wrapper {
        transform: none !important;
        -webkit-transform: none !important;
        zoom: 1 !important;
        scale: 1 !important;
      }
      /* CRÍTICO: Proteger elementos del sticker contra estilos globales */
      #sticker-pdf-capture-root .st-el,
      .st-el {
        position: absolute !important;
        box-sizing: border-box !important;
        zoom: 1 !important;
        transform: none !important;
        -webkit-transform: none !important;
        -moz-transform: none !important;
        -ms-transform: none !important;
        -o-transform: none !important;
        scale: 1 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      /* CRÍTICO: Proteger elementos de texto contra estilos globales */
      #sticker-pdf-capture-root .st-el[data-id*="sku"],
      #sticker-pdf-capture-root .st-el[data-id*="name"],
      #sticker-pdf-capture-root .st-el[data-id*="custom"],
      .st-el[data-id*="sku"], .st-el[data-id*="name"], .st-el[data-id*="custom"] {
          overflow: hidden !important;
          white-space: normal !important;
          word-wrap: break-word !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          box-sizing: border-box !important;
          zoom: 1 !important;
          transform: none !important;
          -webkit-transform: none !important;
          -moz-transform: none !important;
          -ms-transform: none !important;
          -o-transform: none !important;
          scale: 1 !important;
          margin: 0 !important;
      }
      /* CRÍTICO: Proteger SKU contra estilos globales */
      #sticker-pdf-capture-root .st-el[data-id*="sku"] > div,
      .st-el[data-id*="sku"] > div {
          overflow: visible !important;
          word-wrap: break-word !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          box-sizing: border-box !important;
          display: block !important;
          max-width: 100% !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 100% !important;
          color: #000000 !important;
          visibility: visible !important;
          opacity: 1 !important;
          text-align: center !important;
          line-height: inherit !important;
          zoom: 1 !important;
          transform: none !important;
          -webkit-transform: none !important;
          -moz-transform: none !important;
          -ms-transform: none !important;
          -o-transform: none !important;
          scale: 1 !important;
        }
        .st-el[data-id*="name"] {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-direction: column !important;
        }
      /* CRÍTICO: Proteger nombre contra estilos globales - contenedor flex, texto interno block */
      #sticker-pdf-capture-root .st-el[data-id*="name"] {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-direction: column !important;
        }
      #sticker-pdf-capture-root .st-el[data-id*="name"] > div,
      #sticker-pdf-capture-root .st-el[data-id*="name"] .name-text-inner,
      .st-el[data-id*="name"] > div,
      .st-el[data-id*="name"] .name-text-inner {
          overflow: hidden !important;
          word-wrap: break-word !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          box-sizing: border-box !important;
          display: block !important;
          max-width: 100% !important;
          width: 100% !important;
          padding: 2px !important;
          margin: 0 !important;
          color: #000000 !important;
          visibility: visible !important;
          opacity: 1 !important;
          white-space: normal !important;
          text-align: center !important;
          line-height: 1.5 !important;
          font-size: 4px !important;
          font-weight: 600 !important;
          hyphens: auto !important;
          -webkit-hyphens: auto !important;
          -moz-hyphens: auto !important;
          zoom: 1 !important;
          transform: none !important;
          -webkit-transform: none !important;
          -moz-transform: none !important;
          -ms-transform: none !important;
          -o-transform: none !important;
          scale: 1 !important;
        }
        .st-el[data-id*="custom"] > div {
          overflow: visible !important;
          word-wrap: break-word !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
          box-sizing: border-box !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          max-width: 100% !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 100% !important;
          color: #000000 !important;
          visibility: visible !important;
          opacity: 1 !important;
      }
        .st-el[data-id*="sku"] {
          z-index: 20 !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        .st-el[data-id*="sku"] > div {
          color: #000000 !important;
          visibility: visible !important;
          opacity: 1 !important;
          font-weight: bold !important;
        }
        .st-el[data-id*="name"] {
          z-index: 15 !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        .st-el[data-id*="name"] > div {
          color: #000000 !important;
          visibility: visible !important;
          opacity: 1 !important;
          font-weight: 600 !important;
        }
        .st-el[data-id*="qr"] {
          z-index: 10 !important;
          position: absolute !important;
        }
        .st-el[data-id*="qr"] img {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          object-fit: contain !important;
          display: block !important;
        }
        .st-el[type="image"]:not([data-id*="qr"]) {
          z-index: 2 !important;
          position: absolute !important;
        }
        .st-el[data-id*="sku"] *, .st-el[data-id*="name"] *, .st-el[data-id*="custom"] * {
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
      `;
  }

  // Función para generar QR code usando el endpoint del backend
  async function generateQRCodeDataURL(itemId) {
    try {
      // Usar el endpoint existente del backend para obtener el QR
      const qrPath = buildQrPath(itemId, 600);
      const response = await fetch(`${apiBase}${qrPath}`, {
        headers: { ...authHeader() }
      });
      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } else {
        console.error('🏷️ [QR] Error al obtener QR:', response.status, response.statusText);
        return '';
      }
    } catch (e) {
      console.error('🏷️ [QR] Error generando QR:', e);
      return '';
    }
  }

  // Función para crear HTML del sticker directamente en el frontend
  // Función para segmentar texto largo automáticamente, insertando espacios para legibilidad
  function segmentTextForDisplay(text, maxCharsPerLine = 12) {
    if (!text || text.length <= maxCharsPerLine) return text;
    
    // Intentar detectar patrones comunes y separarlos
    let segmented = text;
    
    // Insertar espacios antes de números seguidos de letras (ej: "KIT04" -> "KIT 04")
    segmented = segmented.replace(/([A-Z]+)(\d+)/g, '$1 $2');
    // Insertar espacios después de números seguidos de letras (ej: "04KIT" -> "04 KIT")
    segmented = segmented.replace(/(\d+)([A-Z]+)/g, '$1 $2');
    
    // Detectar transiciones de minúsculas a mayúsculas (si las hay)
    segmented = segmented.replace(/([a-z])([A-Z])/g, '$1 $2');
    
    // Si el texto sigue siendo muy largo sin espacios, dividirlo inteligentemente
    if (segmented.length > maxCharsPerLine && !segmented.includes(' ')) {
      // Dividir en chunks de aproximadamente maxCharsPerLine caracteres
      // Intentar dividir en puntos naturales (después de números, antes de letras mayúsculas consecutivas)
      const chunks = [];
      let currentChunk = '';
      
      for (let i = 0; i < segmented.length; i++) {
        const char = segmented[i];
        const nextChar = segmented[i + 1];
        
        currentChunk += char;
        
        // Si el chunk alcanza el tamaño máximo, o si encontramos un punto natural de división
        if (currentChunk.length >= maxCharsPerLine) {
          // Buscar un punto natural de división (número seguido de letra o viceversa)
          if (i + 1 < segmented.length) {
            const isNumber = /\d/.test(char);
            const nextIsLetter = /[A-Z]/.test(nextChar);
            const isLetter = /[A-Z]/.test(char);
            const nextIsNumber = /\d/.test(nextChar);
            
            if ((isNumber && nextIsLetter) || (isLetter && nextIsNumber)) {
              // Este es un buen punto para dividir
              chunks.push(currentChunk);
              currentChunk = '';
            } else if (currentChunk.length >= maxCharsPerLine + 2) {
              // Forzar división si es muy largo
              chunks.push(currentChunk);
              currentChunk = '';
            }
          } else {
            chunks.push(currentChunk);
            currentChunk = '';
          }
        }
      }
      
      if (currentChunk) chunks.push(currentChunk);
      // Unir chunks con saltos de línea para forzar wrap
      segmented = chunks.join('\n');
    } else if (segmented.length > maxCharsPerLine) {
      // Si tiene espacios pero es muy largo, dividir en líneas
      const words = segmented.split(/\s+/);
      const lines = [];
      let currentLine = '';
      
      for (const word of words) {
        if (word.length > maxCharsPerLine) {
          // Si una palabra es muy larga, dividirla
          if (currentLine) {
            lines.push(currentLine.trim());
            currentLine = '';
          }
          // Dividir la palabra larga en chunks
          for (let i = 0; i < word.length; i += maxCharsPerLine) {
            const chunk = word.substring(i, i + maxCharsPerLine);
            if (chunk) lines.push(chunk);
          }
        } else {
          if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
            currentLine += (currentLine ? ' ' : '') + word;
          } else {
            if (currentLine) lines.push(currentLine.trim());
            currentLine = word;
          }
        }
      }
      if (currentLine) lines.push(currentLine.trim());
      // Unir líneas con saltos de línea para permitir wrap explícito
      segmented = lines.join('\n');
    }
    
    return segmented;
  }

  function createStickerHTML(item, layout, widthPx, heightPx) {
    console.log('🏷️ [HTML] Creando HTML del sticker');
    console.log('🏷️ [HTML] Dimensiones del sticker:', { widthPx, heightPx });
    console.log('🏷️ [HTML] Item completo:', item);
    
    // Obtener datos del item - verificar múltiples posibles nombres de propiedades
    const sku = String(item.sku || item.SKU || item.code || '').toUpperCase().trim();
    let name = String(item.name || item.nombre || item.description || '').toUpperCase().trim();
    
    // CRÍTICO: Segmentar el nombre automáticamente para que sea legible
    name = segmentTextForDisplay(name, 12); // Máximo 12 caracteres por línea aproximadamente
    console.log('🏷️ [HTML] Nombre segmentado:', { original: item.name || item.nombre || item.description, segmented: name });
    console.log('🏷️ [HTML] Datos extraídos del item:', { 
      sku, 
      name, 
      'item.sku': item.sku,
      'item.name': item.name,
      'item completo keys': Object.keys(item)
    });
    
    // Obtener posiciones del layout
    const logoEl = layout.elements.find(e => e.id === 'logo');
    const skuEl = layout.elements.find(e => e.id === 'sku');
    const nameEl = layout.elements.find(e => e.id === 'name');
    const qrEl = layout.elements.find(e => e.id === 'qr');
    
    console.log('🏷️ [HTML] Elementos encontrados:', {
      logo: logoEl ? { x: logoEl.x, y: logoEl.y, w: logoEl.w, h: logoEl.h, url: logoEl.url } : null,
      sku: skuEl ? { x: skuEl.x, y: skuEl.y, w: skuEl.w, h: skuEl.h, fontSize: skuEl.fontSize } : null,
      name: nameEl ? { x: nameEl.x, y: nameEl.y, w: nameEl.w, h: nameEl.h, fontSize: nameEl.fontSize } : null,
      qr: qrEl ? { x: qrEl.x, y: qrEl.y, w: qrEl.w, h: qrEl.h } : null
    });
    
    const logoUrl = logoEl?.url || '';
    
    const htmlParts = [];
    htmlParts.push(`<div class="sticker-wrapper" style="position:relative;width:${widthPx}px;height:${heightPx}px;max-width:${widthPx}px;max-height:${heightPx}px;min-width:${widthPx}px;min-height:${heightPx}px;box-sizing:border-box;overflow:hidden;background:#ffffff;margin:0;padding:0;">`);
    
    // Logo de Casa Renault (si existe)
    if (logoEl && logoUrl) {
      console.log('🏷️ [HTML] Agregando logo:', { url: logoUrl, x: logoEl.x, y: logoEl.y, w: logoEl.w, h: logoEl.h });
      htmlParts.push(`<div class="st-el" data-id="logo" style="position:absolute;left:${logoEl.x}px;top:${logoEl.y}px;width:${logoEl.w}px;height:${logoEl.h}px;box-sizing:border-box;z-index:2;"><img src="${logoUrl}" alt="Logo" style="width:100%;height:100%;object-fit:contain;display:block;margin:0;padding:0;" /></div>`);
    } else {
      console.warn('🏷️ [HTML] Logo no encontrado o URL vacía');
    }
    
    // SKU - asegurar que sea visible y esté al frente
    // Mostrar siempre el elemento SKU, incluso si está vacío (para debugging)
    if (skuEl) {
      const alignStyle = skuEl.align === 'center' ? 'center' : (skuEl.align === 'flex-end' ? 'flex-end' : 'flex-start');
      const justifyStyle = skuEl.vAlign === 'center' ? 'center' : (skuEl.vAlign === 'flex-end' ? 'flex-end' : 'flex-start');
      // Asegurar tamaño mínimo de fuente visible (mínimo 8px)
      const skuFontSize = Math.max(8, skuEl.fontSize || 8);
      const skuText = sku || 'NO SKU'; // Mostrar placeholder si está vacío
      console.log('🏷️ [HTML] Agregando SKU:', { x: skuEl.x, y: skuEl.y, w: skuEl.w, h: skuEl.h, fontSize: skuFontSize, text: skuText, original: sku });
      // Escapar HTML y asegurar visibilidad
      const skuEscaped = skuText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      // Simplificar HTML y asegurar visibilidad - usar display:block para texto
      htmlParts.push(`<div class="st-el st-text" data-id="sku" style="position:absolute;left:${skuEl.x}px;top:${skuEl.y}px;width:${skuEl.w}px;height:${skuEl.h}px;box-sizing:border-box;padding:2px;margin:0;z-index:20;background:transparent;overflow:visible;"><div style="font-size:${skuFontSize}px !important;font-weight:bold !important;color:#000000 !important;width:100% !important;height:100% !important;display:block !important;text-align:center !important;line-height:${skuEl.h}px !important;vertical-align:middle !important;visibility:visible !important;opacity:1 !important;">${skuEscaped}</div></div>`);
    } else {
      console.warn('🏷️ [HTML] SKU element no encontrado en layout');
    }
    
    // Nombre (con cuadro de fondo más tenue) - asegurar que ocupe todo el espacio sin sobreponerse
    // Mostrar siempre el elemento nombre, incluso si está vacío (para debugging)
    if (nameEl) {
      const alignStyle = nameEl.align === 'center' ? 'center' : (nameEl.align === 'flex-end' ? 'flex-end' : 'flex-start');
      const justifyStyle = nameEl.vAlign === 'center' ? 'center' : (nameEl.vAlign === 'flex-end' ? 'flex-end' : 'flex-start');
      // Tamaño de fuente exactamente 4px como solicitado
      const nameFontSize = 4;
      const nameText = name || 'NO NAME'; // Mostrar placeholder si está vacío
      // Permitir saltos de línea usando \n del segmentTextForDisplay
      const nameHtml = nameText.replace(/\n/g, '<br/>');
      console.log('🏷️ [HTML] Agregando Nombre:', { x: nameEl.x, y: nameEl.y, w: nameEl.w, h: nameEl.h, fontSize: nameFontSize, text: nameText, original: name, textLength: nameText.length });
      console.log('🏷️ [HTML] Nombre ocupa desde', nameEl.x, 'hasta', nameEl.x + nameEl.w, 'de', widthPx, 'px totales');
      // Escapar HTML
      const nameEscaped = nameText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      // Fondo gris más tenue (#f8f8f8) - asegurar que se vea
      // CRÍTICO: Asegurar que el texto ocupe TODO el espacio disponible y haga wrap correctamente
      const innerPadding = 2;
      // CRÍTICO: Usar un contenedor flex para centrar verticalmente, pero permitir saltos de línea en el texto interno
      // El contenedor externo usa flex para centrar, el interno usa block para permitir múltiples líneas
      htmlParts.push(`<div class="st-el st-text" data-id="name" style="position:absolute;left:${nameEl.x}px;top:${nameEl.y}px;width:${nameEl.w}px;height:${nameEl.h}px;box-sizing:border-box;padding:${innerPadding}px;margin:0;z-index:15;background-color:#f8f8f8 !important;border:1px solid #e0e0e0 !important;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-direction:column;"><div class="name-text-inner" style="font-size:${nameFontSize}px !important;font-weight:600 !important;color:#000000 !important;width:100% !important;max-width:100% !important;padding:2px !important;margin:0 !important;display:block !important;text-align:center !important;line-height:1.4 !important;white-space:normal !important;word-wrap:break-word !important;word-break:break-word !important;overflow-wrap:break-word !important;overflow:hidden !important;visibility:visible !important;opacity:1 !important;box-sizing:border-box !important;hyphens:auto !important;">${nameHtml}</div></div>`);
    } else {
      console.warn('🏷️ [HTML] Name element no encontrado en layout');
    }
    
    // QR (se agregará después cuando se genere)
    if (qrEl) {
      console.log('🏷️ [HTML] Agregando QR placeholder:', { x: qrEl.x, y: qrEl.y, w: qrEl.w, h: qrEl.h });
      htmlParts.push(`<div class="st-el" data-id="qr" style="position:absolute;left:${qrEl.x}px;top:${qrEl.y}px;width:${qrEl.w}px;height:${qrEl.h}px;box-sizing:border-box;z-index:10;"><img class="qr-img" src="" alt="QR" style="width:100%;height:100%;object-fit:contain;display:block;margin:0;padding:0;" /></div>`);
    } else {
      console.warn('🏷️ [HTML] QR element no encontrado');
    }
    
    htmlParts.push('</div>');
    const html = htmlParts.join('');
    console.log('🏷️ [HTML] HTML generado, longitud:', html.length);
    return html;
  }

  async function renderStickerPdf(list, filenameBase = 'stickers') {
    // CRÍTICO: Detectar empresa y usar layout correcto (Casa Renault o Serviteca Shelby)
    const layout = await getStickerLayoutForCompany();
    
    // Dimensiones exactas: 5cm x 3cm
    const widthCm = 5;
    const heightCm = 3;
    const widthPx = Math.round(widthCm * STICKER_PX_PER_CM); // 189px
    const heightPx = Math.round(heightCm * STICKER_PX_PER_CM); // 113px
    const widthMm = widthCm * 10; // 50mm
    const heightMm = heightCm * 10; // 30mm
    
    console.log(`📐 Dimensiones: ${widthCm}cm x ${heightCm}cm = ${widthPx}px x ${heightPx}px = ${widthMm}mm x ${heightMm}mm`);

    const html2canvas = await ensureHtml2Canvas();
    const jsPDF = await ensureJsPDF();

    // Crear contenedor aislado
    const root = createIsolatedCaptureContainer(widthPx, heightPx);

    // Procesar cada sticker directamente desde los items
    const images = [];
    for (const { it, count } of list) {
      for (let i = 0; i < count; i++) {
        // Generar QR code para este item usando el endpoint del backend
        const qrDataUrl = await generateQRCodeDataURL(it._id);
        
        // Crear HTML del sticker directamente en el frontend
        const html = createStickerHTML(it, layout, widthPx, heightPx);
        
        // Crear box con dimensiones exactas
        const box = createStickerBox(widthPx, heightPx);
      
      // CRÍTICO: Limpiar y establecer dimensiones exactas del box ANTES de insertar contenido
      box.removeAttribute('style');
      box.style.cssText = ''; // Limpiar completamente
      
      // Establecer TODOS los estilos necesarios con setProperty para máxima prioridad
      box.style.setProperty('position', 'relative', 'important');
      box.style.setProperty('width', `${widthPx}px`, 'important');
      box.style.setProperty('height', `${heightPx}px`, 'important');
      box.style.setProperty('min-width', `${widthPx}px`, 'important');
      box.style.setProperty('min-height', `${heightPx}px`, 'important');
      box.style.setProperty('max-width', `${widthPx}px`, 'important');
      box.style.setProperty('max-height', `${heightPx}px`, 'important');
      box.style.setProperty('overflow', 'hidden', 'important');
      box.style.setProperty('box-sizing', 'border-box', 'important');
      box.style.setProperty('margin', '0', 'important');
      box.style.setProperty('padding', '0', 'important');
      box.style.setProperty('transform', 'none', 'important');
      box.style.setProperty('-webkit-transform', 'none', 'important');
      box.style.setProperty('-moz-transform', 'none', 'important');
      box.style.setProperty('-ms-transform', 'none', 'important');
      box.style.setProperty('-o-transform', 'none', 'important');
      box.style.setProperty('zoom', '1', 'important');
      box.style.setProperty('scale', '1', 'important');
      box.style.setProperty('display', 'block', 'important');
      box.style.setProperty('visibility', 'visible', 'important');
      box.style.setProperty('opacity', '1', 'important');
      box.style.setProperty('float', 'none', 'important');
      box.style.setProperty('clear', 'both', 'important');
      
      // Inyectar CSS
      const style = document.createElement('style');
      style.textContent = generateStickerCaptureCSS(widthPx, heightPx);
      
      // Insertar HTML directamente
      box.innerHTML = html;
      
      // CRÍTICO: Forzar dimensiones del wrapper inmediatamente después de insertar HTML
      const wrapper = box.querySelector('.sticker-wrapper');
        if (wrapper) {
        // El HTML ya tiene las dimensiones correctas, pero forzarlas nuevamente para asegurar
        wrapper.style.setProperty('width', `${widthPx}px`, 'important');
        wrapper.style.setProperty('height', `${heightPx}px`, 'important');
        wrapper.style.setProperty('max-width', `${widthPx}px`, 'important');
        wrapper.style.setProperty('max-height', `${heightPx}px`, 'important');
        wrapper.style.setProperty('min-width', `${widthPx}px`, 'important');
        wrapper.style.setProperty('min-height', `${heightPx}px`, 'important');
        wrapper.style.setProperty('transform', 'none', 'important');
        wrapper.style.setProperty('zoom', '1', 'important');
      }
      
      // Actualizar QR code si está disponible
      const qrImg = box.querySelector('.qr-img');
      if (qrImg && qrDataUrl) {
        qrImg.src = qrDataUrl;
      }
      
      box.appendChild(style);
      
      // Agregar al DOM
      root.appendChild(box);
      
      // Esperar renderizado
        void box.offsetHeight;
        await new Promise(resolve => requestAnimationFrame(resolve));
      
      // Ajustar textos automáticamente para que quepan
      await autoFitStickerTexts(box);
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      // Esperar imágenes
      // eslint-disable-next-line no-await-in-loop
      await waitForImagesSafe(box, 4000);
      
      // Capturar con html2canvas - dimensiones exactas
      const scale = 3;
      // eslint-disable-next-line no-await-in-loop
      const canvas = await html2canvas(box, {
        width: widthPx,
        height: heightPx,
        backgroundColor: '#ffffff',
        scale: scale,
        windowWidth: widthPx,
        windowHeight: heightPx,
        useCORS: true,
        allowTaint: false,
        logging: false
      });
      
      // Agregar imagen al array
      images.push({
        data: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
        targetWidthMm: widthMm,
        targetHeightMm: heightMm
      });
      
      root.removeChild(box);
    }
    
    document.body.removeChild(root);

    // CRÍTICO: Crear PDF con dimensiones exactas SIN márgenes
    // Usar formato personalizado con dimensiones exactas en mm
    const orientation = widthMm >= heightMm ? 'landscape' : 'portrait';
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: [widthMm, heightMm], // 50mm x 30mm = 5cm x 3cm
      compress: false,
      precision: 16,
      putOnlyUsedFonts: true,
      floatPrecision: 16
    });
    
    // CRÍTICO: Eliminar TODOS los márgenes de forma agresiva ANTES de cualquier operación
    // jsPDF tiene márgenes por defecto que debemos eliminar completamente
    if (doc.internal) {
      // Eliminar márgenes del objeto interno INMEDIATAMENTE
        doc.internal.pageMargins = { top: 0, right: 0, bottom: 0, left: 0 };
      
      // Asegurar dimensiones exactas de la página
      if (doc.internal.pageSize) {
        doc.internal.pageSize.width = widthMm;
        doc.internal.pageSize.height = heightMm;
        // Sobrescribir métodos getWidth/getHeight para devolver valores exactos
        if (typeof doc.internal.pageSize.getWidth === 'function') {
          doc.internal.pageSize.getWidth = function() { return widthMm; };
        }
        if (typeof doc.internal.pageSize.getHeight === 'function') {
          doc.internal.pageSize.getHeight = function() { return heightMm; };
        }
      }
      
      // Eliminar márgenes de todas las formas posibles
      if (doc.internal.margins) {
        doc.internal.margins = { top: 0, right: 0, bottom: 0, left: 0 };
      }
      
      // CRÍTICO: Eliminar márgenes del objeto de página actual
      if (doc.internal.getCurrentPageInfo) {
        try {
          const pageInfo = doc.internal.getCurrentPageInfo();
          if (pageInfo && pageInfo.pageContext) {
            pageInfo.pageContext.margins = { top: 0, right: 0, bottom: 0, left: 0 };
          }
        } catch (e) {
          // Ignorar si no está disponible
        }
      }
      
      // CRÍTICO: Forzar que el área de dibujo sea igual al tamaño de la página
      if (doc.internal.scaleFactor) {
        // Asegurar que no haya escalado que cause márgenes
        const scaleFactor = doc.internal.scaleFactor;
        // El área de dibujo debe ser exactamente widthMm x heightMm
      if (doc.internal.pageSize) {
          doc.internal.pageSize.width = widthMm;
          doc.internal.pageSize.height = heightMm;
        }
      }
    }
    
    // Establecer página 1 y eliminar márgenes nuevamente
    doc.setPage(1);
    
    // Forzar eliminación de márgenes después de setPage
    if (doc.internal) {
      doc.internal.pageMargins = { top: 0, right: 0, bottom: 0, left: 0 };
      if (doc.internal.margins) {
        doc.internal.margins = { top: 0, right: 0, bottom: 0, left: 0 };
      }
      // Forzar dimensiones exactas nuevamente después de setPage
      if (doc.internal.pageSize) {
        doc.internal.pageSize.width = widthMm;
        doc.internal.pageSize.height = heightMm;
      }
      
      // CRÍTICO: Verificar y forzar dimensiones después de setPage
      const actualWidth = doc.internal.pageSize ? doc.internal.pageSize.getWidth() : widthMm;
      const actualHeight = doc.internal.pageSize ? doc.internal.pageSize.getHeight() : heightMm;
      if (Math.abs(actualWidth - widthMm) > 0.01 || Math.abs(actualHeight - heightMm) > 0.01) {
        console.warn(`⚠️ Dimensiones de página después de setPage: ${actualWidth}mm x ${actualHeight}mm, forzando: ${widthMm}mm x ${heightMm}mm`);
        if (doc.internal.pageSize) {
          doc.internal.pageSize.width = widthMm;
          doc.internal.pageSize.height = heightMm;
        }
      }
    }
    
    // Insertar imágenes ocupando TODO el espacio (0,0 hasta widthMm, heightMm)
    images.forEach((imgData, idx) => {
      if (idx > 0) {
        // Agregar nueva página con dimensiones exactas
        doc.addPage([widthMm, heightMm], orientation);
        
        // Eliminar márgenes en la nueva página
        if (doc.internal) {
          doc.internal.pageMargins = { top: 0, right: 0, bottom: 0, left: 0 };
          if (doc.internal.margins) {
            doc.internal.margins = { top: 0, right: 0, bottom: 0, left: 0 };
          }
          if (doc.internal.pageSize) {
            doc.internal.pageSize.width = widthMm;
            doc.internal.pageSize.height = heightMm;
          }
        }
      }
      
      // CRÍTICO: Insertar imagen desde (0,0) ocupando EXACTAMENTE widthMm x heightMm
      // Sin ningún margen, la imagen debe ocupar el 100% del espacio de la página
      const src = typeof imgData === 'string' ? imgData : imgData.data;
      
      // CRÍTICO: Obtener dimensiones reales de la página antes de insertar
      let pageWidth = widthMm;
      let pageHeight = heightMm;
      if (doc.internal && doc.internal.pageSize) {
        try {
          pageWidth = doc.internal.pageSize.getWidth();
          pageHeight = doc.internal.pageSize.getHeight();
        } catch (e) {
          pageWidth = widthMm;
          pageHeight = heightMm;
        }
      }
      
      // CRÍTICO: Si las dimensiones no coinciden, forzar las correctas
      if (Math.abs(pageWidth - widthMm) > 0.01 || Math.abs(pageHeight - heightMm) > 0.01) {
        console.warn(`⚠️ Dimensiones de página antes de insertar: ${pageWidth}mm x ${pageHeight}mm, forzando: ${widthMm}mm x ${heightMm}mm`);
        pageWidth = widthMm;
        pageHeight = heightMm;
        // Forzar dimensiones correctas
        if (doc.internal && doc.internal.pageSize) {
          doc.internal.pageSize.width = widthMm;
          doc.internal.pageSize.height = heightMm;
        }
      }
      
      // CRÍTICO: Insertar imagen ocupando TODO el espacio desde (0,0)
      // Usar las dimensiones exactas (widthMm, heightMm) para asegurar que ocupe 100%
      doc.addImage(
        src, 
        'PNG', 
        0,  // x = 0 (sin margen izquierdo, desde el borde)
        0,  // y = 0 (sin margen superior, desde el borde)
        widthMm,  // ancho = 50mm (5cm) - 100% de la página
        heightMm, // alto = 30mm (3cm) - 100% de la página
        undefined, 
        'FAST' // Usar FAST para mejor calidad
      );
      
      if (idx === 0) {
        console.log(`📄 PDF: Página ${idx + 1} - Dimensiones: ${widthMm}mm x ${heightMm}mm (${widthCm}cm x ${heightCm}cm)`);
        console.log(`📐 Imagen insertada en: (0, 0) ocupando 100% del espacio sin márgenes`);
      }
    });
    
    doc.save(`${filenameBase}.pdf`);
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

  // Extend item actions with publish toggle & public edit
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
  // PUBLISH MANAGEMENT END

  // ---- Boot ----
  console.log('🚀 Inicializando inventario...', { paging: state.paging });
  refreshIntakes();
  // Initial load: page 1, limit per page
  console.log('📞 Llamando refreshItems con:', { page: 1, limit: state.paging?.limit || 15 });
  refreshItems({ page: 1, limit: state.paging?.limit || 15 });
}

}
