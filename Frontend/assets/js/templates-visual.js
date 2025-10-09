// Editor Visual de Plantillas Completo para templates.html
// Sistema drag & drop con propiedades de texto, imágenes y elementos

(function(){
  const state = {
    templates: [],
    editing: null,
    mode: 'visual',
    exampleSnippets: {
      invoice: '<!-- Factura --><div class="doc"><h1>FACTURA #{{sale.number}}</h1><p>Cliente: {{sale.customerName}}</p><table class="items"><thead><tr><th>Cant</th><th>Descripción</th><th>Total</th></tr></thead><tbody>{{#each sale.items}}<tr><td>{{qty}}</td><td>{{description}}</td><td>{{money total}}</td></tr>{{/each}}</tbody></table><h2>Total: {{money sale.total}}</h2></div>',
      quote: '<!-- Cotización --><div class="doc"><h1>COTIZACIÓN #{{quote.number}}</h1><p>Cliente: {{quote.customerName}}</p><p>Fecha: {{date quote.date}}</p><table>{{#each quote.items}}<tr><td>{{qty}} x {{description}} = {{money total}}</td></tr>{{/each}}</table><h2>Total: {{money quote.total}}</h2></div>',
      workOrder: '<!-- Orden de Trabajo --><div class="doc"><h1>ORDEN DE TRABAJO #{{sale.number}}</h1><p>Vehículo: {{sale.vehicle.plate}} ({{sale.vehicle.brand}})</p><p>Cliente: {{sale.customerName}}</p><h2>Trabajos:</h2><ul>{{#each sale.items}}<li>{{description}} - {{money total}}</li>{{/each}}</ul><p>Total: {{money sale.total}}</p></div>',
      sticker: '<!-- Sticker --><div class="sticker">{{company.name}} - {{sale.number}}<br>{{#each sale.items}}{{description}} ({{qty}})<br>{{/each}}</div>'
    }
  };

  // Visual Editor State
  const visualEditor = {
    selectedElement: null,
    draggedElement: null,
    elements: [],
    nextId: 1
  };

  // Font families for business templates
  const FONTS = [
    'Arial, sans-serif',
    'Times New Roman, serif', 
    'Calibri, sans-serif',
    'Helvetica, sans-serif',
    'Georgia, serif'
  ];

  // Utility functions
  function qs(sel, ctx=document){ return ctx.querySelector(sel); }

  // Setup visual editor functionality
  function setupVisualEditor() {
    const canvas = qs('#ce-canvas');
    
    if (!canvas) {
      console.warn('Canvas #ce-canvas no encontrado');
      return;
    }

    // Make canvas suitable for visual editing
    canvas.style.minHeight = '500px';
    canvas.style.border = '2px dashed #ddd';
    canvas.style.padding = '20px';
    canvas.style.position = 'relative';
    canvas.style.background = '#fff';
    canvas.style.overflow = 'visible';

    // Clear default content
    canvas.innerHTML = '<div style="color: #999; text-align: center; padding: 50px;">Haz clic en los botones de arriba para agregar elementos</div>';

    // Setup button handlers
    setupButtonHandlers();

    // Canvas click handler
    canvas.onclick = (e) => {
      if (e.target === canvas) {
        selectElement(null);
      }
    };
  }

  function setupButtonHandlers() {
    // Add text button
    const addTextBtn = qs('#add-text-btn') || qs('[onclick="addText()"]');
    if (addTextBtn) {
      addTextBtn.onclick = () => addElement('text');
    }

    // Add title button  
    const addTitleBtn = qs('#add-title-btn') || qs('[onclick="addTitle()"]');
    if (addTitleBtn) {
      addTitleBtn.onclick = () => addElement('title');
    }

    // Add image button
    const addImageBtn = qs('#add-image-btn') || qs('[onclick="addImage()"]');
    if (addImageBtn) {
      addImageBtn.onclick = () => addElement('image');
    }

    // Add table button
    const addTableBtn = qs('#add-table-btn') || qs('[onclick="addTable()"]');
    if (addTableBtn) {
      addTableBtn.onclick = () => addElement('table');
    }

    // Create buttons if they don't exist
    createEditorButtons();
  }

  function createEditorButtons() {
    // Find toolbar or create one
    let toolbar = qs('.editor-toolbar') || qs('.toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'editor-toolbar';
      toolbar.style.cssText = 'padding: 10px; background: #f5f5f5; border: 1px solid #ddd; margin-bottom: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;';
      
      const canvas = qs('#ce-canvas');
      if (canvas && canvas.parentNode) {
        canvas.parentNode.insertBefore(toolbar, canvas);
      }
    }

    toolbar.innerHTML = `
      <button id="add-title-btn" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">+ Título</button>
      <button id="add-text-btn" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">+ Texto</button>
      <button id="add-image-btn" style="padding: 8px 16px; background: #ffc107; color: black; border: none; border-radius: 4px; cursor: pointer;">+ Imagen</button>
      <button id="add-table-btn" style="padding: 8px 16px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">+ Tabla</button>
      <button id="clear-canvas-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Limpiar</button>
      
      <div style="margin-left: auto; display: flex; gap: 10px; align-items: center;">
        <label style="font-weight: 600;">Tamaño:</label>
        <select id="canvas-size" style="padding: 5px; border-radius: 4px; border: 1px solid #ccc;">
          <option value="sticker">Sticker (5 x 3 cm)</option>
          <option value="half-letter">Media Carta (14 x 21.6 cm)</option>
          <option value="letter" selected>Carta (21.6 x 27.9 cm)</option>
          <option value="custom">Personalizado</option>
        </select>
        <div id="custom-size" style="display: none; gap: 5px; align-items: center;">
          <input type="number" id="custom-width" placeholder="Ancho" min="1" max="50" value="21.6" step="0.1" style="width: 70px; padding: 4px; border: 1px solid #ccc; border-radius: 3px;">
          <span>x</span>
          <input type="number" id="custom-height" placeholder="Alto" min="1" max="70" value="27.9" step="0.1" style="width: 70px; padding: 4px; border: 1px solid #ccc; border-radius: 3px;">
          <span>cm</span>
          <button id="apply-size" style="padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">Aplicar</button>
        </div>
      </div>
    `;

    // Setup button handlers
    qs('#add-title-btn').onclick = () => addElement('title');
    qs('#add-text-btn').onclick = () => addElement('text');
    qs('#add-image-btn').onclick = () => addElement('image');
    qs('#add-table-btn').onclick = () => addElement('table');
    qs('#clear-canvas-btn').onclick = clearCanvas;
    
    // Setup canvas size handlers
    setupCanvasSizeControls();
  }

  function setupCanvasSizeControls() {
    const sizeSelect = qs('#canvas-size');
    const customDiv = qs('#custom-size');
    const customWidth = qs('#custom-width');
    const customHeight = qs('#custom-height');
    const applyBtn = qs('#apply-size');
    
    if (!sizeSelect) return;
    
    // Canvas size presets (convert cm to pixels at 96 DPI)
    const sizesInCm = {
      'sticker': { width: 5, height: 3, name: 'Sticker' },
      'half-letter': { width: 14, height: 21.6, name: 'Media Carta' },
      'letter': { width: 21.6, height: 27.9, name: 'Carta' },
      'custom': { width: 21.6, height: 27.9, name: 'Personalizado' }
    };
    
    function cmToPx(cm) {
      return Math.round(cm * 37.795275591); // 1 cm = ~37.8px at 96 DPI
    }
    
    function applyCanvasSize(widthCm, heightCm, sizeName) {
      const canvas = qs('#ce-canvas');
      if (!canvas) return;
      
      const widthPx = cmToPx(widthCm);
      const heightPx = cmToPx(heightCm);
      
      canvas.style.width = widthPx + 'px';
      canvas.style.height = heightPx + 'px';
      canvas.style.maxWidth = widthPx + 'px';
      canvas.style.maxHeight = heightPx + 'px';
      canvas.style.border = '1px solid #ddd';
      canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
      canvas.style.backgroundColor = '#ffffff';
      canvas.style.margin = '0 auto';
      
      // Update parent container
      const parent = canvas.parentElement;
      if (parent) {
        parent.style.textAlign = 'center';
        parent.style.padding = '20px';
      }
      
      console.log(`Canvas redimensionado: ${sizeName} (${widthCm} x ${heightCm} cm = ${widthPx} x ${heightPx} px)`);
    }
    
    sizeSelect.onchange = () => {
      const selected = sizeSelect.value;
      
      if (selected === 'custom') {
        customDiv.style.display = 'flex';
      } else {
        customDiv.style.display = 'none';
        const size = sizesInCm[selected];
        applyCanvasSize(size.width, size.height, size.name);
      }
    };
    
    // Custom size application
    if (applyBtn) {
      applyBtn.onclick = () => {
        const width = parseFloat(customWidth.value);
        const height = parseFloat(customHeight.value);
        
        if (width && height && width >= 1 && width <= 50 && height >= 1 && height <= 70) {
          applyCanvasSize(width, height, 'Personalizado');
        } else {
          alert('Por favor ingresa dimensiones válidas (ancho: 1-50 cm, alto: 1-70 cm)');
        }
      };
    }
    
    // Apply default size (Letter)
    const defaultSize = sizesInCm.letter;
    applyCanvasSize(defaultSize.width, defaultSize.height, defaultSize.name);
  }

  function addElement(type) {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;

    // Clear placeholder text
    if (canvas.innerHTML.includes('Haz clic en los botones')) {
      canvas.innerHTML = '';
    }

    const id = `element_${visualEditor.nextId++}`;
    const element = document.createElement('div');
    element.id = id;
    element.className = 'tpl-element';
    element.style.cssText = 'position: absolute; cursor: move; border: 2px solid transparent; padding: 8px; min-width: 100px; min-height: 30px;';

    switch (type) {
      case 'text':
        element.innerHTML = '<span contenteditable="true" style="font-family: Arial; font-size: 14px; color: #333;">Texto editable - Haz clic para editar</span>';
        element.style.left = '20px';
        element.style.top = '20px';
        break;
        
      case 'title':
        element.innerHTML = '<h2 contenteditable="true" style="font-family: Arial; font-size: 24px; color: #2563eb; margin: 0;">Título Principal</h2>';
        element.style.left = '20px';
        element.style.top = '20px';
        break;
        
      case 'image':
        element.innerHTML = '<div class="image-placeholder" style="width: 150px; height: 100px; background: #f0f0f0; border: 2px dashed #ccc; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 12px; color: #666;">Haz clic para agregar imagen</div>';
        element.style.left = '20px';
        element.style.top = '80px';
        break;
        
      case 'table':
        element.innerHTML = `
          <table style="border-collapse: collapse; width: 100%; min-width: 300px;">
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
        element.style.left = '20px';
        element.style.top = '140px';
        break;
    }

    // Make element draggable and selectable
    makeDraggable(element);
    makeSelectable(element);

    // Add image upload functionality for image elements
    if (type === 'image') {
      setupImageUpload(element);
    }

    canvas.appendChild(element);
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

    // Create drag handle for better UX
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

    // Show/hide drag handle on selection
    element.addEventListener('mouseenter', () => {
      if (!dragHandle) dragHandle = createDragHandle();
      if (visualEditor.selectedElement === element) {
        dragHandle.style.display = 'block';
      }
    });

    element.addEventListener('mouseleave', () => {
      if (dragHandle && !isDragging) {
        dragHandle.style.display = 'none';
      }
    });

    const startDrag = (e) => {
      // Prevent dragging when clicking on contenteditable elements
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
      
      // Show drag handle during drag
      if (dragHandle) {
        dragHandle.style.display = 'block';
      }
      
      e.preventDefault();
      e.stopPropagation();
    };

    const doDrag = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const newLeft = initialX + deltaX;
      const newTop = initialY + deltaY;
      
      // Keep element within canvas bounds
      const canvas = element.parentElement;
      const canvasRect = canvas.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      
      const maxLeft = canvasRect.width - elementRect.width;
      const maxTop = canvasRect.height - elementRect.height;
      
      element.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
      element.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
      
      e.preventDefault();
    };

    const endDrag = () => {
      if (isDragging) {
        isDragging = false;
        element.style.zIndex = '1';
        element.style.userSelect = 'auto';
        
        if (dragHandle) {
          dragHandle.style.display = 'none';
        }
      }
    };

    // Attach event listeners
    element.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);

    // Store reference for cleanup
    element._dragCleanup = () => {
      element.removeEventListener('mousedown', startDrag);
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', endDrag);
    };
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
      showElementProperties(element);
      
      // Add delete hint
      if (!element.querySelector('.delete-hint')) {
        const hint = document.createElement('div');
        hint.className = 'delete-hint';
        hint.style.cssText = `
          position: absolute;
          top: -25px;
          right: -10px;
          background: #dc3545;
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
          pointer-events: none;
          z-index: 1002;
        `;
        hint.textContent = 'Del para eliminar';
        element.appendChild(hint);
        
        // Remove hint after 3 seconds
        setTimeout(() => {
          if (hint.parentNode) hint.remove();
        }, 3000);
      }
    } else {
      hideElementProperties();
    }
  }

  function showElementProperties(element) {
    const propertiesPanel = qs('#element-properties') || createPropertiesPanel();
    if (!propertiesPanel) return;

    const contentElement = element.querySelector('[contenteditable="true"]') || element.querySelector('span') || element.querySelector('h1, h2, h3');
    
    if (contentElement) {
      const computedStyle = window.getComputedStyle(contentElement);
      
      propertiesPanel.innerHTML = `
        <div style="padding: 15px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; margin: 10px 0;">
          <h4 style="margin: 0 0 15px 0; color: #333;">Propiedades del Elemento</h4>
          
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-weight: 600; margin-bottom: 5px;">Fuente:</label>
            <select id="prop-font" style="width: 100%; padding: 5px;">
              ${FONTS.map(font => `<option value="${font}" ${computedStyle.fontFamily.includes(font.split(',')[0]) ? 'selected' : ''}>${font.split(',')[0]}</option>`).join('')}
            </select>
          </div>
          
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-weight: 600; margin-bottom: 5px;">Tamaño: <span id="size-display">${parseInt(computedStyle.fontSize)}px</span></label>
            <input type="range" id="prop-size" min="10" max="48" value="${parseInt(computedStyle.fontSize)}" style="width: 100%;">
          </div>
          
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-weight: 600; margin-bottom: 5px;">Color:</label>
            <input type="color" id="prop-color" value="${rgbToHex(computedStyle.color)}" style="width: 100%; height: 40px;">
          </div>
          
          <div style="margin-bottom: 10px;">
            <label style="display: block; font-weight: 600; margin-bottom: 5px;">Estilo:</label>
            <div style="display: flex; gap: 5px;">
              <button id="prop-bold" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.fontWeight > 400 ? '#007bff' : '#fff'}; color: ${computedStyle.fontWeight > 400 ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;"><b>B</b></button>
              <button id="prop-italic" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.fontStyle === 'italic' ? '#007bff' : '#fff'}; color: ${computedStyle.fontStyle === 'italic' ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;"><i>I</i></button>
              <button id="prop-underline" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.textDecoration.includes('underline') ? '#007bff' : '#fff'}; color: ${computedStyle.textDecoration.includes('underline') ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;"><u>U</u></button>
            </div>
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="display: block; font-weight: 600; margin-bottom: 5px;">Alineación:</label>
            <div style="display: flex; gap: 5px;">
              <button id="align-left" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.textAlign === 'left' || computedStyle.textAlign === 'start' ? '#007bff' : '#fff'}; color: ${computedStyle.textAlign === 'left' || computedStyle.textAlign === 'start' ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;">←</button>
              <button id="align-center" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.textAlign === 'center' ? '#007bff' : '#fff'}; color: ${computedStyle.textAlign === 'center' ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;">↔</button>
              <button id="align-right" style="flex: 1; padding: 8px; border: 1px solid #ccc; background: ${computedStyle.textAlign === 'right' ? '#007bff' : '#fff'}; color: ${computedStyle.textAlign === 'right' ? 'white' : 'black'}; border-radius: 4px; cursor: pointer;">→</button>
            </div>
          </div>
          
          <button id="delete-element" style="width: 100%; padding: 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Eliminar Elemento</button>
        </div>
      `;

      setupPropertyListeners(element, contentElement);
    }

    propertiesPanel.style.display = 'block';
  }

  function createPropertiesPanel() {
    // Try to find existing sidebar or create one
    let sidebar = qs('#sidebar') || qs('.sidebar') || qs('#var-list')?.parentNode;
    
    if (!sidebar) {
      sidebar = document.createElement('div');
      sidebar.style.cssText = 'position: fixed; right: 10px; top: 100px; width: 250px; max-height: 80vh; overflow-y: auto; z-index: 1000;';
      document.body.appendChild(sidebar);
    }

    const panel = document.createElement('div');
    panel.id = 'element-properties';
    panel.style.cssText = 'display: none;';
    sidebar.appendChild(panel);
    
    return panel;
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
      // Apply alignment to the content element
      contentElement.style.textAlign = align;
      
      // Also apply to parent element if it's a container
      if (element.tagName === 'DIV' && element !== contentElement) {
        element.style.textAlign = align;
      }
      
      // Update button states
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

      console.log(`Alineación aplicada: ${align} al elemento:`, contentElement);
    }

    if (deleteBtn) {
      deleteBtn.onclick = () => {
        // Clean up resize handles if it's an image
        const imageContainer = element.querySelector('.image-container');
        if (imageContainer && imageContainer._resizeCleanup) {
          imageContainer._resizeCleanup();
        }
        
        // Clean up drag functionality
        if (element._dragCleanup) {
          element._dragCleanup();
        }
        
        // Remove element from DOM
        element.remove();
        
        // Remove from elements array
        visualEditor.elements = visualEditor.elements.filter(el => el.element !== element);
        
        // Clear selection
        selectElement(null);
        
        console.log('Elemento eliminado correctamente');
      };
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
        reader.onload = (e) => {
          const imgContainer = document.createElement('div');
          imgContainer.className = 'image-container';
          imgContainer.style.cssText = 'position: relative; display: inline-block; max-width: 100%;';
          
          const img = document.createElement('img');
          img.src = e.target.result;
          img.style.cssText = 'width: 150px; height: auto; display: block; user-select: none;';
          img.draggable = false;
          
          imgContainer.appendChild(img);
          
          // Add resize handles
          addResizeHandles(imgContainer, img);
          
          placeholder.replaceWith(imgContainer);
          
          // Restore input functionality after image upload
          setTimeout(() => {
            if (window.restoreInputFunctionality) {
              window.restoreInputFunctionality();
            }
          }, 200);
          
          console.log('Imagen agregada. Usa los handles para redimensionar.');
        };
        
        reader.readAsDataURL(file);
      };
      
      input.click();
    };
  }

  function addResizeHandles(container, img) {
    const handles = ['nw', 'ne', 'sw', 'se']; // northwest, northeast, southwest, southeast
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
      
      // Position handles
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
      
      // Add resize functionality
      setupResizeHandle(handle, container, img, position);
    });
    
    // Show/hide handles on hover and selection
    const showHandles = () => {
      if (visualEditor.selectedElement && visualEditor.selectedElement.contains(container)) {
        Object.values(handleElements).forEach(h => h.style.display = 'block');
      }
    };
    
    const hideHandles = () => {
      Object.values(handleElements).forEach(h => h.style.display = 'none');
    };
    
    container.addEventListener('mouseenter', showHandles);
    container.addEventListener('mouseleave', hideHandles);
    
    // Show handles when parent element is selected
    const checkSelection = () => {
      if (visualEditor.selectedElement && visualEditor.selectedElement.contains(container)) {
        showHandles();
      } else {
        hideHandles();
      }
    };
    
    // Check selection periodically
    const selectionInterval = setInterval(checkSelection, 100);
    
    // Store cleanup function
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
      
      // Calculate new dimensions based on handle position
      switch(position) {
        case 'se': // Bottom-right
          newWidth = startWidth + deltaX;
          break;
        case 'sw': // Bottom-left
          newWidth = startWidth - deltaX;
          break;
        case 'ne': // Top-right
          newWidth = startWidth + deltaX;
          break;
        case 'nw': // Top-left
          newWidth = startWidth - deltaX;
          break;
      }
      
      // Maintain aspect ratio
      newHeight = newWidth / aspectRatio;
      
      // Apply minimum and maximum constraints
      const minSize = 20;
      const maxSize = 800;
      
      if (newWidth >= minSize && newWidth <= maxSize) {
        img.style.width = newWidth + 'px';
        img.style.height = newHeight + 'px';
      }
      
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
    
    canvas.innerHTML = '<div style="color: #999; text-align: center; padding: 50px;">Haz clic en los botones de arriba para agregar elementos</div>';
    visualEditor.elements = [];
    visualEditor.selectedElement = null;
    selectElement(null);
  }

  function hideElementProperties() {
    const propertiesPanel = qs('#element-properties');
    if (propertiesPanel) {
      propertiesPanel.style.display = 'none';
    }
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

  // Variable groups for insertion
  const VAR_GROUPS = [
    {
      title: 'Empresa',
      items: [
        { label: 'Nombre', value: '{{company.name}}' },
        { label: 'Dirección', value: '{{company.address}}' },
        { label: 'Teléfono', value: '{{company.phone}}' }
      ]
    },
    {
      title: 'Cliente',
      items: [
        { label: 'Nombre', value: '{{sale.customerName}}' },
        { label: 'Teléfono', value: '{{sale.customerPhone}}' }
      ]
    },
    {
      title: 'Venta',
      items: [
        { label: 'Número', value: '{{sale.number}}' },
        { label: 'Fecha', value: '{{date sale.date}}' },
        { label: 'Total', value: '{{money sale.total}}' }
      ]
    }
  ];

  function setupVariables() {
    const varList = qs('#var-list');
    if (!varList) return;

    const html = VAR_GROUPS.map(group => `
      <div style="margin-bottom: 15px;">
        <h4 style="margin: 5px 0; color: #666; font-size: 12px;">${group.title}</h4>
        ${group.items.map(item => `
          <div style="padding: 6px; background: #f0f0f0; border-radius: 4px; margin: 3px 0; cursor: pointer; font-size: 11px;" 
               onclick="insertVariableInCanvas('${item.value}')">
            <strong>${item.label}</strong><br>
            <code style="color: #e11d48; font-size: 10px;">${item.value}</code>
          </div>
        `).join('')}
      </div>
    `).join('');

    varList.innerHTML = html;
  }

  // Global function for inserting variables
  window.insertVariableInCanvas = function(varText) {
    const selectedEl = visualEditor.selectedElement;
    if (selectedEl) {
      const contentEl = selectedEl.querySelector('[contenteditable="true"]');
      if (contentEl) {
        contentEl.innerHTML += varText;
        return;
      }
    }
    
    // Fallback: add as new text element
    addElement('text');
    setTimeout(() => {
      const newEl = visualEditor.elements[visualEditor.elements.length - 1];
      if (newEl) {
        const contentEl = newEl.element.querySelector('[contenteditable="true"]');
        if (contentEl) {
          contentEl.innerHTML = varText;
        }
      }
    }, 100);
  };

  // Setup keyboard shortcuts
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Delete element with Del or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && visualEditor.selectedElement) {
        // Don't delete if we're editing text
        if (document.activeElement.contentEditable === 'true') return;
        
        e.preventDefault();
        deleteSelectedElement();
      }
      
      // Copy element with Ctrl+C
      if (e.ctrlKey && e.key === 'c' && visualEditor.selectedElement) {
        if (document.activeElement.contentEditable === 'true') return;
        e.preventDefault();
        copySelectedElement();
      }
      
      // Paste element with Ctrl+V
      if (e.ctrlKey && e.key === 'v' && visualEditor.copiedElement) {
        if (document.activeElement.contentEditable === 'true') return;
        e.preventDefault();
        pasteElement();
      }
    });
  }

  function deleteSelectedElement() {
    if (!visualEditor.selectedElement) return;
    
    const element = visualEditor.selectedElement;
    
    // Clean up resize handles if it's an image
    const imageContainer = element.querySelector('.image-container');
    if (imageContainer && imageContainer._resizeCleanup) {
      imageContainer._resizeCleanup();
    }
    
    // Clean up drag functionality
    if (element._dragCleanup) {
      element._dragCleanup();
    }
    
    // Remove element from DOM
    element.remove();
    
    // Remove from elements array
    visualEditor.elements = visualEditor.elements.filter(el => el.element !== element);
    
    // Clear selection
    selectElement(null);
    
    console.log('Elemento eliminado con teclado');
  }

  function copySelectedElement() {
    if (!visualEditor.selectedElement) return;
    
    visualEditor.copiedElement = {
      outerHTML: visualEditor.selectedElement.outerHTML,
      type: visualEditor.elements.find(el => el.element === visualEditor.selectedElement)?.type || 'unknown'
    };
    
    console.log('Elemento copiado');
  }

  function pasteElement() {
    if (!visualEditor.copiedElement) return;
    
    const canvas = qs('#ce-canvas');
    if (!canvas) return;
    
    // Create new element from copied HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = visualEditor.copiedElement.outerHTML;
    const newElement = tempDiv.firstChild;
    
    // Generate new ID
    const newId = `element_${visualEditor.nextId++}`;
    newElement.id = newId;
    
    // Offset position slightly
    const currentLeft = parseInt(newElement.style.left) || 0;
    const currentTop = parseInt(newElement.style.top) || 0;
    newElement.style.left = (currentLeft + 20) + 'px';
    newElement.style.top = (currentTop + 20) + 'px';
    
    // Re-setup functionality
    makeDraggable(newElement);
    makeSelectable(newElement);
    
    // Setup image upload if it's an image element
    if (visualEditor.copiedElement.type === 'image') {
      setupImageUpload(newElement);
    }
    
    canvas.appendChild(newElement);
    selectElement(newElement);
    
    // Add to elements array
    visualEditor.elements.push({
      id: newId,
      type: visualEditor.copiedElement.type,
      element: newElement
    });
    
    console.log('Elemento pegado');
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    console.log('🎨 Inicializando Editor Visual Completo...');
    
    setupVisualEditor();
    setupVariables();
    setupKeyboardShortcuts();
    
    // Setup existing buttons if they exist
    const saveBtn = qs('#save-template');
    if (saveBtn) {
      saveBtn.onclick = function() {
        const canvas = qs('#ce-canvas');
        const content = canvas ? canvas.innerHTML : '';
        console.log('Guardando plantilla:', content);
        alert('Plantilla guardada: ' + content.substring(0, 100) + '...');
      };
    }
    
    const previewBtn = qs('#preview-template');
    if (previewBtn) {
      previewBtn.onclick = function() {
        const canvas = qs('#ce-canvas');
        const content = canvas ? canvas.innerHTML : '';
        const newWindow = window.open('', '_blank', 'width=800,height=600');
        newWindow.document.write(`
          <html>
            <head>
              <title>Vista Previa</title>
              <style>
                body { font-family: Arial; padding: 20px; }
                .doc { max-width: 21cm; margin: 0 auto; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ddd; padding: 8px; }
                th { background: #f5f5f5; }
              </style>
            </head>
            <body>${content}</body>
          </html>
        `);
        newWindow.document.close();
      };
    }
    
    console.log('✅ Editor Visual inicializado correctamente');
  });
})();