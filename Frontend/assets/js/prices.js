/* Lista de precios - Nuevo modelo: Vehículo primero, luego servicios/productos */
import { API } from './api.esm.js';
import { initVehicles } from './vehicles.js';

const $ = (s)=>document.querySelector(s);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
function openModal(){ const m=$('#modal'); if(!m) return; m.classList.remove('hidden'); document.body.style.overflow='hidden'; const onKey=(e)=>{ if(e.key==='Escape') closeModal(); }; document.addEventListener('keydown', onKey); return ()=>document.removeEventListener('keydown', onKey); }
function closeModal(){ const m=$('#modal'); if(!m) return; m.classList.add('hidden'); document.body.style.overflow=''; }
const clone=(id)=>document.getElementById(id)?.content?.firstElementChild?.cloneNode(true);

function normalizeNumber(v){ if(v==null || v==='') return 0; if(typeof v==='number') return v; const s=String(v).replace(/\s+/g,'').replace(/\$/g,'').replace(/\./g,'').replace(/,/g,'.'); const n=Number(s); return Number.isFinite(n)?n:0; }

// Función para abrir QR simplificado (solo un escaneo)
export function openQRForItem() {
  return new Promise(async (resolve, reject) => {
    // Crear modal simplificado
    const qrModal = document.createElement('div');
    qrModal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;';
    qrModal.id = 'qr-modal-item-scanner';
    
    const qrContent = document.createElement('div');
    qrContent.style.cssText = 'background:var(--card);border-radius:12px;padding:24px;max-width:90vw;max-height:90vh;width:600px;position:relative;z-index:100000;';
    qrContent.innerHTML = `
      <button class="close" style="position:absolute;top:8px;right:8px;font-size:24px;background:none;border:none;color:var(--text);cursor:pointer;padding:4px 12px;">&times;</button>
      <h3 style="margin-top:0;margin-bottom:16px;">Escanear código QR</h3>
      <div style="position:relative;width:100%;background:#000;border-radius:8px;overflow:hidden;margin-bottom:12px;min-height:300px;">
        <video id="qr-video-single" playsinline muted autoplay style="width:100%;height:auto;display:block;object-fit:contain;"></video>
        <canvas id="qr-canvas-single" style="display:none;"></canvas>
      </div>
      <div style="margin-bottom:12px;">
        <input id="qr-manual-single" placeholder="O ingresa el código manualmente" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
      </div>
      <div id="qr-msg-single" style="font-size:12px;color:var(--muted);margin-bottom:8px;"></div>
      <div style="display:flex;gap:8px;">
        <button id="qr-start-camera-single" class="primary" style="flex:1;padding:10px;display:none;">▶ Iniciar cámara</button>
        <button id="qr-cancel-single" class="secondary" style="flex:1;padding:10px;">Cancelar</button>
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
      console.log('start() llamado - Iniciando cámara...');
      try {
        stop();
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        console.log('Dispositivo móvil:', isMobile);
        
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
      console.log('onCode llamado con:', code);
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
          console.log('QR detectado (BarcodeDetector):', codes[0].rawValue);
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
            console.log('QR detectado (jsQR):', qr.data);
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
      console.error('Error al iniciar cámara automáticamente en openQRForItem:', err);
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

// Función para cambiar entre tabs
function switchSubTab(name) {
  document.querySelectorAll('.payroll-tabs button[data-subtab]').forEach(b => {
    b.classList.toggle('active', b.dataset.subtab === name);
  });
  document.querySelectorAll('[data-subsection]').forEach(sec => {
    sec.classList.toggle('hidden', sec.dataset.subsection !== name);
  });
}

export function initPrices(){
  const tab = $('#tab-precios'); if(!tab) return;

  const fMakeSelect=$('#pf-make-select'), fVehicleId=$('#pf-vehicle-id'), fVehicleSelected=$('#pf-vehicle-selected'), fVehicleName=$('#pf-vehicle-name');
  const fLinesContainer=$('#pf-lines-container'), fLinesGrid=$('#pf-lines-grid');
  const fSearch=$('#pf-search'), fClear=$('#pf-clear');
  const btnNewService=$('#pe-new-service'), btnNewProduct=$('#pe-new-product');
  const actionsBar=$('#pe-actions-bar');
  const head=$('#pe-head'), body=$('#pe-body');

  let selectedVehicle = null; // Mantener para compatibilidad con código existente
  let selectedVehicles = []; // Array para selección múltiple
  let selectedMake = null;
  let currentPage = 1;
  let currentFilters = { name: '', type: '' };
  let paging = { page: 1, limit: 10, total: 0, pages: 1 };

  // Acciones adicionales (import/export) – mantenemos usando DOM APIs
  const filtersBar=document.getElementById('filters-bar')||tab;
  const addBtn=(id, cls, text)=>{ const b=document.createElement('button'); b.id=id; b.className=cls; b.textContent=text; filtersBar?.appendChild(b); return b; };
  const btnImport=addBtn('pe-import','secondary','📥 Importar');
  const btnExport=addBtn('pe-export','secondary','📤 Exportar');

  function renderTableHeader(){
    head.replaceChildren();
    if(!selectedVehicle) {
      head.innerHTML = '<tr><th colspan="5" style="text-align:center;padding:24px;color:var(--muted);">Selecciona un vehículo para ver sus servicios y productos</th></tr>';
      return;
    }
    const tr=document.createElement('tr');
    ['Tipo', 'Nombre', 'Item vinculado / Productos', 'Precio', 'Acciones'].forEach(txt=>{
      const th=document.createElement('th'); th.textContent=txt; tr.appendChild(th);
    });
    head.appendChild(tr);
  }

  const rowTemplateId='tpl-price-edit-row';

  function rowToNode(r){
    const tr=clone(rowTemplateId);
    if (!tr) {
      console.error('Template no encontrado:', rowTemplateId);
      const fallback = document.createElement('tr');
      fallback.innerHTML = `<td colspan="4">Error: Template no disponible</td>`;
      return fallback;
    }
    
    // Mostrar tipo
    const vehicleCell = tr.querySelector('[data-vehicle]');
    if (vehicleCell) {
      let typeBadge = '';
      if (r.type === 'combo') {
        typeBadge = '<span style="background:#9333ea;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">COMBO</span>';
      } else if (r.type === 'product') {
        typeBadge = '<span style="background:var(--primary,#3b82f6);color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">PRODUCTO</span>';
      } else {
        typeBadge = '<span style="background:var(--success,#10b981);color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">SERVICIO</span>';
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
          const linked = cp.itemId ? `✓ ${cp.itemId.name || cp.itemId.sku}` : cp.name;
          return `<div style="font-size:10px;margin:2px 0;">• ${linked} (x${cp.qty || 1})</div>`;
        }).join('');
        itemInfoCell.innerHTML = `
          <div style="color:#9333ea;font-weight:600;margin-bottom:4px;">${r.comboProducts.length} producto(s)</div>
          ${productsList}
        `;
      } else if (r.type === 'product' && r.itemId) {
        itemInfoCell.innerHTML = `
          <div style="color:var(--success, #10b981);">✓ ${r.itemId.name || r.itemId.sku}</div>
          <div style="font-size:10px;">SKU: ${r.itemId.sku} | Stock: ${r.itemId.stock || 0}</div>
        `;
      } else if (r.type === 'product') {
        itemInfoCell.innerHTML = '<span style="color:var(--muted);font-size:10px;">Sin vincular</span>';
      } else {
        itemInfoCell.innerHTML = '<span style="color:var(--muted);font-size:10px;">-</span>';
      }
    }
    
    const inPrice=tr.querySelector('input[data-price]'); 
    if (inPrice) inPrice.value = r.total || r.price || 0;

    const editBtn = tr.querySelector('button.edit');
    if (editBtn) {
      const newEditBtn = editBtn.cloneNode(true);
      editBtn.parentNode.replaceChild(newEditBtn, editBtn);
      newEditBtn.addEventListener('click', () => {
        openCreateModal(r.type, r);
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
        loadPrices();
      });
    }
    
    const deleteBtn = tr.querySelector('button.delete');
    if (deleteBtn) {
      const newDeleteBtn = deleteBtn.cloneNode(true);
      deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
      newDeleteBtn.addEventListener('click', async ()=>{ 
        if(confirm('¿Borrar este servicio/producto?')){ 
          await API.priceDelete(r._id); 
          loadPrices(); 
        } 
      });
    }
    return tr;
  }

  function renderPagination() {
    const paginationEl = $('#pe-pagination');
    if (!paginationEl || !selectedVehicle) return;
    
    if (paging.pages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }
    
    let html = '<div style="display:flex;align-items:center;gap:8px;justify-content:center;padding:12px;">';
    html += `<button class="secondary" ${paging.page <= 1 ? 'disabled' : ''} id="pe-prev">← Anterior</button>`;
    html += `<span style="color:var(--muted);font-size:13px;">Página ${paging.page} de ${paging.pages} (${paging.total} total)</span>`;
    html += `<button class="secondary" ${paging.page >= paging.pages ? 'disabled' : ''} id="pe-next">Siguiente →</button>`;
    html += '</div>';
    paginationEl.innerHTML = html;
    
    $('#pe-prev')?.addEventListener('click', () => {
      if (paging.page > 1) {
        currentPage = paging.page - 1;
        loadPrices();
      }
    });
    $('#pe-next')?.addEventListener('click', () => {
      if (paging.page < paging.pages) {
        currentPage = paging.page + 1;
        loadPrices();
      }
    });
  }

  async function loadPrices(params={}){
    if (!selectedVehicle) {
      body.replaceChildren();
      renderTableHeader();
      return;
    }
    params = { 
      ...(params||{}), 
      vehicleId: selectedVehicle._id,
      page: currentPage,
      limit: 10,
      name: currentFilters.name,
      type: currentFilters.type || undefined
    };
    const r = await API.pricesList(params);
    const rows = Array.isArray(r?.items) ? r.items : (Array.isArray(r) ? r : []);
    paging = {
      page: r.page || 1,
      limit: r.limit || 10,
      total: r.total || 0,
      pages: r.pages || 1
    };
    body.replaceChildren(...rows.map(rowToNode));
    renderTableHeader();
    renderPagination();
  }

  // Cargar marcas al iniciar
  async function loadMakes() {
    try {
      const r = await API.vehicles.getMakes();
      const makes = Array.isArray(r?.makes) ? r.makes : [];
      
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '-- Selecciona una marca --';
      fMakeSelect.replaceChildren(
        defaultOpt,
        ...makes.map(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          return opt;
        })
      );
    } catch (err) {
      console.error('Error al cargar marcas:', err);
    }
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
            // Actualizar visual del card
            const newIsSelected = selectedVehicles.some(sv => sv._id === lineData.vehicles[0]._id);
            card.style.borderColor = newIsSelected ? 'var(--primary, #3b82f6)' : 'var(--border)';
            card.style.background = newIsSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-alt)';
            checkbox.checked = newIsSelected;
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
            // Actualizar visual del card
            const newIsSelected = selectedVehicles.some(sv => sv._id === lineData.vehicles[0]._id);
            card.style.borderColor = newIsSelected ? 'var(--primary, #3b82f6)' : 'var(--border)';
            card.style.background = newIsSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-alt)';
            const checkbox = card.querySelector('input[type="checkbox"]');
            if (checkbox) {
              checkbox.checked = newIsSelected;
            }
          } else {
            // Si hay múltiples variantes, mostrar un selector con checkboxes
            showVehicleSelector(lineData.vehicles, lineData.line, lineData.displacement);
          }
        });
        
        fLinesGrid.appendChild(card);
      });
      
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
    node.className = 'card';
    node.style.cssText = 'max-width:600px;margin:0 auto;';
    node.innerHTML = `
      <h3 style="margin-top:0;margin-bottom:16px;">Seleccionar variantes</h3>
      <p class="muted" style="margin-bottom:16px;">${line} - ${displacement}</p>
      <p class="muted" style="margin-bottom:16px;font-size:12px;">Puedes seleccionar múltiples vehículos para crear precios en bulk</p>
      <div style="display:grid;gap:8px;margin-bottom:16px;">
        ${vehicles.map(v => {
          const isSelected = selectedVehicles.some(sv => sv._id === v._id);
          return `
          <div class="vehicle-variant-card" data-vehicle-id="${v._id}" style="padding:12px;background:var(--card-alt);border:2px solid ${isSelected ? 'var(--primary, #3b82f6)' : 'var(--border)'};border-radius:8px;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:12px;">
            <input type="checkbox" class="vehicle-checkbox" data-vehicle-id="${v._id}" ${isSelected ? 'checked' : ''} style="width:20px;height:20px;cursor:pointer;flex-shrink:0;" />
            <div style="flex:1;">
              <div style="font-weight:600;">${v.line} ${v.displacement}</div>
              ${v.modelYear ? `<div style="font-size:12px;color:var(--muted);margin-top:4px;">Modelo: ${v.modelYear}</div>` : ''}
            </div>
          </div>
        `;
        }).join('')}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="variant-select-all" class="secondary" style="padding:8px 16px;">Seleccionar todos</button>
        <button id="variant-deselect-all" class="secondary" style="padding:8px 16px;">Deseleccionar todos</button>
        <button id="variant-confirm" class="primary" style="padding:8px 24px;">Confirmar (${selectedVehicles.length})</button>
        <button id="variant-cancel" class="secondary" style="padding:8px 24px;">Cancelar</button>
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
    updateSelectedVehiclesDisplay();
  }
  
  function updateSelectedVehiclesDisplay() {
    if (selectedVehicles.length === 0) {
      selectedVehicle = null;
      fVehicleId.value = '';
      fVehicleName.textContent = '';
      fVehicleSelected.style.display = 'none';
      fLinesContainer.style.display = 'block';
      actionsBar.style.display = 'none';
      $('#pe-filters').style.display = 'none';
      body.replaceChildren();
      renderTableHeader();
      const paginationEl = $('#pe-pagination');
      if (paginationEl) paginationEl.innerHTML = '';
    } else if (selectedVehicles.length === 1) {
      selectedVehicle = selectedVehicles[0];
      fVehicleId.value = selectedVehicle._id;
      fVehicleName.textContent = `${selectedVehicle.make} ${selectedVehicle.line} - Cilindraje: ${selectedVehicle.displacement}${selectedVehicle.modelYear ? ` | Modelo: ${selectedVehicle.modelYear}` : ''}`;
      fVehicleSelected.style.display = 'block';
      fLinesContainer.style.display = 'none';
      actionsBar.style.display = 'flex';
      $('#pe-filters').style.display = 'flex';
      currentPage = 1;
      currentFilters = { name: '', type: '' };
      $('#pe-filter-name').value = '';
      $('#pe-filter-type').value = '';
      loadPrices();
    } else {
      // Múltiples vehículos seleccionados
      selectedVehicle = null; // No hay un vehículo único seleccionado
      fVehicleId.value = '';
      fVehicleName.textContent = `✓ ${selectedVehicles.length} vehículos seleccionados`;
      fVehicleSelected.style.display = 'block';
      fLinesContainer.style.display = 'none';
      actionsBar.style.display = 'flex';
      $('#pe-filters').style.display = 'none'; // Ocultar filtros cuando hay múltiples
      body.replaceChildren();
      renderTableHeader();
      const paginationEl = $('#pe-pagination');
      if (paginationEl) paginationEl.innerHTML = '';
    }
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
    selectedMake = null;
    fVehicleId.value = '';
    fMakeSelect.value = '';
    fVehicleSelected.style.display = 'none';
    fLinesContainer.style.display = 'none';
    actionsBar.style.display = 'none';
    body.replaceChildren();
    renderTableHeader();
    const paginationEl = $('#pe-pagination');
    if (paginationEl) paginationEl.innerHTML = '';
    const filtersEl = $('#pe-filters');
    if (filtersEl) filtersEl.style.display = 'none';
    currentPage = 1;
    currentFilters = { name: '', type: '' };
    const filterName = $('#pe-filter-name');
    const filterType = $('#pe-filter-type');
    if (filterName) filterName.value = '';
    if (filterType) filterType.value = '';
  }

  // Eventos UI
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
  function openCreateModal(type, existingPrice = null) {
    // Verificar que haya al menos un vehículo seleccionado (único o múltiple)
    if (!selectedVehicle && selectedVehicles.length === 0) {
      return alert('Selecciona un vehículo primero');
    }
    const body=$('#modalBody'), closeBtn=$('#modalClose'); 
    body.replaceChildren();
    
    const isEdit = !!existingPrice;
    const isProduct = type === 'product';
    const isCombo = type === 'combo';
    const linkedItem = existingPrice?.itemId;
    const comboProducts = existingPrice?.comboProducts || [];
    
    const node = document.createElement('div');
    node.className = 'card';
    node.innerHTML = `
      <h3>${isEdit ? 'Editar' : 'Nuevo'} ${type === 'combo' ? 'Combo' : (type === 'service' ? 'Servicio' : 'Producto')}</h3>
      <p class="muted" style="margin-bottom:16px;font-size:13px;">
        ${selectedVehicles.length === 1 ? 
          `Vehículo: <strong>${selectedVehicle.make} ${selectedVehicle.line}</strong>` :
          `Vehículos seleccionados: <strong>${selectedVehicles.length}</strong><br>
          <span style="font-size:11px;color:var(--muted);">Se creará el precio para todos los vehículos seleccionados</span>`
        }
      </p>
      ${selectedVehicles.length > 1 ? `
      <div style="margin-bottom:16px;padding:12px;background:var(--card-alt);border-radius:8px;border:1px solid var(--border);max-height:150px;overflow-y:auto;">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500;">Vehículos seleccionados:</div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${selectedVehicles.map(v => `
            <div style="font-size:11px;color:var(--text);">• ${v.make} ${v.line} ${v.displacement}${v.modelYear ? ` (${v.modelYear})` : ''}</div>
          `).join('')}
        </div>
      </div>
      ` : ''}
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Nombre</label>
        <input id="pe-modal-name" placeholder="${type === 'combo' ? 'Ej: Combo mantenimiento completo' : (type === 'service' ? 'Ej: Cambio de aceite' : 'Ej: Filtro de aire')}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${existingPrice?.name || ''}" />
      </div>
      ${isCombo ? `
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Productos del combo</label>
        <div id="pe-modal-combo-products" style="margin-bottom:8px;">
          ${comboProducts.map((cp, idx) => `
            <div class="combo-product-item" data-index="${idx}" style="padding:12px;background:var(--card-alt);border:1px solid var(--border);border-radius:6px;margin-bottom:8px;${cp.isOpenSlot ? 'border-left:4px solid var(--warning, #f59e0b);' : ''}">
              <div class="row" style="gap:8px;margin-bottom:8px;">
                <input type="text" class="combo-product-name" placeholder="Nombre del producto" value="${cp.name || ''}" style="flex:2;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
                <input type="number" class="combo-product-qty" placeholder="Cant." value="${cp.qty || 1}" min="1" style="width:80px;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
                <input type="number" class="combo-product-price" placeholder="Precio" step="0.01" value="${cp.unitPrice || 0}" style="width:120px;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
                <button class="combo-product-remove danger" style="padding:6px 12px;">✕</button>
              </div>
              <div class="row" style="gap:8px;margin-bottom:8px;align-items:center;">
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
                  <input type="checkbox" class="combo-product-open-slot" ${cp.isOpenSlot ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;" />
                  <span style="color:var(--text);">Slot abierto (se completa con QR al crear venta)</span>
                </label>
              </div>
              <div class="combo-product-item-section" style="${cp.isOpenSlot ? 'display:none;' : ''}">
                <div class="row" style="gap:8px;">
                  <input type="text" class="combo-product-item-search" placeholder="Buscar item del inventario (opcional)..." style="flex:1;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" value="${cp.itemId ? (cp.itemId.name || cp.itemId.sku || '') : ''}" />
                  <button class="combo-product-item-qr secondary" style="padding:6px 12px;">📷 QR</button>
                </div>
                <div class="combo-product-item-selected" style="margin-top:8px;padding:6px;background:var(--card);border-radius:4px;font-size:11px;${cp.itemId ? '' : 'display:none;'}">
                  ${cp.itemId ? `<div style="display:flex;justify-content:space-between;align-items:center;">
                    <div><strong>${cp.itemId.name || cp.itemId.sku}</strong> <span class="muted">SKU: ${cp.itemId.sku} | Stock: ${cp.itemId.stock || 0}</span></div>
                    <button class="combo-product-item-remove-btn danger" style="padding:2px 6px;font-size:10px;">✕</button>
                  </div>` : ''}
                </div>
              </div>
              <input type="hidden" class="combo-product-item-id" value="${cp.itemId?._id || ''}" />
            </div>
          `).join('')}
        </div>
        <button id="pe-modal-add-combo-product" class="secondary" style="width:100%;padding:8px;margin-bottom:8px;">➕ Agregar producto</button>
      </div>
      ` : ''}
      ${isProduct ? `
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Vincular con item del inventario (opcional)</label>
        <div class="row" style="gap:8px;margin-bottom:8px;">
          <input id="pe-modal-item-search" placeholder="Buscar por SKU o nombre..." style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
          <button id="pe-modal-item-qr" class="secondary" style="padding:8px 16px;">📷 QR</button>
        </div>
        <div id="pe-modal-item-dropdown" style="display:none;position:relative;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;background:var(--card);margin-top:4px;"></div>
        <div id="pe-modal-item-selected" style="margin-top:8px;padding:8px;background:var(--card-alt);border-radius:6px;font-size:12px;${linkedItem ? '' : 'display:none;'}">
          ${linkedItem ? `<div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong>${linkedItem.name || linkedItem.sku}</strong><br>
              <span class="muted">SKU: ${linkedItem.sku} | Stock: ${linkedItem.stock || 0}</span>
            </div>
            <button id="pe-modal-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
          </div>` : ''}
        </div>
        <input type="hidden" id="pe-modal-item-id" value="${linkedItem?._id || ''}" />
      </div>
      ` : ''}
      ${!isCombo ? `
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Precio</label>
        <input id="pe-modal-price" type="number" step="0.01" placeholder="0" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${existingPrice?.total || ''}" />
      </div>
      ` : `
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Precio total del combo</label>
        <input id="pe-modal-price" type="number" step="0.01" placeholder="0 (se calcula automáticamente)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${existingPrice?.total || ''}" />
        <p class="muted" style="margin-top:4px;font-size:11px;">El precio se calcula automáticamente desde los productos, o puedes establecerlo manualmente.</p>
      </div>
      `}
      <div style="margin-bottom:16px;padding:12px;background:var(--card-alt);border-radius:8px;border:1px solid var(--border);">
        <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500;">Rango de años (opcional)</label>
        <p class="muted" style="margin-bottom:8px;font-size:11px;">Solo aplicar este precio si el año del vehículo está en el rango especificado. Déjalo vacío para aplicar a todos los años.</p>
        <div class="row" style="gap:8px;">
          <div style="flex:1;">
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;">Desde</label>
            <input id="pe-modal-year-from" type="number" min="1900" max="2100" placeholder="Ej: 2018" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${existingPrice?.yearFrom || ''}" />
          </div>
          <div style="flex:1;">
            <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;">Hasta</label>
            <input id="pe-modal-year-to" type="number" min="1900" max="2100" placeholder="Ej: 2022" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" value="${existingPrice?.yearTo || ''}" />
          </div>
        </div>
      </div>
      <div id="pe-modal-msg" style="margin-bottom:16px;font-size:13px;"></div>
      <div class="row" style="gap:8px;">
        <button id="pe-modal-save" style="flex:1;padding:10px;">💾 ${isEdit ? 'Actualizar' : 'Guardar'}</button>
        <button id="pe-modal-cancel" class="secondary" style="flex:1;padding:10px;">Cancelar</button>
      </div>
    `;
    body.appendChild(node);
    
    const nameInput = node.querySelector('#pe-modal-name');
    const priceInput = node.querySelector('#pe-modal-price');
    const msgEl = node.querySelector('#pe-modal-msg');
    const saveBtn = node.querySelector('#pe-modal-save');
    const cancelBtn = node.querySelector('#pe-modal-cancel');
    let selectedItem = linkedItem ? { _id: linkedItem._id, sku: linkedItem.sku, name: linkedItem.name, stock: linkedItem.stock } : null;
    
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
                itemSelected.style.display = 'none';
              };
            }
            // Establecer el nombre del producto con el nombre del item del inventario
            if (nameInput && item.name) {
              nameInput.value = item.name;
            }
            // NO establecer el precio automáticamente - se deja a discreción del usuario
            return;
          }
          itemDropdown.replaceChildren(...items.map(item => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);';
            div.innerHTML = `
              <div style="font-weight:600;">${item.name || item.sku}</div>
              <div style="font-size:12px;color:var(--muted);">SKU: ${item.sku} | Stock: ${item.stock || 0} | Precio: $${(item.salePrice || 0).toLocaleString()}</div>
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
                  itemSelected.style.display = 'none';
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
                  itemSelected.style.display = 'none';
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
                itemSelected.style.display = 'none';
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
    if (isCombo) {
      const comboProductsContainer = node.querySelector('#pe-modal-combo-products');
      const addComboProductBtn = node.querySelector('#pe-modal-add-combo-product');
      
      function addComboProductRow(productData = {}) {
        const isOpenSlot = Boolean(productData.isOpenSlot);
        const row = document.createElement('div');
        row.className = 'combo-product-item';
        row.style.cssText = `padding:12px;background:var(--card-alt);border:1px solid var(--border);border-radius:6px;margin-bottom:8px;${isOpenSlot ? 'border-left:4px solid var(--warning, #f59e0b);' : ''}`;
        row.innerHTML = `
          <div class="row" style="gap:8px;margin-bottom:8px;">
            <input type="text" class="combo-product-name" placeholder="Nombre del producto" value="${productData.name || ''}" style="flex:2;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
            <input type="number" class="combo-product-qty" placeholder="Cant." value="${productData.qty || 1}" min="1" style="width:80px;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
            <input type="number" class="combo-product-price" placeholder="Precio" step="0.01" value="${productData.unitPrice || 0}" style="width:120px;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
            <button class="combo-product-remove danger" style="padding:6px 12px;">✕</button>
          </div>
          <div class="row" style="gap:8px;margin-bottom:8px;align-items:center;">
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
              <input type="checkbox" class="combo-product-open-slot" ${isOpenSlot ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;" />
              <span style="color:var(--text);">Slot abierto (se completa con QR al crear venta)</span>
            </label>
          </div>
          <div class="combo-product-item-section" style="${isOpenSlot ? 'display:none;' : ''}">
            <div class="row" style="gap:8px;">
              <input type="text" class="combo-product-item-search" placeholder="Buscar item del inventario (opcional)..." style="flex:1;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" value="${productData.itemId ? (productData.itemId.sku || '') + ' - ' + (productData.itemId.name || '') : ''}" />
              <button class="combo-product-item-qr secondary" style="padding:6px 12px;">📷 QR</button>
            </div>
            <div class="combo-product-item-selected" style="margin-top:8px;padding:6px;background:var(--card);border-radius:4px;font-size:11px;display:none;"></div>
          </div>
          <input type="hidden" class="combo-product-item-id" value="${productData.itemId?._id || ''}" />
        `;
        
        const removeBtn = row.querySelector('.combo-product-remove');
        removeBtn.onclick = () => {
          row.remove();
          updateComboTotal();
        };
        
        const itemSearch = row.querySelector('.combo-product-item-search');
        const itemSelected = row.querySelector('.combo-product-item-selected');
        const itemIdInput = row.querySelector('.combo-product-item-id');
        const itemQrBtn = row.querySelector('.combo-product-item-qr');
        let selectedComboItem = productData.itemId ? { _id: productData.itemId._id, sku: productData.itemId.sku, name: productData.itemId.name, stock: productData.itemId.stock, salePrice: productData.itemId.salePrice } : null;
        
        if (productData.itemId) {
          itemSearch.value = `${productData.itemId.sku || ''} - ${productData.itemId.name || ''}`;
          itemSelected.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div><strong>${productData.itemId.name || productData.itemId.sku}</strong> <span class="muted">SKU: ${productData.itemId.sku} | Stock: ${productData.itemId.stock || 0}</span></div>
              <button class="combo-product-item-remove-btn danger" style="padding:2px 6px;font-size:10px;">✕</button>
            </div>
          `;
          itemSelected.style.display = 'block';
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
              const existingDropdown = itemSearch.parentElement.querySelector('div[style*="position:absolute"]');
              if (existingDropdown) existingDropdown.remove();
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
                  <div><strong>${item.name}</strong> <span class="muted">SKU: ${item.sku} | Stock: ${item.stock || 0}</span></div>
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
                  itemSelected.style.display = 'none';
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
              const existingDropdown = itemSearch.parentElement.querySelector('div[style*="position:absolute"]');
              if (existingDropdown) existingDropdown.remove();
              return;
            }
            
            // Crear dropdown temporal
            const dropdown = document.createElement('div');
            dropdown.style.cssText = 'position:absolute;z-index:1000;background:var(--card);border:1px solid var(--border);border-radius:6px;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.15);width:100%;margin-top:4px;';
            dropdown.replaceChildren(...items.map(item => {
              const div = document.createElement('div');
              div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);';
              div.innerHTML = `
                <div style="font-weight:600;">${item.name || item.sku}</div>
                <div style="font-size:12px;color:var(--muted);">SKU: ${item.sku} | Stock: ${item.stock || 0}</div>
              `;
              div.addEventListener('click', () => {
                selectedComboItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
                itemIdInput.value = item._id;
                itemSearch.value = `${item.sku} - ${item.name}`;
                itemSelected.innerHTML = `
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div><strong>${item.name}</strong> <span class="muted">SKU: ${item.sku} | Stock: ${item.stock || 0}</span></div>
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
                    itemSelected.style.display = 'none';
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
                    <div><strong>${item.name}</strong> <span class="muted">SKU: ${item.sku} | Stock: ${item.stock || 0}</span></div>
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
                    itemSelected.style.display = 'none';
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
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div><strong>${item.name}</strong> <span class="muted">SKU: ${item.sku} | Stock: ${item.stock || 0}</span></div>
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
                  itemSelected.style.display = 'none';
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
            itemSelected.style.display = 'none';
          };
        }
        
        // Actualizar total cuando cambien precio o cantidad
        row.querySelector('.combo-product-price').addEventListener('input', updateComboTotal);
        row.querySelector('.combo-product-qty').addEventListener('input', updateComboTotal);
        
        comboProductsContainer.appendChild(row);
      }
      
      function updateComboTotal() {
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
        comboProductsContainer.querySelectorAll('.combo-product-open-slot').forEach(checkbox => {
          const row = checkbox.closest('.combo-product-item');
          const itemSection = row.querySelector('.combo-product-item-section');
          checkbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            if (isChecked) {
              itemSection.style.display = 'none';
              const itemIdInput = row.querySelector('.combo-product-item-id');
              const itemSearch = row.querySelector('.combo-product-item-search');
              const itemSelected = row.querySelector('.combo-product-item-selected');
              itemIdInput.value = '';
              itemSearch.value = '';
              itemSelected.style.display = 'none';
              row.style.borderLeft = '4px solid var(--warning, #f59e0b)';
            } else {
              itemSection.style.display = 'block';
              row.style.borderLeft = '';
            }
            updateComboTotal();
          });
        });
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
      if (isCombo) {
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
        saveBtn.textContent = isEdit ? 'Actualizando...' : (selectedVehicles.length > 1 ? `Guardando para ${selectedVehicles.length} vehículos...` : 'Guardando...');
        
        // Preparar datos comunes del payload
        const yearFromInput = node.querySelector('#pe-modal-year-from');
        const yearToInput = node.querySelector('#pe-modal-year-to');
        const yearFrom = yearFromInput?.value?.trim() || null;
        const yearTo = yearToInput?.value?.trim() || null;
        
        const basePayload = {
          name: name,
          type: type,
          total: price,
          yearFrom: yearFrom || null,
          yearTo: yearTo || null
        };
        
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
        
        if (isCombo) {
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
        
        // Si hay múltiples vehículos, crear un precio para cada uno
        let vehiclesToProcess = [];
        if (isEdit) {
          vehiclesToProcess = [selectedVehicle];
        } else {
          // Usar selectedVehicles si tiene elementos, sino usar selectedVehicle
          vehiclesToProcess = selectedVehicles.length > 0 ? selectedVehicles : (selectedVehicle ? [selectedVehicle] : []);
        }
        
        if (vehiclesToProcess.length === 0) {
          msgEl.textContent = 'Debes seleccionar al menos un vehículo';
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
          loadPrices();
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

  // Import / Export
  if (btnExport) {
  btnExport.onclick = async ()=>{
      if(!selectedVehicle) return alert('Selecciona un vehículo');
      try {
        btnExport.disabled = true;
        btnExport.textContent = 'Exportando...';
        const url = `${API.base || ''}/api/v1/prices/export?vehicleId=${selectedVehicle._id}`;
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
        btnExport.textContent = '📤 Exportar';
      }
    };
  }

  if (btnImport) {
    btnImport.onclick = async ()=>{
      if(!selectedVehicle) return alert('Selecciona un vehículo');
      const body=$('#modalBody'), closeBtn=$('#modalClose'); 
      body.replaceChildren();
      
      const node = document.createElement('div');
      node.className = 'card';
      node.innerHTML = `
        <h3>Importar precios</h3>
        <p class="muted" style="margin-bottom:16px;font-size:13px;">
          Vehículo: <strong>${selectedVehicle.make} ${selectedVehicle.line}</strong>
        </p>
        <div style="margin-bottom:16px;">
          <button id="pe-download-template" class="secondary" style="width:100%;padding:10px;margin-bottom:8px;">📥 Descargar plantilla</button>
          <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Seleccionar archivo Excel (.xlsx)</label>
          <input type="file" id="pe-import-file" accept=".xlsx" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        </div>
        <div id="pe-import-msg" style="margin-bottom:16px;font-size:13px;"></div>
        <div class="row" style="gap:8px;">
          <button id="pe-import-run" style="flex:1;padding:10px;">📥 Importar</button>
          <button id="pe-import-cancel" class="secondary" style="flex:1;padding:10px;">Cancelar</button>
        </div>
      `;
      body.appendChild(node);
      
      const fileInput = node.querySelector('#pe-import-file');
      const msgEl = node.querySelector('#pe-import-msg');
      const runBtn = node.querySelector('#pe-import-run');
      const cancelBtn = node.querySelector('#pe-import-cancel');
      const templateBtn = node.querySelector('#pe-download-template');
      
      templateBtn.onclick = async () => {
        try {
          templateBtn.disabled = true;
          const url = `${API.base || ''}/api/v1/prices/import/template?vehicleId=${selectedVehicle._id}`;
          const res = await fetch(url, { headers: { ...(API.token?.get ? { Authorization: `Bearer ${API.token.get()}` } : {}) } });
          if(!res.ok) throw new Error('No se pudo descargar la plantilla');
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `plantilla-precios-${selectedVehicle.make}-${selectedVehicle.line}.xlsx`;
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
          formData.append('vehicleId', selectedVehicle._id);
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

  // Tabs internas (Lista de precios / Vehículos)
  document.querySelectorAll('.payroll-tabs button[data-subtab]').forEach(b => {
    b.addEventListener('click', () => switchSubTab(b.dataset.subtab));
  });

  // Inicializar gestión de vehículos
  initVehicles();

  // Renderizar tabla vacía inicialmente
  renderTableHeader();
}
