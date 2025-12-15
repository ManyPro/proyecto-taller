import { API } from "./api.esm.js";
import { loadFeatureOptionsAndRestrictions, getFeatureOptions, gateElement } from './feature-gating.js';
import { upper } from "./utils.js";
import { bindStickersButton, downloadStickersPdf } from './pdf.js';
import { setupNumberInputsPasteHandler, setupNumberInputPasteHandler } from './number-utils.js';

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
        <button id="sel-stickers-qr" class="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 hover:border-slate-500 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900" title="Generar PDF - Solo QR">Solo QR</button>
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

      itemsList.appendChild(div);
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
        
        // Intentar usar la PLANTILLA ACTIVA del tipo QR
        const type = 'sticker-qr';
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
              const pages = (type === 'brand') ? Array.from(tmp.querySelectorAll('.editor-page')) : [];

              // Obtener dimensiones del template (5cm x 3cm por defecto para stickers)
              // Validar que las dimensiones sean numéricas antes de usarlas
              let stickerWidthCm = 5; // Default: 5cm
              let stickerHeightCm = 3; // Default: 3cm
              
              if (tpl.meta && tpl.meta.width) {
                const parsedWidth = parseFloat(tpl.meta.width);
                if (!isNaN(parsedWidth) && parsedWidth > 0) {
                  stickerWidthCm = parsedWidth;
                }
              }
              
              if (tpl.meta && tpl.meta.height) {
                const parsedHeight = parseFloat(tpl.meta.height);
                if (!isNaN(parsedHeight) && parsedHeight > 0) {
                  stickerHeightCm = parsedHeight;
                }
              }
              
              const captureSingleBox = async (contentFragment) => {
                const box = document.createElement('div');
                box.className = 'sticker-capture';
                // Usar dimensiones del template guardadas - CRÍTICO: position relative para que los elementos absolutos se posicionen correctamente
                const widthPx = Math.round(stickerWidthCm * 37.795275591);
                const heightPx = Math.round(stickerHeightCm * 37.795275591);
                box.style.cssText = `position: relative; width: ${widthPx}px; height: ${heightPx}px; overflow: hidden; background: #fff; box-sizing: border-box;`;
                const style = document.createElement('style');
                style.textContent = `\n${(tpl.contentCss || '').toString()}\n` +
                  `/* Ocultar handles y selección del editor durante el render */\n` +
                  `.drag-handle,.resize-handle,.selection-box,.resizer,.handles,.ve-selected,.ce-selected,.selected{display:none!important;}\n` +
                  `.sticker-capture, .sticker-capture *{outline:none!important;-webkit-tap-highlight-color:transparent!important;user-select:none!important;caret-color:transparent!important;}\n` +
                  `.sticker-capture *::selection{background:transparent!important;color:inherit!important;}\n` +
                  `img,svg,canvas{outline:none!important;border:none!important;-webkit-user-drag:none!important;}\n` +
                  `/* CRÍTICO: Wrapper con dimensiones EXACTAS en píxeles (no porcentajes) */\n` +
                  `.sticker-wrapper{position: relative !important; width: ${widthPx}px !important; height: ${heightPx}px !important; max-width: ${widthPx}px !important; max-height: ${heightPx}px !important; min-width: ${widthPx}px !important; min-height: ${heightPx}px !important; overflow: hidden !important; box-sizing: border-box !important; margin: 0 !important; padding: 0 !important; left: 0 !important; top: 0 !important;}\n` +
                  `/* Asegurar que elementos con position absolute se posicionen relativos al contenedor */\n` +
                  `.sticker-capture [style*="position: absolute"]{position: absolute !important;}`;
                // Insertar el HTML directamente en el box, no en un inner div
                if (contentFragment) {
                  box.appendChild(contentFragment);
                } else {
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = html || '';
                  const stickerNode = tempDiv.querySelector('.sticker-wrapper');
                  if (stickerNode) {
                    box.appendChild(stickerNode);
                  } else {
                    const bodyNode = tempDiv.querySelector('body');
                    const source = bodyNode || tempDiv;
                    while (source.firstChild) {
                      box.appendChild(source.firstChild);
                    }
                  }
                }
                
                // Agregar el style al final para que tenga prioridad
                box.appendChild(style);
                
                // Limpiar elementos problemáticos
                try {
                  box.querySelectorAll('[contenteditable]')
                    .forEach(el => { el.setAttribute('contenteditable', 'false'); el.removeAttribute('contenteditable'); });
                  // Asegurar que todos los elementos sean visibles
                  box.querySelectorAll('[style*="display: none"]')
                    .forEach(el => {
                      const style = el.getAttribute('style') || '';
                      el.setAttribute('style', style.replace(/display:\s*none/gi, 'display: block'));
                    });
                  // CRÍTICO: Asegurar que el sticker-wrapper tenga dimensiones EXACTAS en píxeles (no porcentajes)
                  const wrapper = box.querySelector('.sticker-wrapper');
                  if (wrapper) {
                    wrapper.style.cssText = `position: relative !important; width: ${widthPx}px !important; height: ${heightPx}px !important; max-width: ${widthPx}px !important; max-height: ${heightPx}px !important; min-width: ${widthPx}px !important; min-height: ${heightPx}px !important; overflow: hidden !important; box-sizing: border-box !important; display: block !important; margin: 0 !important; padding: 0 !important; left: 0 !important; top: 0 !important;`;
                  } else {
                    // Si no hay wrapper, crear uno con dimensiones exactas
                    const newWrapper = document.createElement('div');
                    newWrapper.className = 'sticker-wrapper';
                    newWrapper.style.cssText = `position: relative; width: ${widthPx}px; height: ${heightPx}px; overflow: hidden; background: #fff; box-sizing: border-box; margin: 0; padding: 0;`;
                    while (box.firstChild) {
                      newWrapper.appendChild(box.firstChild);
                    }
                    box.appendChild(newWrapper);
                  }
                } catch(_) {}
                
                root.appendChild(box);
                
                // Forzar reflow para asegurar que el contenido se renderice
                box.offsetHeight;
                
                // Asegurarse que las imágenes (incluido el QR data:URL) estén cargadas
                try { await waitForImages(box, 4000); } catch(_) {}
                // Capturar usando escala 1 para que jsPDF no vuelva a escalar la imagen
                const scale = 1;
                const canvas = await html2canvas(box, { 
                  scale,
                  backgroundColor: '#ffffff', 
                  useCORS: true, 
                  allowTaint: true, 
                  imageTimeout: 4000,
                  width: widthPx,
                  height: heightPx,
                  windowWidth: widthPx,
                  windowHeight: heightPx,
                  onclone: (clonedDoc) => {
                    // Asegurar que el clon también tenga las dimensiones correctas
                    const clonedBox = clonedDoc.querySelector('.sticker-capture');
                    if (clonedBox) {
                      clonedBox.style.setProperty('width', widthPx + 'px', 'important');
                      clonedBox.style.setProperty('height', heightPx + 'px', 'important');
                      const clonedWrapper = clonedBox.querySelector('.sticker-wrapper');
                      if (clonedWrapper) {
                        clonedWrapper.style.setProperty('width', widthPx + 'px', 'important');
                        clonedWrapper.style.setProperty('height', heightPx + 'px', 'important');
                      }
                    }
                  }
                });
                const expectedCanvasWidth = Math.round(widthPx * scale);
                const expectedCanvasHeight = Math.round(heightPx * scale);
                if (canvas.width !== expectedCanvasWidth || canvas.height !== expectedCanvasHeight) {
                  console.warn(`⚠️ Canvas capturado tiene dimensiones inesperadas: ${canvas.width}x${canvas.height}, esperado: ${expectedCanvasWidth}x${expectedCanvasHeight}`);
                }
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
                await captureSingleBox(frag1);
                await captureSingleBox(frag2);
              } else {
                // Plantilla de 1 página (qr) o fallback si no se detectan páginas
                await captureSingleBox(null);
              }
            }
            document.body.removeChild(root);

            if (!images.length) throw new Error('No se pudo rasterizar el contenido de los stickers');

            // Obtener dimensiones del template para el PDF (5cm x 3cm por defecto)
            // Validar que las dimensiones sean numéricas antes de usarlas
            let pdfWidthMm = 50; // Default: 5cm
            let pdfHeightMm = 30; // Default: 3cm
            
            if (tpl.meta && tpl.meta.width) {
              const parsedWidth = parseFloat(tpl.meta.width);
              if (!isNaN(parsedWidth) && parsedWidth > 0) {
                pdfWidthMm = parsedWidth * 10; // Convertir cm a mm
              }
            }
            
            if (tpl.meta && tpl.meta.height) {
              const parsedHeight = parseFloat(tpl.meta.height);
              if (!isNaN(parsedHeight) && parsedHeight > 0) {
                pdfHeightMm = parsedHeight * 10; // Convertir cm a mm
              }
            }
            
            // CRÍTICO: Usar dimensiones EXACTAS del template para el PDF (sin escalado)
            const doc = new jsPDF({ 
              orientation: pdfWidthMm > pdfHeightMm ? 'landscape' : 'portrait', 
              unit: 'mm', 
              format: [pdfWidthMm, pdfHeightMm],
              compress: false
            });
            
            images.forEach((src, idx) => {
              if (idx > 0) doc.addPage([pdfWidthMm, pdfHeightMm], pdfWidthMm > pdfHeightMm ? 'landscape' : 'portrait');
              // Insertar la imagen con las dimensiones físicas exactas del sticker
              doc.addImage(src, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');
            });
            
            console.log(`📄 PDF generado con dimensiones exactas: ${pdfWidthMm}mm x ${pdfHeightMm}mm (${stickerWidthCm}cm x ${stickerHeightCm}cm)`);
            doc.save(`stickers-${it.sku || it._id}.pdf`);
            invCloseModal();
            await refreshItems(state.lastItemsParams);
            hideBusy();
            showToast('Stock agregado y stickers generados');
            return;
          }
        } catch (e) {
          // Fallback a backend PDF por defecto
        }

        // Fallback: backend PDF por variante (layout por defecto)
        const payload = [];
        list.forEach(({ it, count }) => {
          for (let i = 0; i < count; i++) payload.push({ sku: it.sku, name: it.name });
        });
        
        try {
          const base = API.base?.replace(/\/$/, '') || '';
          const variantPath = '/api/v1/media/stickers/pdf/qr';
          const endpoint = base + variantPath;
          const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeader());
          const resp = await fetch(endpoint, { method: 'POST', headers, credentials: 'same-origin', body: JSON.stringify({ items: payload }) });
          if (!resp.ok) throw new Error('No se pudo generar PDF');
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `stickers-${it.sku || it._id}.pdf`; document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
          invCloseModal();
          await refreshItems(state.lastItemsParams);
          hideBusy();
          showToast('Stock agregado y stickers generados');
        } catch (err) {
          hideBusy();
          alert('Error creando stickers: ' + (err.message || err));
        }
        
      } catch (err) {
        hideBusy();
        alert('Error generando stickers: ' + (err.message || err));
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
  const STICKER_DEFAULT_LAYOUT = {
    widthCm: 5,
    heightCm: 3,
    elements: [
      { id: 'sku', type: 'text', source: 'sku', x: 8, y: 8, w: 120, h: 22, fontSize: 14, fontWeight: '700', wrap: false, align: 'flex-start', vAlign: 'center' },
      { id: 'name', type: 'text', source: 'name', x: 8, y: 34, w: 120, h: 42, fontSize: 11, fontWeight: '600', wrap: true, align: 'flex-start', vAlign: 'flex-start', lineHeight: 1.1 },
      { id: 'qr', type: 'image', source: 'qr', x: 135, y: 6, w: 90, h: 90, fit: 'contain' },
      { id: 'img', type: 'image', source: 'item-image', x: 8, y: 80, w: 120, h: 40, fit: 'cover' }
    ]
  };

  function cloneStickerLayout() {
    return JSON.parse(JSON.stringify(STICKER_DEFAULT_LAYOUT));
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

  async function renderStickerPdf(list, filenameBase = 'stickers') {
    const tpl = await API.templates.active('sticker-qr').catch(() => null);
    const tplLayout = tpl?.meta?.layout || cloneStickerLayout();
    const widthCm = Number(tpl?.meta?.width) || tplLayout.widthCm || 5;
    const heightCm = Number(tpl?.meta?.height) || tplLayout.heightCm || 3;
    const layout = { ...tplLayout, widthCm, heightCm };

    const tasks = [];
    list.forEach(({ it, count }) => {
      for (let i = 0; i < count; i++) {
        tasks.push(() => API.templates.preview({
          type: 'sticker-qr',
          layout,
          meta: { width: widthCm, height: heightCm, layout },
          sampleId: it._id
        }));
      }
    });

    const results = [];
    for (const job of tasks) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const pv = await job();
        results.push(pv?.rendered || '');
      } catch (e) {
        results.push('');
      }
    }

    const htmls = results.filter((h) => h && h.trim());
    if (!htmls.length) throw new Error('No se pudieron renderizar los stickers.');

    const widthPx = Math.round(widthCm * STICKER_PX_PER_CM);
    const heightPx = Math.round(heightCm * STICKER_PX_PER_CM);
    const widthMm = widthCm * 10;
    const heightMm = heightCm * 10;

    const html2canvas = await ensureHtml2Canvas();
    const jsPDF = await ensureJsPDF();

    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:-12000px;top:0;width:0;height:0;overflow:hidden;z-index:-1;background:#fff;';
    document.body.appendChild(root);

    const images = [];
    for (const html of htmls) {
      const box = document.createElement('div');
      box.className = 'sticker-capture';
      box.style.cssText = `position: relative; width: ${widthPx}px; height: ${heightPx}px; overflow: hidden; background: #fff; box-sizing: border-box;`;
      box.innerHTML = html;
      root.appendChild(box);
      // eslint-disable-next-line no-await-in-loop
      await waitForImagesSafe(box, 4000);
      // eslint-disable-next-line no-await-in-loop
      const canvas = await html2canvas(box, {
        width: widthPx,
        height: heightPx,
        backgroundColor: '#ffffff',
        scale: 1,
        windowWidth: widthPx,
        windowHeight: heightPx
      });
      images.push(canvas.toDataURL('image/png'));
      root.removeChild(box);
    }
    document.body.removeChild(root);

    const doc = new jsPDF({
      orientation: widthMm > heightMm ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [widthMm, heightMm],
      compress: false
    });
    images.forEach((src, idx) => {
      if (idx > 0) doc.addPage([widthMm, heightMm], widthMm > heightMm ? 'landscape' : 'portrait');
      doc.addImage(src, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST');
    });
    doc.save(`${filenameBase}.pdf`);
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
      try {
        const base = list[0]?.it?.sku || list[0]?.it?._id || 'stickers';
        await renderStickerPdf(list, `stickers-${base}`);
        invCloseModal();
        hideBusy();
        showToast('Stickers generados');
        return;
      } catch (err) {
        hideBusy();
        alert('Error generando stickers: ' + (err.message || err));
        return;
      }
      // Intentar usar la PLANTILLA ACTIVA del tipo seleccionado
      const type = 'sticker-qr';
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
            // Validar que el HTML tenga contenido
            if (!html || !html.trim()) {
              console.warn('⚠️ HTML renderizado vacío, saltando sticker');
              continue;
            }
            
            // Solo usar sticker-qr (sin páginas múltiples)
            const tmp = document.createElement('div');
            tmp.innerHTML = html || '';
            
            // Verificar que el contenido tenga elementos visibles
            const hasContent = tmp.querySelector('*') !== null;
            if (!hasContent) {
              console.warn('⚠️ HTML renderizado no tiene elementos, saltando sticker');
              continue;
            }

            // Obtener dimensiones del template (5cm x 3cm por defecto para stickers)
            // Validar que las dimensiones sean numéricas antes de usarlas
            let stickerWidthCm = 5; // Default: 5cm
            let stickerHeightCm = 3; // Default: 3cm
            
            if (tpl.meta && tpl.meta.width) {
              const parsedWidth = parseFloat(tpl.meta.width);
              if (!isNaN(parsedWidth) && parsedWidth > 0) {
                stickerWidthCm = parsedWidth;
              }
            }
            
            if (tpl.meta && tpl.meta.height) {
              const parsedHeight = parseFloat(tpl.meta.height);
              if (!isNaN(parsedHeight) && parsedHeight > 0) {
                stickerHeightCm = parsedHeight;
              }
            }
            const stickerWidthMm = stickerWidthCm * 10; // Convertir cm a mm
            const stickerHeightMm = stickerHeightCm * 10;
            
            const captureSingleBox = async () => {
              const box = document.createElement('div');
              box.className = 'sticker-capture';
              // CRÍTICO: Usar dimensiones EXACTAS del template (5cm x 3cm = 189px x 113px)
              const widthPx = Math.round(stickerWidthCm * 37.795275591);
              const heightPx = Math.round(stickerHeightCm * 37.795275591);
              
              // El box debe tener dimensiones EXACTAS y overflow hidden para que coincida con el canvas
              box.style.cssText = `position: relative; width: ${widthPx}px; height: ${heightPx}px; overflow: hidden; background: #fff; box-sizing: border-box; display: block; margin: 0; padding: 0;`;
              
              // Insertar únicamente el contenido relevante del HTML (preferir sticker-wrapper)
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = html || '';
              const stickerNode = tempDiv.querySelector('.sticker-wrapper');
              if (stickerNode) {
                box.appendChild(stickerNode);
              } else {
                const bodyNode = tempDiv.querySelector('body');
                const source = bodyNode || tempDiv;
                while (source.firstChild) {
                  box.appendChild(source.firstChild);
                }
              }
              
              // CRÍTICO: Asegurar que el sticker-wrapper tenga dimensiones EXACTAS (no porcentajes)
              const wrapper = box.querySelector('.sticker-wrapper');
              if (wrapper) {
                // Forzar dimensiones exactas en píxeles, iguales al box
                wrapper.style.cssText = `position: relative !important; width: ${widthPx}px !important; height: ${heightPx}px !important; overflow: hidden !important; box-sizing: border-box !important; display: block !important; margin: 0 !important; padding: 0 !important; left: 0 !important; top: 0 !important;`;
                console.log(`📐 Wrapper configurado con dimensiones exactas: ${widthPx}px x ${heightPx}px`);
              } else {
                // Si no hay wrapper, crear uno con dimensiones exactas
                const newWrapper = document.createElement('div');
                newWrapper.className = 'sticker-wrapper';
                newWrapper.style.cssText = `position: relative; width: ${widthPx}px; height: ${heightPx}px; overflow: hidden; background: #fff; box-sizing: border-box; margin: 0; padding: 0;`;
                while (box.firstChild) {
                  newWrapper.appendChild(box.firstChild);
                }
                box.appendChild(newWrapper);
                console.log(`📐 Wrapper creado con dimensiones exactas: ${widthPx}px x ${heightPx}px`);
              }
              
              // Limpiar elementos problemáticos
              try {
                box.querySelectorAll('[contenteditable]')
                  .forEach(el => { el.setAttribute('contenteditable', 'false'); el.removeAttribute('contenteditable'); });
                // Asegurar que todos los elementos sean visibles
                box.querySelectorAll('[style*="display: none"]')
                  .forEach(el => {
                    const style = el.getAttribute('style') || '';
                    el.setAttribute('style', style.replace(/display:\s*none/gi, 'display: block'));
                  });
              } catch(_) {}
              
              // ELIMINAR handles de rotación y otros elementos del editor del DOM
              box.querySelectorAll('.rotate-handle, .drag-handle, .resize-handle, .selection-box, .ve-selected, .ce-selected').forEach(el => el.remove());
              
              // Agregar el style al final para que tenga prioridad
              const style = document.createElement('style');
              style.textContent = `\n${(tpl.contentCss || '').toString()}\n` +
                `/* Ocultar handles y selección del editor durante el render */\n` +
                `.drag-handle,.resize-handle,.selection-box,.resizer,.handles,.ve-selected,.ce-selected,.selected,.rotate-handle{display:none!important;visibility:hidden!important;opacity:0!important;}\n` +
                `.sticker-capture, .sticker-capture *{outline:none!important;-webkit-tap-highlight-color:transparent!important;user-select:none!important;caret-color:transparent!important;}\n` +
                `.sticker-capture *::selection{background:transparent!important;color:inherit!important;}\n` +
                `img,svg,canvas{outline:none!important;border:none!important;-webkit-user-drag:none!important;}\n` +
                `/* CRÍTICO: Wrapper con dimensiones EXACTAS en píxeles (no porcentajes) */\n` +
                `.sticker-wrapper{position: relative !important; width: ${widthPx}px !important; height: ${heightPx}px !important; max-width: ${widthPx}px !important; max-height: ${heightPx}px !important; min-width: ${widthPx}px !important; min-height: ${heightPx}px !important; overflow: hidden !important; box-sizing: border-box !important; display: block !important; margin: 0 !important; padding: 0 !important; left: 0 !important; top: 0 !important;}\n` +
                `/* Asegurar que elementos con position absolute se posicionen relativos al contenedor */\n` +
                `.sticker-capture [style*="position: absolute"], .sticker-wrapper [style*="position: absolute"]{position: absolute !important;}\n` +
                `/* Asegurar que todos los elementos sean visibles y preserven colores */\n` +
                `.sticker-capture *{visibility: visible !important; opacity: 1 !important;}\n` +
                `/* Preservar colores correctos - asegurar que el texto negro se vea negro */\n` +
                `.sticker-capture *{color: inherit !important;}\n` +
                `.sticker-capture *:not([style*="color"]){color: #000000 !important;}`;
              box.appendChild(style);
              
              root.appendChild(box);
              
              // Forzar reflow y verificar dimensiones
              box.offsetHeight;
              const finalWrapper = box.querySelector('.sticker-wrapper');
              console.log('🔍 Debug dimensiones finales:', {
                boxWidth: box.offsetWidth,
                boxHeight: box.offsetHeight,
                wrapperWidth: finalWrapper ? finalWrapper.offsetWidth : 'N/A',
                wrapperHeight: finalWrapper ? finalWrapper.offsetHeight : 'N/A',
                expectedWidth: widthPx,
                expectedHeight: heightPx
              });
              
              // Asegurarse que las imágenes (incluido el QR data:URL) estén cargadas
              try { await waitForImages(box, 4000); } catch(_) {}
              
              // Capturar usando escala 1 para que jsPDF no vuelva a escalar la imagen
              const scale = 1;
              const canvas = await html2canvas(box, { 
                scale,
                backgroundColor: '#ffffff', 
                useCORS: true, 
                allowTaint: true, 
                imageTimeout: 4000,
                width: widthPx,
                height: heightPx,
                windowWidth: widthPx,
                windowHeight: heightPx,
                logging: false,
                onclone: (clonedDoc) => {
                  // Asegurar que el clon también tenga las dimensiones correctas
                  const clonedBox = clonedDoc.querySelector('.sticker-capture');
                  if (clonedBox) {
                    clonedBox.style.setProperty('width', widthPx + 'px', 'important');
                    clonedBox.style.setProperty('height', heightPx + 'px', 'important');
                    const clonedWrapper = clonedBox.querySelector('.sticker-wrapper');
                    if (clonedWrapper) {
                      clonedWrapper.style.setProperty('width', widthPx + 'px', 'important');
                      clonedWrapper.style.setProperty('height', heightPx + 'px', 'important');
                    }
                  }
                }
              });
              
              // Verificar que el canvas tenga las dimensiones correctas
              const expectedCanvasWidth = Math.round(widthPx * scale);
              const expectedCanvasHeight = Math.round(heightPx * scale);
              if (canvas.width !== expectedCanvasWidth || canvas.height !== expectedCanvasHeight) {
                console.warn(`⚠️ Canvas capturado tiene dimensiones inesperadas: ${canvas.width}x${canvas.height}, esperado: ${expectedCanvasWidth}x${expectedCanvasHeight}`);
              }
              
              images.push(canvas.toDataURL('image/png'));
              root.removeChild(box);
            };

            // Capturar el sticker directamente (sin páginas múltiples)
            await captureSingleBox();
          }
          document.body.removeChild(root);

          if (!images.length) throw new Error('No se pudo rasterizar el contenido de los stickers');

          // Obtener dimensiones del template para el PDF (5cm x 3cm por defecto)
          // Validar que las dimensiones sean numéricas antes de usarlas
          let pdfWidthMm = 50; // Default: 5cm
          let pdfHeightMm = 30; // Default: 3cm
          let stickerWidthCm = 5; // Para el log
          let stickerHeightCm = 3; // Para el log
          
          if (tpl.meta && tpl.meta.width) {
            const parsedWidth = parseFloat(tpl.meta.width);
            if (!isNaN(parsedWidth) && parsedWidth > 0) {
              stickerWidthCm = parsedWidth;
              pdfWidthMm = parsedWidth * 10; // Convertir cm a mm
            }
          }
          
          if (tpl.meta && tpl.meta.height) {
            const parsedHeight = parseFloat(tpl.meta.height);
            if (!isNaN(parsedHeight) && parsedHeight > 0) {
              stickerHeightCm = parsedHeight;
              pdfHeightMm = parsedHeight * 10; // Convertir cm a mm
            }
          }
          
          // CRÍTICO: Usar dimensiones EXACTAS del template para el PDF (sin escalado)
          const doc = new jsPDF({ 
            orientation: pdfWidthMm > pdfHeightMm ? 'landscape' : 'portrait', 
            unit: 'mm', 
            format: [pdfWidthMm, pdfHeightMm],
            compress: false
          });
          
          images.forEach((src, idx) => {
            if (idx > 0) doc.addPage([pdfWidthMm, pdfHeightMm], pdfWidthMm > pdfHeightMm ? 'landscape' : 'portrait');
            // CRÍTICO: Insertar imagen con dimensiones exactas, sin escalado
            // Las dimensiones de la imagen deben coincidir exactamente con las del PDF
            doc.addImage(src, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');
          });
          
          console.log(`📄 PDF generado con dimensiones exactas: ${pdfWidthMm}mm x ${pdfHeightMm}mm (${stickerWidthCm}cm x ${stickerHeightCm}cm)`);
          doc.save(`stickers.pdf`);
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
        const variantPath = '/api/v1/media/stickers/pdf/qr';
        const endpoint = base + variantPath;
        const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeader());
        const resp = await fetch(endpoint, { method: 'POST', headers, credentials: 'same-origin', body: JSON.stringify({ items: payload }) });
        if (!resp.ok) throw new Error('No se pudo generar PDF');
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = `stickers.pdf`; document.body.appendChild(a); a.click(); a.remove();
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














