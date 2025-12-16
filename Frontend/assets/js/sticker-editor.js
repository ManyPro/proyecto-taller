// Editor dedicado para stickers 5cm x 3cm - Usa el mismo sistema fluido que templates-visual.js
(function () {
  'use strict';

  const PX_PER_CM = 37.795275591;
  let elementIdCounter = 0; // Contador para IDs únicos
  const state = {
    session: null,
    layout: null,
    selectedId: null,
    sample: {
      sku: 'SKU-0001',
      name: 'Producto de ejemplo',
      qr: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140"><rect width="140" height="140" fill="white"/><rect x="10" y="10" width="120" height="120" fill="black"/><rect x="20" y="20" width="100" height="100" fill="white"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="16" font-family="Arial">QR</text></svg>'
    },
    imageFileInput: null
  };

  function cmToPx(cm) {
    return Math.round(cm * PX_PER_CM);
  }

  function defaultLayout() {
    // Canvas: 5cm x 3cm = 189px x 113px aproximadamente
    const canvasWidth = cmToPx(5); // ~189px
    const canvasHeight = cmToPx(3); // ~113px
    
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
    
    return {
      widthCm: 5,
      heightCm: 3,
      elements: [
        { id: 'sku', type: 'text', source: 'sku', x: skuX, y: skuY, w: skuW, h: skuH, fontSize: 11, fontWeight: '700', wrap: true, align: 'flex-start', vAlign: 'flex-start', lineHeight: 1.1 },
        { id: 'name', type: 'text', source: 'name', x: nameX, y: nameY, w: nameW, h: nameH, fontSize: 9, fontWeight: '600', wrap: true, align: 'flex-start', vAlign: 'flex-start', lineHeight: 1.2 },
        { id: 'qr', type: 'image', source: 'qr', x: qrX, y: qrY, w: qrW, h: qrH, fit: 'contain' }
      ]
    };
  }

  function normalizeLayout(raw) {
    const base = defaultLayout();
    if (!raw || typeof raw !== 'object') return base;
    const out = Object.assign({}, base, raw);
    if (!Array.isArray(out.elements) || !out.elements.length) {
      out.elements = base.elements.map((el) => Object.assign({}, el));
    }
    return out;
  }

  function notify(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `fixed top-5 right-5 px-4 py-2 rounded-lg shadow-lg text-white text-sm z-[4000] ${type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 250);
    }, 1800);
  }

  function getCanvas() {
    return document.getElementById('ce-canvas');
  }

  function renderToolbar() {
    const bar = document.getElementById('ce-toolbar');
    if (!bar) return;
    bar.classList.add('sticker-toolbar');
    bar.innerHTML = `
      <div class="flex flex-wrap gap-2 items-center">
        <span class="text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">Elementos:</span>
        <button data-add="sku" class="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">SKU</button>
        <button data-add="name" class="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">Nombre</button>
        <button data-add="qr" class="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">QR</button>
        <button data-add="image" class="px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">Imagen externa</button>
        <button data-add="text" class="px-3 py-2 rounded bg-slate-700 text-white text-sm hover:bg-slate-600 transition-colors">Texto libre</button>
        <span class="ml-3 text-xs text-slate-300 theme-light:text-slate-700">Canvas fijo: 5cm x 3cm</span>
      </div>
    `;
    bar.addEventListener('click', (e) => {
      const type = e.target?.dataset?.add;
      if (!type) return;
      addElement(type);
    });
  }

  function renderSidebar() {
    const varsBox = document.getElementById('var-list');
    const presetBox = document.getElementById('preset-list');
    if (varsBox) varsBox.innerHTML = '<p class="text-sm text-slate-300 theme-light:text-slate-700 mb-2">Selecciona un elemento para ajustar sus propiedades. Todo es arrastrable y redimensionable.</p><div id="sticker-props"></div>';
    if (presetBox) presetBox.innerHTML = '<p class="text-sm text-slate-400 theme-light:text-slate-600">Formato único de sticker 5cm x 3cm</p>';
  }

  function ensureLayout() {
    if (!state.layout) {
      state.layout = defaultLayout();
      return;
    }
    state.layout = normalizeLayout(state.layout);
  }

  // Sincroniza el layout con lo que realmente se ve en el canvas (por si algún cambio
  // de drag/resize/rotación no quedó reflejado en el objeto de layout).
  function syncLayoutFromDOM() {
    ensureLayout();
    const canvas = getCanvas();
    if (!canvas || !state.layout || !Array.isArray(state.layout.elements)) return;

    // Sincronizar dimensiones del canvas también
    const canvasRect = canvas.getBoundingClientRect();
    const canvasWidthPx = canvasRect.width;
    const canvasHeightPx = canvasRect.height;
    // Convertir px a cm para guardar
    const canvasWidthCm = canvasWidthPx / PX_PER_CM;
    const canvasHeightCm = canvasHeightPx / PX_PER_CM;
    if (Number.isFinite(canvasWidthCm) && canvasWidthCm > 0) state.layout.widthCm = canvasWidthCm;
    if (Number.isFinite(canvasHeightCm) && canvasHeightCm > 0) state.layout.heightCm = canvasHeightCm;

    const rectCanvas = canvas.getBoundingClientRect();
    state.layout.elements.forEach((el) => {
      if (!el || !el.id) return;
      const dom = canvas.querySelector(`.st-el[data-id="${el.id}"]`);
      if (!dom) return;
      const r = dom.getBoundingClientRect();
      const x = r.left - rectCanvas.left;
      const y = r.top - rectCanvas.top;
      const w = r.width;
      const h = r.height;
      if (Number.isFinite(x)) el.x = Math.round(x);
      if (Number.isFinite(y)) el.y = Math.round(y);
      if (Number.isFinite(w) && w > 0) el.w = Math.round(w);
      if (Number.isFinite(h) && h > 0) el.h = Math.round(h);
      
      // Sincronizar rotación desde el transform del DOM
      const transform = dom.style.transform || window.getComputedStyle(dom).transform;
      if (transform) {
        const match = transform.match(/rotate\(([-\d.]+)deg\)/i);
        if (match) {
          const deg = parseFloat(match[1]) || 0;
          el.rotation = Math.max(-180, Math.min(180, Math.round(deg)));
        }
      }
    });
  }

  function sampleValue(el) {
    const src = el.source || el.type;
    if (src === 'sku') return state.sample.sku;
    if (src === 'name') return state.sample.name;
    if (src === 'qr-text') return state.sample.sku;
    if (src === 'custom') return el.text || 'Texto';
    return el.text || '';
  }

  function sampleImage(el) {
    const src = el.source || el.type;
    if (src === 'qr') return state.sample.qr;
    if (src === 'item-image') return 'https://via.placeholder.com/150x90.png?text=Img';
    return el.url || 'https://via.placeholder.com/140.png?text=Img';
  }

  function selectElement(id) {
    // Deseleccionar todos
    document.querySelectorAll('.st-el').forEach(el => {
      el.style.border = '2px solid transparent';
      el.style.boxShadow = 'none';
      const handles = el.querySelectorAll('.resize-handle, .drag-handle, .rotate-handle');
      handles.forEach(h => h.style.display = 'none');
    });

    state.selectedId = id;
    
    if (id) {
      const wrapper = document.querySelector(`.st-el[data-id="${id}"]`);
      if (wrapper) {
        wrapper.style.border = '2px solid #2563eb';
        wrapper.style.boxShadow = '0 0 0 1px rgba(37, 99, 235, 0.2)';
        const handles = wrapper.querySelectorAll('.resize-handle, .drag-handle, .rotate-handle');
        handles.forEach(h => h.style.display = 'block');
      }
    }
    
    renderProperties();
  }

  async function addExternalImageElement() {
    // Crear input de archivo si no existe aún
    if (!state.imageFileInput) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.id = 'sticker-image-file';
      input.className = 'hidden';
      document.body.appendChild(input);
      state.imageFileInput = input;
    }

    const fileInput = state.imageFileInput;

    return new Promise((resolve) => {
      const onChange = async () => {
        fileInput.removeEventListener('change', onChange);
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) {
          return resolve();
        }

        try {
          notify('Subiendo imagen...');
          const uploadRes = await (window.API?.mediaUpload ? API.mediaUpload([file]) : null);
          const uploaded = uploadRes && uploadRes.files && uploadRes.files[0];
          if (!uploaded || !uploaded.url) {
            throw new Error('No se pudo subir la imagen');
          }

          ensureLayout();
          const nextId = `el-${Date.now()}-${++elementIdCounter}-${Math.random().toString(36).substr(2, 5)}`;
          const base = { id: nextId, x: 12, y: 12, w: 110, h: 50, fontSize: 12, fontWeight: '600', wrap: true, align: 'flex-start', vAlign: 'center' };
          
          // type:image + source:image + url directa al archivo subido
          state.layout.elements.push({
            ...base,
            type: 'image',
            source: 'image',
            url: uploaded.url || uploaded.path || '',
            // Usar contain por defecto para NO recortar la imagen al redimensionar
            fit: 'contain'
          });

          renderCanvas();
          selectElement(nextId);
        } catch (err) {
          console.error(err);
          notify('No se pudo subir la imagen', 'error');
        } finally {
          resolve();
        }
      };

      fileInput.addEventListener('change', onChange, { once: true });
      fileInput.click();
    });
  }

  function addElement(kind) {
    ensureLayout();
    // Generar ID único usando contador + timestamp + random para evitar colisiones
    const nextId = `el-${Date.now()}-${++elementIdCounter}-${Math.random().toString(36).substr(2, 5)}`;
    const base = { id: nextId, x: 12, y: 12, w: 80, h: 22, fontSize: 12, fontWeight: '600', wrap: true, align: 'flex-start', vAlign: 'center' };
    if (kind === 'sku') state.layout.elements.push({ ...base, type: 'text', source: 'sku', fontWeight: '700', w: 110 });
    else if (kind === 'name') state.layout.elements.push({ ...base, type: 'text', source: 'name', h: 36, wrap: true, lineHeight: 1.1 });
    else if (kind === 'qr') state.layout.elements.push({ ...base, type: 'image', source: 'qr', w: 90, h: 90, fit: 'contain', x: cmToPx(5) - 100, y: 10 });
    else if (kind === 'image') {
      // Para imagen externa, usar flujo de subida desde el computador
      addExternalImageElement();
      return;
    }
    else if (kind === 'text') state.layout.elements.push({ ...base, type: 'text', source: 'custom', text: 'Texto', wrap: true });
    renderCanvas();
    selectElement(nextId);
  }

  // Sistema de drag/resize igual que templates-visual.js (mousedown/mousemove/mouseup directo, sin RAF)
  function makeDraggable(wrapper, el) {
    let isDragging = false;
    let startX, startY, initialX, initialY;
    let dragHandle = null;
    let rotateHandle = null;
    let isRotating = false;
    let startAngleRad = 0;
    let startRotationDeg = 0;
    let centerX = 0, centerY = 0;

    // Drag handle (arriba centro)
    const createDragHandle = () => {
      dragHandle = document.createElement('div');
      dragHandle.className = 'drag-handle';
      dragHandle.style.cssText = `
        position: absolute;
        top: -10px;
        left: 50%;
        transform: translateX(-50%);
        width: 20px;
        height: 20px;
        background: #2563eb;
        border: 2px solid white;
        border-radius: 50%;
        cursor: move;
        display: none;
        z-index: 1001;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `;
      wrapper.appendChild(dragHandle);
      return dragHandle;
    };

    // Rotate handle (arriba derecha)
    const createRotateHandle = () => {
      rotateHandle = document.createElement('div');
      rotateHandle.className = 'rotate-handle';
      rotateHandle.style.cssText = `
        position: absolute;
        top: -10px;
        right: -10px;
        width: 20px;
        height: 20px;
        background: #10b981;
        border: 2px solid white;
        border-radius: 50%;
        cursor: grab;
        display: none;
        z-index: 1001;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `;
      rotateHandle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" style="pointer-events:none; margin:1px; fill:white"><path d="M7.1 7.1A7 7 0 0 1 19 12h2a9 9 0 1 0-2.64 6.36l-1.42-1.42A7 7 0 1 1 7.1 7.1zM13 3v6h6l-2.24-2.24A7.97 7.97 0 0 0 13 3z"/></svg>';
      wrapper.appendChild(rotateHandle);
      // Agregar listener DESPUÉS de crear el handle
      rotateHandle.addEventListener('mousedown', startRotate);
      return rotateHandle;
    };

    // Resize handles (4 esquinas)
    const addResizeHandles = () => {
      const handles = ['nw', 'ne', 'sw', 'se'];
      handles.forEach(position => {
        const handle = document.createElement('div');
        handle.className = `resize-handle resize-${position}`;
        handle.style.cssText = `
          position: absolute;
          width: 10px;
          height: 10px;
          background: #2563eb;
          border: 2px solid white;
          cursor: ${position === 'nw' || position === 'se' ? 'nw' : 'ne'}-resize;
          display: none;
          z-index: 10000;
          box-shadow: 0 2px 4px rgba(0,0,0,0.4);
          pointer-events: auto;
          user-select: none;
        `;
        switch(position) {
          case 'nw': handle.style.top = '-5px'; handle.style.left = '-5px'; break;
          case 'ne': handle.style.top = '-5px'; handle.style.right = '-5px'; break;
          case 'sw': handle.style.bottom = '-5px'; handle.style.left = '-5px'; break;
          case 'se': handle.style.bottom = '-5px'; handle.style.right = '-5px'; break;
        }
        wrapper.appendChild(handle);
        setupResizeHandle(handle, wrapper, el, position);
      });
    };

    // Show/hide handles on hover/selection
    wrapper.addEventListener('mouseenter', () => {
      if (!dragHandle) dragHandle = createDragHandle();
      if (!rotateHandle) rotateHandle = createRotateHandle();
      if (state.selectedId === el.id) {
        dragHandle.style.display = 'block';
        rotateHandle.style.display = 'block';
        wrapper.querySelectorAll('.resize-handle').forEach(h => h.style.display = 'block');
      }
    });

    wrapper.addEventListener('mouseleave', () => {
      if (dragHandle && !isDragging) dragHandle.style.display = 'none';
      if (rotateHandle && !isRotating) rotateHandle.style.display = 'none';
      if (!isDragging) wrapper.querySelectorAll('.resize-handle').forEach(h => h.style.display = 'none');
    });

    // Drag start
    const startDrag = (e) => {
      if (e.target === rotateHandle || rotateHandle?.contains(e.target)) return;
      if (e.target.classList.contains('resize-handle') || e.target.closest('.resize-handle')) return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = wrapper.getBoundingClientRect();
      const canvasRect = wrapper.parentElement.getBoundingClientRect();
      initialX = rect.left - canvasRect.left;
      initialY = rect.top - canvasRect.top;
      
      wrapper.style.zIndex = '1000';
      wrapper.style.userSelect = 'none';
      selectElement(el.id);
      
      if (dragHandle) dragHandle.style.display = 'block';
      
      e.preventDefault();
      e.stopPropagation();
    };

    // Drag move (directo, sin RAF)
    const doDrag = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const newLeft = initialX + deltaX;
      const newTop = initialY + deltaY;
      
      el.x = Math.max(0, newLeft);
      el.y = Math.max(0, newTop);
      
      wrapper.style.left = el.x + 'px';
      wrapper.style.top = el.y + 'px';
      
      e.preventDefault();
    };

    // Drag end
    const endDrag = () => {
      if (isDragging) {
        isDragging = false;
        wrapper.style.zIndex = '';
        wrapper.style.userSelect = 'auto';
        if (dragHandle) dragHandle.style.display = 'none';
        renderProperties();
      }
    };

    // Rotate
    const doRotate = (e) => {
      if (!isRotating) return;
      const currentAngleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const deltaDeg = (currentAngleRad - startAngleRad) * (180 / Math.PI);
      const newDeg = startRotationDeg + deltaDeg;
      const d = Math.max(-180, Math.min(180, Math.round(newDeg)));
      wrapper.style.transform = `rotate(${d}deg)`;
      wrapper.style.transformOrigin = 'center center';
      // Guardar rotación en el objeto del elemento para persistencia
      el.rotation = d;
      e.preventDefault();
    };

    const endRotate = () => {
      if (isRotating) {
        isRotating = false;
        if (rotateHandle) rotateHandle.style.cursor = 'grab';
        if (rotateHandle && !wrapper.matches(':hover')) rotateHandle.style.display = 'none';
        // Asegurar que la rotación final se guarde
        const t = wrapper.style.transform || '';
        const m = t.match(/rotate\(([-\d.]+)deg\)/i);
        if (m) {
          const finalDeg = parseFloat(m[1]) || 0;
          el.rotation = Math.max(-180, Math.min(180, Math.round(finalDeg)));
        }
        renderProperties(); // Actualizar propiedades para reflejar la rotación
      }
      document.removeEventListener('mousemove', doRotate);
      document.removeEventListener('mouseup', endRotate);
    };

    const startRotate = (e) => {
      e.stopPropagation();
      e.preventDefault();
      isRotating = true;
      if (rotateHandle) rotateHandle.style.cursor = 'grabbing';
      const rect = wrapper.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      startAngleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      // Obtener rotación inicial desde el objeto del elemento o del estilo
      startRotationDeg = el.rotation != null ? Number(el.rotation) : 0;
      const t = wrapper.style.transform || '';
      const m = t.match(/rotate\(([-\d.]+)deg\)/i);
      if (m) {
        const currentDeg = parseFloat(m[1]) || 0;
        startRotationDeg = currentDeg;
        // Sincronizar con el objeto si no estaba guardado
        if (el.rotation == null) el.rotation = currentDeg;
      }
      document.addEventListener('mousemove', doRotate);
      document.addEventListener('mouseup', endRotate);
    };

    wrapper.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);
    
    // Nota: el listener de rotateHandle se agrega dentro de createRotateHandle()
    // cuando se crea el handle, no aquí cuando rotateHandle es null
    
    addResizeHandles();

    // Permite limpiar listeners cuando se destruye el wrapper
    wrapper._dragCleanup = () => {
      wrapper.removeEventListener('mousedown', startDrag);
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', endDrag);
      if (rotateHandle) {
        rotateHandle.removeEventListener('mousedown', startRotate);
      }
      document.removeEventListener('mousemove', doRotate);
      document.removeEventListener('mouseup', endRotate);
      // Limpiar también los handlers de resize
      wrapper.querySelectorAll('.resize-handle').forEach(handle => {
        // Los resize handles se limpian automáticamente al destruir el wrapper
      });
    };
  }

  function setupResizeHandle(handle, wrapper, el, position) {
    let isResizing = false;
    let startX, startY, startWidth, startHeight, startLeft, startTop;
    
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = wrapper.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      
      const canvas = wrapper.closest('#ce-canvas');
      if (canvas) {
        const canvasRect = canvas.getBoundingClientRect();
        startLeft = rect.left - canvasRect.left;
        startTop = rect.top - canvasRect.top;
      } else {
        startLeft = el.x;
        startTop = el.y;
      }
      
      document.body.style.cursor = handle.style.cursor;
      document.body.style.userSelect = 'none';
      
      document.addEventListener('mousemove', handleResize, true);
      document.addEventListener('mouseup', stopResize, true);
    });
    
    const handleResize = (e) => {
      if (!isResizing) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;
      
      switch(position) {
        case 'nw':
          newWidth = Math.max(10, startWidth - deltaX);
          newHeight = Math.max(10, startHeight - deltaY);
          newLeft = startLeft + (startWidth - newWidth);
          newTop = startTop + (startHeight - newHeight);
          break;
        case 'ne':
          newWidth = Math.max(10, startWidth + deltaX);
          newHeight = Math.max(10, startHeight - deltaY);
          newTop = startTop + (startHeight - newHeight);
          break;
        case 'sw':
          newWidth = Math.max(10, startWidth - deltaX);
          newHeight = Math.max(10, startHeight + deltaY);
          newLeft = startLeft + (startWidth - newWidth);
          break;
        case 'se':
          newWidth = Math.max(10, startWidth + deltaX);
          newHeight = Math.max(10, startHeight + deltaY);
          break;
      }
      
      el.w = newWidth;
      el.h = newHeight;
      el.x = newLeft;
      el.y = newTop;
      
      wrapper.style.width = newWidth + 'px';
      wrapper.style.height = newHeight + 'px';
      wrapper.style.left = newLeft + 'px';
      wrapper.style.top = newTop + 'px';
    };
    
    const stopResize = (e) => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', handleResize, true);
        document.removeEventListener('mouseup', stopResize, true);
        renderProperties();
      }
    };
  }

  function renderCanvas() {
    ensureLayout();
    const canvas = getCanvas();
    if (!canvas) return;
    const widthPx = cmToPx(state.layout.widthCm || state.layout.width || 5);
    const heightPx = cmToPx(state.layout.heightCm || state.layout.height || 3);
    
    canvas.classList.add('sticker-mode');

    // Limpiar listeners asociados a wrappers anteriores antes de destruirlos
    canvas.querySelectorAll('.st-el').forEach((node) => {
      if (typeof node._dragCleanup === 'function') {
        try {
          node._dragCleanup();
        } catch (_) {
          // ignorar errores de limpieza
        }
      }
    });

    canvas.style.cssText = `
      margin: 24px auto 32px;
      display: block;
      padding: 0;
      width: ${widthPx}px;
      height: ${heightPx}px;
      position: relative;
      background: #ffffff;
      border: 2px dashed #64748b;
      box-sizing: border-box;
      border-radius: 8px;
    `;
    canvas.innerHTML = '';

    state.layout.elements.forEach((el) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'st-el tpl-element';
      wrapper.dataset.id = el.id;
      
      // Aplicar rotación si existe
      const rotation = el.rotation != null ? Number(el.rotation) : 0;
      const transform = rotation !== 0 ? `rotate(${rotation}deg)` : '';
      
      wrapper.style.cssText = `
        position: absolute;
        left: ${el.x}px;
        top: ${el.y}px;
        width: ${el.w}px;
        height: ${el.h}px;
        box-sizing: border-box;
        overflow: hidden;
        border: 2px solid transparent;
        background: transparent;
        cursor: move;
        z-index: 1;
        ${transform ? `transform: ${transform}; transform-origin: center center;` : ''}
      `;

      if (el.type === 'image') {
        const img = document.createElement('img');
        img.src = sampleImage(el);
        img.alt = el.source || '';
        // MUY IMPORTANTE: que la imagen siempre se adapte al tamaño del wrapper,
        // para que al redimensionar el cuadro la imagen crezca/disminuya con él.
        img.style.cssText = `
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          object-fit: ${el.fit || 'contain'};
          display: block;
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        `;
        wrapper.appendChild(img);
      } else {
        // Para texto: estructura que permita wrap y ocupe espacio vertical
        const textContent = sampleValue(el);
        const wrapEnabled = el.wrap !== false;
        
        if (wrapEnabled) {
          // Con wrap: usar flex column para que el texto ocupe el espacio vertical disponible
          wrapper.style.cssText += `
            display: flex;
            flex-direction: column;
            align-items: ${el.align === 'flex-end' ? 'flex-end' : el.align === 'center' ? 'center' : 'flex-start'};
            justify-content: ${el.vAlign === 'flex-end' ? 'flex-end' : el.vAlign === 'center' ? 'center' : 'flex-start'};
            padding: 2px;
            margin: 0;
          `;
          // Contenedor interno para el texto que permite wrap y ocupa todo el espacio vertical
          const textInner = document.createElement('div');
          textInner.textContent = textContent;
          textInner.style.cssText = `
            width: 100%;
            max-width: 100%;
            flex: 1 1 auto;
            font-size: ${el.fontSize || 12}px;
            font-weight: ${el.fontWeight || '600'};
            line-height: ${el.lineHeight || 1.1};
            color: ${el.color || '#000'};
            white-space: normal;
            word-wrap: break-word;
            word-break: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            overflow: hidden;
            display: block;
            min-width: 0;
            min-height: 0;
          `;
          wrapper.appendChild(textInner);
        } else {
          // Sin wrap: mantener en una línea con ellipsis si es necesario
          wrapper.style.cssText += `
            display: flex;
            align-items: ${el.vAlign || 'center'};
            justify-content: ${el.align || 'flex-start'};
            font-size: ${el.fontSize || 12}px;
            font-weight: ${el.fontWeight || '600'};
            line-height: ${el.lineHeight || 1.1};
            color: ${el.color || '#000'};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding: 0;
            margin: 0;
          `;
          wrapper.textContent = textContent;
        }
      }

      makeDraggable(wrapper, el);
      wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        selectElement(el.id);
      });

      canvas.appendChild(wrapper);
    });

    // Evitar acumular listeners: solo registrar uno por canvas
    if (!canvas._stickerClickHandler) {
      const handler = (e) => {
        if (e.target === canvas) {
          selectElement(null);
        }
      };
      canvas.addEventListener('click', handler);
      canvas._stickerClickHandler = handler;
    }
  }

  function renderProperties(skipSelectSync = false) {
    const box = document.getElementById('sticker-props');
    if (!box) return;
    const el = state.layout.elements.find((e) => e.id === state.selectedId);
    if (!el) {
      box.innerHTML = '<p class="text-sm text-slate-400 theme-light:text-slate-600">Selecciona un elemento.</p>';
      return;
    }
    box.innerHTML = `
      <div class="space-y-2 text-sm text-slate-200 theme-light:text-slate-800">
        <div class="flex justify-between items-center">
          <span class="font-semibold">Propiedades</span>
          <button id="st-del" class="text-red-500 hover:text-red-400">Eliminar</button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1">X (px)<input id="st-x" type="number" value="${el.x}" class="input-lite"/></label>
          <label class="flex flex-col gap-1">Y (px)<input id="st-y" type="number" value="${el.y}" class="input-lite"/></label>
          <label class="flex flex-col gap-1">Ancho (px)<input id="st-w" type="number" value="${el.w}" class="input-lite"/></label>
          <label class="flex flex-col gap-1">Alto (px)<input id="st-h" type="number" value="${el.h}" class="input-lite"/></label>
        </div>
        ${el.type === 'text' ? `
          <label class="flex flex-col gap-1">Tamaño fuente (px)<input id="st-fs" type="number" value="${el.fontSize || 12}" class="input-lite"/></label>
          <label class="flex flex-col gap-1">Peso (400-800)<input id="st-fw" type="number" value="${parseInt(el.fontWeight || 600, 10)}" class="input-lite"/></label>
          <label class="flex flex-col gap-1">Color<input id="st-color" type="color" value="${el.color || '#000000'}" class="input-lite"/></label>
          ${el.source === 'custom' ? `<label class="flex flex-col gap-1">Texto<input id="st-text" type="text" value="${el.text || ''}" class="input-lite"/></label>` : ''}
        ` : `
          <label class="flex flex-col gap-1">Modo ajuste
            <select id="st-fit" class="input-lite">
              <option value="contain" ${el.fit === 'contain' ? 'selected' : ''}>Contain</option>
              <option value="cover" ${el.fit === 'cover' ? 'selected' : ''}>Cover</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">URL imagen (opcional)
            <input id="st-url" type="text" value="${el.url || ''}" class="input-lite" placeholder="https://..."/>
          </label>
        `}
      </div>
    `;

    if (skipSelectSync) return;
    const bind = (id, fn) => { const elDom = document.getElementById(id); if (elDom) elDom.oninput = fn; };
    bind('st-x', (e) => { el.x = Number(e.target.value) || 0; renderCanvas(); selectElement(el.id); });
    bind('st-y', (e) => { el.y = Number(e.target.value) || 0; renderCanvas(); selectElement(el.id); });
    bind('st-w', (e) => { el.w = Math.max(10, Number(e.target.value) || 0); renderCanvas(); selectElement(el.id); });
    bind('st-h', (e) => { el.h = Math.max(10, Number(e.target.value) || 0); renderCanvas(); selectElement(el.id); });
    bind('st-fs', (e) => { el.fontSize = Math.max(6, Number(e.target.value) || 0); renderCanvas(); selectElement(el.id); });
    bind('st-fw', (e) => { el.fontWeight = String(e.target.value || '600'); renderCanvas(); selectElement(el.id); });
    bind('st-color', (e) => { el.color = e.target.value || '#000000'; renderCanvas(); selectElement(el.id); });
    bind('st-text', (e) => { el.text = e.target.value || ''; renderCanvas(); selectElement(el.id); });
    bind('st-fit', (e) => { el.fit = e.target.value || 'contain'; renderCanvas(); selectElement(el.id); });
    bind('st-url', (e) => { el.url = e.target.value || ''; renderCanvas(); selectElement(el.id); });
    const del = document.getElementById('st-del');
    if (del) del.onclick = () => {
      state.layout.elements = state.layout.elements.filter((x) => x.id !== el.id);
      state.selectedId = null;
      renderCanvas();
      renderProperties();
    };
  }

  async function loadExisting(session) {
    if (session.action !== 'edit' || !session.formatId) {
      state.layout = defaultLayout();
      renderCanvas();
      renderProperties();
      return;
    }
    try {
      const tpl = await (window.API?.templates?.get
        ? API.templates.get(session.formatId)
        : Promise.reject(new Error('API.templates.get no disponible')));
      const meta = tpl?.meta || {};
      state.layout = normalizeLayout(meta.layout || defaultLayout());
      if (!state.layout.widthCm && meta.width) state.layout.widthCm = meta.width;
      if (!state.layout.heightCm && meta.height) state.layout.heightCm = meta.height;
    } catch (e) {
      console.error('⚠️ No se pudo cargar el formato, usando layout por defecto', e);
      state.layout = defaultLayout();
    }
    renderCanvas();
    renderProperties();
  }

  function buildPayload() {
    // Asegurar que el layout refleje exactamente lo que se ve en el canvas
    syncLayoutFromDOM();
    const meta = {
      width: state.layout.widthCm || 5,
      height: state.layout.heightCm || 3,
      layout: state.layout
    };
    return {
      type: state.session.type,
      name: state.session.name || 'Sticker',
      contentHtml: '',
      contentCss: '',
      activate: true,
      meta,
      layout: state.layout
    };
  }

  async function saveTemplate() {
    const payload = buildPayload();
    try {
      if (state.session.action === 'edit' && state.session.formatId) {
        await API.templates.update(state.session.formatId, payload);
      } else {
        const created = await API.templates.create(payload);
        state.session.formatId = created?._id;
        state.session.action = 'edit';
      }
      notify('Plantilla de sticker guardada');
    } catch (err) {
      console.error(err);
      notify('No se pudo guardar la plantilla', 'error');
    }
  }

  async function previewTemplate() {
    const payload = {
      type: state.session.type,
      layout: state.layout,
      meta: { width: state.layout.widthCm || 5, height: state.layout.heightCm || 3 }
    };
    try {
      const pv = await API.templates.preview(payload);
      const overlay = document.getElementById('preview-overlay');
      const frame = document.getElementById('preview-frame');
      if (frame && pv?.rendered) {
        const doc = frame.contentDocument || frame.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(`<html><head><style>body{margin:0;padding:20px;display:flex;justify-content:center;align-items:center;background:#f8fafc;} .sticker-wrapper{box-shadow:0 0 0 1px #e2e8f0;}</style></head><body>${pv.rendered}</body></html>`);
          doc.close();
        }
      }
      if (overlay) overlay.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      notify('No se pudo generar la vista previa', 'error');
    }
  }

  function bindActions() {
    const saveBtn = document.getElementById('save-template');
    const prevBtn = document.getElementById('preview-template');
    if (saveBtn) saveBtn.onclick = saveTemplate;
    if (prevBtn) prevBtn.onclick = previewTemplate;

    const closePrev = document.getElementById('preview-close');
    const overlay = document.getElementById('preview-overlay');
    if (closePrev && overlay) {
      closePrev.onclick = () => overlay.classList.add('hidden');
    }
  }

  async function init() {
    try {
      const params = new URLSearchParams(window.location.search);
      const type = params.get('type') || 'sticker-qr';
      const action = params.get('action') || 'create';
      const formatId = params.get('formatId');
      const formatName = params.get('formatName') || 'Sticker';
      if (!type.includes('sticker')) {
        return;
      }

      state.session = { type, action, formatId, name: formatName };
      window.currentTemplateSession = state.session;

      ensureStickerStyles();

      const appSection = document.getElementById('appSection');
      if (appSection) appSection.classList.remove('hidden');

      renderToolbar();
      renderSidebar();
      bindActions();
      await loadExisting(state.session);
    } catch (err) {
      console.error('Sticker editor init failed, usando canvas vacío', err);
      try {
        const appSection = document.getElementById('appSection');
        if (appSection) appSection.classList.remove('hidden');
        state.layout = defaultLayout();
        renderToolbar();
        renderSidebar();
        bindActions();
        renderCanvas();
        renderProperties();
      } catch (_) {
      }
    }
  }

  // Asegurar que el editor se inicialice aunque el script cargue tarde
  if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM ya listo: ejecutar en el próximo tick
    setTimeout(init, 0);
  }

  function ensureStickerStyles(){
    if (document.getElementById('sticker-editor-style')) return;
    const css = `
      body.sticker-mode #custom-editor,
      body .sticker-mode-shell {
        max-width: 900px;
        margin: 0 auto;
      }
      #ce-toolbar.sticker-toolbar{
        gap:10px;
        border-radius: 10px 10px 0 0;
        padding: 12px;
        background: var(--card-alt, rgba(17, 24, 39, 0.5));
        border: 1px solid var(--border, rgba(31, 41, 55, 0.5));
        margin-bottom: 10px;
      }
      #ce-canvas.sticker-mode{
        background:#ffffff;
        border:2px dashed #64748b;
        box-shadow:0 10px 30px rgba(0,0,0,0.12);
        padding:0;
      }
      #ce-canvas.sticker-mode .st-el{
        transition: box-shadow 120ms ease;
      }
      #ce-canvas.sticker-mode .st-el:hover{
        box-shadow:0 0 0 1px rgba(37, 99, 235, 0.3);
      }
      #ce-canvas.sticker-mode .st-el.tpl-element {
        border: 2px solid transparent;
      }
      #ce-canvas.sticker-mode .st-el.tpl-element:hover {
        border-color: rgba(37, 99, 235, 0.4);
      }
    `;
    const style = document.createElement('style');
    style.id = 'sticker-editor-style';
    style.textContent = css;
    document.head.appendChild(style);
    document.body.classList.add('sticker-mode');
  }
})();
