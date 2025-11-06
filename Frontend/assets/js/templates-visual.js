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

    const startDrag = (e) => {
      if (e.target.contentEditable === 'true' || e.target.tagName === 'INPUT') return;
      
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
      }
    };

    element.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);
  }

  function makeSelectable(element) {
    element.onclick = (e) => {
      e.stopPropagation();
      selectElement(element);
    };
  }

  function selectElement(element) {
    // Remove previous selection
    document.querySelectorAll('.tpl-element').forEach(el => {
      el.style.border = '2px solid transparent';
      el.style.boxShadow = 'none';
    });

    visualEditor.selectedElement = element;

    if (element) {
      element.style.border = '2px solid #2563eb';
      element.style.boxShadow = '0 0 0 1px rgba(37, 99, 235, 0.2)';
    }
  }

  function setupImageUpload(element) {
    const placeholder = element.querySelector('.image-placeholder');
    if (!placeholder) return;

    placeholder.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const img = document.createElement('img');
          img.src = event.target.result;
          img.style.cssText = 'width:150px; height:auto; display:block;';
          img.draggable = false;
          
          placeholder.replaceWith(img);
        };
        
        reader.readAsDataURL(file);
      };
      
      input.click();
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

  function setupVariables() {
    const varList = qs('#var-list');
    if (!varList) return;

    varList.innerHTML = '<div style="padding: 20px; color: #666;">Variables disponibles - Funcionalidad pendiente</div>';
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

  function loadExistingFormat(formatId) {
    console.log('Cargando formato existente:', formatId);
    // Placeholder - se implementará después
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

