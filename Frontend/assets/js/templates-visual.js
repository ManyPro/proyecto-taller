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
      toolbar.style.cssText = 'padding: 10px; background: #f5f5f5; border: 1px solid #ddd; margin-bottom: 10px; display: flex; gap: 8px; flex-wrap: wrap;';
      
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
    `;

    // Setup new button handlers
    qs('#add-title-btn').onclick = () => addElement('title');
    qs('#add-text-btn').onclick = () => addElement('text');
    qs('#add-image-btn').onclick = () => addElement('image');
    qs('#add-table-btn').onclick = () => addElement('table');
    qs('#clear-canvas-btn').onclick = clearCanvas;
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

    element.onmousedown = (e) => {
      if (e.target.contentEditable === 'true' && e.target !== element) return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = element.getBoundingClientRect();
      const canvasRect = element.parentElement.getBoundingClientRect();
      initialX = rect.left - canvasRect.left;
      initialY = rect.top - canvasRect.top;
      
      element.style.zIndex = '1000';
      selectElement(element);
      e.preventDefault();
    };

    document.onmousemove = (e) => {
      if (!isDragging || visualEditor.draggedElement !== element) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      element.style.left = (initialX + deltaX) + 'px';
      element.style.top = (initialY + deltaY) + 'px';
    };

    document.onmouseup = () => {
      if (isDragging) {
        isDragging = false;
        element.style.zIndex = '1';
        visualEditor.draggedElement = null;
      }
    };

    element.onmousedown = (e) => {
      visualEditor.draggedElement = element;
      element.onmousedown(e);
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
    });

    visualEditor.selectedElement = element;

    if (element) {
      element.style.border = '2px solid #2563eb';
      showElementProperties(element);
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
      contentElement.style.textAlign = align;
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
    }

    if (deleteBtn) {
      deleteBtn.onclick = () => {
        element.remove();
        visualEditor.elements = visualEditor.elements.filter(el => el.element !== element);
        selectElement(null);
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
          const img = document.createElement('img');
          img.src = e.target.result;
          img.style.cssText = 'max-width: 100%; height: auto; display: block; cursor: pointer;';
          
          // Make image resizable
          img.onclick = () => {
            const newWidth = prompt('Ancho en px (actual: ' + img.offsetWidth + ')', img.offsetWidth);
            if (newWidth && !isNaN(newWidth)) {
              img.style.width = newWidth + 'px';
              img.style.height = 'auto';
            }
          };
          
          placeholder.replaceWith(img);
          
          // Restore input functionality after image upload
          setTimeout(() => {
            if (window.restoreInputFunctionality) {
              window.restoreInputFunctionality();
            }
          }, 200);
          
          console.log('Imagen agregada. Haz clic en ella para cambiar tamaño.');
        };
        
        reader.readAsDataURL(file);
      };
      
      input.click();
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

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    console.log('🎨 Inicializando Editor Visual Completo...');
    
    setupVisualEditor();
    setupVariables();
    
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