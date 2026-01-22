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
  getItem: async (id) => {
    const r = await request(`/api/v1/inventory/items/${id}`);
    return r;
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
  
  // Hacer showBusy y hideBusy disponibles globalmente
  window.showBusy = showBusy;
  window.hideBusy = hideBusy;
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
  const itSalePrice = document.getElementById("it-salePrice");
  const itStock = document.getElementById("it-stock");
  const itFiles = document.getElementById("it-files");
  const itSave = document.getElementById("it-save");
  const itMinStock = document.getElementById("it-minStock");
  const itVehicleSearch = document.getElementById("it-vehicle-search");
  const itVehicleDropdown = document.getElementById("it-vehicle-dropdown");
  const itVehicleSelected = document.getElementById("it-vehicle-selected");
  let itSelectedVehicleTarget = "";

  const itemsList = document.getElementById("itemsList");

  // Filtros
  const qName = document.getElementById("q-name");
  const qApply = document.getElementById("q-apply");
  const qSku = document.getElementById("q-sku");
  const qBrand = document.getElementById("q-brand");
  const qVehicle = document.getElementById("q-vehicle");
  const qIntake = document.getElementById("q-intakeId");
  const qClear = document.getElementById("q-clear");
  const btnUnpublishZero = document.getElementById('btn-unpublish-zero');
  const btnPubGlobal = document.getElementById('pub-bulk-global');
  const btnReadQr = document.getElementById('btn-read-qr');

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

    if (qIntake) {
      qIntake.innerHTML =
        `<option value="">Todas las entradas</option>` +
        state.intakes
          .map((v) => `<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
          .join("");
    }

    renderIntakesList();
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
          <div>Venta: ${fmtMoney(it.salePrice)}</div>
          <div>Stock: <b>${it.stock}</b></div>
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

  async function openStockInModal(it){
    // Cargar proveedores e inversores
    let suppliers = [];
    let investors = [];
    try {
      suppliers = await request('/api/v1/purchases/suppliers');
      investors = await request('/api/v1/purchases/investors');
    } catch (e) {
      console.error('Error cargando proveedores/inversores:', e);
    }

    const optionsIntakes = [
      `<option value="">(sin entrada)</option>`,
      ...state.intakes.map(v=>`<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
    ].join('');
    
    const optionsSuppliers = [
      `<option value="GENERAL">General</option>`,
      ...suppliers.map(s=>`<option value="${s._id}">${s.name}</option>`)
    ].join('');
    
    const optionsInvestors = [
      `<option value="GENERAL">General</option>`,
      ...investors.map(i=>`<option value="${i._id}">${i.name}</option>`)
    ].join('');

    invOpenModal(`
      <div class="p-6">
        <h3 class="text-xl font-semibold text-white theme-light:text-slate-900 mb-4">Agregar stock a ${it.name || it.sku || it._id}</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Proveedor</label>
            <select id="stk-supplier" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">${optionsSuppliers}</select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Inversor</label>
            <select id="stk-investor" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">${optionsInvestors}</select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Cantidad</label>
            <input id="stk-qty" type="number" min="1" step="1" value="1" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">
              💰 Precio por Unidad (opcional, recomendado si hay inversor)
            </label>
            <input id="stk-purchase-price" type="number" min="0" step="0.01" placeholder="0.00" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
            <p class="text-xs text-slate-400 theme-light:text-slate-500 mt-1">Precio de compra por cada unidad</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">
              💵 Precio Total (opcional)
            </label>
            <input id="stk-purchase-total" type="number" min="0" step="0.01" placeholder="Opcional" class="w-full px-4 py-2 rounded-lg bg-slate-700/30 border border-slate-600/30 text-white theme-light:bg-slate-50 theme-light:text-slate-900 theme-light:border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"/>
            <p class="text-xs text-slate-400 theme-light:text-slate-500 mt-1">Si ingresas el total, se calculará el precio unitario</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Nota (opcional)</label>
            <input id="stk-note" placeholder="ej: reposición, compra, etc." class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button id="stk-save" class="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">Agregar</button>
          <button id="stk-generate-stickers" class="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors">Agregar y Generar Stickers</button>
          <button id="stk-cancel" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
        </div>
      </div>
    `);
    
    document.getElementById('stk-cancel').onclick = invCloseModal;
    
    // Lógica para calcular precio unitario desde precio total en modal de agregar stock
    const stkPriceInput = document.getElementById('stk-purchase-price');
    const stkTotalInput = document.getElementById('stk-purchase-total');
    const stkQtyInput = document.getElementById('stk-qty');
    
    if (stkTotalInput && stkPriceInput && stkQtyInput) {
      stkTotalInput.addEventListener('input', () => {
        const total = parseFloat(stkTotalInput.value) || 0;
        const qty = parseFloat(stkQtyInput.value) || 1;
        if (total > 0 && qty > 0) {
          const unitPrice = total / qty;
          stkPriceInput.value = unitPrice.toFixed(2);
        }
      });
      
      stkQtyInput.addEventListener('input', () => {
        const total = parseFloat(stkTotalInput.value) || 0;
        const qty = parseFloat(stkQtyInput.value) || 1;
        if (total > 0 && qty > 0) {
          const unitPrice = total / qty;
          stkPriceInput.value = unitPrice.toFixed(2);
        }
      });
      
      stkPriceInput.addEventListener('input', () => {
        if (stkPriceInput.value && parseFloat(stkPriceInput.value) > 0) {
          stkTotalInput.value = '';
        }
      });
    }
    
    document.getElementById('stk-save').onclick = async () => {
      const qty = parseInt(document.getElementById('stk-qty').value||'0',10);
      if (!Number.isFinite(qty) || qty<=0) return alert('Cantidad inválida');
      const supplierId = document.getElementById('stk-supplier').value || 'GENERAL';
      const investorId = document.getElementById('stk-investor').value || 'GENERAL';
      let purchasePrice = document.getElementById('stk-purchase-price').value ? parseFloat(document.getElementById('stk-purchase-price').value) : undefined;
      const purchaseTotal = document.getElementById('stk-purchase-total').value ? parseFloat(document.getElementById('stk-purchase-total').value) : undefined;
      const note = document.getElementById('stk-note').value || '';
      
      // Si hay precio total, calcular precio unitario
      if (purchaseTotal && purchaseTotal > 0 && qty > 0) {
        purchasePrice = purchaseTotal / qty;
      }
      
      try{
        const payload = { qty, note };
        if (supplierId && supplierId !== '') payload.supplierId = supplierId;
        if (investorId && investorId !== '') payload.investorId = investorId;
        if (purchasePrice !== undefined) payload.purchasePrice = purchasePrice;
        
        await request(`/api/v1/inventory/items/${it._id}/stock-in`, { method: 'POST', json: payload });
        invCloseModal();
        await refreshItems(state.lastItemsParams);
        // Recargar lista de compras si está visible (porque ahora se crea una compra automáticamente)
        const purchasesList = document.getElementById('purchases-list');
        if (purchasesList) {
          loadPurchasesList();
        }
        showToast('Stock agregado');
      }catch(e){ alert('No se pudo agregar stock: '+e.message); }
    };

    // Botón para agregar stock y generar stickers con QR correcto
    document.getElementById('stk-generate-stickers').onclick = async () => {
      const qty = parseInt(document.getElementById('stk-qty').value||'0',10);
      if (!Number.isFinite(qty) || qty<=0) return alert('Cantidad inválida');
      const supplierId = document.getElementById('stk-supplier').value || 'GENERAL';
      const investorId = document.getElementById('stk-investor').value || 'GENERAL';
      let purchasePrice = document.getElementById('stk-purchase-price').value ? parseFloat(document.getElementById('stk-purchase-price').value) : undefined;
      const purchaseTotal = document.getElementById('stk-purchase-total').value ? parseFloat(document.getElementById('stk-purchase-total').value) : undefined;
      const note = document.getElementById('stk-note').value || '';
      
      // Si hay precio total, calcular precio unitario
      if (purchaseTotal && purchaseTotal > 0 && qty > 0) {
        purchasePrice = purchaseTotal / qty;
      }
      
      try {
        showBusy('Agregando stock y generando stickers...');
        
        // Agregar el stock y obtener el qrData
        const payload = { qty, note };
        if (supplierId && supplierId !== '') payload.supplierId = supplierId;
        if (investorId && investorId !== '') payload.investorId = investorId;
        if (purchasePrice !== undefined) payload.purchasePrice = purchasePrice;
        
        const response = await request(`/api/v1/inventory/items/${it._id}/stock-in`, { method: 'POST', json: payload });
        showToast('Stock agregado');
        
        // Recargar lista de compras si está visible (porque ahora se crea una compra automáticamente)
        const purchasesList = document.getElementById('purchases-list');
        if (purchasesList) {
          loadPurchasesList();
        }
        
        // Actualizar el item con el qrData y stockEntryId del backend
        const itemWithQr = { 
          ...it, 
          qrData: response.qrData,
          stockEntryId: response.stockEntryId,
          stockEntry: response.stockEntry
        };
        
        // Generar stickers con el QR correcto
        const list = [{ it: itemWithQr, count: qty }];
        
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

  // Funciones para manejar el historial de items vistos
  const HISTORY_KEY = 'inventory:viewedItems';
  const MAX_HISTORY = 5;
  
  function saveItemToHistory(item) {
    try {
      let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      // Eliminar el item si ya existe (para evitar duplicados)
      history = history.filter(h => h._id !== item._id);
      // Agregar al inicio
      history.unshift({
        _id: item._id,
        name: item.name || '',
        sku: item.sku || '',
        stock: item.stock || 0,
        salePrice: item.salePrice || 0,
        viewedAt: new Date().toISOString()
      });
      // Mantener solo los últimos MAX_HISTORY
      history = history.slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      // Actualizar el historial visual
      renderItemHistory();
    } catch (e) {
      console.warn('Error guardando item en historial:', e);
    }
  }
  
  function getItemHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch {
      return [];
    }
  }
  
  function renderItemHistory() {
    const historyContainer = document.getElementById('inventory-history');
    if (!historyContainer) return;
    
    const history = getItemHistory();
    
    if (history.length === 0) {
      historyContainer.innerHTML = '';
      historyContainer.classList.add('hidden');
      return;
    }
    
    historyContainer.classList.remove('hidden');
    
    historyContainer.innerHTML = `
      <div class="flex items-center gap-2 mb-2">
        <span class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">📋 Historial reciente:</span>
      </div>
      <div class="flex flex-wrap gap-2">
        ${history.map((item, idx) => `
          <button 
            data-history-item="${item._id}"
            class="px-3 py-1.5 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-sky-100 theme-light:hover:bg-sky-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 text-white dark:text-white theme-light:text-slate-900 text-xs font-medium transition-all duration-200 hover:scale-105 cursor-pointer group"
            title="${item.name || item.sku || 'Item'} - Stock: ${item.stock || 0}"
          >
            <span class="text-blue-400 dark:text-blue-400 theme-light:text-blue-600 font-semibold">${item.sku || 'N/A'}</span>
            <span class="text-slate-300 dark:text-slate-300 theme-light:text-slate-700 ml-1">${(item.name || '').substring(0, 20)}${(item.name || '').length > 20 ? '...' : ''}</span>
            <span class="ml-1 text-slate-400 dark:text-slate-400 theme-light:text-slate-500">(${item.stock || 0})</span>
          </button>
        `).join('')}
      </div>
    `;
    
    // Agregar event listeners a los botones del historial
    historyContainer.querySelectorAll('[data-history-item]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId = btn.dataset.historyItem;
        // Buscar el item en el cache o cargarlo
        let item = state.itemCache.get(itemId);
        if (!item) {
          try {
            showBusy('Cargando item...');
            item = await invAPI.getItem(itemId);
            hideBusy();
            if (item) {
              state.itemCache.set(itemId, item);
            }
          } catch (e) {
            hideBusy();
            alert('Error al cargar el item: ' + e.message);
            return;
          }
        }
        if (item) {
          // Guardar en historial antes de abrir el modal
          saveItemToHistory(item);
          openItemSummaryModal(item);
        }
      });
    });
  }

  async function openItemSummaryModal(it) {
    try {
      // Guardar en historial antes de abrir el modal
      saveItemToHistory(it);
      
      showBusy('Cargando resumen del item...');
      const data = await invAPI.getItemStockEntries(it._id);
      hideBusy();
      
      const item = data.item || it;
      const stockEntries = data.stockEntries || [];
      const totalStock = stockEntries.reduce((sum, se) => sum + (se.qty || 0), 0);
      
      // Formatear información de cada entrada
      const entriesHtml = stockEntries.length > 0
        ? stockEntries.map(se => {
            // Determinar etiqueta según el nuevo sistema de compras
            let intakeLabel = 'GENERAL';
            if (se.purchaseId && se.investorId) {
              const investorName = se.investorId?.name || 'Sin nombre';
              const supplierName = se.supplierId?.name || 'General';
              intakeLabel = `${investorName} - ${supplierName}`;
            } else if (se.investorId) {
              intakeLabel = se.investorId?.name || 'Sin nombre';
            } else if (se.supplierId) {
              intakeLabel = se.supplierId?.name || 'General';
            } else if (se.purchaseId) {
              intakeLabel = 'COMPRA GENERAL';
            } else {
              intakeLabel = se.intakeLabel || 'GENERAL';
            }
            
            const entryDate = se.entryDate ? new Date(se.entryDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
            const entryPrice = se.entryPrice ? fmtMoney(se.entryPrice) : '-';
            const qty = se.qty || 0;
            
            // Información adicional
            const purchaseDate = se.purchaseId?.purchaseDate ? new Date(se.purchaseId.purchaseDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
            
            return `
              <div class="border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg p-4 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-50">
                <div class="flex justify-between items-start mb-2">
                  <div class="flex-1">
                    <div class="text-sm font-semibold text-white theme-light:text-slate-900 mb-1">${escapeHtml(intakeLabel)}</div>
                    <div class="text-xs text-slate-400 theme-light:text-slate-600">Fecha de entrada: ${entryDate}</div>
                    ${purchaseDate ? `<div class="text-xs text-slate-400 theme-light:text-slate-600">Compra: ${purchaseDate}</div>` : ''}
                    ${se.purchaseId?.notes ? `<div class="text-xs text-slate-400 theme-light:text-slate-600 italic mt-1">${escapeHtml(se.purchaseId.notes)}</div>` : ''}
                  </div>
                  <div class="text-right">
                    <div class="text-lg font-bold text-blue-400 theme-light:text-blue-600">${qty} unidades</div>
                    ${entryPrice !== '-' ? `<div class="text-xs text-slate-400 theme-light:text-slate-600">Precio: $${entryPrice}</div>` : ''}
                  </div>
                </div>
                ${se.meta?.note ? `<div class="text-xs text-slate-400 theme-light:text-slate-600 mt-2 italic">Nota: ${escapeHtml(se.meta.note)}</div>` : ''}
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
      const note = document.getElementById('bstk-note').value || '';
      try{
        // Construir payload por ítem (qty > 0)
        const itemsPayload = Array.from(document.querySelectorAll('.bstk-qty'))
          .map(input => ({ id: String(input.dataset.id), qty: parseInt(input.value||'0',10) }))
          .filter(row => Number.isFinite(row.qty) && row.qty > 0);
        if (!itemsPayload.length) return alert('Indica cantidades (>0) para al menos un ítem.');
        if (itemsPayload.length > 500) return alert('Máximo 500 ítems por lote.');
        showBusy('Agregando stock (masivo)...');
        await request('/api/v1/inventory/items/stock-in/bulk', { method: 'POST', json: { items: itemsPayload, note } });
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


  // ---- Guardar ítem ----
  // ---- Búsqueda de vehículo para nuevo ítem ----
  async function searchVehiclesForItem(query) {
    if (!itVehicleDropdown) return;
    if (!query || query.trim().length < 1) {
      itVehicleDropdown.classList.add('hidden');
      itVehicleDropdown.innerHTML = '';
      return;
    }
    try {
      const r = await API.vehicles.search({ q: query.trim(), limit: 30 });
      const vehicles = Array.isArray(r?.items) ? r.items : [];
      if (!vehicles.length) {
        itVehicleDropdown.innerHTML = '<div class="px-4 py-2 text-xs text-slate-400 theme-light:text-slate-600">No se encontraron vehículos</div>';
        itVehicleDropdown.classList.remove('hidden');
        return;
      }
      itVehicleDropdown.innerHTML = '';
      vehicles.forEach(v => {
        const div = document.createElement('div');
        div.className = 'px-4 py-2 text-sm cursor-pointer border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-200 hover:bg-slate-800/70 dark:hover:bg-slate-800/70 theme-light:hover:bg-slate-100';
        const line = `${v.make || ''} ${v.line || ''}`.trim();
        const disp = v.displacement ? `Cilindraje: ${v.displacement}` : '';
        const year = v.modelYear ? ` | Modelo: ${v.modelYear}` : '';
        div.innerHTML = `
          <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${line || 'Vehículo'}</div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${[disp, year].join('')}</div>
        `;
        div.addEventListener('click', () => {
          const target = `${(v.make || '').toString().toUpperCase()} ${(v.line || '').toString().toUpperCase()} ${(v.displacement || '').toString().toUpperCase()}${v.modelYear ? ' ' + String(v.modelYear).toUpperCase() : ''}`
            .replace(/\s+/g, ' ')
            .trim();
          itSelectedVehicleTarget = target;
          if (itVehicleSearch) {
            itVehicleSearch.value = `${v.make || ''} ${v.line || ''} ${v.displacement || ''}`.trim();
          }
          if (itVehicleSelected) {
            itVehicleSelected.textContent = target
              ? `Destino seleccionado: ${target}`
              : '';
          }
          itVehicleDropdown.classList.add('hidden');
        });
        itVehicleDropdown.appendChild(div);
      });
      itVehicleDropdown.classList.remove('hidden');
    } catch (e) {
      console.error('Error buscando vehículos para ítem:', e);
      itVehicleDropdown.classList.add('hidden');
      itVehicleDropdown.innerHTML = '';
    }
  }

  if (itVehicleSearch) {
    let itVehicleSearchTimeout = null;
    itVehicleSearch.addEventListener('input', () => {
      const q = itVehicleSearch.value || '';
      itSelectedVehicleTarget = ''; // reset hasta que elijan uno de la lista
      if (itVehicleSelected) itVehicleSelected.textContent = '';
      if (itVehicleSearchTimeout) clearTimeout(itVehicleSearchTimeout);
      itVehicleSearchTimeout = setTimeout(() => searchVehiclesForItem(q), 300);
    });
    itVehicleSearch.addEventListener('blur', () => {
      setTimeout(() => {
        if (itVehicleDropdown) itVehicleDropdown.classList.add('hidden');
      }, 200);
    });
  }

  if (itSave) {
  itSave.onclick = async () => {
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
      salePrice: parseFloat(itSalePrice.value || "0"),
      stock: parseInt(itStock.value || "0", 10),
      images,
    };

    // minStock opcional
    const msRaw = itMinStock?.value;
    if (msRaw !== undefined && msRaw !== null && String(msRaw).trim() !== "") {
      const ms = parseInt(msRaw, 10);
      if (Number.isFinite(ms) && ms >= 0) body.minStock = ms;
    }

    // vehicleTarget opcional (desde selector de vehículos)
    if (itSelectedVehicleTarget) {
      body.vehicleTarget = itSelectedVehicleTarget;
    }

    if (!body.sku || !body.name || !body.salePrice) return alert("Completa SKU, nombre y precio de venta");

    await invAPI.saveItem(body);

    // Reset form
    itSku.value = "";
    itName.value = "";
    if (itInternal) itInternal.value = "";
  if (itBrand) itBrand.value = "";
    if (itLocation) itLocation.value = "";
    if (itSalePrice) itSalePrice.value = "";
    if (itStock) itStock.value = "";
  if (itMinStock) itMinStock.value = "";
    if (itFiles) itFiles.value = "";

    await refreshItems({});
  };
  }

  // ---- Filtros ----
  function doSearch() {
    const params = {
      name: qName?.value.trim() || "",
      sku: qSku?.value.trim() || "",
      brand: qBrand ? qBrand.value.trim() : undefined,
      vehicleTarget: qVehicle ? qVehicle.value.trim() : undefined,
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
    if (qVehicle) qVehicle.value = "";
      if (qIntake) qIntake.value = "";
    refreshItems({ page: 1, limit: state.paging?.limit || 10 });
  };
  }
  [qName, qSku, qBrand, qVehicle].forEach((el) => el && el.addEventListener("keydown", (e) => e.key === "Enter" && doSearch()));
  if (qIntake) qIntake.addEventListener("change", doSearch);
  if (btnReadQr) {
    btnReadQr.onclick = () => openQRReader();
  }

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
          <div class="sm:col-span-2">
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Vehículo / destino (opcional)</label>
            <div class="space-y-1">
              <input id="e-it-vehicle-search" placeholder="Buscar vehículo en base de datos (marca, línea, cilindraje...)" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
              <div id="e-it-vehicle-dropdown" class="mt-1 max-h-56 overflow-auto rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 bg-slate-900/90 dark:bg-slate-900/90 theme-light:bg-white text-sm hidden shadow-lg custom-scrollbar"></div>
              <p id="e-it-vehicle-selected" class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${it.vehicleTarget ? `Destino actual: ${it.vehicleTarget}` : ''}</p>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Precio venta</label>
            <input id="e-it-sale" type="number" step="0.01" min="0" value="${Number(it.salePrice || 0)}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
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
    const sale = document.getElementById("e-it-sale");
    const stock = document.getElementById("e-it-stock");
    const files = document.getElementById("e-it-files");
  const minInput = document.getElementById("e-it-min");
    const eBrand = document.getElementById("e-it-brand");
    const thumbs = document.getElementById("e-it-thumbs");
    const viewer = document.getElementById("e-it-viewer");
    const save = document.getElementById("e-it-save");
    const cancel = document.getElementById("e-it-cancel");
    const eVehicleSearch = document.getElementById("e-it-vehicle-search");
    const eVehicleDropdown = document.getElementById("e-it-vehicle-dropdown");
    const eVehicleSelected = document.getElementById("e-it-vehicle-selected");
    let editSelectedVehicleTarget = "";

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

    // --- Búsqueda de vehículo / destino en modal de edición ---
    async function searchVehiclesForEdit(query) {
      if (!eVehicleDropdown) return;
      if (!query || query.trim().length < 1) {
        eVehicleDropdown.classList.add('hidden');
        eVehicleDropdown.innerHTML = '';
        return;
      }
      try {
        const r = await API.vehicles.search({ q: query.trim(), limit: 30 });
        const vehicles = Array.isArray(r?.items) ? r.items : [];
        if (!vehicles.length) {
          eVehicleDropdown.innerHTML = '<div class="px-4 py-2 text-xs text-slate-400 theme-light:text-slate-600">No se encontraron vehículos</div>';
          eVehicleDropdown.classList.remove('hidden');
          return;
        }
        eVehicleDropdown.innerHTML = '';
        vehicles.forEach(v => {
          const div = document.createElement('div');
          div.className = 'px-4 py-2 text-sm cursor-pointer border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-200 hover:bg-slate-800/70 dark:hover:bg-slate-800/70 theme-light:hover:bg-slate-100';
          const line = `${v.make || ''} ${v.line || ''}`.trim();
          const disp = v.displacement ? `Cilindraje: ${v.displacement}` : '';
          const year = v.modelYear ? ` | Modelo: ${v.modelYear}` : '';
          div.innerHTML = `
            <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${line || 'Vehículo'}</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${[disp, year].join('')}</div>
          `;
          div.addEventListener('click', () => {
            const target = `${(v.make || '').toString().toUpperCase()} ${(v.line || '').toString().toUpperCase()} ${(v.displacement || '').toString().toUpperCase()}${v.modelYear ? ' ' + String(v.modelYear).toUpperCase() : ''}`
              .replace(/\s+/g, ' ')
              .trim();
            editSelectedVehicleTarget = target;
            if (eVehicleSearch) {
              eVehicleSearch.value = `${v.make || ''} ${v.line || ''} ${v.displacement || ''}`.trim();
            }
            if (eVehicleSelected) {
              eVehicleSelected.textContent = target
                ? `Destino seleccionado: ${target}`
                : '';
            }
            eVehicleDropdown.classList.add('hidden');
          });
          eVehicleDropdown.appendChild(div);
        });
        eVehicleDropdown.classList.remove('hidden');
      } catch (e) {
        console.error('Error buscando vehículos en edición de ítem:', e);
        eVehicleDropdown.classList.add('hidden');
        eVehicleDropdown.innerHTML = '';
      }
    }

    if (eVehicleSearch) {
      let editVehicleSearchTimeout = null;
      eVehicleSearch.addEventListener('input', () => {
        const q = eVehicleSearch.value || '';
        editSelectedVehicleTarget = ''; // reset hasta elegir uno de la lista
        if (eVehicleSelected && it.vehicleTarget) {
          // Si el usuario borra la búsqueda, mostramos el destino actual
          eVehicleSelected.textContent = it.vehicleTarget ? `Destino actual: ${it.vehicleTarget}` : '';
        }
        if (editVehicleSearchTimeout) clearTimeout(editVehicleSearchTimeout);
        editVehicleSearchTimeout = setTimeout(() => searchVehiclesForEdit(q), 300);
      });
      eVehicleSearch.addEventListener('blur', () => {
        setTimeout(() => {
          if (eVehicleDropdown) eVehicleDropdown.classList.add('hidden');
        }, 200);
      });
    }

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
          salePrice: parseFloat(sale.value || "0"),
          stock: parseInt(stock.value || "0", 10),
          images,
        };
        // minStock opcional
        const msRaw = minInput?.value;
        if (msRaw !== undefined && msRaw !== null && String(msRaw).trim() !== "") {
          const ms = parseInt(msRaw, 10);
          if (Number.isFinite(ms) && ms >= 0) body.minStock = ms;
        }
        // vehicleTarget opcional desde selector de vehículos en edición
        if (editSelectedVehicleTarget) {
          body.vehicleTarget = editSelectedVehicleTarget;
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
    // Sin márgenes ni gap
    const marginPx = 0;
    const gapPx = 0;

    const availableWidth = canvasWidth;
    const availableHeight = canvasHeight;

    // Columnas nominales (pero el QR rellenará todo); solo se usa para ubicar SKU
    const leftColW = availableWidth * 0.4;
    const rightColW = availableWidth - leftColW;

    const leftColX = marginPx;
    const rightColX = leftColW + gapPx;
    const colY = marginPx;

    // Altura de la columna derecha
    const rightColH = availableHeight;

    // Logo pequeño arriba, centrado
    const logoSize = Math.min(availableWidth * 0.3, rightColH * 0.18);
    const logoX = (availableWidth - logoSize) / 2;
    const logoY = colY;

    // QR ocupa TODO el lienzo (overfill para eliminar cualquier gap)
    const bleed = 4;
    const qrWidth = availableWidth + bleed * 2;
    const qrHeight = availableHeight + bleed * 2;
    const qrX = -bleed;
    const qrY = -bleed;

    // SKU centrado verticalmente a la izquierda
    const skuX = availableWidth * 0.05;
    const skuH = availableHeight * 0.42;
    const skuY = colY + (availableHeight - skuH) / 2;
    const skuW = availableWidth * 0.4;

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

  // (Eliminado ajuste por html2canvas; no se usa con jsPDF directo)

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
  // Si el item tiene qrData, se puede pasar directamente o usar entryId
  async function generateQRCodeDataURL(itemId, entryId = null, qrData = null) {
    try {
      // Si hay qrData directamente, generar QR en el frontend usando el endpoint del backend
      // pero primero intentar usar entryId si está disponible
      let qrPath = buildQrPath(itemId, 600);
      if (entryId) {
        qrPath += `?entryId=${entryId}`;
      }
      
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

  // Función auxiliar para calcular el tamaño de fuente óptimo del SKU (en píxeles)
  function calculateOptimalSkuFontSize(text, containerWidth, baseFontSize) {
    if (!text || !containerWidth || containerWidth <= 0) {
      return Math.max(8, baseFontSize || 8);
    }
    
    // Tamaño mínimo de fuente
    const minFontSize = 8;
    // Tamaño base de fuente
    const fontSize = Math.max(minFontSize, baseFontSize || 12);
    
    // Aproximación: en fuentes bold, cada carácter ocupa aproximadamente 0.6-0.7 veces el tamaño de fuente
    // Usamos 0.65 como factor promedio para texto en mayúsculas y bold
    const charWidthFactor = 0.65;
    
    // Calcular el ancho estimado del texto con el tamaño de fuente base
    const estimatedTextWidth = text.length * fontSize * charWidthFactor;
    
    // Si el texto cabe en el ancho disponible, usar el tamaño base
    if (estimatedTextWidth <= containerWidth * 0.95) { // 95% para dejar un poco de margen
      return fontSize;
    }
    
    // Si no cabe, calcular el tamaño de fuente necesario para que quepa
    // Fórmula: fontSize = containerWidth / (textLength * charWidthFactor)
    const optimalFontSize = (containerWidth * 0.95) / (text.length * charWidthFactor);
    
    // Asegurar que no sea menor que el mínimo
    return Math.max(minFontSize, Math.floor(optimalFontSize));
  }

  // Función auxiliar para calcular el tamaño de fuente óptimo del SKU en milímetros (para jsPDF)
  function calculateOptimalSkuFontSizeMm(text, containerWidthMm, baseFontSizeMm) {
    if (!text || !containerWidthMm || containerWidthMm <= 0) {
      return Math.max(6, baseFontSizeMm || 6);
    }
    
    // Tamaño mínimo de fuente en mm
    const minFontSize = 6;
    // Tamaño base de fuente
    const fontSize = Math.max(minFontSize, baseFontSizeMm || 10);
    
    // En jsPDF con fuente bold, cada carácter ocupa aproximadamente 0.5-0.6 veces el tamaño de fuente en mm
    // Usamos 0.55 como factor promedio para texto en mayúsculas y bold
    const charWidthFactor = 0.55;
    
    // Calcular el ancho estimado del texto con el tamaño de fuente base
    const estimatedTextWidth = text.length * fontSize * charWidthFactor;
    
    // Si el texto cabe en el ancho disponible, usar el tamaño base
    if (estimatedTextWidth <= containerWidthMm * 0.95) { // 95% para dejar un poco de margen
      return fontSize;
    }
    
    // Si no cabe, calcular el tamaño de fuente necesario para que quepa
    const optimalFontSize = (containerWidthMm * 0.95) / (text.length * charWidthFactor);
    
    // Asegurar que no sea menor que el mínimo
    return Math.max(minFontSize, Math.round(optimalFontSize * 10) / 10); // Redondear a 1 decimal
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
      const skuText = sku || 'NO SKU'; // Mostrar placeholder si está vacío
      // Calcular tamaño de fuente óptimo para que el SKU quepa en una sola línea
      const baseFontSize = skuEl.fontSize || 12;
      const skuFontSize = calculateOptimalSkuFontSize(skuText, skuEl.w, baseFontSize);
      console.log('🏷️ [HTML] Agregando SKU:', { x: skuEl.x, y: skuEl.y, w: skuEl.w, h: skuEl.h, fontSize: skuFontSize, baseFontSize, text: skuText, original: sku, textLength: skuText.length });
      // Escapar HTML y asegurar visibilidad
      const skuEscaped = skuText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
      // Simplificar HTML y asegurar visibilidad - usar display:block para texto
      htmlParts.push(`<div class="st-el st-text" data-id="sku" style="position:absolute;left:${skuEl.x}px;top:${skuEl.y}px;width:${skuEl.w}px;height:${skuEl.h}px;box-sizing:border-box;padding:2px;margin:0;z-index:20;background:transparent;overflow:visible;"><div style="font-size:${skuFontSize}px !important;font-weight:bold !important;color:#000000 !important;width:100% !important;height:100% !important;display:block !important;text-align:center !important;line-height:${skuEl.h}px !important;vertical-align:middle !important;visibility:visible !important;opacity:1 !important;white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;">${skuEscaped}</div></div>`);
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
    // Generación directa con jsPDF (sin html2canvas)
    const jsPDF = await ensureJsPDF();
    const widthMm = 50;
    const heightMm = 30;
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [widthMm, heightMm],
      compress: false,
      precision: 16,
      putOnlyUsedFonts: true,
      floatPrecision: 16
    });

    // Sin márgenes
    if (doc.internal) {
      doc.internal.pageMargins = { top: 0, right: 0, bottom: 0, left: 0 };
      if (doc.internal.margins) {
        doc.internal.margins = { top: 0, right: 0, bottom: 0, left: 0 };
      }
    }

    // Función utilitaria para cargar imagen a base64
    async function fetchAsDataURL(url) {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }

    // Procesar stickers
    for (let page = 0; page < list.length; page++) {
      const { it, count } = list[page];
      for (let c = 0; c < count; c++) {
        if (page > 0 || c > 0) doc.addPage([widthMm, heightMm], 'landscape');

        // Layout con leve margen interno y proporciones más cercanas al recordatorio
        const innerMargin = 1; // mm
        const gap = 1; // mm entre columnas
        const contentW = widthMm - innerMargin * 2;
        const contentH = heightMm - innerMargin * 2;

        const leftColW = contentW * 0.47;
        const rightColW = contentW - leftColW - gap;

        const leftColX = innerMargin;
        const rightColX = innerMargin + leftColW + gap;
        const colY = innerMargin;
        const rightColH = contentH;

        // Logo arriba, centrado en la derecha
        const logoW = rightColW * 0.8;
        const logoH = rightColH * 0.18;
        const logoX = rightColX + (rightColW - logoW) / 2;
        const logoY = colY;

        // Cargar logo
        const layout = await getStickerLayoutForCompany();
        const logoUrl = (layout.elements.find(e => e.id === 'logo') || {}).url || '';
        let logoDataUrl = '';
        if (logoUrl) {
          try { logoDataUrl = await fetchAsDataURL(logoUrl); } catch {}
        }

        // Generar QR desde backend (ya se usa en HTML)
        // Si el item tiene stockEntryId, usarlo para generar el QR correcto
        const stockEntryId = it.stockEntryId || (it.stockEntry && it.stockEntry._id) || null;
        const qrDataUrl = await generateQRCodeDataURL(it._id, stockEntryId);

        // QR centrado debajo del logo
        const qrW = rightColW * 0.9;
        const qrH = Math.min(rightColH - logoH - gap, qrW);
        const qrX = rightColX + (rightColW - qrW) / 2;
        const qrY = logoY + logoH + gap;

        // SKU centrado en la izquierda
        const skuText = String(it.sku || '').toUpperCase();
        // Calcular tamaño de fuente óptimo para que el SKU quepa en una sola línea
        const baseFontSizeMm = 10;
        const skuBoxW = leftColW;
        const skuFontSize = calculateOptimalSkuFontSizeMm(skuText, skuBoxW, baseFontSizeMm);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(skuFontSize);

        // Dibujar fondo blanco
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, widthMm, heightMm, 'F');

        // Logo
        if (logoDataUrl) {
          try {
            doc.addImage(logoDataUrl, 'PNG', logoX, logoY, logoW, logoH);
          } catch {}
        }

        // QR
        if (qrDataUrl) {
          try {
            doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrW, qrH);
          } catch {}
        }

        // SKU
        const skuBoxH = heightMm * 0.34;
        const skuBoxY = (heightMm - skuBoxH) / 2;
        doc.text(skuText, leftColX + skuBoxW / 2, skuBoxY + skuBoxH / 2, { align: 'center', baseline: 'middle', maxWidth: skuBoxW });
      }
    }

    doc.save(`${filenameBase}.pdf`);
  }
  
  // Hacer renderStickerPdf disponible globalmente
  window.renderStickerPdf = renderStickerPdf;

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
      // Renderizar historial después de refrescar items
      renderItemHistory();
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
  initInternalNavigation();
  refreshIntakes();
  // Initial load: page 1, limit per page
  console.log('📞 Llamando refreshItems con:', { page: 1, limit: state.paging?.limit || 15 });
  refreshItems({ page: 1, limit: state.paging?.limit || 15 });
  // Renderizar historial al cargar la página
  setTimeout(() => renderItemHistory(), 500);
}

// ========================
// NAVEGACIÓN INTERNA
// ========================
function initInternalNavigation() {
  const btnInventario = document.getElementById('inventory-nav-inventario');
  const btnCompras = document.getElementById('inventory-nav-compras');
  const btnInversores = document.getElementById('inventory-nav-inversores');
  const viewInventario = document.getElementById('inventory-view-inventario');
  const viewCompras = document.getElementById('inventory-view-compras');
  const viewInversores = document.getElementById('inventory-view-inversores');

  if (!btnInventario || !btnCompras || !btnInversores || !viewInventario || !viewCompras || !viewInversores) return;

  // Navegación entre vistas
  btnInventario.addEventListener('click', () => {
    btnInventario.classList.add('active');
    btnCompras.classList.remove('active');
    btnInversores.classList.remove('active');
    viewInventario.classList.remove('hidden');
    viewCompras.classList.add('hidden');
    viewInversores.classList.add('hidden');
  });

  btnCompras.addEventListener('click', () => {
    btnCompras.classList.add('active');
    btnInventario.classList.remove('active');
    btnInversores.classList.remove('active');
    viewCompras.classList.remove('hidden');
    viewInventario.classList.add('hidden');
    viewInversores.classList.add('hidden');
    // Cargar contenido de compras si es necesario
    loadComprasContent();
  });

  btnInversores.addEventListener('click', () => {
    btnInversores.classList.add('active');
    btnInventario.classList.remove('active');
    btnCompras.classList.remove('active');
    viewInversores.classList.remove('hidden');
    viewInventario.classList.add('hidden');
    viewCompras.classList.add('hidden');
    // Forzar recarga al cambiar de vista
    const container = document.getElementById('inv-investors-list');
    if (container) {
      container.dataset.loaded = 'false';
    }
    loadInversoresContent();
  });

  // Botón de actualizar inversores
  // Event listener para el botón de actualizar inversores (usando delegación de eventos)
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'inv-refresh') {
      const container = document.getElementById('inv-investors-list');
      if (container) {
        container.dataset.loaded = 'false';
        loadInversoresContent();
      }
    }
  });
}

// Cargar contenido de compras
async function loadComprasContent() {
  const container = document.getElementById('compras-content');
  if (!container) return;
  
  // Si ya está cargado, no recargar
  if (container.dataset.loaded === 'true') return;
  
  try {
    // Cargar proveedores e inversores
    let suppliers = [];
    let investors = [];
    
    try {
      if (API.purchases && API.purchases.suppliers && API.purchases.suppliers.list) {
        const suppliersData = await API.purchases.suppliers.list({ active: true });
        suppliers = Array.isArray(suppliersData) ? suppliersData : (suppliersData?.items || suppliersData?.data || []);
      }
    } catch (e) {
      console.error('Error cargando suppliers:', e);
      suppliers = [];
    }
    
    try {
      if (API.purchases && API.purchases.investors && API.purchases.investors.list) {
        const investorsData = await API.purchases.investors.list({ active: true });
        investors = Array.isArray(investorsData) ? investorsData : (investorsData?.items || investorsData?.data || []);
      }
    } catch (e) {
      console.error('Error cargando investors:', e);
      investors = [];
    }
    
    container.innerHTML = `
      <!-- Proveedores -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xl shadow-lg">
              🏪
            </div>
            <div>
              <h4 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900">Proveedores</h4>
              <p class="text-xs text-slate-400 theme-light:text-slate-500">Gestiona tus proveedores</p>
            </div>
          </div>
          <button id="btn-add-supplier" class="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 dark:from-emerald-600 dark:to-teal-700 theme-light:from-emerald-500 theme-light:to-teal-600 hover:from-emerald-700 hover:to-teal-800 dark:hover:from-emerald-700 dark:hover:to-teal-800 theme-light:hover:from-emerald-600 theme-light:hover:to-teal-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 flex items-center gap-2">
            <span class="text-lg">➕</span>
            <span>Proveedor</span>
          </button>
        </div>
        <div id="suppliers-list" class="space-y-3 max-h-[250px] overflow-auto custom-scrollbar">
          ${renderSuppliersList(suppliers || [])}
        </div>
      </div>

      <!-- Inversores -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-xl shadow-lg">
              💰
            </div>
            <div>
              <h4 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900">Inversores</h4>
              <p class="text-xs text-slate-400 theme-light:text-slate-500">Gestiona tus inversores</p>
            </div>
          </div>
          <button id="btn-add-investor" class="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-700 dark:from-purple-600 dark:to-pink-700 theme-light:from-purple-500 theme-light:to-pink-600 hover:from-purple-700 hover:to-pink-800 dark:hover:from-purple-700 dark:hover:to-pink-800 theme-light:hover:from-purple-600 theme-light:hover:to-pink-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 flex items-center gap-2">
            <span class="text-lg">➕</span>
            <span>Inversor</span>
          </button>
        </div>
        <div id="investors-list" class="space-y-3 max-h-[250px] overflow-auto custom-scrollbar">
          ${renderInvestorsList(investors || [])}
        </div>
      </div>

      <!-- Compras -->
      <div>
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-xl shadow-lg">
              🛒
            </div>
            <div>
              <h4 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900">Compras</h4>
              <p class="text-xs text-slate-400 theme-light:text-slate-500">Historial de compras registradas</p>
            </div>
          </div>
          <button id="btn-add-purchase" class="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-700 dark:from-green-600 dark:to-emerald-700 theme-light:from-green-500 theme-light:to-emerald-600 hover:from-green-700 hover:to-emerald-800 dark:hover:from-green-700 dark:hover:to-emerald-800 theme-light:hover:from-green-600 theme-light:hover:to-emerald-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 flex items-center gap-2">
            <span class="text-lg">➕</span>
            <span>Compra</span>
          </button>
        </div>
        <div id="purchases-list" class="space-y-3 max-h-[350px] overflow-auto custom-scrollbar">
          ${renderPurchasesList([])}
        </div>
      </div>
    `;
    
    // Agregar event listeners
    setupComprasEventListeners();
    
    // Cargar compras
    loadPurchasesList();
    
    container.dataset.loaded = 'true';
  } catch (err) {
    console.error('Error cargando contenido de compras:', err);
    container.innerHTML = `<p class="text-red-400">Error: ${err.message || 'Error desconocido'}</p>`;
  }
}

function renderSuppliersList(suppliers) {
  if (suppliers.length === 0) {
    return `
      <div class="text-center py-8 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg border-2 border-dashed border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
        <div class="text-5xl mb-3">🏪</div>
        <p class="text-slate-400 theme-light:text-slate-600 text-sm">No hay proveedores registrados</p>
        <p class="text-slate-500 theme-light:text-slate-500 text-xs mt-1">Haz clic en "+ Proveedor" para crear uno</p>
      </div>
    `;
  }
  
  return suppliers.map(s => `
    <div class="bg-gradient-to-r from-slate-700/80 to-slate-800/80 dark:from-slate-700/80 dark:to-slate-800/80 theme-light:from-white theme-light:to-slate-50 rounded-xl p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.02] group">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-lg font-bold text-white shadow-md">
            🏪
          </div>
          <div>
            <h5 class="text-base font-semibold text-white dark:text-white theme-light:text-slate-900 group-hover:text-emerald-400 transition-colors">${escapeHtml(s.name || 'Sin nombre')}</h5>
            ${s.contactInfo && Object.keys(s.contactInfo).length > 0 ? `<p class="text-xs text-slate-400 theme-light:text-slate-500 mt-1">📞 Contacto disponible</p>` : ''}
          </div>
        </div>
        <div class="flex gap-2">
          <button class="edit-supplier px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105" data-id="${s._id}" title="Editar proveedor">✏️ Editar</button>
          <button class="delete-supplier px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105" data-id="${s._id}" title="Eliminar proveedor">🗑️ Eliminar</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderInvestorsList(investors) {
  if (investors.length === 0) {
    return `
      <div class="text-center py-8 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg border-2 border-dashed border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
        <div class="text-5xl mb-3">👤</div>
        <p class="text-slate-400 theme-light:text-slate-600 text-sm">No hay inversores registrados</p>
        <p class="text-slate-500 theme-light:text-slate-500 text-xs mt-1">Haz clic en "+ Inversor" para crear uno</p>
      </div>
    `;
  }
  
  return investors.map(i => `
    <div class="bg-gradient-to-r from-slate-700/80 to-slate-800/80 dark:from-slate-700/80 dark:to-slate-800/80 theme-light:from-white theme-light:to-slate-50 rounded-xl p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.02] group">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-lg font-bold text-white shadow-md">
            💰
          </div>
          <div>
            <h5 class="text-base font-semibold text-white dark:text-white theme-light:text-slate-900 group-hover:text-purple-400 transition-colors">${escapeHtml(i.name || 'Sin nombre')}</h5>
            ${i.contactInfo && Object.keys(i.contactInfo).length > 0 ? `<p class="text-xs text-slate-400 theme-light:text-slate-500 mt-1">📞 Contacto disponible</p>` : ''}
          </div>
        </div>
        <div class="flex gap-2">
          <button class="edit-investor px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105" data-id="${i._id}" title="Editar inversor">✏️ Editar</button>
          <button class="delete-investor px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105" data-id="${i._id}" title="Eliminar inversor">🗑️ Eliminar</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderPurchasesList(purchases) {
  if (purchases.length === 0) {
    return `
      <div class="text-center py-8 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg border-2 border-dashed border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
        <div class="text-5xl mb-3">🛒</div>
        <p class="text-slate-400 theme-light:text-slate-600 text-sm">No hay compras registradas</p>
        <p class="text-slate-500 theme-light:text-slate-500 text-xs mt-1">Haz clic en "+ Compra" para registrar una compra</p>
      </div>
    `;
  }
  
  const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  return purchases.map(p => {
    const date = p.purchaseDate ? new Date(p.purchaseDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
    const supplier = p.supplierId?.name || 'GENERAL';
    const investor = p.investorId?.name || 'GENERAL';
    const itemsCount = (p.items || []).length;
    const totalAmount = p.totalAmount || 0;
    
    return `
      <div class="bg-gradient-to-br from-slate-700/80 to-slate-800/80 dark:from-slate-700/80 dark:to-slate-800/80 theme-light:from-white theme-light:to-slate-50 rounded-xl p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.01] group">
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-xl shadow-lg">
              🛒
            </div>
            <div>
              <h5 class="text-base font-bold text-white dark:text-white theme-light:text-slate-900">Compra del ${date}</h5>
              <p class="text-xs text-slate-400 theme-light:text-slate-500 mt-1">${itemsCount} ${itemsCount === 1 ? 'item' : 'items'}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-xs text-slate-400 theme-light:text-slate-500 mb-1">Total</p>
            <p class="text-xl font-bold text-green-400 theme-light:text-green-600">${money(totalAmount)}</p>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
          <div class="flex items-center gap-2">
            <span class="text-lg">🏪</span>
            <div>
              <p class="text-xs text-slate-400 theme-light:text-slate-500">Proveedor</p>
              <p class="text-sm font-medium text-white dark:text-white theme-light:text-slate-700">${escapeHtml(supplier)}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-lg">💰</span>
            <div>
              <p class="text-xs text-slate-400 theme-light:text-slate-500">Inversor</p>
              <p class="text-sm font-medium text-white dark:text-white theme-light:text-slate-700">${escapeHtml(investor)}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function setupComprasEventListeners() {
  const container = document.getElementById('compras-content');
  if (!container) return;
  
  // Botón agregar proveedor
  document.getElementById('btn-add-supplier')?.addEventListener('click', () => {
    openSupplierModal();
  });
  
  // Botón agregar inversor
  document.getElementById('btn-add-investor')?.addEventListener('click', () => {
    openInvestorModal();
  });
  
  // Botón agregar compra
  document.getElementById('btn-add-purchase')?.addEventListener('click', () => {
    openPurchaseModal();
  });
  
  // Usar delegación de eventos para botones dinámicos
  container.addEventListener('click', async (e) => {
    // Editar proveedor
    if (e.target.classList.contains('edit-supplier')) {
      const id = e.target.getAttribute('data-id');
      openSupplierModal(id);
      return;
    }
    
    // Eliminar proveedor
    if (e.target.classList.contains('delete-supplier')) {
      const id = e.target.getAttribute('data-id');
      if (confirm('¿Estás seguro de eliminar este proveedor?')) {
        try {
          await API.purchases.suppliers.delete(id);
          container.dataset.loaded = 'false';
          loadComprasContent();
        } catch (err) {
          alert('Error: ' + (err.message || 'Error desconocido'));
        }
      }
      return;
    }
    
    // Editar inversor
    if (e.target.classList.contains('edit-investor')) {
      const id = e.target.getAttribute('data-id');
      openInvestorModal(id);
      return;
    }
    
    // Eliminar inversor
    if (e.target.classList.contains('delete-investor')) {
      const id = e.target.getAttribute('data-id');
      if (confirm('¿Estás seguro de eliminar este inversor?')) {
        try {
          await API.purchases.investors.delete(id);
          container.dataset.loaded = 'false';
          loadComprasContent();
        } catch (err) {
          alert('Error: ' + (err.message || 'Error desconocido'));
        }
      }
      return;
    }
  });
}

async function loadPurchasesList() {
  const container = document.getElementById('purchases-list');
  if (!container) return;
  
  try {
    // Cargar todas las compras (sin límite o con límite alto)
    const data = await API.purchases.purchases.list({ limit: 1000 });
    container.innerHTML = renderPurchasesList(data.items || []);
  } catch (err) {
    console.error('Error cargando compras:', err);
    container.innerHTML = `<p class="text-red-400 text-sm">Error: ${err.message || 'Error desconocido'}</p>`;
  }
}

function openSupplierModal(supplierId = null) {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');
  if (!modal || !modalBody) return;
  
  const isEdit = supplierId !== null;
  const title = isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor';
  
  modalBody.innerHTML = `
    <div class="p-6">
      <h3 class="text-xl font-semibold text-white theme-light:text-slate-900 mb-4">${title}</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Nombre *</label>
          <input id="supplier-name" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Información de contacto (opcional)</label>
          <textarea id="supplier-contact" rows="3" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Notas (opcional)</label>
          <textarea id="supplier-notes" rows="2" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
        </div>
      </div>
      <div class="flex gap-3 mt-6">
        <button id="supplier-save" class="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors">Guardar</button>
        <button id="supplier-cancel" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300">Cancelar</button>
      </div>
    </div>
  `;
  
  modal.classList.remove('hidden');
  
  // Cargar datos si es edición
  if (isEdit) {
    API.purchases.suppliers.list().then(suppliers => {
      const supplier = suppliers.find(s => s._id === supplierId);
      if (supplier) {
        document.getElementById('supplier-name').value = supplier.name || '';
        document.getElementById('supplier-contact').value = JSON.stringify(supplier.contactInfo || {}, null, 2);
        document.getElementById('supplier-notes').value = supplier.notes || '';
      }
    });
  }
  
  document.getElementById('supplier-save')?.addEventListener('click', async () => {
    const name = document.getElementById('supplier-name')?.value?.trim();
    if (!name) {
      alert('El nombre es requerido');
      return;
    }
    
    try {
      let contactInfo = {};
      try {
        const contactText = document.getElementById('supplier-contact')?.value?.trim();
        if (contactText) {
          contactInfo = JSON.parse(contactText);
        }
      } catch (e) {
        // Si no es JSON válido, ignorar
      }
      
      const notes = document.getElementById('supplier-notes')?.value?.trim() || '';
      
      if (isEdit) {
        await API.purchases.suppliers.update(supplierId, { name, contactInfo, notes });
      } else {
        await API.purchases.suppliers.create({ name, contactInfo, notes });
      }
      
      modal.classList.add('hidden');
      const container = document.getElementById('compras-content');
      container.dataset.loaded = 'false';
      loadComprasContent();
    } catch (err) {
      alert('Error: ' + (err.message || 'Error desconocido'));
    }
  });
  
  document.getElementById('supplier-cancel')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  
  document.getElementById('modalClose')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
}

function openInvestorModal(investorId = null) {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');
  if (!modal || !modalBody) return;
  
  const isEdit = investorId !== null;
  const title = isEdit ? 'Editar Inversor' : 'Nuevo Inversor';
  
  modalBody.innerHTML = `
    <div class="p-6">
      <h3 class="text-xl font-semibold text-white theme-light:text-slate-900 mb-4">${title}</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Nombre *</label>
          <input id="investor-name" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Información de contacto (opcional)</label>
          <textarea id="investor-contact" rows="3" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Notas (opcional)</label>
          <textarea id="investor-notes" rows="2" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
        </div>
      </div>
      <div class="flex gap-3 mt-6">
        <button id="investor-save" class="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors">Guardar</button>
        <button id="investor-cancel" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300">Cancelar</button>
      </div>
    </div>
  `;
  
  modal.classList.remove('hidden');
  
  // Cargar datos si es edición
  if (isEdit) {
    API.purchases.investors.list().then(investors => {
      const investor = investors.find(i => i._id === investorId);
      if (investor) {
        document.getElementById('investor-name').value = investor.name || '';
        document.getElementById('investor-contact').value = JSON.stringify(investor.contactInfo || {}, null, 2);
        document.getElementById('investor-notes').value = investor.notes || '';
      }
    });
  }
  
  document.getElementById('investor-save')?.addEventListener('click', async () => {
    const name = document.getElementById('investor-name')?.value?.trim();
    if (!name) {
      alert('El nombre es requerido');
      return;
    }
    
    try {
      let contactInfo = {};
      try {
        const contactText = document.getElementById('investor-contact')?.value?.trim();
        if (contactText) {
          contactInfo = JSON.parse(contactText);
        }
      } catch (e) {
        // Si no es JSON válido, ignorar
      }
      
      const notes = document.getElementById('investor-notes')?.value?.trim() || '';
      
      if (isEdit) {
        await API.purchases.investors.update(investorId, { name, contactInfo, notes });
      } else {
        await API.purchases.investors.create({ name, contactInfo, notes });
      }
      
      modal.classList.add('hidden');
      const container = document.getElementById('compras-content');
      container.dataset.loaded = 'false';
      loadComprasContent();
    } catch (err) {
      alert('Error: ' + (err.message || 'Error desconocido'));
    }
  });
  
  document.getElementById('investor-cancel')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  
  document.getElementById('modalClose')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
}

function openPurchaseModal() {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');
  if (!modal || !modalBody) return;
  
  // Cargar proveedores e inversores para los selects
  Promise.all([
    API.purchases.suppliers.list(),
    API.purchases.investors.list(),
    invAPI.listItems({ limit: 1000 })
  ]).then(([suppliers, investors, itemsData]) => {
    const items = itemsData.data || [];
    
    const supplierOptions = [
      '<option value="GENERAL">GENERAL</option>',
      ...suppliers.map(s => `<option value="${s._id}">${escapeHtml(s.name)}</option>`)
    ].join('');
    
    const investorOptions = [
      '<option value="GENERAL">GENERAL</option>',
      ...investors.map(i => `<option value="${i._id}">${escapeHtml(i.name)}</option>`)
    ].join('');
    
    modalBody.innerHTML = `
      <div class="p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-2xl shadow-lg">
            🛒
          </div>
          <div>
            <h3 class="text-2xl font-bold text-white theme-light:text-slate-900">Nueva Compra</h3>
            <p class="text-sm text-slate-400 theme-light:text-slate-600">Registra una nueva compra de inventario</p>
          </div>
        </div>
        
        <div class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
              <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
                <span>🏪</span>
                <span>Proveedor</span>
              </label>
              <select id="purchase-supplier" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all">
                ${supplierOptions}
              </select>
            </div>
            <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
              <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
                <span>💰</span>
                <span>Inversor</span>
              </label>
              <select id="purchase-investor" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all">
                ${investorOptions}
              </select>
            </div>
          </div>
          
          <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
            <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
              <span>📅</span>
              <span>Fecha de compra</span>
            </label>
            <input id="purchase-date" type="date" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value="${new Date().toISOString().split('T')[0]}" />
          </div>
          
          <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
            <div class="flex items-center justify-between mb-4">
              <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 flex items-center gap-2">
                <span>📦</span>
                <span>Items de la compra</span>
              </label>
              <button id="btn-add-purchase-item" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 flex items-center gap-2">
                <span>➕</span>
                <span>Agregar Item</span>
              </button>
            </div>
            <div id="purchase-items" class="space-y-3">
              <!-- Se agregarán dinámicamente -->
            </div>
          </div>
          
          <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
            <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
              <span>📝</span>
              <span>Notas (opcional)</span>
            </label>
            <textarea id="purchase-notes" rows="3" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none" placeholder="Agrega notas adicionales sobre esta compra..."></textarea>
          </div>
        </div>
        
        <div class="flex gap-3 mt-6 pt-6 border-t border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
          <button id="purchase-save" class="flex-1 px-6 py-3 rounded-lg bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 flex items-center justify-center gap-2">
            <span>💾</span>
            <span>Guardar Compra</span>
          </button>
          <button id="purchase-cancel" class="px-6 py-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-all duration-200 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 flex items-center gap-2">
            <span>❌</span>
            <span>Cancelar</span>
          </button>
        </div>
      </div>
    `;
    
    modal.classList.remove('hidden');
    
    let purchaseItems = [];
    let itemCounter = 0;
    
    const itemsContainer = document.getElementById('purchase-items');
    
    // Guardar items para el filtrado
    window.purchaseItemsData = items;
    
    function addPurchaseItemRow() {
      const id = `item-${itemCounter++}`;
      const row = document.createElement('div');
      row.className = 'bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-3 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200';
      row.id = id;
      row.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div class="md:col-span-1 relative">
            <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">🔍 Buscar Item</label>
            <div class="relative">
              <input 
                type="text" 
                class="purchase-item-search w-full px-3 py-2 pl-10 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                placeholder="Buscar por SKU o nombre..."
                autocomplete="off"
              />
              <span class="absolute left-3 top-2.5 text-slate-400">🔍</span>
              <div class="purchase-item-dropdown hidden absolute z-50 w-full mt-1 bg-slate-800 dark:bg-slate-800 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg shadow-xl max-h-60 overflow-auto custom-scrollbar"></div>
            </div>
            <input type="hidden" class="purchase-item-id" value="" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">📦 Cantidad</label>
            <input type="number" min="1" step="1" class="purchase-item-qty w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value="1" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">
              💰 Precio por Unidad *
            </label>
            <input type="number" min="0" step="0.01" class="purchase-item-price w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value="0" placeholder="0.00" />
            <p class="text-xs text-slate-400 theme-light:text-slate-500 mt-1">Precio de compra por cada unidad</p>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">
              💵 Precio Total (opcional)
            </label>
            <input type="number" min="0" step="0.01" class="purchase-item-total w-full px-3 py-2 rounded-lg bg-slate-700/30 border border-slate-600/30 text-white theme-light:bg-slate-50 theme-light:text-slate-900 theme-light:border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value="" placeholder="Opcional" />
            <p class="text-xs text-slate-400 theme-light:text-slate-500 mt-1">Si ingresas el total, se calculará el precio unitario</p>
          </div>
          <div>
            <button class="remove-purchase-item w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 flex items-center justify-center gap-1">
              <span>🗑️</span>
              <span>Eliminar</span>
            </button>
          </div>
        </div>
        <div class="purchase-item-selected mt-2 hidden">
          <div class="bg-blue-500/20 dark:bg-blue-500/20 theme-light:bg-blue-50 rounded-lg p-2 border border-blue-500/30 flex items-center gap-2">
            <span class="text-blue-400 theme-light:text-blue-600">✅</span>
            <span class="text-sm text-blue-300 theme-light:text-blue-700 purchase-item-display"></span>
          </div>
        </div>
      `;
      
      // Setup search functionality
      const searchInput = row.querySelector('.purchase-item-search');
      const dropdown = row.querySelector('.purchase-item-dropdown');
      const hiddenInput = row.querySelector('.purchase-item-id');
      const selectedDisplay = row.querySelector('.purchase-item-selected');
      const displayText = row.querySelector('.purchase-item-display');
      
      let selectedItem = null;
      
      function filterItems(query) {
        if (!query || query.trim() === '') {
          dropdown.classList.add('hidden');
          return;
        }
        
        const lowerQuery = query.toLowerCase();
        const filtered = window.purchaseItemsData.filter(item => {
          const sku = (item.sku || '').toLowerCase();
          const name = (item.name || '').toLowerCase();
          return sku.includes(lowerQuery) || name.includes(lowerQuery);
        }).slice(0, 10); // Limitar a 10 resultados
        
        if (filtered.length === 0) {
          dropdown.innerHTML = `
            <div class="p-3 text-center text-slate-400 theme-light:text-slate-500 text-sm">
              No se encontraron items
            </div>
          `;
        } else {
          dropdown.innerHTML = filtered.map(item => {
            const sku = escapeHtml(item.sku || 'Sin SKU');
            const name = escapeHtml(item.name || 'Sin nombre');
            const stock = item.stock || 0;
            return `
              <div 
                class="purchase-item-option p-3 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-100 cursor-pointer border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-200 last:border-b-0 transition-colors"
                data-id="${item._id}"
                data-sku="${sku}"
                data-name="${name}"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${sku}</div>
                    <div class="text-xs text-slate-400 theme-light:text-slate-600">${name}</div>
                  </div>
                  <div class="text-xs text-slate-500 theme-light:text-slate-500">
                    Stock: ${stock}
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }
        
        dropdown.classList.remove('hidden');
        
        // Add click handlers to options
        dropdown.querySelectorAll('.purchase-item-option').forEach(option => {
          option.addEventListener('click', () => {
            const itemId = option.dataset.id;
            const sku = option.dataset.sku;
            const name = option.dataset.name;
            
            selectedItem = window.purchaseItemsData.find(i => i._id === itemId);
            hiddenInput.value = itemId;
            searchInput.value = `${sku} - ${name}`;
            displayText.textContent = `${sku} - ${name}`;
            selectedDisplay.classList.remove('hidden');
            dropdown.classList.add('hidden');
            
            // Auto-fill price if item has entryPrice
            if (selectedItem && selectedItem.entryPrice) {
              const priceInput = row.querySelector('.purchase-item-price');
              if (priceInput && parseFloat(priceInput.value) === 0) {
                priceInput.value = selectedItem.entryPrice;
              }
            }
          });
        });
      }
      
      // Lógica para calcular precio unitario desde precio total
      const priceInput = row.querySelector('.purchase-item-price');
      const totalInput = row.querySelector('.purchase-item-total');
      const qtyInput = row.querySelector('.purchase-item-qty');
      
      if (totalInput) {
        totalInput.addEventListener('input', () => {
          const total = parseFloat(totalInput.value) || 0;
          const qty = parseFloat(qtyInput.value) || 1;
          if (total > 0 && qty > 0) {
            const unitPrice = total / qty;
            priceInput.value = unitPrice.toFixed(2);
          }
        });
      }
      
      // Si se cambia cantidad y hay precio total, recalcular
      if (qtyInput) {
        qtyInput.addEventListener('input', () => {
          const total = parseFloat(totalInput?.value || 0) || 0;
          const qty = parseFloat(qtyInput.value) || 1;
          if (total > 0 && qty > 0) {
            const unitPrice = total / qty;
            if (priceInput) priceInput.value = unitPrice.toFixed(2);
          }
        });
      }
      
      // Si se cambia precio unitario, limpiar precio total
      if (priceInput) {
        priceInput.addEventListener('input', () => {
          if (priceInput.value && parseFloat(priceInput.value) > 0 && totalInput) {
            totalInput.value = '';
          }
        });
      }
      
      searchInput.addEventListener('input', (e) => {
        filterItems(e.target.value);
      });
      
      searchInput.addEventListener('focus', () => {
        if (searchInput.value && !selectedItem) {
          filterItems(searchInput.value);
        }
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!row.contains(e.target)) {
          dropdown.classList.add('hidden');
        }
      });
      
      row.querySelector('.remove-purchase-item')?.addEventListener('click', () => {
        row.remove();
      });
      
      itemsContainer.appendChild(row);
    }
    
    document.getElementById('btn-add-purchase-item')?.addEventListener('click', () => {
      addPurchaseItemRow();
    });
    
    // Agregar primera fila
    addPurchaseItemRow();
    
    document.getElementById('purchase-save')?.addEventListener('click', async () => {
      const supplierId = document.getElementById('purchase-supplier')?.value;
      const investorId = document.getElementById('purchase-investor')?.value;
      const purchaseDate = document.getElementById('purchase-date')?.value;
      const notes = document.getElementById('purchase-notes')?.value?.trim() || '';
      
      // Recopilar items
      const items = [];
      document.querySelectorAll('#purchase-items > div').forEach(row => {
        const itemId = row.querySelector('.purchase-item-id')?.value;
        const qty = parseInt(row.querySelector('.purchase-item-qty')?.value || '0', 10);
        const unitPrice = parseFloat(row.querySelector('.purchase-item-price')?.value || '0', 10);
        
        if (itemId && qty > 0 && unitPrice >= 0) {
          items.push({ itemId, qty, unitPrice });
        }
      });
      
      if (items.length === 0) {
        alert('Debe agregar al menos un item');
        return;
      }
      
      try {
        await API.purchases.purchases.create({
          supplierId: supplierId === 'GENERAL' ? null : supplierId,
          investorId: investorId === 'GENERAL' ? null : investorId,
          purchaseDate,
          items,
          notes
        });
        
        modal.classList.add('hidden');
        // Recargar todo el contenido de compras para actualizar las listas
        const comprasContainer = document.getElementById('compras-content');
        if (comprasContainer) {
          comprasContainer.dataset.loaded = 'false';
          loadComprasContent();
        } else {
          loadPurchasesList();
        }
        alert('Compra registrada exitosamente. El stock ha sido actualizado automáticamente.');
      } catch (err) {
        alert('Error: ' + (err.message || 'Error desconocido'));
      }
    });
    
    document.getElementById('purchase-cancel')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    
    document.getElementById('modalClose')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }).catch(err => {
    console.error('Error cargando datos:', err);
    alert('Error cargando datos: ' + (err.message || 'Error desconocido'));
  });
}

// Cargar contenido de inversores
async function loadInversoresContent() {
  const container = document.getElementById('inv-investors-list');
  if (!container) return;
  
  // Si ya está cargado, no recargar
  if (container.dataset.loaded === 'true') return;
  
  try {
    // Cargar inversores usando la API de investments
    const data = await API.investments.listInvestors();
    // La API devuelve un array directamente, no un objeto con investors
    const investors = Array.isArray(data) ? data : (data.investors || []);
      
    if (investors.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12">
          <div class="text-6xl mb-4">👤</div>
          <p class="text-slate-400 theme-light:text-slate-600 text-lg">No hay inversores registrados</p>
          <p class="text-slate-500 theme-light:text-slate-500 text-sm mt-2">Crea un inversor desde la pestaña "Compras"</p>
        </div>
      `;
      container.dataset.loaded = 'true';
      return;
    }

    const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    container.innerHTML = investors.map(inv => {
      // La estructura es { investor: { _id, name }, summary: { ... } }
      const investor = inv.investor || inv;
      const summary = inv.summary || {};
      const investorId = investor._id || inv._id;
      const investorName = investor.name || 'Sin nombre';
      
      const totalInv = money(summary.totalInvestment || 0);
      const availableVal = money(summary.availableValue || 0);
      const soldVal = money(summary.soldValue || 0);
      const paidVal = money(summary.paidValue || 0);
      const pendingVal = money(Math.max(0, summary.pendingPayment || 0));
      
      return `
        <div class="bg-gradient-to-br from-slate-700/80 to-slate-800/80 dark:from-slate-700/80 dark:to-slate-800/80 theme-light:from-white theme-light:to-slate-50 rounded-xl p-5 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-[1.02] group" data-investor-id="${investorId}" onclick="openInvestorDetailView('${investorId}')">
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg group-hover:scale-110 transition-transform">
                ${(investorName.charAt(0) || '?').toUpperCase()}
              </div>
              <div>
                <h4 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 group-hover:text-blue-400 transition-colors">💰 ${escapeHtml(investorName)}</h4>
                <p class="text-xs text-slate-400 theme-light:text-slate-500 mt-1">Inversor</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-xs text-slate-400 theme-light:text-slate-500 mb-1">Total Inversión</p>
              <p class="text-lg font-bold text-blue-400 theme-light:text-blue-600">${totalInv}</p>
            </div>
          </div>
          
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div class="bg-green-500/20 dark:bg-green-500/20 theme-light:bg-green-50 rounded-lg p-3 border border-green-500/30">
              <p class="text-xs text-green-400 theme-light:text-green-600 mb-1">✅ Disponible</p>
              <p class="text-sm font-semibold text-green-300 theme-light:text-green-700">${availableVal}</p>
            </div>
            <div class="bg-yellow-500/20 dark:bg-yellow-500/20 theme-light:bg-yellow-50 rounded-lg p-3 border border-yellow-500/30">
              <p class="text-xs text-yellow-400 theme-light:text-yellow-600 mb-1">🛒 Vendido</p>
              <p class="text-sm font-semibold text-yellow-300 theme-light:text-yellow-700">${soldVal}</p>
            </div>
            <div class="bg-blue-500/20 dark:bg-blue-500/20 theme-light:bg-blue-50 rounded-lg p-3 border border-blue-500/30">
              <p class="text-xs text-blue-400 theme-light:text-blue-600 mb-1">💵 Pagado</p>
              <p class="text-sm font-semibold text-blue-300 theme-light:text-blue-700">${paidVal}</p>
            </div>
            <div class="bg-orange-500/20 dark:bg-orange-500/20 theme-light:bg-orange-50 rounded-lg p-3 border border-orange-500/30">
              <p class="text-xs text-orange-400 theme-light:text-orange-600 mb-1">⏳ Pendiente</p>
              <p class="text-sm font-semibold text-orange-300 theme-light:text-orange-700">${pendingVal}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
      
    container.dataset.loaded = 'true';
  } catch (err) {
    console.error('Error cargando inversores:', err);
    container.innerHTML = `
      <div class="text-center py-8">
        <div class="text-5xl mb-4">⚠️</div>
        <p class="text-red-400 text-lg font-semibold">Error al cargar inversores</p>
        <p class="text-slate-400 theme-light:text-slate-600 text-sm mt-2">${err.message || 'Error desconocido'}</p>
      </div>
    `;
    container.dataset.loaded = 'true';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Abrir vista completa del inversor (reemplaza contenido de la página)
async function openInvestorDetailView(investorId) {
  try {
    const container = document.getElementById('inv-investors-list');
    if (!container) return;
    
    // Mostrar loading
    container.innerHTML = '<div class="text-center py-12"><div class="text-6xl mb-4 animate-spin">⏳</div><p class="text-slate-400 theme-light:text-slate-600">Cargando detalles del inversor...</p></div>';
    
    // Cargar datos del inversor
    const [investorData, purchasesData, investorInfo, allItemsData] = await Promise.all([
      API.investments.getInvestorInvestments(investorId),
      API.purchases.purchases.list({ investorId, limit: 1000 }),
      API.purchases.investors.list().then(investors => investors.find(i => i._id === investorId) || { name: 'Sin nombre' }),
      invAPI.listItems({ limit: 10000 }) // Para obtener fotos de items
    ]);
    
    const investor = investorData;
    const investorName = investorInfo?.name || 'Sin nombre';
    const summary = investor.summary || {};
    const items = investor.items || {};
    const purchases = purchasesData.items || [];
    const allItems = allItemsData.data || [];
    const itemsMap = new Map(allItems.map(item => [String(item._id), item]));
    const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    // Agrupar items disponibles por itemId y calcular totales y precio ponderado
    const availableItemsMap = {};
    (items.available || []).forEach(item => {
      const itemId = item.itemId?._id || item.itemId?.id || null;
      if (!itemId) return;
      
      const fullItem = itemsMap.get(String(itemId));
      const itemName = fullItem?.name || item.itemId?.name || item.itemId?.sku || 'N/A';
      const itemSku = fullItem?.sku || item.itemId?.sku || 'N/A';
      const itemImage = fullItem?.images?.[0]?.url || null;
      const itemStock = fullItem?.stock || 0;
      const qty = item.qty || 0;
      const purchasePrice = item.purchasePrice || 0;
      
      if (!availableItemsMap[itemId]) {
        availableItemsMap[itemId] = {
          itemId: itemId,
          itemName: itemName,
          itemSku: itemSku,
          itemImage: itemImage,
          itemStock: itemStock,
          totalQty: 0,
          totalValue: 0,
          weightedPrice: 0
        };
      }
      
      availableItemsMap[itemId].totalQty += qty;
      availableItemsMap[itemId].totalValue += (purchasePrice * qty);
    });
    
    // Calcular precio ponderado para cada item
    Object.values(availableItemsMap).forEach(item => {
      if (item.totalQty > 0) {
        item.weightedPrice = item.totalValue / item.totalQty;
      }
    });
    
    // Renderizar items disponibles con diseño mejorado
    const availableItems = Object.values(availableItemsMap).map(item => {
      const imageHtml = item.itemImage 
        ? `<img src="${escapeHtml(item.itemImage)}" alt="${escapeHtml(item.itemName)}" class="w-full h-full object-cover rounded-lg" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />`
        : '';
      const placeholderHtml = `<div class="w-full h-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-2xl font-bold rounded-lg">${(item.itemName.charAt(0) || '?').toUpperCase()}</div>`;
      
      return `
        <div class="bg-gradient-to-br from-slate-700/80 to-slate-800/80 dark:from-slate-700/80 dark:to-slate-800/80 theme-light:from-white theme-light:to-slate-50 rounded-xl p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 hover:shadow-xl transition-all duration-300">
          <div class="flex gap-4">
            <div class="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-slate-600/50">
              ${imageHtml}
              <div class="w-full h-full items-center justify-center" style="display: ${item.itemImage ? 'none' : 'flex'}">${placeholderHtml}</div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between mb-2">
                <div class="flex-1 min-w-0">
                  <h4 class="text-lg font-bold text-white theme-light:text-slate-900 truncate">${escapeHtml(item.itemName)}</h4>
                  <p class="text-sm text-slate-400 theme-light:text-slate-600">SKU: ${escapeHtml(item.itemSku)}</p>
                </div>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div class="bg-blue-500/20 dark:bg-blue-500/20 theme-light:bg-blue-50 rounded-lg p-2 border border-blue-500/30">
                  <p class="text-xs text-blue-400 theme-light:text-blue-600 mb-1">📦 Stock Total</p>
                  <p class="text-sm font-semibold text-blue-300 theme-light:text-blue-700">${item.itemStock}</p>
                </div>
                <div class="bg-green-500/20 dark:bg-green-500/20 theme-light:bg-green-50 rounded-lg p-2 border border-green-500/30">
                  <p class="text-xs text-green-400 theme-light:text-green-600 mb-1">✅ Del Inversor</p>
                  <p class="text-sm font-semibold text-green-300 theme-light:text-green-700">${item.totalQty}</p>
                </div>
                <div class="bg-purple-500/20 dark:bg-purple-500/20 theme-light:bg-purple-50 rounded-lg p-2 border border-purple-500/30">
                  <p class="text-xs text-purple-400 theme-light:text-purple-600 mb-1">💰 Precio Promedio</p>
                  <p class="text-sm font-semibold text-purple-300 theme-light:text-purple-700">${money(item.weightedPrice)}</p>
                </div>
                <div class="bg-yellow-500/20 dark:bg-yellow-500/20 theme-light:bg-yellow-50 rounded-lg p-2 border border-yellow-500/30">
                  <p class="text-xs text-yellow-400 theme-light:text-yellow-600 mb-1">💵 Valor Total</p>
                  <p class="text-sm font-semibold text-yellow-300 theme-light:text-yellow-700">${money(item.totalValue)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('') || '<div class="text-center py-12 text-slate-400 theme-light:text-slate-600"><p class="text-lg">No hay items disponibles</p></div>';
    
    // Renderizar items vendidos
    const soldItems = (items.sold || []).map(item => {
      const itemId = item.itemId?._id || item.itemId?.id || null;
      const fullItem = itemId ? itemsMap.get(String(itemId)) : null;
      const itemName = fullItem?.name || item.itemId?.name || item.itemId?.sku || 'N/A';
      const itemSku = fullItem?.sku || item.itemId?.sku || 'N/A';
      const total = (item.purchasePrice || 0) * (item.qty || 0);
      const saleNumber = item.saleId?.number || 'N/A';
      const itemIdStr = item._id || item.id;
      
      return `
        <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 hover:bg-slate-700/30 dark:hover:bg-slate-700/30 theme-light:hover:bg-slate-100">
          <td class="px-4 py-3 text-center">
            <input type="checkbox" class="sold-item-checkbox cursor-pointer" data-investment-item-id="${itemIdStr}" data-total="${total}" />
          </td>
          <td class="px-4 py-3">${escapeHtml(itemName)}</td>
          <td class="px-4 py-3 text-xs text-slate-400 theme-light:text-slate-600">${escapeHtml(itemSku)}</td>
          <td class="px-4 py-3 text-right">${item.qty || 0}</td>
          <td class="px-4 py-3 text-right">${money(item.purchasePrice || 0)}</td>
          <td class="px-4 py-3 text-right font-semibold">${money(total)}</td>
          <td class="px-4 py-3">${escapeHtml(saleNumber)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" class="text-center text-slate-400 theme-light:text-slate-600 py-4">No hay items vendidos</td></tr>';
    
    // Renderizar items pagados
    const paidItems = (items.paid || []).map(item => {
      const itemId = item.itemId?._id || item.itemId?.id || null;
      const fullItem = itemId ? itemsMap.get(String(itemId)) : null;
      const itemName = fullItem?.name || item.itemId?.name || item.itemId?.sku || 'N/A';
      const itemSku = fullItem?.sku || item.itemId?.sku || 'N/A';
      const total = (item.purchasePrice || 0) * (item.qty || 0);
      const saleNumber = item.saleId?.number || 'N/A';
      const paidAt = item.paidAt ? new Date(item.paidAt).toLocaleDateString() : 'N/A';
      
      return `
        <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 hover:bg-slate-700/30 dark:hover:bg-slate-700/30 theme-light:hover:bg-slate-100">
          <td class="px-4 py-3">${escapeHtml(itemName)}</td>
          <td class="px-4 py-3 text-xs text-slate-400 theme-light:text-slate-600">${escapeHtml(itemSku)}</td>
          <td class="px-4 py-3 text-right">${item.qty || 0}</td>
          <td class="px-4 py-3 text-right">${money(item.purchasePrice || 0)}</td>
          <td class="px-4 py-3 text-right">${money(total)}</td>
          <td class="px-4 py-3">${escapeHtml(saleNumber)}</td>
          <td class="px-4 py-3">${paidAt}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" class="text-center text-slate-400 theme-light:text-slate-600 py-4">No hay items pagados</td></tr>';
    
    // Renderizar compras con detalles de items
    const purchasesRows = purchases.map(purchase => {
      const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
      const supplierName = purchase.supplierId?.name || 'General';
      const itemsCount = purchase.items?.length || 0;
      const totalAmount = money(purchase.totalAmount || 0);
      const notes = purchase.notes || '';
      
      // Detalles de items comprados (sin necesidad de editar)
      const purchaseItemsDetails = (purchase.items || []).slice(0, 5).map(pItem => {
        const itemId = pItem.itemId?._id || pItem.itemId || null;
        const fullItem = itemId ? itemsMap.get(String(itemId)) : null;
        const itemName = fullItem?.name || pItem.itemId?.name || pItem.name || 'N/A';
        const qty = pItem.qty || 0;
        const unitPrice = money(pItem.unitPrice || 0);
        return `<div class="text-xs text-slate-400 theme-light:text-slate-600">• ${escapeHtml(itemName)} (${qty} x ${unitPrice})</div>`;
      }).join('');
      const moreItems = (purchase.items || []).length > 5 ? `<div class="text-xs text-slate-500 theme-light:text-slate-500 italic">... y ${(purchase.items || []).length - 5} más</div>` : '';
      
      return `
        <div class="bg-gradient-to-br from-slate-700/80 to-slate-800/80 dark:from-slate-700/80 dark:to-slate-800/80 theme-light:from-white theme-light:to-slate-50 rounded-xl p-5 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 hover:shadow-xl transition-all duration-300 mb-4">
          <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  📦
                </div>
                <div>
                  <h4 class="text-lg font-bold text-white theme-light:text-slate-900">Compra del ${purchaseDate}</h4>
                  <p class="text-sm text-slate-400 theme-light:text-slate-600">Proveedor: ${escapeHtml(supplierName)}</p>
                </div>
              </div>
              <div class="ml-16 mb-3 p-3 bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-slate-100 rounded-lg border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                <p class="text-xs font-semibold text-slate-300 theme-light:text-slate-700 mb-2">Items comprados (${itemsCount}):</p>
                ${purchaseItemsDetails}
                ${moreItems}
              </div>
              ${notes ? `<p class="text-xs text-slate-400 theme-light:text-slate-600 ml-16 italic">📝 ${escapeHtml(notes)}</p>` : ''}
            </div>
            <div class="flex flex-col gap-2 ml-4">
              <div class="text-right mb-2">
                <p class="text-xs text-slate-400 theme-light:text-slate-600">Total</p>
                <p class="text-xl font-bold text-green-400 theme-light:text-green-600">${totalAmount}</p>
              </div>
              <div class="flex gap-2">
                <button onclick="event.stopPropagation(); openPurchaseStickersModal('${purchase._id}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
                  🏷️ Stickers
                </button>
                <button onclick="event.stopPropagation(); editPurchase('${purchase._id}', '${investorId}')" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">
                  ✏️ Editar
                </button>
                <button onclick="event.stopPropagation(); deletePurchaseItems('${purchase._id}', '${investorId}')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors">
                  🗑️ Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('') || '<div class="text-center py-12 text-slate-400 theme-light:text-slate-600"><p class="text-lg">No hay compras registradas</p></div>';
    
    // Construir HTML completo
    const viewContent = `
      <div class="space-y-6">
        <!-- Botón volver -->
        <button onclick="loadInversoresContent()" class="mb-4 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900 rounded-lg flex items-center gap-2">
          <span>←</span>
          <span>Volver a la lista de inversores</span>
        </button>
        
        <!-- Header del inversor -->
        <div class="bg-gradient-to-br from-purple-600/80 to-pink-700/80 dark:from-purple-600/80 dark:to-pink-700/80 theme-light:from-purple-500 theme-light:to-pink-600 rounded-2xl p-6 shadow-2xl border border-purple-500/50">
          <div class="flex items-center gap-4 mb-6">
            <div class="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-4xl font-bold text-white shadow-xl">
              ${(investorName.charAt(0) || '?').toUpperCase()}
            </div>
            <div class="flex-1">
              <h2 class="text-3xl font-bold text-white mb-1">💰 ${escapeHtml(investorName)}</h2>
              <p class="text-purple-100 text-sm">Resumen completo de inversiones</p>
            </div>
          </div>
          
          <!-- Resumen financiero -->
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div class="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
              <p class="text-xs text-purple-100 mb-1">Total Inversión</p>
              <p class="text-xl font-bold text-white">${money(summary.totalInvestment || 0)}</p>
            </div>
            <div class="bg-green-500/20 backdrop-blur-sm rounded-xl p-4 border border-green-400/30">
              <p class="text-xs text-green-100 mb-1">✅ Disponible</p>
              <p class="text-xl font-bold text-green-300">${money(summary.availableValue || 0)}</p>
            </div>
            <div class="bg-yellow-500/20 backdrop-blur-sm rounded-xl p-4 border border-yellow-400/30">
              <p class="text-xs text-yellow-100 mb-1">🛒 Vendido</p>
              <p class="text-xl font-bold text-yellow-300">${money(summary.soldValue || 0)}</p>
            </div>
            <div class="bg-blue-500/20 backdrop-blur-sm rounded-xl p-4 border border-blue-400/30">
              <p class="text-xs text-blue-100 mb-1">💵 Pagado</p>
              <p class="text-xl font-bold text-blue-300">${money(summary.paidValue || 0)}</p>
            </div>
            <div class="bg-orange-500/20 backdrop-blur-sm rounded-xl p-4 border border-orange-400/30">
              <p class="text-xs text-orange-100 mb-1">⏳ Pendiente</p>
              <p class="text-xl font-bold text-orange-300">${money(Math.max(0, summary.pendingPayment || 0))}</p>
            </div>
          </div>
        </div>
        
        <!-- Items Disponibles -->
        <div class="bg-gradient-to-br from-slate-800/90 to-slate-900/90 dark:from-slate-800/90 dark:to-slate-900/90 theme-light:from-sky-50/95 theme-light:to-white rounded-2xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-2xl shadow-lg">
              📦
            </div>
            <div>
              <h3 class="text-2xl font-bold text-white theme-light:text-slate-900">Items Disponibles</h3>
              <p class="text-sm text-slate-400 theme-light:text-slate-600">${Object.keys(availableItemsMap).length} tipo(s) de items</p>
            </div>
          </div>
          <div class="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
            ${availableItems}
          </div>
        </div>
        
        <!-- Items Vendidos -->
        <div class="bg-gradient-to-br from-slate-800/90 to-slate-900/90 dark:from-slate-800/90 dark:to-slate-900/90 theme-light:from-sky-50/95 theme-light:to-white rounded-2xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-2xl shadow-lg">
                🛒
              </div>
              <div>
                <h3 class="text-2xl font-bold text-white theme-light:text-slate-900">Items Vendidos</h3>
                <p class="text-sm text-slate-400 theme-light:text-slate-600">${(items.sold || []).length} item(s) vendido(s)</p>
              </div>
            </div>
            ${(items.sold && items.sold.length > 0) ? `
              <button id="btn-cobrar-items" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
                💰 Cobrar Items
              </button>
            ` : ''}
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
                <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                  <th class="px-4 py-3 text-center text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
                    <input type="checkbox" id="select-all-sold" class="cursor-pointer" />
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Item</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">SKU</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Cantidad</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Precio Compra</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Valor Total</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Venta</th>
                </tr>
              </thead>
              <tbody class="text-white dark:text-white theme-light:text-slate-900">${soldItems}</tbody>
            </table>
          </div>
        </div>
        
        <!-- Items Pagados -->
        <div class="bg-gradient-to-br from-slate-800/90 to-slate-900/90 dark:from-slate-800/90 dark:to-slate-900/90 theme-light:from-sky-50/95 theme-light:to-white rounded-2xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-2xl shadow-lg">
              💵
            </div>
            <div>
              <h3 class="text-2xl font-bold text-white theme-light:text-slate-900">Items Pagados</h3>
              <p class="text-sm text-slate-400 theme-light:text-slate-600">${(items.paid || []).length} item(s) pagado(s)</p>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
                <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Item</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">SKU</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Cantidad</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Precio Compra</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Valor Total</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Venta</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Fecha Pago</th>
                </tr>
              </thead>
              <tbody class="text-white dark:text-white theme-light:text-slate-900">${paidItems}</tbody>
            </table>
          </div>
        </div>
        
        <!-- Compras Registradas -->
        <div class="bg-gradient-to-br from-slate-800/90 to-slate-900/90 dark:from-slate-800/90 dark:to-slate-900/90 theme-light:from-sky-50/95 theme-light:to-white rounded-2xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg">
              🛍️
            </div>
            <div>
              <h3 class="text-2xl font-bold text-white theme-light:text-slate-900">Compras Registradas</h3>
              <p class="text-sm text-slate-400 theme-light:text-slate-600">${purchases.length} compra(s) registrada(s)</p>
            </div>
          </div>
          <div class="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
            ${purchasesRows}
          </div>
        </div>
      </div>
    `;
    
    container.innerHTML = viewContent;
    
    // Configurar funcionalidad de cobro si hay items vendidos
    if (items.sold && items.sold.length > 0) {
      // Checkbox "Seleccionar todos"
      const selectAllCheckbox = document.getElementById('select-all-sold');
      const soldCheckboxes = document.querySelectorAll('.sold-item-checkbox');
      
      if (selectAllCheckbox && soldCheckboxes.length > 0) {
        selectAllCheckbox.addEventListener('change', (e) => {
          soldCheckboxes.forEach(cb => {
            cb.checked = e.target.checked;
          });
        });
      }
      
      // Botón "Cobrar Items"
      const btnCobrar = document.getElementById('btn-cobrar-items');
      if (btnCobrar) {
        btnCobrar.onclick = () => openPayInvestorItemsModal(investorId, items.sold || []);
      }
    }
    
    // Función global para editar compra (mantener compatibilidad)
    window.editPurchase = async function(purchaseId, investorIdCtx) {
      try {
        const purchase = await API.purchases.purchases.get(purchaseId);
        const [suppliers, investors, itemsData] = await Promise.all([
          API.purchases.suppliers.list(),
          API.purchases.investors.list(),
          invAPI.listItems({ limit: 1000 })
        ]);
        
        const items = itemsData.data || [];
        window.purchaseItemsData = items;
        
        const supplierOptions = [
          '<option value="GENERAL">GENERAL</option>',
          ...suppliers.map(s => `<option value="${s._id}" ${purchase.supplierId && String(s._id) === String(purchase.supplierId) ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
        ].join('');
        
        const investorOptions = [
          '<option value="GENERAL">GENERAL</option>',
          ...investors.map(i => `<option value="${i._id}" ${purchase.investorId && String(i._id) === String(purchase.investorId) ? 'selected' : ''}>${escapeHtml(i.name)}</option>`)
        ].join('');
        
        const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        
        const modalContent = `
          <div class="p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-2xl shadow-lg">
                ✏️
              </div>
              <div>
                <h3 class="text-2xl font-bold text-white theme-light:text-slate-900">Editar Compra</h3>
                <p class="text-sm text-slate-400 theme-light:text-slate-600">Modifica los datos de la compra</p>
              </div>
            </div>
            
            <div class="space-y-6">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                  <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
                    <span>🏪</span>
                    <span>Proveedor</span>
                  </label>
                  <select id="edit-purchase-supplier" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all">
                    ${supplierOptions}
                  </select>
                </div>
                <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                  <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
                    <span>💰</span>
                    <span>Inversor</span>
                  </label>
                  <select id="edit-purchase-investor" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all">
                    ${investorOptions}
                  </select>
                </div>
              </div>
              
              <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
                  <span>📅</span>
                  <span>Fecha de compra</span>
                </label>
                <input id="edit-purchase-date" type="date" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value="${purchaseDate}" />
              </div>
              
              <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                <div class="flex items-center justify-between mb-4">
                  <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 flex items-center gap-2">
                    <span>📦</span>
                    <span>Items de la compra</span>
                  </label>
                  <button id="btn-add-edit-purchase-item" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 flex items-center gap-2">
                    <span>➕</span>
                    <span>Agregar Item</span>
                  </button>
                </div>
                <div id="edit-purchase-items" class="space-y-3">
                  <!-- Se agregarán dinámicamente -->
                </div>
              </div>
              
              <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
                  <span>📝</span>
                  <span>Notas (opcional)</span>
                </label>
                <textarea id="edit-purchase-notes" rows="3" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none" placeholder="Agrega notas adicionales sobre esta compra...">${escapeHtml(purchase.notes || '')}</textarea>
              </div>
            </div>
            
            <div class="flex gap-3 mt-6 pt-6 border-t border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
              <button id="edit-purchase-save" class="flex-1 px-6 py-3 rounded-lg bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 flex items-center justify-center gap-2">
                <span>💾</span>
                <span>Guardar Cambios</span>
              </button>
              <button onclick="invCloseModal()" class="px-6 py-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-all duration-200 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 flex items-center gap-2">
                <span>❌</span>
                <span>Cancelar</span>
              </button>
            </div>
          </div>
        `;
        
        invOpenModal(modalContent);
        
        // Cargar items existentes (código similar al anterior)
        const itemsContainer = document.getElementById('edit-purchase-items');
        let itemCounter = 0;
        
        function addEditPurchaseItemRow(itemData = null) {
          const id = `edit-item-${itemCounter++}`;
          const row = document.createElement('div');
          row.className = 'bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-3 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200';
          row.id = id;
          
          const selectedItemId = itemData?.itemId?._id || itemData?.itemId || '';
          const selectedItemName = itemData?.itemId?.name || itemData?.itemId?.sku || '';
          const qty = itemData?.qty || 1;
          const unitPrice = itemData?.unitPrice || 0;
          
          row.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div class="md:col-span-1 relative">
                <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">🔍 Buscar Item</label>
                <div class="relative">
                  <input 
                    type="text" 
                    class="edit-purchase-item-search w-full px-3 py-2 pl-10 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Buscar por SKU o nombre..."
                    value="${escapeHtml(selectedItemName)}"
                    autocomplete="off"
                  />
                  <span class="absolute left-3 top-2.5 text-slate-400">🔍</span>
                  <div class="edit-purchase-item-dropdown hidden absolute z-50 w-full mt-1 bg-slate-800 dark:bg-slate-800 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg shadow-xl max-h-60 overflow-auto custom-scrollbar"></div>
                </div>
                <input type="hidden" class="edit-purchase-item-id" value="${selectedItemId}" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">📦 Cantidad</label>
                <input type="number" min="1" step="1" class="edit-purchase-item-qty w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value="${qty}" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">
                  💰 Precio por Unidad *
                </label>
                <input type="number" min="0" step="0.01" class="edit-purchase-item-price w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value="${unitPrice}" placeholder="0.00" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">
                  💵 Precio Total (opcional)
                </label>
                <input type="number" min="0" step="0.01" class="edit-purchase-item-total w-full px-3 py-2 rounded-lg bg-slate-700/30 border border-slate-600/30 text-white theme-light:bg-slate-50 theme-light:text-slate-900 theme-light:border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value="" placeholder="Opcional" />
              </div>
              <div>
                <button class="remove-edit-purchase-item w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 flex items-center justify-center gap-1">
                  <span>🗑️</span>
                  <span>Eliminar</span>
                </button>
              </div>
            </div>
            <div class="edit-purchase-item-selected mt-2 ${selectedItemId ? '' : 'hidden'}">
              <div class="bg-blue-500/20 dark:bg-blue-500/20 theme-light:bg-blue-50 rounded-lg p-2 border border-blue-500/30 flex items-center gap-2">
                <span class="text-blue-400 theme-light:text-blue-600">✅</span>
                <span class="text-sm text-blue-300 theme-light:text-blue-700 edit-purchase-item-display">${escapeHtml(selectedItemName)}</span>
              </div>
            </div>
          `;
          
          itemsContainer.appendChild(row);
          
          // Setup search functionality (similar to openPurchaseModal)
          const searchInput = row.querySelector('.edit-purchase-item-search');
          const dropdown = row.querySelector('.edit-purchase-item-dropdown');
          const itemIdInput = row.querySelector('.edit-purchase-item-id');
          const itemDisplay = row.querySelector('.edit-purchase-item-display');
          const selectedDiv = row.querySelector('.edit-purchase-item-selected');
          
          let selectedItem = null;
          
          function filterEditItems(query) {
            if (!query || query.trim() === '') {
              dropdown.classList.add('hidden');
              return;
            }
            
            const lowerQuery = query.toLowerCase();
            const filtered = window.purchaseItemsData.filter(item => {
              const sku = (item.sku || '').toLowerCase();
              const name = (item.name || '').toLowerCase();
              return sku.includes(lowerQuery) || name.includes(lowerQuery);
            }).slice(0, 10);
            
            if (filtered.length === 0) {
              dropdown.innerHTML = `
                <div class="p-3 text-center text-slate-400 theme-light:text-slate-500 text-sm">
                  No se encontraron items
                </div>
              `;
            } else {
              dropdown.innerHTML = filtered.map(item => {
                const sku = escapeHtml(item.sku || 'Sin SKU');
                const name = escapeHtml(item.name || 'Sin nombre');
                const stock = item.stock || 0;
                return `
                  <div 
                    class="edit-purchase-item-option p-3 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-100 cursor-pointer border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-200 last:border-b-0 transition-colors"
                    data-id="${item._id}"
                    data-sku="${sku}"
                    data-name="${name}"
                  >
                    <div class="flex items-center justify-between">
                      <div>
                        <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${sku}</div>
                        <div class="text-xs text-slate-400 theme-light:text-slate-600">${name}</div>
                      </div>
                      <div class="text-xs text-slate-500 theme-light:text-slate-500">
                        Stock: ${stock}
                      </div>
                    </div>
                  </div>
                `;
              }).join('');
            }
            
            dropdown.classList.remove('hidden');
            
            dropdown.querySelectorAll('.edit-purchase-item-option').forEach(option => {
              option.addEventListener('click', () => {
                const itemId = option.dataset.id;
                const sku = option.dataset.sku;
                const name = option.dataset.name;
                
                selectedItem = window.purchaseItemsData.find(i => i._id === itemId);
                itemIdInput.value = itemId;
                searchInput.value = `${sku} - ${name}`;
                itemDisplay.textContent = `${sku} - ${name}`;
                selectedDiv.classList.remove('hidden');
                dropdown.classList.add('hidden');
                
                if (selectedItem && selectedItem.entryPrice) {
                  const priceInput = row.querySelector('.edit-purchase-item-price');
                  if (parseFloat(priceInput.value) === 0) {
                    priceInput.value = selectedItem.entryPrice;
                  }
                }
              });
            });
          }
          
          searchInput.addEventListener('input', (e) => {
            filterEditItems(e.target.value);
          });
          
          searchInput.addEventListener('focus', () => {
            if (searchInput.value && !selectedItem) {
              filterEditItems(searchInput.value);
            }
          });
          
          document.addEventListener('click', (e) => {
            if (!row.contains(e.target)) {
              dropdown.classList.add('hidden');
            }
          });
          
          row.querySelector('.remove-edit-purchase-item').onclick = () => {
            row.remove();
          };
          
          const qtyInput = row.querySelector('.edit-purchase-item-qty');
          const priceInput = row.querySelector('.edit-purchase-item-price');
          const totalInput = row.querySelector('.edit-purchase-item-total');
          
          qtyInput.addEventListener('input', () => {
            const qty = Number(qtyInput.value) || 0;
            const price = Number(priceInput.value) || 0;
            totalInput.value = (qty * price).toFixed(2);
          });
          
          priceInput.addEventListener('input', () => {
            const qty = Number(qtyInput.value) || 0;
            const price = Number(priceInput.value) || 0;
            totalInput.value = (qty * price).toFixed(2);
          });
          
          totalInput.addEventListener('input', () => {
            const total = Number(totalInput.value) || 0;
            const qty = Number(qtyInput.value) || 1;
            if (qty > 0) {
              priceInput.value = (total / qty).toFixed(2);
            }
          });
        }
        
        if (purchase.items && purchase.items.length > 0) {
          purchase.items.forEach(item => {
            addEditPurchaseItemRow(item);
          });
        } else {
          addEditPurchaseItemRow();
        }
        
        document.getElementById('btn-add-edit-purchase-item').onclick = () => {
          addEditPurchaseItemRow();
        };
        
        document.getElementById('edit-purchase-save').onclick = async () => {
          try {
            const itemsToSave = [];
            document.querySelectorAll('#edit-purchase-items > div').forEach(row => {
              const itemId = row.querySelector('.edit-purchase-item-id')?.value;
              const qty = Number(row.querySelector('.edit-purchase-item-qty')?.value) || 0;
              const unitPrice = Number(row.querySelector('.edit-purchase-item-price')?.value) || 0;
              
              if (itemId && qty > 0) {
                itemsToSave.push({ itemId, qty, unitPrice });
              }
            });
            
            if (itemsToSave.length === 0) {
              alert('Debe agregar al menos un item');
              return;
            }
            
            const supplierId = document.getElementById('edit-purchase-supplier')?.value || 'GENERAL';
            const investorIdSel = document.getElementById('edit-purchase-investor')?.value || 'GENERAL';
            const purchaseDate = document.getElementById('edit-purchase-date')?.value || new Date().toISOString().split('T')[0];
            const notes = document.getElementById('edit-purchase-notes')?.value || '';
            
            const btn = document.getElementById('edit-purchase-save');
            btn.disabled = true;
            btn.textContent = 'Guardando...';
            
            await API.purchases.purchases.update(purchaseId, {
              supplierId,
              investorId: investorIdSel,
              purchaseDate,
              items: itemsToSave,
              notes
            });
            
            invCloseModal();
            const purchaseInvestorId = (purchase?.investorId && typeof purchase.investorId === 'object') ? (purchase.investorId._id || purchase.investorId.id || '') : (purchase?.investorId || '');
            const reopenInvestorId = (investorIdSel && investorIdSel !== 'GENERAL') ? investorIdSel : (purchaseInvestorId || investorIdCtx || '');
            if (reopenInvestorId && reopenInvestorId !== 'GENERAL') {
              await openInvestorDetailView(String(reopenInvestorId));
            }
            
            alert('Compra actualizada correctamente');
          } catch (err) {
            console.error('Error actualizando compra:', err);
            alert('Error al actualizar compra: ' + (err.message || 'Error desconocido'));
            document.getElementById('edit-purchase-save').disabled = false;
            document.getElementById('edit-purchase-save').textContent = 'Guardar Cambios';
          }
        };
      } catch (err) {
        console.error('Error cargando compra:', err);
        alert('Error: ' + (err.message || 'Error desconocido'));
      }
    };
    
    // Función global para eliminar items de compra
    window.deletePurchaseItems = async function(purchaseId, investorId) {
      try {
        const purchase = await API.purchases.purchases.get(purchaseId);
        
        if (!purchase || !purchase.items || purchase.items.length === 0) {
          alert('Esta compra no tiene items para eliminar');
          return;
        }
        
        const itemsHtml = purchase.items.map((item, index) => {
          const itemName = item.itemId?.name || item.itemId?.sku || item.name || 'N/A';
          const qty = item.qty || 0;
          const unitPrice = item.unitPrice || 0;
          const total = qty * unitPrice;
          return `
            <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
              <td class="px-4 py-3 text-center">
                <input type="checkbox" class="delete-item-checkbox" data-item-index="${index}" data-item-id="${item._id || item.id || index}" />
              </td>
              <td class="px-4 py-3">${escapeHtml(itemName)}</td>
              <td class="px-4 py-3 text-right">${qty}</td>
              <td class="px-4 py-3 text-right">${money(unitPrice)}</td>
              <td class="px-4 py-3 text-right font-semibold">${money(total)}</td>
            </tr>
          `;
        }).join('');
        
        const deleteModalContent = `
          <div class="p-6">
            <h3 class="text-xl font-semibold text-white theme-light:text-slate-900 mb-4">Eliminar Items de Compra</h3>
            <p class="text-sm text-slate-400 theme-light:text-slate-600 mb-4">
              Selecciona los items que deseas eliminar de esta compra. Esta acción reducirá el stock y eliminará los items disponibles relacionados.
            </p>
            <div class="max-h-[400px] overflow-auto custom-scrollbar mb-4">
              <table class="w-full text-sm border-collapse">
                <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
                  <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                    <th class="px-4 py-3 text-center text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Seleccionar</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Item</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Cantidad</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Precio Unitario</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Total</th>
                  </tr>
                </thead>
                <tbody class="text-white dark:text-white theme-light:text-slate-900">
                  ${itemsHtml}
                </tbody>
              </table>
            </div>
            <div class="flex gap-3 mt-6">
              <button id="confirm-delete-items" class="flex-1 px-6 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors">
                Eliminar Seleccionados
              </button>
              <button onclick="invCloseModal()" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300">
                Cancelar
              </button>
            </div>
          </div>
        `;
        
        invOpenModal(deleteModalContent);
        
        document.getElementById('confirm-delete-items').onclick = async () => {
          const checkboxes = document.querySelectorAll('.delete-item-checkbox:checked');
          if (checkboxes.length === 0) {
            alert('Selecciona al menos un item para eliminar');
            return;
          }
          
          if (!confirm(`¿Estás seguro de que deseas eliminar ${checkboxes.length} item(s)? Esta acción no se puede deshacer y reducirá el stock del inventario.`)) {
            return;
          }
          
          const itemIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-item-id'));
          
          try {
            const btn = document.getElementById('confirm-delete-items');
            btn.disabled = true;
            btn.textContent = 'Eliminando...';
            
            await API.post(`/api/v1/purchases/${purchaseId}/items/delete`, { itemIds });
            
            invCloseModal();
            await openInvestorDetailView(investorId);
            
            alert('Items eliminados correctamente');
          } catch (err) {
            console.error('Error eliminando items:', err);
            alert('Error al eliminar items: ' + (err.message || 'Error desconocido'));
            document.getElementById('confirm-delete-items').disabled = false;
            document.getElementById('confirm-delete-items').textContent = 'Eliminar Seleccionados';
          }
        };
      } catch (err) {
        console.error('Error cargando compra:', err);
        alert('Error: ' + (err.message || 'Error desconocido'));
      }
    };
    
  } catch (err) {
    console.error('Error cargando detalle de inversor:', err);
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="text-5xl mb-4">⚠️</div>
        <p class="text-red-400 text-lg font-semibold">Error al cargar detalles</p>
        <p class="text-slate-400 theme-light:text-slate-600 text-sm mt-2">${err.message || 'Error desconocido'}</p>
        <button onclick="loadInversoresContent()" class="mt-4 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-colors rounded-lg">
          Volver a la lista
        </button>
      </div>
    `;
  }
}

// Abrir modal con detalle completo del inversor (mantener para compatibilidad)
async function openInvestorDetailModal(investorId) {
  try {
    invOpenModal('<div class="p-6"><p class="text-white theme-light:text-slate-900">Cargando...</p></div>');
    
    // Cargar datos del inversor
    const [investorData, purchasesData, investorInfo] = await Promise.all([
      API.investments.getInvestorInvestments(investorId),
      API.purchases.purchases.list({ investorId, limit: 1000 }),
      API.purchases.investors.list().then(investors => investors.find(i => i._id === investorId) || { name: 'Sin nombre' })
    ]);
    
    const investor = investorData;
    const investorName = investorInfo?.name || 'Sin nombre';
    const summary = investor.summary || {};
    const items = investor.items || {};
    const purchases = purchasesData.items || [];
    const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    // Agrupar items disponibles por itemId y calcular totales y precio ponderado
    const availableItemsMap = {};
    (items.available || []).forEach(item => {
      const itemId = item.itemId?._id || item.itemId?.id || null;
      if (!itemId) return;
      
      const itemName = item.itemId?.name || item.itemId?.sku || 'N/A';
      const qty = item.qty || 0;
      const purchasePrice = item.purchasePrice || 0;
      
      if (!availableItemsMap[itemId]) {
        availableItemsMap[itemId] = {
          itemId: itemId,
          itemName: itemName,
          totalQty: 0,
          totalValue: 0,
          weightedPrice: 0
        };
      }
      
      availableItemsMap[itemId].totalQty += qty;
      availableItemsMap[itemId].totalValue += (purchasePrice * qty);
    });
    
    // Calcular precio ponderado para cada item
    Object.values(availableItemsMap).forEach(item => {
      if (item.totalQty > 0) {
        item.weightedPrice = item.totalValue / item.totalQty;
      }
    });
    
    // Renderizar items disponibles agrupados
    const availableItems = Object.values(availableItemsMap).map(item => {
      return `
        <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
          <td class="px-4 py-3">${escapeHtml(item.itemName)}</td>
          <td class="px-4 py-3 text-right">${item.totalQty}</td>
          <td class="px-4 py-3 text-right">${money(item.weightedPrice)}</td>
          <td class="px-4 py-3 text-right font-semibold">${money(item.totalValue)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" class="text-center text-slate-400 theme-light:text-slate-600 py-4">No hay items disponibles</td></tr>';
    
    // Renderizar items vendidos con checkboxes para selección
    const soldItems = (items.sold || []).map(item => {
      const itemName = item.itemId?.name || item.itemId?.sku || 'N/A';
      const total = (item.purchasePrice || 0) * (item.qty || 0);
      const saleNumber = item.saleId?.number || 'N/A';
      const itemId = item._id || item.id;
      return `
        <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
          <td class="px-4 py-3 text-center">
            <input type="checkbox" class="sold-item-checkbox cursor-pointer" data-investment-item-id="${itemId}" data-total="${total}" />
          </td>
          <td class="px-4 py-3">${escapeHtml(itemName)}</td>
          <td class="px-4 py-3 text-right">${item.qty || 0}</td>
          <td class="px-4 py-3 text-right">${money(item.purchasePrice || 0)}</td>
          <td class="px-4 py-3 text-right font-semibold">${money(total)}</td>
          <td class="px-4 py-3">${escapeHtml(saleNumber)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6" class="text-center text-slate-400 theme-light:text-slate-600 py-4">No hay items vendidos</td></tr>';
    
    // Renderizar items pagados
    const paidItems = (items.paid || []).map(item => {
      const itemName = item.itemId?.name || item.itemId?.sku || 'N/A';
      const total = (item.purchasePrice || 0) * (item.qty || 0);
      const saleNumber = item.saleId?.number || 'N/A';
      const paidAt = item.paidAt ? new Date(item.paidAt).toLocaleDateString() : 'N/A';
      return `
        <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
          <td class="px-4 py-3">${escapeHtml(itemName)}</td>
          <td class="px-4 py-3 text-right">${item.qty || 0}</td>
          <td class="px-4 py-3 text-right">${money(item.purchasePrice || 0)}</td>
          <td class="px-4 py-3 text-right">${money(total)}</td>
          <td class="px-4 py-3">${escapeHtml(saleNumber)}</td>
          <td class="px-4 py-3">${paidAt}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6" class="text-center text-slate-400 theme-light:text-slate-600 py-4">No hay items pagados</td></tr>';
    
    // Renderizar compras
    const purchasesRows = purchases.map(purchase => {
      const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : 'N/A';
      const supplierName = purchase.supplierId?.name || 'General';
      const itemsCount = purchase.items?.length || 0;
      const totalAmount = money(purchase.totalAmount || 0);
      const notes = purchase.notes || '';
      return `
        <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 hover:bg-slate-700/30 dark:hover:bg-slate-700/30 theme-light:hover:bg-slate-100">
          <td class="px-4 py-3 cursor-pointer" onclick="openPurchaseDetailModal('${purchase._id}')">${escapeHtml(purchaseDate)}</td>
          <td class="px-4 py-3 cursor-pointer" onclick="openPurchaseDetailModal('${purchase._id}')">${escapeHtml(supplierName)}</td>
          <td class="px-4 py-3 text-right cursor-pointer" onclick="openPurchaseDetailModal('${purchase._id}')">${itemsCount}</td>
          <td class="px-4 py-3 text-right font-semibold cursor-pointer" onclick="openPurchaseDetailModal('${purchase._id}')">${totalAmount}</td>
          <td class="px-4 py-3 cursor-pointer" onclick="openPurchaseDetailModal('${purchase._id}')">${escapeHtml(notes || '-')}</td>
          <td class="px-4 py-3">
            <div class="flex gap-2 items-center justify-end">
              <button onclick="event.stopPropagation(); openPurchaseStickersModal('${purchase._id}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
                🏷️ Stickers
              </button>
              <button onclick="event.stopPropagation(); editPurchase('${purchase._id}', '${investorId}')" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">
                ✏️ Editar
              </button>
              <button onclick="event.stopPropagation(); deletePurchaseItems('${purchase._id}', '${investorId}')" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors">
                🗑️ Eliminar Items
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6" class="text-center text-slate-400 theme-light:text-slate-600 py-4">No hay compras registradas</td></tr>';
    
    const modalContent = `
      <div class="p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h3 class="text-2xl font-bold text-white theme-light:text-slate-900 mb-6">💰 ${escapeHtml(investorName)}</h3>
        
        <!-- Resumen -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
            <p class="text-xs text-slate-400 theme-light:text-slate-600">Total Inversión</p>
            <p class="text-lg font-bold text-white theme-light:text-slate-900">${money(summary.totalInvestment || 0)}</p>
          </div>
          <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
            <p class="text-xs text-slate-400 theme-light:text-slate-600">Disponible</p>
            <p class="text-lg font-bold text-green-400 theme-light:text-green-600">${money(summary.availableValue || 0)}</p>
          </div>
          <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
            <p class="text-xs text-slate-400 theme-light:text-slate-600">Vendido</p>
            <p class="text-lg font-bold text-yellow-400 theme-light:text-yellow-600">${money(summary.soldValue || 0)}</p>
          </div>
          <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
            <p class="text-xs text-slate-400 theme-light:text-slate-600">Pagado</p>
            <p class="text-lg font-bold text-blue-400 theme-light:text-blue-600">${money(summary.paidValue || 0)}</p>
          </div>
          <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
            <p class="text-xs text-slate-400 theme-light:text-slate-600">Pendiente</p>
            <p class="text-lg font-bold text-orange-400 theme-light:text-orange-600">${money(Math.max(0, summary.pendingPayment || 0))}</p>
          </div>
        </div>
        
        <!-- Items Disponibles -->
        <div class="mb-6">
          <h4 class="text-lg font-semibold text-white theme-light:text-slate-900 mb-3">Items Disponibles</h4>
          <div class="max-h-[200px] overflow-auto custom-scrollbar">
            <table class="w-full text-sm border-collapse">
              <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
                <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Item</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Cantidad Total</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Precio Ponderado</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Valor Total</th>
                </tr>
              </thead>
              <tbody class="text-white dark:text-white theme-light:text-slate-900">${availableItems}</tbody>
            </table>
          </div>
        </div>
        
        <!-- Items Vendidos -->
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-lg font-semibold text-white theme-light:text-slate-900">Items Vendidos</h4>
            ${(items.sold && items.sold.length > 0) ? `
              <button id="btn-cobrar-items" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
                💰 Cobrar Items
              </button>
            ` : ''}
          </div>
          <div class="max-h-[200px] overflow-auto custom-scrollbar">
            <table class="w-full text-sm border-collapse">
              <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
                <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                  <th class="px-4 py-3 text-center text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
                    <input type="checkbox" id="select-all-sold" class="cursor-pointer" />
                  </th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Item</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Cantidad</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Precio Compra</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Valor Total</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Venta</th>
                </tr>
              </thead>
              <tbody class="text-white dark:text-white theme-light:text-slate-900">${soldItems}</tbody>
            </table>
          </div>
        </div>
        
        <!-- Items Pagados -->
        <div class="mb-6">
          <h4 class="text-lg font-semibold text-white theme-light:text-slate-900 mb-3">Items Pagados</h4>
          <div class="max-h-[200px] overflow-auto custom-scrollbar">
            <table class="w-full text-sm border-collapse">
              <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
                <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Item</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Cantidad</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Precio Compra</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Valor Total</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Venta</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Fecha Pago</th>
                </tr>
              </thead>
              <tbody class="text-white dark:text-white theme-light:text-slate-900">${paidItems}</tbody>
            </table>
          </div>
        </div>
        
        <!-- Compras Registradas -->
        <div class="mb-6">
          <h4 class="text-lg font-semibold text-white theme-light:text-slate-900 mb-3">Compras Registradas</h4>
          <div class="max-h-[200px] overflow-auto custom-scrollbar">
            <table class="w-full text-sm border-collapse">
              <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
                <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Fecha</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Proveedor</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Items</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Total</th>
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Notas</th>
                  <th class="px-4 py-3 text-center text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody class="text-white dark:text-white theme-light:text-slate-900">${purchasesRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    invOpenModal(modalContent);
    
    // Función global para editar compra
    // Nota: `investorIdCtx` es el inversor del contexto (desde el modal del inversor), NO el select del formulario.
    window.editPurchase = async function(purchaseId, investorIdCtx) {
      try {
        // Cargar datos de la compra
        const purchase = await API.purchases.purchases.get(purchaseId);
        
        // Cargar proveedores e inversores
        const [suppliers, investors, itemsData] = await Promise.all([
          API.purchases.suppliers.list(),
          API.purchases.investors.list(),
          invAPI.listItems({ limit: 1000 })
        ]);
        
        const items = itemsData.data || [];
        window.purchaseItemsData = items;
        
        const supplierOptions = [
          '<option value="GENERAL">GENERAL</option>',
          ...suppliers.map(s => `<option value="${s._id}" ${purchase.supplierId && String(s._id) === String(purchase.supplierId) ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
        ].join('');
        
        const investorOptions = [
          '<option value="GENERAL">GENERAL</option>',
          ...investors.map(i => `<option value="${i._id}" ${purchase.investorId && String(i._id) === String(purchase.investorId) ? 'selected' : ''}>${escapeHtml(i.name)}</option>`)
        ].join('');
        
        const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        
        const modalContent = `
          <div class="p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-2xl shadow-lg">
                ✏️
              </div>
              <div>
                <h3 class="text-2xl font-bold text-white theme-light:text-slate-900">Editar Compra</h3>
                <p class="text-sm text-slate-400 theme-light:text-slate-600">Modifica los datos de la compra</p>
              </div>
            </div>
            
            <div class="space-y-6">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                  <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
                    <span>🏪</span>
                    <span>Proveedor</span>
                  </label>
                  <select id="edit-purchase-supplier" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all">
                    ${supplierOptions}
                  </select>
                </div>
                <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                  <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
                    <span>💰</span>
                    <span>Inversor</span>
                  </label>
                  <select id="edit-purchase-investor" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all">
                    ${investorOptions}
                  </select>
                </div>
              </div>
              
              <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
                  <span>📅</span>
                  <span>Fecha de compra</span>
                </label>
                <input id="edit-purchase-date" type="date" class="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" value="${purchaseDate}" />
              </div>
              
              <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                <div class="flex items-center justify-between mb-4">
                  <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 flex items-center gap-2">
                    <span>📦</span>
                    <span>Items de la compra</span>
                  </label>
                  <button id="btn-add-edit-purchase-item" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 flex items-center gap-2">
                    <span>➕</span>
                    <span>Agregar Item</span>
                  </button>
                </div>
                <div id="edit-purchase-items" class="space-y-3">
                  <!-- Se agregarán dinámicamente -->
                </div>
              </div>
              
              <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-4 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
                <label class="block text-sm font-semibold text-slate-300 theme-light:text-slate-700 mb-2 flex items-center gap-2">
                  <span>📝</span>
                  <span>Notas (opcional)</span>
                </label>
                <textarea id="edit-purchase-notes" rows="3" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none" placeholder="Agrega notas adicionales sobre esta compra...">${escapeHtml(purchase.notes || '')}</textarea>
              </div>
            </div>
            
            <div class="flex gap-3 mt-6 pt-6 border-t border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200">
              <button id="edit-purchase-save" class="flex-1 px-6 py-3 rounded-lg bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white font-semibold transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 flex items-center justify-center gap-2">
                <span>💾</span>
                <span>Guardar Cambios</span>
              </button>
              <button onclick="invCloseModal()" class="px-6 py-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-all duration-200 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 flex items-center gap-2">
                <span>❌</span>
                <span>Cancelar</span>
              </button>
            </div>
          </div>
        `;
        
        invOpenModal(modalContent);
        
        // Cargar items existentes
        const itemsContainer = document.getElementById('edit-purchase-items');
        let itemCounter = 0;
        let purchaseItems = [];
        
        // Función para agregar fila de item (reutilizar lógica de openPurchaseModal)
        function addEditPurchaseItemRow(itemData = null) {
          const id = `edit-item-${itemCounter++}`;
          const row = document.createElement('div');
          row.className = 'bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-3 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-200';
          row.id = id;
          
          const selectedItemId = itemData?.itemId?._id || itemData?.itemId || '';
          const selectedItemName = itemData?.itemId?.name || itemData?.itemId?.sku || '';
          const qty = itemData?.qty || 1;
          const unitPrice = itemData?.unitPrice || 0;
          
          row.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div class="md:col-span-1 relative">
                <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">🔍 Buscar Item</label>
                <div class="relative">
                  <input 
                    type="text" 
                    class="edit-purchase-item-search w-full px-3 py-2 pl-10 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Buscar por SKU o nombre..."
                    value="${escapeHtml(selectedItemName)}"
                    autocomplete="off"
                  />
                  <span class="absolute left-3 top-2.5 text-slate-400">🔍</span>
                  <div class="edit-purchase-item-dropdown hidden absolute z-50 w-full mt-1 bg-slate-800 dark:bg-slate-800 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg shadow-xl max-h-60 overflow-auto custom-scrollbar"></div>
                </div>
                <input type="hidden" class="edit-purchase-item-id" value="${selectedItemId}" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">📦 Cantidad</label>
                <input type="number" min="1" step="1" class="edit-purchase-item-qty w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value="${qty}" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">
                  💰 Precio por Unidad *
                </label>
                <input type="number" min="0" step="0.01" class="edit-purchase-item-price w-full px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value="${unitPrice}" placeholder="0.00" />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-300 theme-light:text-slate-700 mb-2">
                  💵 Precio Total (opcional)
                </label>
                <input type="number" min="0" step="0.01" class="edit-purchase-item-total w-full px-3 py-2 rounded-lg bg-slate-700/30 border border-slate-600/30 text-white theme-light:bg-slate-50 theme-light:text-slate-900 theme-light:border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value="" placeholder="Opcional" />
              </div>
              <div>
                <button class="remove-edit-purchase-item w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 flex items-center justify-center gap-1">
                  <span>🗑️</span>
                  <span>Eliminar</span>
                </button>
              </div>
            </div>
            <div class="edit-purchase-item-selected mt-2 ${selectedItemId ? '' : 'hidden'}">
              <div class="bg-blue-500/20 dark:bg-blue-500/20 theme-light:bg-blue-50 rounded-lg p-2 border border-blue-500/30 flex items-center gap-2">
                <span class="text-blue-400 theme-light:text-blue-600">✅</span>
                <span class="text-sm text-blue-300 theme-light:text-blue-700 edit-purchase-item-display">${escapeHtml(selectedItemName)}</span>
              </div>
            </div>
          `;
          
          itemsContainer.appendChild(row);
          
          // Setup search functionality (similar to openPurchaseModal)
          const searchInput = row.querySelector('.edit-purchase-item-search');
          const dropdown = row.querySelector('.edit-purchase-item-dropdown');
          const itemIdInput = row.querySelector('.edit-purchase-item-id');
          const itemDisplay = row.querySelector('.edit-purchase-item-display');
          const selectedDiv = row.querySelector('.edit-purchase-item-selected');
          
          // Setup search functionality
          let selectedItem = null;
          
          function filterEditItems(query) {
            if (!query || query.trim() === '') {
              dropdown.classList.add('hidden');
              return;
            }
            
            const lowerQuery = query.toLowerCase();
            const filtered = window.purchaseItemsData.filter(item => {
              const sku = (item.sku || '').toLowerCase();
              const name = (item.name || '').toLowerCase();
              return sku.includes(lowerQuery) || name.includes(lowerQuery);
            }).slice(0, 10);
            
            if (filtered.length === 0) {
              dropdown.innerHTML = `
                <div class="p-3 text-center text-slate-400 theme-light:text-slate-500 text-sm">
                  No se encontraron items
                </div>
              `;
            } else {
              dropdown.innerHTML = filtered.map(item => {
                const sku = escapeHtml(item.sku || 'Sin SKU');
                const name = escapeHtml(item.name || 'Sin nombre');
                const stock = item.stock || 0;
                return `
                  <div 
                    class="edit-purchase-item-option p-3 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-100 cursor-pointer border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-200 last:border-b-0 transition-colors"
                    data-id="${item._id}"
                    data-sku="${sku}"
                    data-name="${name}"
                  >
                    <div class="flex items-center justify-between">
                      <div>
                        <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${sku}</div>
                        <div class="text-xs text-slate-400 theme-light:text-slate-600">${name}</div>
                      </div>
                      <div class="text-xs text-slate-500 theme-light:text-slate-500">
                        Stock: ${stock}
                      </div>
                    </div>
                  </div>
                `;
              }).join('');
            }
            
            dropdown.classList.remove('hidden');
            
            dropdown.querySelectorAll('.edit-purchase-item-option').forEach(option => {
              option.addEventListener('click', () => {
                const itemId = option.dataset.id;
                const sku = option.dataset.sku;
                const name = option.dataset.name;
                
                selectedItem = window.purchaseItemsData.find(i => i._id === itemId);
                itemIdInput.value = itemId;
                searchInput.value = `${sku} - ${name}`;
                itemDisplay.textContent = `${sku} - ${name}`;
                selectedDiv.classList.remove('hidden');
                dropdown.classList.add('hidden');
                
                if (selectedItem && selectedItem.entryPrice) {
                  if (parseFloat(priceInput.value) === 0) {
                    priceInput.value = selectedItem.entryPrice;
                  }
                }
              });
            });
          }
          
          searchInput.addEventListener('input', (e) => {
            filterEditItems(e.target.value);
          });
          
          searchInput.addEventListener('focus', () => {
            if (searchInput.value && !selectedItem) {
              filterEditItems(searchInput.value);
            }
          });
          
          document.addEventListener('click', (e) => {
            if (!row.contains(e.target)) {
              dropdown.classList.add('hidden');
            }
          });
          
          // Setup remove button
          row.querySelector('.remove-edit-purchase-item').onclick = () => {
            row.remove();
            purchaseItems = purchaseItems.filter(p => p.id !== id);
          };
          
          // Setup price calculations
          const qtyInput = row.querySelector('.edit-purchase-item-qty');
          const priceInput = row.querySelector('.edit-purchase-item-price');
          const totalInput = row.querySelector('.edit-purchase-item-total');
          
          qtyInput.addEventListener('input', () => {
            const qty = Number(qtyInput.value) || 0;
            const price = Number(priceInput.value) || 0;
            totalInput.value = (qty * price).toFixed(2);
          });
          
          priceInput.addEventListener('input', () => {
            const qty = Number(qtyInput.value) || 0;
            const price = Number(priceInput.value) || 0;
            totalInput.value = (qty * price).toFixed(2);
          });
          
          totalInput.addEventListener('input', () => {
            const total = Number(totalInput.value) || 0;
            const qty = Number(qtyInput.value) || 1;
            if (qty > 0) {
              priceInput.value = (total / qty).toFixed(2);
            }
          });
          
          if (selectedItemId) {
            purchaseItems.push({ id, itemId: selectedItemId, qty, unitPrice });
          }
        }
        
        // Cargar items existentes
        if (purchase.items && purchase.items.length > 0) {
          purchase.items.forEach(item => {
            addEditPurchaseItemRow(item);
          });
        } else {
          addEditPurchaseItemRow();
        }
        
        // Botón agregar item
        document.getElementById('btn-add-edit-purchase-item').onclick = () => {
          addEditPurchaseItemRow();
        };
        
        // Botón guardar
        document.getElementById('edit-purchase-save').onclick = async () => {
          try {
            // Recopilar items
            const itemsToSave = [];
            document.querySelectorAll('#edit-purchase-items > div').forEach(row => {
              const itemId = row.querySelector('.edit-purchase-item-id')?.value;
              const qty = Number(row.querySelector('.edit-purchase-item-qty')?.value) || 0;
              const unitPrice = Number(row.querySelector('.edit-purchase-item-price')?.value) || 0;
              
              if (itemId && qty > 0) {
                itemsToSave.push({ itemId, qty, unitPrice });
              }
            });
            
            if (itemsToSave.length === 0) {
              alert('Debe agregar al menos un item');
              return;
            }
            
            const supplierId = document.getElementById('edit-purchase-supplier')?.value || 'GENERAL';
            const investorIdSel = document.getElementById('edit-purchase-investor')?.value || 'GENERAL';
            const purchaseDate = document.getElementById('edit-purchase-date')?.value || new Date().toISOString().split('T')[0];
            const notes = document.getElementById('edit-purchase-notes')?.value || '';
            
            const btn = document.getElementById('edit-purchase-save');
            btn.disabled = true;
            btn.textContent = 'Guardando...';
            
            await API.purchases.purchases.update(purchaseId, {
              supplierId,
              investorId: investorIdSel,
              purchaseDate,
              items: itemsToSave,
              notes
            });
            
            // Recargar modal del inversor
            invCloseModal();
            // Evitar pasar objetos (p.ej. `purchase.investorId` viene populated) y terminar con "[object Object]" en query params.
            const purchaseInvestorId =
              (purchase?.investorId && typeof purchase.investorId === 'object')
                ? (purchase.investorId._id || purchase.investorId.id || '')
                : (purchase?.investorId || '');
            const reopenInvestorId = (investorIdSel && investorIdSel !== 'GENERAL')
              ? investorIdSel
              : (purchaseInvestorId || investorIdCtx || '');
            if (reopenInvestorId && reopenInvestorId !== 'GENERAL') {
              await openInvestorDetailView(String(reopenInvestorId));
            }
            
            alert('Compra actualizada correctamente');
          } catch (err) {
            console.error('Error actualizando compra:', err);
            alert('Error al actualizar compra: ' + (err.message || 'Error desconocido'));
            document.getElementById('edit-purchase-save').disabled = false;
            document.getElementById('edit-purchase-save').textContent = 'Guardar Cambios';
          }
        };
      } catch (err) {
        console.error('Error cargando compra:', err);
        alert('Error: ' + (err.message || 'Error desconocido'));
      }
    };
    
    // Función global para eliminar items de compra
    window.deletePurchaseItems = async function(purchaseId, investorId) {
      try {
        // Obtener detalles de la compra
        const purchase = await API.purchases.purchases.get(purchaseId);
        
        if (!purchase || !purchase.items || purchase.items.length === 0) {
          alert('Esta compra no tiene items para eliminar');
          return;
        }
        
        // Mostrar modal para seleccionar items a eliminar
        const itemsHtml = purchase.items.map((item, index) => {
          const itemName = item.itemId?.name || item.itemId?.sku || item.name || 'N/A';
          const qty = item.qty || 0;
          const unitPrice = item.unitPrice || 0;
          const total = qty * unitPrice;
          return `
            <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
              <td class="px-4 py-3 text-center">
                <input type="checkbox" class="delete-item-checkbox" data-item-index="${index}" data-item-id="${item._id || item.id || index}" />
              </td>
              <td class="px-4 py-3">${escapeHtml(itemName)}</td>
              <td class="px-4 py-3 text-right">${qty}</td>
              <td class="px-4 py-3 text-right">${money(unitPrice)}</td>
              <td class="px-4 py-3 text-right font-semibold">${money(total)}</td>
            </tr>
          `;
        }).join('');
        
        const deleteModalContent = `
          <div class="p-6">
            <h3 class="text-xl font-semibold text-white theme-light:text-slate-900 mb-4">Eliminar Items de Compra</h3>
            <p class="text-sm text-slate-400 theme-light:text-slate-600 mb-4">
              Selecciona los items que deseas eliminar de esta compra. Esta acción reducirá el stock y eliminará los items disponibles relacionados.
            </p>
            <div class="max-h-[400px] overflow-auto custom-scrollbar mb-4">
              <table class="w-full text-sm border-collapse">
                <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
                  <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                    <th class="px-4 py-3 text-center text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Seleccionar</th>
                    <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Item</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Cantidad</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Precio Unitario</th>
                    <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Total</th>
                  </tr>
                </thead>
                <tbody class="text-white dark:text-white theme-light:text-slate-900">
                  ${itemsHtml}
                </tbody>
              </table>
            </div>
            <div class="flex gap-3 mt-6">
              <button id="confirm-delete-items" class="flex-1 px-6 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors">
                Eliminar Seleccionados
              </button>
              <button onclick="invCloseModal()" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300">
                Cancelar
              </button>
            </div>
          </div>
        `;
        
        invOpenModal(deleteModalContent);
        
        // Configurar botón de confirmar
        document.getElementById('confirm-delete-items').onclick = async () => {
          const checkboxes = document.querySelectorAll('.delete-item-checkbox:checked');
          if (checkboxes.length === 0) {
            alert('Selecciona al menos un item para eliminar');
            return;
          }
          
          if (!confirm(`¿Estás seguro de que deseas eliminar ${checkboxes.length} item(s)? Esta acción no se puede deshacer y reducirá el stock del inventario.`)) {
            return;
          }
          
          const itemIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-item-id'));
          
          try {
            const btn = document.getElementById('confirm-delete-items');
            btn.disabled = true;
            btn.textContent = 'Eliminando...';
            
            await API.post(`/api/v1/purchases/${purchaseId}/items/delete`, { itemIds });
            
            // Recargar la vista del inversor
            invCloseModal();
            await openInvestorDetailView(investorId);
            
            alert('Items eliminados correctamente');
          } catch (err) {
            console.error('Error eliminando items:', err);
            alert('Error al eliminar items: ' + (err.message || 'Error desconocido'));
            document.getElementById('confirm-delete-items').disabled = false;
            document.getElementById('confirm-delete-items').textContent = 'Eliminar Seleccionados';
          }
        };
      } catch (err) {
        console.error('Error cargando compra:', err);
        alert('Error: ' + (err.message || 'Error desconocido'));
      }
    };
    
    // Configurar funcionalidad de cobro si hay items vendidos
    if (items.sold && items.sold.length > 0) {
      // Checkbox "Seleccionar todos"
      const selectAllCheckbox = document.getElementById('select-all-sold');
      const soldCheckboxes = document.querySelectorAll('.sold-item-checkbox');
      
      if (selectAllCheckbox && soldCheckboxes.length > 0) {
        selectAllCheckbox.addEventListener('change', (e) => {
          soldCheckboxes.forEach(cb => {
            cb.checked = e.target.checked;
          });
        });
      }
      
      // Botón "Cobrar Items"
      const btnCobrar = document.getElementById('btn-cobrar-items');
      if (btnCobrar) {
        btnCobrar.onclick = () => openPayInvestorItemsModal(investorId, items.sold || []);
      }
    }
  } catch (err) {
    console.error('Error cargando detalle de inversor:', err);
    alert('Error: ' + (err.message || 'Error desconocido'));
    invCloseModal();
  }
}

// Abrir modal con detalle de compra
async function openPurchaseDetailModal(purchaseId) {
  try {
    const purchase = await API.purchases.purchases.get(purchaseId);
    const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    const itemsHtml = (purchase.items || []).map(item => {
      const itemName = item.itemId?.name || item.itemId?.sku || 'N/A';
      const qty = item.qty || 0;
      const unitPrice = money(item.unitPrice || 0);
      const total = money((item.unitPrice || 0) * qty);
      
      return `
        <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
          <td class="px-4 py-3">${escapeHtml(itemName)}</td>
          <td class="px-4 py-3 text-right">${qty}</td>
          <td class="px-4 py-3 text-right">${unitPrice}</td>
          <td class="px-4 py-3 text-right font-semibold">${total}</td>
        </tr>
      `;
    }).join('');

    const purchaseDate = purchase.purchaseDate ? new Date(purchase.purchaseDate).toLocaleDateString() : 'N/A';
    const supplierName = purchase.supplierId?.name || 'General';
    const investorName = purchase.investorId?.name || 'General';
    const totalAmount = money(purchase.totalAmount || 0);
    const notes = purchase.notes || '';

    const modalContent = `
      <div class="p-6">
        <h3 class="text-xl font-semibold text-white theme-light:text-slate-900 mb-4">Detalle de Compra</h3>
        <div class="space-y-4 mb-6">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-sm text-slate-400 theme-light:text-slate-600">Fecha</p>
              <p class="text-white theme-light:text-slate-900 font-semibold">${escapeHtml(purchaseDate)}</p>
            </div>
            <div>
              <p class="text-sm text-slate-400 theme-light:text-slate-600">Proveedor</p>
              <p class="text-white theme-light:text-slate-900 font-semibold">${escapeHtml(supplierName)}</p>
            </div>
            <div>
              <p class="text-sm text-slate-400 theme-light:text-slate-600">Inversor</p>
              <p class="text-white theme-light:text-slate-900 font-semibold">${escapeHtml(investorName)}</p>
            </div>
            <div>
              <p class="text-sm text-slate-400 theme-light:text-slate-600">Total</p>
              <p class="text-white theme-light:text-slate-900 font-semibold text-lg">${totalAmount}</p>
            </div>
          </div>
          ${notes ? `
            <div>
              <p class="text-sm text-slate-400 theme-light:text-slate-600">Notas</p>
              <p class="text-white theme-light:text-slate-900">${escapeHtml(notes)}</p>
            </div>
          ` : ''}
        </div>
        <div>
          <h4 class="text-lg font-semibold text-white theme-light:text-slate-900 mb-3">Items</h4>
          <div class="max-h-[400px] overflow-auto custom-scrollbar">
            <table class="w-full text-sm border-collapse">
              <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
                <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                  <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Item</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Cantidad</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Precio Unitario</th>
                  <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Total</th>
                </tr>
              </thead>
              <tbody class="text-white dark:text-white theme-light:text-slate-900">
                ${itemsHtml || '<tr><td colspan="4" class="text-center text-slate-400 theme-light:text-slate-600 py-4">No hay items</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="openPurchaseStickersModal('${purchaseId}')" class="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors">🏷️ Generar Stickers</button>
          <button onclick="invCloseModal()" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300">Cerrar</button>
        </div>
      </div>
    `;

    invOpenModal(modalContent);
  } catch (err) {
    alert('Error cargando detalle de compra: ' + (err.message || 'Error desconocido'));
  }
}

// Abrir modal para generar stickers de una compra
async function openPurchaseStickersModal(purchaseId) {
  try {
    const purchase = await API.purchases.purchases.get(purchaseId);
    
    if (!purchase.items || purchase.items.length === 0) {
      alert('Esta compra no tiene items para generar stickers.');
      return;
    }
    
    // Usar los datos que ya vienen populados de la compra
    // Si necesitamos más datos del item, los obtenemos del cache o hacemos una llamada
    const itemsWithDetails = await Promise.all(
      (purchase.items || []).map(async (purchaseItem) => {
        const itemId = purchaseItem.itemId?._id || purchaseItem.itemId;
        
        // Si el itemId ya está poblado con datos, usarlos directamente
        let item = null;
        if (purchaseItem.itemId && typeof purchaseItem.itemId === 'object' && purchaseItem.itemId._id) {
          // Ya está poblado, usar los datos disponibles
          item = {
            _id: purchaseItem.itemId._id,
            sku: purchaseItem.itemId.sku || '',
            name: purchaseItem.itemId.name || ''
          };
          
          // Intentar obtener más datos del cache o hacer una llamada si es necesario
          const cachedItem = state.itemCache?.get(String(item._id));
          if (cachedItem) {
            item = cachedItem;
          } else {
            // Intentar obtener el item completo, pero si falla, usar los datos básicos
            try {
              const fullItem = await invAPI.getItem(item._id);
              if (fullItem) {
                item = fullItem;
                if (state.itemCache) {
                  state.itemCache.set(String(item._id), item);
                }
              }
            } catch (err) {
              // Si falla, usar los datos básicos que ya tenemos
              console.warn('No se pudo obtener item completo, usando datos básicos:', err.message);
            }
          }
        } else if (itemId) {
          // itemId es solo un string, intentar obtenerlo
          try {
            item = await invAPI.getItem(itemId);
            if (state.itemCache && item) {
              state.itemCache.set(String(itemId), item);
            }
          } catch (err) {
            console.error('Error obteniendo item:', err);
            // Crear un objeto básico con el ID
            item = { _id: itemId, sku: '', name: 'N/A' };
          }
        }
        
        return {
          ...purchaseItem,
          item: item,
          itemId: itemId,
          qty: purchaseItem.qty || 0
        };
      })
    );
    
    const itemsRows = itemsWithDetails.map((purchaseItem, idx) => {
      const item = purchaseItem.item;
      const itemName = item?.name || item?.sku || purchaseItem.itemId?.name || purchaseItem.itemId?.sku || 'N/A';
      const itemSku = item?.sku || purchaseItem.itemId?.sku || '';
      const maxQty = purchaseItem.qty || 0;
      const itemId = purchaseItem.itemId;
      
      return `
        <tr data-id="${itemId}" data-index="${idx}">
          <td class="px-4 py-3">${escapeHtml(itemSku || itemName)}</td>
          <td class="px-4 py-3">${escapeHtml(itemName)}</td>
          <td class="px-4 py-3 text-center">${maxQty}</td>
          <td class="px-4 py-3 text-center">
            <input type="number" min="0" max="${maxQty}" value="0" class="qty w-20 px-2 py-1 text-center bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900" />
          </td>
        </tr>
      `;
    }).join('');
    
    const modalContent = `
      <div class="w-full max-w-4xl mx-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900">Generar stickers de compra</h3>
        </div>
        <p class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-6">
          Selecciona cuántos stickers imprimir de cada item (máximo: cantidad comprada).
        </p>
        <div class="overflow-x-auto mb-6">
          <table class="w-full border-collapse bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white rounded-lg overflow-hidden border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
            <thead>
              <tr class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-100">
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider border-b border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">SKU</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider border-b border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Nombre</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider border-b border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Cantidad Comprada</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider border-b border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Imprimir</th>
              </tr>
            </thead>
            <tbody id="purchase-stk-rows" class="divide-y divide-slate-700/50 dark:divide-slate-700/50 theme-light:divide-slate-200">
              ${itemsRows}
            </tbody>
          </table>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
          <button id="purchase-stk-fill-all" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-200 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-300 text-slate-300 dark:text-slate-300 theme-light:text-slate-700 hover:text-white dark:hover:text-white theme-light:hover:text-slate-900 font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Usar cantidad comprada</button>
          <button id="purchase-stk-clear" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-200 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-300 text-slate-300 dark:text-slate-300 theme-light:text-slate-700 hover:text-white dark:hover:text-white theme-light:hover:text-slate-900 font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Poner 0</button>
          <button id="purchase-stk-generate" class="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Generar PDF</button>
        </div>
      </div>
    `;
    
    invOpenModal(modalContent);
    
    const rows = document.getElementById("purchase-stk-rows");
    
    // Botón para llenar con cantidad comprada
    document.getElementById("purchase-stk-fill-all").onclick = () => {
      rows.querySelectorAll("tr").forEach((tr) => {
        const maxQty = parseInt(tr.querySelector("td:nth-child(3)").textContent.trim(), 10) || 0;
        tr.querySelector(".qty").value = maxQty;
      });
    };
    
    // Botón para limpiar
    document.getElementById("purchase-stk-clear").onclick = () => {
      rows.querySelectorAll("tr").forEach((tr) => {
        tr.querySelector(".qty").value = 0;
      });
    };
    
    // Botón para generar PDF
    document.getElementById("purchase-stk-generate").onclick = async () => {
      // Usar window.showBusy si está disponible, o una función de fallback
      const showBusyFn = window.showBusy || ((msg) => {
        console.log('Loading:', msg);
        const overlay = document.getElementById('busy-overlay');
        if (overlay) overlay.style.display = 'flex';
      });
      const hideBusyFn = window.hideBusy || (() => {
        const overlay = document.getElementById('busy-overlay');
        if (overlay) overlay.style.display = 'none';
      });
      
      showBusyFn('Generando PDF de stickers...');
      const list = [];
      
      rows.querySelectorAll("tr").forEach((tr) => {
        const idx = parseInt(tr.dataset.index, 10);
        const purchaseItem = itemsWithDetails[idx];
        const count = parseInt(tr.querySelector(".qty").value || "0", 10);
        
        if (purchaseItem && purchaseItem.item && count > 0) {
          list.push({ it: purchaseItem.item, count });
        }
      });
      
      if (!list.length) {
        hideBusyFn();
        alert("Selecciona al menos 1 sticker para imprimir.");
        return;
      }
      
      try {
        const base = list[0]?.it?.sku || list[0]?.it?._id || 'stickers-compra';
        // Usar window.renderStickerPdf si está disponible
        const renderFn = window.renderStickerPdf || renderStickerPdf;
        if (typeof renderFn !== 'function') {
          throw new Error('La función renderStickerPdf no está disponible. Por favor, recarga la página.');
        }
        await renderFn(list, `stickers-compra-${base}`);
        invCloseModal();
        hideBusyFn();
        if (typeof showToast === 'function') {
          showToast('Stickers generados');
        } else {
          alert('Stickers generados exitosamente');
        }
      } catch (err) {
        hideBusyFn();
        alert('Error generando stickers: ' + (err.message || err));
      }
    };
  } catch (err) {
    console.error('Error abriendo modal de stickers de compra:', err);
    alert('Error: ' + (err.message || 'Error desconocido'));
  }
}

// Abrir modal para cobrar items vendidos del inversor
async function openPayInvestorItemsModal(investorId, soldItems) {
  try {
    // Definir función de formateo de dinero
    const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    // Obtener items seleccionados
    const checked = Array.from(document.querySelectorAll('.sold-item-checkbox:checked'));
    if (checked.length === 0) {
      alert('Selecciona al menos un item para cobrar');
      return;
    }
    
    const selectedItems = checked.map(cb => {
      const itemId = cb.dataset.investmentItemId;
      const total = parseFloat(cb.dataset.total || 0);
      return { investmentItemId: itemId, total };
    });
    
    const totalAmount = selectedItems.reduce((sum, item) => sum + item.total, 0);
    
    // Cargar cuentas disponibles
    const accountsData = await API.accounts.balances();
    const accounts = accountsData.balances || [];
    
    if (accounts.length === 0) {
      alert('No hay cuentas disponibles. Crea una cuenta primero.');
      return;
    }
    
    const accountOptions = accounts.map(acc => {
      const accId = acc.accountId || acc._id || acc.id;
      const accName = acc.name || 'Sin nombre';
      const accBalance = acc.balance || 0;
      return `<option value="${accId}">${escapeHtml(accName)} - ${money(accBalance)}</option>`;
    }).join('');
    
    const itemsList = selectedItems.map((item, idx) => {
      const soldItem = soldItems.find(si => String(si._id || si.id) === String(item.investmentItemId));
      const itemName = soldItem?.itemId?.name || soldItem?.itemId?.sku || 'N/A';
      return `
        <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
          <td class="px-4 py-3">${escapeHtml(itemName)}</td>
          <td class="px-4 py-3 text-right font-semibold">${money(item.total)}</td>
        </tr>
      `;
    }).join('');
    
    const modalContent = `
      <div class="p-6">
        <h3 class="text-xl font-semibold text-white theme-light:text-slate-900 mb-4">💰 Cobrar Items Vendidos</h3>
        <p class="text-slate-300 theme-light:text-slate-700 mb-4">
          Total a cobrar: <strong class="text-lg">${money(totalAmount)}</strong>
        </p>
        
        <div class="mb-4">
          <h4 class="text-sm font-semibold text-white theme-light:text-slate-900 mb-2">Items seleccionados:</h4>
          <div class="max-h-[200px] overflow-auto custom-scrollbar">
            <table class="w-full text-sm border-collapse">
              <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
                <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                  <th class="px-4 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Item</th>
                  <th class="px-4 py-2 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Valor</th>
                </tr>
              </thead>
              <tbody class="text-white dark:text-white theme-light:text-slate-900">
                ${itemsList}
              </tbody>
            </table>
          </div>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">
              Cuenta de donde sale el dinero <span class="text-red-400">*</span>
            </label>
            <select id="pay-investor-account" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Seleccionar cuenta --</option>
              ${accountOptions}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Nota (opcional)</label>
            <input id="pay-investor-note" placeholder="ej: Pago de inversión" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        
        <div class="flex gap-3 mt-6">
          <button id="pay-investor-confirm" class="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors">
            💰 Confirmar Cobro
          </button>
          <button id="pay-investor-cancel" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300">
            Cancelar
          </button>
        </div>
      </div>
    `;
    
    invOpenModal(modalContent);
    
    // Configurar botones
    document.getElementById('pay-investor-cancel').onclick = () => {
      invCloseModal();
      // Reabrir la vista del inversor
      setTimeout(() => openInvestorDetailView(investorId), 100);
    };
    
    document.getElementById('pay-investor-confirm').onclick = async () => {
      const accountId = document.getElementById('pay-investor-account').value;
      const note = document.getElementById('pay-investor-note').value || '';
      
      if (!accountId) {
        alert('Debes seleccionar una cuenta de donde sale el dinero');
        return;
      }
      
      const showBusyFn = window.showBusy || ((msg) => {
        console.log('Loading:', msg);
        const overlay = document.getElementById('busy-overlay');
        if (overlay) overlay.style.display = 'flex';
      });
      const hideBusyFn = window.hideBusy || (() => {
        const overlay = document.getElementById('busy-overlay');
        if (overlay) overlay.style.display = 'none';
      });
      
      try {
        showBusyFn('Procesando cobro...');
        
        const investmentItemIds = selectedItems.map(item => item.investmentItemId);
        
        await API.investments.payInvestment(investorId, {
          investmentItemIds,
          accountId,
          notes: note
        });
        
        hideBusyFn();
        invCloseModal();
        
        if (typeof showToast === 'function') {
          showToast('Cobro registrado exitosamente');
        } else {
          alert('Cobro registrado exitosamente');
        }
        
        // Recargar la vista del inversor para mostrar los cambios
        setTimeout(() => openInvestorDetailView(investorId), 300);
      } catch (err) {
        hideBusyFn();
        alert('Error al procesar el cobro: ' + (err.message || 'Error desconocido'));
      }
    };
  } catch (err) {
    console.error('Error abriendo modal de cobro:', err);
    alert('Error: ' + (err.message || 'Error desconocido'));
  }
}

// Función para leer QR y abrir resumen del item
async function openQRReader() {
  const modalContent = `
    <div class="p-4 sm:p-6">
      <h3 class="text-lg sm:text-xl font-semibold text-white theme-light:text-slate-900 mb-4">📷 Leer QR</h3>
      <div class="mb-4">
        <video id="qr-video" autoplay playsinline class="w-full max-w-md mx-auto rounded-lg border-2 border-blue-500" style="max-height: 50vh; object-fit: cover;"></video>
        <canvas id="qr-canvas" class="hidden"></canvas>
      </div>
      <div class="mb-4">
        <select id="qr-cam" class="w-full px-3 py-2 sm:px-4 sm:py-2 text-sm sm:text-base bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 rounded-lg mb-2">
          <option value="">Cargando cámaras...</option>
        </select>
      </div>
      <div class="mb-4">
        <div class="flex flex-col sm:flex-row gap-2">
          <input id="qr-manual" type="text" placeholder="O ingresa el código manualmente" class="flex-1 px-3 py-2 sm:px-4 sm:py-2 text-sm sm:text-base bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 theme-light:placeholder-slate-400 rounded-lg" />
          <button id="qr-add-manual" class="px-4 py-2 sm:px-4 sm:py-2 text-sm sm:text-base bg-blue-600 hover:bg-blue-700 text-white rounded-lg whitespace-nowrap">Agregar</button>
        </div>
      </div>
      <div id="qr-msg" class="text-xs sm:text-sm text-slate-300 theme-light:text-slate-700 mb-4 min-h-[1.5rem]"></div>
      <div class="flex gap-3">
        <button id="qr-close" class="flex-1 sm:flex-none px-4 py-2 sm:px-6 sm:py-2 text-sm sm:text-base bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors">Cerrar</button>
      </div>
    </div>
  `;
  
  invOpenModal(modalContent);
  
  const video = document.getElementById('qr-video');
  const canvas = document.getElementById('qr-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sel = document.getElementById('qr-cam');
  const msg = document.getElementById('qr-msg');
  const manualInput = document.getElementById('qr-manual');
  const manualBtn = document.getElementById('qr-add-manual');
  const closeBtn = document.getElementById('qr-close');
  
  let stream = null;
  let running = false;
  let detector = null;
  let lastCode = '';
  let lastTs = 0;
  let cameraDisabled = false;
  
  function stop() {
    running = false;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (video.srcObject) {
      video.srcObject = null;
    }
  }
  
  async function fillCams() {
    try {
      // En móvil, primero pedir permisos básicos para que las cámaras muestren sus labels
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (permErr) {
        // Si falla, continuar de todas formas
        console.warn('No se pudieron obtener permisos de cámara:', permErr);
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      sel.innerHTML = '<option value="">-- Seleccionar cámara --</option>';
      videoDevices.forEach((device, idx) => {
        const opt = document.createElement('option');
        opt.value = device.deviceId;
        opt.textContent = device.label || `Cámara ${idx + 1}`;
        sel.appendChild(opt);
      });
      if (videoDevices.length > 0 && !sel.value) {
        sel.value = videoDevices[0].deviceId;
        // En móvil, intentar iniciar automáticamente
        if (videoDevices.length === 1) {
          setTimeout(() => start(), 100);
        }
      }
    } catch (e) {
      console.error('Error enumerando cámaras:', e);
      sel.innerHTML = '<option value="">Error cargando cámaras</option>';
    }
  }
  
  async function start() {
    if (running) return;
    const deviceId = sel.value;
    
    try {
      stop();
      
      // Configuración de video para móvil y desktop
      let videoConstraints = {};
      
      if (deviceId) {
        // Si hay deviceId, usarlo
        videoConstraints = { deviceId: { exact: deviceId } };
      } else {
        // Si no hay deviceId (móvil), usar facingMode para la cámara trasera
        videoConstraints = { facingMode: 'environment' };
      }
      
      // En móvil, también intentar con facingMode si falla
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints
        });
      } catch (firstTry) {
        // Si falla con deviceId exacto, intentar sin exact
        if (deviceId) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: deviceId }
            });
          } catch (secondTry) {
            // Si aún falla, intentar solo con facingMode (móvil)
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment' }
            });
          }
        } else {
          throw firstTry;
        }
      }
      
      video.srcObject = stream;
      running = true;
      
      if (typeof BarcodeDetector !== 'undefined') {
        detector = new BarcodeDetector({ formats: ['qr_code'] });
        tickNative();
      } else if (typeof jsQR !== 'undefined') {
        tickCanvas();
      } else {
        msg.textContent = 'No se encontró soporte para lectura de QR';
        msg.className = 'text-sm text-red-500 theme-light:text-red-600';
        running = false;
      }
      msg.textContent = '';
    } catch (e) {
      console.error('Error al iniciar cámara:', e);
      let errorMsg = '';
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        errorMsg = '❌ Permisos de cámara denegados.';
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        errorMsg = '❌ No se encontró ninguna cámara.';
      } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
        errorMsg = '❌ La cámara está siendo usada por otra aplicación.';
      } else {
        errorMsg = '❌ Error: ' + (e?.message || 'Error desconocido');
      }
      msg.textContent = errorMsg;
      msg.className = 'text-sm text-red-500 theme-light:text-red-600';
      running = false;
    }
  }
  
  function accept(value) {
    if (cameraDisabled) return false;
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return false;
    const t = Date.now();
    if (lastCode === normalized && t - lastTs < 1500) return false;
    lastCode = normalized;
    lastTs = t;
    return true;
  }
  
  function parseInventoryCode(raw) {
    const text = String(raw || '').trim();
    if (!text) return { itemId: '', sku: '', raw: text };
    const upper = text.toUpperCase();
    if (upper.startsWith('IT:')) {
      const parts = text.split(':').map(p => p.trim()).filter(Boolean);
      return {
        companyId: parts[1] || '',
        itemId: parts[2] || '',
        sku: parts[3] || ''
      };
    }
    const match = text.match(/[a-f0-9]{24}/i);
    return { companyId: '', itemId: match ? match[0] : '', sku: '', raw: text };
  }
  
  async function handleCode(raw, fromManual = false) {
    const text = String(raw || '').trim();
    if (!text) return;
    if (!fromManual && !accept(text)) return;
    
    cameraDisabled = true;
    stop();
    
    msg.textContent = 'Procesando código...';
    msg.className = 'text-sm text-blue-500 theme-light:text-blue-600';
    
    const parsed = parseInventoryCode(text);
    let itemId = parsed.itemId;
    
    try {
      // Si no tenemos itemId del QR, intentar buscar por SKU
      if (!itemId && parsed.sku) {
        const items = await invAPI.listItems({ sku: parsed.sku, limit: 1 });
        if (items.data && items.data.length > 0) {
          itemId = items.data[0]._id;
        }
      }
      
      if (!itemId) {
        throw new Error('No se pudo identificar el item desde el código QR');
      }
      
      // Obtener el item completo
      const item = await invAPI.getItem(itemId);
      
      // Cerrar el modal de QR
      invCloseModal();
      
      // Abrir el resumen del item
      await openItemSummaryModal(item);
      
    } catch (e) {
      msg.textContent = 'Error: ' + (e?.message || 'No se pudo procesar el código');
      msg.className = 'text-sm text-red-500 theme-light:text-red-600';
      
      // Reanudar cámara después de un delay
      setTimeout(() => {
        cameraDisabled = false;
        lastCode = '';
        lastTs = 0;
        if (sel.value) {
          start().catch(err => {
            console.warn('Error al reanudar cámara:', err);
          });
        }
      }, 2000);
    }
  }
  
  async function tickNative() {
    if (!running || cameraDisabled) {
      if (running && cameraDisabled) {
        requestAnimationFrame(tickNative);
      }
      return;
    }
    try {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const codes = await detector.detect(video);
        if (codes && codes.length > 0 && codes[0]?.rawValue) {
          await handleCode(codes[0].rawValue);
          return;
        }
      }
    } catch (e) {
      // Silenciar errores de detección
    }
    requestAnimationFrame(tickNative);
  }
  
  function tickCanvas() {
    if (!running || cameraDisabled) {
      if (running && cameraDisabled) {
        requestAnimationFrame(tickCanvas);
      }
      return;
    }
    try {
      const w = video.videoWidth | 0;
      const h = video.videoHeight | 0;
      if (!w || !h) {
        requestAnimationFrame(tickCanvas);
        return;
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);
      
      const imgData = ctx.getImageData(0, 0, w, h);
      if (typeof jsQR !== 'undefined') {
        const code = jsQR(imgData.data, w, h);
        if (code && code.data) {
          handleCode(code.data);
          return;
        }
      }
    } catch (e) {
      // Silenciar errores
    }
    requestAnimationFrame(tickCanvas);
  }
  
  // Event listeners
  sel.addEventListener('change', start);
  manualBtn.addEventListener('click', () => {
    const val = manualInput.value.trim();
    if (!val) return;
    handleCode(val, true);
    manualInput.value = '';
  });
  manualInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const val = manualInput.value.trim();
      if (val) handleCode(val, true);
    }
  });
  closeBtn.addEventListener('click', () => {
    stop();
    invCloseModal();
  });
  
  // Cargar cámaras y iniciar automáticamente
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  await fillCams();
  
  // En móvil, intentar iniciar automáticamente (incluso sin deviceId)
  if (isMobile) {
    setTimeout(() => {
      if (!running) {
        start().catch(err => {
          console.warn('Error iniciando cámara automáticamente en móvil:', err);
          msg.textContent = 'Error al acceder a la cámara. Verifica los permisos.';
          msg.className = 'text-sm text-red-500 theme-light:text-red-600';
        });
      }
    }, 500);
  } else if (sel.value) {
    // En desktop, iniciar si hay una cámara seleccionada
    setTimeout(() => {
      if (!running) {
        start().catch(err => {
          console.warn('Error iniciando cámara:', err);
        });
      }
    }, 100);
  }
}

// Hacer las funciones disponibles globalmente
window.openInvestorDetailModal = openInvestorDetailModal;
window.openPurchaseDetailModal = openPurchaseDetailModal;
window.openPurchaseStickersModal = openPurchaseStickersModal;
window.openPayInvestorItemsModal = openPayInvestorItemsModal;
window.openQRReader = openQRReader;