// Editor Visual de Plantillas Completo para templates.html
// Sistema drag & drop con propiedades de texto, imágenes y elementos

(function(){
  'use strict';
  
  // State
  const state = {
    templates: [],
    editing: null,
    mode: 'visual',
    safeMargins: { enabled: false, insetCm: 0.2 },
    exampleSnippets: {
      invoice: '',
      quote: '',
      workOrder: '',
      sticker: ''
    }
  };

  // Visual Editor State
  const visualEditor = {
    selectedElement: null,
    draggedElement: null,
    elements: [],
    nextId: 1,
    copiedElement: null,
    lastDeletedElement: null
  };

  // Font families
  const FONTS = [
    'Arial, sans-serif',
    'Times New Roman, serif', 
    'Calibri, sans-serif',
    'Helvetica, sans-serif',
    'Georgia, serif'
  ];

  // Utility functions
  function qs(sel, ctx = document) {
    return ctx.querySelector(sel);
  }

  function getActiveParent() {
    const canvas = qs('#ce-canvas');
    if (!canvas) return null;
    if (typeof state !== 'undefined' && state.pages && state.pages.count > 1) {
      const page = getPageEl(state.pages.current);
      return page || canvas;
    }
    return canvas;
  }

  function getSafeInsetPx() {
    if (!state.safeMargins || !state.safeMargins.enabled) return 0;
    return Math.round((state.safeMargins.insetCm || 0.2) * 37.795275591);
  }

  function showQuickNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const colors = {
      'success': '#28a745',
      'error': '#dc3545', 
      'info': '#17a2b8',
      'warning': '#ffc107'
    };
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${colors[type] || colors.info};
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      z-index: 3000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideInFromRight 0.3s ease-out;
      max-width: 350px;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOutToRight 0.3s ease-in';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 3000);
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    console.log('🎨 Inicializando Editor Visual Completo...');
    
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const documentType = urlParams.get('type');
    const action = urlParams.get('action');
    const formatId = urlParams.get('formatId');
    const formatName = urlParams.get('formatName');
    
    // If no parameters, redirect to selector
    if (!documentType || !action) {
      console.log('🔄 Redirigiendo a selector de formato...');
      window.location.replace('template-selector.html');
      return;
    }

    // Store current session info
    window.currentTemplateSession = {
      type: documentType,
      action: action,
      formatId: formatId,
      name: formatName || null
    };
    
    console.log('📋 Sesión de plantilla:', window.currentTemplateSession);
    
    // Wait for appSection to be visible before initializing
    waitForAppSection(() => {
      console.log('✅ appSection visible, procediendo con inicialización...');
      initializeEditor();
    });
  });

  // Helper function to wait for appSection to be visible
  function waitForAppSection(callback) {
    const appSection = document.getElementById('appSection');
    if (!appSection) {
      console.warn('⚠️ appSection no encontrado, esperando...');
      setTimeout(() => waitForAppSection(callback), 100);
      return;
    }
    
    // Check if already visible
    if (!appSection.classList.contains('hidden')) {
      callback();
      return;
    }
    
    // Wait for it to become visible
    const observer = new MutationObserver((mutations) => {
      if (!appSection.classList.contains('hidden')) {
        observer.disconnect();
        callback();
      }
    });
    
    observer.observe(appSection, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    // Fallback: try after a delay
    setTimeout(() => {
      if (!appSection.classList.contains('hidden')) {
        observer.disconnect();
        callback();
      } else {
        console.warn('⚠️ appSection sigue oculto después de esperar, inicializando de todos modos...');
        observer.disconnect();
        callback();
      }
    }, 2000);
  }

  function initializeEditor() {
    try {
      // Setup visual editor
      setupVisualEditor();
      setupVariables();
      setupKeyboardShortcuts();
      
      // Add environment indicator
      addEnvironmentIndicator();
      
      // Add session header
      const session = window.currentTemplateSession;
      addSessionHeader(session.type, session.action, session.formatId);
      
      // Load format based on action
      console.log(`🔌 Acción: ${session.action}, Tipo: ${session.type}`);
      
      // Asegurar que el canvas esté visible ANTES de cargar
      const canvas = qs('#ce-canvas');
      if (canvas) {
        canvas.style.display = 'block';
        canvas.style.visibility = 'visible';
        canvas.style.background = '#ffffff';
      }
      
      setTimeout(() => {
        if (session.action === 'edit' && session.formatId) {
          loadExistingFormat(session.formatId);
        } else if (session.action === 'create') {
          console.log('📝 Creando nueva plantilla, cargando template por defecto...');
          loadDefaultTemplate(session.type);
        } else {
          // Si no hay acción específica pero hay tipo, cargar plantilla por defecto
          console.log('📝 Cargando plantilla por defecto sin acción específica...');
          loadDefaultTemplate(session.type);
        }
      }, 800); // Aumentar delay para asegurar que el DOM esté listo
      
    } catch (error) {
      console.error('❌ Error inicializando editor:', error);
      showQuickNotification('❌ Error al inicializar el editor', 'error');
    }
  }

  function setupVisualEditor() {
    console.log('Configurando editor visual...');
    
    let canvas = qs('#ce-canvas');
    
    if (!canvas) {
      console.warn('Canvas #ce-canvas no encontrado, creando uno nuevo');
      const container = qs('#custom-editor') || qs('body');
      canvas = document.createElement('div');
      canvas.id = 'ce-canvas';
      canvas.className = 'ce-canvas';
      container.appendChild(canvas);
    }

    // Make canvas suitable for visual editing - FONDO BLANCO OBLIGATORIO
    canvas.style.cssText = `
      border: 2px dashed #ccc;
      padding: 20px;
      position: relative;
      background: #ffffff !important;
      color: #333;
      overflow: visible;
      border-radius: 8px;
      margin: 10px 0;
      min-height: 600px;
      width: 100%;
      box-sizing: border-box;
    `;

    canvas.contentEditable = 'false';
    // No mostrar placeholder inicial - se cargará la plantilla automáticamente
    canvas.innerHTML = '';

    // Setup button handlers
    setupButtonHandlers();

    // Canvas click handler
    canvas.onclick = (e) => {
      if (e.target === canvas) {
        selectElement(null);
      }
    };
    
    console.log('✅ Canvas configurado correctamente');
  }

  function setupButtonHandlers() {
    console.log('Configurando manejadores de botones...');
    createEditorButtons();
    console.log('✅ Manejadores de botones configurados');
  }

  function createEditorButtons() {
    console.log('Creando botones del editor...');
    
    let toolbar = qs('#ce-toolbar') || qs('.ce-toolbar') || qs('.editor-toolbar') || qs('.toolbar');
    
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'ce-toolbar';
      toolbar.className = 'ce-toolbar editor-toolbar';
      
      const canvas = qs('#ce-canvas');
      const container = qs('#custom-editor') || canvas?.parentNode || document.body;
      
      if (canvas) {
        container.insertBefore(toolbar, canvas);
      } else {
        container.appendChild(toolbar);
      }
    }

    toolbar.style.cssText = 'padding: 12px; background: var(--card-alt); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; box-shadow: var(--shadow-elev);';

    toolbar.innerHTML = `
      <style>
        .toolbar-btn {
          padding: 10px 14px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          margin: 2px;
          transition: transform .2s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .toolbar-btn.primary { background: var(--accent); color: var(--text-invert); border: 0; }
        .toolbar-btn.secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
        .toolbar-btn.danger { background: #ef4444; color: #fff; border: 0; }
        .toolbar-btn.warn { background: #f59e0b; color: #111827; border: 0; }
        .toolbar-btn:hover { transform: translateY(-1px); }
        .toolbar-sep { border-left: 2px solid var(--border); padding-left: 12px; margin-left: 12px; display: inline-flex; align-items: center; gap: 6px; }
      </style>
      
      <button id="add-title-btn" class="toolbar-btn primary">📄 Título</button>
      <button id="add-text-btn" class="toolbar-btn primary">📝 Texto</button>
      <button id="add-image-btn" class="toolbar-btn secondary">🖼️ Imagen</button>
      <button id="add-table-btn" class="toolbar-btn secondary">📊 Tabla</button>
      <button id="add-items-table-btn" class="toolbar-btn secondary">📋 Items</button>
      
      <div class="toolbar-sep">
        <button id="delete-selected-btn" class="toolbar-btn danger" title="Eliminar elemento seleccionado">🗑️ Eliminar</button>
        <button id="clear-canvas-btn" class="toolbar-btn secondary">🧹 Limpiar Todo</button>
      </div>
    `;

    // Setup button handlers
    qs('#add-title-btn').onclick = () => addElement('title');
    qs('#add-text-btn').onclick = () => addElement('text');
    qs('#add-image-btn').onclick = () => addElement('image');
    qs('#add-table-btn').onclick = () => addElement('table');
    qs('#add-items-table-btn').onclick = () => addItemsTable();
    qs('#delete-selected-btn').onclick = () => {
      if (visualEditor.selectedElement) {
        if (confirm('¿Estás seguro de que quieres eliminar el elemento seleccionado?')) {
          deleteElementSafely(visualEditor.selectedElement);
        }
      }
    };
    qs('#clear-canvas-btn').onclick = clearCanvas;
  }

  function addElement(type) {
    const parent = getActiveParent();
    if (!parent) return;

    const canvas = qs('#ce-canvas');
    if (parent === canvas) {
      const ph = canvas.querySelector('#ce-placeholder');
      if (ph) ph.remove();
      if (canvas.innerHTML.includes('Haz clic en los botones')) canvas.innerHTML = '';
    }

    const id = `element_${visualEditor.nextId++}`;
    const element = document.createElement('div');
    element.id = id;
    element.className = 'tpl-element';
    element.style.cssText = 'position: absolute; cursor: move; border: 2px solid transparent;';

    const inset = getSafeInsetPx();
    switch (type) {
      case 'text':
        element.innerHTML = '<span contenteditable="true" style="font-family: Arial; font-size: 14px; color: #333;">Texto editable - Haz clic para editar</span>';
        element.style.left = (inset || 20) + 'px';
        element.style.top = (inset || 20) + 'px';
        break;
        
      case 'title':
        element.innerHTML = '<h2 contenteditable="true" style="font-family: Arial; font-size: 24px; color: #2563eb; margin: 0;">Título Principal</h2>';
        element.style.left = (inset || 20) + 'px';
        element.style.top = (inset || 20) + 'px';
        break;
        
      case 'image':
        element.innerHTML = '<div class="image-placeholder" style="width: 150px; height: 100px; background: #f0f0f0; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; color: #666;">Haz clic para agregar imagen</div>';
        element.style.left = (inset || 20) + 'px';
        element.style.top = ((inset || 20) + 60) + 'px';
        element.style.padding = '0';
        element.style.minWidth = '0';
        element.style.minHeight = '0';
        break;
        
      case 'table':
        element.innerHTML = `
          <table style="border-collapse: collapse; width: 100%;">
            <thead>
              <tr>
                <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;" contenteditable="true">Cantidad</th>
                <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;" contenteditable="true">Descripción</th>
                <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;" contenteditable="true">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;" contenteditable="true">1</td>
                <td style="border: 1px solid #ddd; padding: 8px;" contenteditable="true">Servicio ejemplo</td>
                <td style="border: 1px solid #ddd; padding: 8px;" contenteditable="true">$100.00</td>
              </tr>
            </tbody>
          </table>`;
        element.style.left = (inset || 20) + 'px';
        element.style.top = ((inset || 20) + 120) + 'px';
        break;
    }

    // Make element draggable and selectable
    makeDraggable(element);
    makeSelectable(element);

    // Add image upload functionality for image elements
    if (type === 'image') {
      setupImageUpload(element);
    }

    parent.appendChild(element);
    selectElement(element);
    
    visualEditor.elements.push({
      id: id,
      type: type,
      element: element
    });
  }

  function makeDraggable(element) {
    let isDragging = false;
    let startX, startY, initialX, initialY;
    let dragHandle = null;
    let isRotating = false;
    let rotateHandle = null;
    let startAngleRad = 0;
    let startRotationDeg = 0;
    let centerX = 0, centerY = 0;

    // Create drag handle
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
      element.appendChild(dragHandle);
      return dragHandle;
    };

    // Rotation handle
    const doRotate = (e) => {
      if (!isRotating) return;
      const currentAngleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const deltaDeg = (currentAngleRad - startAngleRad) * (180 / Math.PI);
      const newDeg = startRotationDeg + deltaDeg;
      setRotationDeg(element, newDeg);
      const rotRange = qs('#prop-rotate');
      const rotInput = qs('#prop-rotate-input');
      if (rotRange) rotRange.value = String(getRotationDeg(element));
      if (rotInput) rotInput.value = String(getRotationDeg(element));
      e.preventDefault();
    };

    const endRotate = () => {
      if (isRotating) {
        isRotating = false;
        if (rotateHandle) rotateHandle.style.cursor = 'grab';
        if (rotateHandle && !element.matches(':hover')) rotateHandle.style.display = 'none';
      }
      document.removeEventListener('mousemove', doRotate);
      document.removeEventListener('mouseup', endRotate);
    };

    const startRotate = (e) => {
      e.stopPropagation();
      e.preventDefault();
      isRotating = true;
      if (rotateHandle) rotateHandle.style.cursor = 'grabbing';
      const rect = element.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      startAngleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      startRotationDeg = getRotationDeg(element);
      document.addEventListener('mousemove', doRotate);
      document.addEventListener('mouseup', endRotate);
    };

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
      element.appendChild(rotateHandle);
      rotateHandle.addEventListener('mousedown', startRotate);
      return rotateHandle;
    };

    // Show/hide handles on hover
    element.addEventListener('mouseenter', () => {
      if (!dragHandle) dragHandle = createDragHandle();
      if (!rotateHandle) rotateHandle = createRotateHandle();
      if (visualEditor.selectedElement === element) {
        dragHandle.style.display = 'block';
        rotateHandle.style.display = 'block';
      }
    });

    element.addEventListener('mouseleave', () => {
      if (dragHandle && !isDragging) dragHandle.style.display = 'none';
      if (rotateHandle && !isRotating) rotateHandle.style.display = 'none';
    });

    const startDrag = (e) => {
      if (e.target.contentEditable === 'true' || e.target.tagName === 'INPUT') return;
      if (e.target === rotateHandle || rotateHandle?.contains(e.target)) return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = element.getBoundingClientRect();
      const canvasRect = element.parentElement.getBoundingClientRect();
      initialX = rect.left - canvasRect.left;
      initialY = rect.top - canvasRect.top;
      
      element.style.zIndex = '1000';
      element.style.userSelect = 'none';
      selectElement(element);
      
      if (dragHandle) dragHandle.style.display = 'block';
      
      e.preventDefault();
      e.stopPropagation();
    };

    const doDrag = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const newLeft = initialX + deltaX;
      const newTop = initialY + deltaY;
      
      element.style.left = newLeft + 'px';
      element.style.top = newTop + 'px';
      
      e.preventDefault();
    };

    const endDrag = () => {
      if (isDragging) {
        isDragging = false;
        element.style.zIndex = '';
        element.style.userSelect = 'auto';
        if (dragHandle) dragHandle.style.display = 'none';
      }
    };

    element.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);

    // Store cleanup
    element._dragCleanup = () => {
      element.removeEventListener('mousedown', startDrag);
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', endDrag);
      if (rotateHandle) {
        rotateHandle.removeEventListener('mousedown', startRotate);
      }
      document.removeEventListener('mousemove', doRotate);
      document.removeEventListener('mouseup', endRotate);
    };
  }

  function makeSelectable(element) {
    element.onclick = (e) => {
      e.stopPropagation();
      const preferred = e.target && (e.target.closest('[contenteditable="true"]'));
      selectElement(element, preferred || null);
    };
  }

  // Helper function to convert RGB to HEX
  function rgbToHex(rgb) {
    const result = rgb.match(/\d+/g);
    if (!result) return '#000000';
    const r = parseInt(result[0]);
    const g = parseInt(result[1]);
    const b = parseInt(result[2]);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Rotation helpers
  function getRotationDeg(el) {
    if (!el) return 0;
    const ds = el.dataset || {};
    if (ds.rotationDeg != null && ds.rotationDeg !== '') {
      const n = parseFloat(ds.rotationDeg);
      return Number.isFinite(n) ? n : 0;
    }
    const t = el.style?.transform || '';
    const m = t.match(/rotate\(([-\d.]+)deg\)/i);
    if (m) {
      const n = parseFloat(m[1]);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  function setRotationDeg(el, deg) {
    if (!el) return;
    const d = Math.max(-180, Math.min(180, Math.round(deg)));
    el.style.transform = `rotate(${d}deg)`;
    el.style.transformOrigin = 'center center';
    if (!el.dataset) el.dataset = {};
    el.dataset.rotationDeg = String(d);
  }

  function selectElement(element, preferredTextEl = null) {
    // Remove previous selection
    document.querySelectorAll('.tpl-element').forEach(el => {
      el.style.border = '2px solid transparent';
      el.style.boxShadow = 'none';
      // Hide handles
      const handles = el.querySelectorAll('.resize-handle, .drag-handle, .rotate-handle');
      handles.forEach(h => h.style.display = 'none');
    });

    visualEditor.selectedElement = element;
    visualEditor.selectedTextElement = preferredTextEl || null;

    if (element) {
      element.style.border = '2px solid #2563eb';
      element.style.boxShadow = '0 0 0 1px rgba(37, 99, 235, 0.2)';
      showElementProperties(element, preferredTextEl);
    } else {
      hideElementProperties();
    }
  }

  function showElementProperties(element, preferredTextEl = null) {
    const propertiesPanel = qs('#element-properties') || createPropertiesPanel();
    if (!propertiesPanel) return;
    const bodyContainer = qs('#element-properties-body') || propertiesPanel;

    const textNodes = Array.from(element.querySelectorAll('[contenteditable="true"]'));
    const contentElement = preferredTextEl || textNodes[0] || element.querySelector('span') || element.querySelector('h1, h2, h3');
    
    if (contentElement) {
      const computedStyle = window.getComputedStyle(contentElement);
      
      const nodeSelector = textNodes.length > 1 ? `
          <div style="margin-bottom: 10px;">
            <label style="display:block; font-weight:600; margin-bottom:5px;">Seleccionar texto:</label>
            <select id="prop-text-node" style="width:100%; padding:6px;">
              ${textNodes.map((n,i)=>`<option value="${i}" ${n===contentElement?'selected':''}>Texto ${i+1} (${(n.textContent||'').slice(0,20)})</option>`).join('')}
            </select>
          </div>` : '';

      const isImage = !!element.querySelector('img');
      const w = parseInt((element.style.width || element.offsetWidth), 10);
      const h = parseInt((element.style.height || element.offsetHeight), 10);
      const currentRotation = getRotationDeg(element);
      bodyContainer.innerHTML = `
        <div style="padding: 15px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; margin: 10px 0;">
          <h4 style="margin: 0 0 15px 0; color: #333;">Propiedades del Elemento</h4>
          ${nodeSelector}
          
          <div style="margin-bottom: 10px;${isImage?'display:none;':''}">
            <label style="display: block; font-weight: 600; margin-bottom: 5px;">Fuente:</label>
            <select id="prop-font" style="width: 100%; padding: 5px;">
              ${FONTS.map(font => `<option value="${font}" ${computedStyle.fontFamily.includes(font.split(',')[0]) ? 'selected' : ''}>${font.split(',')[0]}</option>`).join('')}
            </select>
          </div>
          
          <div style="margin-bottom: 10px;${isImage?'display:none;':''}">
            <label style="display: block; font-weight: 600; margin-bottom: 5px;">Tamaño: <span id="size-display">${parseInt(computedStyle.fontSize)}px</span></label>
            <input type="range" id="prop-size" min="6" max="72" value="${parseInt(computedStyle.fontSize)}" style="width: 100%;">
          </div>
          
          <div style="margin-bottom: 10px;${isImage?'display:none;':''}">
            <label style="display: block; font-weight: 600; margin-bottom: 5px;">Color:</label>
            <input type="color" id="prop-color" value="${rgbToHex(computedStyle.color)}" style="width: 100%; height: 40px;">
          </div>
          
          <div style="margin-bottom: 10px;${isImage?'display:none;':''}">
            <label style="display: block; font-weight: 600; margin-bottom: 5px;">Estilo:</label>
            <div style="display: flex; gap: 5px;">
              <button id="prop-bold" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.fontWeight > 400 ? '#007bff' : '#fff'}; color: ${computedStyle.fontWeight > 400 ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;"><b>B</b></button>
              <button id="prop-italic" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.fontStyle === 'italic' ? '#007bff' : '#fff'}; color: ${computedStyle.fontStyle === 'italic' ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;"><i>I</i></button>
              <button id="prop-underline" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.textDecoration.includes('underline') ? '#007bff' : '#fff'}; color: ${computedStyle.textDecoration.includes('underline') ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;"><u>U</u></button>
            </div>
          </div>
          
          <div style="margin-bottom: 15px;${isImage?'display:none;':''}">
            <label style="display: block; font-weight: 600; margin-bottom: 5px;">Alineación:</label>
            <div style="display: flex; gap: 5px;">
              <button id="align-left" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.textAlign === 'left' || computedStyle.textAlign === 'start' ? '#007bff' : '#fff'}; color: ${computedStyle.textAlign === 'left' || computedStyle.textAlign === 'start' ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;">←</button>
              <button id="align-center" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.textAlign === 'center' ? '#007bff' : '#fff'}; color: ${computedStyle.textAlign === 'center' ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;">↔</button>
              <button id="align-right" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.textAlign === 'right' ? '#007bff' : '#fff'}; color: ${computedStyle.textAlign === 'right' ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;">→</button>
            </div>
          </div>

          <div style="margin: 12px 0; padding: 10px; background:#fff; border:1px dashed #ccc; border-radius:6px;">
            <label style="display:block; font-weight:600; margin-bottom:6px;">Caja del elemento</label>
            <div style="display:flex; gap:8px;">
              <div style="flex:1;">
                <label style="font-size:12px; color:#555;">Ancho (px)</label>
                <input type="number" id="prop-box-width" value="${w || ''}" min="20" max="1200" style="width:100%; padding:6px;">
              </div>
              <div style="flex:1;">
                <label style="font-size:12px; color:#555;">Alto (px)</label>
                <input type="number" id="prop-box-height" value="${h || ''}" min="20" max="1200" style="width:100%; padding:6px;">
              </div>
            </div>
            <div style="margin-top:8px; display:flex; align-items:center; gap:8px;">
              <label style="font-size:12px; color:#555;">Ajuste de contenido</label>
              <select id="prop-overflow" style="flex:1; padding:6px;">
                <option value="visible" ${computedStyle.overflow==='visible'?'selected':''}>Visible</option>
                <option value="hidden" ${computedStyle.overflow==='hidden'?'selected':''}>Recortar</option>
                <option value="auto" ${computedStyle.overflow==='auto'?'selected':''}>Scroll</option>
              </select>
            </div>
            <div style="margin-top:8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <label style="font-size:12px; color:#555;">Rotación (°)</label>
              <input type="range" id="prop-rotate" min="-180" max="180" step="1" value="${currentRotation}" style="flex:1; min-width:140px;">
              <input type="number" id="prop-rotate-input" min="-180" max="180" step="1" value="${currentRotation}" style="width:84px;">
              <button id="prop-rotate-left" class="secondary" title="Girar -15°">⟲ 15°</button>
              <button id="prop-rotate-right" class="secondary" title="Girar +15°">⟳ 15°</button>
              <button id="prop-rotate-reset" class="secondary" title="Restablecer rotación">Reiniciar</button>
            </div>
          </div>

          <div style="margin: 12px 0; padding: 10px; background:#fff; border:1px dashed #ccc; border-radius:6px; ${isImage?'':'display:none;'}">
            <label style="display:block; font-weight:600; margin-bottom:6px;">Imagen</label>
            <div style="display:flex; gap:8px;">
              <div style="flex:1;">
                <label style="font-size:12px; color:#555;">Ancho (px)</label>
                <input type="range" id="prop-img-width" min="20" max="600" value="${(element.querySelector('img')||{}).offsetWidth||80}" style="width:100%;">
              </div>
              <div style="flex:1;">
                <label style="font-size:12px; color:#555;">Alto (px)</label>
                <input type="range" id="prop-img-height" min="20" max="600" value="${(element.querySelector('img')||{}).offsetHeight||80}" style="width:100%;">
              </div>
            </div>
          </div>
          
          <button id="delete-element" style="width: 100%; padding: 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Eliminar Elemento</button>
        </div>
      `;

      setupPropertyListeners(element, contentElement);

      const nodeSelect = qs('#prop-text-node');
      if (nodeSelect) {
        nodeSelect.onchange = () => {
          const idx = parseInt(nodeSelect.value, 10);
          const newEl = textNodes[idx];
          showElementProperties(element, newEl);
        };
      }
    }
    
    const propsBody = qs('#element-properties-body');
    if (propsBody) {
      propsBody.style.display = 'block';
      propertiesPanel.dataset.collapsed = 'false';
      const t = propertiesPanel.querySelector('#props-toggle');
      if (t) t.textContent = '▾';
    }
    propertiesPanel.style.display = 'block';
  }

  function createPropertiesPanel() {
    const sidebar = qs('.editor-sidebar') || qs('#sidebar') || qs('.sidebar') || qs('#var-list')?.parentNode;
    if (sidebar) {
      let panel = qs('#element-properties');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'element-properties';
        panel.className = 'props-panel';
        panel.style.cssText = 'display:block; margin: 0 0 12px 0;';
        panel.dataset.collapsed = 'true';

        const header = document.createElement('div');
        header.className = 'props-header';
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:6px;font-weight:700;';
        header.innerHTML = '<span>Propiedades del Elemento</span><button id="props-toggle" class="secondary" style="padding:4px 8px;">▸</button>';

        const body = document.createElement('div');
        body.id = 'element-properties-body';
        body.style.cssText = 'display:none;';

        panel.appendChild(header);
        panel.appendChild(body);

        const toggle = header.querySelector('#props-toggle');
        toggle.onclick = () => {
          const isCollapsed = panel.dataset.collapsed === 'true';
          if (isCollapsed) {
            body.style.display = 'block'; panel.dataset.collapsed = 'false'; toggle.textContent = '▾';
          } else {
            body.style.display = 'none'; panel.dataset.collapsed = 'true'; toggle.textContent = '▸';
          }
        };
      }
      if (sidebar.firstChild) sidebar.insertBefore(panel, sidebar.firstChild); else sidebar.appendChild(panel);
      return panel;
    }
    return null;
  }

  function setupPropertyListeners(element, contentElement) {
    const fontSelect = qs('#prop-font');
    const sizeRange = qs('#prop-size');
    const sizeDisplay = qs('#size-display');
    const colorInput = qs('#prop-color');
    const boldBtn = qs('#prop-bold');
    const italicBtn = qs('#prop-italic');
    const underlineBtn = qs('#prop-underline');
    const alignLeftBtn = qs('#align-left');
    const alignCenterBtn = qs('#align-center');
    const alignRightBtn = qs('#align-right');
    const deleteBtn = qs('#delete-element');
    const boxW = qs('#prop-box-width');
    const boxH = qs('#prop-box-height');
    const overflowSel = qs('#prop-overflow');
    const imgWidthRange = qs('#prop-img-width');
    const imgHeightRange = qs('#prop-img-height');
    const rotRange = qs('#prop-rotate');
    const rotInput = qs('#prop-rotate-input');
    const rotLeft = qs('#prop-rotate-left');
    const rotRight = qs('#prop-rotate-right');
    const rotReset = qs('#prop-rotate-reset');

    if (fontSelect) {
      fontSelect.onchange = () => {
        contentElement.style.fontFamily = fontSelect.value;
      };
    }

    if (sizeRange && sizeDisplay) {
      sizeRange.oninput = () => {
        const size = sizeRange.value + 'px';
        contentElement.style.fontSize = size;
        sizeDisplay.textContent = size;
      };
    }

    if (colorInput) {
      colorInput.onchange = () => {
        contentElement.style.color = colorInput.value;
      };
    }

    if (boldBtn) {
      boldBtn.onclick = () => {
        const isBold = contentElement.style.fontWeight === 'bold' || window.getComputedStyle(contentElement).fontWeight > 400;
        contentElement.style.fontWeight = isBold ? 'normal' : 'bold';
        boldBtn.style.background = isBold ? '#fff' : '#007bff';
        boldBtn.style.color = isBold ? 'black' : 'white';
      };
    }

    if (italicBtn) {
      italicBtn.onclick = () => {
        const isItalic = contentElement.style.fontStyle === 'italic';
        contentElement.style.fontStyle = isItalic ? 'normal' : 'italic';
        italicBtn.style.background = isItalic ? '#fff' : '#007bff';
        italicBtn.style.color = isItalic ? 'black' : 'white';
      };
    }

    if (underlineBtn) {
      underlineBtn.onclick = () => {
        const isUnderlined = contentElement.style.textDecoration.includes('underline');
        contentElement.style.textDecoration = isUnderlined ? 'none' : 'underline';
        underlineBtn.style.background = isUnderlined ? '#fff' : '#007bff';
        underlineBtn.style.color = isUnderlined ? 'black' : 'white';
      };
    }

    if (alignLeftBtn) alignLeftBtn.onclick = () => setAlignment('left');
    if (alignCenterBtn) alignCenterBtn.onclick = () => setAlignment('center');
    if (alignRightBtn) alignRightBtn.onclick = () => setAlignment('right');

    function setAlignment(align) {
      contentElement.style.textAlign = align;
      if (element.tagName === 'DIV' && element !== contentElement) {
        element.style.textAlign = align;
      }
      const leftBtn = qs('#align-left');
      const centerBtn = qs('#align-center');
      const rightBtn = qs('#align-right');
      [leftBtn, centerBtn, rightBtn].forEach(btn => {
        if (btn) {
          btn.style.background = '#fff';
          btn.style.color = 'black';
        }
      });
      const activeBtn = align === 'left' ? leftBtn : align === 'center' ? centerBtn : rightBtn;
      if (activeBtn) {
        activeBtn.style.background = '#007bff';
        activeBtn.style.color = 'white';
      }
    }

    if (boxW) boxW.oninput = () => {
      const w = boxW.value ? (parseInt(boxW.value,10)+'px') : '';
      element.style.width = w;
      if (contentElement && contentElement.style) contentElement.style.width = '100%';
    };
    if (boxH) boxH.oninput = () => {
      const h = boxH.value ? (parseInt(boxH.value,10)+'px') : '';
      element.style.height = h;
      if (contentElement && contentElement.style) contentElement.style.height = '100%';
    };
    if (overflowSel) overflowSel.onchange = () => { element.style.overflow = overflowSel.value; };

    const syncRotationUI = (deg) => {
      if (rotRange) rotRange.value = String(deg);
      if (rotInput) rotInput.value = String(deg);
    };
    const applyRotation = (deg) => {
      setRotationDeg(element, deg);
      syncRotationUI(getRotationDeg(element));
    };
    if (rotRange) rotRange.oninput = () => applyRotation(parseInt(rotRange.value,10));
    if (rotInput) rotInput.onchange = () => applyRotation(parseInt(rotInput.value,10));
    if (rotLeft) rotLeft.onclick = () => applyRotation(getRotationDeg(element) - 15);
    if (rotRight) rotRight.onclick = () => applyRotation(getRotationDeg(element) + 15);
    if (rotReset) rotReset.onclick = () => applyRotation(0);

    if (imgWidthRange || imgHeightRange) {
      const img = element.querySelector('img');
      if (img) {
        if (imgWidthRange) {
          imgWidthRange.oninput = () => {
            const w = parseInt(imgWidthRange.value,10);
            img.style.width = w + 'px';
          };
        }
        if (imgHeightRange) {
          imgHeightRange.oninput = () => {
            const h = parseInt(imgHeightRange.value,10);
            img.style.height = h + 'px';
          };
        }
      }
    }

    if (deleteBtn) {
      deleteBtn.onclick = () => {
        const imageContainer = element.querySelector('.image-container');
        if (imageContainer && imageContainer._resizeCleanup) {
          imageContainer._resizeCleanup();
        }
        if (element._dragCleanup) {
          element._dragCleanup();
        }
        element.remove();
        visualEditor.elements = visualEditor.elements.filter(el => el.element !== element);
        selectElement(null);
      };
    }
  }

  function hideElementProperties() {
    const propertiesPanel = qs('#element-properties');
    if (propertiesPanel) {
      const body = qs('#element-properties-body');
      if (body) {
        body.style.display = 'none';
        propertiesPanel.dataset.collapsed = 'true';
        const t = propertiesPanel.querySelector('#props-toggle');
        if (t) t.textContent = '▸';
      } else {
        propertiesPanel.style.display = 'none';
      }
    }
  }

  // Make a previously saved .tpl-element interactive again
  function makeElementInteractive(element) {
    if (!element || !(element instanceof HTMLElement)) return;
    if (element.dataset && element.dataset.interactive === 'true') return;

    // Ensure absolute positioning if missing
    const style = element.style || {};
    if (!style.position) element.style.position = 'absolute';
    if (!style.left) element.style.left = '20px';
    if (!style.top) element.style.top = '20px';
    element.style.minWidth = '0';
    element.style.minHeight = '0';
    const inner = element.firstElementChild;
    if (inner && inner.style) {
      inner.style.minWidth = '0';
      inner.style.minHeight = '0';
    }

    // Rebind core interactions
    try { makeDraggable(element); } catch(_) {}
    try { makeSelectable(element); } catch(_) {}

    // Image handling
    try {
      const placeholder = element.querySelector && element.querySelector('.image-placeholder');
      if (placeholder) setupImageUpload(element);
      const imgContainer = element.querySelector && element.querySelector('.image-container');
      if (imgContainer) {
        const img = imgContainer.querySelector('img');
        if (img) {
          imgContainer.style.padding = '0';
          imgContainer.style.margin = '0';
          imgContainer.style.lineHeight = '0';
          imgContainer.style.display = 'inline-block';
          const parentTpl = element.closest('.tpl-element') || element;
          const w = img.offsetWidth || parseInt(img.style.width, 10) || 0;
          const h = img.offsetHeight || parseInt(img.style.height, 10) || 0;
          if (w && h) {
            imgContainer.style.width = w + 'px';
            imgContainer.style.height = h + 'px';
            parentTpl.style.width = w + 'px';
            parentTpl.style.height = h + 'px';
            parentTpl.style.padding = '0';
            parentTpl.style.minWidth = '0';
            parentTpl.style.minHeight = '0';
          }
          addResizeHandles(imgContainer, img);
        }
      }
    } catch(_) {}

    // Register into editor model
    try {
      const exists = visualEditor.elements.some(rec => rec && rec.element === element);
      if (!exists) {
        visualEditor.elements.push({ 
          id: element.id || `element_${visualEditor.nextId++}`, 
          type: element.dataset?.type || 'unknown', 
          element 
        });
      }
    } catch(_) {}

    if (element.dataset) element.dataset.interactive = 'true';
  }

  function reinitializeElements() {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;
    const elements = canvas.querySelectorAll('.tpl-element');
    if (elements.length > 0) {
      elements.forEach(el => makeElementInteractive(el));
    } else {
      // Convert existing children to interactive elements
      try {
        const canvasRect = canvas.getBoundingClientRect();
        const children = Array.from(canvas.children);
        children.forEach(el => {
          if (!el || el.classList.contains('tpl-element')) return;
          const tag = (el.tagName || '').toLowerCase();
          if (tag === 'script' || tag === 'style') return;
          const rect = el.getBoundingClientRect();
          const left = Math.max(0, Math.round(rect.left - canvasRect.left));
          const top = Math.max(0, Math.round(rect.top - canvasRect.top));
          el.classList.add('tpl-element');
          el.style.position = 'absolute';
          el.style.left = left + 'px';
          el.style.top = top + 'px';
          const cs = window.getComputedStyle(el);
          if (!el.style.width || el.style.width === 'auto') el.style.width = rect.width + 'px';
          if (!el.style.height || el.style.height === 'auto') {
            if (cs.display !== 'inline') el.style.height = rect.height + 'px';
          }
          makeElementInteractive(el);
        });
      } catch(e) {
        console.warn('Error reinitializing elements:', e);
      }
    }
  }

  function setupImageUpload(element) {
    const placeholder = element.querySelector('.image-placeholder');
    if (!placeholder) return;

    placeholder.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const rawDataUrl = event?.target?.result;
          if (typeof rawDataUrl !== 'string') {
            alert('El archivo seleccionado no se pudo leer correctamente.');
            return;
          }

          const optimizedSrc = await optimizeImageDataUrl(rawDataUrl);
          
          const imgContainer = document.createElement('div');
          imgContainer.className = 'image-container';
          imgContainer.style.cssText = 'position: relative; display: inline-block; padding:0; margin:0; line-height:0;';
          
          const img = document.createElement('img');
          img.src = optimizedSrc;
          img.style.cssText = 'width:150px; height:auto; display:block; user-select:none; margin:0; padding:0;';
          img.draggable = false;
          img.onload = () => {
            try {
              imgContainer.style.width = img.naturalWidth + 'px';
              imgContainer.style.height = img.naturalHeight + 'px';
            } catch (_) {}
          };
          
          imgContainer.appendChild(img);
          addResizeHandles(imgContainer, img);
          placeholder.replaceWith(imgContainer);
          
          console.log('Imagen agregada. Usa los handles para redimensionar.');
        };
        
        reader.readAsDataURL(file);
      };
      
      input.click();
    };
  }

  function optimizeImageDataUrl(dataUrl, options = {}) {
    const {
      maxWidth = 1200,
      maxHeight = 1200,
      maxBytes = 550 * 1024,
      quality = 0.82
    } = options;

    if (!dataUrl || typeof dataUrl !== 'string') return Promise.resolve(dataUrl);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const needsResize = img.width > maxWidth || img.height > maxHeight;
        const needsCompression = dataUrl.length > maxBytes;
        if (!needsResize && !needsCompression) {
          resolve(dataUrl);
          return;
        }

        const ratio = Math.min(1, maxWidth / img.width, maxHeight / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const sourceMime = (dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);/) || [])[1] || 'image/png';
        const candidates = sourceMime === 'image/png'
          ? [['image/webp', quality], ['image/png']]
          : [['image/webp', quality], ['image/jpeg', quality]];

        let best = dataUrl;
        for (const [mime, q] of candidates) {
          try {
            const candidate = q !== undefined ? canvas.toDataURL(mime, q) : canvas.toDataURL(mime);
            if (candidate && candidate.length < best.length) {
              best = candidate;
            }
          } catch (_) {}
        }

        resolve(best);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function addResizeHandles(container, img) {
    const handles = ['nw', 'ne', 'sw', 'se'];
    const handleElements = {};
    
    handles.forEach(position => {
      const handle = document.createElement('div');
      handle.className = `resize-handle resize-${position}`;
      handle.style.cssText = `
        position: absolute;
        width: 8px;
        height: 8px;
        background: #2563eb;
        border: 1px solid white;
        cursor: ${position === 'nw' || position === 'se' ? 'nw' : 'ne'}-resize;
        display: none;
        z-index: 1000;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      `;
      
      switch(position) {
        case 'nw': 
          handle.style.top = '-4px';
          handle.style.left = '-4px';
          break;
        case 'ne':
          handle.style.top = '-4px';
          handle.style.right = '-4px';
          break;
        case 'sw':
          handle.style.bottom = '-4px';
          handle.style.left = '-4px';
          break;
        case 'se':
          handle.style.bottom = '-4px';
          handle.style.right = '-4px';
          break;
      }
      
      container.appendChild(handle);
      handleElements[position] = handle;
      setupResizeHandle(handle, container, img, position);
    });
    
    const updateHandles = () => {
      const shouldShow = !!(visualEditor.selectedElement && visualEditor.selectedElement.contains(container));
      Object.values(handleElements).forEach(h => h.style.display = shouldShow ? 'block' : 'none');
      try {
        container.style.width = img.offsetWidth + 'px';
        container.style.height = img.offsetHeight + 'px';
      } catch(_) {}
    };

    const selectionInterval = setInterval(updateHandles, 150);
    container.addEventListener('mouseenter', updateHandles);
    container.addEventListener('mouseleave', updateHandles);
    
    container._resizeCleanup = () => {
      clearInterval(selectionInterval);
      Object.values(handleElements).forEach(h => h.remove());
    };
  }

  function setupResizeHandle(handle, container, img, position) {
    let isResizing = false;
    let startX, startY, startWidth, startHeight, aspectRatio;
    
    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = img.offsetWidth;
      startHeight = img.offsetHeight;
      aspectRatio = startWidth / startHeight;
      
      e.preventDefault();
      e.stopPropagation();
      
      document.body.style.cursor = handle.style.cursor;
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', stopResize);
    });
    
    const handleResize = (e) => {
      if (!isResizing) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;

      switch(position) {
        case 'se':
          newWidth  = startWidth  + deltaX;
          newHeight = startHeight + deltaY;
          break;
        case 'sw':
          newWidth  = startWidth  - deltaX;
          newHeight = startHeight + deltaY;
          break;
        case 'ne':
          newWidth  = startWidth  + deltaX;
          newHeight = startHeight - deltaY;
          break;
        case 'nw':
          newWidth  = startWidth  - deltaX;
          newHeight = startHeight - deltaY;
          break;
      }

      if (e.shiftKey) {
        if (Math.abs(newWidth - startWidth) >= Math.abs(newHeight - startHeight)) {
          newHeight = Math.round(newWidth / aspectRatio);
        } else {
          newWidth = Math.round(newHeight * aspectRatio);
        }
      }
      
      const minSize = 20;
      const maxSize = 800;
      
      newWidth = Math.max(minSize, Math.min(newWidth, maxSize));
      newHeight = Math.max(minSize, Math.min(newHeight, maxSize));

      img.style.width = newWidth + 'px';
      img.style.height = newHeight + 'px';
      try {
        container.style.width = img.offsetWidth + 'px';
        container.style.height = img.offsetHeight + 'px';
        const parentTpl = container.closest('.tpl-element');
        if (parentTpl) {
          parentTpl.style.width = container.style.width;
          parentTpl.style.height = container.style.height;
          parentTpl.style.padding = '0';
          parentTpl.style.minWidth = '0';
          parentTpl.style.minHeight = '0';
        }
      } catch(_) {}
      
      e.preventDefault();
    };
    
    const stopResize = () => {
      isResizing = false;
      document.body.style.cursor = 'default';
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', stopResize);
    };
  }

  function clearCanvas() {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;

    canvas.innerHTML = '<div style="color: #999; text-align: center; padding: 50px; pointer-events: none;">Haz clic en los botones de arriba para agregar elementos</div>';
    visualEditor.elements = [];
    visualEditor.selectedElement = null;
    selectElement(null);
    showQuickNotification('Canvas limpiado', 'info');
  }

  function deleteElementSafely(element) {
    if (!element || !element.parentNode) return false;

    try {
      element.remove();
      visualEditor.elements = visualEditor.elements.filter(el => el.element !== element);
      if (visualEditor.selectedElement === element) {
        selectElement(null);
      }
      return true;
    } catch (error) {
      console.error('Error al eliminar elemento:', error);
      return false;
    }
  }

  function addItemsTable() {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;

    if (canvas.innerHTML.includes('Haz clic en los botones')) {
      canvas.innerHTML = '';
    }

    const tableContainer = document.createElement('div');
    tableContainer.className = 'tpl-element items-table';
    tableContainer.id = `element_${visualEditor.nextId++}`;
    tableContainer.style.cssText = `
      position: absolute;
      left: 20px;
      top: 20px;
      border: 2px solid transparent;
      cursor: move;
      width: 700px;
      background: white;
    `;

    tableContainer.innerHTML = `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #2563eb; color: white;">
            <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Cant.</th>
            <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Descripción</th>
            <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Precio Unit.</th>
            <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          {{#each sale.items}}
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">{{qty}}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">{{description}}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">{{money unitPrice}}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">{{money total}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    `;

    makeDraggable(tableContainer);
    makeSelectable(tableContainer);

    canvas.appendChild(tableContainer);
    selectElement(tableContainer);

    visualEditor.elements.push({
      id: tableContainer.id,
      type: 'items-table',
      element: tableContainer
    });
  }

  function createFriendlyButtons(buttons) {
    return buttons.map(btn => `
      <button onclick="insertVariableInCanvas('${btn.value.replace(/'/g, "\\'")}', ${btn.multiline || false})" 
              style="
                width: 100%; 
                padding: 8px 10px; 
                margin: 3px 0; 
                background: linear-gradient(135deg, #f8f9fa, #e9ecef); 
                border: 1px solid #dee2e6; 
                border-radius: 6px; 
                cursor: pointer; 
                text-align: left;
                font-size: 12px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 8px;
              "
              onmouseover="this.style.background='linear-gradient(135deg, #e3f2fd, #bbdefb)'; this.style.borderColor='#2196f3';"
              onmouseout="this.style.background='linear-gradient(135deg, #f8f9fa, #e9ecef)'; this.style.borderColor='#dee2e6';">
        <span style="font-size: 14px;">${btn.icon}</span>
        <span style="flex: 1; font-weight: 500; color: #495057;">${btn.label}</span>
        <span style="font-size: 10px; color: #6c757d;">Clic para agregar</span>
      </button>
    `).join('');
  }

  window.insertVariableInCanvas = function(varText, isMultiline = false) {
    const parent = getActiveParent();
    if (!parent) return;
    const selectedEl = visualEditor.selectedElement;
    
    if (selectedEl) {
      const contentEl = selectedEl.querySelector('[contenteditable="true"]');
      if (contentEl) {
        if (isMultiline) {
          contentEl.style.whiteSpace = 'pre-line';
          contentEl.style.minHeight = '0';
        }
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && contentEl.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(varText));
          range.collapse(false);
        } else {
          contentEl.innerHTML += varText;
        }
        return;
      }
    }
    
    const canvas = qs('#ce-canvas');
    if (canvas) {
      const ph = canvas.querySelector('#ce-placeholder');
      if (ph) ph.remove();
      if (canvas.innerHTML.includes('Haz clic en los botones')) {
        canvas.innerHTML = '';
      }
    }
    
    let elementType = 'text';
    let content = varText;
    let styles = {};
    
    if (varText.includes('total') || varText.includes('money')) {
      elementType = 'text';
      styles = { fontSize: '18px', fontWeight: 'bold', color: '#2563eb' };
    } else if (varText.includes('company.name')) {
      elementType = 'title';
      content = varText;
      styles = { fontSize: '24px', fontWeight: 'bold', color: '#2563eb' };
    } else if (isMultiline || varText.includes('each')) {
      elementType = 'text';
      styles = { 
        fontSize: '14px', 
        whiteSpace: 'pre-line', 
        fontFamily: 'monospace',
        backgroundColor: '#f8f9fa',
        padding: '10px',
        border: '1px solid #dee2e6',
        borderRadius: '4px'
      };
    }
    
    const newElement = createEditableElement(elementType, content, {
      position: { left: 20, top: 20 + (visualEditor.elements.length * 20) },
      styles: styles
    });
    
    parent.appendChild(newElement);
    selectElement(newElement);
  };

  function setupVariables() {
    const varList = qs('#var-list');
    if (!varList) return;

    const templateType = window.currentTemplateSession?.type || new URLSearchParams(window.location.search).get('type') || 'invoice';

    let html = `
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">📋 Información de la Empresa</h4>
        ${createFriendlyButtons([
          { label: 'Nombre de mi taller', icon: '🏢', value: '{{company.name}}' },
          { label: 'Mi dirección', icon: '📍', value: '{{company.address}}' },
          { label: 'Mi teléfono', icon: '📞', value: '{{company.phone}}' },
          { label: 'Mi email', icon: '📧', value: '{{company.email}}' },
          { label: 'URL del logo', icon: '🖼️', value: '{{company.logoUrl}}' }
        ])}
      </div>`;

    if (templateType === 'payroll') {
      html += `
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">💰 Datos de Liquidación de Nómina</h4>
        ${createFriendlyButtons([
          { label: 'Nombre del técnico', icon: '👤', value: '{{settlement.technicianName}}' },
          { label: 'Fecha de liquidación', icon: '📅', value: '{{date now}}' },
          { label: 'Estado de liquidación', icon: '📊', value: '{{settlement.status}}' }
        ])}
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">📅 Período de Liquidación</h4>
        ${createFriendlyButtons([
          { label: 'Fecha inicio período', icon: '📅', value: '{{period.formattedStartDate}}' },
          { label: 'Fecha fin período', icon: '📅', value: '{{period.formattedEndDate}}' },
          { label: 'Tipo de período', icon: '📆', value: '{{period.periodTypeLabel}}' }
        ])}
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">💵 Totales de Liquidación</h4>
        ${createFriendlyButtons([
          { label: 'Total bruto', icon: '💰', value: '{{settlement.formattedGrossTotal}}' },
          { label: 'Total descuentos', icon: '📉', value: '{{settlement.formattedDeductionsTotal}}' },
          { label: 'Neto a pagar', icon: '💵', value: '{{settlement.formattedNetTotal}}' }
        ])}
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">📋 Items de Liquidación</h4>
        ${createFriendlyButtons([
          { label: 'Lista de ingresos', icon: '📈', value: '{{#each settlement.itemsByType.earnings}}\\n• {{name}}: {{money value}}\\n{{/each}}', multiline: true },
          { label: 'Lista de descuentos', icon: '📉', value: '{{#each settlement.itemsByType.deductions}}\\n• {{name}}: {{money value}}\\n{{/each}}', multiline: true }
        ])}
      </div>`;
    } else {
      html += `
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">💰 Datos de Venta/Factura</h4>
        ${createFriendlyButtons([
          { label: 'Número de factura', icon: '#️⃣', value: '{{sale.number}}' },
          { label: 'Fecha de venta', icon: '📅', value: '{{date sale.date}}' },
          { label: 'Total a cobrar', icon: '💵', value: '{{money sale.total}}' },
          { label: 'Subtotal (sin IVA)', icon: '💴', value: '{{money sale.subtotal}}' },
          { label: 'IVA calculado', icon: '📊', value: '{{money sale.tax}}' }
        ])}
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">📄 Datos de Cotización</h4>
        ${createFriendlyButtons([
          { label: 'Número de cotización', icon: '#️⃣', value: '{{quote.number}}' },
          { label: 'Fecha de cotización', icon: '📅', value: '{{date quote.date}}' },
          { label: 'Válida hasta', icon: '⏰', value: '{{date quote.validUntil}}' },
          { label: 'Total cotizado', icon: '💵', value: '{{money quote.total}}' }
        ])}
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">🔧 Datos de Orden de Trabajo</h4>
        ${createFriendlyButtons([
          { label: 'Número de orden', icon: '#️⃣', value: '{{workOrder.number}}' },
          { label: 'Fecha de inicio', icon: '📅', value: '{{date workOrder.startDate}}' },
          { label: 'Estado actual', icon: '🔄', value: '{{workOrder.status}}' },
          { label: 'Técnico asignado', icon: '👨‍🔧', value: '{{workOrder.technician}}' }
        ])}
      </div>`;
    }

    html += `
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">👤 Datos del Cliente</h4>
        ${createFriendlyButtons([
          { label: 'Nombre del cliente', icon: '👤', value: '{{sale.customerName || quote.customerName || workOrder.customerName}}' },
          { label: 'Teléfono del cliente', icon: '📱', value: '{{sale.customerPhone || quote.customerPhone || workOrder.customerPhone}}' }
        ])}
      </div>`;

    if (templateType !== 'payroll') {
      html += `
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">🚗 Datos del Vehículo</h4>
        ${createFriendlyButtons([
          { label: 'Placa del vehículo', icon: '🚗', value: '{{sale.vehicle.plate || quote.vehicle.plate || workOrder.vehicle.plate}}' },
          { label: 'Marca del vehículo', icon: '🏷️', value: '{{sale.vehicle.brand || quote.vehicle.brand || workOrder.vehicle.brand}}' },
          { label: 'Modelo del vehículo', icon: '📋', value: '{{sale.vehicle.model || quote.vehicle.model || workOrder.vehicle.model}}' },
          { label: 'Año del vehículo', icon: '📅', value: '{{sale.vehicle.year || quote.vehicle.year || workOrder.vehicle.year}}' }
        ])}
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">🔧 Lista de Trabajos/Servicios</h4>
        ${createFriendlyButtons([
          { label: 'Lista de servicios (ventas)', icon: '📝', value: '{{#each sale.items}}• {{qty}}x {{description}} - {{money total}}\\n{{/each}}', multiline: true },
          { label: 'Lista de servicios (cotizaciones)', icon: '💰', value: '{{#each quote.items}}• {{qty}}x {{description}} - {{money price}} c/u = {{money total}}\\n{{/each}}', multiline: true }
        ])}
        <button onclick="insertItemsTable()" style="width: 100%; padding: 8px; background: #6f42c1; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 5px;">
          📊 Crear Tabla Completa de Trabajos
        </button>
      </div>`;
    }

    varList.innerHTML = html;
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && visualEditor.selectedElement) {
        const activeEl = document.activeElement;
        const isEditing = activeEl && (
          activeEl.contentEditable === 'true' || 
          activeEl.tagName === 'INPUT' || 
          activeEl.tagName === 'TEXTAREA'
        );
        
        if (isEditing) return;
        
        e.preventDefault();
        deleteElementSafely(visualEditor.selectedElement);
      }
    });
  }

  function addEnvironmentIndicator() {
    const isProduction = window.IS_PRODUCTION || false;
    const environment = isProduction ? 'PRODUCCIÓN' : 'DESARROLLO';
    const envColor = isProduction ? '#28a745' : '#ffc107';
    const envIcon = isProduction ? '🌐' : '🔧';
    
    const envIndicator = document.createElement('div');
    envIndicator.id = 'environment-indicator';
    envIndicator.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: ${envColor};
      color: ${isProduction ? 'white' : 'black'};
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      z-index: 2000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    
    envIndicator.innerHTML = `<span>${envIcon}</span> <span>${environment}</span>`;
    document.body.appendChild(envIndicator);
  }

  function addSessionHeader(documentType, action, formatId) {
    // Placeholder - se implementará después
    console.log('Session header:', { documentType, action, formatId });
  }

  async function loadExistingFormat(formatId) {
    try {
      console.log('📝 Cargando formato existente:', formatId);
      showQuickNotification('🔄 Cargando formato existente...', 'info');
      
      if (typeof API === 'undefined') {
        throw new Error('API no disponible');
      }
      
      const template = await API.templates.get(formatId);
      if (!template) {
        throw new Error('Formato no encontrado');
      }
      
      // Set template session basics
      if (window.currentTemplateSession) {
        window.currentTemplateSession.name = template.name;
        window.currentTemplateSession.formatId = formatId;
        window.currentTemplateSession.contentCss = template.contentCss || '';
        window.currentTemplateSession.type = template.type || window.currentTemplateSession.type || '';
      }
      
      // Load content into editor
      const canvas = qs('#ce-canvas');
      if (!canvas) {
        throw new Error('Canvas del editor no encontrado');
      }
      
      // Ensure canvas is visible and properly sized
      canvas.style.display = 'block';
      canvas.style.visibility = 'visible';
      canvas.style.background = '#ffffff';
      canvas.offsetHeight; // Force reflow
      
      if (template.contentHtml && template.contentHtml.trim() !== '') {
        // Load existing content
        canvas.innerHTML = template.contentHtml;
        // Reinitialize elements to make them interactive
        setTimeout(() => {
          reinitializeElements();
          showQuickNotification(`✅ Formato "${template.name}" cargado para editar`, 'success');
        }, 100);
      } else {
        // Si el formato está vacío, cargar plantilla por defecto
        console.log('ℹ️ Formato sin contenido. Inyectando plantilla base...');
        loadDefaultTemplate(template.type || window.currentTemplateSession?.type || 'invoice');
        showQuickNotification(`🧩 "${template.name}": plantilla base cargada`, 'success');
      }
      
    } catch (error) {
      console.error('❌ Error cargando formato:', error);
      showQuickNotification(`⚠️ Error cargando formato: ${error.message}`, 'error');
      
      // En edición, intentar cargar plantilla por defecto como fallback
      const session = window.currentTemplateSession;
      if (session && session.type) {
        console.log('🔄 Cargando plantilla por defecto como fallback...');
        loadDefaultTemplate(session.type);
      }
    }
  }

  function loadDefaultTemplate(documentType) {
    console.log('🎨 Cargando plantilla por defecto:', documentType);
    const canvas = qs('#ce-canvas');
    if (!canvas) {
      console.error('❌ Canvas no encontrado');
      showQuickNotification('❌ Error: Canvas no encontrado', 'error');
      return;
    }

    console.log('✅ Canvas encontrado, verificando visibilidad...');

    // Asegurar que el canvas sea visible y tenga fondo blanco
    canvas.style.display = 'block';
    canvas.style.visibility = 'visible';
    canvas.style.background = '#ffffff';
    canvas.style.minHeight = '600px';
    canvas.style.width = '100%';
    canvas.offsetHeight; // Force reflow
    
    console.log('✅ Canvas visible, limpiando contenido anterior...');

    // Limpiar canvas primero
    canvas.innerHTML = '';
    visualEditor.elements = [];
    visualEditor.nextId = 1;

    console.log('📋 Creando plantilla para tipo:', documentType);

    // Cargar plantilla según el tipo
    try {
      if (documentType === 'invoice') {
        createInvoiceTemplate(canvas);
        showQuickNotification('📄 Plantilla de Factura cargada', 'success');
      } else if (documentType === 'quote') {
        createQuoteTemplate(canvas);
        showQuickNotification('💰 Plantilla de Cotización cargada', 'success');
      } else if (documentType === 'workOrder') {
        createWorkOrderTemplate(canvas);
        showQuickNotification('🔧 Plantilla de Orden de Trabajo cargada', 'success');
      } else if (documentType === 'sticker-qr' || documentType === 'sticker-brand') {
        createStickerTemplate(canvas, documentType);
        showQuickNotification('🏷️ Plantilla de Sticker cargada', 'success');
      } else {
        console.warn('⚠️ Tipo de documento no reconocido:', documentType);
        showQuickNotification('⚠️ Tipo de documento no reconocido: ' + documentType, 'warning');
        // Cargar factura por defecto si no se reconoce el tipo
        createInvoiceTemplate(canvas);
        showQuickNotification('📄 Cargada plantilla de Factura por defecto', 'info');
      }
      
      console.log('✅ Plantilla creada, elementos en canvas:', visualEditor.elements.length);
      
      // Verificar que los elementos se agregaron
      const elementsInDOM = canvas.querySelectorAll('.tpl-element');
      console.log('📊 Elementos en DOM:', elementsInDOM.length);
      
      if (elementsInDOM.length === 0) {
        console.error('❌ ERROR: No se agregaron elementos al canvas!');
        showQuickNotification('❌ Error: No se pudieron crear los elementos', 'error');
      }
      
    } catch (error) {
      console.error('❌ Error creando plantilla:', error);
      showQuickNotification('❌ Error al crear plantilla: ' + error.message, 'error');
    }
  }

  function createInvoiceTemplate(canvas) {
    console.log('🎨 Creando plantilla de factura simple...');
    
    // Título
    const title = createEditableElement('title', 'FACTURA', {
      position: { left: 40, top: 30 },
      styles: { fontSize: '32px', fontWeight: 'bold', color: '#333' }
    });
    canvas.appendChild(title);

    // Número de factura
    const invoiceNumber = createEditableElement('text', 'Nº: {{sale.number}}', {
      position: { left: 40, top: 80 },
      styles: { fontSize: '16px', fontWeight: 'bold' }
    });
    canvas.appendChild(invoiceNumber);

    // Datos del cliente
    const clientSection = createEditableElement('text', 'CLIENTE:\n{{sale.customerName}}\n{{sale.customerPhone}}', {
      position: { left: 40, top: 130 },
      styles: { fontSize: '14px', whiteSpace: 'pre-line' }
    });
    canvas.appendChild(clientSection);

    // Tabla de items
    const itemsTable = createItemsTableElement({ left: 40, top: 220 });
    canvas.appendChild(itemsTable);

    // Total
    const total = createEditableElement('text', 'TOTAL: {{money sale.total}}', {
      position: { left: 500, top: 400 },
      styles: { fontSize: '18px', fontWeight: 'bold', color: '#2563eb' }
    });
    canvas.appendChild(total);

    console.log('✅ Plantilla de factura creada');
  }

  function createQuoteTemplate(canvas) {
    console.log('🎨 Creando plantilla de cotización simple...');
    
    // Título
    const title = createEditableElement('title', 'COTIZACIÓN', {
      position: { left: 40, top: 30 },
      styles: { fontSize: '32px', fontWeight: 'bold', color: '#28a745' }
    });
    canvas.appendChild(title);

    // Número de cotización
    const quoteNumber = createEditableElement('text', 'Nº: COT-{{sale.number}}', {
      position: { left: 40, top: 80 },
      styles: { fontSize: '16px', fontWeight: 'bold' }
    });
    canvas.appendChild(quoteNumber);

    // Datos del cliente
    const clientSection = createEditableElement('text', 'CLIENTE:\n{{sale.customerName}}\n{{sale.customerPhone}}', {
      position: { left: 40, top: 130 },
      styles: { fontSize: '14px', whiteSpace: 'pre-line' }
    });
    canvas.appendChild(clientSection);

    // Tabla de items
    const itemsTable = createItemsTableElement({ left: 40, top: 220 });
    canvas.appendChild(itemsTable);

    // Total
    const total = createEditableElement('text', 'TOTAL: {{money sale.total}}', {
      position: { left: 500, top: 400 },
      styles: { fontSize: '18px', fontWeight: 'bold', color: '#28a745' }
    });
    canvas.appendChild(total);

    // Válida hasta
    const validUntil = createEditableElement('text', 'Válida hasta: {{date sale.date}}', {
      position: { left: 40, top: 450 },
      styles: { fontSize: '12px', color: '#666' }
    });
    canvas.appendChild(validUntil);

    console.log('✅ Plantilla de cotización creada');
  }

  function createWorkOrderTemplate(canvas) {
    console.log('🎨 Creando plantilla de orden de trabajo simple...');
    
    // Título
    const title = createEditableElement('title', 'ORDEN DE TRABAJO', {
      position: { left: 40, top: 30 },
      styles: { fontSize: '32px', fontWeight: 'bold', color: '#fd7e14' }
    });
    canvas.appendChild(title);

    // Número de orden
    const orderNumber = createEditableElement('text', 'Nº: OT-{{sale.number}}', {
      position: { left: 40, top: 80 },
      styles: { fontSize: '16px', fontWeight: 'bold' }
    });
    canvas.appendChild(orderNumber);

    // Datos del cliente
    const clientSection = createEditableElement('text', 'CLIENTE:\n{{sale.customerName}}\n{{sale.customerPhone}}', {
      position: { left: 40, top: 130 },
      styles: { fontSize: '14px', whiteSpace: 'pre-line' }
    });
    canvas.appendChild(clientSection);

    // Datos del vehículo
    const vehicleSection = createEditableElement('text', 'VEHÍCULO:\n{{sale.vehicle.plate}}\n{{sale.vehicle.brand}}', {
      position: { left: 300, top: 130 },
      styles: { fontSize: '14px', whiteSpace: 'pre-line' }
    });
    canvas.appendChild(vehicleSection);

    // Tabla de servicios
    const itemsTable = createItemsTableElement({ left: 40, top: 220 });
    canvas.appendChild(itemsTable);

    // Total estimado
    const total = createEditableElement('text', 'TOTAL ESTIMADO: {{money sale.total}}', {
      position: { left: 500, top: 400 },
      styles: { fontSize: '18px', fontWeight: 'bold', color: '#fd7e14' }
    });
    canvas.appendChild(total);

    console.log('✅ Plantilla de orden de trabajo creada');
  }

  function createStickerTemplate(canvas, documentType) {
    console.log('🎨 Creando plantilla de sticker simple...');
    
    // Ajustar tamaño del canvas para sticker (5x3 cm)
    const widthPx = Math.round(5 * 37.795275591); // 5cm
    const heightPx = Math.round(3 * 37.795275591); // 3cm
    canvas.style.width = widthPx + 'px';
    canvas.style.height = heightPx + 'px';
    canvas.style.minWidth = widthPx + 'px';
    canvas.style.minHeight = heightPx + 'px';

    // Título pequeño
    const title = createEditableElement('text', '{{company.name}}', {
      position: { left: 10, top: 10 },
      styles: { fontSize: '12px', fontWeight: 'bold', color: '#2563eb' }
    });
    canvas.appendChild(title);

    // Número de orden
    const orderNumber = createEditableElement('text', '# {{sale.number}}', {
      position: { left: 10, top: 35 },
      styles: { fontSize: '10px', color: '#666' }
    });
    canvas.appendChild(orderNumber);

    // Vehículo
    const vehicle = createEditableElement('text', '{{sale.vehicle.brand}}\n{{sale.vehicle.plate}}', {
      position: { left: 10, top: 60 },
      styles: { fontSize: '9px', whiteSpace: 'pre-line', color: '#333' }
    });
    canvas.appendChild(vehicle);

    // Total
    const total = createEditableElement('text', 'Total: {{money sale.total}}', {
      position: { left: 10, top: 90 },
      styles: { fontSize: '10px', fontWeight: 'bold', color: '#2563eb' }
    });
    canvas.appendChild(total);

    console.log('✅ Plantilla de sticker creada');
  }

  function createEditableElement(type, content, options = {}) {
    const element = document.createElement('div');
    element.className = 'tpl-element';
    element.id = `element_${visualEditor.nextId++}`;
    
    const pos = options.position || { left: 20, top: 20 };
    element.style.position = 'absolute';
    element.style.left = pos.left + 'px';
    element.style.top = pos.top + 'px';
    element.style.cursor = 'move';
    element.style.border = '2px solid transparent';

    let contentElement;
    if (type === 'title') {
      contentElement = document.createElement('h2');
      contentElement.style.margin = '0';
      contentElement.style.fontSize = options.styles?.fontSize || '24px';
      contentElement.style.fontWeight = options.styles?.fontWeight || 'bold';
    } else {
      contentElement = document.createElement('span');
      contentElement.style.fontSize = options.styles?.fontSize || '14px';
    }

    contentElement.contentEditable = 'true';
    contentElement.textContent = content;
    contentElement.style.outline = 'none';
    contentElement.style.display = 'block';

    // Aplicar estilos personalizados
    if (options.styles) {
      Object.assign(contentElement.style, options.styles);
    }

    element.appendChild(contentElement);

    // Hacer draggable y seleccionable
    makeDraggable(element);
    makeSelectable(element);

    // Agregar al array de elementos
    visualEditor.elements.push({
      id: element.id,
      type: type,
      element: element
    });

    return element;
  }

  function createItemsTableElement(position) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'tpl-element items-table';
    tableContainer.id = `element_${visualEditor.nextId++}`;
    tableContainer.style.cssText = `
      position: absolute;
      left: ${position.left}px;
      top: ${position.top}px;
      border: 2px solid transparent;
      cursor: move;
      width: 600px;
      background: white;
    `;

    tableContainer.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif;">
        <thead>
          <tr style="background: #2563eb; color: white;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Cant.</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Descripción</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Precio</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          {{#each sale.items}}
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">{{qty}}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">{{description}}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">{{money unitPrice}}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">{{money total}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    `;

    makeDraggable(tableContainer);
    makeSelectable(tableContainer);

    visualEditor.elements.push({
      id: tableContainer.id,
      type: 'items-table',
      element: tableContainer
    });

    return tableContainer;
  }

  // Global functions
  window.saveTemplateAndReturn = async function() {
    console.log('Guardando plantilla...');
    showQuickNotification('Funcionalidad de guardado pendiente', 'info');
  };

  window.previewTemplateEnhanced = async function() {
    console.log('Vista previa...');
    showQuickNotification('Funcionalidad de vista previa pendiente', 'info');
  };

})(); // End IIFE

