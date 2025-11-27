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
    const colorClasses = {
      'success': 'bg-green-600',
      'error': 'bg-red-600', 
      'info': 'bg-blue-600',
      'warning': 'bg-yellow-600'
    };
    
    notification.className = `fixed top-5 right-5 ${colorClasses[type] || colorClasses.info} text-white px-5 py-3 rounded-lg text-sm font-semibold z-[3000] shadow-lg max-w-[350px] animate-[slideInFromRight_0.3s_ease-out]`;
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
      
      // Listener para actualizar bordes cuando cambie el tema
      const observer = new MutationObserver(() => {
        const canvas = qs('#ce-canvas');
        if (canvas && canvas.style.width) {
          // Si el canvas ya tiene un tamaño aplicado, actualizar solo el borde
          const isLightMode = document.body.classList.contains('theme-light');
          const borderColor = isLightMode ? '#cbd5e1' : '#475569';
          canvas.style.border = `2px dashed ${borderColor}`;
        }
      });
      
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
      });
      
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
    // El tamaño se ajustará según el formato seleccionado
    // Los bordes respetan el tema, pero el fondo siempre es blanco para impresión
    const isLightMode = document.body.classList.contains('theme-light');
    const borderColor = isLightMode ? '#cbd5e1' : '#475569';
    canvas.style.cssText = `
      border: 2px dashed ${borderColor};
      padding: 20px;
      position: relative;
      background: #ffffff !important;
      color: #333;
      overflow: visible;
      border-radius: 8px;
      margin: 10px auto;
      box-sizing: border-box;
    `;

    canvas.contentEditable = 'false';
    // No mostrar placeholder inicial - se cargará la plantilla automáticamente
    canvas.innerHTML = '';

    // Setup button handlers
    setupButtonHandlers();

    // Setup existing buttons if they exist in HTML
    const saveBtn = qs('#save-template');
    if (saveBtn) {
      console.log('✅ Botón Guardar Plantilla encontrado');
      saveBtn.onclick = function(e) {
        e.preventDefault();
        console.log('🔄 Ejecutando saveTemplateAndReturn...');
        if (typeof window.saveTemplateAndReturn === 'function') {
          window.saveTemplateAndReturn();
        } else {
          console.error('❌ saveTemplateAndReturn no está definido');
          alert('Error: Función de guardar no disponible');
        }
      };
    } else {
      console.error('❌ No se encontró el botón save-template');
    }
    
    const previewBtn = qs('#preview-template');
    if (previewBtn) {
      console.log('✅ Botón Vista Previa encontrado');
      previewBtn.onclick = function(e) {
        e.preventDefault();
        console.log('🔄 Ejecutando previewTemplateEnhanced...');
        if (typeof window.previewTemplateEnhanced === 'function') {
          window.previewTemplateEnhanced();
        } else {
          console.error('❌ previewTemplateEnhanced no está definido');
          alert('Error: Función de vista previa no disponible');
        }
      };
    } else {
      console.error('❌ No se encontró el botón preview-template');
    }

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

    toolbar.style.cssText = 'padding: 12px; background: var(--card-alt); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; box-shadow: var(--shadow-elev);';

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
      
      <div id="toolbar-buttons" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        <button id="add-title-btn" class="toolbar-btn primary">📄 Título</button>
        <button id="add-text-btn" class="toolbar-btn primary">📝 Texto</button>
        <button id="add-image-btn" class="toolbar-btn secondary">🖼️ Imagen</button>
        <button id="add-table-btn" class="toolbar-btn secondary">📊 Tabla</button>
        <button id="add-items-table-btn" class="toolbar-btn secondary">📋 Items</button>
        
        <div class="toolbar-sep">
          <button id="delete-selected-btn" class="toolbar-btn danger" title="Eliminar elemento seleccionado">🗑️ Eliminar</button>
          <button id="clear-canvas-btn" class="toolbar-btn secondary">🧹 Limpiar Todo</button>
        </div>
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
      // Evitar drag si se hace clic en un resize handle
      if (e.target.classList.contains('resize-handle') || e.target.closest('.resize-handle')) return;
      
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

  // Función para acortar variables de Handlebars para mejor visualización en el canvas
  // Función para actualizar campos editables en plantillas de nómina
  function updatePayrollEditableFields(html) {
    if (!html || typeof html !== 'string') return html;
    
    // Reemplazar campos editables relacionados con salario básico mensual
    html = html.replace(
      /(<td[^>]*>.*?SALARIO\s+BÁSICO\s*\(\$\/MES\):.*?<\/td>\s*<td[^>]*>)(.*?)(<\/td>)/gi,
      (match, opening, content, closing) => {
        // Si el contenido no tiene variables de Handlebars, agregarlas
        if (!content.includes('{{') || !content.includes('settlement.technician.basicSalary')) {
          return opening + '{{#if settlement.technician.basicSalary}}{{money settlement.technician.basicSalary}}{{/if}}' + closing;
        }
        return match;
      }
    );
    
    // Reemplazar campos editables relacionados con horas de trabajo
    html = html.replace(
      /(<td[^>]*>.*?HORAS\s+TRABAJO\s+MES:.*?<\/td>\s*<td[^>]*>)(.*?)(<\/td>)/gi,
      (match, opening, content, closing) => {
        // Si el contenido no tiene variables de Handlebars, agregarlas
        if (!content.includes('{{') || !content.includes('settlement.technician.workHoursPerMonth')) {
          return opening + '{{#if settlement.technician.workHoursPerMonth}}{{settlement.technician.workHoursPerMonth}}{{/if}}' + closing;
        }
        return match;
      }
    );
    
    // Reemplazar campos editables relacionados con salario básico por día
    html = html.replace(
      /(<td[^>]*>.*?SALARIO\s+BÁSICO\s*\(DÍA\):.*?<\/td>\s*<td[^>]*>)(.*?)(<\/td>)/gi,
      (match, opening, content, closing) => {
        // Si el contenido no tiene variables de Handlebars, agregarlas
        if (!content.includes('{{') || !content.includes('settlement.technician.basicSalaryPerDay')) {
          return opening + '{{#if settlement.technician.basicSalaryPerDay}}{{money settlement.technician.basicSalaryPerDay}}{{/if}}' + closing;
        }
        return match;
      }
    );
    
    // Reemplazar campos editables relacionados con tipo de contrato
    html = html.replace(
      /(<td[^>]*>.*?TIPO\s+CONTRATO:.*?<\/td>\s*<td[^>]*>)(.*?)(<\/td>)/gi,
      (match, opening, content, closing) => {
        // Si el contenido no tiene variables de Handlebars, agregarlas
        if (!content.includes('{{') || !content.includes('settlement.technician.contractType')) {
          return opening + '{{#if settlement.technician.contractType}}{{settlement.technician.contractType}}{{/if}}' + closing;
        }
        return match;
      }
    );
    
    // También buscar y reemplazar texto literal de campos editables
    html = html.replace(/\[Editar\s+salario\s+básico\]/gi, '{{#if settlement.technician.basicSalary}}{{money settlement.technician.basicSalary}}{{/if}}');
    html = html.replace(/\[Editar\s+horas\]/gi, '{{#if settlement.technician.workHoursPerMonth}}{{settlement.technician.workHoursPerMonth}}{{/if}}');
    html = html.replace(/\[Editar\s+salario\s+diario\]/gi, '{{#if settlement.technician.basicSalaryPerDay}}{{money settlement.technician.basicSalaryPerDay}}{{/if}}');
    html = html.replace(/\[Editar\s+tipo\s+de\s+contrato\]/gi, '{{#if settlement.technician.contractType}}{{settlement.technician.contractType}}{{/if}}');
    
    return html;
  }

  function shortenHandlebarsVars(html, templateType) {
    if (!html) return html;
    
    console.log('[shortenHandlebarsVars] Iniciando acortamiento, longitud HTML:', html.length, 'templateType:', templateType);
    
    // Para payroll, proteger variables dentro de settlement.itemsByType antes de acortar
    let payrollMarkers = null;
    if (templateType === 'payroll') {
      payrollMarkers = {
        earningsName: '___PAYROLL_EARNINGS_NAME_MARKER___',
        earningsValue: '___PAYROLL_EARNINGS_VALUE_MARKER___',
        deductionsName: '___PAYROLL_DEDUCTIONS_NAME_MARKER___',
        deductionsValue: '___PAYROLL_DEDUCTIONS_VALUE_MARKER___'
      };
      
      // Proteger variables dentro de earnings (usar replace con función para capturar todo el bloque)
      html = html.replace(/(\{\{#each settlement\.itemsByType\.earnings\}\})([\s\S]*?)(\{\{\/each\}\})/g, 
        (match, openTag, content, closeTag) => {
          const protectedContent = content
            .replace(/\{\{name\}\}/g, payrollMarkers.earningsName)
            .replace(/\{\{money value\}\}/g, payrollMarkers.earningsValue);
          return openTag + protectedContent + closeTag;
        }
      );
      
      // Proteger variables dentro de deductions
      html = html.replace(/(\{\{#each settlement\.itemsByType\.deductions\}\})([\s\S]*?)(\{\{\/each\}\})/g,
        (match, openTag, content, closeTag) => {
          const protectedContent = content
            .replace(/\{\{name\}\}/g, payrollMarkers.deductionsName)
            .replace(/\{\{money value\}\}/g, payrollMarkers.deductionsValue);
          return openTag + protectedContent + closeTag;
        }
      );
    }
    
    // Mapeo de variables completas a versiones cortas más legibles
    // IMPORTANTE: Ordenar de más específico a menos específico para evitar conflictos
    const replacements = [
      // Variables de items agrupados - HACER PRIMERO (más específicas)
      { from: /\{\{#if sale\.itemsGrouped\.hasProducts\}\}/g, to: '{{#if S.P}}' },
      { from: /\{\{#if sale\.itemsGrouped\.hasServices\}\}/g, to: '{{#if S.S}}' },
      { from: /\{\{#if sale\.itemsGrouped\.hasCombos\}\}/g, to: '{{#if S.C}}' },
      { from: /\{\{#each sale\.itemsGrouped\.products\}\}/g, to: '{{#each S.P}}' },
      { from: /\{\{#each sale\.itemsGrouped\.services\}\}/g, to: '{{#each S.S}}' },
      { from: /\{\{#each sale\.itemsGrouped\.combos\}\}/g, to: '{{#each S.C}}' },
      { from: /\{\{#unless sale\.itemsGrouped\.hasProducts\}\}/g, to: '{{#unless S.P}}' },
      { from: /\{\{#unless sale\.itemsGrouped\.hasServices\}\}/g, to: '{{#unless S.S}}' },
      { from: /\{\{#unless sale\.itemsGrouped\.hasCombos\}\}/g, to: '{{#unless S.C}}' },
      
      // Variables de cliente
      { from: /\{\{sale\.customer\.name\}\}/g, to: '{{C.nombre}}' },
      { from: /\{\{sale\.customer\.email\}\}/g, to: '{{C.email}}' },
      { from: /\{\{sale\.customer\.phone\}\}/g, to: '{{C.tel}}' },
      { from: /\{\{sale\.customer\.address\}\}/g, to: '{{C.dir}}' },
      
      // Variables de venta (con helpers primero)
      { from: /\{\{money sale\.total\}\}/g, to: '{{$ S.total}}' },
      { from: /\{\{pad sale\.number\}\}/g, to: '{{pad S.nº}}' },
      { from: /\{\{sale\.formattedNumber\}\}/g, to: '{{S.nº}}' },
      { from: /\{\{sale\.number\}\}/g, to: '{{S.nº}}' },
      { from: /\{\{sale\.total\}\}/g, to: '{{S.total}}' },
      // Acortar la expresión completa del número de remisión
      { from: /\{\{#if sale\.formattedNumber\}\}\{\{sale\.formattedNumber\}\}\{\{else\}\}\{\{#if sale\.number\}\}\{\{pad sale\.number\}\}\{\{else\}\}\[Sin número\]\{\{\/if\}\}\{\{\/if\}\}/g, to: '{{#if S.nº}}{{S.nº}}{{else}}[Sin nº]{{/if}}' },
      
      // Variables de cotización
      { from: /\{\{money quote\.total\}\}/g, to: '{{$ Q.total}}' },
      { from: /\{\{quote\.total\}\}/g, to: '{{Q.total}}' },
      { from: /\{\{quote\.number\}\}/g, to: '{{Q.nº}}' },
      { from: /\{\{date quote\.date\}\}/g, to: '{{date Q.fecha}}' },
      { from: /\{\{date quote\.validUntil\}\}/g, to: '{{date Q.válida}}' },
      { from: /\{\{quote\.date\}\}/g, to: '{{Q.fecha}}' },
      { from: /\{\{quote\.validUntil\}\}/g, to: '{{Q.válida}}' },
      { from: /\{\{quote\.customer\.name\}\}/g, to: '{{Q.C.nombre}}' },
      { from: /\{\{quote\.customer\.email\}\}/g, to: '{{Q.C.email}}' },
      { from: /\{\{quote\.customer\.phone\}\}/g, to: '{{Q.C.tel}}' },
      { from: /\{\{quote\.vehicle\.plate\}\}/g, to: '{{Q.V.placa}}' },
      { from: /\{\{quote\.vehicle\.brand\}\}/g, to: '{{Q.V.marca}}' },
      { from: /\{\{quote\.vehicle\.model\}\}/g, to: '{{Q.V.modelo}}' },
      { from: /\{\{quote\.vehicle\.year\}\}/g, to: '{{Q.V.año}}' },
      
      // Variables de fecha (helpers)
      { from: /\{\{date sale\.date\}\}/g, to: '{{date S.fecha}}' },
      { from: /\{\{sale\.date\}\}/g, to: '{{S.fecha}}' },
      
      // Variables de vehículo
      { from: /\{\{sale\.vehicle\.plate\}\}/g, to: '{{V.placa}}' },
      { from: /\{\{sale\.vehicle\.brand\}\}/g, to: '{{V.marca}}' },
      { from: /\{\{sale\.vehicle\.model\}\}/g, to: '{{V.modelo}}' },
      { from: /\{\{sale\.vehicle\.year\}\}/g, to: '{{V.año}}' },
      
      // Variables de empresa
      { from: /\{\{company\.name\}\}/g, to: '{{E.nombre}}' },
      { from: /\{\{company\.email\}\}/g, to: '{{E.email}}' },
      { from: /\{\{company\.logoUrl\}\}/g, to: '{{E.logo}}' },
      { from: /\{\{company\.logo\}\}/g, to: '{{E.logo}}' },
      
      // Variables dentro de items (con helpers primero) - EXCLUIR si está dentro de settlement.itemsByType
      // NOTA: Estas solo se aplican a items de ventas/cotizaciones, NO a payroll
      { from: /\{\{money unitPrice\}\}/g, to: '{{$ precio}}' },
      { from: /\{\{money total\}\}/g, to: '{{$ tot}}' },
      { from: /\{\{#if sku\}\}\[\{\{sku\}\}\] \{\{\/if\}\}\{\{name\}\}/g, to: '{{#if sku}}[{{sku}}] {{/if}}{{nom}}' },
      // IMPORTANTE: Solo acortar {{name}} si NO está dentro de settlement.itemsByType (ya protegido arriba)
      { from: /\{\{name\}\}/g, to: '{{nom}}' },
      { from: /\{\{qty\}\}/g, to: '{{cant}}' },
      { from: /\{\{unitPrice\}\}/g, to: '{{precio}}' },
      { from: /\{\{total\}\}/g, to: '{{tot}}' },
      
      // Variables de items anidados (combos)
      { from: /\{\{#each items\}\}/g, to: '{{#each items}}' },
    ];
    
    let result = html;
    let totalReplacements = 0;
    replacements.forEach(({ from, to }, idx) => {
      const matches = result.match(from);
      if (matches) {
        totalReplacements += matches.length;
        // Si to es una función, usarla directamente con replace
        if (typeof to === 'function') {
          result = result.replace(from, to);
        } else {
          result = result.replace(from, to);
        }
        console.log(`[shortenHandlebarsVars] Reemplazo ${idx + 1}: ${matches.length} coincidencias`);
      }
    });
    
    // Restaurar variables de payroll después del acortamiento
    if (payrollMarkers) {
      result = result.replace(new RegExp(payrollMarkers.earningsName, 'g'), '{{name}}');
      result = result.replace(new RegExp(payrollMarkers.earningsValue, 'g'), '{{money value}}');
      result = result.replace(new RegExp(payrollMarkers.deductionsName, 'g'), '{{name}}');
      result = result.replace(new RegExp(payrollMarkers.deductionsValue, 'g'), '{{money value}}');
      console.log('[shortenHandlebarsVars] Variables de payroll restauradas');
    }
    
    console.log('[shortenHandlebarsVars] Total de reemplazos realizados:', totalReplacements);
    console.log('[shortenHandlebarsVars] Longitud HTML resultante:', result.length);
    
    return result;
  }
  
  // Función para restaurar variables completas antes de guardar
  function restoreHandlebarsVars(shortHtml, originalHtml) {
    if (!shortHtml || !originalHtml) return shortHtml;
    
    // Mapeo inverso más específico
    const reverseReplacements = [
      { from: /\{\{C\.nombre\}\}/g, to: '{{sale.customer.name}}' },
      { from: /\{\{C\.email\}\}/g, to: '{{sale.customer.email}}' },
      { from: /\{\{C\.tel\}\}/g, to: '{{sale.customer.phone}}' },
      { from: /\{\{C\.dir\}\}/g, to: '{{sale.customer.address}}' },
      // IMPORTANTE: Restaurar expresión completa ANTES que variables individuales
      { from: /\{\{#if S\.nº\}\}\{\{S\.nº\}\}\{\{else\}\}\[Sin nº\]\{\{\/if\}\}/g, to: '{{#if sale.formattedNumber}}{{sale.formattedNumber}}{{else}}{{#if sale.number}}{{pad sale.number}}{{else}}[Sin número]{{/if}}{{/if}}' },
      { from: /\{\{pad S\.nº\}\}/g, to: '{{pad sale.number}}' },
      { from: /\{\{S\.nº\}\}/g, to: '{{sale.formattedNumber}}' }, // Restaurar S.nº a formattedNumber, no a number
      { from: /\{\{S\.total\}\}/g, to: '{{sale.total}}' },
      { from: /\{\{\$ S\.total\}\}/g, to: '{{money sale.total}}' },
      { from: /\{\{E\.nombre\}\}/g, to: '{{company.name}}' },
      { from: /\{\{E\.email\}\}/g, to: '{{company.email}}' },
      { from: /\{\{E\.logo\}\}/g, to: '{{company.logoUrl}}' },
      { from: /\{\{#if S\.P\}\}/g, to: '{{#if sale.itemsGrouped.hasProducts}}' },
      { from: /\{\{#if S\.S\}\}/g, to: '{{#if sale.itemsGrouped.hasServices}}' },
      { from: /\{\{#if S\.C\}\}/g, to: '{{#if sale.itemsGrouped.hasCombos}}' },
      { from: /\{\{#each S\.P\}\}/g, to: '{{#each sale.itemsGrouped.products}}' },
      { from: /\{\{#each S\.S\}\}/g, to: '{{#each sale.itemsGrouped.services}}' },
      { from: /\{\{#each S\.C\}\}/g, to: '{{#each sale.itemsGrouped.combos}}' },
      // IMPORTANTE: Restaurar variables de payroll ANTES de restaurar {{nom}} genérico
      // Esto asegura que las variables dentro de settlement.itemsByType se restauren correctamente
      { 
        from: /\{\{#each settlement\.itemsByType\.earnings\}\}([\s\S]*?)\{\{nom\}\}([\s\S]*?)\{\{\/each\}\}/g, 
        to: (match, before, after) => {
          return `{{#each settlement.itemsByType.earnings}}${before}{{name}}${after}{{/each}}`;
        }
      },
      { 
        from: /\{\{#each settlement\.itemsByType\.deductions\}\}([\s\S]*?)\{\{nom\}\}([\s\S]*?)\{\{\/each\}\}/g,
        to: (match, before, after) => {
          return `{{#each settlement.itemsByType.deductions}}${before}{{name}}${after}{{/each}}`;
        }
      },
      { from: /\{\{nom\}\}/g, to: '{{name}}' },
      { from: /\{\{cant\}\}/g, to: '{{qty}}' },
      { from: /\{\{precio\}\}/g, to: '{{unitPrice}}' },
      { from: /\{\{\$ precio\}\}/g, to: '{{money unitPrice}}' },
      { from: /\{\{tot\}\}/g, to: '{{total}}' },
      { from: /\{\{\$ tot\}\}/g, to: '{{money total}}' },
      // Restaurar variables de cotización
      { from: /\{\{\$ Q\.total\}\}/g, to: '{{money quote.total}}' },
      { from: /\{\{Q\.total\}\}/g, to: '{{quote.total}}' },
      { from: /\{\{Q\.nº\}\}/g, to: '{{quote.number}}' },
      { from: /\{\{date Q\.fecha\}\}/g, to: '{{date quote.date}}' },
      { from: /\{\{date Q\.válida\}\}/g, to: '{{date quote.validUntil}}' },
      { from: /\{\{Q\.fecha\}\}/g, to: '{{quote.date}}' },
      { from: /\{\{Q\.válida\}\}/g, to: '{{quote.validUntil}}' },
      { from: /\{\{Q\.C\.nombre\}\}/g, to: '{{quote.customer.name}}' },
      { from: /\{\{Q\.C\.email\}\}/g, to: '{{quote.customer.email}}' },
      { from: /\{\{Q\.C\.tel\}\}/g, to: '{{quote.customer.phone}}' },
      { from: /\{\{Q\.V\.placa\}\}/g, to: '{{quote.vehicle.plate}}' },
      { from: /\{\{Q\.V\.marca\}\}/g, to: '{{quote.vehicle.brand}}' },
      { from: /\{\{Q\.V\.modelo\}\}/g, to: '{{quote.vehicle.model}}' },
      { from: /\{\{Q\.V\.año\}\}/g, to: '{{quote.vehicle.year}}' },
      // Restaurar variables de fecha
      { from: /\{\{date S\.fecha\}\}/g, to: '{{date sale.date}}' },
      { from: /\{\{S\.fecha\}\}/g, to: '{{sale.date}}' },
      // Restaurar variables de vehículo
      { from: /\{\{V\.placa\}\}/g, to: '{{sale.vehicle.plate}}' },
      { from: /\{\{V\.marca\}\}/g, to: '{{sale.vehicle.brand}}' },
      { from: /\{\{V\.modelo\}\}/g, to: '{{sale.vehicle.model}}' },
      { from: /\{\{V\.año\}\}/g, to: '{{sale.vehicle.year}}' },
      { from: /\{\{#unless S\.P\}\}/g, to: '{{#unless sale.itemsGrouped.hasProducts}}' },
      { from: /\{\{#unless S\.S\}\}/g, to: '{{#unless sale.itemsGrouped.hasServices}}' },
      { from: /\{\{#unless S\.C\}\}/g, to: '{{#unless sale.itemsGrouped.hasCombos}}' },
      // Restaurar detalles de tabla
      { from: /\{\{#if sku\}\}\[\{\{sku\}\}\] \{\{\/if\}\}\{\{nom\}\}/g, to: '{{#if sku}}[{{sku}}] {{/if}}{{name}}' },
    ];
    
    let result = shortHtml;
    reverseReplacements.forEach(({ from, to }) => {
      result = result.replace(from, to);
    });
    
    // Si el resultado no tiene las variables esperadas, usar el original
    if (!result.includes('sale.') && !result.includes('company.')) {
      console.warn('[restoreHandlebarsVars] No se pudieron restaurar variables, usando HTML original');
      return originalHtml;
    }
    
    return result;
  }
  
  // Función para restaurar variables acortadas antes de enviar al preview (sin necesidad de HTML original)
  function restoreHandlebarsVarsForPreview(html) {
    if (!html) return html;
    
    // Mismo mapeo que restoreHandlebarsVars pero sin necesidad del HTML original
    const replacements = [
      { from: /\{\{C\.nombre\}\}/g, to: '{{sale.customer.name}}' },
      { from: /\{\{C\.email\}\}/g, to: '{{sale.customer.email}}' },
      { from: /\{\{C\.tel\}\}/g, to: '{{sale.customer.phone}}' },
      { from: /\{\{C\.dir\}\}/g, to: '{{sale.customer.address}}' },
      // IMPORTANTE: Restaurar expresión completa ANTES que variables individuales
      { from: /\{\{#if S\.nº\}\}\{\{S\.nº\}\}\{\{else\}\}\[Sin nº\]\{\{\/if\}\}/g, to: '{{#if sale.formattedNumber}}{{sale.formattedNumber}}{{else}}{{#if sale.number}}{{pad sale.number}}{{else}}[Sin número]{{/if}}{{/if}}' },
      { from: /\{\{pad S\.nº\}\}/g, to: '{{pad sale.number}}' },
      { from: /\{\{S\.nº\}\}/g, to: '{{sale.formattedNumber}}' }, // Restaurar S.nº a formattedNumber, no a number
      { from: /\{\{S\.total\}\}/g, to: '{{sale.total}}' },
      { from: /\{\{\$ S\.total\}\}/g, to: '{{money sale.total}}' },
      { from: /\{\{S\.fecha\}\}/g, to: '{{sale.date}}' },
      { from: /\{\{date S\.fecha\}\}/g, to: '{{date sale.date}}' },
      { from: /\{\{E\.nombre\}\}/g, to: '{{company.name}}' },
      { from: /\{\{E\.email\}\}/g, to: '{{company.email}}' },
      { from: /\{\{E\.logo\}\}/g, to: '{{company.logoUrl}}' },
      { from: /\{\{#if S\.P\}\}/g, to: '{{#if sale.itemsGrouped.hasProducts}}' },
      { from: /\{\{#if S\.S\}\}/g, to: '{{#if sale.itemsGrouped.hasServices}}' },
      { from: /\{\{#if S\.C\}\}/g, to: '{{#if sale.itemsGrouped.hasCombos}}' },
      { from: /\{\{#each S\.P\}\}/g, to: '{{#each sale.itemsGrouped.products}}' },
      { from: /\{\{#each S\.S\}\}/g, to: '{{#each sale.itemsGrouped.services}}' },
      { from: /\{\{#each S\.C\}\}/g, to: '{{#each sale.itemsGrouped.combos}}' },
      { from: /\{\{nom\}\}/g, to: '{{name}}' },
      { from: /\{\{cant\}\}/g, to: '{{qty}}' },
      { from: /\{\{precio\}\}/g, to: '{{unitPrice}}' },
      { from: /\{\{\$ precio\}\}/g, to: '{{money unitPrice}}' },
      { from: /\{\{tot\}\}/g, to: '{{total}}' },
      { from: /\{\{\$ tot\}\}/g, to: '{{money total}}' },
      { from: /\{\{\$ Q\.total\}\}/g, to: '{{money quote.total}}' },
      { from: /\{\{Q\.total\}\}/g, to: '{{quote.total}}' },
      { from: /\{\{Q\.nº\}\}/g, to: '{{quote.number}}' },
      { from: /\{\{date Q\.fecha\}\}/g, to: '{{date quote.date}}' },
      { from: /\{\{date Q\.válida\}\}/g, to: '{{date quote.validUntil}}' },
      { from: /\{\{Q\.fecha\}\}/g, to: '{{quote.date}}' },
      { from: /\{\{Q\.válida\}\}/g, to: '{{quote.validUntil}}' },
      { from: /\{\{Q\.C\.nombre\}\}/g, to: '{{quote.customer.name}}' },
      { from: /\{\{Q\.C\.email\}\}/g, to: '{{quote.customer.email}}' },
      { from: /\{\{Q\.C\.tel\}\}/g, to: '{{quote.customer.phone}}' },
      { from: /\{\{Q\.V\.placa\}\}/g, to: '{{quote.vehicle.plate}}' },
      { from: /\{\{Q\.V\.marca\}\}/g, to: '{{quote.vehicle.brand}}' },
      { from: /\{\{Q\.V\.modelo\}\}/g, to: '{{quote.vehicle.model}}' },
      { from: /\{\{Q\.V\.año\}\}/g, to: '{{quote.vehicle.year}}' },
      { from: /\{\{date S\.fecha\}\}/g, to: '{{date sale.date}}' },
      { from: /\{\{V\.placa\}\}/g, to: '{{sale.vehicle.plate}}' },
      { from: /\{\{V\.marca\}\}/g, to: '{{sale.vehicle.brand}}' },
      { from: /\{\{V\.modelo\}\}/g, to: '{{sale.vehicle.model}}' },
      { from: /\{\{V\.año\}\}/g, to: '{{sale.vehicle.year}}' },
      { from: /\{\{#unless S\.P\}\}/g, to: '{{#unless sale.itemsGrouped.hasProducts}}' },
      { from: /\{\{#unless S\.S\}\}/g, to: '{{#unless sale.itemsGrouped.hasServices}}' },
      { from: /\{\{#unless S\.C\}\}/g, to: '{{#unless sale.itemsGrouped.hasCombos}}' },
      { from: /\{\{#if sku\}\}\[\{\{sku\}\}\] \{\{\/if\}\}\{\{nom\}\}/g, to: '{{#if sku}}[{{sku}}] {{/if}}{{name}}' },
    ];
    
    let result = html;
    replacements.forEach(({ from, to }) => {
      result = result.replace(from, to);
    });
    
    return result;
  }
  
  // Función para agregar leyenda de variables ENCIMA de los botones del toolbar
  function addVariableLegend(canvas) {
    // Remover leyenda existente si hay (buscar tanto dentro como fuera del canvas y toolbar)
    const existingLegend = document.querySelector('.variable-legend');
    if (existingLegend) {
      existingLegend.remove();
    }
    
    // Buscar el toolbar donde están los botones
    const toolbar = qs('#ce-toolbar') || qs('.ce-toolbar') || qs('.editor-toolbar');
    if (!toolbar) {
      console.warn('[addVariableLegend] No se encontró el toolbar');
      return;
    }
    
    const legend = document.createElement('div');
    legend.className = 'variable-legend';
    legend.style.cssText = `
      width: 100%;
      background: white;
      border: 2px solid #2563eb;
      border-radius: 8px;
      padding: 10px;
      font-size: 10px;
      font-family: 'Courier New', monospace;
      margin-bottom: 10px;
      line-height: 1.5;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    
    legend.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 6px; color: #2563eb; font-size: 11px;">
        📋 Leyenda de Variables
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 4px;">
        <div><strong>C.</strong> = Cliente</div>
        <div><strong>S.</strong> = Venta</div>
        <div><strong>E.</strong> = Empresa</div>
        <div><strong>S.P</strong> = Productos</div>
        <div><strong>S.S</strong> = Servicios</div>
        <div><strong>S.C</strong> = Combos</div>
        <div><strong>Q.</strong> = Cotización</div>
        <div><strong>V.</strong> = Vehículo</div>
        <div><strong>$</strong> = Formato dinero</div>
      </div>
      <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 9px; color: #666;">
        Las variables se restauran automáticamente al guardar
      </div>
    `;
    
    // Agregar la leyenda AL INICIO del toolbar, antes de los botones
    toolbar.insertBefore(legend, toolbar.firstChild);
    
    console.log('[addVariableLegend] Leyenda agregada en el toolbar');
  }

  function setupImageUpload(element) {
    const placeholder = element.querySelector('.image-placeholder');
    if (!placeholder) return;

    // Mejorar el evento de clic para que funcione mejor
    placeholder.style.cursor = 'pointer';
    placeholder.title = 'Haz clic para seleccionar una imagen';
    
    // Remover listeners anteriores si existen clonando el elemento
    const newPlaceholder = placeholder.cloneNode(true);
    placeholder.parentNode.replaceChild(newPlaceholder, placeholder);
    
    newPlaceholder.onclick = (e) => {
      e.stopPropagation(); // Evitar que se active el drag del elemento padre
      e.preventDefault();
      
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Mostrar indicador de carga
        const loadingText = newPlaceholder.querySelector('div');
        const originalContent = newPlaceholder.innerHTML;
        if (loadingText) {
          newPlaceholder.innerHTML = '<div style="padding: 10px; text-align: center; font-size: 11px; color: #666;">Cargando...</div>';
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
          const rawDataUrl = event?.target?.result;
          if (typeof rawDataUrl !== 'string') {
            alert('El archivo seleccionado no se pudo leer correctamente.');
            newPlaceholder.innerHTML = originalContent;
            return;
          }

          try {
            console.log('[setupImageUpload] Iniciando carga de imagen...');
            const optimizedSrc = await optimizeImageDataUrl(rawDataUrl);
            console.log('[setupImageUpload] Imagen optimizada, longitud data URL:', optimizedSrc.length);
            
            const imgContainer = document.createElement('div');
            imgContainer.className = 'image-container';
            
            // Detectar si el placeholder está dentro de un logo box
            const parentBox = newPlaceholder.closest('.tpl-element');
            const isLogoBox = parentBox && (
              parentBox.style.width === '100px' || 
              parentBox.style.width === '80px' ||
              parentBox.style.width.includes('100px') ||
              parentBox.style.width.includes('80px')
            );
            
            console.log('[setupImageUpload] Tipo de contenedor:', isLogoBox ? 'logoBox' : 'imagen independiente');
            
            // Ocultar editor de texto si existe
            const textEditor = parentBox?.querySelector('.logo-text-editable');
            if (textEditor) {
              textEditor.style.display = 'none';
            }
            
            if (isLogoBox) {
              // Para logo: ajustar al contenedor manteniendo proporciones
              imgContainer.style.cssText = 'position: relative; display: block; padding:0; margin:0; line-height:0; width: 100%; height: 100%;';
              
              // Crear la imagen ANTES de reemplazar el placeholder
              const img = document.createElement('img');
              img.src = optimizedSrc;
              img.draggable = false;
              img.alt = 'Logo';
              img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; display: block;';
              
              // Agregar evento para verificar carga
              img.onload = () => {
                console.log('[setupImageUpload] ✅ Imagen cargada correctamente en logo box');
              };
              img.onerror = (e) => {
                console.error('[setupImageUpload] ❌ Error cargando imagen:', e);
                alert('Error al cargar la imagen. Verifica que el archivo sea una imagen válida.');
              };
              
              // Agregar la imagen al contenedor ANTES de insertarlo en el DOM
              imgContainer.appendChild(img);
              
              // Reemplazar el placeholder con la imagen dentro del logo box
              newPlaceholder.replaceWith(imgContainer);
              
              console.log('[setupImageUpload] Logo box actualizado, imagen agregada:', {
                hasImage: !!imgContainer.querySelector('img'),
                imgSrc: img.src.substring(0, 50) + '...'
              });
            } else {
              // Para otras imágenes: crear un elemento arrastrable independiente
              imgContainer.style.cssText = 'position: absolute; display: block; padding:0; margin:0; line-height:0; cursor: move; border: 2px solid transparent; min-width: 50px; min-height: 50px;';
              
              // Obtener posición del placeholder antes de reemplazarlo
              const placeholderRect = newPlaceholder.getBoundingClientRect();
              const canvas = newPlaceholder.closest('#ce-canvas');
              if (canvas) {
                const canvasRect = canvas.getBoundingClientRect();
                const left = placeholderRect.left - canvasRect.left;
                const top = placeholderRect.top - canvasRect.top;
                imgContainer.style.left = left + 'px';
                imgContainer.style.top = top + 'px';
              } else {
                // Si no hay canvas, usar posición por defecto
                imgContainer.style.left = '20px';
                imgContainer.style.top = '20px';
              }
              
              // Agregar clase tpl-element para que sea arrastrable
              imgContainer.classList.add('tpl-element');
              imgContainer.id = `element_${visualEditor.nextId++}`;
              
              // Crear la imagen ANTES de reemplazar el placeholder
              const img = document.createElement('img');
              img.src = optimizedSrc;
              img.draggable = false;
              img.alt = 'Imagen';
              // Usar dimensiones explícitas en lugar de porcentajes para evitar que se achique
              img.style.cssText = 'width: auto; height: auto; display: block; max-width: none; max-height: none;';
              
              // Agregar evento para verificar carga y establecer dimensiones
              img.onload = () => {
                console.log('[setupImageUpload] ✅ Imagen cargada correctamente (independiente)');
                // Establecer dimensiones explícitas basadas en las dimensiones naturales de la imagen
                const imgWidth = img.naturalWidth || 200;
                const imgHeight = img.naturalHeight || 200;
                
                // Establecer dimensiones del contenedor ANTES de agregar la imagen
                imgContainer.style.width = imgWidth + 'px';
                imgContainer.style.height = imgHeight + 'px';
                
                // Establecer dimensiones explícitas de la imagen
                img.style.width = imgWidth + 'px';
                img.style.height = imgHeight + 'px';
                
                console.log('[setupImageUpload] Dimensiones de imagen aplicadas:', { 
                  width: imgWidth, 
                  height: imgHeight,
                  containerWidth: imgContainer.style.width,
                  containerHeight: imgContainer.style.height
                });
              };
              img.onerror = (e) => {
                console.error('[setupImageUpload] ❌ Error cargando imagen:', e);
                alert('Error al cargar la imagen. Verifica que el archivo sea una imagen válida.');
              };
              
              // Agregar la imagen al contenedor ANTES de insertarlo en el DOM
              imgContainer.appendChild(img);
              
              // Obtener el canvas antes de reemplazar el placeholder
              const canvasElement = newPlaceholder.closest('#ce-canvas');
              
              // Reemplazar el placeholder con el contenedor completo (con imagen)
              newPlaceholder.replaceWith(imgContainer);
              
              // Si el canvas existe y el elemento no está dentro de él, agregarlo
              if (canvasElement && !canvasElement.contains(imgContainer)) {
                canvasElement.appendChild(imgContainer);
              }
              
              // Asegurar que el elemento tenga position absolute
              imgContainer.style.position = 'absolute';
              
              // Agregar handles de redimensionamiento para imágenes independientes
              addResizeHandles(imgContainer, img);
              
              // Hacer el contenedor arrastrable DESPUÉS de agregarlo al DOM
              makeDraggable(imgContainer);
              makeSelectable(imgContainer);
              
              // Agregar a la lista de elementos
              visualEditor.elements.push({
                id: imgContainer.id,
                type: 'image',
                element: imgContainer
              });
              
              // Seleccionar el elemento recién creado
              selectElement(imgContainer);
              
              console.log('[setupImageUpload] Imagen independiente agregada:', {
                id: imgContainer.id,
                className: imgContainer.className,
                position: imgContainer.style.position,
                left: imgContainer.style.left,
                top: imgContainer.style.top,
                hasImage: !!imgContainer.querySelector('img'),
                imgSrc: img.src.substring(0, 50) + '...',
                parentElement: imgContainer.parentElement?.tagName,
                isInCanvas: canvasElement?.contains(imgContainer)
              });
            }
            
            // Ya no necesitamos crear la imagen aquí porque se creó arriba
            // const img = document.createElement('img');
            // img.src = optimizedSrc;
            // img.draggable = false;
            // img.alt = 'Logo';
            
            // if (isLogoBox) {
            //   img.style.cssText = 'width: 100%; height: 100%; object-fit: contain; display: block;';
            // } else {
            //   img.style.cssText = 'max-width: 100%; height: auto; display: block;';
            //   // Agregar handles de redimensionamiento para imágenes independientes
            //   addResizeHandles(imgContainer, img);
            // }
            
            // imgContainer.appendChild(img);
            
            // Asegurar que el contenedor padre mantenga las propiedades correctas (solo para logo box)
            if (parentBox && isLogoBox) {
              parentBox.style.padding = '0';
              parentBox.style.display = 'flex';
              parentBox.style.alignItems = 'center';
              parentBox.style.justifyContent = 'center';
            }
            
            showQuickNotification('✅ Imagen cargada correctamente', 'success');
          } catch (error) {
            console.error('Error procesando imagen:', error);
            alert('Error al procesar la imagen: ' + error.message);
            newPlaceholder.innerHTML = originalContent;
          }
        };
        
        reader.onerror = () => {
          alert('Error al leer el archivo.');
          newPlaceholder.innerHTML = originalContent;
        };
        
        reader.readAsDataURL(file);
      };
      
      document.body.appendChild(input);
      input.click();
      setTimeout(() => document.body.removeChild(input), 100);
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
        // Asegurar que el contenedor siempre tenga el mismo tamaño que la imagen
        const imgWidth = img.offsetWidth || img.naturalWidth || 0;
        const imgHeight = img.offsetHeight || img.naturalHeight || 0;
        
        // Solo actualizar si las dimensiones son válidas y mayores que un mínimo
        if (imgWidth > 10 && imgHeight > 10) {
          const currentWidth = parseInt(container.style.width) || 0;
          const currentHeight = parseInt(container.style.height) || 0;
          
          // Solo actualizar si las dimensiones actuales son significativamente diferentes
          // o si no hay dimensiones establecidas
          if (currentWidth === 0 || currentHeight === 0 || 
              Math.abs(currentWidth - imgWidth) > 5 || 
              Math.abs(currentHeight - imgHeight) > 5) {
            container.style.width = imgWidth + 'px';
            container.style.height = imgHeight + 'px';
          }
        }
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
      
      // Asegurar que el contenedor siempre tenga el mismo tamaño que la imagen
      container.style.width = newWidth + 'px';
      container.style.height = newHeight + 'px';
      
      try {
        const parentTpl = container.closest('.tpl-element');
        if (parentTpl && parentTpl !== container) {
          parentTpl.style.width = newWidth + 'px';
          parentTpl.style.height = newHeight + 'px';
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
      </div>
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">💼 Datos del Técnico/Empleado</h4>
        ${createFriendlyButtons([
          { label: 'Salario Básico ($/MES)', icon: '💰', value: '{{#if settlement.technician.basicSalary}}{{money settlement.technician.basicSalary}}{{/if}}' },
          { label: 'Horas Trabajo MES', icon: '⏰', value: '{{#if settlement.technician.workHoursPerMonth}}{{settlement.technician.workHoursPerMonth}}{{/if}}' },
          { label: 'Salario Básico (DÍA)', icon: '💵', value: '{{#if settlement.technician.basicSalaryPerDay}}{{money settlement.technician.basicSalaryPerDay}}{{/if}}' },
          { label: 'Tipo Contrato', icon: '📄', value: '{{#if settlement.technician.contractType}}{{settlement.technician.contractType}}{{/if}}' }
        ])}
      </div>`;
    } else {
      html += `
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">💰 Datos de Venta/Remisión</h4>
        ${createFriendlyButtons([
          { label: 'Número de remisión', icon: '#️⃣', value: '{{sale.number}}' },
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
          { label: 'Lista de servicios (ventas)', icon: '📝', value: '{{#each sale.items}}• {{qty}}x {{name}} - {{money total}}\\n{{/each}}', multiline: true },
          { label: 'Lista de servicios (cotizaciones)', icon: '💰', value: '{{#each quote.items}}• {{qty}}x {{description}} - {{money unitPrice}} c/u = {{money subtotal}}\\n{{/each}}', multiline: true }
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


  function addSessionHeader(documentType, action, formatId) {
    // Placeholder - se implementará después si es necesario
    console.log('Session header:', { documentType, action, formatId });
  }

  function adjustCanvasHeightToContent(canvas) {
    if (!canvas) return;
    
    // Calcular la altura máxima de todos los elementos
    let maxBottom = 0;
    
    // Verificar todos los elementos editables (.tpl-element)
    const elements = canvas.querySelectorAll('.tpl-element');
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const bottom = rect.bottom - canvasRect.top;
      if (bottom > maxBottom) maxBottom = bottom;
    });
    
    // También verificar todos los hijos directos (líneas, divs, etc.)
    const allChildren = Array.from(canvas.children);
    allChildren.forEach(child => {
      // Ignorar elementos que no tienen posición absoluta o que son muy pequeños
      const style = window.getComputedStyle(child);
      const rect = child.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const bottom = rect.bottom - canvasRect.top;
      
      // Solo considerar elementos que están realmente posicionados
      if (bottom > maxBottom && (rect.height > 5 || style.position === 'absolute')) {
        maxBottom = bottom;
      }
    });
    
    // Ajustar altura mínima del canvas con padding
    if (maxBottom > 0) {
      const padding = 40; // Padding inferior
      const newMinHeight = maxBottom + padding;
      canvas.style.minHeight = newMinHeight + 'px';
      canvas.style.height = 'auto'; // Asegurar altura automática
      console.log(`📏 Canvas ajustado a altura mínima: ${newMinHeight}px (contenido: ${maxBottom}px + padding: ${padding}px)`);
    }
  }

  function applyCanvasSizeFromFormat(template) {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;
    
    // Tamaños predefinidos en cm (convertidos a px a 96 DPI)
    const formatSizes = {
      'carta': { width: 21.6, height: 27.9 },
      'media carta': { width: 14, height: 21.6 },
      'half-letter': { width: 14, height: 21.6 },
      'letter': { width: 21.6, height: 27.9 },
      'sticker': { width: 5, height: 3 },
      'sticker-qr': { width: 5, height: 3 },
    };
    
    // Función para convertir cm a px (96 DPI)
    function cmToPx(cm) {
      return Math.round(cm * 37.795275591);
    }
    
    // Determinar tamaño del formato
    let size = null;
    const formatName = (template?.name || '').toLowerCase();
    const formatType = (template?.type || '').toLowerCase();
    
    // Buscar en el nombre del formato
    for (const [key, value] of Object.entries(formatSizes)) {
      if (formatName.includes(key) || formatType.includes(key)) {
        size = value;
        break;
      }
    }
    
    // Si hay información en meta, usarla
    if (!size && template?.meta?.pageSize) {
      const pageSize = template.meta.pageSize.toLowerCase();
      if (formatSizes[pageSize]) {
        size = formatSizes[pageSize];
      }
    }
    
    // Si hay dimensiones personalizadas en meta
    if (!size && template?.meta?.width && template?.meta?.height) {
      size = {
        width: parseFloat(template.meta.width),
        height: parseFloat(template.meta.height)
      };
    }
    
    // Por defecto, usar carta si no se encuentra nada
    if (!size) {
      size = formatSizes['carta'];
    }
    
    // Aplicar tamaño al canvas - usar min-height para que se ajuste al contenido
    const widthPx = cmToPx(size.width);
    const minHeightPx = cmToPx(size.height);
    
    const isLightMode = document.body.classList.contains('theme-light');
    const borderColor = isLightMode ? '#cbd5e1' : '#475569';
    
    canvas.style.width = widthPx + 'px';
    canvas.style.minHeight = minHeightPx + 'px'; // Usar min-height en lugar de height fijo
    canvas.style.maxWidth = widthPx + 'px';
    canvas.style.height = 'auto'; // Altura automática para que se ajuste al contenido
    canvas.style.minWidth = widthPx + 'px';
    canvas.style.margin = '0 auto';
    canvas.style.border = `2px dashed ${borderColor}`;
    canvas.style.background = '#ffffff';
    
    console.log(`📐 Canvas ajustado a: ${size.width} cm de ancho, altura mínima ${size.height} cm (${widthPx} x ${minHeightPx} px)`);
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
      
      // LIMPIAR COMPLETAMENTE el canvas antes de cargar
      canvas.innerHTML = '';
      visualEditor.elements = [];
      visualEditor.nextId = 1;
      
      // Ensure canvas is visible and properly sized
      canvas.style.display = 'block';
      canvas.style.visibility = 'visible';
      canvas.style.background = '#ffffff';
      canvas.offsetHeight; // Force reflow
      
      // Ajustar tamaño del canvas según el formato
      applyCanvasSizeFromFormat(template);
      
        // SIEMPRE cargar el HTML guardado si existe (formato existente)
        // La plantilla base solo se usa cuando se crea un formato nuevo por primera vez
        if (template.contentHtml && template.contentHtml.trim() && 
            !template.contentHtml.includes('Haz clic en los botones') && 
            !template.contentHtml.includes('Tu plantilla está vacía')) {
          console.log('📄 Formato existente detectado - Cargando HTML guardado...');
          
          // Guardar HTML original para restaurar variables al guardar
          if (!window.templateOriginalHtml) {
            window.templateOriginalHtml = {};
          }
          window.templateOriginalHtml[formatId] = template.contentHtml;
          
          console.log('[loadExistingFormat] HTML original guardado, longitud:', template.contentHtml.length);
          
          // Convertir variables largas a formato corto para el canvas
          let shortHtml = shortenHandlebarsVars(template.contentHtml, template.type);
          
          // Si es una plantilla de nómina, actualizar campos editables con variables
          if (template.type === 'payroll') {
            shortHtml = updatePayrollEditableFields(shortHtml);
          }
          
          console.log('[loadExistingFormat] HTML acortado generado, longitud:', shortHtml.length);
          console.log('[loadExistingFormat] Ejemplo de acortamiento:', {
            original: template.contentHtml.substring(0, 200),
            shortened: shortHtml.substring(0, 200)
          });
          
          canvas.innerHTML = shortHtml;
          
          // Agregar leyenda de variables
          addVariableLegend(canvas);
        
        // Restaurar elementos del visual editor desde el HTML
        const elements = canvas.querySelectorAll('.tpl-element');
        elements.forEach((el, idx) => {
          if (!el.id) {
            el.id = `element_${visualEditor.nextId++}`;
          }
          makeDraggable(el);
          makeSelectable(el);
          
          // Extraer el ID numérico para actualizar nextId
          const idMatch = el.id.match(/element_(\d+)/);
          if (idMatch) {
            const numId = parseInt(idMatch[1], 10);
            if (numId >= visualEditor.nextId) {
              visualEditor.nextId = numId + 1;
            }
          }
        });
        
        // Restaurar también contenedores de imagen que no tienen clase tpl-element
        const imageContainers = canvas.querySelectorAll('.image-container');
        imageContainers.forEach(imgContainer => {
          // Si el contenedor de imagen no está dentro de un tpl-element, hacerlo arrastrable
          if (!imgContainer.closest('.tpl-element')) {
            imgContainer.classList.add('tpl-element');
            if (!imgContainer.id) {
              imgContainer.id = `element_${visualEditor.nextId++}`;
            }
            // Asegurar que tenga position absolute
            if (!imgContainer.style.position || imgContainer.style.position === 'relative') {
              imgContainer.style.position = 'absolute';
            }
            makeDraggable(imgContainer);
            makeSelectable(imgContainer);
            
            // Agregar a la lista de elementos
            visualEditor.elements.push({
              id: imgContainer.id,
              type: 'image',
              element: imgContainer
            });
          }
        });
        
        // Restaurar también elementos que no tienen clase tpl-element pero son editables
        const editableElements = canvas.querySelectorAll('[contenteditable="true"]');
        editableElements.forEach(el => {
          if (!el.closest('.tpl-element')) {
            const parent = el.closest('[style*="position: absolute"]');
            if (parent && !parent.classList.contains('tpl-element')) {
              parent.classList.add('tpl-element');
              if (!parent.id) {
                parent.id = `element_${visualEditor.nextId++}`;
              }
              makeDraggable(parent);
              makeSelectable(parent);
            }
          }
        });
        
        // Ajustar altura del canvas al contenido
        adjustCanvasHeightToContent(canvas);
        
        showQuickNotification(`✅ Formato "${template.name}" cargado correctamente`, 'success');
      } else {
        // Solo cargar plantilla base si NO hay HTML guardado (formato nuevo)
        console.log('🆕 Formato nuevo detectado - Cargando plantilla base por defecto...');
        const templateType = template.type || window.currentTemplateSession?.type || 'invoice';
        loadDefaultTemplate(templateType);
        showQuickNotification(`🆕 Nueva plantilla base cargada para "${template.name}"`, 'success');
      }
      
    } catch (error) {
      console.error('❌ Error cargando formato:', error);
      showQuickNotification(`⚠️ Error cargando formato: ${error.message}`, 'error');
      
      // En edición, intentar cargar plantilla por defecto como fallback
      const session = window.currentTemplateSession;
      if (session && session.type) {
        console.log('🔄 Cargando plantilla por defecto como fallback...');
        const canvas = qs('#ce-canvas');
        if (canvas) {
          canvas.innerHTML = '';
          visualEditor.elements = [];
          visualEditor.nextId = 1;
        }
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

    console.log('✅ Canvas encontrado, limpiando completamente...');

    // LIMPIAR COMPLETAMENTE el canvas ANTES de cualquier otra operación
    canvas.innerHTML = '';
    visualEditor.elements = [];
    visualEditor.nextId = 1;

    // Asegurar que el canvas sea visible y tenga fondo blanco
    canvas.style.display = 'block';
    canvas.style.visibility = 'visible';
    canvas.style.background = '#ffffff';
    canvas.offsetHeight; // Force reflow
    
    // Ajustar tamaño del canvas según el tipo de documento
    // Para tipos de sticker, usar tamaño pequeño; para otros, usar carta por defecto
    // El canvas se ajustará automáticamente al contenido (min-height)
    const mockTemplate = { type: documentType };
    applyCanvasSizeFromFormat(mockTemplate);
    
    console.log('✅ Canvas limpio y visible, creando nueva plantilla...');

    console.log('📋 Creando plantilla para tipo:', documentType);

    // Cargar plantilla según el tipo
    try {
      if (documentType === 'invoice') {
        createRemissionTemplate(canvas);
        showQuickNotification('📄 Plantilla de Remisión cargada', 'success');
      } else if (documentType === 'workOrder') {
        createWorkOrderTemplate(canvas);
        showQuickNotification('🔧 Plantilla de Orden de Trabajo cargada', 'success');
      } else if (documentType === 'quote') {
        createQuoteTemplate(canvas);
        showQuickNotification('💰 Plantilla de Cotización cargada', 'success');
      } else if (documentType === 'invoice-factura') {
        // Factura usa plantilla específica con IVA
        createInvoiceTemplate(canvas);
        showQuickNotification('📄 Plantilla de Factura cargada', 'success');
      } else if (documentType === 'sticker-qr') {
        createStickerTemplate(canvas, documentType);
        showQuickNotification('🏷️ Plantilla de Sticker cargada', 'success');
      } else if (documentType === 'payroll') {
        createPayrollTemplate(canvas);
        showQuickNotification('💰 Plantilla de Nómina cargada', 'success');
      } else {
        console.warn('⚠️ Tipo de documento no reconocido:', documentType);
        showQuickNotification('⚠️ Tipo de documento no reconocido: ' + documentType, 'warning');
        // Cargar remisión por defecto si no se reconoce el tipo
        createRemissionTemplate(canvas);
        showQuickNotification('📄 Cargada plantilla de Remisión por defecto', 'info');
      }
      
      console.log('✅ Plantilla creada, elementos en canvas:', visualEditor.elements.length);
      
      // Verificar que los elementos se agregaron
      const elementsInDOM = canvas.querySelectorAll('.tpl-element');
      console.log('📊 Elementos en DOM:', elementsInDOM.length);
      
      if (elementsInDOM.length === 0) {
        console.error('❌ ERROR: No se agregaron elementos al canvas!');
        showQuickNotification('❌ Error: No se pudieron crear los elementos', 'error');
      }
      
      // Aplicar acortamiento de variables al HTML del canvas después de crear la plantilla
      console.log('[loadDefaultTemplate] Aplicando acortamiento de variables...');
      const currentHtml = canvas.innerHTML;
      const templateType = window.currentTemplateSession?.type || '';
      const shortenedHtml = shortenHandlebarsVars(currentHtml, templateType);
      
      // Solo actualizar si hubo cambios
      if (shortenedHtml !== currentHtml) {
        console.log('[loadDefaultTemplate] Variables acortadas, actualizando canvas...');
        canvas.innerHTML = shortenedHtml;
        
        // Re-inicializar elementos después de actualizar el HTML
        const updatedElements = canvas.querySelectorAll('.tpl-element');
        updatedElements.forEach((el) => {
          if (!el.id) {
            el.id = `element_${visualEditor.nextId++}`;
          }
          makeDraggable(el);
          makeSelectable(el);
        });
        
        // Restaurar contenedores de imagen
        const imageContainers = canvas.querySelectorAll('.image-container');
        imageContainers.forEach(imgContainer => {
          if (!imgContainer.closest('.tpl-element')) {
            imgContainer.classList.add('tpl-element');
            if (!imgContainer.id) {
              imgContainer.id = `element_${visualEditor.nextId++}`;
            }
            if (!imgContainer.style.position || imgContainer.style.position === 'relative') {
              imgContainer.style.position = 'absolute';
            }
            makeDraggable(imgContainer);
            makeSelectable(imgContainer);
          }
        });
        
        // Re-aplicar setupImageUpload a los logo boxes
        const logoBoxes = canvas.querySelectorAll('.tpl-element');
        logoBoxes.forEach(box => {
          if (box.querySelector('.image-placeholder')) {
            setupImageUpload(box);
          }
        });
        
        console.log('[loadDefaultTemplate] ✅ Variables acortadas y elementos re-inicializados');
      }
      
      // Agregar leyenda de variables
      addVariableLegend(canvas);
      
      // Ajustar altura del canvas según el contenido después de crear los elementos
      // Esto hace que el canvas solo ocupe el espacio necesario
      setTimeout(() => {
        adjustCanvasHeightToContent(canvas);
      }, 500); // Aumentar delay para asegurar que todos los elementos estén renderizados
      
    } catch (error) {
      console.error('❌ Error creando plantilla:', error);
      showQuickNotification('❌ Error al crear plantilla: ' + error.message, 'error');
    }
  }

  function createRemissionTemplate(canvas) {
    console.log('🎨 Creando plantilla de remisión completa...');
    
    // Título REMISIÓN (arriba izquierda) - Compactado para media carta
    const title = createEditableElement('title', 'REMISIÓN', {
      position: { left: 19, top: 10 },
      styles: { fontSize: '38px', fontWeight: 'bold', color: '#000', fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px' }
    });
    canvas.appendChild(title);

    // Número de remisión en caja negra - Compactado
    const numberBox = document.createElement('div');
    numberBox.className = 'tpl-element';
    numberBox.id = `element_${visualEditor.nextId++}`;
    numberBox.style.cssText = 'position: absolute; left: 19px; top: 45px; border: 2px solid #000; padding: 4px 8px; display: inline-block;';
    numberBox.innerHTML = '<span contenteditable="true" style="font-size: 15.1px; font-weight: bold; color: #000; font-family: Arial, sans-serif;">Nº: {{#if S.nº}}{{S.nº}}{{else}}[Sin nº]{{/if}}</span>';
    makeDraggable(numberBox);
    makeSelectable(numberBox);
    canvas.appendChild(numberBox);
    visualEditor.elements.push({ id: numberBox.id, type: 'text', element: numberBox });

    // Fecha de venta (al lado del número de remisión, a la derecha)
    const dateBox = document.createElement('div');
    dateBox.className = 'tpl-element';
    dateBox.id = `element_${visualEditor.nextId++}`;
    dateBox.style.cssText = 'position: absolute; left: 180px; top: 45px; padding: 4px 8px; display: inline-block;';
    dateBox.innerHTML = '<span contenteditable="true" style="font-size: 11px; color: #000; font-family: Arial, sans-serif;">Fecha: {{#if sale.formattedDate}}{{sale.formattedDate}}{{else}}{{date sale.date}}{{/if}}</span>';
    makeDraggable(dateBox);
    makeSelectable(dateBox);
    canvas.appendChild(dateBox);
    visualEditor.elements.push({ id: dateBox.id, type: 'text', element: dateBox });

    // Logo/empresa (arriba derecha) - Compactado para media carta
    const logoBox = document.createElement('div');
    logoBox.className = 'tpl-element';
    logoBox.id = `element_${visualEditor.nextId++}`;
    logoBox.style.cssText = 'position: absolute; right: 19px; top: 10px; width: 60px; height: 60px; border: 2px solid #000; padding: 3px; display: flex; align-items: center; justify-content: center; cursor: move; background: white; box-sizing: border-box;';
    logoBox.innerHTML = `
      <div class="image-placeholder" style="width: 100%; height: 100%; background: #f5f5f5; border: 2px dashed #999; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; color: #666; text-align: center; padding: 5px; box-sizing: border-box; position: relative;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 5px; pointer-events: none;">
          <div style="font-size: 24px;">🖼️</div>
          <div>Haz clic para<br>agregar logo</div>
        </div>
        <div style="position: absolute; bottom: 2px; left: 2px; right: 2px; font-size: 9px; color: #999; pointer-events: none; text-align: center;">o edita para usar:<br>{{company.logoUrl}}</div>
      </div>
      <div class="logo-text-editable" contenteditable="true" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0; cursor: text; z-index: 10; font-size: 10px; padding: 5px; word-break: break-all;" title="Haz doble clic para editar y usar variable {{company.logoUrl}}"></div>
    `;
    
    // Permitir edición de texto para usar variables
    const textEditor = logoBox.querySelector('.logo-text-editable');
    if (textEditor) {
      textEditor.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        textEditor.style.opacity = '1';
        textEditor.style.background = 'rgba(255,255,255,0.95)';
        textEditor.focus();
        textEditor.textContent = '{{company.logoUrl}}';
      });
      textEditor.addEventListener('blur', () => {
        const content = textEditor.textContent.trim();
        if (content && content.includes('{{')) {
          // Si tiene variable, crear imagen con esa variable
          const placeholder = logoBox.querySelector('.image-placeholder');
          if (placeholder) {
            placeholder.innerHTML = `<img src="${content}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding: 10px; text-align: center; font-size: 10px; color: #999;\\'>Variable: ${content}</div>';" />`;
            placeholder.style.border = 'none';
            placeholder.style.background = 'transparent';
          }
        }
        textEditor.style.opacity = '0';
        textEditor.style.background = 'transparent';
      });
    }
    
    makeDraggable(logoBox);
    makeSelectable(logoBox);
    setupImageUpload(logoBox);
    canvas.appendChild(logoBox);
    visualEditor.elements.push({ id: logoBox.id, type: 'image', element: logoBox });

    // Sección DATOS DEL CLIENTE (izquierda) - Cuadro organizado en 2x2
    // 1cm de espacio desde el número (45px + 38px = 83px)
    const clientBox = document.createElement('div');
    clientBox.className = 'tpl-element client-data-box';
    clientBox.id = `element_${visualEditor.nextId++}`;
    clientBox.style.cssText = 'position: absolute; left: 19px; top: 83px; width: 331px; border: 2px solid #000; padding: 8px; background: white; z-index: 10;';
    clientBox.innerHTML = `
      <style>
        .client-data-box {
          position: absolute !important;
          left: 19px !important;
          top: 83px !important;
          width: 336px !important;
          border: 2px solid #000 !important;
          padding: 8px !important;
          background: white !important;
          z-index: 10 !important;
          page-break-inside: avoid !important;
        }
        @media print {
          .client-data-box {
            position: absolute !important;
            left: 19px !important;
            top: 83px !important;
            width: 336px !important;
            border: 2px solid #000 !important;
            padding: 8px !important;
            background: white !important;
            z-index: 10 !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
          }
        }
      </style>
      <div style="font-size: 14px; font-weight: bold; color: #000; font-family: Arial, sans-serif; margin-bottom: 5px; text-align: center; border-bottom: 1px solid #000; padding-bottom: 3px;">DATOS DEL CLIENTE</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: Arial, sans-serif; margin-top: 2px;">
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold; width: 30%;">Nombre:</td>
          <td style="border: 1px solid #000; padding: 5px 4px; width: 70%;"><span contenteditable="true">{{sale.customer.name}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Email:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{sale.customer.email}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Teléfono:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{sale.customer.phone}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Dirección:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{sale.customer.address}}</span></td>
        </tr>
      </table>
    `;
    makeDraggable(clientBox);
    makeSelectable(clientBox);
    canvas.appendChild(clientBox);
    visualEditor.elements.push({ id: clientBox.id, type: 'text', element: clientBox });

    // Sección DATOS DE LA EMPRESA (derecha) - Cuadro organizado en 2x2
    const companyBox = document.createElement('div');
    companyBox.className = 'tpl-element company-data-box';
    companyBox.id = `element_${visualEditor.nextId++}`;
    companyBox.style.cssText = 'position: absolute; right: 19px; top: 83px; width: 331px; border: 2px solid #000; padding: 8px; background: white; z-index: 10;';
    companyBox.innerHTML = `
      <style>
        .company-data-box {
          position: absolute !important;
          left: 365px !important;
          right: auto !important;
          top: 83px !important;
          width: 336px !important;
          border: 2px solid #000 !important;
          padding: 8px !important;
          background: white !important;
          z-index: 10 !important;
          page-break-inside: avoid !important;
        }
        @media print {
          .company-data-box {
            position: absolute !important;
            left: 365px !important;
          right: auto !important;
            top: 83px !important;
            width: 336px !important;
            border: 2px solid #000 !important;
            padding: 8px !important;
            background: white !important;
            z-index: 10 !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
          }
        }
      </style>
      <div style="font-size: 14px; font-weight: bold; color: #000; font-family: Arial, sans-serif; margin-bottom: 5px; text-align: center; border-bottom: 1px solid #000; padding-bottom: 3px;">DATOS DE LA EMPRESA</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: Arial, sans-serif; margin-top: 2px;">
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold; width: 30%;">Nombre:</td>
          <td style="border: 1px solid #000; padding: 5px 4px; width: 70%;"><span contenteditable="true">{{company.name}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Email:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.email}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Teléfono:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.phone}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Dirección:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.address}}</span></td>
        </tr>
      </table>
    `;
    makeDraggable(companyBox);
    makeSelectable(companyBox);
    canvas.appendChild(companyBox);
    visualEditor.elements.push({ id: companyBox.id, type: 'text', element: companyBox });

    // Calcular la posición de la tabla: después de los cuadros de datos + 1cm de separación
    // Los cuadros empiezan en top: 83px
    // Altura aproximada del cuadro: título (~18px) + tabla 4 filas (~100px con nuevo padding) + padding (16px) = ~134px
    // 1cm = aproximadamente 38px
    // Posición tabla: 83px + 134px + 38px = 255px (redondeado a 260px para más espacio)
    // Ancho de los cuadros: Cliente (336px) + gap (10px) + Empresa (336px) = 682px
    // La tabla debe tener el mismo ancho total que los dos cuadros juntos
    const itemsTable = createRemissionItemsTable({ left: 19, top: 260, width: 682 });
    canvas.appendChild(itemsTable);

    // NOTA: El total ahora está dentro de la tabla como tfoot, así que ya no necesitamos ajustar posición separada

    // Footer con URL (centro abajo) - Removido para que quepa en una página
    // const footer = createEditableElement('text', '[Editar sitio web]', {
    //   position: { left: 40, top: 700 },
    //   styles: { fontSize: '12px', fontWeight: 'bold', color: '#000', fontFamily: 'Arial, sans-serif', textAlign: 'center', width: '100%' }
    // });
    // canvas.appendChild(footer);

    console.log('✅ Plantilla de remisión creada con todos los elementos');
  }

  function createRemissionItemsTable(position) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'tpl-element items-table';
    tableContainer.id = `element_${visualEditor.nextId++}`;
    // Si se especifica un ancho, usarlo; sino usar el cálculo original
    const tableWidth = position.width || `calc(100% - ${position.left * 2}px)`;
    const maxWidth = position.width ? `${position.width}px` : '520px';
    tableContainer.style.cssText = `
      position: absolute;
      left: ${position.left}px;
      top: ${position.top}px;
      border: 2px solid transparent;
      cursor: move;
      width: ${tableWidth};
      max-width: ${maxWidth};
      background: white;
    `;
    
    // Agregar clase para centrado en impresión
    tableContainer.classList.add('remission-content');

    tableContainer.innerHTML = `
      <style>
        .remission-table {
          width: 100%;
          border-collapse: collapse;
          font-family: Arial, sans-serif;
          table-layout: fixed;
          margin: 0;
        }
        .remission-table thead {
          display: table-header-group;
        }
        .remission-table tbody {
          display: table-row-group;
        }
        .remission-table tfoot {
          display: table-footer-group;
        }
        .remission-table tfoot tr {
          border-top: 2px solid #000 !important;
        }
        .remission-table tfoot td {
          border: 1px solid #000 !important;
          padding: 2px 4px !important;
          font-size: 12.4px !important;
          font-weight: bold !important;
        }
        .remission-table th {
          border: 2px solid #000 !important;
          padding: 2px 3px;
          font-weight: bold;
          color: #000;
          font-size: 12.4px;
          background: white;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .remission-table td {
          border: 1px solid #000 !important;
          padding: 1px 3px;
          color: #000;
          font-size: 11px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          vertical-align: top;
          line-height: 1.2;
        }
        .remission-table th:nth-child(1),
        .remission-table td:nth-child(1) {
          width: 45%;
          text-align: left;
        }
        .remission-table th:nth-child(2),
        .remission-table td:nth-child(2) {
          width: 15%;
          text-align: center;
        }
        .remission-table th:nth-child(3),
        .remission-table td:nth-child(3) {
          width: 20%;
          text-align: center;
        }
        .remission-table th:nth-child(4),
        .remission-table td:nth-child(4) {
          width: 20%;
          text-align: right;
        }
        .remission-table .t-center {
          text-align: center !important;
        }
        .remission-table .t-right {
          text-align: right !important;
        }
        /* Estilos para impresión/PDF */
        @media print {
          .remission-table {
            page-break-inside: auto;
            border-collapse: collapse !important;
            width: 100% !important;
          }
          .remission-table thead {
            display: table-header-group !important;
          }
          .remission-table tbody {
            display: table-row-group !important;
          }
          .remission-table tfoot {
            display: table-footer-group !important;
          }
          .remission-table tfoot tr {
            border-top: 2px solid #000 !important;
          }
          .remission-table tfoot td {
            border: 1px solid #000 !important;
            padding: 2px 4px !important;
            font-size: 12.4px !important;
            font-weight: bold !important;
          }
          .remission-table tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          .remission-table th,
          .remission-table td {
            border: 1px solid #000 !important;
            padding: 1px 2px !important;
            font-size: 11px !important;
            line-height: 1.1 !important;
          }
          .remission-table th {
            border-width: 2px !important;
            background: white !important;
          }
        }
        /* Estilos para vista previa */
        .remission-table {
          border: 2px solid #000;
        }
      </style>
      <table class="remission-table">
        <thead>
          {{#if sale.vehicle}}
          <tr style="background: #e8f4f8; font-weight: bold; border: 2px solid #000; border-bottom: 1px solid #000;">
            <th style="padding: 3px 6px; font-size: 11px; border-right: 1px solid #000; text-align: left;">
              {{#if sale.vehicle.brand}}{{sale.vehicle.brand}}{{/if}}{{#if sale.vehicle.line}} {{sale.vehicle.line}}{{/if}}{{#if sale.vehicle.displacement}} {{sale.vehicle.displacement}}{{/if}}
            </th>
            <th style="padding: 3px 6px; font-size: 11px; border-right: 1px solid #000; text-align: center; background: #fff; border: 2px solid #000;">
              {{#if sale.vehicle.plate}}<strong>{{sale.vehicle.plate}}</strong>{{else}}—{{/if}}
            </th>
            <th colspan="2" style="padding: 3px 6px; font-size: 11px; text-align: left;">
              {{#if sale.vehicle.mileage}}Kilometraje: {{sale.vehicle.mileage}} km{{/if}}
            </th>
          </tr>
          {{/if}}
          <tr>
            <th>Detalle</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {{#if sale.itemsGrouped.hasCombos}}
          <tr class="section-header">
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">COMBOS</td>
          </tr>
          {{#each sale.itemsGrouped.combos}}
          <tr>
            <td><strong>{{name}}</strong></td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{#each items}}
          <tr>
            <td style="padding-left: 30px;">• {{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{#if unitPrice}}{{money unitPrice}}{{/if}}</td>
            <td class="t-right">{{#if total}}{{money total}}{{/if}}</td>
          </tr>
          {{/each}}
          {{/each}}
          {{/if}}
          
          {{#if sale.itemsGrouped.hasProducts}}
          <tr class="section-header">
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">PRODUCTOS</td>
          </tr>
          {{#each sale.itemsGrouped.products}}
          <tr>
            <td>{{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{/each}}
          {{/if}}
          
          {{#if sale.itemsGrouped.hasServices}}
          <tr class="section-header">
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">SERVICIOS</td>
          </tr>
          {{#each sale.itemsGrouped.services}}
          <tr>
            <td>{{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{/each}}
          {{/if}}
          
          {{#unless sale.itemsGrouped.hasProducts}}{{#unless sale.itemsGrouped.hasServices}}{{#unless sale.itemsGrouped.hasCombos}}
          <tr>
            <td colspan="4" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}{{/unless}}{{/unless}}
        </tbody>
        <tfoot>
          <tr style="border-top: 2px solid #000;">
            <td colspan="3" style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">TOTAL</td>
            <td style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">{{$ S.total}}</td>
          </tr>
        </tfoot>
      </table>
      {{#if sale.specialNotes}}
      {{#if sale.specialNotes.length}}
      <div style="margin-top: 10px; padding: 8px; border: 1px solid #000; background: #f9f9f9;">
        <div style="font-size: 11px; font-weight: bold; margin-bottom: 5px; color: #000; font-family: Arial, sans-serif;">NOTAS ESPECIALES:</div>
        {{#each sale.specialNotes}}
        <div style="font-size: 10px; color: #000; font-family: Arial, sans-serif; margin-bottom: 3px; padding-left: 10px;">• {{this}}</div>
        {{/each}}
      </div>
      {{/if}}
      {{/if}}
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

  function createInvoiceTemplate(canvas) {
    // Duplicar createRemissionTemplate pero con título FACTURA y IVA en el total
    console.log('🎨 Creando plantilla de factura completa...');
    
    // Título FACTURA (arriba izquierda)
    const title = createEditableElement('title', 'FACTURA', {
      position: { left: 19, top: 10 },
      styles: { fontSize: '38px', fontWeight: 'bold', color: '#000', fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px' }
    });
    canvas.appendChild(title);

    // Número de factura en caja negra
    const numberBox = document.createElement('div');
    numberBox.className = 'tpl-element';
    numberBox.id = `element_${visualEditor.nextId++}`;
    numberBox.style.cssText = 'position: absolute; left: 19px; top: 45px; border: 2px solid #000; padding: 4px 8px; display: inline-block;';
    numberBox.innerHTML = '<span contenteditable="true" style="font-size: 15.1px; font-weight: bold; color: #000; font-family: Arial, sans-serif;">Nº: {{#if S.nº}}{{S.nº}}{{else}}[Sin nº]{{/if}}</span>';
    makeDraggable(numberBox);
    makeSelectable(numberBox);
    canvas.appendChild(numberBox);
    visualEditor.elements.push({ id: numberBox.id, type: 'text', element: numberBox });

    // Fecha
    const dateBox = document.createElement('div');
    dateBox.className = 'tpl-element';
    dateBox.id = `element_${visualEditor.nextId++}`;
    dateBox.style.cssText = 'position: absolute; left: 180px; top: 45px; padding: 4px 8px; display: inline-block;';
    dateBox.innerHTML = '<span contenteditable="true" style="font-size: 11px; color: #000; font-family: Arial, sans-serif;">Fecha: {{#if sale.formattedDate}}{{sale.formattedDate}}{{else}}{{date sale.date}}{{/if}}</span>';
    makeDraggable(dateBox);
    makeSelectable(dateBox);
    canvas.appendChild(dateBox);
    visualEditor.elements.push({ id: dateBox.id, type: 'text', element: dateBox });

    // Logo/empresa
    const logoBox = document.createElement('div');
    logoBox.className = 'tpl-element';
    logoBox.id = `element_${visualEditor.nextId++}`;
    logoBox.style.cssText = 'position: absolute; right: 19px; top: 10px; width: 60px; height: 60px; border: 2px solid #000; padding: 3px; display: flex; align-items: center; justify-content: center; cursor: move; background: white; box-sizing: border-box;';
    logoBox.innerHTML = `
      <div class="image-placeholder" style="width: 100%; height: 100%; background: #f5f5f5; border: 2px dashed #999; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; color: #666; text-align: center; padding: 5px; box-sizing: border-box; position: relative;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 5px; pointer-events: none;">
          <div style="font-size: 24px;">🖼️</div>
          <div>Haz clic para<br>agregar logo</div>
        </div>
        <div style="position: absolute; bottom: 2px; left: 2px; right: 2px; font-size: 9px; color: #999; pointer-events: none; text-align: center;">o edita para usar:<br>{{company.logoUrl}}</div>
      </div>
      <div class="logo-text-editable" contenteditable="true" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0; cursor: text; z-index: 10; font-size: 10px; padding: 5px; word-break: break-all;" title="Haz doble clic para editar y usar variable {{company.logoUrl}}"></div>
    `;
    // Permitir edición de texto para usar variables
    const textEditor = logoBox.querySelector('.logo-text-editable');
    if (textEditor) {
      textEditor.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        textEditor.style.opacity = '1';
        textEditor.style.background = 'rgba(255,255,255,0.95)';
        textEditor.focus();
        textEditor.textContent = '{{company.logoUrl}}';
      });
      textEditor.addEventListener('blur', () => {
        const content = textEditor.textContent.trim();
        if (content && content.includes('{{')) {
          // Si tiene variable, crear imagen con esa variable
          const placeholder = logoBox.querySelector('.image-placeholder');
          if (placeholder) {
            placeholder.innerHTML = `<img src="${content}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding: 10px; text-align: center; font-size: 10px; color: #999;\\'>Variable: ${content}</div>';" />`;
            placeholder.style.border = 'none';
            placeholder.style.background = 'transparent';
          }
        }
        textEditor.style.opacity = '0';
        textEditor.style.background = 'transparent';
      });
    }
    
    makeDraggable(logoBox);
    makeSelectable(logoBox);
    setupImageUpload(logoBox);
    canvas.appendChild(logoBox);
    visualEditor.elements.push({ id: logoBox.id, type: 'image', element: logoBox });

    // Sección DATOS DEL CLIENTE (izquierda) - Cuadro organizado en 2x2
    // 1cm de espacio desde el número (45px + 38px = 83px)
    const clientBox = document.createElement('div');
    clientBox.className = 'tpl-element client-data-box';
    clientBox.id = `element_${visualEditor.nextId++}`;
    clientBox.style.cssText = 'position: absolute; left: 19px; top: 83px; width: 331px; border: 2px solid #000; padding: 8px; background: white; z-index: 10;';
    clientBox.innerHTML = `
      <style>
        .client-data-box {
          position: absolute !important;
          left: 19px !important;
          top: 83px !important;
          width: 336px !important;
          border: 2px solid #000 !important;
          padding: 8px !important;
          background: white !important;
          z-index: 10 !important;
          page-break-inside: avoid !important;
        }
        @media print {
          .client-data-box {
            position: absolute !important;
            left: 19px !important;
            top: 83px !important;
            width: 336px !important;
            border: 2px solid #000 !important;
            padding: 8px !important;
            background: white !important;
            z-index: 10 !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
          }
        }
      </style>
      <div style="font-size: 14px; font-weight: bold; color: #000; font-family: Arial, sans-serif; margin-bottom: 5px; text-align: center; border-bottom: 1px solid #000; padding-bottom: 3px;">DATOS DEL CLIENTE</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: Arial, sans-serif; margin-top: 2px;">
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold; width: 30%;">Nombre:</td>
          <td style="border: 1px solid #000; padding: 5px 4px; width: 70%;"><span contenteditable="true">{{sale.customer.name}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Email:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{sale.customer.email}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Teléfono:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{sale.customer.phone}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Dirección:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{sale.customer.address}}</span></td>
        </tr>
      </table>
    `;
    makeDraggable(clientBox);
    makeSelectable(clientBox);
    canvas.appendChild(clientBox);
    visualEditor.elements.push({ id: clientBox.id, type: 'text', element: clientBox });

    // Sección DATOS DE LA EMPRESA (derecha) - Cuadro organizado en 2x2
    const companyBox = document.createElement('div');
    companyBox.className = 'tpl-element company-data-box';
    companyBox.id = `element_${visualEditor.nextId++}`;
    companyBox.style.cssText = 'position: absolute; right: 19px; top: 83px; width: 331px; border: 2px solid #000; padding: 8px; background: white; z-index: 10;';
    companyBox.innerHTML = `
      <style>
        .company-data-box {
          position: absolute !important;
          left: 365px !important;
          right: auto !important;
          top: 83px !important;
          width: 336px !important;
          border: 2px solid #000 !important;
          padding: 8px !important;
          background: white !important;
          z-index: 10 !important;
          page-break-inside: avoid !important;
        }
        @media print {
          .company-data-box {
            position: absolute !important;
            left: 365px !important;
          right: auto !important;
            top: 83px !important;
            width: 336px !important;
            border: 2px solid #000 !important;
            padding: 8px !important;
            background: white !important;
            z-index: 10 !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
          }
        }
      </style>
      <div style="font-size: 14px; font-weight: bold; color: #000; font-family: Arial, sans-serif; margin-bottom: 5px; text-align: center; border-bottom: 1px solid #000; padding-bottom: 3px;">DATOS DE LA EMPRESA</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: Arial, sans-serif; margin-top: 2px;">
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold; width: 30%;">Nombre:</td>
          <td style="border: 1px solid #000; padding: 5px 4px; width: 70%;"><span contenteditable="true">{{company.name}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Email:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.email}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Teléfono:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.phone}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Dirección:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.address}}</span></td>
        </tr>
      </table>
    `;
    makeDraggable(companyBox);
    makeSelectable(companyBox);
    canvas.appendChild(companyBox);
    visualEditor.elements.push({ id: companyBox.id, type: 'text', element: companyBox });

    // Tabla de items con IVA
    const tablePosition = { left: 19, top: 200, width: 520 };
    const itemsTable = createInvoiceItemsTable(tablePosition);
    canvas.appendChild(itemsTable);

    // Total con IVA
    const totalBox = document.createElement('div');
    totalBox.className = 'tpl-element tpl-total-box';
    totalBox.id = `element_${visualEditor.nextId++}`;
    totalBox.style.cssText = 'position: absolute; right: 19px; bottom: 50px; border: 2px solid #000; padding: 6px 10px; background: white; min-width: 120px;';
    totalBox.innerHTML = '<div contenteditable="true" style="font-size: 14px; font-weight: bold; color: #000; font-family: Arial, sans-serif; text-align: right;">TOTAL: {{$ S.total}}</div>';
    makeDraggable(totalBox);
    makeSelectable(totalBox);
    canvas.appendChild(totalBox);
    visualEditor.elements.push({ id: totalBox.id, type: 'text', element: totalBox });
  }

  function createInvoiceItemsTable(position) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'tpl-element items-table';
    tableContainer.id = `element_${visualEditor.nextId++}`;
    const tableWidth = position.width || `calc(100% - ${position.left * 2}px)`;
    const maxWidth = position.width ? `${position.width}px` : '520px';
    tableContainer.style.cssText = `
      position: absolute;
      left: ${position.left}px;
      top: ${position.top}px;
      width: ${tableWidth};
      max-width: ${maxWidth};
      cursor: move;
    `;
    tableContainer.classList.add('remission-content');

    tableContainer.innerHTML = `
      <style>
        .remission-table {
          width: 100%;
          border-collapse: collapse;
          font-family: Arial, sans-serif;
          table-layout: fixed;
          margin: 0;
        }
        .remission-table thead { display: table-header-group; }
        .remission-table tbody { display: table-row-group; }
        .remission-table tfoot { display: table-footer-group; }
        .remission-table tfoot tr { border-top: 2px solid #000 !important; }
        .remission-table tfoot td { border: 1px solid #000 !important; padding: 2px 4px !important; font-size: 12.4px !important; font-weight: bold !important; }
        .remission-table th { border: 2px solid #000 !important; padding: 2px 3px; font-weight: bold; color: #000; font-size: 12.4px; background: white; word-wrap: break-word; overflow-wrap: break-word; }
        .remission-table td { border: 1px solid #000 !important; padding: 1px 3px; color: #000; font-size: 11px; word-wrap: break-word; overflow-wrap: break-word; vertical-align: top; line-height: 1.2; }
        .remission-table th:nth-child(1), .remission-table td:nth-child(1) { width: 45%; text-align: left; }
        .remission-table th:nth-child(2), .remission-table td:nth-child(2) { width: 15%; text-align: center; }
        .remission-table th:nth-child(3), .remission-table td:nth-child(3) { width: 20%; text-align: center; }
        .remission-table th:nth-child(4), .remission-table td:nth-child(4) { width: 20%; text-align: right; }
        .remission-table .t-center { text-align: center !important; }
        .remission-table .t-right { text-align: right !important; }
        @media print {
          .remission-table { page-break-inside: auto; border-collapse: collapse !important; width: 100% !important; }
          .remission-table thead { display: table-header-group !important; }
          .remission-table tbody { display: table-row-group !important; }
          .remission-table tfoot { display: table-footer-group !important; }
          .remission-table tfoot tr { border-top: 2px solid #000 !important; }
          .remission-table tfoot td { border: 1px solid #000 !important; padding: 2px 4px !important; font-size: 12.4px !important; font-weight: bold !important; }
          .remission-table tr { page-break-inside: avoid; page-break-after: auto; }
          .remission-table th, .remission-table td { border: 1px solid #000 !important; padding: 1px 2px !important; font-size: 11px !important; line-height: 1.1 !important; }
          .remission-table th { border-width: 2px !important; background: white !important; }
        }
        .remission-table { border: 2px solid #000; }
      </style>
      <table class="remission-table">
        <thead>
          {{#if sale.vehicle}}
          <tr style="background: #e8f4f8; font-weight: bold; border: 2px solid #000; border-bottom: 1px solid #000;">
            <th style="padding: 3px 6px; font-size: 11px; border-right: 1px solid #000; text-align: left;">
              {{#if sale.vehicle.brand}}{{sale.vehicle.brand}}{{/if}}{{#if sale.vehicle.line}} {{sale.vehicle.line}}{{/if}}{{#if sale.vehicle.displacement}} {{sale.vehicle.displacement}}{{/if}}
            </th>
            <th style="padding: 3px 6px; font-size: 11px; border-right: 1px solid #000; text-align: center; background: #fff; border: 2px solid #000;">
              {{#if sale.vehicle.plate}}<strong>{{sale.vehicle.plate}}</strong>{{else}}—{{/if}}
            </th>
            <th colspan="2" style="padding: 3px 6px; font-size: 11px; text-align: left;">
              {{#if sale.vehicle.mileage}}Kilometraje: {{sale.vehicle.mileage}} km{{/if}}
            </th>
          </tr>
          {{/if}}
          <tr>
            <th>Detalle</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {{#if sale.itemsGrouped.hasCombos}}
          <tr class="section-header">
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">COMBOS</td>
          </tr>
          {{#each sale.itemsGrouped.combos}}
          <tr>
            <td><strong>{{name}}</strong></td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{#each items}}
          <tr>
            <td style="padding-left: 30px;">• {{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{#if unitPrice}}{{money unitPrice}}{{/if}}</td>
            <td class="t-right">{{#if total}}{{money total}}{{/if}}</td>
          </tr>
          {{/each}}
          {{/each}}
          {{/if}}
          {{#if sale.itemsGrouped.hasProducts}}
          <tr class="section-header">
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">PRODUCTOS</td>
          </tr>
          {{#each sale.itemsGrouped.products}}
          <tr>
            <td>{{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{/each}}
          {{/if}}
          {{#if sale.itemsGrouped.hasServices}}
          <tr class="section-header">
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">SERVICIOS</td>
          </tr>
          {{#each sale.itemsGrouped.services}}
          <tr>
            <td>{{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{/each}}
          {{/if}}
          {{#unless sale.itemsGrouped.hasProducts}}{{#unless sale.itemsGrouped.hasServices}}{{#unless sale.itemsGrouped.hasCombos}}
          <tr>
            <td colspan="4" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}{{/unless}}{{/unless}}
        </tbody>
        <tfoot>
          <tr style="border-top: 2px solid #000;">
            <td colspan="3" style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">SUBTOTAL</td>
            <td style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">{{$ S.subtotal}}</td>
          </tr>
          <tr>
            <td colspan="3" style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">IVA (19%)</td>
            <td style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">{{$ S.iva}}</td>
          </tr>
          <tr style="border-top: 2px solid #000;">
            <td colspan="3" style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">TOTAL</td>
            <td style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">{{$ S.total}}</td>
          </tr>
        </tfoot>
      </table>
      {{#if sale.specialNotes}}
      {{#if sale.specialNotes.length}}
      <div style="margin-top: 10px; padding: 8px; border: 1px solid #000; background: #f9f9f9;">
        <div style="font-size: 11px; font-weight: bold; margin-bottom: 5px; color: #000; font-family: Arial, sans-serif;">NOTAS ESPECIALES:</div>
        {{#each sale.specialNotes}}
        <div style="font-size: 10px; color: #000; font-family: Arial, sans-serif; margin-bottom: 3px; padding-left: 10px;">• {{this}}</div>
        {{/each}}
      </div>
      {{/if}}
      {{/if}}
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

  function createQuoteItemsTable(position) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'tpl-element items-table';
    tableContainer.id = `element_${visualEditor.nextId++}`;
    // Si se especifica un ancho, usarlo; sino usar el cálculo original
    const tableWidth = position.width || `calc(100% - ${position.left * 2}px)`;
    const maxWidth = position.width ? `${position.width}px` : '520px';
    tableContainer.style.cssText = `
      position: absolute;
      left: ${position.left}px;
      top: ${position.top}px;
      border: 2px solid transparent;
      cursor: move;
      width: ${tableWidth};
      max-width: ${maxWidth};
      background: white;
    `;
    
    // Agregar clase para centrado en impresión
    tableContainer.classList.add('quote-content');

    tableContainer.innerHTML = `
      <style>
        .quote-table {
          width: 100%;
          border-collapse: collapse;
          font-family: Arial, sans-serif;
          table-layout: fixed;
          margin: 0;
        }
        .quote-table thead {
          display: table-header-group;
        }
        .quote-table tbody {
          display: table-row-group;
        }
        .quote-table tfoot {
          display: table-footer-group;
        }
        .quote-table tfoot tr {
          border-top: 2px solid #000 !important;
        }
        .quote-table tfoot td {
          border: 1px solid #000 !important;
          padding: 2px 4px !important;
          font-size: 12.4px !important;
          font-weight: bold !important;
        }
        .quote-table th {
          border: 2px solid #000 !important;
          padding: 2px 3px;
          font-weight: bold;
          color: #000;
          font-size: 12.4px;
          background: white;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .quote-table td {
          border: 1px solid #000 !important;
          padding: 1px 3px;
          color: #000;
          font-size: 11px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          vertical-align: top;
          line-height: 1.2;
        }
        .quote-table th:nth-child(1),
        .quote-table td:nth-child(1) {
          width: 45%;
          text-align: left;
        }
        .quote-table th:nth-child(2),
        .quote-table td:nth-child(2) {
          width: 15%;
          text-align: center;
        }
        .quote-table th:nth-child(3),
        .quote-table td:nth-child(3) {
          width: 20%;
          text-align: center;
        }
        .quote-table th:nth-child(4),
        .quote-table td:nth-child(4) {
          width: 20%;
          text-align: right;
        }
        .quote-table .t-center {
          text-align: center !important;
        }
        .quote-table .t-right {
          text-align: right !important;
        }
        /* Estilos para impresión/PDF */
        @media print {
          .quote-table {
            page-break-inside: auto;
            border-collapse: collapse !important;
            width: 100% !important;
          }
          .quote-table thead {
            display: table-header-group !important;
          }
          .quote-table tbody {
            display: table-row-group !important;
          }
          .quote-table tfoot {
            display: table-footer-group !important;
          }
          .quote-table tfoot tr {
            border-top: 2px solid #000 !important;
          }
          .quote-table tfoot td {
            border: 1px solid #000 !important;
            padding: 2px 4px !important;
            font-size: 12.4px !important;
            font-weight: bold !important;
          }
          .quote-table tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          .quote-table th,
          .quote-table td {
            border: 1px solid #000 !important;
            padding: 1px 2px !important;
            font-size: 11px !important;
            line-height: 1.1 !important;
          }
          .quote-table th {
            border-width: 2px !important;
            background: white !important;
          }
        }
        /* Estilos para vista previa */
        .quote-table {
          border: 2px solid #000;
        }
      </style>
      <table class="quote-table">
        <thead>
          {{#if quote.vehicle}}
          <tr style="background: #e8f4f8; font-weight: bold; border: 2px solid #000; border-bottom: 1px solid #000;">
            <th style="padding: 3px 6px; font-size: 11px; border-right: 1px solid #000; text-align: left;">
              {{#if quote.vehicle.brand}}{{quote.vehicle.brand}}{{/if}}{{#if quote.vehicle.line}} {{quote.vehicle.line}}{{/if}}{{#if quote.vehicle.displacement}} {{quote.vehicle.displacement}}{{/if}}
            </th>
            <th style="padding: 3px 6px; font-size: 11px; border-right: 1px solid #000; text-align: center; background: #fff; border: 2px solid #000;">
              {{#if quote.vehicle.plate}}<strong>{{quote.vehicle.plate}}</strong>{{else}}—{{/if}}
            </th>
            <th colspan="2" style="padding: 3px 6px; font-size: 11px; text-align: left;">
              {{#if quote.vehicle.mileage}}Kilometraje: {{quote.vehicle.mileage}} km{{/if}}
            </th>
          </tr>
          {{/if}}
          <tr>
            <th>Detalle</th>
            <th>Cantidad</th>
            <th>Precio</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {{#if quote.itemsGrouped.hasCombos}}
          <tr class="section-header">
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">COMBOS</td>
          </tr>
          {{#each quote.itemsGrouped.combos}}
          <tr>
            <td><strong>{{name}}</strong></td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{#each items}}
          <tr>
            <td style="padding-left: 30px;">• {{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{#if unitPrice}}{{money unitPrice}}{{/if}}</td>
            <td class="t-right">{{#if total}}{{money total}}{{/if}}</td>
          </tr>
          {{/each}}
          {{/each}}
          {{/if}}
          
          {{#if quote.itemsGrouped.hasProducts}}
          <tr class="section-header">
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">PRODUCTOS</td>
          </tr>
          {{#each quote.itemsGrouped.products}}
          <tr>
            <td>{{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{/each}}
          {{/if}}
          
          {{#if quote.itemsGrouped.hasServices}}
          <tr class="section-header">
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">SERVICIOS</td>
          </tr>
          {{#each quote.itemsGrouped.services}}
          <tr>
            <td>{{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{/each}}
          {{/if}}
          
          {{#unless quote.itemsGrouped.hasProducts}}{{#unless quote.itemsGrouped.hasServices}}{{#unless quote.itemsGrouped.hasCombos}}
          {{#each quote.items}}
          <tr>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{description}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money subtotal}}</td>
          </tr>
          {{/each}}
          {{#unless quote.items}}
          <tr>
            <td colspan="4" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}
          {{/unless}}{{/unless}}{{/unless}}
        </tbody>
        <tfoot>
          {{#if quote.ivaEnabled}}
          <tr style="border-top: 2px solid #000;">
            <td colspan="3" style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">SUBTOTAL</td>
            <td style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">{{money Q.subtotal}}</td>
          </tr>
          <tr>
            <td colspan="3" style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">IVA (19%)</td>
            <td style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">{{money Q.iva}}</td>
          </tr>
          {{/if}}
          <tr style="border-top: 2px solid #000;">
            <td colspan="3" style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">TOTAL</td>
            <td style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">{{#if quote.ivaEnabled}}{{money Q.total}}{{else}}{{money quote.total}}{{/if}}</td>
          </tr>
        </tfoot>
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

  function createQuoteTemplate(canvas) {
    console.log('🎨 Creando plantilla de cotización completa...');
    
    // Título COTIZACIÓN (arriba izquierda) - Compactado para media carta
    const title = createEditableElement('title', 'COTIZACIÓN', {
      position: { left: 19, top: 10 },
      styles: { fontSize: '38px', fontWeight: 'bold', color: '#000', fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px' }
    });
    canvas.appendChild(title);

    // Número de cotización en caja negra - Compactado
    const numberBox = document.createElement('div');
    numberBox.className = 'tpl-element';
    numberBox.id = `element_${visualEditor.nextId++}`;
    numberBox.style.cssText = 'position: absolute; left: 19px; top: 45px; border: 2px solid #000; padding: 4px 8px; display: inline-block;';
    numberBox.innerHTML = '<span contenteditable="true" style="font-size: 15.1px; font-weight: bold; color: #000; font-family: Arial, sans-serif;">Nº: {{#if quote.number}}{{quote.number}}{{else}}[Sin nº]{{/if}}</span>';
    makeDraggable(numberBox);
    makeSelectable(numberBox);
    canvas.appendChild(numberBox);
    visualEditor.elements.push({ id: numberBox.id, type: 'text', element: numberBox });

    // Fecha de cotización (al lado del número de cotización, a la derecha)
    const dateBox = document.createElement('div');
    dateBox.className = 'tpl-element';
    dateBox.id = `element_${visualEditor.nextId++}`;
    dateBox.style.cssText = 'position: absolute; left: 180px; top: 45px; padding: 4px 8px; display: inline-block;';
    dateBox.innerHTML = '<span contenteditable="true" style="font-size: 11px; color: #000; font-family: Arial, sans-serif;">Fecha: {{#if quote.formattedDate}}{{quote.formattedDate}}{{else}}{{date quote.date}}{{/if}}</span>';
    makeDraggable(dateBox);
    makeSelectable(dateBox);
    canvas.appendChild(dateBox);
    visualEditor.elements.push({ id: dateBox.id, type: 'text', element: dateBox });

    // Logo/empresa (arriba derecha) - Compactado para media carta
    const logoBox = document.createElement('div');
    logoBox.className = 'tpl-element';
    logoBox.id = `element_${visualEditor.nextId++}`;
    logoBox.style.cssText = 'position: absolute; right: 19px; top: 10px; width: 60px; height: 60px; border: 2px solid #000; padding: 3px; display: flex; align-items: center; justify-content: center; cursor: move; background: white; box-sizing: border-box;';
    logoBox.innerHTML = `
      <div class="image-placeholder" style="width: 100%; height: 100%; background: #f5f5f5; border: 2px dashed #999; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; color: #666; text-align: center; padding: 5px; box-sizing: border-box; position: relative;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 5px; pointer-events: none;">
          <div style="font-size: 24px;">🖼️</div>
          <div>Haz clic para<br>agregar logo</div>
        </div>
        <div style="position: absolute; bottom: 2px; left: 2px; right: 2px; font-size: 9px; color: #999; pointer-events: none; text-align: center;">o edita para usar:<br>{{company.logoUrl}}</div>
      </div>
      <div class="logo-text-editable" contenteditable="true" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0; cursor: text; z-index: 10; font-size: 10px; padding: 5px; word-break: break-all;" title="Haz doble clic para editar y usar variable {{company.logoUrl}}"></div>
    `;
    
    // Permitir edición de texto para usar variables
    const textEditor = logoBox.querySelector('.logo-text-editable');
    if (textEditor) {
      textEditor.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        textEditor.style.opacity = '1';
        textEditor.style.background = 'rgba(255,255,255,0.95)';
        textEditor.focus();
        textEditor.textContent = '{{company.logoUrl}}';
      });
      textEditor.addEventListener('blur', () => {
        const content = textEditor.textContent.trim();
        if (content && content.includes('{{')) {
          // Si tiene variable, crear imagen con esa variable
          const placeholder = logoBox.querySelector('.image-placeholder');
          if (placeholder) {
            placeholder.innerHTML = `<img src="${content}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding: 10px; text-align: center; font-size: 10px; color: #999;\\'>Variable: ${content}</div>';" />`;
            placeholder.style.border = 'none';
            placeholder.style.background = 'transparent';
          }
        }
        textEditor.style.opacity = '0';
        textEditor.style.background = 'transparent';
      });
    }
    
    makeDraggable(logoBox);
    makeSelectable(logoBox);
    setupImageUpload(logoBox);
    canvas.appendChild(logoBox);
    visualEditor.elements.push({ id: logoBox.id, type: 'image', element: logoBox });

    // Sección DATOS DEL CLIENTE (izquierda) - Cuadro organizado en 2x2
    // 1cm de espacio desde el número (45px + 38px = 83px)
    const clientBox = document.createElement('div');
    clientBox.className = 'tpl-element client-data-box';
    clientBox.id = `element_${visualEditor.nextId++}`;
    clientBox.style.cssText = 'position: absolute; left: 19px; top: 83px; width: 331px; border: 2px solid #000; padding: 8px; background: white; z-index: 10;';
    clientBox.innerHTML = `
      <style>
        .client-data-box {
          position: absolute !important;
          left: 19px !important;
          top: 83px !important;
          width: 336px !important;
          border: 2px solid #000 !important;
          padding: 8px !important;
          background: white !important;
          z-index: 10 !important;
          page-break-inside: avoid !important;
        }
        @media print {
          .client-data-box {
            position: absolute !important;
            left: 19px !important;
            top: 83px !important;
            width: 336px !important;
            border: 2px solid #000 !important;
            padding: 8px !important;
            background: white !important;
            z-index: 10 !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
          }
        }
      </style>
      <div style="font-size: 14px; font-weight: bold; color: #000; font-family: Arial, sans-serif; margin-bottom: 5px; text-align: center; border-bottom: 1px solid #000; padding-bottom: 3px;">DATOS DEL CLIENTE</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: Arial, sans-serif; margin-top: 2px;">
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold; width: 30%;">Nombre:</td>
          <td style="border: 1px solid #000; padding: 5px 4px; width: 70%;"><span contenteditable="true">{{quote.customer.name}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Email:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{quote.customer.email}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Teléfono:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{quote.customer.phone}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Dirección:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{quote.customer.address}}</span></td>
        </tr>
      </table>
    `;
    makeDraggable(clientBox);
    makeSelectable(clientBox);
    canvas.appendChild(clientBox);
    visualEditor.elements.push({ id: clientBox.id, type: 'text', element: clientBox });

    // Sección DATOS DE LA EMPRESA (derecha) - Cuadro organizado en 2x2
    const companyBox = document.createElement('div');
    companyBox.className = 'tpl-element company-data-box';
    companyBox.id = `element_${visualEditor.nextId++}`;
    companyBox.style.cssText = 'position: absolute; right: 19px; top: 83px; width: 331px; border: 2px solid #000; padding: 8px; background: white; z-index: 10;';
    companyBox.innerHTML = `
      <style>
        .company-data-box {
          position: absolute !important;
          left: 365px !important;
          right: auto !important;
          top: 83px !important;
          width: 336px !important;
          border: 2px solid #000 !important;
          padding: 8px !important;
          background: white !important;
          z-index: 10 !important;
          page-break-inside: avoid !important;
        }
        @media print {
          .company-data-box {
            position: absolute !important;
            left: 365px !important;
          right: auto !important;
            top: 83px !important;
            width: 336px !important;
            border: 2px solid #000 !important;
            padding: 8px !important;
            background: white !important;
            z-index: 10 !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
          }
        }
      </style>
      <div style="font-size: 14px; font-weight: bold; color: #000; font-family: Arial, sans-serif; margin-bottom: 5px; text-align: center; border-bottom: 1px solid #000; padding-bottom: 3px;">DATOS DE LA EMPRESA</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: Arial, sans-serif; margin-top: 2px;">
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold; width: 30%;">Nombre:</td>
          <td style="border: 1px solid #000; padding: 5px 4px; width: 70%;"><span contenteditable="true">{{company.name}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Email:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.email}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Teléfono:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.phone}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Dirección:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.address}}</span></td>
        </tr>
      </table>
    `;
    makeDraggable(companyBox);
    makeSelectable(companyBox);
    canvas.appendChild(companyBox);
    visualEditor.elements.push({ id: companyBox.id, type: 'text', element: companyBox });

    // Calcular la posición de la tabla: después de los cuadros de datos + 1cm de separación
    // Los cuadros empiezan en top: 83px
    // Altura aproximada del cuadro: título (~18px) + tabla 4 filas (~100px con nuevo padding) + padding (16px) = ~134px
    // 1cm = aproximadamente 38px
    // Posición tabla: 83px + 134px + 38px = 255px (redondeado a 260px para más espacio)
    // Ancho de los cuadros: 331px cada uno, total aproximado: 662px (considerando espacio entre ellos)
    // La tabla de items debe tener el mismo ancho que los dos cuadros juntos
    const itemsTable = createQuoteItemsTable({ left: 19, top: 260, width: 682 });
    canvas.appendChild(itemsTable);

    // NOTA: El total ahora está dentro de la tabla como tfoot, así que ya no necesitamos ajustar posición separada

    console.log('✅ Plantilla de cotización creada con todos los elementos');
  }

  function createWorkOrderTemplate(canvas) {
    console.log('🎨 Creando plantilla de orden de trabajo completa...');
    
    // Título ORDEN DE TRABAJO (arriba izquierda) - Compactado para media carta
    const title = createEditableElement('title', 'ORDEN DE TRABAJO', {
      position: { left: 19, top: 10 },
      styles: { fontSize: '38px', fontWeight: 'bold', color: '#000', fontFamily: 'Arial, sans-serif', letterSpacing: '0.5px' }
    });
    canvas.appendChild(title);

    // Número de orden en caja negra - Compactado
    const numberBox = document.createElement('div');
    numberBox.className = 'tpl-element';
    numberBox.id = `element_${visualEditor.nextId++}`;
    numberBox.style.cssText = 'position: absolute; left: 19px; top: 45px; border: 2px solid #000; padding: 4px 8px; display: inline-block;';
    numberBox.innerHTML = '<span contenteditable="true" style="font-size: 15.1px; font-weight: bold; color: #000; font-family: Arial, sans-serif;">Nº: {{#if S.nº}}{{S.nº}}{{else}}[Sin nº]{{/if}}</span>';
    makeDraggable(numberBox);
    makeSelectable(numberBox);
    canvas.appendChild(numberBox);
    visualEditor.elements.push({ id: numberBox.id, type: 'text', element: numberBox });

    // Logo/empresa (arriba derecha) - Compactado para media carta
    const logoBox = document.createElement('div');
    logoBox.className = 'tpl-element';
    logoBox.id = `element_${visualEditor.nextId++}`;
    logoBox.style.cssText = 'position: absolute; right: 19px; top: 10px; width: 60px; height: 60px; border: 2px solid #000; padding: 3px; display: flex; align-items: center; justify-content: center; cursor: move; background: white; box-sizing: border-box;';
    logoBox.innerHTML = `
      <div class="image-placeholder" style="width: 100%; height: 100%; background: #f5f5f5; border: 2px dashed #999; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; color: #666; text-align: center; padding: 5px; box-sizing: border-box; position: relative;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 5px; pointer-events: none;">
          <div style="font-size: 24px;">🖼️</div>
          <div>Haz clic para<br>agregar logo</div>
        </div>
        <div style="position: absolute; bottom: 2px; left: 2px; right: 2px; font-size: 9px; color: #999; pointer-events: none; text-align: center;">o edita para usar:<br>{{company.logoUrl}}</div>
      </div>
      <div class="logo-text-editable" contenteditable="true" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0; cursor: text; z-index: 10; font-size: 10px; padding: 5px; word-break: break-all;" title="Haz doble clic para editar y usar variable {{company.logoUrl}}"></div>
    `;
    
    // Permitir edición de texto para usar variables
    const textEditor = logoBox.querySelector('.logo-text-editable');
    if (textEditor) {
      textEditor.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        textEditor.style.opacity = '1';
        textEditor.style.background = 'rgba(255,255,255,0.95)';
        textEditor.focus();
        textEditor.textContent = '{{company.logoUrl}}';
      });
      textEditor.addEventListener('blur', () => {
        const content = textEditor.textContent.trim();
        if (content && content.includes('{{')) {
          // Si tiene variable, crear imagen con esa variable
          const placeholder = logoBox.querySelector('.image-placeholder');
          if (placeholder) {
            placeholder.innerHTML = `<img src="${content}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding: 10px; text-align: center; font-size: 10px; color: #999;\\'>Variable: ${content}</div>';" />`;
            placeholder.style.border = 'none';
            placeholder.style.background = 'transparent';
          }
        }
        textEditor.style.opacity = '0';
        textEditor.style.background = 'transparent';
      });
    }
    
    makeDraggable(logoBox);
    makeSelectable(logoBox);
    setupImageUpload(logoBox);
    canvas.appendChild(logoBox);
    visualEditor.elements.push({ id: logoBox.id, type: 'image', element: logoBox });

    // Sección DATOS DEL CLIENTE (izquierda) - Cuadro organizado en 2x2
    // 1cm de espacio desde el número (45px + 38px = 83px)
    const clientBox = document.createElement('div');
    clientBox.className = 'tpl-element client-data-box';
    clientBox.id = `element_${visualEditor.nextId++}`;
    clientBox.style.cssText = 'position: absolute; left: 19px; top: 83px; width: 331px; border: 2px solid #000; padding: 8px; background: white; z-index: 10;';
    clientBox.innerHTML = `
      <style>
        .client-data-box {
          position: absolute !important;
          left: 19px !important;
          top: 83px !important;
          width: 336px !important;
          border: 2px solid #000 !important;
          padding: 8px !important;
          background: white !important;
          z-index: 10 !important;
          page-break-inside: avoid !important;
        }
        @media print {
          .client-data-box {
            position: absolute !important;
            left: 19px !important;
            top: 83px !important;
            width: 336px !important;
            border: 2px solid #000 !important;
            padding: 8px !important;
            background: white !important;
            z-index: 10 !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
          }
        }
      </style>
      <div style="font-size: 14px; font-weight: bold; color: #000; font-family: Arial, sans-serif; margin-bottom: 5px; text-align: center; border-bottom: 1px solid #000; padding-bottom: 3px;">DATOS DEL CLIENTE</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: Arial, sans-serif; margin-top: 2px;">
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold; width: 30%;">Nombre:</td>
          <td style="border: 1px solid #000; padding: 5px 4px; width: 70%;"><span contenteditable="true">{{sale.customer.name}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Email:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{sale.customer.email}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Teléfono:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{sale.customer.phone}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Dirección:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{sale.customer.address}}</span></td>
        </tr>
      </table>
    `;
    makeDraggable(clientBox);
    makeSelectable(clientBox);
    canvas.appendChild(clientBox);
    visualEditor.elements.push({ id: clientBox.id, type: 'text', element: clientBox });

    // Sección DATOS DE LA EMPRESA (derecha) - Cuadro organizado en 2x2
    const companyBox = document.createElement('div');
    companyBox.className = 'tpl-element company-data-box';
    companyBox.id = `element_${visualEditor.nextId++}`;
    companyBox.style.cssText = 'position: absolute; right: 19px; top: 83px; width: 331px; border: 2px solid #000; padding: 8px; background: white; z-index: 10;';
    companyBox.innerHTML = `
      <style>
        .company-data-box {
          position: absolute !important;
          left: 365px !important;
          right: auto !important;
          top: 83px !important;
          width: 336px !important;
          border: 2px solid #000 !important;
          padding: 8px !important;
          background: white !important;
          z-index: 10 !important;
          page-break-inside: avoid !important;
        }
        @media print {
          .company-data-box {
            position: absolute !important;
            left: 365px !important;
          right: auto !important;
            top: 83px !important;
            width: 336px !important;
            border: 2px solid #000 !important;
            padding: 8px !important;
            background: white !important;
            z-index: 10 !important;
            page-break-inside: avoid !important;
            overflow: visible !important;
          }
        }
      </style>
      <div style="font-size: 14px; font-weight: bold; color: #000; font-family: Arial, sans-serif; margin-bottom: 5px; text-align: center; border-bottom: 1px solid #000; padding-bottom: 3px;">DATOS DE LA EMPRESA</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: Arial, sans-serif; margin-top: 2px;">
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold; width: 30%;">Nombre:</td>
          <td style="border: 1px solid #000; padding: 5px 4px; width: 70%;"><span contenteditable="true">{{company.name}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Email:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.email}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Teléfono:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.phone}}</span></td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 5px 4px; font-weight: bold;">Dirección:</td>
          <td style="border: 1px solid #000; padding: 5px 4px;"><span contenteditable="true">{{company.address}}</span></td>
        </tr>
      </table>
    `;
    makeDraggable(companyBox);
    makeSelectable(companyBox);
    canvas.appendChild(companyBox);
    visualEditor.elements.push({ id: companyBox.id, type: 'text', element: companyBox });

    // Calcular la posición de la tabla: después de los cuadros de datos + 1cm de separación
    // Los cuadros empiezan en top: 83px
    // Altura aproximada del cuadro: título (~18px) + tabla 4 filas (~100px con nuevo padding) + padding (16px) = ~134px
    // 1cm = aproximadamente 38px
    // Posición tabla: 83px + 134px + 38px = 255px (redondeado a 260px para más espacio)
    // Ancho de los cuadros: 331px cada uno, total aproximado: 662px (considerando espacio entre ellos)
    // La tabla de items debe tener el mismo ancho que los dos cuadros juntos
    const itemsTable = createWorkOrderItemsTable({ left: 19, top: 260, width: 682 });
    canvas.appendChild(itemsTable);

    console.log('✅ Plantilla de orden de trabajo creada con todos los elementos');
  }

  function createWorkOrderItemsTable(position) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'tpl-element items-table';
    tableContainer.id = `element_${visualEditor.nextId++}`;
    // Si se especifica un ancho, usarlo; sino usar el cálculo original
    const tableWidth = position.width || `calc(100% - ${position.left * 2}px)`;
    const maxWidth = position.width ? `${position.width}px` : '520px';
    tableContainer.style.cssText = `
      position: absolute;
      left: ${position.left}px;
      top: ${position.top}px;
      border: 2px solid transparent;
      cursor: move;
      width: ${tableWidth};
      max-width: ${maxWidth};
      background: white;
    `;
    
    // Agregar clase para centrado en impresión
    tableContainer.classList.add('workorder-content');

    tableContainer.innerHTML = `
      <style>
        .workorder-table {
          width: 100%;
          border-collapse: collapse;
          font-family: Arial, sans-serif;
          table-layout: fixed;
          margin: 0;
        }
        .workorder-table thead {
          display: table-header-group;
        }
        .workorder-table tbody {
          display: table-row-group;
        }
        .workorder-table tfoot {
          display: table-footer-group;
        }
        .workorder-table tfoot tr {
          border-top: 2px solid #000 !important;
        }
        .workorder-table tfoot td {
          border: 1px solid #000 !important;
          padding: 2px 4px !important;
          font-size: 12.4px !important;
          font-weight: bold !important;
        }
        .workorder-table th {
          border: 2px solid #000 !important;
          padding: 2px 3px;
          font-weight: bold;
          color: #000;
          font-size: 12.4px;
          background: white;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .workorder-table td {
          border: 1px solid #000 !important;
          padding: 1px 3px;
          color: #000;
          font-size: 11px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          vertical-align: top;
          line-height: 1.2;
        }
        .workorder-table th:nth-child(1),
        .workorder-table td:nth-child(1) {
          width: 70%;
          text-align: left;
        }
        .workorder-table th:nth-child(2),
        .workorder-table td:nth-child(2) {
          width: 30%;
          text-align: center;
        }
        .workorder-table .t-center {
          text-align: center !important;
        }
        .workorder-table .t-right {
          text-align: right !important;
        }
        /* Estilos para impresión/PDF */
        @media print {
          .workorder-table {
            page-break-inside: auto;
            border-collapse: collapse !important;
            width: 100% !important;
          }
          .workorder-table thead {
            display: table-header-group !important;
          }
          .workorder-table tbody {
            display: table-row-group !important;
          }
          .workorder-table tfoot {
            display: table-footer-group !important;
          }
          .workorder-table tfoot tr {
            border-top: 2px solid #000 !important;
          }
          .workorder-table tfoot td {
            border: 1px solid #000 !important;
            padding: 2px 4px !important;
            font-size: 12.4px !important;
            font-weight: bold !important;
          }
          .workorder-table tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          .workorder-table th,
          .workorder-table td {
            border: 1px solid #000 !important;
            padding: 1px 2px !important;
            font-size: 11px !important;
            line-height: 1.1 !important;
          }
          .workorder-table th {
            border-width: 2px !important;
            background: white !important;
          }
        }
        /* Estilos para vista previa */
        .workorder-table {
          border: 2px solid #000;
        }
      </style>
      <table class="workorder-table">
        <thead>
          {{#if sale.vehicle}}
          <tr style="background: #e8f4f8; font-weight: bold; border: 2px solid #000; border-bottom: 1px solid #000;">
            <th style="padding: 3px 6px; font-size: 11px; border-right: 1px solid #000; text-align: left;">
              {{#if sale.vehicle.brand}}{{sale.vehicle.brand}}{{/if}}{{#if sale.vehicle.line}} {{sale.vehicle.line}}{{/if}}{{#if sale.vehicle.engine}} {{sale.vehicle.engine}}{{/if}}
            </th>
            <th style="padding: 3px 6px; font-size: 11px; text-align: left;">
              {{#if sale.vehicle.plate}}<strong>{{sale.vehicle.plate}}</strong>{{else}}—{{/if}}{{#if sale.vehicle.mileage}} | Kilometraje: {{sale.vehicle.mileage}} km{{/if}}
            </th>
          </tr>
          {{/if}}
          <tr>
            <th>Detalle</th>
            <th>Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {{#if sale.itemsGrouped.hasCombos}}
          <tr class="section-header">
            <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">COMBOS</td>
          </tr>
          {{#each sale.itemsGrouped.combos}}
          <tr>
            <td><strong>{{name}}</strong></td>
            <td class="t-center">{{qty}}</td>
          </tr>
          {{/each}}
          {{/if}}
          
          {{#if sale.itemsGrouped.hasProducts}}
          <tr class="section-header">
            <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">PRODUCTOS</td>
          </tr>
          {{#each sale.itemsGrouped.products}}
          <tr>
            <td>{{name}}</td>
            <td class="t-center">{{qty}}</td>
          </tr>
          {{/each}}
          {{/if}}
          
          {{#if sale.itemsGrouped.hasServices}}
          <tr class="section-header">
            <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding: 1px 3px; font-size: 12.4px;">SERVICIOS</td>
          </tr>
          {{#each sale.itemsGrouped.services}}
          <tr>
            <td>{{name}}</td>
            <td class="t-center">{{qty}}</td>
          </tr>
          {{/each}}
          {{/if}}
          
          {{#unless sale.itemsGrouped.hasProducts}}{{#unless sale.itemsGrouped.hasServices}}{{#unless sale.itemsGrouped.hasCombos}}
          <tr>
            <td colspan="2" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}{{/unless}}{{/unless}}
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

  function createPayrollTemplate(canvas) {
    console.log('🎨 Creando plantilla de nómina completa...');
    
    // Establecer tamaño de página a media carta (half-letter)
    const canvasParent = canvas.parentElement;
    if (canvasParent) {
      const halfLetterWidth = 14 * 37.795275591; // 14cm en px
      const halfLetterHeight = 21.6 * 37.795275591; // 21.6cm en px
      canvas.style.width = `${halfLetterWidth}px`;
      canvas.style.height = `${halfLetterHeight}px`;
      canvas.style.minHeight = `${halfLetterHeight}px`;
      canvas.style.maxHeight = `${halfLetterHeight}px`;
    }
    
    // Agregar estilos globales para media carta y encoding UTF-8
    const globalStyles = document.createElement('style');
    globalStyles.id = 'payroll-template-global-styles';
    globalStyles.textContent = `
      @page {
        size: 5.5in 8.5in; /* Half-letter size */
        margin: 0.4in;
      }
      @media print {
        body {
          margin: 0;
          padding: 0;
        }
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        font-size: 10px;
        line-height: 1.2;
      }
      /* Reducir márgenes y espaciado */
      * {
        box-sizing: border-box !important;
      }
      div {
        margin: 0 !important;
        padding: 0 !important;
      }
      /* Ajustar contenedores principales */
      .tpl-element {
        margin: 0 !important;
        padding: 0 !important;
      }
      /* Reducir altura de filas de tabla */
      tr {
        height: auto !important;
        min-height: 0 !important;
      }
      td, th {
        line-height: 1.1 !important;
        padding: 2px 3px !important;
      }
    `;
    if (!document.getElementById('payroll-template-global-styles')) {
      document.head.appendChild(globalStyles);
    }
    
    // Logo/empresa (centrado arriba) - editable con imagen o variable
    const logoBox = document.createElement('div');
    logoBox.className = 'tpl-element';
    logoBox.id = `element_${visualEditor.nextId++}`;
    logoBox.style.cssText = 'position: absolute; left: 50%; top: 10px; transform: translateX(-50%); width: 100px; height: 60px; border: 2px solid #000; padding: 3px; display: flex; align-items: center; justify-content: center; cursor: move; background: white; box-sizing: border-box;';
    logoBox.innerHTML = `
      <div class="image-placeholder" style="width: 100%; height: 100%; background: #f5f5f5; border: 2px dashed #999; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 11px; color: #666; text-align: center; padding: 5px; box-sizing: border-box; position: relative;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 5px; pointer-events: none;">
          <div style="font-size: 24px;">🖼️</div>
          <div>Logo</div>
        </div>
        <div style="position: absolute; bottom: 2px; left: 2px; right: 2px; font-size: 9px; color: #999; pointer-events: none; text-align: center;">{{company.logoUrl}}</div>
      </div>
      <div class="logo-text-editable" contenteditable="true" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0; cursor: text; z-index: 10; font-size: 10px; padding: 5px; word-break: break-all;" title="Haz doble clic para editar y usar variable {{company.logoUrl}}"></div>
    `;
    
    // Permitir edición de texto para usar variables
    const textEditor = logoBox.querySelector('.logo-text-editable');
    if (textEditor) {
      textEditor.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        textEditor.style.opacity = '1';
        textEditor.style.background = 'rgba(255,255,255,0.95)';
        textEditor.focus();
        textEditor.textContent = '{{company.logoUrl}}';
      });
      textEditor.addEventListener('blur', () => {
        const content = textEditor.textContent.trim();
        if (content && content.includes('{{')) {
          const placeholder = logoBox.querySelector('.image-placeholder');
          if (placeholder) {
            placeholder.innerHTML = `<img src="${content}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'padding: 10px; text-align: center; font-size: 10px; color: #999;\\'>Variable: ${content}</div>';" />`;
            placeholder.style.border = 'none';
            placeholder.style.background = 'transparent';
          }
        }
        textEditor.style.opacity = '0';
        textEditor.style.background = 'transparent';
      });
    }
    
    makeDraggable(logoBox);
    makeSelectable(logoBox);
    setupImageUpload(logoBox);
    canvas.appendChild(logoBox);
    visualEditor.elements.push({ id: logoBox.id, type: 'image', element: logoBox });

    // Tabla principal de datos del cliente (arriba, centrada)
    const employeeDataBox = document.createElement('div');
    employeeDataBox.className = 'tpl-element';
    employeeDataBox.id = `element_${visualEditor.nextId++}`;
    employeeDataBox.style.cssText = 'position: absolute; left: 20px; top: 70px; width: 460px; border: 2px solid #000; padding: 4px; background: white;';
    employeeDataBox.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 9px;">
        <tr>
          <td style="border: 1px solid #000; padding: 2px; font-weight: bold; width: 35%; word-wrap: break-word;">NOMBRE:</td>
          <td style="border: 1px solid #000; padding: 2px; word-wrap: break-word;">{{settlement.technicianName}}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 2px; font-weight: bold; word-wrap: break-word;">CÉDULA:</td>
          <td style="border: 1px solid #000; padding: 2px; word-wrap: break-word;">{{settlement.technicianIdentification}}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 2px; font-weight: bold; word-wrap: break-word;">PERIODO:</td>
          <td style="border: 1px solid #000; padding: 2px; word-wrap: break-word;">{{period.formattedStartDate}} A {{period.formattedEndDate}}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 2px; font-weight: bold; word-wrap: break-word;">SALARIO BÁSICO ($/MES):</td>
          <td style="border: 1px solid #000; padding: 2px; word-wrap: break-word;">{{#if settlement.technician.basicSalary}}{{money settlement.technician.basicSalary}}{{/if}}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 2px; font-weight: bold; word-wrap: break-word;">HORAS TRABAJO MES:</td>
          <td style="border: 1px solid #000; padding: 2px; word-wrap: break-word;">{{#if settlement.technician.workHoursPerMonth}}{{settlement.technician.workHoursPerMonth}}{{/if}}</td>
        </tr>
      </table>
    `;
    makeDraggable(employeeDataBox);
    makeSelectable(employeeDataBox);
    canvas.appendChild(employeeDataBox);
    visualEditor.elements.push({ id: employeeDataBox.id, type: 'text', element: employeeDataBox });

    // Resumen (derecha superior) - Días trabajados y Total neto
    const summaryBox = document.createElement('div');
    summaryBox.className = 'tpl-element';
    summaryBox.id = `element_${visualEditor.nextId++}`;
    summaryBox.style.cssText = 'position: absolute; right: 20px; top: 70px; width: 180px; border: 2px solid #000; padding: 6px; background: white;';
    summaryBox.innerHTML = `
      <div style="margin-bottom: 8px;">
        <div style="font-weight: bold; font-size: 9px; margin-bottom: 3px;">DÍAS TRABAJADOS</div>
        <div contenteditable="true" style="font-size: 16px; font-weight: bold; text-align: center;">{{period.daysWorked}}</div>
      </div>
      <div style="border-top: 1px solid #000; padding-top: 6px;">
        <div style="font-weight: bold; font-size: 9px; margin-bottom: 3px;">TOTAL NETO</div>
        <div contenteditable="true" style="font-size: 14px; font-weight: bold; text-align: center; word-wrap: break-word;">{{settlement.formattedNetTotal}}</div>
      </div>
    `;
    makeDraggable(summaryBox);
    makeSelectable(summaryBox);
    canvas.appendChild(summaryBox);
    visualEditor.elements.push({ id: summaryBox.id, type: 'text', element: summaryBox });

    // Tabla de ingresos (izquierda) - con total incluido
    const earningsTable = createPayrollEarningsTable({ left: 20, top: 200 });
    canvas.appendChild(earningsTable);

    // Tabla de descuentos (derecha) - con total incluido
    const deductionsTable = createPayrollDeductionsTable({ left: 300, top: 200 });
    canvas.appendChild(deductionsTable);

    // Sección "RECIBÍ A SATISFACCIÓN" (abajo izquierda) con espacio para firma
    const receivedBox = document.createElement('div');
    receivedBox.className = 'tpl-element';
    receivedBox.id = `element_${visualEditor.nextId++}`;
    receivedBox.style.cssText = 'position: absolute; left: 20px; top: 520px; width: 250px; border: 2px solid #000; padding: 6px; background: white;';
    receivedBox.innerHTML = `
      <div contenteditable="true" style="font-size: 10px; font-weight: bold; text-align: center; margin-bottom: 8px;">RECIBÍ A SATISFACCIÓN</div>
      <div style="border-top: 1px solid #000; margin-top: 4px; height: 40px; text-align: center; padding-top: 2px; font-size: 8px; color: #666;">Firma del empleado</div>
    `;
    makeDraggable(receivedBox);
    makeSelectable(receivedBox);
    canvas.appendChild(receivedBox);
    visualEditor.elements.push({ id: receivedBox.id, type: 'text', element: receivedBox });

    // Firma de empresa (abajo derecha)
    const companySignatureBox = document.createElement('div');
    companySignatureBox.className = 'tpl-element';
    companySignatureBox.id = `element_${visualEditor.nextId++}`;
    companySignatureBox.style.cssText = 'position: absolute; right: 20px; top: 520px; width: 250px; border: 2px solid #000; padding: 6px; background: white; font-size: 9px;';
    companySignatureBox.innerHTML = `
      <div style="font-weight: bold; text-align: center; margin-bottom: 8px;">FIRMA DE EMPRESA</div>
      <div style="border-top: 1px solid #000; margin-top: 4px; height: 40px; text-align: center; padding-top: 2px; font-size: 8px; color: #666;">Firma y sello</div>
      <div style="margin-top: 4px; text-align: center; font-size: 8px;">{{company.name}}</div>
    `;
    makeDraggable(companySignatureBox);
    makeSelectable(companySignatureBox);
    canvas.appendChild(companySignatureBox);
    visualEditor.elements.push({ id: companySignatureBox.id, type: 'text', element: companySignatureBox });

    console.log('✅ Plantilla de nómina creada con todos los elementos');
  }

  function createPayrollEarningsTable(position) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'tpl-element items-table';
    tableContainer.id = `element_${visualEditor.nextId++}`;
    tableContainer.style.cssText = `
      position: absolute;
      left: ${position.left}px;
      top: ${position.top}px;
      border: 2px solid transparent;
      cursor: move;
      width: 260px;
      background: white;
      max-width: 100%;
    `;

    tableContainer.innerHTML = `
      <style>
        .payroll-earnings-table {
          width: 100%;
          border-collapse: collapse !important;
          border-spacing: 0 !important;
          font-family: Arial, sans-serif;
          table-layout: fixed;
          margin: 0;
          border: 2px solid #000 !important;
        }
        .payroll-earnings-table th {
          border: 2px solid #000 !important;
          padding: 3px 2px !important;
          font-weight: bold !important;
          color: #000 !important;
          font-size: 9px !important;
          background: white !important;
          text-align: center !important;
          border-collapse: collapse !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          overflow: hidden !important;
          max-width: 0 !important;
        }
        .payroll-earnings-table td {
          border: 1px solid #000 !important;
          padding: 2px 2px !important;
          color: #000 !important;
          font-size: 9px !important;
          text-align: center !important;
          border-collapse: collapse !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          overflow: hidden !important;
          vertical-align: top !important;
          max-width: 0 !important;
        }
        .payroll-earnings-table td:first-child {
          text-align: left !important;
          padding-left: 4px !important;
        }
        .payroll-earnings-table thead tr:first-child th:first-child {
          border-top-left-radius: 0 !important;
        }
        .payroll-earnings-table thead tr:first-child th:last-child {
          border-top-right-radius: 0 !important;
        }
        .payroll-earnings-table tbody tr:last-child td:first-child {
          border-bottom-left-radius: 0 !important;
        }
        .payroll-earnings-table tbody tr:last-child td:last-child {
          border-bottom-right-radius: 0 !important;
        }
        .payroll-earnings-table tfoot {
          display: table-footer-group !important;
        }
        .payroll-earnings-table tfoot td {
          border-top: 2px solid #000 !important;
          font-weight: bold !important;
          padding: 4px 2px !important;
        }
        @media print {
          .payroll-earnings-table {
            border-collapse: collapse !important;
            border-spacing: 0 !important;
            width: 100% !important;
            border: 2px solid #000 !important;
            table-layout: fixed !important;
          }
          .payroll-earnings-table th,
          .payroll-earnings-table td {
            border: 1px solid #000 !important;
            padding: 3px 2px !important;
            font-size: 9px !important;
            border-collapse: collapse !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            max-width: 0 !important;
          }
          .payroll-earnings-table th {
            border-width: 2px !important;
            padding: 4px 3px !important;
          }
          .payroll-earnings-table td:first-child {
            padding-left: 4px !important;
          }
          .payroll-earnings-table tfoot {
            display: table-footer-group !important;
          }
          .payroll-earnings-table tfoot td {
            border-top: 2px solid #000 !important;
            font-weight: bold !important;
            padding: 4px 2px !important;
          }
        }
      </style>
      <table class="payroll-earnings-table">
        <thead>
          <tr>
            <th style="width: 60%;">DESCRIPCIÓN</th>
            <th style="width: 40%;">VALOR</th>
          </tr>
        </thead>
        <tbody>
          {{#each settlement.itemsByType.earnings}}
            <tr>
              <td>{{name}}</td>
              <td style="text-align: right; padding-right: 4px;">{{money value}}</td>
            </tr>
          {{else}}
            <tr>
              <td colspan="2" style="text-align: center; color: #666; padding: 8px;">Sin ingresos</td>
            </tr>
          {{/each}}
        </tbody>
        <tfoot>
          <tr>
            <td style="font-weight: bold; border-top: 2px solid #000; padding: 4px 2px;">TOTAL INGRESOS:</td>
            <td style="font-weight: bold; text-align: right; border-top: 2px solid #000; padding: 4px 4px 4px 2px;">{{settlement.formattedGrossTotal}}</td>
          </tr>
        </tfoot>
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

  function createPayrollDeductionsTable(position) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'tpl-element items-table';
    tableContainer.id = `element_${visualEditor.nextId++}`;
    tableContainer.style.cssText = `
      position: absolute;
      left: ${position.left}px;
      top: ${position.top}px;
      border: 2px solid transparent;
      cursor: move;
      width: 260px;
      background: white;
      max-width: 100%;
    `;

    tableContainer.innerHTML = `
      <style>
        .payroll-deductions-table {
          width: 100%;
          border-collapse: collapse !important;
          border-spacing: 0 !important;
          font-family: Arial, sans-serif;
          table-layout: fixed;
          margin: 0;
          border: 2px solid #000 !important;
        }
        .payroll-deductions-table th {
          border: 2px solid #000 !important;
          padding: 3px 2px !important;
          font-weight: bold !important;
          color: #000 !important;
          font-size: 9px !important;
          background: white !important;
          text-align: center !important;
          border-collapse: collapse !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          overflow: hidden !important;
          max-width: 0 !important;
        }
        .payroll-deductions-table td {
          border: 1px solid #000 !important;
          padding: 2px 2px !important;
          color: #000 !important;
          font-size: 9px !important;
          text-align: center !important;
          border-collapse: collapse !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          overflow: hidden !important;
          vertical-align: top !important;
          max-width: 0 !important;
        }
        .payroll-deductions-table td:first-child {
          text-align: left !important;
          padding-left: 4px !important;
        }
        .payroll-deductions-table thead tr:first-child th:first-child {
          border-top-left-radius: 0 !important;
        }
        .payroll-deductions-table thead tr:first-child th:last-child {
          border-top-right-radius: 0 !important;
        }
        .payroll-deductions-table tbody tr:last-child td:first-child {
          border-bottom-left-radius: 0 !important;
        }
        .payroll-deductions-table tbody tr:last-child td:last-child {
          border-bottom-right-radius: 0 !important;
        }
        .payroll-deductions-table tfoot {
          display: table-footer-group !important;
        }
        .payroll-deductions-table tfoot td {
          border-top: 2px solid #000 !important;
          font-weight: bold !important;
          padding: 4px 2px !important;
        }
        @media print {
          .payroll-deductions-table {
            border-collapse: collapse !important;
            border-spacing: 0 !important;
            width: 100% !important;
            border: 2px solid #000 !important;
            table-layout: fixed !important;
          }
          .payroll-deductions-table th,
          .payroll-deductions-table td {
            border: 1px solid #000 !important;
            padding: 3px 2px !important;
            font-size: 9px !important;
            border-collapse: collapse !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            max-width: 0 !important;
          }
          .payroll-deductions-table th {
            border-width: 2px !important;
            padding: 4px 3px !important;
          }
          .payroll-deductions-table td:first-child {
            padding-left: 4px !important;
          }
          .payroll-deductions-table tfoot {
            display: table-footer-group !important;
          }
          .payroll-deductions-table tfoot td {
            border-top: 2px solid #000 !important;
            font-weight: bold !important;
            padding: 4px 2px !important;
          }
        }
      </style>
      <table class="payroll-deductions-table">
        <thead>
          <tr>
            <th style="width: 60%;">DESCRIPCIÓN</th>
            <th style="width: 40%;">VALOR</th>
          </tr>
        </thead>
        <tbody>
          {{#each settlement.itemsByType.deductions}}
            <tr>
              <td>{{name}}</td>
              <td style="text-align: right; padding-right: 4px;">{{money value}}</td>
            </tr>
          {{else}}
            <tr>
              <td colspan="2" style="text-align: center; color: #666; padding: 8px;">Sin descuentos</td>
            </tr>
          {{/each}}
        </tbody>
        <tfoot>
          <tr>
            <td style="font-weight: bold; border-top: 2px solid #000; padding: 4px 2px;">TOTAL DESCUENTOS:</td>
            <td style="font-weight: bold; text-align: right; border-top: 2px solid #000; padding: 4px 4px 4px 2px;">{{settlement.formattedDeductionsTotal}}</td>
          </tr>
        </tfoot>
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

  function optimizeCanvasImages(canvas) {
    if (!canvas) return Promise.resolve();
    const images = Array.from(canvas.querySelectorAll('img[src^="data:image/"]'));
    if (!images.length) return Promise.resolve();

    const tasks = images.map(async (img) => {
      const originalSrc = img.src;
      try {
        const optimizedSrc = await optimizeImageDataUrl(originalSrc);
        if (optimizedSrc && optimizedSrc !== originalSrc) {
          console.log(`Imagen optimizada (${Math.round(originalSrc.length / 1024)} KB → ${Math.round(optimizedSrc.length / 1024)} KB)`);
          img.src = optimizedSrc;
        }
      } catch (error) {
        console.warn('No se pudo optimizar una imagen antes de guardar:', error);
      }
    });

    return Promise.all(tasks);
  }

  function getDocumentTypeName(type) {
    const names = {
      'invoice': 'Remisión',
      'invoice-factura': 'Factura',
      'quote': 'Cotización', 
      'sticker-qr': 'Sticker',
      'payroll': 'Nómina'
    };
    return names[type] || type;
  }

  // Enhanced save function with redirect to template selector
  window.saveTemplateAndReturn = async function() {
    console.log('🔄 Iniciando saveTemplateAndReturn...');
    
    const canvas = qs('#ce-canvas');
    if (!canvas) {
      console.error('❌ No se encontró el canvas');
      alert('Error: No se encontró el canvas del editor');
      return;
    }

    let content = canvas.innerHTML;
    const hasElements = !!canvas.querySelector('.tpl-element');
    await optimizeCanvasImages(canvas);
    content = canvas.innerHTML;
    
    // Restaurar variables completas antes de guardar si hay HTML original guardado
    const formatId = window.currentTemplateSession?.formatId;
    if (formatId && window.templateOriginalHtml && window.templateOriginalHtml[formatId]) {
      content = restoreHandlebarsVars(content, window.templateOriginalHtml[formatId]);
    }
    
    // Si es una plantilla de nómina, actualizar campos editables con variables
    let templateType = window.currentTemplateSession?.type;
    if (templateType === 'payroll') {
      content = updatePayrollEditableFields(content);
      // IMPORTANTE: Para payroll, NO acortar variables de itemsByType
      // Las variables {{name}} y {{value}} dentro de settlement.itemsByType deben mantenerse completas
    }
    
    // Asegurar que las variables de Handlebars en las tablas se preserven correctamente
    // Reemplazar cualquier escape HTML de las llaves de Handlebars
    content = content.replace(/&#123;&#123;/g, '{{');
    content = content.replace(/&#125;&#125;/g, '}}');
    
    // NOTA: Las variables de payroll están protegidas en shortenHandlebarsVars
    // No necesitamos protegerlas aquí porque el template ya debería tenerlas correctas
    
    // CORREGIR: Si las tablas tienen contenido pero NO tienen {{#each, agregarlas
    // Esto corrige templates que se guardaron sin las variables correctas
    if (content.includes('remission-table') || content.includes('items-table')) {
      const tbodyMatches = content.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
      if (tbodyMatches) {
        tbodyMatches.forEach((match) => {
          // Si tiene {{name}} pero NO tiene {{#each sale.items}}
          if (match.includes('{{name}}') && !match.includes('{{#each sale.items}}')) {
            const tbodyContent = match.replace(/<\/?tbody>/gi, '').trim();
            // Extraer solo las filas <tr> que tienen las variables
            const rowsMatch = tbodyContent.match(/<tr>[\s\S]*?<\/tr>/gi);
            if (rowsMatch && rowsMatch.length > 0) {
              // Buscar la fila con las variables de item (no la de "Sin ítems")
              const itemRow = rowsMatch.find(row => row.includes('{{name}}') && !row.includes('Sin ítems'));
              const sinItemsRow = rowsMatch.find(row => row.includes('Sin ítems'));
              
              if (itemRow) {
                // Crear nuevo tbody con las variables correctas
                const newTbody = `<tbody>
          {{#each sale.items}}
          ${itemRow}
          {{/each}}
          ${sinItemsRow ? `{{#unless sale.items}}
          ${sinItemsRow}
          {{/unless}}` : `{{#unless sale.items}}
          <tr>
            <td colspan="4" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}`}
        </tbody>`;
                content = content.replace(match, newTbody);
                console.log('🔧 Corregido tbody de remisión sin {{#each}}');
              }
            }
          }
        });
      }
      
      // Asegurar que la tabla tenga tfoot con el total si no lo tiene
      const tableMatches = content.match(/<table[^>]*class="[^"]*remission-table[^"]*"[^>]*>([\s\S]*?)<\/table>/gi);
      if (tableMatches) {
        tableMatches.forEach((tableMatch) => {
          // Verificar si tiene tfoot
          if (!tableMatch.includes('<tfoot>') && !tableMatch.includes('</tfoot>')) {
            // Buscar el cierre de tbody para insertar el tfoot después
            const tfootHtml = `
        <tfoot>
          <tr style="border-top: 2px solid #000;">
            <td colspan="3" style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">TOTAL</td>
            <td style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">{{$ S.total}}</td>
          </tr>
        </tfoot>`;
            // Insertar tfoot antes del cierre de </table>
            const newTableMatch = tableMatch.replace('</table>', tfootHtml + '\n      </table>');
            content = content.replace(tableMatch, newTableMatch);
            console.log('✅ Agregado tfoot con total a tabla de remisión');
          }
        });
      }
    }
    
    // Similar para cotizaciones
    if (content.includes('quote-table')) {
      const tbodyMatches = content.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
      if (tbodyMatches) {
        tbodyMatches.forEach((match) => {
          if (match.includes('{{description}}') && !match.includes('{{#each quote.items}}')) {
            const tbodyContent = match.replace(/<\/?tbody>/gi, '').trim();
            const rowsMatch = tbodyContent.match(/<tr>[\s\S]*?<\/tr>/gi);
            if (rowsMatch && rowsMatch.length > 0) {
              const itemRow = rowsMatch.find(row => row.includes('{{description}}') && !row.includes('Sin ítems'));
              const sinItemsRow = rowsMatch.find(row => row.includes('Sin ítems'));
              
              if (itemRow) {
                const newTbody = `<tbody>
          {{#each quote.items}}
          ${itemRow}
          {{/each}}
          ${sinItemsRow ? `{{#unless quote.items}}
          ${sinItemsRow}
          {{/unless}}` : `{{#unless quote.items}}
          <tr>
            <td colspan="4" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}`}
        </tbody>`;
                content = content.replace(match, newTbody);
                console.log('🔧 Corregido tbody de cotización sin {{#each}}');
              }
            }
          }
        });
      }
    }
    
    // Similar para orden de trabajo
    if (content.includes('workorder-table')) {
      const tbodyMatches = content.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
      if (tbodyMatches) {
        tbodyMatches.forEach((match) => {
          if (match.includes('{{name}}') && !match.includes('{{#each sale.items}}')) {
            const tbodyContent = match.replace(/<\/?tbody>/gi, '').trim();
            const rowsMatch = tbodyContent.match(/<tr>[\s\S]*?<\/tr>/gi);
            if (rowsMatch && rowsMatch.length > 0) {
              const itemRow = rowsMatch.find(row => row.includes('{{name}}') && !row.includes('Sin ítems'));
              const sinItemsRow = rowsMatch.find(row => row.includes('Sin ítems'));
              
              if (itemRow) {
                const newTbody = `<tbody>
          {{#each sale.items}}
          ${itemRow}
          {{/each}}
          ${sinItemsRow ? `{{#unless sale.items}}
          ${sinItemsRow}
          {{/unless}}` : `{{#unless sale.items}}
          <tr>
            <td colspan="2" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}`}
        </tbody>`;
                content = content.replace(match, newTbody);
                console.log('🔧 Corregido tbody de orden de trabajo sin {{#each}}');
              }
            }
          }
        });
      }
    }
    
    // Verificación específica para tablas de payroll
    if (templateType === 'payroll') {
      // Verificar que las tablas de earnings tengan las variables correctas
      if (content.includes('payroll-earnings-table')) {
        const earningsTbodyMatches = content.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
        if (earningsTbodyMatches) {
          earningsTbodyMatches.forEach((match) => {
            // Si tiene {{name}} pero NO tiene {{#each settlement.itemsByType.earnings}}
            if (match.includes('{{name}}') && !match.includes('{{#each settlement.itemsByType.earnings}}')) {
              const tbodyContent = match.replace(/<\/?tbody>/gi, '').trim();
              const rowsMatch = tbodyContent.match(/<tr>[\s\S]*?<\/tr>/gi);
              if (rowsMatch && rowsMatch.length > 0) {
                const itemRow = rowsMatch.find(row => row.includes('{{name}}') && !row.includes('Sin ingresos'));
                const sinItemsRow = rowsMatch.find(row => row.includes('Sin ingresos'));
                
                if (itemRow) {
                  const newTbody = `<tbody>
          {{#each settlement.itemsByType.earnings}}
          ${itemRow}
          {{else}}
          ${sinItemsRow || '<tr><td colspan="4" style="text-align: center; color: #666;">Sin ingresos</td></tr>'}
          {{/each}}
        </tbody>`;
                  content = content.replace(match, newTbody);
                  console.log('🔧 Corregido tbody de earnings sin {{#each settlement.itemsByType.earnings}}');
                }
              }
            }
          });
        }
      }
      
      // Verificar que las tablas de deductions tengan las variables correctas
      if (content.includes('payroll-deductions-table')) {
        const deductionsTbodyMatches = content.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
        if (deductionsTbodyMatches) {
          deductionsTbodyMatches.forEach((match) => {
            // Si tiene {{name}} pero NO tiene {{#each settlement.itemsByType.deductions}}
            if (match.includes('{{name}}') && !match.includes('{{#each settlement.itemsByType.deductions}}')) {
              const tbodyContent = match.replace(/<\/?tbody>/gi, '').trim();
              const rowsMatch = tbodyContent.match(/<tr>[\s\S]*?<\/tr>/gi);
              if (rowsMatch && rowsMatch.length > 0) {
                const itemRow = rowsMatch.find(row => row.includes('{{name}}') && !row.includes('Sin descuentos'));
                const sinItemsRow = rowsMatch.find(row => row.includes('Sin descuentos'));
                
                if (itemRow) {
                  const newTbody = `<tbody>
          {{#each settlement.itemsByType.deductions}}
          ${itemRow}
          {{else}}
          ${sinItemsRow || '<tr><td colspan="3" style="text-align: center; color: #666;">Sin descuentos</td></tr>'}
          {{/each}}
        </tbody>`;
                  content = content.replace(match, newTbody);
                  console.log('🔧 Corregido tbody de deductions sin {{#each settlement.itemsByType.deductions}}');
                }
              }
            }
          });
        }
      }
      
      // Asegurar que las variables {{name}} y {{money value}} dentro de settlement.itemsByType NO se acorten
      // Esto ya está protegido en shortenHandlebarsVars, pero verificamos aquí también
      if (content.includes('settlement.itemsByType')) {
        console.log('✅ Verificando variables de payroll en settlement.itemsByType');
        // Las variables {{name}} y {{money value}} deben mantenerse completas
        // No deben convertirse en {{nom}} o {{$ val}}
        if (content.includes('{{nom}}') && content.includes('settlement.itemsByType')) {
          console.warn('⚠️ Detectado {{nom}} dentro de settlement.itemsByType, restaurando a {{name}}');
          content = content.replace(/(\{\{#each settlement\.itemsByType\.(?:earnings|deductions)\}\}[\s\S]*?)\{\{nom\}\}([\s\S]*?\{\{\/each\}\})/g, 
            (match, before, after) => {
              return before + '{{name}}' + after;
            }
          );
        }
        if (content.includes('{{$ val}}') && content.includes('settlement.itemsByType')) {
          console.warn('⚠️ Detectado {{$ val}} dentro de settlement.itemsByType, restaurando a {{money value}}');
          content = content.replace(/(\{\{#each settlement\.itemsByType\.(?:earnings|deductions)\}\}[\s\S]*?)\{\{\$ val\}\}([\s\S]*?\{\{\/each\}\})/g, 
            (match, before, after) => {
              return before + '{{money value}}' + after;
            }
          );
        }
      }
    }
    
    console.log('📄 Contenido del canvas:', content.substring(0, 100) + '...');
    
    // Verificar que las tablas tengan las variables correctas
    if (content.includes('items-table') || content.includes('remission-table') || content.includes('quote-table') || content.includes('workorder-table')) {
      const hasSaleItems = content.includes('{{#each sale.items}}');
      const hasQuoteItems = content.includes('{{#each quote.items}}');
      console.log('📊 Verificación de tablas:', {
        hasSaleItems,
        hasQuoteItems,
        hasRemissionTable: content.includes('remission-table'),
        hasQuoteTable: content.includes('quote-table'),
        hasWorkOrderTable: content.includes('workorder-table')
      });
      
      // Verificar tbody específicamente
      const tbodyMatches = content.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
      if (tbodyMatches) {
        tbodyMatches.forEach((match, idx) => {
          console.log(`📊 tbody ${idx + 1} tiene {{#each sale.items}}:`, match.includes('{{#each sale.items}}'));
          console.log(`📊 tbody ${idx + 1} tiene {{#each quote.items}}:`, match.includes('{{#each quote.items}}'));
        });
      }
    }
    
    if ((!content || content.includes('Haz clic en los botones') || content.includes('Tu plantilla está vacía')) && !hasElements) {
      alert('❌ No se puede guardar una plantilla vacía.\n\nPor favor agrega contenido antes de guardar.');
      return;
    }

    if (typeof API === 'undefined') {
      console.error('❌ API no está disponible');
      alert('❌ Error: API no disponible\n\nPor favor recarga la página y asegúrate de que config.js y api.js estén cargados correctamente.');
      return;
    }

    const session = window.currentTemplateSession;
    let templateName = session?.name;
    // templateType ya fue declarado arriba, solo reasignar si es necesario
    if (!templateType) {
      templateType = session?.type || 'invoice';
    } else {
      // Asegurar que templateType tenga un valor por defecto si no está definido
      templateType = templateType || session?.type || 'invoice';
    }
    let isUpdate = session?.action === 'edit';

    if (!templateName || session?.action === 'create') {
      templateName = prompt('📝 Nombre del formato:', templateName || `Nuevo ${getDocumentTypeName(templateType)}`);
      if (!templateName) return;
      if (window.currentTemplateSession) {
        window.currentTemplateSession.name = templateName;
      }
    }

    const activate = isUpdate ? 
      confirm(`💾 ¿Actualizar formato existente "${templateName}"?\n\n✅ Sí - Actualizar formato\n❌ No - Cancelar`) :
      confirm(`📋 ¿Activar "${templateName}" como formato principal?\n\n✅ Sí - Activar como principal (Recomendado)\n❌ No - Guardar como borrador`);

    if (isUpdate && !activate) return;

    // Generar CSS optimizado según el tipo de template
    let templateCss = '';
    
    // CSS por defecto para remisiones/invoices con centrado y espaciado mejorado
    if (templateType === 'invoice' || templateType === 'remission') {
      templateCss = `
        /* Estilos base para mejor uso del espacio y centrado */
        body {
          margin: 0;
          padding: 10mm;
          font-family: Arial, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          color: #000;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }
        
        /* Contenedor centrado para el contenido de la remisión */
        .remission-wrapper {
          width: 100%;
          margin: 0 auto;
          position: relative;
        }
        
        /* Estilos para impresión con centrado */
        @page {
          size: auto;
          margin: 10mm;
        }
        
        @media print {
          body {
            margin: 0 !important;
            padding: 10mm !important;
            display: flex !important;
            justify-content: center !important;
            align-items: flex-start !important;
          }
          .remission-wrapper {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
          }
          * {
            box-sizing: border-box !important;
          }
        }
      `;
    } else if (templateType === 'payroll') {
      templateCss = `
        @page {
          size: 5.5in 8.5in;
          margin: 0.4in;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          font-size: 10px;
          line-height: 1.2;
        }
        /* Estilos mejorados para tablas de nómina */
        .payroll-earnings-table,
        .payroll-deductions-table {
          width: 100% !important;
          border-collapse: collapse !important;
          border-spacing: 0 !important;
          border: 2px solid #000 !important;
          margin: 0 !important;
          table-layout: fixed !important;
          font-size: 9px !important;
        }
        .payroll-earnings-table th,
        .payroll-deductions-table th {
          border: 2px solid #000 !important;
          padding: 3px 2px !important;
          font-weight: bold !important;
          color: #000 !important;
          background: white !important;
          text-align: center !important;
          font-size: 9px !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          overflow: hidden !important;
          max-width: 0 !important;
        }
        .payroll-earnings-table td,
        .payroll-deductions-table td {
          border: 1px solid #000 !important;
          padding: 2px 2px !important;
          color: #000 !important;
          font-size: 9px !important;
          text-align: center !important;
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          overflow: hidden !important;
          vertical-align: top !important;
          max-width: 0 !important;
        }
        .payroll-earnings-table td:first-child,
        .payroll-deductions-table td:first-child {
          text-align: left !important;
          padding-left: 4px !important;
        }
        /* Asegurar que los textos no se salgan */
        table td, table th {
          word-wrap: break-word !important;
          overflow-wrap: break-word !important;
          max-width: 0 !important;
        }
        /* Asegurar anchos de columna específicos para tablas de nómina */
        .payroll-earnings-table th:nth-child(1),
        .payroll-earnings-table td:nth-child(1) {
          width: 38% !important;
        }
        .payroll-earnings-table th:nth-child(2),
        .payroll-earnings-table td:nth-child(2) {
          width: 12% !important;
        }
        .payroll-earnings-table th:nth-child(3),
        .payroll-earnings-table td:nth-child(3) {
          width: 15% !important;
        }
        .payroll-earnings-table th:nth-child(4),
        .payroll-earnings-table td:nth-child(4) {
          width: 35% !important;
        }
        .payroll-deductions-table th:nth-child(1),
        .payroll-deductions-table td:nth-child(1) {
          width: 40% !important;
        }
        .payroll-deductions-table th:nth-child(2),
        .payroll-deductions-table td:nth-child(2) {
          width: 20% !important;
        }
        .payroll-deductions-table th:nth-child(3),
        .payroll-deductions-table td:nth-child(3) {
          width: 40% !important;
        }
        /* Reducir márgenes y espaciado */
        * {
          box-sizing: border-box !important;
        }
        div {
          margin: 0 !important;
          padding: 0 !important;
        }
        /* Ajustar contenedores principales */
        .tpl-element {
          margin: 0 !important;
          padding: 0 !important;
        }
        /* Asegurar que el contenido quepa en media carta */
        body > div {
          width: 100% !important;
          max-width: 100% !important;
          padding: 4px !important;
          margin: 0 !important;
        }
        /* Reducir espaciado entre secciones */
        div[style*="margin-bottom"] {
          margin-bottom: 4px !important;
        }
        div[style*="margin-top"] {
          margin-top: 2px !important;
        }
        /* Asegurar que las tablas se muestren correctamente */
        table {
          page-break-inside: avoid !important;
        }
        /* Reducir altura de filas de tabla */
        tr {
          height: auto !important;
          min-height: 0 !important;
        }
        td, th {
          line-height: 1.1 !important;
          padding: 2px 3px !important;
        }
      `;
    }
    
    try {
      showQuickNotification('💾 Guardando plantilla...', 'info');
      
      let savedTemplate;
      
      if (isUpdate && session?.formatId) {
        savedTemplate = await API.templates.update(session.formatId, {
          name: templateName,
          contentHtml: content,
          contentCss: templateCss,
          activate: activate
        });
      } else {
        savedTemplate = await API.templates.create({
          name: templateName,
          type: templateType,
          contentHtml: content,
          contentCss: templateCss,
          activate: activate
        });
      }
      
      showQuickNotification(`✅ "${templateName}" guardada correctamente`, 'success');
      console.log('✅ Plantilla guardada exitosamente:', savedTemplate);
      
      setTimeout(() => {
        console.log('🔄 Redirigiendo al selector de plantillas...');
        window.location.href = 'template-selector.html';
      }, 1500);
      
    } catch (error) {
      console.error('❌ Error saving template:', error);
      let errorMsg = '❌ Error al guardar la plantilla:\n\n';
      if (error.message) {
        errorMsg += error.message;
      } else if (error.status === 401) {
        errorMsg += 'No tienes permisos para guardar. Verifica tu sesión.';
      } else if (error.status === 500) {
        errorMsg += 'Error del servidor. Intenta nuevamente.';
      } else {
        errorMsg += 'Error desconocido. Revisa la consola para más detalles.';
      }
      alert(errorMsg);
      showQuickNotification('❌ Error al guardar plantilla', 'error');
    }
  };

  // Enhanced preview function with better error handling
  window.previewTemplateEnhanced = async function() {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;

    const sessionInfo = window.currentTemplateSession || null;
    const templateCss = (sessionInfo && sessionInfo.contentCss) || '';
    const hasElements = !!canvas.querySelector('.tpl-element');
    await optimizeCanvasImages(canvas);
    const content = canvas.innerHTML;
    if ((!content || content.includes('Haz clic en los botones') || content.includes('Tu plantilla está vacía')) && !hasElements) {
      alert('❌ No hay contenido para previsualizar.\n\nPor favor agrega elementos a la plantilla antes de ver la vista previa.');
      return;
    }

    let templateType = (sessionInfo && sessionInfo.type) || 'invoice';
    if (!sessionInfo) {
      if (content.toLowerCase().includes('cotización')) {
        templateType = 'quote';
      } else if (content.toLowerCase().includes('orden de trabajo')) {
        templateType = 'workOrder';
      } else if (content.toLowerCase().includes('remisión') || content.toLowerCase().includes('remision')) {
        templateType = 'invoice';
      }
    }

    if (typeof API === 'undefined') {
      alert('❌ Error: API no disponible\n\nPor favor recarga la página y asegúrate de que config.js y api.js estén cargados correctamente.');
      return;
    }

    try {
      showQuickNotification('🔄 Generando vista previa con datos reales...', 'info');
      
      // Restaurar variables acortadas antes de enviar al preview
      const restoredContent = restoreHandlebarsVarsForPreview(content);
      
      const result = await API.templates.preview({
        type: templateType,
        contentHtml: restoredContent,
        contentCss: templateCss
      });
      
      let renderedContent;
      if (typeof result === 'string') {
        renderedContent = result;
      } else if (result && result.rendered) {
        renderedContent = result.rendered;
      } else {
        renderedContent = content;
      }

      const previewWindow = window.open('', '_blank', 'width=900,height=1200,scrollbars=yes,resizable=yes');
      if (!previewWindow) {
        alert('❌ No se pudo abrir la ventana de vista previa.\n\nVerifica que tu navegador no esté bloqueando ventanas emergentes.');
        return;
      }
      
      const docTypeName = getDocumentTypeName(templateType);
      const previewHTML = `
        <!DOCTYPE html>
        <html lang="es">
          <head>
            <title>Vista Previa - ${docTypeName}</title>
            <meta charset="UTF-8">
            <style>
              * { box-sizing: border-box; }
              body { 
                font-family: 'Arial', 'Helvetica', sans-serif; 
                margin: 0; 
                padding: 20px; 
                background: #f5f5f5;
              }
              .preview-container {
                background: white;
                width: 21cm;
                min-height: 29.7cm;
                padding: 2cm;
                margin: 0 auto;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .tpl-element { position: relative !important; }
            </style>
            ${templateCss ? `<style>${templateCss}</style>` : ''}
          </head>
          <body>
            <div class="preview-container">
              ${renderedContent}
            </div>
          </body>
        </html>
      `;
      
      previewWindow.document.write(previewHTML);
      previewWindow.document.close();
      showQuickNotification('✅ Vista previa generada', 'success');
      
    } catch (error) {
      console.error('❌ Error generating preview:', error);
      alert(`❌ Error al generar vista previa:\n\n${error.message || 'Error desconocido'}`);
      showQuickNotification('❌ Error al generar vista previa', 'error');
    }
  };

})(); // End IIFE

