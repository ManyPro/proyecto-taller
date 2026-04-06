import { API } from './api.esm.js';
import { initVehicles } from './vehicles.js';
import { setupNumberInputsPasteHandler, setupNumberInputPasteHandler } from './number-utils.js';

const $ = (s)=>document.querySelector(s);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));

function formatPriceRow(tr) {
  const input = tr.querySelector('input[data-price]');
  const fmt = tr.querySelector('[data-price-formatted]');
  if (!input || !fmt) return;
  fmt.textContent = money(normalizeNumber(input.value));
}

function bindPriceFormattedSync(tr) {
  const input = tr.querySelector('input[data-price]');
  if (!input) return;
  const onInput = () => formatPriceRow(tr);
  input.addEventListener('input', onInput);
}

/** Paginación reutilizable (precios general / inversión / vehicular) */
function renderPricesPaginationMount(mountEl, { page, pages, total, prevId, nextId, onPrev, onNext }) {
  if (!mountEl) return;
  if (pages <= 1) {
    mountEl.innerHTML = '';
    return;
  }
  mountEl.innerHTML = `
    <div class="pr-pagination">
      <button type="button" class="pr-btn-secondary px-3 py-2 text-sm" id="${prevId}" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
      <span translate="no" class="pr-pagination__meta">Página ${page} de ${pages} (${total} total)</span>
      <button type="button" class="pr-btn-secondary px-3 py-2 text-sm" id="${nextId}" ${page >= pages ? 'disabled' : ''}>Siguiente →</button>
    </div>
  `;
  $(`#${prevId}`)?.addEventListener('click', onPrev);
  $(`#${nextId}`)?.addEventListener('click', onNext);
}
function openModal(node){
  const modal = document.getElementById('modal'), slot = document.getElementById('modalBody'), x = document.getElementById('modalClose');
  if (!modal||!slot||!x) return;
  if (node) slot.replaceChildren(node);
  modal.classList.remove('hidden');
  
  const closeModalHandler = () => {
    modal.classList.add('hidden');
    document.removeEventListener('keydown', escHandler);
    modal.removeEventListener('click', backdropHandler);
  };
  
  const escHandler = (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModalHandler();
    }
  };
  
  const backdropHandler = (e) => {
    if (e.target === modal) {
      closeModalHandler();
    }
  };
  
  document.addEventListener('keydown', escHandler);
  modal.addEventListener('click', backdropHandler);
  
  x.onclick = closeModalHandler;
}
function closeModal(){ const m=$('#modal'); if(!m) return; m.classList.add('hidden'); }
const clone=(id)=>document.getElementById(id)?.content?.firstElementChild?.cloneNode(true);

function normalizeNumber(v){ if(v==null || v==='') return 0; if(typeof v==='number') return v; const s=String(v).replace(/\s+/g,'').replace(/\$/g,'').replace(/\./g,'').replace(/,/g,'.'); const n=Number(s); return Number.isFinite(n)?n:0; }

function escapeHtml(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

export function openQRForItem() {
  return new Promise(async (resolve, reject) => {
    const qrModal = document.createElement('div');
    qrModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;';
    qrModal.id = 'qr-modal-item-scanner';
    
    const qrContent = document.createElement('div');
    qrContent.className = 'relative z-[100000] w-full max-w-[600px] max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 shadow-2xl bg-slate-900 dark:bg-slate-900 theme-light:bg-white p-0';
    qrContent.innerHTML = `
      <div class="relative px-5 py-3 rounded-t-2xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
        <button type="button" class="close absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-lg bg-red-600 hover:bg-red-700 text-white text-xl font-bold shadow" title="Cerrar">&times;</button>
        <p class="text-xs font-semibold uppercase tracking-wide text-white/80">Lista de precios</p>
        <h3 class="text-lg font-bold pr-10">📷 Escanear código QR</h3>
      </div>
      <div class="p-5 pt-4">
        <div class="relative w-full bg-black rounded-xl overflow-hidden mb-3 min-h-[280px] border border-slate-700">
          <video id="qr-video-single" playsinline muted autoplay class="w-full h-auto block object-contain max-h-[50vh]"></video>
          <canvas id="qr-canvas-single" class="hidden"></canvas>
        </div>
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Código manual</label>
        <input id="qr-manual-single" placeholder="Pegar o escribir código…" class="w-full px-3 py-2 mb-2 rounded-lg border border-slate-600 dark:border-slate-600 theme-light:border-slate-300 bg-slate-800/80 dark:bg-slate-800/80 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 text-sm" />
        <div id="qr-msg-single" class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-3 min-h-[1rem]"></div>
        <div class="flex flex-wrap gap-2">
          <button type="button" id="qr-start-camera-single" class="pr-main-btn flex-1 min-w-[120px] px-3 py-2 text-sm hidden">▶ Iniciar cámara</button>
          <button type="button" id="qr-cancel-single" class="pr-btn-secondary flex-1 min-w-[120px] px-3 py-2 text-sm">Cancelar</button>
        </div>
      </div>
    `;
    
    qrModal.appendChild(qrContent);
    document.body.appendChild(qrModal);
    
    // Esperar un frame para asegurar que el DOM esté completamente renderizado
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    const video = qrContent.querySelector('#qr-video-single');
    const canvas = qrContent.querySelector('#qr-canvas-single');
    
    if (!video || !canvas) {
      cleanup();
      reject(new Error('No se pudieron encontrar los elementos del video'));
      return;
    }
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const msg = qrContent.querySelector('#qr-msg-single');
    const manualInput = qrContent.querySelector('#qr-manual-single');
    const closeBtn = qrContent.querySelector('.close');
    const cancelBtn = qrContent.querySelector('#qr-cancel-single');
    const startCameraBtn = qrContent.querySelector('#qr-start-camera-single');
    
    let stream = null, running = false, detector = null, lastCode = '', lastTs = 0;
    let escapeHandler = null;
    
    function cleanup() {
      running = false;
      try {
        if (video) {
          video.pause();
          video.srcObject = null;
        }
      } catch (e) {
        console.warn('Error al limpiar video:', e);
      }
      try {
        if (stream) {
          (stream.getTracks() || []).forEach(t => t.stop());
        }
      } catch (e) {
        console.warn('Error al detener stream:', e);
      }
      stream = null;
      detector = null;
      if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler);
        escapeHandler = null;
      }
      if (qrModal && qrModal.parentNode) {
        qrModal.remove();
      }
    }
    
    function stop() {
      try {
        video.pause();
        video.srcObject = null;
      } catch {}
      try {
        (stream?.getTracks() || []).forEach(t => t.stop());
      } catch {}
      running = false;
      stream = null;
    }
    
    async function start() {
      try {
        stop();
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        let videoConstraints;
        if (isMobile) {
          videoConstraints = { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          };
        } else {
          videoConstraints = true;
        }
        
        const cs = { 
          video: videoConstraints, 
          audio: false 
        };
        
        msg.textContent = 'Solicitando acceso a la cámara...';
        msg.style.color = 'var(--text)';
        
        stream = await navigator.mediaDevices.getUserMedia(cs);
        
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('x5-playsinline', 'true');
        video.muted = true;
        video.srcObject = stream;
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            if (video.readyState >= 2) {
              video.play().then(resolve).catch(reject);
            } else {
              reject(new Error('Timeout esperando video'));
            }
          }, 10000);
          
          video.onloadedmetadata = () => {
            clearTimeout(timeout);
            video.play().then(() => {
              // Verificar que el video realmente esté reproduciéndose
              if (video.paused) {
                reject(new Error('El video no se pudo reproducir'));
              } else {
                resolve();
              }
            }).catch(reject);
          };
          video.onerror = (err) => {
            clearTimeout(timeout);
            reject(err);
          };
        });
        
        // Verificar que el video tenga dimensiones válidas
        if (!video.videoWidth || !video.videoHeight) {
          throw new Error('El video no tiene dimensiones válidas');
        }
        
        running = true;
        console.log('Video iniciado - readyState:', video.readyState, 'dimensiones:', video.videoWidth, 'x', video.videoHeight);
        
        // Esperar un momento para que el video esté completamente listo y visible
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verificar nuevamente que el video esté reproduciéndose
        if (video.paused || video.ended) {
          console.warn('Video pausado o terminado, intentando reproducir nuevamente...');
          await video.play();
        }
        
        console.log('Video listo para detección - paused:', video.paused, 'ended:', video.ended, 'readyState:', video.readyState);
        
        if (window.BarcodeDetector) {
          try {
            detector = new BarcodeDetector({ formats: ['qr_code'] });
            console.log('BarcodeDetector creado correctamente');
            tickNative();
          } catch (err) {
            console.error('Error al crear BarcodeDetector:', err);
            if (window.jsQR) {
              console.log('Usando jsQR como fallback');
              tickCanvas();
            } else {
              msg.textContent = '❌ No se pudo inicializar el detector QR. Usa entrada manual.';
              msg.style.color = 'var(--danger, #ef4444)';
            }
          }
        } else {
          console.log('BarcodeDetector no disponible, usando jsQR');
          if (window.jsQR) {
            tickCanvas();
          } else {
            msg.textContent = '❌ jsQR no está disponible. Usa entrada manual.';
            msg.style.color = 'var(--danger, #ef4444)';
          }
        }
        msg.textContent = '';
      } catch (e) {
        console.error('Error al iniciar cámara:', e);
        let errorMsg = '';
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          errorMsg = '❌ Permisos de cámara denegados.';
        } else if (e.name === 'NotFoundError') {
          errorMsg = '❌ No se encontró ninguna cámara.';
        } else {
          errorMsg = '❌ Error: ' + (e?.message || 'Error desconocido');
        }
        msg.textContent = errorMsg;
        msg.style.color = 'var(--danger, #ef4444)';
        running = false;
      }
    }
    
    function accept(value) {
      const normalized = String(value || '').trim().toUpperCase();
      const t = Date.now();
      // Delay más corto (500ms) para permitir escaneos rápidos pero evitar duplicados
      if (lastCode === normalized && t - lastTs < 500) return false;
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
      
      stop();
      cleanup();
      resolve(text);
    }
    
    function onCode(code) {
      if (code) {
        handleCode(code);
      }
    }
    
    async function tickNative() {
      if (!running || !video || !detector) {
        if (running) {
          requestAnimationFrame(tickNative);
        }
        return;
      }
      try {
        // Verificar que el video esté listo
        if (video.readyState < 2) {
          requestAnimationFrame(tickNative);
          return;
        }
        const codes = await detector.detect(video);
        if (codes && codes.length > 0 && codes[0]?.rawValue) {
          onCode(codes[0].rawValue);
          return; // Detener después de detectar
        }
      } catch (e) {
        // Silenciar errores de detección comunes
        if (e.message && !e.message.includes('No image') && !e.message.includes('not readable')) {
          console.warn('Error en detección nativa:', e);
        }
      }
      requestAnimationFrame(tickNative);
    }
    
    function tickCanvas() {
      if (!running || !video || !canvas || !ctx) {
        if (running) {
          requestAnimationFrame(tickCanvas);
        }
        return;
      }
      try {
        const w = video.videoWidth | 0, h = video.videoHeight | 0;
        if (!w || !h) {
          requestAnimationFrame(tickCanvas);
          return;
        }
        // Verificar que el video tenga datos suficientes
        if (video.readyState < 2) {
          requestAnimationFrame(tickCanvas);
          return;
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        if (window.jsQR) {
          const qr = window.jsQR(img.data, w, h);
          if (qr && qr.data) {
            onCode(qr.data);
            return; // Detener después de detectar
          }
        } else {
          console.warn('jsQR no está disponible en tickCanvas');
        }
      } catch (e) {
        // Silenciar errores menores
        if (e.message && !e.message.includes('videoWidth') && !e.message.includes('not readable') && !e.message.includes('IndexSizeError')) {
          console.warn('Error en tickCanvas:', e);
        }
      }
      requestAnimationFrame(tickCanvas);
    }
    
    // Manejar cierre del modal
    const handleClose = () => {
      cleanup();
      reject(new Error('Cancelado por el usuario'));
    };
    
    closeBtn.onclick = handleClose;
    cancelBtn.onclick = handleClose;
    
    // Manejar Escape key - prevenir que cierre el modal padre
    escapeHandler = (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        ev.preventDefault();
        handleClose();
      }
    };
    document.addEventListener('keydown', escapeHandler, true); // Usar capture phase para interceptar antes
    
    // Manejar entrada manual
    manualInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        const val = manualInput.value.trim();
        if (val) {
          handleCode(val, true);
        }
      }
    });
    
    // Click fuera del modal para cerrar
    qrModal.addEventListener('click', (ev) => {
      if (ev.target === qrModal) {
        handleClose();
      }
    });
    
    // Prevenir que clicks dentro del contenido cierren el modal
    qrContent.addEventListener('click', (ev) => {
      ev.stopPropagation();
    });
    
    // Botón para iniciar cámara manualmente si falla el inicio automático
    if (startCameraBtn) {
      startCameraBtn.onclick = async () => {
        startCameraBtn.style.display = 'none';
        msg.textContent = 'Iniciando cámara...';
        msg.style.color = 'var(--text)';
        try {
          await start();
        } catch (err) {
          console.error('Error al iniciar cámara manualmente:', err);
          msg.textContent = 'Error al iniciar cámara: ' + (err?.message || 'Error desconocido');
          msg.style.color = 'var(--danger, #ef4444)';
          startCameraBtn.style.display = 'block';
        }
      };
    }
    
    // Iniciar cámara automáticamente
    start().catch(err => {
      // Error al iniciar cámara - se maneja en el catch del usuario
      msg.textContent = 'Error al iniciar cámara automáticamente. ' + (err?.message || 'Error desconocido');
      msg.style.color = 'var(--danger, #ef4444)';
      // Mostrar botón para intentar manualmente
      if (startCameraBtn) {
        startCameraBtn.style.display = 'block';
        msg.textContent += ' Haz clic en "Iniciar cámara" para intentar nuevamente.';
      }
    });
  });
}

export function initPrices(){
  const tab = $('#tab-precios'); if(!tab) return;
  const hasVehicularSection = !!document.querySelector('[data-subsection="prices-vehicular"]');

  // Elementos del nuevo sistema de menús colapsables
  const fMakesToggle=$('#pf-makes-toggle'), fMakesToggleText=$('#pf-makes-toggle-text'), fMakesToggleIcon=$('#pf-makes-toggle-icon');
  const fMakesCollapsible=$('#pf-makes-collapsible'), fMakesGrid=$('#pf-makes-grid'), fMakesFilter=$('#pf-makes-filter');
  const fMakeSelected=$('#pf-make-selected'), fMakeSelectedName=$('#pf-make-selected-name'), fMakeChange=$('#pf-make-change');
  
  const fVehiclesContainer=$('#pf-vehicles-container'), fVehiclesToggle=$('#pf-vehicles-toggle');
  const fVehiclesToggleText=$('#pf-vehicles-toggle-text'), fVehiclesToggleIcon=$('#pf-vehicles-toggle-icon');
  const fVehiclesCollapsible=$('#pf-vehicles-collapsible'), fVehiclesGrid=$('#pf-vehicles-grid'), fVehiclesFilter=$('#pf-vehicles-filter');
  const fVehiclesSelected=$('#pf-vehicles-selected'), fVehiclesSelectedList=$('#pf-vehicles-selected-list'), fVehiclesChange=$('#pf-vehicles-change');
  
  // Elementos legacy (mantener para compatibilidad)
  const fVehicleId=$('#pf-vehicle-id'), fVehicleSelected=$('#pf-vehicle-selected'), fVehicleName=$('#pf-vehicle-name');
  const fLinesContainer=$('#pf-lines-container'), fLinesGrid=$('#pf-lines-grid');
  const fSearch=$('#pf-search'), fClear=$('#pf-clear');
  const btnNewService=$('#pe-new-service'), btnNewProduct=$('#pe-new-product');
  const actionsBar=$('#pe-actions-bar'); // Legacy, mantener para compatibilidad
  const actionsBarVehicular=$('#pe-actions-bar-vehicular');
  const actionsBarGeneral=$('#pe-actions-bar-general');
  const head=$('#pe-head'), body=$('#pe-body');
  const headGeneral=$('#pe-head-general'), bodyGeneral=$('#pe-body-general');
  const headInversion=$('#pe-head-inversion'), bodyInversion=$('#pe-body-inversion');
  
  // Declarar variables que se usarán en las funciones
  let selectedVehicle = null; // Mantener para compatibilidad con código existente
  let selectedVehicles = []; // Array para selección múltiple
  let activeTabVehicleId = null; // ID del vehículo activo en las pestañas (cuando hay múltiples seleccionados)
  let selectedMake = null;
  let currentPage = 1;
  let currentFilters = { name: '', type: '' };
  let paging = { page: 1, limit: 10, total: 0, pages: 1 };
  const vehicleTabsContainer=$('#pe-vehicle-tabs');
  
  // Declarar funciones que se usarán más adelante (se definirán después)
  let loadPrices, loadGeneralPrices, loadInversionPrices;
  
  // Función para cambiar entre tabs (definirla temprano para que esté disponible)
  // Se asignará completamente después de que loadPrices y loadGeneralPrices estén definidas
  let switchSubTab = function(name) {
    if (name === 'prices-vehicular') name = 'prices-general';
    document.querySelectorAll('.payroll-tabs button[data-subtab]').forEach(b => {
      const isActive = b.dataset.subtab === name;
      b.classList.toggle('active', isActive);
    });
    document.querySelectorAll('[data-subsection]').forEach(sec => {
      sec.classList.toggle('hidden', sec.dataset.subsection !== name);
    });
    
    // Mostrar/ocultar elementos según la pestaña activa
    const isVehicular = false;
    const isGeneral = name === 'prices-general';
    const isInversion = name === 'prices-inversion';
    
    // Botones de acciones
    const actionsBarVehicular = $('#pe-actions-bar-vehicular');
    const actionsBarGeneral = $('#pe-actions-bar-general');
    if (actionsBarVehicular) actionsBarVehicular.style.display = isVehicular ? 'flex' : 'none';
    if (actionsBarGeneral) actionsBarGeneral.style.display = isGeneral ? 'flex' : 'none';
    
    // Lista de vehículos y marcas (solo en vehicular)
    const vehiclesContainer = $('#pf-vehicles-container');
    const makesToggle = $('#pf-makes-toggle')?.parentElement;
    if (vehiclesContainer) vehiclesContainer.style.display = isVehicular ? 'block' : 'none';
    if (makesToggle) makesToggle.style.display = isVehicular ? 'block' : 'none';
    
    // Filtros y tablas
    const filtersVehicular = $('#pe-filters');
    const filtersGeneral = $('#pe-filters-general');
    const filtersInversion = $('#pe-filters-inversion');
    const tableVehicular = $('#pe-table')?.closest('div');
    const tableGeneral = $('#pe-table-general')?.closest('div');
    const tableInversion = $('#pe-table-inversion')?.closest('div');
    const actionsBarInversion = $('#pe-actions-bar-inversion');
    
    if (filtersVehicular) filtersVehicular.style.display = isVehicular ? 'flex' : 'none';
    if (filtersGeneral) filtersGeneral.style.display = isGeneral ? 'flex' : 'none';
    if (filtersInversion) filtersInversion.style.display = isInversion ? 'flex' : 'none';
    if (tableVehicular) tableVehicular.style.display = isVehicular ? 'block' : 'none';
    if (tableGeneral) tableGeneral.style.display = isGeneral ? 'block' : 'none';
    if (tableInversion) tableInversion.style.display = isInversion ? 'block' : 'none';
    if (actionsBarInversion) actionsBarInversion.style.display = isInversion ? 'flex' : 'none';
    
    // Cargar precios según la pestaña (solo si las funciones están definidas)
    if (isVehicular && loadPrices) {
      loadPrices();
    } else if (isGeneral && loadGeneralPrices) {
      selectedVehicle = null;
      selectedVehicles = [];
      selectedMake = null;
      currentPage = 1;
      currentFilters = { name: '', type: '' }; // Resetear filtros
      console.log('[switchSubTab] Cargando precios generales...');
      loadGeneralPrices();
    } else if (isInversion && loadInversionPrices) {
      selectedVehicle = null;
      selectedVehicles = [];
      selectedMake = null;
      currentPage = 1;
      currentFilters = { name: '', type: '' }; // Resetear filtros
      console.log('[switchSubTab] Cargando precios de inversión...');
      loadInversionPrices();
    }
  };

  // Botones de importar/exportar (ya están en el HTML ahora)
  const btnImport=$('#pe-import');
  const btnExport=$('#pe-export');

  function renderTableHeader(){
    if (!head) return;
    head.replaceChildren();
    // Determinar qué vehículo usar: si hay múltiples seleccionados, usar el activo en las pestañas
    const vehicleToUse = selectedVehicles.length > 1 
      ? (activeTabVehicleId ? selectedVehicles.find(v => v._id === activeTabVehicleId) : selectedVehicles[0])
      : selectedVehicle;
    
    // Mostrar headers siempre (incluso para precios generales)
    const tr=document.createElement('tr');
    ['Tipo', 'Nombre', 'Item vinculado / Productos', 'Precio', 'Acciones'].forEach(txt=>{
      const th=document.createElement('th'); th.textContent=txt; tr.appendChild(th);
    });
    head.appendChild(tr);
    
    // Si no hay vehículo, mostrar mensaje informativo en el body (no en el header)
    if(!vehicleToUse) {
      // El mensaje se mostrará en el body si no hay precios
      return;
    }
  }

  const rowTemplateId='tpl-price-edit-row';

  function rowToNode(r){
    const tr=clone(rowTemplateId);
    if (!tr) {
      console.error('Template no encontrado:', rowTemplateId);
      const fallback = document.createElement('tr');
      fallback.innerHTML = `<td colspan="5">Error: Template no disponible</td>`;
      return fallback;
    }
    
    // Mostrar tipo y badge de general si aplica
    const vehicleCell = tr.querySelector('[data-vehicle]');
    if (vehicleCell) {
      let typeBadge = '';
      if (r.type === 'combo') {
        typeBadge = '<span class="inline-block px-2 py-0.5 bg-purple-600 dark:bg-purple-600 theme-light:bg-purple-500 text-white text-xs font-semibold rounded">COMBO</span>';
      } else if (r.type === 'product') {
        typeBadge = '<span class="inline-block px-2 py-0.5 bg-blue-600 dark:bg-blue-600 theme-light:bg-blue-500 text-white text-xs font-semibold rounded">PRODUCTO</span>';
      } else {
        typeBadge = '<span class="inline-block px-2 py-0.5 bg-green-600 dark:bg-green-600 theme-light:bg-green-500 text-white text-xs font-semibold rounded">SERVICIO</span>';
      }
      // Agregar badge de general si no tiene vehicleId
      const isGeneral = !r.vehicleId || r.isGeneral;
      if (isGeneral) {
        typeBadge += ' <span class="inline-block px-2 py-0.5 bg-cyan-600 dark:bg-cyan-600 theme-light:bg-cyan-500 text-white text-xs font-semibold rounded ml-1">🌐 GENERAL</span>';
      }
      vehicleCell.innerHTML = typeBadge;
    }
    
    // Mostrar nombre
    const nameCell = tr.querySelector('[data-name]');
    if (nameCell) {
      nameCell.textContent = r.name || 'Sin nombre';
      nameCell.style.fontWeight = '500';
    }
    
    // Mostrar item vinculado o productos del combo
    const itemInfoCell = tr.querySelector('[data-item-info]');
    if (itemInfoCell) {
      if (r.type === 'combo' && Array.isArray(r.comboProducts) && r.comboProducts.length > 0) {
        const productsList = r.comboProducts.map(cp => {
          const linked = cp.itemId ? `✓ ${escapeHtml(cp.itemId.name || cp.itemId.sku)}` : escapeHtml(cp.name || '');
          return `<div class="pr-iteminfo-line">• ${linked} (x${cp.qty || 1})</div>`;
        }).join('');
        itemInfoCell.innerHTML = `
          <div class="pr-iteminfo-title">${r.comboProducts.length} producto(s)</div>
          ${productsList}
        `;
      } else if (r.type === 'product' && r.itemId) {
        itemInfoCell.innerHTML = `
          <div class="pr-iteminfo-title">✓ ${escapeHtml(r.itemId.name || r.itemId.sku)}</div>
          <div class="pr-iteminfo-muted"><span class="font-semibold">SKU:</span> ${escapeHtml(r.itemId.sku)} · Stock: ${r.itemId.stock || 0}</div>
        `;
      } else if (r.type === 'product') {
        itemInfoCell.innerHTML = '<span class="pr-iteminfo-muted">Sin vincular</span>';
      } else {
        itemInfoCell.innerHTML = '<span class="pr-iteminfo-muted">-</span>';
      }
    }
    
    const inPrice = tr.querySelector('input[data-price]');
    if (inPrice) inPrice.value = r.total || r.price || 0;
    formatPriceRow(tr);
    bindPriceFormattedSync(tr);

    const editBtn = tr.querySelector('button.edit');
    if (editBtn) {
      const newEditBtn = editBtn.cloneNode(true);
      editBtn.parentNode.replaceChild(newEditBtn, editBtn);
      newEditBtn.addEventListener('click', () => {
        const isGeneral = (!r.vehicleId && r.type !== 'inversion');
        openCreateModal(r.type, r, isGeneral);
      });
    }

    const saveBtn = tr.querySelector('button.save');
    if (saveBtn) {
      const newSaveBtn = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
      newSaveBtn.addEventListener('click', async ()=>{
        const payload = {
          name: r.name,
          type: r.type,
          total: normalizeNumber(inPrice?.value || 0)
        };
        await API.priceUpdate(r._id, payload); 
        // Recargar según la pestaña activa
        const activeSubTab = document.querySelector('.payroll-tabs button[data-subtab].active')?.dataset.subtab;
        if (activeSubTab === 'prices-general') {
          loadGeneralPrices();
        } else {
          loadPrices();
        }
      });
    }
    
    const deleteBtn = tr.querySelector('button.delete');
    if (deleteBtn) {
      const newDeleteBtn = deleteBtn.cloneNode(true);
      deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
      newDeleteBtn.addEventListener('click', async ()=>{ 
        if(confirm('¿Borrar este servicio/producto?')){ 
          await API.priceDelete(r._id); 
          // Recargar según la pestaña activa
          const activeSubTab = document.querySelector('.payroll-tabs button[data-subtab].active')?.dataset.subtab;
          if (activeSubTab === 'prices-general') {
            loadGeneralPrices();
          } else {
            loadPrices();
          }
        } 
      });
    }
    return tr;
  }

  function renderPagination() {
    const paginationEl = $('#pe-pagination');
    renderPricesPaginationMount(paginationEl, {
      page: paging.page,
      pages: paging.pages,
      total: paging.total,
      prevId: 'pe-prev',
      nextId: 'pe-next',
      onPrev: () => {
        if (paging.page > 1) {
          currentPage = paging.page - 1;
          loadPrices();
        }
      },
      onNext: () => {
        if (paging.page < paging.pages) {
          currentPage = paging.page + 1;
          loadPrices();
        }
      }
    });
  }

  // Función para cargar precios de inversión
  loadInversionPrices = async function(params={}) {
    console.log('[loadInversionPrices] Iniciando carga de precios de inversión...');
    // Obtener filtros de la pestaña de inversión
    const filterNameInversion = $('#pe-filter-name-inversion');
    const nameFilter = filterNameInversion?.value || '';
    
    params = { 
      ...(params||{}), 
      vehicleId: null,
      type: 'inversion', // Filtrar solo precios de inversión
      page: currentPage,
      limit: 10,
      name: nameFilter
    };
    
    console.log('[loadInversionPrices] Parámetros:', params);
    
    try {
      const r = await API.pricesList(params);
      console.log('[loadInversionPrices] Respuesta de API:', r);
      const rows = Array.isArray(r?.items) ? r.items : (Array.isArray(r) ? r : []);
      paging = {
        page: r.page || 1,
        limit: r.limit || 10,
        total: r.total || 0,
        pages: r.pages || 1
      };
      
      // Renderizar header en tabla de inversión
      if (headInversion && bodyInversion) {
        const tr = document.createElement('tr');
        ['Tipo', 'Nombre', 'Detalle', 'Precio', 'Acciones'].forEach(txt => {
          const th = document.createElement('th');
          th.textContent = txt;
          tr.appendChild(th);
        });
        headInversion.replaceChildren(tr);
        
        if (rows.length === 0) {
          bodyInversion.replaceChildren();
          const emptyRow = document.createElement('tr');
          emptyRow.innerHTML = `<td colspan="5" class="pr-table-msg pr-table-msg--empty">
            <div class="font-semibold mb-2">💼 No hay precios de inversión disponibles</div>
            <div class="text-sm opacity-90">Usa el botón de arriba para crear precios de inversión</div>
          </td>`;
          bodyInversion.appendChild(emptyRow);
        } else {
          bodyInversion.replaceChildren(...rows.map(r => {
            const tr = clone(rowTemplateId);
            if (!tr) {
              const fallback = document.createElement('tr');
              fallback.innerHTML = `<td colspan="5">Error: Template no disponible</td>`;
              return fallback;
            }
            
            // Configurar celdas para inversión (más simple que otros tipos)
            const nameCell = tr.querySelector('[data-name]');
            if (nameCell) nameCell.textContent = r.name || '';
            
            const priceInput = tr.querySelector('input[data-price]');
            if (priceInput) priceInput.value = r.total || 0;
            formatPriceRow(tr);
            bindPriceFormattedSync(tr);
            
            // Ocultar celdas que no aplican para inversión
            const vehicleCell = tr.querySelector('[data-vehicle]');
            if (vehicleCell) {
              vehicleCell.innerHTML = '<span class="inline-block px-2 py-0.5 bg-orange-600 dark:bg-orange-600 theme-light:bg-orange-500 text-white text-xs font-semibold rounded">💼 INVERSIÓN</span>';
            }
            
            const itemInfoCell = tr.querySelector('[data-item-info]');
            if (itemInfoCell) itemInfoCell.textContent = '-';
            
            // Configurar botones de acciones
            const editBtn = tr.querySelector('button.edit');
            const saveBtn = tr.querySelector('button.save');
            const deleteBtn = tr.querySelector('button.delete');
            
            if (editBtn) {
              const newEditBtn = editBtn.cloneNode(true);
              editBtn.parentNode.replaceChild(newEditBtn, editBtn);
              newEditBtn.addEventListener('click', () => {
                const priceInput = tr.querySelector('input[data-price]');
                if (priceInput) {
                  priceInput.disabled = false;
                  priceInput.focus();
                  newEditBtn.style.display = 'none';
                  if (saveBtn) saveBtn.style.display = 'inline-block';
                }
              });
            }
            
            if (saveBtn) {
              const newSaveBtn = saveBtn.cloneNode(true);
              saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
              newSaveBtn.style.display = 'none';
              newSaveBtn.addEventListener('click', async () => {
                const priceInput = tr.querySelector('input[data-price]');
                if (priceInput) {
                  const newPrice = Number(priceInput.value || 0);
                  try {
                    await API.priceUpdate(r._id, { total: newPrice });
                    priceInput.disabled = true;
                    newSaveBtn.style.display = 'none';
                    if (editBtn) editBtn.style.display = 'inline-block';
                    loadInversionPrices();
                  } catch (err) {
                    alert('Error al actualizar: ' + (err?.message || 'Error desconocido'));
                  }
                }
              });
            }
            
            if (deleteBtn) {
              const newDeleteBtn = deleteBtn.cloneNode(true);
              deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
              newDeleteBtn.addEventListener('click', async () => {
                if (confirm('¿Borrar este precio de inversión?')) {
                  try {
                    await API.priceDelete(r._id);
                    loadInversionPrices();
                  } catch (err) {
                    alert('Error al borrar: ' + (err?.message || 'Error desconocido'));
                  }
                }
              });
            }
            
            return tr;
          }));
        }
      }
      
      const paginationInversion = $('#pe-pagination-inversion');
      renderPricesPaginationMount(paginationInversion, {
        page: paging.page,
        pages: paging.pages,
        total: paging.total,
        prevId: 'pe-prev-inversion',
        nextId: 'pe-next-inversion',
        onPrev: () => {
          if (paging.page > 1) {
            currentPage = paging.page - 1;
            loadInversionPrices();
          }
        },
        onNext: () => {
          if (paging.page < paging.pages) {
            currentPage = paging.page + 1;
            loadInversionPrices();
          }
        }
      });
    } catch (err) {
      console.error('Error loading inversion prices:', err);
      if (headInversion && bodyInversion) {
        const tr = document.createElement('tr');
        ['Tipo', 'Nombre', 'Detalle', 'Precio', 'Acciones'].forEach(txt => {
          const th = document.createElement('th');
          th.textContent = txt;
          tr.appendChild(th);
        });
        headInversion.replaceChildren(tr);
        bodyInversion.replaceChildren();
        const errorRow = document.createElement('tr');
        errorRow.innerHTML = `<td colspan="5" class="pr-table-msg pr-table-msg--error">Error al cargar precios: ${escapeHtml(err?.message || 'Error desconocido')}</td>`;
        bodyInversion.appendChild(errorRow);
      }
    }
  };

  // Función para cargar precios generales
  loadGeneralPrices = async function(params={}) {
    console.log('[loadGeneralPrices] Iniciando carga de precios generales...');
    // Obtener filtros de la pestaña general
    const filterNameGeneral = $('#pe-filter-name-general');
    const filterTypeGeneral = $('#pe-filter-type-general');
    const nameFilter = filterNameGeneral?.value || '';
    const typeFilter = filterTypeGeneral?.value || '';
    
    params = { 
      ...(params||{}), 
      vehicleId: null,
      includeGeneral: true,
      isGeneral: true, // Filtrar solo precios generales
      page: currentPage,
      limit: 10,
      name: nameFilter,
      type: typeFilter || undefined
    };
    
    console.log('[loadGeneralPrices] Parámetros:', params);
    
    try {
      const r = await API.pricesList(params);
      console.log('[loadGeneralPrices] Respuesta de API:', r);
      const rows = Array.isArray(r?.items) ? r.items : (Array.isArray(r) ? r : []);
      paging = {
        page: r.page || 1,
        limit: r.limit || 10,
        total: r.total || 0,
        pages: r.pages || 1
      };
      
      // Renderizar header en tabla general
      if (headGeneral && bodyGeneral) {
        const tr = document.createElement('tr');
        ['Tipo', 'Nombre', 'Item vinculado / Productos', 'Precio', 'Acciones'].forEach(txt => {
          const th = document.createElement('th');
          th.textContent = txt;
          tr.appendChild(th);
        });
        headGeneral.replaceChildren(tr);
        
        if (rows.length === 0) {
          bodyGeneral.replaceChildren();
          const emptyRow = document.createElement('tr');
          emptyRow.innerHTML = `<td colspan="5" class="pr-table-msg pr-table-msg--empty">
            <div class="font-semibold mb-2">🌐 No hay precios generales disponibles</div>
            <div class="text-sm opacity-90">Usa los botones de arriba para crear precios generales</div>
          </td>`;
          bodyGeneral.appendChild(emptyRow);
        } else {
          bodyGeneral.replaceChildren(...rows.map(rowToNode));
        }
      }
      
      const paginationGeneral = $('#pe-pagination-general');
      renderPricesPaginationMount(paginationGeneral, {
        page: paging.page,
        pages: paging.pages,
        total: paging.total,
        prevId: 'pe-prev-general',
        nextId: 'pe-next-general',
        onPrev: () => {
          if (paging.page > 1) {
            currentPage = paging.page - 1;
            loadGeneralPrices();
          }
        },
        onNext: () => {
          if (paging.page < paging.pages) {
            currentPage = paging.page + 1;
            loadGeneralPrices();
          }
        }
      });
    } catch (err) {
      console.error('Error loading general prices:', err);
      if (headGeneral && bodyGeneral) {
        const tr = document.createElement('tr');
        ['Tipo', 'Nombre', 'Item vinculado / Productos', 'Precio', 'Acciones'].forEach(txt => {
          const th = document.createElement('th');
          th.textContent = txt;
          tr.appendChild(th);
        });
        headGeneral.replaceChildren(tr);
        bodyGeneral.replaceChildren();
        const errorRow = document.createElement('tr');
        errorRow.innerHTML = `<td colspan="5" class="pr-table-msg pr-table-msg--error">Error al cargar precios: ${escapeHtml(err?.message || 'Error desconocido')}</td>`;
        bodyGeneral.appendChild(errorRow);
      }
    }
  }

  loadPrices = async function(params={}){
    if (!hasVehicularSection) return;
    // Determinar qué vehículo usar: si hay múltiples seleccionados, usar el activo en las pestañas
    const vehicleToUse = selectedVehicles.length > 1 
      ? (activeTabVehicleId ? selectedVehicles.find(v => v._id === activeTabVehicleId) : selectedVehicles[0])
      : selectedVehicle;
    
    // Si no hay vehículo seleccionado, cargar solo precios generales
    if (!vehicleToUse) {
      params = { 
        ...(params||{}), 
        vehicleId: null,
        includeGeneral: true,
        page: currentPage,
        limit: 10,
        name: currentFilters.name,
        type: currentFilters.type || undefined
      };
    } else {
      params = { 
        ...(params||{}), 
        vehicleId: vehicleToUse._id,
        includeGeneral: true, // Incluir precios generales incluso cuando hay vehículo seleccionado
        page: currentPage,
        limit: 10,
        name: currentFilters.name,
        type: currentFilters.type || undefined
      };
    }
    try {
      const r = await API.pricesList(params);
      const rows = Array.isArray(r?.items) ? r.items : (Array.isArray(r) ? r : []);
      paging = {
        page: r.page || 1,
        limit: r.limit || 10,
        total: r.total || 0,
        pages: r.pages || 1
      };
      
      // Renderizar header primero
      renderTableHeader();
      
      // Si no hay precios y no hay vehículo seleccionado, mostrar mensaje informativo
      if (rows.length === 0 && !selectedVehicle && selectedVehicles.length === 0) {
        body.replaceChildren();
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="5" class="pr-table-msg pr-table-msg--empty">
          <div class="font-semibold mb-2">🌐 No hay precios generales disponibles</div>
          <div class="text-sm opacity-90">Usa los botones de arriba para crear precios generales (🌐 Servicio general, 🌐 Producto general, 🌐 Combo general)</div>
        </td>`;
        body.appendChild(emptyRow);
      } else if (rows.length === 0) {
        body.replaceChildren();
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="5" class="pr-table-msg pr-table-msg--empty">No hay precios que coincidan con los filtros.</td>`;
        body.appendChild(emptyRow);
      } else {
        body.replaceChildren(...rows.map(rowToNode));
      }
      
      renderPagination();
    } catch (err) {
      console.error('Error loading prices:', err);
      renderTableHeader();
      body.replaceChildren();
      const errorRow = document.createElement('tr');
      errorRow.innerHTML = `<td colspan="5" class="pr-table-msg pr-table-msg--error">Error al cargar precios: ${escapeHtml(err?.message || 'Error desconocido')}</td>`;
      body.appendChild(errorRow);
    }
  }
  
  function renderVehicleTabs() {
    if (!vehicleTabsContainer) return;
    
    if (selectedVehicles.length <= 1) {
      // Ocultar pestañas si hay 1 o menos vehículos
      vehicleTabsContainer.style.display = 'none';
      vehicleTabsContainer.innerHTML = '';
      return;
    }
    
    // Mostrar pestañas cuando hay múltiples vehículos
    vehicleTabsContainer.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:8px;flex-wrap:wrap;';
    
    vehicleTabsContainer.innerHTML = selectedVehicles.map((v, idx) => {
      const isActive = activeTabVehicleId === v._id || (!activeTabVehicleId && idx === 0);
      return `
        <button 
          class="vehicle-tab" 
          data-vehicle-id="${v._id}"
          style="padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;background:${isActive ? 'var(--primary, #3b82f6)' : 'var(--card-alt)'};color:${isActive ? 'white' : 'var(--text)'};border-bottom:${isActive ? '3px solid var(--primary, #3b82f6)' : '3px solid transparent'};transition:all 0.2s;"
        >
          ${v.make} ${v.line} ${v.displacement}${v.modelYear ? ` (${v.modelYear})` : ''}
        </button>
      `;
    }).join('');
    
    // Agregar event listeners a las pestañas
    vehicleTabsContainer.querySelectorAll('.vehicle-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const vehicleId = tab.dataset.vehicleId;
        switchToVehicleTab(vehicleId);
      });
    });
    
    // Si no hay vehículo activo, activar el primero
    if (!activeTabVehicleId && selectedVehicles.length > 0) {
      activeTabVehicleId = selectedVehicles[0]._id;
      renderVehicleTabs(); // Re-renderizar para actualizar el estado activo
    }
  }
  
  function switchToVehicleTab(vehicleId) {
    activeTabVehicleId = vehicleId;
    renderVehicleTabs();
    currentPage = 1;
    currentFilters = { name: '', type: '' };
    const filterName = $('#pe-filter-name');
    const filterType = $('#pe-filter-type');
    if (filterName) filterName.value = '';
    if (filterType) filterType.value = '';
    loadPrices();
  }

  // Variables para filtrado de marcas y vehículos
  let allMakes = [];
  let filteredMakes = [];
  let allVehiclesForMake = [];
  let filteredVehicles = [];

  // Cargar marcas al iniciar (nuevo sistema con tarjetas)
  async function loadMakes() {
    try {
      const r = await API.vehicles.getMakes();
      allMakes = Array.isArray(r?.makes) ? r.makes : [];
      filteredMakes = [...allMakes];
      renderMakesGrid();
      // Abrir el menú de marcas automáticamente al cargar
      expandMakesMenu();
    } catch (err) {
      console.error('Error al cargar marcas:', err);
      if (fMakesGrid) {
        fMakesGrid.innerHTML = '<div class="text-center py-6 text-red-400">Error al cargar marcas</div>';
      }
    }
  }
  
  // Cargar precios generales al iniciar si no hay vehículo seleccionado
  function loadGeneralPricesOnInit() {
    // Asegurar que la barra de acciones esté siempre visible
    if (actionsBar) actionsBar.style.display = 'flex';
    
    if (!selectedVehicle && selectedVehicles.length === 0) {
      // Mostrar filtros también
      const filtersEl = $('#pe-filters');
      if (filtersEl) filtersEl.style.display = 'flex';
      renderTableHeader();
      loadPrices();
    }
  }

  // Renderizar grid de marcas con filtrado
  function renderMakesGrid() {
    if (!fMakesGrid) return;
    
    if (filteredMakes.length === 0) {
      fMakesGrid.innerHTML = '<div class="col-span-full text-center py-6 text-slate-400">No se encontraron marcas</div>';
      return;
    }

    fMakesGrid.innerHTML = filteredMakes.map(make => {
      const isSelected = selectedMake === make;
      return `
        <div class="make-card p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 text-center h-24 flex flex-col items-center justify-center ${
          isSelected 
            ? 'bg-blue-600/20 dark:bg-blue-600/20 theme-light:bg-blue-50 border-blue-500 dark:border-blue-500 theme-light:border-blue-400' 
            : 'bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 hover:border-blue-500 dark:hover:border-blue-500 theme-light:hover:border-blue-400'
        }" data-make="${make}">
          <div class="font-semibold text-base text-white dark:text-white theme-light:text-slate-900 ${isSelected ? 'text-blue-400 dark:text-blue-400 theme-light:text-blue-600' : ''} truncate w-full px-2" title="${make}">${make}</div>
          ${isSelected ? '<div class="mt-1 text-blue-400 dark:text-blue-400 theme-light:text-blue-600 text-xs">✓ Seleccionada</div>' : ''}
        </div>
      `;
    }).join('');

    // Agregar event listeners a las tarjetas
    fMakesGrid.querySelectorAll('.make-card').forEach(card => {
      card.addEventListener('click', () => {
        const make = card.dataset.make;
        selectMake(make);
      });
      
      card.addEventListener('mouseenter', function() {
        if (selectedMake !== this.dataset.make) {
          this.classList.add('transform', '-translate-y-1', 'shadow-lg');
        }
      });
      
      card.addEventListener('mouseleave', function() {
        if (selectedMake !== this.dataset.make) {
          this.classList.remove('transform', '-translate-y-1', 'shadow-lg');
        }
      });
    });
  }

  // Seleccionar marca
  async function selectMake(make) {
    if (!make) {
      selectedMake = null;
      collapseMakesMenu();
      hideVehiclesMenu();
      return;
    }

    selectedMake = make;
    collapseMakesMenu();
    await loadVehiclesForMake(make);
    showVehiclesMenu();
    // Abrir automáticamente el menú de vehículos al seleccionar una marca
    expandVehiclesMenu();
  }

  // Colapsar menú de marcas
  function collapseMakesMenu() {
    if (fMakesCollapsible) fMakesCollapsible.classList.add('hidden');
    if (fMakesToggleIcon) fMakesToggleIcon.style.transform = 'rotate(0deg)';
    if (fMakeSelected) fMakeSelected.classList.remove('hidden');
    if (fMakeSelectedName) fMakeSelectedName.textContent = selectedMake || '';
    if (fMakesToggleText) fMakesToggleText.textContent = selectedMake ? `Marca: ${selectedMake}` : 'Seleccionar marca';
  }

  // Expandir menú de marcas
  function expandMakesMenu() {
    if (fMakesCollapsible) fMakesCollapsible.classList.remove('hidden');
    if (fMakesToggleIcon) fMakesToggleIcon.style.transform = 'rotate(180deg)';
    if (fMakeSelected) fMakeSelected.classList.add('hidden');
  }

  // Mostrar menú de vehículos
  function showVehiclesMenu() {
    if (fVehiclesContainer) fVehiclesContainer.classList.remove('hidden');
  }

  // Ocultar menú de vehículos
  function hideVehiclesMenu() {
    if (fVehiclesContainer) fVehiclesContainer.classList.add('hidden');
    if (fVehiclesCollapsible) fVehiclesCollapsible.classList.add('hidden');
    if (fVehiclesSelected) fVehiclesSelected.classList.add('hidden');
  }

  // Cargar vehículos para una marca
  async function loadVehiclesForMake(make) {
    if (!make || !fVehiclesGrid) return;
    
    fVehiclesGrid.innerHTML = '<div class="col-span-full text-center py-6 text-slate-400">Cargando vehículos...</div>';
    
    try {
      const vehiclesData = await API.vehicles.list({ make });
      allVehiclesForMake = Array.isArray(vehiclesData?.items) ? vehiclesData.items : [];
      filteredVehicles = [...allVehiclesForMake];
      renderVehiclesGrid();
    } catch (err) {
      console.error('Error al cargar vehículos:', err);
      fVehiclesGrid.innerHTML = '<div class="col-span-full text-center py-6 text-red-400">Error al cargar vehículos</div>';
    }
  }

  // Renderizar grid de vehículos con filtrado
  function renderVehiclesGrid() {
    if (!fVehiclesGrid) return;
    
    if (filteredVehicles.length === 0) {
      fVehiclesGrid.innerHTML = '<div class="col-span-full text-center py-6 text-slate-400">No se encontraron vehículos</div>';
      return;
    }

    fVehiclesGrid.innerHTML = filteredVehicles.map(vehicle => {
      const isSelected = selectedVehicles.some(sv => sv._id === vehicle._id);
      const vehicleName = `${vehicle.make} ${vehicle.line}`;
      const vehicleDetails = `Cilindraje: ${vehicle.displacement || '-'}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}`;
      return `
        <div class="vehicle-card p-3 rounded-lg border-2 cursor-pointer transition-all duration-200 h-28 flex flex-col ${
          isSelected 
            ? 'bg-green-600/20 dark:bg-green-600/20 theme-light:bg-green-50 border-green-500 dark:border-green-500 theme-light:border-green-400' 
            : 'bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 hover:border-green-500 dark:hover:border-green-500 theme-light:hover:border-green-400'
        }" data-vehicle-id="${vehicle._id}">
          <div class="flex items-start gap-2 mb-2 flex-shrink-0">
            <input type="checkbox" ${isSelected ? 'checked' : ''} class="vehicle-checkbox w-4 h-4 mt-0.5 flex-shrink-0" data-vehicle-id="${vehicle._id}" />
            <div class="font-semibold text-sm text-white dark:text-white theme-light:text-slate-900 flex-1 min-w-0 line-clamp-2" title="${vehicleName}">${vehicleName}</div>
          </div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 line-clamp-2 flex-1 overflow-hidden" title="${vehicleDetails}">
            ${vehicleDetails}
          </div>
        </div>
      `;
    }).join('');

    // Agregar event listeners
    fVehiclesGrid.querySelectorAll('.vehicle-card').forEach(card => {
      const checkbox = card.querySelector('.vehicle-checkbox');
      const vehicleId = card.dataset.vehicleId;
      const vehicle = allVehiclesForMake.find(v => v._id === vehicleId);
      
      if (!vehicle) return;

      // Click en checkbox
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          e.stopPropagation();
          toggleVehicleSelection(vehicle);
        });
      }

      // Click en tarjeta
      card.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox' && !e.target.closest('.vehicle-checkbox')) {
          toggleVehicleSelection(vehicle);
        }
      });

      card.addEventListener('mouseenter', function() {
        if (!selectedVehicles.some(sv => sv._id === vehicleId)) {
          this.classList.add('transform', '-translate-y-1', 'shadow-lg');
        }
      });

      card.addEventListener('mouseleave', function() {
        if (!selectedVehicles.some(sv => sv._id === vehicleId)) {
          this.classList.remove('transform', '-translate-y-1', 'shadow-lg');
        }
      });
    });
  }

  // Colapsar menú de vehículos
  function collapseVehiclesMenu() {
    if (fVehiclesCollapsible) fVehiclesCollapsible.classList.add('hidden');
    if (fVehiclesToggleIcon) fVehiclesToggleIcon.style.transform = 'rotate(0deg)';
    if (fVehiclesSelected) fVehiclesSelected.classList.remove('hidden');
    updateSelectedVehiclesDisplayNew();
  }

  // Expandir menú de vehículos
  function expandVehiclesMenu() {
    if (fVehiclesCollapsible) fVehiclesCollapsible.classList.remove('hidden');
    if (fVehiclesToggleIcon) fVehiclesToggleIcon.style.transform = 'rotate(180deg)';
    if (fVehiclesSelected) fVehiclesSelected.classList.add('hidden');
  }


  // Cargar líneas de una marca
  async function loadLinesForMake(make) {
    if (!make) {
      fLinesContainer.style.display = 'none';
      return;
    }
    
    fLinesContainer.style.display = 'block';
    fLinesGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--muted);">Cargando líneas...</div>';
    
    try {
      // Obtener todas las líneas de esta marca
      const linesData = await API.vehicles.getLinesByMake(make);
      const lines = Array.isArray(linesData?.lines) ? linesData.lines : [];
      
      // Obtener todos los vehículos de esta marca para agrupar por línea y cilindraje
      const vehiclesData = await API.vehicles.list({ make });
      const vehicles = Array.isArray(vehiclesData?.items) ? vehiclesData.items : [];
      
      // Agrupar vehículos por línea
      const linesMap = new Map();
      vehicles.forEach(v => {
        const key = `${v.line}|||${v.displacement}`;
        if (!linesMap.has(key)) {
          linesMap.set(key, {
            line: v.line,
            displacement: v.displacement,
            vehicles: []
          });
        }
        linesMap.get(key).vehicles.push(v);
      });
      
      fLinesGrid.innerHTML = '';
      
      // Crear tarjeta para cada combinación línea/cilindraje
      linesMap.forEach((lineData, key) => {
        const card = document.createElement('div');
        const isSelected = lineData.vehicles.length === 1 && selectedVehicles.some(sv => sv._id === lineData.vehicles[0]._id);
        card.dataset.lineKey = key; // Agregar identificador para poder actualizar después
        if (lineData.vehicles.length === 1) {
          card.dataset.vehicleId = lineData.vehicles[0]._id;
        }
        card.style.cssText = `padding:16px;background:${isSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-alt)'};border:2px solid ${isSelected ? 'var(--primary, #3b82f6)' : 'var(--border)'};border-radius:12px;cursor:pointer;transition:all 0.2s;text-align:center;min-height:120px;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;`;
        
        card.innerHTML = `
          <div style="font-weight:600;font-size:16px;margin-bottom:4px;color:var(--text);">${lineData.line}</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">${lineData.displacement}</div>
          <div style="font-size:11px;color:var(--muted);">${lineData.vehicles.length} variante(s)</div>
        `;
        
        // Agregar checkbox solo si hay una sola variante
        if (lineData.vehicles.length === 1) {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = isSelected;
          checkbox.style.cssText = 'position:absolute;top:8px;right:8px;width:20px;height:20px;cursor:pointer;z-index:10;pointer-events:auto;';
          
          const handleCheckboxChange = () => {
            toggleVehicleSelection(lineData.vehicles[0]);
            // La función updateSelectedVehiclesDisplay() ya actualiza el visual mediante updateLinesVisualSelection()
          };
          
          checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            handleCheckboxChange();
          });
          
          checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
          });
          
          card.appendChild(checkbox);
        }
        
        card.addEventListener('mouseenter', () => {
          const currentIsSelected = lineData.vehicles.length === 1 && selectedVehicles.some(sv => sv._id === lineData.vehicles[0]._id);
          if (!currentIsSelected) {
            card.style.borderColor = 'var(--primary, #3b82f6)';
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
          }
        });
        
        card.addEventListener('mouseleave', () => {
          const currentIsSelected = lineData.vehicles.length === 1 && selectedVehicles.some(sv => sv._id === lineData.vehicles[0]._id);
          if (!currentIsSelected) {
            card.style.borderColor = 'var(--border)';
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = '';
          }
        });
        
        card.addEventListener('click', (e) => {
          // Si se hace clic en el checkbox o en cualquier elemento dentro del checkbox, no hacer nada más
          if (e.target.type === 'checkbox' || e.target.closest('input[type="checkbox"]')) {
            return;
          }
          
          // Toggle selección del vehículo si hay una sola variante
          if (lineData.vehicles.length === 1) {
            toggleVehicleSelection(lineData.vehicles[0]);
            // La función updateSelectedVehiclesDisplay() ya actualiza el visual mediante updateLinesVisualSelection()
          } else {
            // Si hay múltiples variantes, mostrar un selector con checkboxes
            showVehicleSelector(lineData.vehicles, lineData.line, lineData.displacement);
          }
        });
        
        fLinesGrid.appendChild(card);
      });
      
      // Actualizar visual de selección después de crear todas las tarjetas
      updateLinesVisualSelection();
      
      // Agregar tarjeta "+" para agregar vehículo
      const addCard = document.createElement('div');
      addCard.style.cssText = 'padding:16px;background:var(--card-alt);border:2px dashed var(--border);border-radius:12px;cursor:pointer;transition:all 0.2s;text-align:center;min-height:120px;display:flex;flex-direction:column;justify-content:center;align-items:center;';
      
      addCard.innerHTML = `
        <div style="font-size:48px;color:var(--muted);margin-bottom:8px;">➕</div>
        <div style="font-weight:600;font-size:14px;color:var(--muted);">Agregar vehículo</div>
      `;
      
      addCard.addEventListener('mouseenter', () => {
        addCard.style.borderColor = 'var(--primary, #3b82f6)';
        addCard.style.transform = 'translateY(-2px)';
        addCard.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
        addCard.style.background = 'var(--card)';
      });
      
      addCard.addEventListener('mouseleave', () => {
        addCard.style.borderColor = 'var(--border)';
        addCard.style.transform = 'translateY(0)';
        addCard.style.boxShadow = '';
        addCard.style.background = 'var(--card-alt)';
      });
      
      addCard.addEventListener('click', () => {
        // Cambiar a la pestaña de vehículos
        switchSubTab('vehicles');
        // Scroll a la sección de vehículos
        setTimeout(() => {
          const vehiclesSection = $('[data-subsection="vehicles"]');
          if (vehiclesSection) {
            vehiclesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      });
      
      fLinesGrid.appendChild(addCard);
      
    } catch (err) {
      console.error('Error al cargar líneas:', err);
      fLinesGrid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--danger);">
          <p>Error al cargar líneas: ${err?.message || 'Error desconocido'}</p>
        </div>
      `;
    }
  }

  // Mostrar selector de vehículo cuando hay múltiples variantes (con selección múltiple)
  function showVehicleSelector(vehicles, line, displacement) {
    const node = document.createElement('div');
    node.className = 'bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white/95 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 overflow-hidden max-w-[600px] w-full mx-auto';
    node.innerHTML = `
      <div class="px-5 py-3 bg-gradient-to-r from-sky-600 to-indigo-600 text-white">
        <p class="text-xs font-semibold uppercase tracking-wide text-white/80">Vehículos</p>
        <h3 class="text-lg font-bold">🚗 Seleccionar variantes</h3>
        <p class="text-sm text-white/90 mt-1">${escapeHtml(line)} · ${escapeHtml(displacement)}</p>
      </div>
      <div class="p-5">
        <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-4">Puedes elegir varios para crear precios en bulk.</p>
        <div class="grid gap-2 mb-4">
        ${vehicles.map(v => {
          const isSelected = selectedVehicles.some(sv => sv._id === v._id);
          return `
          <div class="vehicle-variant-card flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-500/10 dark:bg-blue-500/10 theme-light:bg-blue-50' : 'border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-200 bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-slate-50'}" data-vehicle-id="${v._id}">
            <input type="checkbox" class="vehicle-checkbox w-5 h-5 shrink-0 cursor-pointer accent-blue-600" data-vehicle-id="${v._id}" ${isSelected ? 'checked' : ''} />
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${escapeHtml(v.line)} ${escapeHtml(v.displacement)}</div>
              ${v.modelYear ? `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-0.5">Modelo: ${escapeHtml(v.modelYear)}</div>` : ''}
            </div>
          </div>
        `;
        }).join('')}
        </div>
        <div class="flex flex-wrap gap-2 justify-end">
          <button type="button" id="variant-select-all" class="pr-btn-secondary px-3 py-2 text-sm">Seleccionar todos</button>
          <button type="button" id="variant-deselect-all" class="pr-btn-secondary px-3 py-2 text-sm">Deseleccionar</button>
          <button type="button" id="variant-confirm" class="pr-main-btn px-4 py-2 text-sm">Confirmar (${selectedVehicles.length})</button>
          <button type="button" id="variant-cancel" class="pr-btn-secondary px-3 py-2 text-sm">Cancelar</button>
        </div>
      </div>
    `;
    
    openModal(node);
    
    const updateConfirmButton = () => {
      const confirmBtn = node.querySelector('#variant-confirm');
      const selectedCount = node.querySelectorAll('.vehicle-checkbox:checked').length;
      confirmBtn.textContent = `Confirmar (${selectedCount})`;
      confirmBtn.disabled = selectedCount === 0;
    };
    
    node.querySelectorAll('.vehicle-variant-card').forEach(card => {
      const checkbox = card.querySelector('.vehicle-checkbox');
      const vehicleId = card.dataset.vehicleId;
      const vehicle = vehicles.find(v => v._id === vehicleId);
      
      card.addEventListener('mouseenter', () => {
        if (!checkbox.checked) {
          card.style.borderColor = 'var(--primary, #3b82f6)';
          card.style.background = 'var(--card)';
        }
      });
      card.addEventListener('mouseleave', () => {
        if (!checkbox.checked) {
          card.style.borderColor = 'var(--border)';
          card.style.background = 'var(--card-alt)';
        }
      });
      
      const handleToggle = () => {
        if (checkbox.checked) {
          if (!selectedVehicles.some(sv => sv._id === vehicleId)) {
            selectedVehicles.push(vehicle);
            card.style.borderColor = 'var(--primary, #3b82f6)';
            card.style.background = 'rgba(59, 130, 246, 0.1)';
          }
        } else {
          selectedVehicles = selectedVehicles.filter(sv => sv._id !== vehicleId);
          card.style.borderColor = 'var(--border)';
          card.style.background = 'var(--card-alt)';
        }
        updateConfirmButton();
        updateSelectedVehiclesDisplay();
      };
      
      checkbox.addEventListener('change', handleToggle);
      card.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          handleToggle();
        }
      });
    });
    
    node.querySelector('#variant-select-all').onclick = () => {
      node.querySelectorAll('.vehicle-checkbox').forEach(cb => {
        if (!cb.checked) {
          cb.checked = true;
          const vehicleId = cb.dataset.vehicleId;
          const vehicle = vehicles.find(v => v._id === vehicleId);
          if (vehicle && !selectedVehicles.some(sv => sv._id === vehicleId)) {
            selectedVehicles.push(vehicle);
          }
        }
      });
      node.querySelectorAll('.vehicle-variant-card').forEach(card => {
        card.style.borderColor = 'var(--primary, #3b82f6)';
        card.style.background = 'rgba(59, 130, 246, 0.1)';
      });
      updateConfirmButton();
      updateSelectedVehiclesDisplay();
    };
    
    node.querySelector('#variant-deselect-all').onclick = () => {
      node.querySelectorAll('.vehicle-checkbox').forEach(cb => {
        cb.checked = false;
        const vehicleId = cb.dataset.vehicleId;
        selectedVehicles = selectedVehicles.filter(sv => sv._id !== vehicleId);
      });
      node.querySelectorAll('.vehicle-variant-card').forEach(card => {
        card.style.borderColor = 'var(--border)';
        card.style.background = 'var(--card-alt)';
      });
      updateConfirmButton();
      updateSelectedVehiclesDisplay();
    };
    
    node.querySelector('#variant-confirm').onclick = () => {
      if (selectedVehicles.length === 0) {
        alert('Selecciona al menos un vehículo');
        return;
      }
      closeModal();
      updateSelectedVehiclesDisplay();
      // Si solo hay uno seleccionado, mantener compatibilidad con código existente
      if (selectedVehicles.length === 1) {
        selectedVehicle = selectedVehicles[0];
        selectVehicle(selectedVehicle);
      } else {
        // Múltiples vehículos seleccionados
        fVehicleSelected.style.display = 'block';
        fVehicleName.textContent = `${selectedVehicles.length} vehículos seleccionados`;
        fLinesContainer.style.display = 'none';
        actionsBar.style.display = 'flex';
        $('#pe-filters').style.display = 'flex';
        // No cargar precios cuando hay múltiples seleccionados
        body.replaceChildren();
        renderTableHeader();
      }
    };
    
    node.querySelector('#variant-cancel').onclick = () => {
      closeModal();
    };
    
    updateConfirmButton();
  }

  function toggleVehicleSelection(vehicle) {
    const index = selectedVehicles.findIndex(sv => sv._id === vehicle._id);
    if (index >= 0) {
      // Deseleccionar
      selectedVehicles.splice(index, 1);
    } else {
      // Seleccionar
      selectedVehicles.push(vehicle);
    }
    
    // Actualizar visual del grid de vehículos
    renderVehiclesGrid();
    
    // NO colapsar automáticamente - el usuario cerrará manualmente cuando termine
    // Solo actualizar el display de vehículos seleccionados
    updateSelectedVehiclesDisplayNew();
    
    updateSelectedVehiclesDisplay();
  }
  
  function updateSelectedVehiclesDisplay() {
    // Actualizar display del nuevo sistema (sin recursión)
    updateSelectedVehiclesDisplayNew();
    
    if (selectedVehicles.length === 0) {
      selectedVehicle = null;
      activeTabVehicleId = null;
      fVehicleId.value = '';
      if (fVehicleName) fVehicleName.textContent = '';
      if (fVehicleSelected) fVehicleSelected.style.display = 'none';
      if (fLinesContainer) fLinesContainer.style.display = 'none';
      // Mostrar barra de acciones siempre para permitir crear precios generales
      if (actionsBar) actionsBar.style.display = 'flex';
      const filtersEl = $('#pe-filters');
      if (filtersEl) filtersEl.style.display = 'flex'; // Mostrar filtros también para precios generales
      if (vehicleTabsContainer) {
        vehicleTabsContainer.style.display = 'none';
        vehicleTabsContainer.innerHTML = '';
      }
      // Cargar precios generales automáticamente cuando no hay vehículo seleccionado
      currentPage = 1;
      currentFilters = { name: '', type: '' };
      const filterName = $('#pe-filter-name');
      const filterType = $('#pe-filter-type');
      if (filterName) filterName.value = '';
      if (filterType) filterType.value = '';
      renderTableHeader();
      loadPrices(); // Cargar precios generales automáticamente
    } else {
      // Hay vehículos seleccionados (1 o más)
      if (selectedVehicles.length === 1) {
        selectedVehicle = selectedVehicles[0];
        activeTabVehicleId = null;
        fVehicleId.value = selectedVehicle._id;
        if (fVehicleName) fVehicleName.textContent = `✓ Vehículo seleccionado: ${selectedVehicle.make} ${selectedVehicle.line} - Cilindraje: ${selectedVehicle.displacement}${selectedVehicle.modelYear ? ` | Modelo: ${selectedVehicle.modelYear}` : ''}`;
        renderVehicleTabs();
        currentPage = 1;
        currentFilters = { name: '', type: '' };
        const filterName = $('#pe-filter-name');
        const filterType = $('#pe-filter-type');
        if (filterName) filterName.value = '';
        if (filterType) filterType.value = '';
        loadPrices();
      } else {
        // Múltiples vehículos seleccionados
        selectedVehicle = null;
        fVehicleId.value = '';
        if (fVehicleName) fVehicleName.textContent = `✓ ${selectedVehicles.length} vehículos seleccionados`;
        
        if (!activeTabVehicleId && selectedVehicles.length > 0) {
          activeTabVehicleId = selectedVehicles[0]._id;
        }
        
        renderVehicleTabs();
        currentPage = 1;
        currentFilters = { name: '', type: '' };
        const filterName = $('#pe-filter-name');
        const filterType = $('#pe-filter-type');
        if (filterName) filterName.value = '';
        if (filterType) filterType.value = '';
        loadPrices();
      }
      
      if (fVehicleSelected) fVehicleSelected.style.display = 'block';
      if (fLinesContainer) fLinesContainer.style.display = 'block';
      if (actionsBar) actionsBar.style.display = 'flex';
      
      const filtersEl = $('#pe-filters');
      if (filtersEl && selectedVehicles.length >= 1) {
        filtersEl.style.display = 'flex';
      } else if (filtersEl) {
        filtersEl.style.display = 'none';
      }
      
      updateLinesVisualSelection();
    }
  }
  
  // Función auxiliar para actualizar el display del nuevo sistema (sin recursión)
  function updateSelectedVehiclesDisplayNew() {
    if (!fVehiclesSelectedList) return;
    
    if (selectedVehicles.length === 0) {
      fVehiclesSelectedList.innerHTML = '<span class="text-slate-400 text-sm">Ningún vehículo seleccionado</span>';
      if (fVehiclesToggleText) fVehiclesToggleText.textContent = 'Seleccionar vehículo(s)';
    } else {
      fVehiclesSelectedList.innerHTML = selectedVehicles.map(v => `
        <span class="px-3 py-1 bg-green-600/20 dark:bg-green-600/20 theme-light:bg-green-50 text-green-400 dark:text-green-400 theme-light:text-green-600 rounded-lg text-sm font-medium border border-green-600/30 dark:border-green-600/30 theme-light:border-green-300">
          ${v.make} ${v.line} ${v.displacement || ''}
        </span>
      `).join('');
      if (fVehiclesToggleText) {
        fVehiclesToggleText.textContent = `${selectedVehicles.length} vehículo(s) seleccionado(s)`;
      }
    }
  }
  
  function updateLinesVisualSelection() {
    // Actualizar el estado visual de todas las tarjetas según selectedVehicles
    if (!fLinesGrid) return;
    
    fLinesGrid.querySelectorAll('[data-line-key]').forEach(card => {
      const vehicleId = card.dataset.vehicleId;
      if (!vehicleId) return; // Solo actualizar tarjetas con un vehículo único
      
      const isSelected = selectedVehicles.some(sv => sv._id === vehicleId);
      
      if (isSelected) {
        card.style.borderColor = 'var(--primary, #3b82f6)';
        card.style.background = 'rgba(59, 130, 246, 0.1)';
      } else {
        card.style.borderColor = 'var(--border)';
        card.style.background = 'var(--card-alt)';
      }
      
      // Actualizar checkbox si existe
      const checkbox = card.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = isSelected;
      }
    });
  }
  
  function selectVehicle(vehicle) {
    // Mantener compatibilidad con código existente
    selectedVehicles = [vehicle];
    selectedVehicle = vehicle;
    updateSelectedVehiclesDisplay();
  }

  function clearFilters(){ 
    selectedVehicle = null;
    selectedVehicles = [];
    activeTabVehicleId = null;
    selectedMake = null;
    fVehicleId.value = '';
    
    // Limpiar nuevo sistema
    hideVehiclesMenu();
    if (fMakeSelected) fMakeSelected.classList.add('hidden');
    if (fMakesToggleText) fMakesToggleText.textContent = 'Seleccionar marca';
    if (fMakesFilter) fMakesFilter.value = '';
    filteredMakes = [...allMakes];
    renderMakesGrid();
    
    // Limpiar sistema legacy
    const fMakeSelect = $('#pf-make-select');
    if (fMakeSelect) fMakeSelect.value = '';
    fVehicleSelected.style.display = 'none';
    fLinesContainer.style.display = 'none';
    // Mostrar barra de acciones siempre para permitir crear precios generales
    if (actionsBar) actionsBar.style.display = 'flex';
    if (vehicleTabsContainer) {
      vehicleTabsContainer.style.display = 'none';
      vehicleTabsContainer.innerHTML = '';
    }
    const filtersEl = $('#pe-filters');
    if (filtersEl) filtersEl.style.display = 'flex'; // Mostrar filtros para precios generales
    currentPage = 1;
    currentFilters = { name: '', type: '' };
    const filterName = $('#pe-filter-name');
    const filterType = $('#pe-filter-type');
    if (filterName) filterName.value = '';
    if (filterType) filterType.value = '';
    // Cargar precios generales automáticamente
    renderTableHeader();
    loadPrices();
  }

  // Event listeners para el nuevo sistema de menús colapsables
  
  // Toggle menú de marcas
  if (fMakesToggle) {
    fMakesToggle.addEventListener('click', () => {
      const isHidden = fMakesCollapsible?.classList.contains('hidden');
      if (isHidden) {
        expandMakesMenu();
      } else {
        collapseMakesMenu();
      }
    });
  }

  // Botón "Cambiar" marca
  if (fMakeChange) {
    fMakeChange.addEventListener('click', () => {
      expandMakesMenu();
    });
  }

  // Filtro de marcas
  if (fMakesFilter) {
    let makesFilterTimeout = null;
    fMakesFilter.addEventListener('input', (e) => {
      clearTimeout(makesFilterTimeout);
      makesFilterTimeout = setTimeout(() => {
        const query = e.target.value.trim().toLowerCase();
        if (query === '') {
          filteredMakes = [...allMakes];
        } else {
          filteredMakes = allMakes.filter(make => 
            make.toLowerCase().includes(query)
          );
        }
        renderMakesGrid();
      }, 300);
    });
  }

  // Toggle menú de vehículos
  if (fVehiclesToggle) {
    fVehiclesToggle.addEventListener('click', () => {
      const isHidden = fVehiclesCollapsible?.classList.contains('hidden');
      if (isHidden) {
        expandVehiclesMenu();
      } else {
        collapseVehiclesMenu();
      }
    });
  }

  // Botón "Cambiar" vehículos
  if (fVehiclesChange) {
    fVehiclesChange.addEventListener('click', () => {
      expandVehiclesMenu();
    });
  }

  // Filtro de vehículos
  if (fVehiclesFilter) {
    let vehiclesFilterTimeout = null;
    fVehiclesFilter.addEventListener('input', (e) => {
      clearTimeout(vehiclesFilterTimeout);
      vehiclesFilterTimeout = setTimeout(() => {
        const query = e.target.value.trim().toLowerCase();
        if (query === '') {
          filteredVehicles = [...allVehiclesForMake];
        } else {
          filteredVehicles = allVehiclesForMake.filter(v => {
            const make = (v.make || '').toLowerCase();
            const line = (v.line || '').toLowerCase();
            const displacement = (v.displacement || '').toLowerCase();
            const modelYear = (v.modelYear || '').toLowerCase();
            return make.includes(query) || line.includes(query) || 
                   displacement.includes(query) || modelYear.includes(query);
          });
        }
        renderVehiclesGrid();
      }, 300);
    });
  }

  // Eventos UI legacy (mantener para compatibilidad)
  const fMakeSelect = $('#pf-make-select');
  if (fMakeSelect) {
    fMakeSelect.addEventListener('change', (e) => {
      selectedMake = e.target.value;
      if (selectedMake) {
        loadLinesForMake(selectedMake);
      } else {
        fLinesContainer.style.display = 'none';
        clearFilters();
      }
    });
  }

  // Cargar marcas al iniciar
  loadMakes();
  // Cargar precios generales al iniciar si no hay vehículo seleccionado
  loadGeneralPricesOnInit();

  // Filtros
  const filterName = $('#pe-filter-name');
  const filterType = $('#pe-filter-type');
  let filterTimeout = null;
  
  if (filterName) {
    filterName.addEventListener('input', (e) => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        currentFilters.name = e.target.value.trim();
        currentPage = 1;
        loadPrices();
      }, 500);
    });
  }
  
  if (filterType) {
    filterType.addEventListener('change', (e) => {
      currentFilters.type = e.target.value;
      currentPage = 1;
      loadPrices();
    });
  }
  
  if (fSearch) fSearch.onclick = ()=> { 
    currentFilters.name = filterName?.value.trim() || '';
    currentFilters.type = filterType?.value || '';
    currentPage = 1; 
    loadPrices(); 
  };
  if (fClear) fClear.onclick  = ()=> { clearFilters(); };
  
  // Modal para crear/editar servicio/producto
  function openCreateModal(type, existingPrice = null, isGeneral = false, isInversion = false) {
    // Si es precio general o inversión, no requiere vehículo
    const isInversionPrice = isInversion || type === 'inversion';
    const isExistingGeneral = !!(existingPrice && !existingPrice.vehicleId && existingPrice.type !== 'inversion');
    const forceGeneralPrices = true;
    const isGeneralEffective = !isInversionPrice && (forceGeneralPrices || Boolean(isGeneral) || isExistingGeneral);
    // Si no es precio general ni inversión, verificar que haya al menos un vehículo seleccionado
    if (!isGeneralEffective && !isInversionPrice && !existingPrice?.vehicleId && !selectedVehicle && selectedVehicles.length === 0) {
      return alert('Selecciona un vehículo primero o crea un precio general');
    }
    const body=$('#modalBody'), closeBtn=$('#modalClose');
    
    const isEdit = !!existingPrice;
    const isProduct = type === 'product' && !isInversionPrice;
    const isCombo = type === 'combo' && !isInversionPrice;
    const isService = type === 'service' && !isInversionPrice;
    const linkedItem = existingPrice?.itemId;
    const comboProducts = existingPrice?.comboProducts || [];
    
    // Determinar si es precio general o inversión
    // IMPORTANTE: isInversionPrice y isGeneralPrice son mutuamente excluyentes
    const isGeneralPrice = !isInversionPrice;
    
    // Determinar qué vehículos usar para la creación
    // Si es precio general, no usar vehículos
    // Si hay múltiples vehículos seleccionados, usar todos para creación en bulk
    // Si hay un solo vehículo, usar ese
    const vehiclesForCreation = isGeneralPrice ? [] : (selectedVehicles.length > 0 ? selectedVehicles : (selectedVehicle ? [selectedVehicle] : []));
    const isBulkCreation = vehiclesForCreation.length > 1;
    
    const node = document.createElement('div');
    node.className = 'bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white/90 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6';
    const modalTitleKind = isInversionPrice ? 'precio de inversión' : (type === 'combo' ? 'combo' : (type === 'service' ? 'servicio' : 'producto'));
    node.innerHTML = `
      <div class="-mx-6 -mt-6 mb-6 px-5 py-4 rounded-t-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white shadow-lg border-b border-white/10">
        <p class="text-xs font-semibold uppercase tracking-wider text-white/80 mb-1">💰 Lista de precios</p>
        <h3 class="text-xl font-bold">${isEdit ? '✏️ Editar' : '✨ Crear'} ${modalTitleKind}</h3>
      </div>
      ${isInversionPrice ? `
      <div class="mb-4 p-3 bg-orange-500/10 dark:bg-orange-500/10 theme-light:bg-orange-50 rounded-lg border-2 border-orange-500 dark:border-orange-500 theme-light:border-orange-400">
        <div class="text-sm font-semibold text-orange-400 dark:text-orange-400 theme-light:text-orange-700 mb-2">💼 Precio de Inversión</div>
        <div class="text-xs text-white dark:text-white theme-light:text-slate-900 mb-2">Este precio se aplicará por defecto al cerrar ventas para calcular la inversión contra el cobro total y determinar la ganancia neta después de inversión.</div>
      </div>
      ` : isGeneralPrice ? `
      <div class="mb-4 p-3 bg-purple-500/10 dark:bg-purple-500/10 theme-light:bg-purple-50 rounded-lg border-2 border-purple-500 dark:border-purple-500 theme-light:border-purple-400">
        <div class="text-sm font-semibold text-purple-400 dark:text-purple-400 theme-light:text-purple-700 mb-2">🌐 Precio General</div>
        <div class="text-xs text-white dark:text-white theme-light:text-slate-900 mb-2">Este ${type === 'combo' ? 'combo' : (type === 'service' ? 'servicio' : 'producto')} estará disponible para todos los vehículos y se puede usar sin seleccionar un vehículo específico.</div>
      </div>
      ` : isBulkCreation ? `
      <div class="mb-4 p-3 bg-blue-500/10 dark:bg-blue-500/10 theme-light:bg-blue-50 rounded-lg border-2 border-blue-500 dark:border-blue-500 theme-light:border-blue-400">
        <div class="text-sm font-semibold text-blue-400 dark:text-blue-400 theme-light:text-blue-700 mb-2">📋 Creación en bulk para ${vehiclesForCreation.length} vehículos</div>
        <div class="text-xs text-white dark:text-white theme-light:text-slate-900 mb-2">Se creará este ${type === 'combo' ? 'combo' : (type === 'service' ? 'servicio' : 'producto')} para todos los vehículos seleccionados:</div>
        <div class="max-h-30 overflow-y-auto p-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white rounded border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 custom-scrollbar">
          <div class="flex flex-col gap-1">
            ${vehiclesForCreation.map((v, idx) => `
              <div class="text-xs text-white dark:text-white theme-light:text-slate-900 p-1">${idx + 1}. ${v.make} ${v.line} ${v.displacement}${v.modelYear ? ` (Modelo ${v.modelYear})` : ''}</div>
            `).join('')}
          </div>
        </div>
      </div>
      ` : `
      <p class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-4">
        Vehículo: <strong class="text-white dark:text-white theme-light:text-slate-900">${vehiclesForCreation[0] ? `${vehiclesForCreation[0].make} ${vehiclesForCreation[0].line}` : 'No seleccionado'}</strong>
      </p>
      `}
      <div class="mb-4">
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Nombre</label>
        <input id="pe-modal-name" placeholder="${isInversionPrice ? 'Ej: Inversión en repuestos' : (type === 'combo' ? 'Ej: Combo mantenimiento completo' : (type === 'service' ? 'Ej: Cambio de aceite' : 'Ej: Filtro de aire'))}" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" value="${existingPrice?.name || ''}" />
      </div>
      ${isInversionPrice ? `
      <div class="mb-4">
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Precio de inversión</label>
        <input id="pe-modal-price" type="number" step="0.01" min="0" placeholder="Ej: 50000" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" value="${existingPrice?.total || ''}" />
      </div>
      ` : ''}
      ${isCombo ? `
      <div class="mb-4">
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-3">Productos del combo</label>
        <div id="pe-modal-combo-products" class="space-y-3 mb-3">
          ${comboProducts.map((cp, idx) => `
            <div class="combo-product-item relative p-4 bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-slate-100 rounded-lg border ${cp.isOpenSlot ? 'border-l-4 border-l-orange-500 dark:border-l-orange-500 theme-light:border-l-orange-400 border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300' : 'border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300'} transition-all duration-200" data-index="${idx}">
              <!-- Header: Nombre del producto y botón eliminar -->
              <div class="flex items-start justify-between gap-3 mb-3">
                <div class="flex-1">
                  <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Nombre del producto</label>
                  <input type="text" class="combo-product-name w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm" placeholder="Ej: Filtro de aceite" value="${cp.name || ''}" />
                </div>
                <button class="combo-product-remove mt-6 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 text-sm font-semibold flex-shrink-0" title="Eliminar producto">🗑️</button>
              </div>
              
              <!-- Información básica: Cantidad y Precio -->
              <div class="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Cantidad</label>
                  <input type="number" class="combo-product-qty w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm" placeholder="1" value="${cp.qty || 1}" min="1" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Precio unitario</label>
                  <input type="number" class="combo-product-price w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm" placeholder="0" step="0.01" value="${cp.unitPrice || 0}" />
                </div>
              </div>
              
              <!-- Toggle Slot Abierto -->
              <div class="mb-3 p-3 bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-slate-200 rounded-lg border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">
                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="relative">
                    <input type="checkbox" class="combo-product-open-slot sr-only peer" ${cp.isOpenSlot ? 'checked' : ''} />
                    <div class="w-11 h-6 bg-slate-600 dark:bg-slate-600 theme-light:bg-slate-400 peer-checked:bg-orange-500 dark:peer-checked:bg-orange-500 theme-light:peer-checked:bg-orange-400 rounded-full transition-colors duration-200"></div>
                    <div class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 peer-checked:translate-x-5 shadow-md"></div>
                  </div>
                  <div class="flex-1">
                    <div class="text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">Slot abierto</div>
                    <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Se completa con QR al crear la venta</div>
                  </div>
                  ${cp.isOpenSlot ? '<span class="px-2 py-1 bg-orange-500/20 dark:bg-orange-500/20 theme-light:bg-orange-100 text-orange-400 dark:text-orange-400 theme-light:text-orange-700 text-xs font-semibold rounded">Activo</span>' : ''}
                </label>
              </div>
              
              <!-- Búsqueda de inventario (solo si NO es slot abierto) -->
              <div class="combo-product-item-section ${cp.isOpenSlot ? 'hidden' : ''}">
                <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Vincular con inventario (opcional)</label>
                <div class="flex gap-2 mb-2">
                  <input type="text" class="combo-product-item-search flex-1 px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm" placeholder="Buscar por SKU o nombre..." value="${cp.itemId ? (cp.itemId.name || cp.itemId.sku || '') : ''}" />
                  <button class="combo-product-item-qr px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 text-sm">📷 QR</button>
                </div>
                <div class="combo-product-item-selected mt-2 p-2 bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 text-xs ${cp.itemId ? '' : 'hidden'}">
                  ${cp.itemId ? `<div class="flex justify-between items-center">
                    <div>
                      <strong class="text-white dark:text-white theme-light:text-slate-900">${cp.itemId.name || cp.itemId.sku}</strong>
                      <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-0.5">
                        <span class="font-semibold">SKU:</span> ${cp.itemId.sku} | <span class="font-semibold">Stock:</span> ${cp.itemId.stock || 0}
                      </div>
                    </div>
                    <button class="combo-product-item-remove-btn px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors duration-200">✕</button>
                  </div>` : ''}
                </div>
              </div>
              <input type="hidden" class="combo-product-item-id" value="${cp.itemId?._id || ''}" />
            </div>
          `).join('')}
        </div>
        <button type="button" id="pe-modal-add-combo-product" class="pr-btn-secondary w-full px-4 py-2.5 text-sm">➕ Agregar producto</button>
      </div>
      ` : ''}
      ${isProduct ? `
      <div class="mb-4">
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Vincular con item del inventario (opcional)</label>
        <div class="flex gap-2 mb-2">
          <input id="pe-modal-item-search" placeholder="Buscar por SKU o nombre..." class="flex-1 px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
          <button id="pe-modal-item-qr" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">📷 QR</button>
        </div>
        <div id="pe-modal-item-dropdown" class="hidden relative max-h-48 overflow-y-auto border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white mt-1 custom-scrollbar"></div>
        <div id="pe-modal-item-selected" class="mt-2 p-2 bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-slate-100 rounded-lg text-xs text-white dark:text-white theme-light:text-slate-900 ${linkedItem ? '' : 'hidden'}">
          ${linkedItem ? `<div class="flex justify-between items-center">
            <div>
              <strong>${linkedItem.name || linkedItem.sku}</strong><br>
              <span class="text-xs"><strong class="font-bold">SKU:</strong> <strong class="font-bold">${linkedItem.sku}</strong> | Stock: ${linkedItem.stock || 0}</span>
            </div>
            <button id="pe-modal-item-remove" class="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors duration-200">✕</button>
          </div>` : ''}
        </div>
        <input type="hidden" id="pe-modal-item-id" value="${linkedItem?._id || ''}" />
      </div>
      ` : ''}
      ${!isCombo ? `
      <div class="mb-4">
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Precio</label>
        <input id="pe-modal-price" type="number" step="0.01" placeholder="0" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" value="${existingPrice?.total || ''}" />
      </div>
      ` : `
      <div class="mb-4">
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Precio total del combo</label>
        <input id="pe-modal-price" type="number" step="0.01" placeholder="0 (se calcula automáticamente)" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" value="${existingPrice?.total || ''}" />
        <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">El precio se calcula automáticamente desde los productos, o puedes establecerlo manualmente.</p>
      </div>
      `}
      ${!isInversionPrice ? `
      <div class="mb-4 p-3 bg-orange-500/10 dark:bg-orange-500/10 theme-light:bg-orange-50 rounded-lg border border-orange-500/30 dark:border-orange-500/30 theme-light:border-orange-300">
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-700 mb-2">Valor inversión (opcional)</label>
        <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-3">Se usa para autocompletar inversión al cerrar la venta (se suma por ítems).</p>
        <input id="pe-modal-investment-value" type="number" min="0" step="1" placeholder="0" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200" value="${existingPrice?.investmentValue || ''}" />
      </div>
      ` : ''}
      ${isCombo || isProduct || isService ? `
      <div class="mb-4 p-3 bg-blue-900/20 dark:bg-blue-900/20 theme-light:bg-blue-50 rounded-lg border border-blue-700/30 dark:border-blue-700/30 theme-light:border-blue-300">
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">Mano de obra (opcional)</label>
        <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-3">Estos valores se usarán automáticamente al cerrar la venta para agregar participación técnica.</p>
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Valor de mano de obra</label>
            <input id="pe-modal-labor-value" type="number" min="0" step="1" placeholder="0" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" value="${existingPrice?.laborValue || ''}" />
          </div>
          <div class="flex-1">
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Tipo de mano de obra</label>
            <select id="pe-modal-labor-kind" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200">
              <option value="">-- Seleccione tipo --</option>
            </select>
          </div>
        </div>
      </div>
      ` : ''}
      <div class="mb-4 p-3 bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-slate-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">Rango de años (opcional)</label>
        <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">Solo aplicar este precio si el año del vehículo está en el rango especificado. Déjalo vacío para aplicar a todos los años.</p>
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Desde</label>
            <input id="pe-modal-year-from" type="number" min="1900" max="2100" placeholder="Ej: 2018" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" value="${existingPrice?.yearFrom || ''}" />
          </div>
          <div class="flex-1">
            <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Hasta</label>
            <input id="pe-modal-year-to" type="number" min="1900" max="2100" placeholder="Ej: 2022" class="w-full px-4 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" value="${existingPrice?.yearTo || ''}" />
          </div>
        </div>
      </div>
      <div id="pe-modal-msg" class="mb-4 text-sm text-white dark:text-white theme-light:text-slate-900"></div>
      <div class="flex flex-wrap gap-2 pt-2">
        <button type="button" id="pe-modal-save" class="pr-main-btn flex-1 min-w-[140px] px-4 py-2.5 text-sm">💾 ${isEdit ? 'Actualizar' : (isBulkCreation ? `Guardar para ${vehiclesForCreation.length} vehículos` : 'Guardar')}</button>
        <button type="button" id="pe-modal-cancel" class="pr-btn-secondary flex-1 min-w-[120px] px-4 py-2.5 text-sm">Cancelar</button>
      </div>
    `;
    openModal(node);
    
    const nameInput = node.querySelector('#pe-modal-name');
    const priceInput = node.querySelector('#pe-modal-price');
    const msgEl = node.querySelector('#pe-modal-msg');
    const saveBtn = node.querySelector('#pe-modal-save');
    const cancelBtn = node.querySelector('#pe-modal-cancel');
    let selectedItem = linkedItem ? { _id: linkedItem._id, sku: linkedItem.sku, name: linkedItem.name, stock: linkedItem.stock } : null;
    
    // Cargar laborKinds en el select si existe
    if (isCombo || isProduct || isService) {
      const laborKindSelect = node.querySelector('#pe-modal-labor-kind');
      if (laborKindSelect) {
        async function loadLaborKinds() {
          try {
            const response = await API.get('/api/v1/company/tech-config');
            const config = response?.config || response || { laborKinds: [] };
            const laborKinds = config?.laborKinds || [];
            const laborKindsList = laborKinds.map(k => {
              const name = typeof k === 'string' ? k : (k?.name || '');
              return name;
            }).filter(k => k && k.trim() !== '');
            
            laborKindSelect.innerHTML = '<option value="">-- Seleccione tipo --</option>' + 
              laborKindsList.map(k => `<option value="${k}" ${existingPrice?.laborKind === k ? 'selected' : ''}>${k}</option>`).join('');
          } catch (err) {
            console.error('Error cargando laborKinds:', err);
          }
        }
        loadLaborKinds();
      }
    }
    
    // Funcionalidad de búsqueda de items (solo para productos)
    if (isProduct) {
      const itemSearch = node.querySelector('#pe-modal-item-search');
      const itemDropdown = node.querySelector('#pe-modal-item-dropdown');
      const itemSelected = node.querySelector('#pe-modal-item-selected');
      const itemIdInput = node.querySelector('#pe-modal-item-id');
      const itemQrBtn = node.querySelector('#pe-modal-item-qr');
      const itemRemoveBtn = node.querySelector('#pe-modal-item-remove');
      let searchTimeout = null;
      
      async function searchItems(query) {
        if (!query || query.trim().length === 0) {
          itemDropdown.style.display = 'none';
          return;
        }
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 1) {
          itemDropdown.style.display = 'none';
          return;
        }
        
        try {
          let items = [];
          try {
            // Buscar primero por SKU exacto (case insensitive)
            items = await API.inventory.itemsList({ sku: trimmedQuery.toUpperCase() });
            // Si no encuentra por SKU exacto, buscar por SKU parcial
            if (items.length === 0) {
              const allItems = await API.inventory.itemsList({});
              items = allItems.filter(item => 
                item.sku && item.sku.toUpperCase().includes(trimmedQuery.toUpperCase())
              );
            }
            // Si aún no encuentra, buscar por nombre
            if (items.length === 0) {
              items = await API.inventory.itemsList({ name: trimmedQuery });
            }
          } catch (err) {
            console.error('Error al buscar items:', err);
          }
          if (!items || items.length === 0) {
            itemDropdown.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px;">No se encontraron items</div>';
            itemDropdown.style.display = 'block';
            return;
          }
          
          // Si hay exactamente un resultado y coincide exactamente con el SKU, seleccionarlo automáticamente
          if (items.length === 1 && items[0].sku && items[0].sku.toUpperCase() === trimmedQuery.toUpperCase()) {
            const item = items[0];
            selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
            itemIdInput.value = item._id;
            itemSearch.value = `${item.sku} - ${item.name}`;
            itemDropdown.style.display = 'none';
            itemSelected.innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <strong>${item.name}</strong><br>
                  <span style="font-size:12px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span>
                </div>
                <button id="pe-modal-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
              </div>
            `;
            itemSelected.style.display = 'block';
            const newRemoveBtn = itemSelected.querySelector('#pe-modal-item-remove');
            if (newRemoveBtn) {
              newRemoveBtn.onclick = () => {
                selectedItem = null;
                itemIdInput.value = '';
                itemSearch.value = '';
                itemSelected.classList.add('hidden');
              };
            }
            // Establecer el nombre del producto con el nombre del item del inventario
            if (nameInput && item.name) {
              nameInput.value = item.name;
            }
            // NO establecer el precio automáticamente - se deja a discreción del usuario
            return;
          }
          // Limpiar dropdown antes de agregar nuevos resultados
          itemDropdown.innerHTML = '';
          itemDropdown.replaceChildren(...items.map(item => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);';
            div.innerHTML = `
              <div style="font-weight:600;">${item.name || item.sku}</div>
              <div style="font-size:13px;color:var(--text);margin-top:4px;"><strong style="font-size:14px;font-weight:700;">SKU:</strong> <strong style="font-size:14px;font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0} | Precio: $${(item.salePrice || 0).toLocaleString()}</div>
            `;
            div.addEventListener('click', () => {
              selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
              itemIdInput.value = item._id;
              itemSearch.value = `${item.sku} - ${item.name}`;
              itemDropdown.style.display = 'none';
              itemSelected.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <strong>${item.name}</strong><br>
                    <span class="muted">SKU: ${item.sku} | Stock: ${item.stock || 0}</span>
                  </div>
                  <button id="pe-modal-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
                </div>
              `;
              itemSelected.style.display = 'block';
              const newRemoveBtn = itemSelected.querySelector('#pe-modal-item-remove');
              if (newRemoveBtn) {
                newRemoveBtn.onclick = () => {
                  selectedItem = null;
                  itemIdInput.value = '';
                  itemSearch.value = '';
                  itemSelected.classList.add('hidden');
                };
              }
              // Establecer el nombre del producto con el nombre del item del inventario
              if (nameInput && item.name) {
                nameInput.value = item.name;
              }
              // NO establecer el precio automáticamente - se deja a discreción del usuario
            });
            div.addEventListener('mouseenter', () => {
              div.style.background = 'var(--hover, rgba(0,0,0,0.05))';
            });
            div.addEventListener('mouseleave', () => {
              div.style.background = '';
            });
            return div;
          }));
          itemDropdown.style.display = 'block';
        } catch (err) {
          console.error('Error al buscar items:', err);
        }
      }
      
      itemSearch.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          searchItems(e.target.value);
        }, 300);
      });
      
      // Permitir seleccionar con Enter si hay un solo resultado
      itemSearch.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = itemSearch.value.trim();
          if (!query) return;
          
          // Si ya hay un item seleccionado, no hacer nada
          if (selectedItem) return;
          
          // Buscar items
          try {
            let items = [];
            items = await API.inventory.itemsList({ sku: query.toUpperCase() });
            if (items.length === 0) {
              const allItems = await API.inventory.itemsList({});
              items = allItems.filter(item => 
                item.sku && item.sku.toUpperCase().includes(query.toUpperCase())
              );
            }
            if (items.length === 0) {
              items = await API.inventory.itemsList({ name: query });
            }
            
            if (items && items.length > 0) {
              // Si hay un solo resultado o el primero coincide exactamente, seleccionarlo
              const item = items.find(i => i.sku && i.sku.toUpperCase() === query.toUpperCase()) || items[0];
              selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
              itemIdInput.value = item._id;
              itemSearch.value = `${item.sku} - ${item.name}`;
              itemDropdown.style.display = 'none';
              itemSelected.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <strong>${item.name}</strong><br>
                    <span class="muted">SKU: ${item.sku} | Stock: ${item.stock || 0}</span>
                  </div>
                  <button id="pe-modal-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
                </div>
              `;
              itemSelected.style.display = 'block';
              const newRemoveBtn = itemSelected.querySelector('#pe-modal-item-remove');
              if (newRemoveBtn) {
                newRemoveBtn.onclick = () => {
                  selectedItem = null;
                  itemIdInput.value = '';
                  itemSearch.value = '';
                  itemSelected.classList.add('hidden');
                };
              }
              // Establecer el nombre del producto con el nombre del item del inventario
              if (nameInput && item.name) {
                nameInput.value = item.name;
              }
              // NO establecer el precio automáticamente - se deja a discreción del usuario
              // Limpiar dropdown si existe
              itemDropdown.style.display = 'none';
            }
          } catch (err) {
            console.error('Error al buscar item:', err);
          }
        }
      });
      
      itemQrBtn.onclick = async () => {
        try {
          const qrCode = await openQRForItem();
          if (!qrCode) return;
          
          const normalizedCode = String(qrCode || '').trim().toUpperCase();
          let item = null;
          
          // Intentar parsear como formato IT:companyId:itemId:sku
          if (normalizedCode.startsWith('IT:')) {
            const parts = qrCode.split(':').map(p => p.trim()).filter(Boolean);
            const itemId = parts.length >= 3 ? parts[2] : null;
            if (itemId) {
              try {
                const allItems = await API.inventory.itemsList({});
                item = allItems.find(i => String(i._id) === itemId);
              } catch (err) {
                console.error('Error al buscar por itemId:', err);
              }
            }
          }
          
          // Si no se encontró por itemId, buscar por SKU exacto
          if (!item) {
            try {
              const items = await API.inventory.itemsList({ sku: normalizedCode });
              if (items && items.length > 0) {
                item = items[0];
              }
            } catch (err) {
              console.error('Error al buscar por SKU exacto:', err);
            }
          }
          
          // Si aún no se encontró, buscar por SKU parcial (case insensitive)
          if (!item) {
            try {
              const allItems = await API.inventory.itemsList({});
              item = allItems.find(i => 
                i.sku && i.sku.toUpperCase() === normalizedCode
              );
            } catch (err) {
              console.error('Error al buscar por SKU parcial:', err);
            }
          }
          
          // Si aún no se encontró, intentar buscar si el código es un ObjectId de MongoDB
          if (!item) {
            const objectIdMatch = normalizedCode.match(/^[A-F0-9]{24}$/);
            if (objectIdMatch) {
              try {
                const allItems = await API.inventory.itemsList({});
                item = allItems.find(i => String(i._id).toUpperCase() === normalizedCode);
              } catch (err) {
                console.error('Error al buscar por ObjectId:', err);
              }
            }
          }
          
          if (item) {
            selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
            itemIdInput.value = item._id;
            itemSearch.value = `${item.sku} - ${item.name}`;
            itemDropdown.style.display = 'none';
            itemSelected.innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <strong>${item.name}</strong><br>
                  <span style="font-size:12px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span>
                </div>
                <button id="pe-modal-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
              </div>
            `;
            itemSelected.style.display = 'block';
            const newRemoveBtn = itemSelected.querySelector('#pe-modal-item-remove');
            if (newRemoveBtn) {
              newRemoveBtn.onclick = () => {
                selectedItem = null;
                itemIdInput.value = '';
                itemSearch.value = '';
                itemSelected.classList.add('hidden');
              };
            }
            // Establecer el nombre del producto con el nombre del item del inventario
            if (nameInput && item.name) {
              nameInput.value = item.name;
            }
            // NO establecer el precio automáticamente - se deja a discreción del usuario
          } else {
            alert(`Item no encontrado para el código: ${qrCode}`);
          }
        } catch (err) {
          // Ignorar error si el usuario canceló
          if (err?.message !== 'Cancelado por el usuario') {
            console.error('Error al leer QR:', err);
            alert('Error al leer QR: ' + (err?.message || 'Error desconocido'));
          }
        }
      };
      
      if (itemRemoveBtn) {
        itemRemoveBtn.onclick = () => {
          selectedItem = null;
          itemIdInput.value = '';
          itemSearch.value = '';
          itemSelected.style.display = 'none';
        };
      }
      
      // Cerrar dropdown al hacer click fuera
      document.addEventListener('click', (e) => {
        if (itemSearch && itemDropdown && !itemSearch.contains(e.target) && !itemDropdown.contains(e.target)) {
          itemDropdown.style.display = 'none';
        }
      });
    }
    
    // Funcionalidad para combos
    let comboProductsContainer = null;
    if (isCombo) {
      comboProductsContainer = node.querySelector('#pe-modal-combo-products');
      if (!comboProductsContainer) {
        console.error('Error: No se encontró el elemento #pe-modal-combo-products en el DOM');
        console.error('isCombo:', isCombo, 'node:', node);
      }
      const addComboProductBtn = node.querySelector('#pe-modal-add-combo-product');
      
      function addComboProductRow(productData = {}) {
        const isOpenSlot = Boolean(productData.isOpenSlot);
        const row = document.createElement('div');
        row.className = `combo-product-item relative p-4 bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-slate-100 rounded-lg border ${isOpenSlot ? 'border-l-4 border-l-orange-500 dark:border-l-orange-500 theme-light:border-l-orange-400 border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300' : 'border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300'} transition-all duration-200`;
        row.setAttribute('data-index', comboProductsContainer.children.length.toString());
        row.innerHTML = `
          <!-- Header: Nombre del producto y botón eliminar -->
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex-1">
              <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Nombre del producto</label>
              <input type="text" class="combo-product-name w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm" placeholder="Ej: Filtro de aceite" value="${productData.name || ''}" />
            </div>
            <button class="combo-product-remove mt-6 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 text-sm font-semibold flex-shrink-0" title="Eliminar producto">🗑️</button>
          </div>
          
          <!-- Información básica: Cantidad y Precio -->
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Cantidad</label>
              <input type="number" class="combo-product-qty w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm" placeholder="1" value="${productData.qty || 1}" min="1" />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Precio unitario</label>
              <input type="number" class="combo-product-price w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm" placeholder="0" step="0.01" value="${productData.unitPrice || 0}" />
            </div>
          </div>
          
          <!-- Toggle Slot Abierto -->
          <div class="mb-3 p-3 bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-slate-200 rounded-lg border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">
            <label class="flex items-center gap-3 cursor-pointer group">
              <div class="relative">
                <input type="checkbox" class="combo-product-open-slot sr-only peer" ${isOpenSlot ? 'checked' : ''} />
                <div class="w-11 h-6 bg-slate-600 dark:bg-slate-600 theme-light:bg-slate-400 peer-checked:bg-orange-500 dark:peer-checked:bg-orange-500 theme-light:peer-checked:bg-orange-400 rounded-full transition-colors duration-200"></div>
                <div class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 peer-checked:translate-x-5 shadow-md"></div>
              </div>
              <div class="flex-1">
                <div class="text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">Slot abierto</div>
                <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Se completa con QR al crear la venta</div>
              </div>
              ${isOpenSlot ? '<span class="px-2 py-1 bg-orange-500/20 dark:bg-orange-500/20 theme-light:bg-orange-100 text-orange-400 dark:text-orange-400 theme-light:text-orange-700 text-xs font-semibold rounded">Activo</span>' : ''}
            </label>
          </div>
          
          <!-- Búsqueda de inventario (solo si NO es slot abierto) -->
          <div class="combo-product-item-section ${isOpenSlot ? 'hidden' : ''}">
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1.5">Vincular con inventario (opcional)</label>
            <div class="flex gap-2 mb-2">
              <input type="text" class="combo-product-item-search flex-1 px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm" placeholder="Buscar por SKU o nombre..." value="${productData.itemId ? (productData.itemId.sku || '') + ' - ' + (productData.itemId.name || '') : ''}" />
              <button class="combo-product-item-qr px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 text-sm">📷 QR</button>
            </div>
            <div class="combo-product-item-selected mt-2 p-2 bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 text-xs hidden"></div>
          </div>
          <input type="hidden" class="combo-product-item-id" value="${productData.itemId?._id || ''}" />
        `;
        
        const removeBtn = row.querySelector('.combo-product-remove');
        removeBtn.onclick = () => {
          row.remove();
          updateComboTotal();
        };
        
        // Manejar el toggle de slot abierto
        const openSlotCheckbox = row.querySelector('.combo-product-open-slot');
        const itemSection = row.querySelector('.combo-product-item-section');
        const slotBadge = row.querySelector('label .flex-1 + span');
        
        if (openSlotCheckbox) {
          openSlotCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            if (isChecked) {
              itemSection.classList.add('hidden');
              // Actualizar borde izquierdo
              row.className = row.className.replace(/border-slate-700\/50|border-slate-300/g, '').trim();
              row.className += ' border-l-4 border-l-orange-500 dark:border-l-orange-500 theme-light:border-l-orange-400 border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300';
              // Agregar badge "Activo"
              if (!slotBadge || !slotBadge.textContent.includes('Activo')) {
                const badge = document.createElement('span');
                badge.className = 'px-2 py-1 bg-orange-500/20 dark:bg-orange-500/20 theme-light:bg-orange-100 text-orange-400 dark:text-orange-400 theme-light:text-orange-700 text-xs font-semibold rounded';
                badge.textContent = 'Activo';
                const label = row.querySelector('label');
                if (label && !label.querySelector('span:last-child')?.textContent.includes('Activo')) {
                  label.appendChild(badge);
                }
              }
              // Limpiar item seleccionado
              const itemIdInput = row.querySelector('.combo-product-item-id');
              const itemSearch = row.querySelector('.combo-product-item-search');
              const itemSelected = row.querySelector('.combo-product-item-selected');
              if (itemIdInput) itemIdInput.value = '';
              if (itemSearch) itemSearch.value = '';
              if (itemSelected) itemSelected.classList.add('hidden');
            } else {
              itemSection.classList.remove('hidden');
              // Remover borde izquierdo naranja
              row.className = row.className.replace(/border-l-4 border-l-orange-[^ ]+/g, '').trim();
              if (!row.className.includes('border-slate-700/50') && !row.className.includes('border-slate-300')) {
                row.className += ' border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300';
              }
              // Remover badge "Activo"
              const activeBadge = row.querySelector('label span:last-child');
              if (activeBadge && activeBadge.textContent.includes('Activo')) {
                activeBadge.remove();
              }
            }
            updateComboTotal();
          });
        }
        
        const itemSearch = row.querySelector('.combo-product-item-search');
        const itemSelected = row.querySelector('.combo-product-item-selected');
        const itemIdInput = row.querySelector('.combo-product-item-id');
        const itemQrBtn = row.querySelector('.combo-product-item-qr');
        let selectedComboItem = productData.itemId ? { _id: productData.itemId._id, sku: productData.itemId.sku, name: productData.itemId.name, stock: productData.itemId.stock, salePrice: productData.itemId.salePrice } : null;
        
        if (productData.itemId) {
          itemSearch.value = `${productData.itemId.sku || ''} - ${productData.itemId.name || ''}`;
          itemSelected.innerHTML = `
            <div class="flex justify-between items-center">
              <div>
                <strong class="text-white dark:text-white theme-light:text-slate-900">${productData.itemId.name || productData.itemId.sku}</strong>
                <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-0.5">
                  <span class="font-semibold">SKU:</span> ${productData.itemId.sku} | <span class="font-semibold">Stock:</span> ${productData.itemId.stock || 0}
                </div>
              </div>
              <button class="combo-product-item-remove-btn px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors duration-200">✕</button>
            </div>
          `;
          itemSelected.classList.remove('hidden');
        }
        
        let searchTimeout = null;
        async function searchComboItems(query) {
          if (!query || query.trim().length === 0) {
            // Limpiar dropdown si el query está vacío
            const existingDropdown = itemSearch.parentElement.querySelector('div[style*="position:absolute"]');
            if (existingDropdown) existingDropdown.remove();
            return;
          }
          const trimmedQuery = query.trim();
          if (trimmedQuery.length < 1) return;
          
          try {
            let items = [];
            try {
              // Buscar primero por SKU exacto (case insensitive)
              items = await API.inventory.itemsList({ sku: trimmedQuery.toUpperCase() });
              // Si no encuentra por SKU exacto, buscar por SKU parcial
              if (items.length === 0) {
                const allItems = await API.inventory.itemsList({});
                items = allItems.filter(item => 
                  item.sku && item.sku.toUpperCase().includes(trimmedQuery.toUpperCase())
                );
              }
              // Si aún no encuentra, buscar por nombre
              if (items.length === 0) {
                items = await API.inventory.itemsList({ name: trimmedQuery });
              }
            } catch (err) {
              console.error('Error al buscar items:', err);
            }
            if (!items || items.length === 0) {
            // Limpiar dropdown si no hay resultados
            const existingDropdown1 = itemSearch.parentElement.querySelector('div[style*="position:absolute"]');
            if (existingDropdown1) existingDropdown1.remove();
            return;
          }
          
          // Si hay exactamente un resultado y coincide exactamente con el SKU, seleccionarlo automáticamente
          if (items.length === 1 && items[0].sku && items[0].sku.toUpperCase() === trimmedQuery.toUpperCase()) {
            const item = items[0];
            selectedComboItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
            itemIdInput.value = item._id;
            itemSearch.value = `${item.sku} - ${item.name}`;
            itemSelected.innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div><strong>${item.name}</strong> <span style="font-size:12px;margin-left:8px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span></div>
                <button class="combo-product-item-remove-btn danger" style="padding:2px 6px;font-size:10px;">✕</button>
              </div>
            `;
            itemSelected.style.display = 'block';
            const removeBtn2 = itemSelected.querySelector('.combo-product-item-remove-btn');
            if (removeBtn2) {
              removeBtn2.onclick = () => {
                selectedComboItem = null;
                itemIdInput.value = '';
                itemSearch.value = '';
                itemSelected.classList.add('hidden');
              };
            }
            // Establecer el nombre del combo product con el nombre del item
            const nameInput = row.querySelector('.combo-product-name');
            if (nameInput && item.name) {
              nameInput.value = item.name;
            }
            // NO establecer el precio automáticamente - se deja a discreción del usuario
            updateComboTotal();
            // Limpiar dropdown
            const existingDropdown2 = itemSearch.parentElement.querySelector('div[style*="position:absolute"]');
            if (existingDropdown2) existingDropdown2.remove();
            return;
          }
            
            // Limpiar dropdown anterior si existe antes de crear uno nuevo
            const existingDropdown = itemSearch.parentElement.querySelector('div[style*="position:absolute"]');
            if (existingDropdown) existingDropdown.remove();
            
            // Crear dropdown temporal
            const dropdown = document.createElement('div');
            dropdown.style.cssText = 'position:absolute;z-index:1000;background:var(--card);border:1px solid var(--border);border-radius:6px;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.15);width:100%;margin-top:4px;';
            dropdown.replaceChildren(...items.map(item => {
              const div = document.createElement('div');
              div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);';
              div.innerHTML = `
                <div style="font-weight:600;">${item.name || item.sku}</div>
                <div style="font-size:13px;color:var(--text);margin-top:4px;"><strong style="font-size:14px;font-weight:700;">SKU:</strong> <strong style="font-size:14px;font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</div>
              `;
              div.addEventListener('click', () => {
                selectedComboItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
                itemIdInput.value = item._id;
                itemSearch.value = `${item.sku} - ${item.name}`;
                itemSelected.innerHTML = `
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div><strong>${item.name}</strong> <span style="font-size:12px;margin-left:8px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span></div>
                    <button class="combo-product-item-remove-btn danger" style="padding:2px 6px;font-size:10px;">✕</button>
                  </div>
                `;
                itemSelected.style.display = 'block';
                const removeBtn2 = itemSelected.querySelector('.combo-product-item-remove-btn');
                if (removeBtn2) {
                  removeBtn2.onclick = () => {
                    selectedComboItem = null;
                    itemIdInput.value = '';
                    itemSearch.value = '';
                    itemSelected.classList.add('hidden');
                  };
                }
                dropdown.remove();
                // Establecer el nombre del combo product con el nombre del item
                const nameInput = row.querySelector('.combo-product-name');
                if (nameInput && item.name) {
                  nameInput.value = item.name;
                }
                // NO establecer el precio automáticamente - se deja a discreción del usuario
                updateComboTotal();
              });
              div.addEventListener('mouseenter', () => { div.style.background = 'var(--hover, rgba(0,0,0,0.05))'; });
              div.addEventListener('mouseleave', () => { div.style.background = ''; });
              return div;
            }));
            
            // Posicionar dropdown
            const searchContainer = itemSearch.parentElement;
            searchContainer.style.position = 'relative';
            searchContainer.appendChild(dropdown);
            
            // Remover al hacer click fuera
            setTimeout(() => {
              document.addEventListener('click', function removeDropdown(e) {
                if (!searchContainer.contains(e.target)) {
                  dropdown.remove();
                  document.removeEventListener('click', removeDropdown);
                }
              }, { once: true });
            }, 100);
          } catch (err) {
            console.error('Error al buscar items:', err);
          }
        }
        
        itemSearch.addEventListener('input', (e) => {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(() => {
            searchComboItems(e.target.value);
          }, 300);
        });
        
        // Permitir seleccionar con Enter si hay un solo resultado
        itemSearch.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const query = itemSearch.value.trim();
            if (!query) return;
            
            // Si ya hay un item seleccionado, no hacer nada
            if (selectedComboItem) return;
            
            // Buscar items
            try {
              let items = [];
              items = await API.inventory.itemsList({ sku: query.toUpperCase() });
              if (items.length === 0) {
                const allItems = await API.inventory.itemsList({});
                items = allItems.filter(item => 
                  item.sku && item.sku.toUpperCase().includes(query.toUpperCase())
                );
              }
              if (items.length === 0) {
                items = await API.inventory.itemsList({ name: query });
              }
              
              if (items && items.length > 0) {
                // Si hay un solo resultado o el primero coincide exactamente, seleccionarlo
                const item = items.find(i => i.sku && i.sku.toUpperCase() === query.toUpperCase()) || items[0];
                selectedComboItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
                itemIdInput.value = item._id;
                itemSearch.value = `${item.sku} - ${item.name}`;
                itemSelected.innerHTML = `
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div><strong>${item.name}</strong> <span style="font-size:12px;margin-left:8px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span></div>
                    <button class="combo-product-item-remove-btn danger" style="padding:2px 6px;font-size:10px;">✕</button>
                  </div>
                `;
                itemSelected.style.display = 'block';
                const removeBtn2 = itemSelected.querySelector('.combo-product-item-remove-btn');
                if (removeBtn2) {
                  removeBtn2.onclick = () => {
                    selectedComboItem = null;
                    itemIdInput.value = '';
                    itemSearch.value = '';
                    itemSelected.classList.add('hidden');
                  };
                }
                // Establecer el nombre del combo product con el nombre del item
                const nameInput = row.querySelector('.combo-product-name');
                if (nameInput && item.name) {
                  nameInput.value = item.name;
                }
                // NO establecer el precio automáticamente - se deja a discreción del usuario
                updateComboTotal();
                // Limpiar dropdown si existe
                const existingDropdown = itemSearch.parentElement.querySelector('div[style*="position:absolute"]');
                if (existingDropdown) existingDropdown.remove();
              }
            } catch (err) {
              console.error('Error al buscar item:', err);
            }
          }
        });
        
        itemQrBtn.onclick = async () => {
          try {
            const qrCode = await openQRForItem();
            if (!qrCode) return;
            
            const normalizedCode = String(qrCode || '').trim().toUpperCase();
            let item = null;
            
            // Intentar parsear como formato IT:companyId:itemId:sku
            if (normalizedCode.startsWith('IT:')) {
              const parts = qrCode.split(':').map(p => p.trim()).filter(Boolean);
              const itemId = parts.length >= 3 ? parts[2] : null;
              if (itemId) {
                try {
                  const allItems = await API.inventory.itemsList({});
                  item = allItems.find(i => String(i._id) === itemId);
                } catch (err) {
                  console.error('Error al buscar por itemId:', err);
                }
              }
            }
            
            // Si no se encontró por itemId, buscar por SKU exacto
            if (!item) {
              try {
                const items = await API.inventory.itemsList({ sku: normalizedCode });
                if (items && items.length > 0) {
                  item = items[0];
                }
              } catch (err) {
                console.error('Error al buscar por SKU exacto:', err);
              }
            }
            
            // Si aún no se encontró, buscar por SKU parcial (case insensitive)
            if (!item) {
              try {
                const allItems = await API.inventory.itemsList({});
                item = allItems.find(i => 
                  i.sku && i.sku.toUpperCase() === normalizedCode
                );
              } catch (err) {
                console.error('Error al buscar por SKU parcial:', err);
              }
            }
            
            // Si aún no se encontró, intentar buscar si el código es un ObjectId de MongoDB
            if (!item) {
              const objectIdMatch = normalizedCode.match(/^[A-F0-9]{24}$/);
              if (objectIdMatch) {
                try {
                  const allItems = await API.inventory.itemsList({});
                  item = allItems.find(i => String(i._id).toUpperCase() === normalizedCode);
                } catch (err) {
                  console.error('Error al buscar por ObjectId:', err);
                }
              }
            }
            
            if (item) {
              selectedComboItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
              itemIdInput.value = item._id;
              itemSearch.value = `${item.sku} - ${item.name}`;
            itemSelected.innerHTML = `
              <div class="flex justify-between items-center">
                <div>
                  <strong class="text-white dark:text-white theme-light:text-slate-900">${item.name}</strong>
                  <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-0.5">
                    <span class="font-semibold">SKU:</span> ${item.sku} | <span class="font-semibold">Stock:</span> ${item.stock || 0}
                  </div>
                </div>
                <button class="combo-product-item-remove-btn px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs transition-colors duration-200">✕</button>
              </div>
            `;
            itemSelected.classList.remove('hidden');
              const removeBtn2 = itemSelected.querySelector('.combo-product-item-remove-btn');
              if (removeBtn2) {
                removeBtn2.onclick = () => {
                  selectedComboItem = null;
                  itemIdInput.value = '';
                  itemSearch.value = '';
                  itemSelected.classList.add('hidden');
                };
              }
              // Establecer el nombre del combo product con el nombre del item
              const nameInput = row.querySelector('.combo-product-name');
              if (nameInput && item.name) {
                nameInput.value = item.name;
              }
              // NO establecer el precio automáticamente - se deja a discreción del usuario
              updateComboTotal();
            } else {
              alert(`Item no encontrado para el código: ${qrCode}`);
            }
          } catch (err) {
            // Ignorar error si el usuario canceló
            if (err?.message !== 'Cancelado por el usuario') {
              console.error('Error al leer QR:', err);
              alert('Error al leer QR: ' + (err?.message || 'Error desconocido'));
            }
          }
        };
        
        const removeItemBtn = itemSelected.querySelector('.combo-product-item-remove-btn');
        if (removeItemBtn) {
          removeItemBtn.onclick = () => {
            selectedComboItem = null;
            itemIdInput.value = '';
            itemSearch.value = '';
            itemSelected.classList.add('hidden');
          };
        }
        
        // Actualizar total cuando cambien precio o cantidad
        row.querySelector('.combo-product-price').addEventListener('input', updateComboTotal);
        row.querySelector('.combo-product-qty').addEventListener('input', updateComboTotal);
        
        if (comboProductsContainer) {
          comboProductsContainer.appendChild(row);
        } else {
          console.error('comboProductsContainer no está disponible');
        }
      }
      
      function updateComboTotal() {
        if (!comboProductsContainer) return;
        const products = Array.from(comboProductsContainer.querySelectorAll('.combo-product-item'));
        let total = 0;
        products.forEach(prod => {
          const qty = normalizeNumber(prod.querySelector('.combo-product-qty')?.value || 1);
          const price = normalizeNumber(prod.querySelector('.combo-product-price')?.value || 0);
          total += qty * price;
        });
        if (priceInput) {
          if (!priceInput.value || priceInput.value === '0' || priceInput === document.activeElement) {
            // Solo auto-completar si está vacío o es 0, o si el usuario no está editando
            if (priceInput !== document.activeElement) {
              priceInput.value = total;
            }
          }
        }
      }
      
      addComboProductBtn.onclick = () => {
        addComboProductRow();
        updateComboTotal();
      };
      
      // Inicializar productos existentes si es edición
      if (comboProducts.length === 0) {
        addComboProductRow();
      } else {
        // Agregar event listeners a los checkboxes existentes
        if (comboProductsContainer) {
          comboProductsContainer.querySelectorAll('.combo-product-open-slot').forEach(checkbox => {
          const row = checkbox.closest('.combo-product-item');
          const itemSection = row.querySelector('.combo-product-item-section');
          checkbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            if (isChecked) {
              itemSection.classList.add('hidden');
              // Actualizar borde izquierdo
              row.className = row.className.replace(/border-slate-700\/50|border-slate-300/g, '').trim();
              row.className += ' border-l-4 border-l-orange-500 dark:border-l-orange-500 theme-light:border-l-orange-400 border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300';
              // Agregar badge "Activo" si no existe
              const label = row.querySelector('label');
              const existingBadge = label?.querySelector('span:last-child');
              if (label && (!existingBadge || !existingBadge.textContent.includes('Activo'))) {
                const badge = document.createElement('span');
                badge.className = 'px-2 py-1 bg-orange-500/20 dark:bg-orange-500/20 theme-light:bg-orange-100 text-orange-400 dark:text-orange-400 theme-light:text-orange-700 text-xs font-semibold rounded';
                badge.textContent = 'Activo';
                label.appendChild(badge);
              }
              // Limpiar item seleccionado
              const itemIdInput = row.querySelector('.combo-product-item-id');
              const itemSearch = row.querySelector('.combo-product-item-search');
              const itemSelected = row.querySelector('.combo-product-item-selected');
              if (itemIdInput) itemIdInput.value = '';
              if (itemSearch) itemSearch.value = '';
              if (itemSelected) itemSelected.classList.add('hidden');
            } else {
              itemSection.classList.remove('hidden');
              // Remover borde izquierdo naranja
              row.className = row.className.replace(/border-l-4 border-l-orange-[^ ]+/g, '').trim();
              if (!row.className.includes('border-slate-700/50') && !row.className.includes('border-slate-300')) {
                row.className += ' border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300';
              }
              // Remover badge "Activo"
              const activeBadge = row.querySelector('label span:last-child');
              if (activeBadge && activeBadge.textContent.includes('Activo')) {
                activeBadge.remove();
              }
            }
            updateComboTotal();
          });
        });
        }
      }
    }
    
    nameInput.focus();
    
    saveBtn.onclick = async () => {
      const name = nameInput.value.trim();
      const price = normalizeNumber(priceInput.value);
      
      if (!name) {
        msgEl.textContent = 'El nombre es requerido';
        msgEl.style.color = 'var(--danger, #ef4444)';
        return;
      }
      
      if (price < 0) {
        msgEl.textContent = 'El precio debe ser mayor o igual a 0';
        msgEl.style.color = 'var(--danger, #ef4444)';
        return;
      }
      
      // Validar combo
      if (isCombo && comboProductsContainer) {
        const products = Array.from(comboProductsContainer.querySelectorAll('.combo-product-item'));
        if (products.length === 0) {
          msgEl.textContent = 'Un combo debe incluir al menos un producto';
          msgEl.style.color = 'var(--danger, #ef4444)';
          return;
        }
        
        for (const prod of products) {
          const prodName = prod.querySelector('.combo-product-name')?.value.trim();
          if (!prodName) {
            msgEl.textContent = 'Todos los productos del combo deben tener nombre';
            msgEl.style.color = 'var(--danger, #ef4444)';
            return;
          }
        }
      }
      
      try {
        saveBtn.disabled = true;
        const vehiclesToShow = selectedVehicles.length > 0 ? selectedVehicles : (selectedVehicle ? [selectedVehicle] : []);
        saveBtn.textContent = isEdit ? 'Actualizando...' : (vehiclesToShow.length > 1 ? `Guardando para ${vehiclesToShow.length} vehículos...` : 'Guardando...');
        
        // Preparar datos comunes del payload
        const yearFromInput = node.querySelector('#pe-modal-year-from');
        const yearToInput = node.querySelector('#pe-modal-year-to');
        const yearFromRaw = yearFromInput?.value?.trim() || '';
        const yearToRaw = yearToInput?.value?.trim() || '';
        const yearFrom = yearFromRaw ? Number(yearFromRaw) : null;
        const yearTo = yearToRaw ? Number(yearToRaw) : null;
        
        const basePayload = {
          name: name,
          type: type,
          total: price,
          yearFrom: yearFrom,
          yearTo: yearTo
        };

        // Valor inversión (opcional) - para autocompletar al cierre de venta
        if (!isInversionPrice) {
          const invInput = node.querySelector('#pe-modal-investment-value');
          basePayload.investmentValue = normalizeNumber(invInput?.value || 0);
        }
        
        if (isProduct) {
          // Leer itemId del input hidden como fuente de verdad (más confiable que selectedItem)
          const itemIdInputEl = node.querySelector('#pe-modal-item-id');
          const itemIdFromInput = itemIdInputEl?.value?.trim() || null;
          
          if (itemIdFromInput) {
            basePayload.itemId = itemIdFromInput;
          } else if (selectedItem && selectedItem._id) {
            basePayload.itemId = selectedItem._id;
          } else {
            basePayload.itemId = null;
          }
        }
        
        if (isCombo && comboProductsContainer) {
          const products = Array.from(comboProductsContainer.querySelectorAll('.combo-product-item'));
          basePayload.comboProducts = products.map(prod => {
            const isOpenSlot = prod.querySelector('.combo-product-open-slot')?.checked || false;
            return {
              name: prod.querySelector('.combo-product-name')?.value.trim() || '',
              qty: normalizeNumber(prod.querySelector('.combo-product-qty')?.value || 1),
              unitPrice: normalizeNumber(prod.querySelector('.combo-product-price')?.value || 0),
              itemId: isOpenSlot ? null : (prod.querySelector('.combo-product-item-id')?.value || null),
              isOpenSlot: isOpenSlot
            };
          }).filter(p => p.name);
        }
        
        // Agregar campos de mano de obra si existen
        if (isCombo || isProduct || isService) {
          const laborValueInput = node.querySelector('#pe-modal-labor-value');
          const laborKindSelect = node.querySelector('#pe-modal-labor-kind');
          if (laborValueInput && laborKindSelect) {
            const laborValue = Number(laborValueInput.value || 0) || 0;
            const laborKind = laborKindSelect.value?.trim() || '';
            if (laborValue > 0 || laborKind) {
              basePayload.laborValue = laborValue;
              basePayload.laborKind = laborKind;
            }
          }
        }
        
        // Si es precio general o inversión, no requiere vehículo
        if (isGeneralPrice || isInversionPrice) {
          const payload = {
            ...basePayload,
            type: isInversionPrice ? 'inversion' : basePayload.type,
            isGeneral: isGeneralPrice && !isInversionPrice,
            vehicleId: null
          };
          
          if (isEdit) {
            await API.priceUpdate(existingPrice._id, payload);
          } else {
            await API.priceCreate(payload);
          }
          
          closeModal();
          currentPage = 1;
          // Recargar según la pestaña activa
          const activeSubTab = document.querySelector('.payroll-tabs button[data-subtab].active')?.dataset.subtab;
          if (activeSubTab === 'prices-general') {
            loadGeneralPrices();
          } else if (activeSubTab === 'prices-inversion') {
            loadInversionPrices();
          } else {
            loadPrices();
          }
          return;
        }
        
        // Si hay múltiples vehículos, crear un precio para cada uno
        let vehiclesToProcess = [];
        if (isEdit) {
          vehiclesToProcess = [selectedVehicle];
        } else {
          // Usar selectedVehicles si tiene elementos, sino usar selectedVehicle
          vehiclesToProcess = selectedVehicles.length > 0 ? selectedVehicles : (selectedVehicle ? [selectedVehicle] : []);
        }
        
        if (vehiclesToProcess.length === 0) {
          msgEl.textContent = 'Debes seleccionar al menos un vehículo o crear un precio general';
          msgEl.style.color = 'var(--danger, #ef4444)';
          saveBtn.disabled = false;
          saveBtn.textContent = isEdit ? '💾 Actualizar' : '💾 Guardar';
          return;
        }
        
        const promises = [];
        
        for (const vehicle of vehiclesToProcess) {
          const payload = {
            ...basePayload,
            vehicleId: vehicle._id
          };
          
          if (isEdit) {
            promises.push(API.priceUpdate(existingPrice._id, payload));
          } else {
            promises.push(API.priceCreate(payload));
          }
        }
        
        // Ejecutar todas las promesas en paralelo
        await Promise.all(promises);
        
        closeModal();
        currentPage = 1;
        if (vehiclesToProcess.length === 1) {
          // Recargar según la pestaña activa
          const activeSubTab = document.querySelector('.payroll-tabs button[data-subtab].active')?.dataset.subtab;
          if (activeSubTab === 'prices-general') {
            loadGeneralPrices();
          } else {
            loadPrices();
          }
        } else {
          // Si hay múltiples vehículos, mostrar mensaje de éxito
          alert(`✓ Precio creado exitosamente para ${vehiclesToProcess.length} vehículos`);
          // Limpiar selección múltiple después de crear
          selectedVehicles = [];
          updateSelectedVehiclesDisplay();
        }
      } catch(e) {
        msgEl.textContent = 'Error: ' + (e?.message || 'Error desconocido');
        msgEl.style.color = 'var(--danger, #ef4444)';
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? '💾 Actualizar' : '💾 Guardar';
      }
    };
    
    cancelBtn.onclick = () => closeModal();
    
    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });
    priceInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveBtn.click();
    });
    
    const cleanup = openModal();
    closeBtn.onclick = () => { cleanup?.(); closeModal(); };
  }
  
  // Crear nuevo servicio
  if (btnNewService) {
    btnNewService.onclick = () => openCreateModal('service');
  }
  
  // Crear nuevo producto
  if (btnNewProduct) {
    btnNewProduct.onclick = () => openCreateModal('product');
  }
  
  // Crear nuevo combo
  const btnNewCombo = $('#pe-new-combo');
  if (btnNewCombo) {
    btnNewCombo.onclick = () => openCreateModal('combo');
  }
  
  // Crear precios generales
  const btnNewServiceGeneral = $('#pe-new-service-general');
  if (btnNewServiceGeneral) {
    btnNewServiceGeneral.onclick = () => openCreateModal('service', null, true);
  }
  
  const btnNewProductGeneral = $('#pe-new-product-general');
  if (btnNewProductGeneral) {
    btnNewProductGeneral.onclick = () => openCreateModal('product', null, true);
  }
  
  const btnNewComboGeneral = $('#pe-new-combo-general');
  if (btnNewComboGeneral) {
    btnNewComboGeneral.onclick = () => openCreateModal('combo', null, true);
  }

  // Import / Export
  if (btnExport) {
    btnExport.onclick = async () => {
      const vehicleToUse = selectedVehicles.length > 0 
        ? selectedVehicles[0] 
        : (selectedVehicle || null);
      
      if (!vehicleToUse) return alert('Selecciona un vehículo');
      
      try {
        btnExport.disabled = true;
        const exportText = btnExport.querySelector('span:last-child');
        if (exportText) exportText.textContent = 'Exportando...';
        else btnExport.textContent = 'Exportando...';
        
        const url = `${API.base || ''}/api/v1/prices/export?vehicleId=${vehicleToUse._id}`;
        const res = await fetch(url, { headers: { ...(API.token?.get ? { Authorization: `Bearer ${API.token.get()}` } : {}) } });
        if(!res.ok) throw new Error('No se pudo exportar');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const contentDisposition = res.headers.get('Content-Disposition');
        const filename = contentDisposition 
          ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') || 'precios.xlsx'
          : `precios-${new Date().toISOString().split('T')[0]}.xlsx`;
        a.download = filename;
        document.body.appendChild(a); 
        a.click(); 
        a.remove();
        URL.revokeObjectURL(a.href);
      } catch(e) {
        alert('Error al exportar: ' + e.message);
      } finally {
        btnExport.disabled = false;
        if (btnExport) {
          const exportText = btnExport.querySelector('span:last-child');
          if (exportText) exportText.textContent = 'Exportar';
          else btnExport.textContent = '📤 Exportar';
        }
      }
    };
  }

  if (btnImport) {
    btnImport.onclick = async () => {
      const vehicleToUse = selectedVehicles.length > 0 
        ? selectedVehicles[0] 
        : (selectedVehicle || null);
      
      if (!vehicleToUse) return alert('Selecciona un vehículo');
      
      const body=$('#modalBody'), closeBtn=$('#modalClose'); 
      body.replaceChildren();
      
      const node = document.createElement('div');
      node.className = 'bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white/95 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 overflow-hidden';
      node.innerHTML = `
        <div class="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <p class="text-xs font-semibold uppercase tracking-wide text-white/80">Lista de precios</p>
          <h3 class="text-lg font-bold">📥 Importar precios</h3>
        </div>
        <div class="p-5">
          <p class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-4">
            Vehículo: <strong class="text-white dark:text-white theme-light:text-slate-900">${escapeHtml(vehicleToUse.make)} ${escapeHtml(vehicleToUse.line)}</strong>
          </p>
          <div class="mb-4 space-y-2">
            <button type="button" id="pe-download-template" class="pr-btn-secondary w-full px-4 py-2.5 text-sm">📥 Descargar plantilla</button>
            <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Archivo Excel (.xlsx)</label>
            <input type="file" id="pe-import-file" accept=".xlsx" class="w-full px-3 py-2 rounded-lg border border-slate-600 dark:border-slate-600 theme-light:border-slate-300 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-sm text-white dark:text-white theme-light:text-slate-900" />
          </div>
          <div id="pe-import-msg" class="mb-4 text-sm min-h-[1.25rem]"></div>
          <div class="flex flex-wrap gap-2">
            <button type="button" id="pe-import-run" class="pr-main-btn flex-1 min-w-[140px] px-4 py-2.5 text-sm">📥 Importar</button>
            <button type="button" id="pe-import-cancel" class="pr-btn-secondary flex-1 min-w-[120px] px-4 py-2.5 text-sm">Cancelar</button>
          </div>
        </div>
      `;
      openModal(node);
      
      const fileInput = node.querySelector('#pe-import-file');
      const msgEl = node.querySelector('#pe-import-msg');
      const runBtn = node.querySelector('#pe-import-run');
      const cancelBtn = node.querySelector('#pe-import-cancel');
      const templateBtn = node.querySelector('#pe-download-template');
      
      templateBtn.onclick = async () => {
        try {
          templateBtn.disabled = true;
          const url = `${API.base || ''}/api/v1/prices/import/template?vehicleId=${vehicleToUse._id}`;
          const res = await fetch(url, { headers: { ...(API.token?.get ? { Authorization: `Bearer ${API.token.get()}` } : {}) } });
          if(!res.ok) throw new Error('No se pudo descargar la plantilla');
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `plantilla-precios-${vehicleToUse.make}-${vehicleToUse.line}.xlsx`;
          document.body.appendChild(a); 
          a.click(); 
          a.remove();
          URL.revokeObjectURL(a.href);
        } catch(e) {
          alert('Error: ' + e.message);
        } finally {
          templateBtn.disabled = false;
        }
      };
      
      runBtn.onclick = async () => {
        const file = fileInput.files?.[0];
        if(!file) {
          msgEl.textContent = 'Selecciona un archivo .xlsx';
          msgEl.style.color = 'var(--danger, #ef4444)';
          return;
        }
        
        try {
          runBtn.disabled = true;
          runBtn.textContent = 'Importando...';
          msgEl.textContent = 'Subiendo y procesando...';
          msgEl.style.color = 'var(--muted)';
          
          const formData = new FormData();
          formData.append('file', file);
          formData.append('vehicleId', vehicleToUse._id);
          formData.append('mode', 'upsert');
          
          const url = `${API.base || ''}/api/v1/prices/import`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { ...(API.token?.get ? { Authorization: `Bearer ${API.token.get()}` } : {}) },
            body: formData
          });
          
          const text = await res.text();
          let data;
          try { data = JSON.parse(text); } catch { data = text; }
          
          if(!res.ok) throw new Error(data?.error || 'Error importando');
          
          const s = data || {};
          const errs = Array.isArray(s.errors) ? s.errors : [];
          const lines = [
            'Importación completada:',
            `• Creados: ${s.inserted || 0}`,
            `• Actualizados: ${s.updated || 0}`,
            errs.length > 0 ? `• Errores: ${errs.length}` : ''
          ].filter(Boolean);
          
          msgEl.innerHTML = lines.join('<br>');
          msgEl.style.color = errs.length > 0 ? 'var(--warning, #f59e0b)' : 'var(--success, #10b981)';
          
          if (errs.length > 0 && errs.length <= 10) {
            msgEl.innerHTML += '<br><br><strong>Errores:</strong><br>' + errs.map(e => `Fila ${e.row}: ${e.error}`).join('<br>');
          } else if (errs.length > 10) {
            msgEl.innerHTML += `<br><br><strong>Errores (mostrando primeros 10 de ${errs.length}):</strong><br>` + errs.slice(0, 10).map(e => `Fila ${e.row}: ${e.error}`).join('<br>');
          }
          
          await loadPrices();
        } catch(e) {
          msgEl.textContent = 'Error: ' + (e?.message || 'Error desconocido');
          msgEl.style.color = 'var(--danger, #ef4444)';
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = '📥 Importar';
        }
      };
      
      cancelBtn.onclick = () => closeModal();
      
      const cleanup = openModal();
      closeBtn.onclick = () => { cleanup?.(); closeModal(); };
    };
  }


  // Tabs internas (Lista de precios vehicular / general / inversión / Vehículos)
  document.querySelectorAll('.payroll-tabs button[data-subtab]').forEach(b => {
    b.addEventListener('click', () => switchSubTab(b.dataset.subtab));
  });

  // Event listeners para filtros de la pestaña general
  const filterNameGeneral = $('#pe-filter-name-general');
  const filterTypeGeneral = $('#pe-filter-type-general');
  const searchBtnGeneral = $('#pf-search-general');
  
  if (searchBtnGeneral) {
    searchBtnGeneral.addEventListener('click', () => {
      currentFilters.name = filterNameGeneral?.value || '';
      currentFilters.type = filterTypeGeneral?.value || '';
      currentPage = 1;
      loadGeneralPrices();
    });
  }
  
  if (filterNameGeneral) {
    filterNameGeneral.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchBtnGeneral?.click();
      }
    });
  }

  // Event listeners para filtros de la pestaña de inversión
  const filterNameInversion = $('#pe-filter-name-inversion');
  const searchBtnInversion = $('#pf-search-inversion');
  
  if (searchBtnInversion) {
    searchBtnInversion.addEventListener('click', () => {
      currentFilters.name = filterNameInversion?.value || '';
      currentPage = 1;
      loadInversionPrices();
    });
  }
  
  if (filterNameInversion) {
    filterNameInversion.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchBtnInversion?.click();
      }
    });
  }

  // Event listener para botón de crear precio de inversión
  const btnNewInversion = $('#pe-new-inversion');
  if (btnNewInversion) {
    btnNewInversion.addEventListener('click', () => {
      openCreateModal('inversion', null, false, true);
    });
  }

  // Inicializar gestión de vehículos
  initVehicles();
  
  // Configurar handlers para pegar números con formato de miles en todos los campos numéricos
  setupNumberInputsPasteHandler('input[type="number"]', tab);
  
  // También aplicar a campos que se crean dinámicamente
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          if (node.tagName === 'INPUT' && node.type === 'number') {
            setupNumberInputPasteHandler(node);
          }
          // También buscar inputs dentro del nodo agregado
          const inputs = node.querySelectorAll?.('input[type="number"]');
          if (inputs) {
            inputs.forEach(input => setupNumberInputPasteHandler(input));
          }
        }
      });
    });
  });
  observer.observe(tab, { childList: true, subtree: true });

  // Inicializar con la pestaña vehicular activa
  switchSubTab('prices-general');
  
  // Renderizar tabla vacía inicialmente
  renderTableHeader();
  
  // Cargar precios vehiculares al iniciar
  setTimeout(() => {
    loadPrices();
  }, 500); // Pequeño delay para asegurar que todo esté inicializado
}
