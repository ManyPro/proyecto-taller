// Editor Visual de Plantillas Completo para templates.html
// Sistema drag & drop con propiedades de texto, imágenes y elementos

(function(){
  const state = {
    templates: [],
    editing: null,
    mode: 'visual',
  safeMargins: { enabled: false, insetCm: 0.2 },
    exampleSnippets: {
      invoice: '', // Will be created dynamically with individual elements
      
      quote: `<!-- Cotización Completa -->
<div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background: white;">
  <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #28a745; padding-bottom: 15px;">
    <h1 style="color: #28a745; margin: 0; font-size: 28px;">COTIZACIÓN</h1>
    <h2 style="color: #333; margin: 5px 0; font-size: 20px;"># COT-2024-00289</h2>
  </div>
  
  <div style="display: flex; justify-content: space-between; margin-bottom: 25px;">
    <div style="flex: 1;">
      <h3 style="color: #28a745; margin: 0 0 10px 0;">TALLER AUTOMOTRIZ PÉREZ</h3>
      <p style="margin: 3px 0; color: #333;">Calle Principal #123, Centro</p>
      <p style="margin: 3px 0; color: #333;">Tel: (555) 123-4567</p>
      <p style="margin: 3px 0; color: #333;">contacto@tallerperez.com</p>
    </div>
    <div style="flex: 1; text-align: right;">
      <h3 style="color: #333; margin: 0 0 10px 0;">CLIENTE:</h3>
      <p style="margin: 3px 0; font-weight: bold;">María García López</p>
      <p style="margin: 3px 0; color: #333;">Tel: (555) 456-7890</p>
      <p style="margin: 3px 0; color: #333;">Fecha: 08/10/2024</p>
      <p style="margin: 3px 0; color: #333;">Válida hasta: 15/10/2024</p>
    </div>
  </div>

  <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #28a745;">
    <h3 style="color: #333; margin: 0 0 10px 0;">VEHÍCULO A REPARAR:</h3>
    <p style="margin: 5px 0;"><strong>Placa:</strong> XYZ-456</p>
    <p style="margin: 5px 0;"><strong>Marca/Modelo:</strong> Honda Civic 2018</p>
    <p style="margin: 5px 0;"><strong>Problema reportado:</strong> Ruido en frenos y cambio de aceite</p>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
    <thead>
      <tr style="background: #28a745; color: white;">
        <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Cant.</th>
        <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Descripción del Servicio/Repuesto</th>
        <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Precio Unit.</th>
        <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border: 1px solid #ddd; padding: 10px;">1</td>
        <td style="border: 1px solid #ddd; padding: 10px;">Cambio de pastillas de freno delanteras</td>
        <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">$1,200.00</td>
        <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">$1,200.00</td>
      </tr>
      <tr style="background: #f8f9fa;">
        <td style="border: 1px solid #ddd; padding: 10px;">1</td>
        <td style="border: 1px solid #ddd; padding: 10px;">Cambio de aceite motor 5W-30 (incluye filtro)</td>
        <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">$650.00</td>
        <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">$650.00</td>
      </tr>
      <tr>
        <td style="border: 1px solid #ddd; padding: 10px;">2</td>
        <td style="border: 1px solid #ddd; padding: 10px;">Revisión y limpieza de discos de freno</td>
        <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">$350.00</td>
        <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">$700.00</td>
      </tr>
      <tr style="background: #f8f9fa;">
        <td style="border: 1px solid #ddd; padding: 10px;">1</td>
        <td style="border: 1px solid #ddd; padding: 10px;">Revisión general del sistema de frenos</td>
        <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">$400.00</td>
        <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">$400.00</td>
      </tr>
    </tbody>
  </table>

  <div style="text-align: right; margin-top: 20px;">
    <div style="display: inline-block; background: #e8f5e8; padding: 15px; border-radius: 8px; min-width: 280px; border: 1px solid #28a745;">
      <p style="margin: 5px 0; display: flex; justify-content: space-between;"><span>Subtotal:</span><span>$2,950.00</span></p>
      <p style="margin: 5px 0; display: flex; justify-content: space-between;"><span>Mano de obra:</span><span>$800.00</span></p>
      <p style="margin: 5px 0; display: flex; justify-content: space-between;"><span>IVA (16%):</span><span>$600.00</span></p>
      <hr style="margin: 10px 0; border: 1px solid #28a745;">
      <p style="margin: 5px 0; display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; color: #28a745;"><span>TOTAL:</span><span>$4,350.00</span></p>
    </div>
  </div>

  <div style="margin-top: 30px; background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffc107;">
    <h4 style="color: #856404; margin: 0 0 10px 0;">CONDICIONES:</h4>
    <ul style="color: #856404; margin: 0; padding-left: 20px;">
      <li>Cotización válida por 7 días</li>
      <li>Tiempo estimado de reparación: 2-3 días</li>
      <li>Garantía de 6 meses en repuestos y 30 días en mano de obra</li>
      <li>Precios sujetos a cambios sin previo aviso</li>
    </ul>
  </div>
</div>`,

      workOrder: `<!-- Orden de Trabajo Completa -->
<div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background: white;">
  <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #fd7e14; padding-bottom: 15px;">
    <h1 style="color: #fd7e14; margin: 0; font-size: 28px;">ORDEN DE TRABAJO</h1>
    <h2 style="color: #333; margin: 5px 0; font-size: 20px;"># OT-2024-00445</h2>
  </div>
  
  <div style="display: flex; justify-content: space-between; margin-bottom: 25px;">
    <div style="flex: 1;">
      <h3 style="color: #fd7e14; margin: 0 0 10px 0;">TALLER AUTOMOTRIZ PÉREZ</h3>
      <p style="margin: 3px 0; color: #333;">Calle Principal #123, Centro</p>
      <p style="margin: 3px 0; color: #333;">Tel: (555) 123-4567</p>
    </div>
    <div style="flex: 1; text-align: right;">
      <p style="margin: 3px 0; color: #333;"><strong>Fecha inicio:</strong> 08/10/2024</p>
      <p style="margin: 3px 0; color: #333;"><strong>Fecha estimada:</strong> 10/10/2024</p>
      <p style="margin: 3px 0; color: #333;"><strong>Estado:</strong> <span style="color: #28a745; font-weight: bold;">EN PROCESO</span></p>
    </div>
  </div>

  <div style="display: flex; gap: 20px; margin-bottom: 25px;">
    <div style="flex: 1; background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffc107;">
      <h3 style="color: #856404; margin: 0 0 10px 0;">DATOS DEL CLIENTE</h3>
      <p style="margin: 5px 0;"><strong>Nombre:</strong> Roberto Sánchez</p>
      <p style="margin: 5px 0;"><strong>Teléfono:</strong> (555) 321-9876</p>
      <p style="margin: 5px 0;"><strong>Email:</strong> roberto.sanchez@email.com</p>
    </div>
    <div style="flex: 1; background: #d1ecf1; padding: 15px; border-radius: 8px; border: 1px solid #17a2b8;">
      <h3 style="color: #0c5460; margin: 0 0 10px 0;">DATOS DEL VEHÍCULO</h3>
      <p style="margin: 5px 0;"><strong>Placa:</strong> DEF-789</p>
      <p style="margin: 5px 0;"><strong>Marca:</strong> Nissan Sentra 2019</p>
      <p style="margin: 5px 0;"><strong>Kilometraje:</strong> 45,680 km</p>
    </div>
  </div>

  <div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #dc3545;">
    <h3 style="color: #721c24; margin: 0 0 10px 0;">PROBLEMA REPORTADO:</h3>
    <p style="margin: 0; color: #721c24;">El cliente reporta que el vehículo hace ruido extraño al frenar y siente vibración en el volante. Además solicita mantenimiento preventivo.</p>
  </div>

  <h3 style="color: #fd7e14; margin: 20px 0 15px 0; border-bottom: 2px solid #fd7e14; padding-bottom: 5px;">SERVICIOS A REALIZAR:</h3>
  
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
    <thead>
      <tr style="background: #fd7e14; color: white;">
        <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Servicio</th>
        <th style="border: 1px solid #ddd; padding: 12px; text-align: center;">Técnico Asignado</th>
        <th style="border: 1px solid #ddd; padding: 12px; text-align: center;">Estado</th>
        <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Costo</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border: 1px solid #ddd; padding: 12px;">
          <strong>Inspección y reparación del sistema de frenos</strong><br>
          <small style="color: #555;">Incluye revisión de pastillas, discos, líquido y mangueras</small>
        </td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">
          <strong style="color: #fd7e14;">Carlos Mendoza</strong><br>
          <small style="color: #555;">Especialista en frenos</small>
        </td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">
          <span style="background: #ffc107; color: white; padding: 3px 8px; border-radius: 12px; font-size: 12px;">EN PROCESO</span>
        </td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">$1,850.00</td>
      </tr>
      <tr style="background: #f8f9fa;">
        <td style="border: 1px solid #ddd; padding: 12px;">
          <strong>Mantenimiento preventivo completo</strong><br>
          <small style="color: #555;">Cambio de aceite, filtros, revisión de niveles y sistemas</small>
        </td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">
          <strong style="color: #fd7e14;">Miguel Torres</strong><br>
          <small style="color: #555;">Mecánico general</small>
        </td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">
          <span style="background: #6c757d; color: white; padding: 3px 8px; border-radius: 12px; font-size: 12px;">PENDIENTE</span>
        </td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">$950.00</td>
      </tr>
    </tbody>
  </table>

  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
    <div style="flex: 1; margin-right: 20px;">
      <h4 style="color: #fd7e14; margin: 0 0 10px 0;">OBSERVACIONES TÉCNICAS:</h4>
      <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; border-left: 4px solid #fd7e14;">
        <p style="margin: 5px 0; font-size: 14px;">• Pastillas delanteras al 20% de vida útil</p>
        <p style="margin: 5px 0; font-size: 14px;">• Discos con ligeras marcas de desgaste</p>
        <p style="margin: 5px 0; font-size: 14px;">• Líquido de frenos en buen estado</p>
        <p style="margin: 5px 0; font-size: 14px;">• Aceite motor vencido (último cambio hace 8 meses)</p>
      </div>
    </div>
    
    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; min-width: 250px; border: 1px solid #ffc107;">
      <h4 style="color: #856404; margin: 0 0 10px 0;">RESUMEN DE COSTOS:</h4>
      <p style="margin: 5px 0; display: flex; justify-content: space-between;"><span>Mano de obra:</span><span>$1,200.00</span></p>
      <p style="margin: 5px 0; display: flex; justify-content: space-between;"><span>Repuestos:</span><span>$1,600.00</span></p>
      <hr style="margin: 10px 0; border: 1px solid #ffc107;">
      <p style="margin: 5px 0; display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; color: #fd7e14;"><span>TOTAL ESTIMADO:</span><span>$2,800.00</span></p>
    </div>
  </div>

  <div style="margin-top: 25px; text-align: center; border-top: 2px solid #fd7e14; padding-top: 15px;">
    <p style="color: #333; margin: 5px 0;"><strong>Responsable:</strong> Ing. Juan Pérez - Supervisor de Taller</p>
    <p style="color: #333; margin: 5px 0; font-size: 12px;">Cualquier cambio o trabajo adicional será consultado previamente con el cliente</p>
  </div>
</div>`,

      sticker: `<!-- Sticker Compacto -->
<div style="width: 5cm; height: 3cm; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 8px; font-family: Arial, sans-serif; font-size: 10px; display: flex; flex-direction: column; justify-content: space-between; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
  <div style="text-align: center;">
    <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px;">TALLER PÉREZ</div>
    <div style="font-size: 8px; opacity: 0.9;"># OT-445 | 08/10/24</div>
  </div>
  
  <div style="font-size: 9px; line-height: 1.1;">
    <div style="margin: 1px 0;">• Frenos: $1,850</div>
    <div style="margin: 1px 0;">• Mantenimiento: $950</div>
  </div>
  
  <div style="text-align: center; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 3px; font-size: 8px;">
    <div style="font-weight: bold;">NISSAN SENTRA • DEF-789</div>
  </div>
</div>`
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
  function getActiveParent(){
    const canvas = qs('#ce-canvas');
    if (!canvas) return null;
    if (typeof state !== 'undefined' && state.pages && state.pages.count > 1) {
      const page = getPageEl(state.pages.current);
      return page || canvas;
    }
    return canvas;
  }
  function getSafeInsetPx(){
    if (!state.safeMargins || !state.safeMargins.enabled) return 0;
    return Math.round((state.safeMargins.insetCm || 0.2) * 37.795275591);
  }

  // Setup visual editor functionality
  function setupVisualEditor() {
    console.log('Configurando editor visual...');
    
    let canvas = qs('#ce-canvas');
    
    if (!canvas) {
      console.warn('Canvas #ce-canvas no encontrado, creando uno nuevo');
      
      // Create canvas if it doesn't exist
      const container = qs('#custom-editor') || qs('body');
      canvas = document.createElement('div');
      canvas.id = 'ce-canvas';
      canvas.className = 'ce-canvas';
      container.appendChild(canvas);
    }

    // Make canvas suitable for visual editing (theme-aware)
    canvas.style.cssText = `
      border: 2px dashed var(--border);
      padding: 0;
      position: relative;
      background: var(--card);
      color: var(--text);
      overflow: hidden; /* Evita que los elementos se vean fuera del canvas */
      border-radius: 8px;
      margin: 10px 0;
    `;

    // Clear default content and make it not contenteditable (we'll handle that per element)
    canvas.contentEditable = 'false';
    canvas.innerHTML = '<div style="color: #999; text-align: center; padding: 50px; pointer-events: none;">Haz clic en los botones de arriba para agregar elementos</div>';

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
    
    // First, create buttons if they don't exist
    createEditorButtons();
    
    // Then setup handlers
    const addTextBtn = qs('#add-text-btn');
    const addTitleBtn = qs('#add-title-btn');
    const addImageBtn = qs('#add-image-btn');
    const addTableBtn = qs('#add-table-btn');
    
    console.log('Botones encontrados:', {
      text: !!addTextBtn,
      title: !!addTitleBtn, 
      image: !!addImageBtn,
      table: !!addTableBtn
    });
    
    if (addTextBtn) addTextBtn.onclick = () => addElement('text');
    if (addTitleBtn) addTitleBtn.onclick = () => addElement('title');
    if (addImageBtn) addImageBtn.onclick = () => addElement('image');
    if (addTableBtn) addTableBtn.onclick = () => addElement('table');
    
    // Items table button
    const addItemsTableBtn = qs('#add-items-table-btn');
    if (addItemsTableBtn) {
      addItemsTableBtn.onclick = () => addItemsTable();
    }
    
    console.log('✅ Manejadores de botones configurados');
  }

  function createEditorButtons() {
    console.log('Creando botones del editor...');
    
  // Find existing toolbar or create one
    let toolbar = qs('#ce-toolbar') || qs('.ce-toolbar') || qs('.editor-toolbar') || qs('.toolbar');
    
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'ce-toolbar';
      toolbar.className = 'ce-toolbar editor-toolbar';
      
      // Insert before canvas
      const canvas = qs('#ce-canvas');
      const container = qs('#custom-editor') || canvas?.parentNode || document.body;
      
      if (canvas) {
        container.insertBefore(toolbar, canvas);
      } else {
        container.appendChild(toolbar);
      }
    }
    
  // Apply styles (theme-aware)
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
        <button id="undo-btn" class="toolbar-btn warn" style="opacity:.7;" disabled title="Deshacer última eliminación">↩️ Deshacer</button>
        <button id="clear-canvas-btn" class="toolbar-btn secondary">🧹 Limpiar Todo</button>
        <button id="toggle-safe-guides-btn" class="toolbar-btn secondary" title="Mostrar/Ocultar guías de margen">${(state.safeMargins && state.safeMargins.enabled) ? '🧭 Guías: ON' : '🧭 Guías: OFF'}</button>
      </div>
      

      
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
    qs('#add-items-table-btn').onclick = () => addItemsTable();
    
    // Delete button handler
    qs('#delete-selected-btn').onclick = () => {
      if (visualEditor.selectedElement) {
        if (confirm('¿Estás seguro de que quieres eliminar el elemento seleccionado?')) {
          deleteElementSafely(visualEditor.selectedElement);
        }
      }
    };

    // Safe guides toggle
    const toggleGuidesBtn = qs('#toggle-safe-guides-btn');
    if (toggleGuidesBtn) {
      toggleGuidesBtn.onclick = () => {
        state.safeMargins.enabled = !state.safeMargins.enabled;
        updateSafeGuidesVisibility();
        toggleGuidesBtn.textContent = state.safeMargins.enabled ? '🧭 Guías: ON' : '🧭 Guías: OFF';
      };
    }
    
    qs('#clear-canvas-btn').onclick = clearCanvas;
    
    // Undo button handler
    qs('#undo-btn').onclick = () => {
      if (visualEditor.lastDeletedElement) {
        restoreDeletedElement();
      }
    };
    
    // Template loading handlers removed - templates now auto-load based on document type
    
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
      
      // Force explicit dimensions and override any CSS min-constraints from the page stylesheet
      canvas.style.width = widthPx + 'px';
      canvas.style.height = heightPx + 'px';
      canvas.style.maxWidth = widthPx + 'px';
      canvas.style.maxHeight = heightPx + 'px';
      canvas.style.minWidth = widthPx + 'px';
      canvas.style.minHeight = heightPx + 'px';
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

      // If the canvas is wide (e.g. Carta), move the variables panel below to free horizontal space
      const container = qs('.template-editor-container');
      if (container) {
        if (widthCm >= 21) {
          container.classList.add('sidebar-bottom');
        } else {
          container.classList.remove('sidebar-bottom');
        }
      }
      
      console.log(`Canvas redimensionado: ${sizeName} (${widthCm} x ${heightCm} cm = ${widthPx} x ${heightPx} px)`);

      // Update safe guides if present
      updateSafeGuidesVisibility();
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

  // ======== SAFE MARGIN GUIDES ========
  function buildSafeGuideForPage(pageEl) {
    if (!pageEl) return;
    // remove existing
    const old = pageEl.querySelector('.safe-guide');
    if (old) old.remove();

    const insetCm = (state.safeMargins && typeof state.safeMargins.insetCm === 'number') ? state.safeMargins.insetCm : 0.2;
    const guide = document.createElement('div');
    guide.className = 'safe-guide';
    guide.style.cssText = `position:absolute; left:${insetCm}cm; top:${insetCm}cm; right:${insetCm}cm; bottom:${insetCm}cm; border:1px dashed rgba(37,99,235,.6); border-radius:3px; pointer-events:none;`;
    pageEl.appendChild(guide);
  }

  function updateSafeGuidesVisibility() {
    const container = qs('[data-pages-container="true"]');
    if (!container) return;
    const pages = container.querySelectorAll('.editor-page');
    pages.forEach(p => {
      // ensure built
      if (!p.querySelector('.safe-guide')) buildSafeGuideForPage(p);
      const g = p.querySelector('.safe-guide');
      if (g) g.style.display = (state.safeMargins && state.safeMargins.enabled) ? 'block' : 'none';
    });
  }

  function addElement(type) {
  const parent = getActiveParent();
    if (!parent) return;

    // Clear placeholder text
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
  // Base style for interactive blocks; padding/min-sizes are adjusted per type (images need tight boxes)
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
        // Tighten wrapper to image size: no padding or min-size so the selection box matches the image
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
    // Rotation state/handle
    let isRotating = false;
    let rotateHandle = null;
    let startAngleRad = 0;
    let startRotationDeg = 0;
    let centerX = 0, centerY = 0;

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

    // Rotation handle creation
    const doRotate = (e) => {
      if (!isRotating) return;
      const currentAngleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const deltaDeg = (currentAngleRad - startAngleRad) * (180 / Math.PI);
      const newDeg = startRotationDeg + deltaDeg;
      setRotationDeg(element, newDeg);
      // Sync rotation UI if visible
      const rotRange = document.querySelector('#prop-rotate');
      const rotInput = document.querySelector('#prop-rotate-input');
      if (rotRange) rotRange.value = String(getRotationDeg(element));
      if (rotInput) rotInput.value = String(getRotationDeg(element));
      e.preventDefault();
    };
    const endRotate = () => {
      if (isRotating) {
        isRotating = false;
        if (rotateHandle) rotateHandle.style.cursor = 'grab';
        // Hide handle on end to reduce clutter if mouse has left
        if (rotateHandle && !element.matches(':hover')) rotateHandle.style.display = 'none';
      }
      document.removeEventListener('mousemove', doRotate);
      document.removeEventListener('mouseup', endRotate);
    };
    const startRotate = (e) => {
      // Avoid triggering drag
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
        background: #10b981; /* emerald */
        border: 2px solid white;
        border-radius: 50%;
        cursor: grab;
        display: none;
        z-index: 1001;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `;
      // Add a small rotate indicator glyph
      rotateHandle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" style="pointer-events:none; margin:1px; fill:white"><path d="M7.1 7.1A7 7 0 0 1 19 12h2a9 9 0 1 0-2.64 6.36l-1.42-1.42A7 7 0 1 1 7.1 7.1zM13 3v6h6l-2.24-2.24A7.97 7.97 0 0 0 13 3z"/></svg>';
      element.appendChild(rotateHandle);
      rotateHandle.addEventListener('mousedown', startRotate);
      return rotateHandle;
    };

    // Show/hide drag handle on selection
    element.addEventListener('mouseenter', () => {
      if (!dragHandle) dragHandle = createDragHandle();
      if (!rotateHandle) rotateHandle = createRotateHandle();
      if (visualEditor.selectedElement === element) {
        dragHandle.style.display = 'block';
        rotateHandle.style.display = 'block';
      }
    });

    element.addEventListener('mouseleave', () => {
      if (dragHandle && !isDragging) {
        dragHandle.style.display = 'none';
      }
      if (rotateHandle && !isRotating) {
        rotateHandle.style.display = 'none';
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
      
      // Keep element within canvas or safe guides bounds (hold Alt to bypass temporarily)
      const canvas = element.parentElement;
      const canvasRect = canvas.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      // Determine bounds: if guides enabled and present, use its inset; else use full canvas
      const skipClamp = e.altKey === true;
      let insetPx = 0;
      if (!skipClamp && state.safeMargins && state.safeMargins.enabled) {
        insetPx = getSafeInsetPx();
      }

      let minLeft = insetPx;
      let minTop = insetPx;
      let maxLeft = canvasRect.width - elementRect.width - insetPx;
      let maxTop = canvasRect.height - elementRect.height - insetPx;

      // If element is bigger than safe area, fall back to clamping within full canvas
      if (maxLeft < minLeft || maxTop < minTop) {
        minLeft = 0; minTop = 0;
        maxLeft = canvasRect.width - elementRect.width;
        maxTop = canvasRect.height - elementRect.height;
      }

      const finalLeft = skipClamp ? newLeft : Math.max(minLeft, Math.min(newLeft, maxLeft));
      const finalTop = skipClamp ? newTop : Math.max(minTop, Math.min(newTop, maxTop));
      element.style.left = finalLeft + 'px';
      element.style.top = finalTop + 'px';
      
      e.preventDefault();
    };

    const endDrag = () => {
      if (isDragging) {
        isDragging = false;
  // Restore z-index so it doesn't keep blocking clicks on other elements
  element.style.zIndex = '';
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
      // Si el click fue sobre un nodo de texto editable, preferir ese
      const preferred = e.target && (e.target.closest('[contenteditable="true"]'));
      selectElement(element, preferred || null);
    };
  }

  // ======== ROTATION HELPERS ========
  function getRotationDeg(el){
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
    // Try computed style (matrix to deg is complex; skip)
    return 0;
  }
  function setRotationDeg(el, deg){
    if (!el) return;
    const d = Math.max(-180, Math.min(180, Math.round(deg)));
    // Preserve only rotation for simplicity; left/top are absolute
    el.style.transform = `rotate(${d}deg)`;
    el.style.transformOrigin = 'center center';
    if (!el.dataset) el.dataset = {};
    el.dataset.rotationDeg = String(d);
  }

  function selectElement(element, preferredTextEl=null) {
    // Remove previous selection
    document.querySelectorAll('.tpl-element').forEach(el => {
      el.style.border = '2px solid transparent';
      el.style.boxShadow = 'none';
      // Hide any resize handles and drag handles on non-selected elements
      const imgContainer = el.querySelector('.image-container');
      if (imgContainer) {
        const handles = imgContainer.querySelectorAll('.resize-handle');
        handles.forEach(h => h.style.display = 'none');
      }
      const dh = el.querySelector('.drag-handle');
      if (dh) dh.style.display = 'none';
      const rh = el.querySelector('.rotate-handle');
      if (rh) rh.style.display = 'none';
    });

    visualEditor.selectedElement = element;
    visualEditor.selectedTextElement = preferredTextEl || null;

    // Update variables panel indicator
    updateVariablesSelectionIndicator();

    // Update delete button state
    updateDeleteButtonState(element);

    if (element) {
      element.style.border = '2px solid #2563eb';
      element.style.boxShadow = '0 0 0 1px rgba(37, 99, 235, 0.2)';
  showElementProperties(element, preferredTextEl || null);
      

    } else {
      hideElementProperties();
    }
  }

  function showElementProperties(element, preferredTextEl=null) {
    const propertiesPanel = qs('#element-properties') || createPropertiesPanel();
    if (!propertiesPanel) return;
    const bodyContainer = qs('#element-properties-body') || propertiesPanel;

    // Construir lista de textos editables dentro del elemento
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
      const w = parseInt((element.style.width || element.offsetWidth) ,10);
      const h = parseInt((element.style.height || element.offsetHeight) ,10);
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

          <!-- Caja y overflow -->
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

          <!-- Controles específicos de imagen (QR) -->
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

      // Si hay múltiples textos, permitir cambiar el destino desde el selector
      const nodeSelect = qs('#prop-text-node');
      if (nodeSelect) {
        nodeSelect.onchange = () => {
          const idx = parseInt(nodeSelect.value, 10);
          const newEl = textNodes[idx];
          // Re-render propiedades para el nuevo nodo
          showElementProperties(element, newEl);
        };
      }
    }
    // Expandir panel al mostrar
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
    // Ubicar el panel en el sidebar, bien arriba de todo, con header colapsable
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

        // Toggle collapse
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
      // Insertar al inicio del sidebar
      if (sidebar.firstChild) sidebar.insertBefore(panel, sidebar.firstChild); else sidebar.appendChild(panel);
      return panel;
    }
    // Fallback: si no hay sidebar, crear uno flotante (caso raro)
    const float = document.createElement('div');
    float.style.cssText = 'position: fixed; right: 10px; top: 100px; width: 260px; max-height: 80vh; overflow-y: auto; z-index: 1000;';
    const panel = document.createElement('div');
    panel.id = 'element-properties';
    panel.style.cssText = 'display:none; margin:0 0 12px 0;';
    float.appendChild(panel);
    document.body.appendChild(float);
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

    // Box sizing and overflow
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

    // Rotation controls
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

    // Image width control
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
          } catch (_) {
            // Ignore unsupported mime conversions
          }
        }

        resolve(best);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
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
        reader.onload = async (event) => {
          const rawDataUrl = event?.target?.result;
          if (typeof rawDataUrl !== 'string') {
            alert('El archivo seleccionado no se pudo leer correctamente.');
            return;
          }

          const optimizedSrc = await optimizeImageDataUrl(rawDataUrl);
          if (optimizedSrc !== rawDataUrl) {
            console.log(`Imagen reducida antes de insertar (${Math.round(rawDataUrl.length / 1024)} KB → ${Math.round(optimizedSrc.length / 1024)} KB)`);
          }

          const imgContainer = document.createElement('div');
          imgContainer.className = 'image-container';
          // Tight box around the image with no padding/margins; size follows the image exactly
          imgContainer.style.cssText = 'position: relative; display: inline-block; padding:0; margin:0; line-height:0;';
          
          const img = document.createElement('img');
          img.src = optimizedSrc;
          img.style.cssText = 'width:150px; height:auto; display:block; user-select:none; margin:0; padding:0;';
          img.draggable = false;
          img.onload = () => {
            try {
              imgContainer.style.width = img.naturalWidth + 'px';
              imgContainer.style.height = img.naturalHeight + 'px';
            } catch (_) {
              // Ignore sizing issues
            }
          };
          
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
    const updateHandles = () => {
      const shouldShow = !!(visualEditor.selectedElement && visualEditor.selectedElement.contains(container));
      Object.values(handleElements).forEach(h => h.style.display = shouldShow ? 'block' : 'none');
      // Ensure container hugs image size (no extra whitespace)
      try {
        container.style.width = img.offsetWidth + 'px';
        container.style.height = img.offsetHeight + 'px';
      } catch(_) {}
    };

    // Update on selection polling (lightweight)
    const selectionInterval = setInterval(updateHandles, 150);
    container.addEventListener('mouseenter', updateHandles);
    container.addEventListener('mouseleave', updateHandles);
    
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

      // Calculate new dimensions based on handle position (free resize)
      switch(position) {
        case 'se': // Bottom-right
          newWidth  = startWidth  + deltaX;
          newHeight = startHeight + deltaY;
          break;
        case 'sw': // Bottom-left
          newWidth  = startWidth  - deltaX;
          newHeight = startHeight + deltaY;
          break;
        case 'ne': // Top-right
          newWidth  = startWidth  + deltaX;
          newHeight = startHeight - deltaY;
          break;
        case 'nw': // Top-left
          newWidth  = startWidth  - deltaX;
          newHeight = startHeight - deltaY;
          break;
      }

      // If Shift is held, preserve aspect ratio using the dominant delta
      if (e.shiftKey) {
        // Choose dimension change with larger absolute variation
        if (Math.abs(newWidth - startWidth) >= Math.abs(newHeight - startHeight)) {
          newHeight = Math.round(newWidth / aspectRatio);
        } else {
          newWidth = Math.round(newHeight * aspectRatio);
        }
      }
      
      // Apply minimum and maximum constraints
      const minSize = 20;
      const maxSize = 800;
      
      newWidth = Math.max(minSize, Math.min(newWidth, maxSize));
      newHeight = Math.max(minSize, Math.min(newHeight, maxSize));

      img.style.width = newWidth + 'px';
      img.style.height = newHeight + 'px';
      // Keep container and parent element sized to the image for tight hitbox
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
    // Si hay varias páginas (stickers brand), limpiar solo la página actual
    if (state.pages && state.pages.count > 1) {
      const currentPage = getPageEl(state.pages.current);
      if (currentPage) {
        // Eliminar elementos de esa página del array y DOM
        visualEditor.elements = visualEditor.elements.filter(rec => {
          if (currentPage.contains(rec.element)) {
            try {
              const imageContainer = rec.element.querySelector && rec.element.querySelector('.image-container');
              if (imageContainer && imageContainer._resizeCleanup) imageContainer._resizeCleanup();
              if (rec.element._dragCleanup) rec.element._dragCleanup();
            } catch(_) {}
            rec.element.remove();
            return false;
          }
          return true;
        });
        currentPage.innerHTML = `<div id="ce-placeholder-page" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:#666; font-size:12px; padding:6px; pointer-events:none;">
          <div style="font-size:26px; margin-bottom:6px;">🧩</div>
          <div style="font-weight:600; margin-bottom:4px;">Página vacía</div>
          <div style="opacity:.8;">Agrega elementos con los botones de la barra</div>
        </div>`;
        selectElement(null);
        showQuickNotification('Página actual limpiada', 'info');
        return;
      }
    }

    // Limpieza completa (modo no paginado)
    canvas.innerHTML = `
      <div id="ce-placeholder" style="
        position: absolute; 
        top: 50%; 
        left: 50%; 
        transform: translate(-50%, -50%);
        text-align: center;
        color: #666;
        padding: 30px;
        border: 2px dashed #ccc;
        border-radius: 12px;
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        max-width: 400px;
        pointer-events: none;
        z-index: 0;
      ">
        <div style="font-size: 48px; margin-bottom: 15px;">📝</div>
        <h3 style="margin: 0 0 10px 0; color: #495057;">Tu plantilla está vacía</h3>
        <p style="margin: 0 0 15px 0; font-size: 14px; line-height: 1.4;">
          Agrega elementos usando los botones de arriba o<br>
          haz clic en las variables de la derecha para crear contenido automáticamente
        </p>
        <div style="display: flex; gap: 10px; justify-content: center; align-items: center; font-size: 12px; color: #6c757d;">
          <span>💡</span>
          <span>Tip: Selecciona un elemento para editarlo</span>
        </div>
      </div>
    `;
    visualEditor.elements.forEach(rec => {
      try {
        const imageContainer = rec.element.querySelector && rec.element.querySelector('.image-container');
        if (imageContainer && imageContainer._resizeCleanup) imageContainer._resizeCleanup();
        if (rec.element._dragCleanup) rec.element._dragCleanup();
      } catch(_) {}
    });
    visualEditor.elements = [];
    visualEditor.selectedElement = null;
    selectElement(null);
    showQuickNotification('Canvas limpiado completamente', 'info');
    updateClearCanvasButtonLabel();
  }

  function loadTemplate(templateType) {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;

    // Clear current canvas
    clearCanvas();

    // Set appropriate canvas size based on template
    const sizeSelect = qs('#canvas-size');
    if (templateType === 'sticker') {
      // Auto-select sticker size
      if (sizeSelect) {
        sizeSelect.value = 'sticker';
        sizeSelect.dispatchEvent(new Event('change'));
      }
    } else {
      // Auto-select letter size for documents
      if (sizeSelect) {
        sizeSelect.value = 'letter';
        sizeSelect.dispatchEvent(new Event('change'));
      }
    }

    // Create template based on type
    if (templateType === 'invoice') {
      createInvoiceTemplate(canvas);
    } else if (templateType === 'quote') {
      createQuoteTemplate(canvas);
    } else if (templateType === 'workOrder') {
      createWorkOrderTemplate(canvas);
    } else {
      // For other templates, use existing snippets
      const template = state.exampleSnippets[templateType];
      if (template) {
        canvas.innerHTML = template;
        setTimeout(() => {
          makeTemplateEditable(canvas);
        }, 100);
      }
    }

    console.log(`Plantilla ${templateType} cargada exitosamente`);
  }

  function createInvoiceTemplate(canvas) {
    if (!canvas) {
      console.error('❌ Canvas no encontrado en createInvoiceTemplate');
      return;
    }
    
    console.log('🎨 Creando plantilla de factura...');
    
    // Clear canvas y resetear estilos
    canvas.innerHTML = '';
    
    // Fondo beige claro (como en la imagen) y altura mínima para mostrar todos los elementos
    // Usar Object.assign para no sobrescribir todos los estilos
    Object.assign(canvas.style, {
      backgroundColor: '#f5f5f0',
      minHeight: '900px',
      height: 'auto',
      position: 'relative',
      overflow: 'visible',
      padding: '20px'
    });
    
    console.log('✅ Canvas configurado, agregando elementos...');
    
    // 1. HEADER - Título "FACTURA" + Nº en caja + Logo
    const headerContainer = document.createElement('div');
    headerContainer.className = 'tpl-element';
    headerContainer.id = `element_${visualEditor.nextId++}`;
    headerContainer.style.cssText = `
      position: absolute;
      left: 40px;
      top: 30px;
      width: 700px;
      height: 80px;
      cursor: move;
    `;
    headerContainer.innerHTML = `
      <div style="display: flex; align-items: flex-start; justify-content: space-between;">
        <div>
          <h1 style="margin: 0; font-size: 48px; font-weight: bold; color: #333; font-family: Arial, sans-serif; letter-spacing: 2px;">FACTURA</h1>
          <div style="margin-top: 8px; padding: 8px 16px; border: 2px solid #333; display: inline-block; background: #fff;">
            <span style="font-size: 16px; font-weight: bold;">Nº: </span>
            <span contenteditable="true" style="font-size: 16px; font-weight: bold;">{{pad sale.number 2}}</span>
          </div>
        </div>
        <div style="width: 60px; height: 60px; display: flex; align-items: center; justify-content: center;">
          <svg width="60" height="60" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M 20 50 L 30 40 L 30 20 L 50 20 L 50 30 L 70 30 L 70 50 L 80 50 L 80 70 L 70 70 L 70 80 L 50 80 L 50 70 L 30 70 L 30 60 L 20 50 Z" 
                  fill="#2563eb" stroke="#1e40af" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="50" cy="50" r="8" fill="#fff"/>
            <path d="M 35 50 L 45 50 M 55 50 L 65 50" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </div>
      </div>
    `;
    makeDraggable(headerContainer);
    makeSelectable(headerContainer);
    canvas.appendChild(headerContainer);
    visualEditor.elements.push({ id: headerContainer.id, type: 'header', element: headerContainer });
    console.log('✅ Header agregado');

    // 2. SECCIÓN DATOS - Cliente (izquierda) y Empresa (derecha)
    const datosSection = document.createElement('div');
    datosSection.className = 'tpl-element';
    datosSection.id = `element_${visualEditor.nextId++}`;
    datosSection.style.cssText = `
      position: absolute;
      left: 40px;
      top: 140px;
      width: 700px;
      cursor: move;
    `;
    datosSection.innerHTML = `
      <div style="display: flex; gap: 20px; border-bottom: 1px solid #ddd; padding-bottom: 20px;">
        <!-- Datos del Cliente -->
        <div style="flex: 1;">
          <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: bold; color: #333; text-transform: uppercase;">DATOS DEL CLIENTE</h3>
          <div style="font-size: 13px; line-height: 1.8; color: #333;">
            <div><strong>Nombre:</strong> <span contenteditable="true">{{sale.customerName}}</span></div>
            <div><strong>Email:</strong> <span contenteditable="true">{{sale.customerEmail}}</span></div>
            <div><strong>Teléfono:</strong> <span contenteditable="true">{{sale.customerPhone}}</span></div>
            <div><strong>Dirección:</strong> <span contenteditable="true">{{sale.customerAddress}}</span></div>
          </div>
        </div>
        
        <!-- Línea divisoria -->
        <div style="width: 1px; background: #ddd; margin: 0 10px;"></div>
        
        <!-- Datos de la Empresa -->
        <div style="flex: 1;">
          <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: bold; color: #333; text-transform: uppercase;">DATOS DE LA EMPRESA</h3>
          <div style="font-size: 13px; line-height: 1.8; color: #333;">
            <div><strong>Nombre:</strong> <span contenteditable="true">{{company.name}}</span></div>
            <div><strong>Email:</strong> <span contenteditable="true">{{company.email}}</span></div>
            <div><strong>Teléfono:</strong> <span contenteditable="true">{{company.phone}}</span></div>
            <div><strong>Dirección:</strong> <span contenteditable="true">{{company.address}}</span></div>
          </div>
        </div>
      </div>
    `;
    makeDraggable(datosSection);
    makeSelectable(datosSection);
    canvas.appendChild(datosSection);
    visualEditor.elements.push({ id: datosSection.id, type: 'datos-section', element: datosSection });
    console.log('✅ Sección de datos agregada');

    // 3. TABLA DE SERVICIOS
    const itemsTable = document.createElement('div');
    itemsTable.className = 'tpl-element items-table';
    itemsTable.id = `element_${visualEditor.nextId++}`;
    itemsTable.style.cssText = `
      position: absolute;
      left: 40px;
      top: 280px;
      width: 700px;
      cursor: move;
    `;
    itemsTable.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; background: #fff;">
        <thead>
          <tr style="background: #f8f8f8; border-bottom: 2px solid #ddd;">
            <th style="padding: 12px; text-align: left; font-weight: bold; font-size: 13px; color: #333; border-bottom: 1px solid #ddd;">Detalle</th>
            <th style="padding: 12px; text-align: center; font-weight: bold; font-size: 13px; color: #333; border-bottom: 1px solid #ddd; width: 100px;">Cantidad</th>
            <th style="padding: 12px; text-align: right; font-weight: bold; font-size: 13px; color: #333; border-bottom: 1px solid #ddd; width: 120px;">Precio</th>
            <th style="padding: 12px; text-align: right; font-weight: bold; font-size: 13px; color: #333; border-bottom: 1px solid #ddd; width: 120px;">Total</th>
          </tr>
        </thead>
        <tbody>
          {{#each sale.items}}
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; font-size: 13px; color: #333;">{{description}}</td>
            <td style="padding: 12px; text-align: center; font-size: 13px; color: #333;">{{qty}}</td>
            <td style="padding: 12px; text-align: right; font-size: 13px; color: #333;">{{money unitPrice}}</td>
            <td style="padding: 12px; text-align: right; font-size: 13px; color: #333; font-weight: 600;">{{money total}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    `;
    makeDraggable(itemsTable);
    makeSelectable(itemsTable);
    canvas.appendChild(itemsTable);
    visualEditor.elements.push({ id: itemsTable.id, type: 'items-table', element: itemsTable });
    console.log('✅ Tabla de items agregada');

    // 4. RESUMEN - IVA y TOTAL
    const summarySection = document.createElement('div');
    summarySection.className = 'tpl-element';
    summarySection.id = `element_${visualEditor.nextId++}`;
    summarySection.style.cssText = `
      position: absolute;
      left: 500px;
      top: 480px;
      width: 240px;
      cursor: move;
    `;
    summarySection.innerHTML = `
      <div style="font-size: 13px; line-height: 2;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: #333;">IVA</span>
          <span style="color: #333; margin: 0 10px;">21%</span>
          <span style="color: #333; font-weight: 600;">{{money sale.tax}}</span>
        </div>
        <div style="margin-top: 12px; padding: 12px; border: 2px solid #333; background: #fff;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: bold; font-size: 14px; color: #333;">TOTAL</span>
            <span style="font-weight: bold; font-size: 16px; color: #333; border: 2px solid #333; padding: 4px 12px;">{{money sale.total}}</span>
          </div>
        </div>
      </div>
    `;
    makeDraggable(summarySection);
    makeSelectable(summarySection);
    canvas.appendChild(summarySection);
    visualEditor.elements.push({ id: summarySection.id, type: 'summary', element: summarySection });
    console.log('✅ Resumen agregado');

    // 5. INFORMACIÓN DE PAGO
    const paymentInfo = document.createElement('div');
    paymentInfo.className = 'tpl-element';
    paymentInfo.id = `element_${visualEditor.nextId++}`;
    paymentInfo.style.cssText = `
      position: absolute;
      left: 40px;
      top: 580px;
      width: 400px;
      cursor: move;
    `;
    paymentInfo.innerHTML = `
      <div style="padding: 16px; border: 2px solid #333; background: #fff;">
        <h3 style="margin: 0 0 12px 0; font-size: 13px; font-weight: bold; color: #333; text-transform: uppercase;">INFORMACIÓN DE PAGO</h3>
        <div style="font-size: 12px; line-height: 1.8; color: #333;">
          <div><strong>Método:</strong> <span contenteditable="true">Transferencia bancaria</span></div>
          <div><strong>Banco:</strong> <span contenteditable="true">{{company.bankName}}</span></div>
          <div><strong>Nombre:</strong> <span contenteditable="true">{{company.name}}</span></div>
          <div><strong>Número de cuenta:</strong> <span contenteditable="true">{{company.accountNumber}}</span></div>
        </div>
      </div>
    `;
    makeDraggable(paymentInfo);
    makeSelectable(paymentInfo);
    canvas.appendChild(paymentInfo);
    visualEditor.elements.push({ id: paymentInfo.id, type: 'payment-info', element: paymentInfo });
    console.log('✅ Información de pago agregada');

    // 6. FOOTER - URL del sitio
    const footer = document.createElement('div');
    footer.className = 'tpl-element';
    footer.id = `element_${visualEditor.nextId++}`;
    footer.style.cssText = `
      position: absolute;
      left: 40px;
      top: 720px;
      width: 700px;
      text-align: center;
      cursor: move;
    `;
    footer.innerHTML = `
      <div style="font-size: 12px; color: #333; font-weight: 600; letter-spacing: 1px;">
        <span contenteditable="true">{{company.website}}</span>
      </div>
    `;
    makeDraggable(footer);
    makeSelectable(footer);
    canvas.appendChild(footer);
    visualEditor.elements.push({ id: footer.id, type: 'footer', element: footer });
    console.log('✅ Footer agregado');

    // Make all elements interactive
    console.log(`✅ Plantilla de factura creada: ${visualEditor.elements.length} elementos agregados`);
    console.log('Elementos:', visualEditor.elements.map(e => e.type));
    
    // Verificar que los elementos estén en el DOM
    const elementsInDOM = canvas.querySelectorAll('.tpl-element');
    console.log(`📊 Elementos en DOM: ${elementsInDOM.length}`);
    
    if (elementsInDOM.length === 0) {
      console.error('❌ ERROR: Los elementos no se agregaron al DOM!');
      console.log('Canvas children:', canvas.children.length);
    }
    
    // Asegurar que el canvas tenga altura suficiente
    if (elementsInDOM.length > 0) {
      const positions = Array.from(elementsInDOM).map(el => {
        const top = parseInt(el.style.top) || 0;
        const height = el.offsetHeight || 0;
        return top + height;
      });
      if (positions.length > 0) {
        const maxTop = Math.max(...positions, 900);
        canvas.style.minHeight = (maxTop + 50) + 'px';
        console.log(`📏 Altura del canvas ajustada a: ${canvas.style.minHeight}`);
      } else {
        canvas.style.minHeight = '900px';
      }
    } else {
      canvas.style.minHeight = '900px';
      console.log('📏 Altura del canvas establecida a 900px (sin elementos)');
    }
    
    // Forzar un pequeño delay para asegurar que el DOM esté actualizado
    setTimeout(() => {
      reinitializeElements();
      console.log('🔄 Reinitialización completada');
    }, 100);
  }

  function createQuoteTemplate(canvas) {
    // Clear canvas - plantilla será creada desde cero
    canvas.innerHTML = '';
    reinitializeElements();
  }

  function createPayrollTemplate(canvas) {
    // Clear canvas - plantilla será creada desde cero
    canvas.innerHTML = '';
    reinitializeElements();
  }

  function createWorkOrderTemplate(canvas) {
    // Clear canvas - plantilla será creada desde cero
    canvas.innerHTML = '';
    reinitializeElements();
  }

  function createEditableElement(type, content, options = {}) {
    const element = document.createElement('div');
    element.className = 'tpl-element';
    element.id = `element_${visualEditor.nextId++}`;
    
    // Default positioning
    const inset = getSafeInsetPx();
    const pos = options.position || { left: (inset || 20), top: (inset || 20) };
    element.style.position = 'absolute';
    element.style.left = pos.left + 'px';
    element.style.top = pos.top + 'px';
    element.style.cursor = 'move';
  element.style.border = '2px solid transparent';
  // No hard minimums; allow resizing down freely
  element.style.minWidth = '0';
  element.style.minHeight = '0';

    // Create content based on type
    let contentElement;
    if (type === 'title') {
      contentElement = document.createElement('h2');
      contentElement.style.margin = '0';
      contentElement.style.fontSize = '24px';
      contentElement.style.fontWeight = 'bold';
    } else {
      contentElement = document.createElement('span');
      contentElement.style.fontSize = '14px';
    }

    contentElement.contentEditable = 'true';
    contentElement.textContent = content;
    contentElement.style.outline = 'none';
    contentElement.style.display = 'block';

    // Apply custom styles
    if (options.styles) {
      Object.assign(contentElement.style, options.styles);
    }

    element.appendChild(contentElement);

    // Make draggable and selectable
    makeDraggable(element);
    makeSelectable(element);

    // Add to elements array
    visualEditor.elements.push({
      id: element.id,
      type: type,
      element: element
    });

    return element;
  }

  function createItemsTableHeader() {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'tpl-element table-header';
    headerDiv.id = `element_${visualEditor.nextId++}`;
    headerDiv.style.cssText = `
      position: absolute;
      background: #2563eb;
      color: white;
      display: flex;
      width: 700px;
      border: 2px solid transparent;
      cursor: move;
    `;

    const columns = [
      { text: 'Cant.', width: '80px' },
      { text: 'Descripción', width: '400px' },
      { text: 'Precio Unit.', width: '120px' },
      { text: 'Total', width: '100px' }
    ];

    columns.forEach(col => {
      const colDiv = document.createElement('div');
      colDiv.contentEditable = 'true';
      colDiv.style.cssText = `
        padding: 12px;
        border-right: 1px solid rgba(255,255,255,0.2);
        width: ${col.width};
        font-weight: bold;
        outline: none;
      `;
      colDiv.textContent = col.text;
      headerDiv.appendChild(colDiv);
    });

    makeDraggable(headerDiv);
    makeSelectable(headerDiv);

    visualEditor.elements.push({
      id: headerDiv.id,
      type: 'table-header',
      element: headerDiv
    });

    return headerDiv;
  }

  function addItemsTable() {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;

    // Clear placeholder text
    if (canvas.innerHTML.includes('Haz clic en los botones')) {
      canvas.innerHTML = '';
    }

    // Create table container
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
      border-radius: 4px;
      overflow: hidden;
    `;

    // Create table HTML with Handlebars variables
    tableContainer.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif;">
        <thead>
          <tr style="background: #2563eb; color: white;">
            <th style="border: 1px solid #ddd; padding: 12px; text-align: left; width: 80px;" contenteditable="true">Cant.</th>
            <th style="border: 1px solid #ddd; padding: 12px; text-align: left;" contenteditable="true">Descripción</th>
            <th style="border: 1px solid #ddd; padding: 12px; text-align: right; width: 120px;" contenteditable="true">Precio Unit.</th>
            <th style="border: 1px solid #ddd; padding: 12px; text-align: right; width: 120px;" contenteditable="true">Total</th>
          </tr>
        </thead>
        <tbody>
          {{#each sale.items}}
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">{{qty}}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">{{description}}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">{{money unitPrice}}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">{{money total}}</td>
          </tr>
          {{/each}}
          <tr style="background: #f8f9fa; font-weight: bold; border-top: 2px solid #333;">
            <td colspan="3" style="border: 1px solid #ddd; padding: 12px; text-align: right; font-size: 16px;">TOTAL:</td>
            <td style="border: 1px solid #ddd; padding: 12px; text-align: right; font-size: 16px; color: #2563eb;">{{money sale.total}}</td>
          </tr>
          <tr>
            <td colspan="4" style="border: 1px solid #ddd; padding: 8px; text-align: center; color: #333; font-size: 12px;">
              Los items aparecerán aquí automáticamente desde la venta
            </td>
          </tr>
        </tbody>
      </table>
    `;

    // Make draggable and selectable
    makeDraggable(tableContainer);
    makeSelectable(tableContainer);

    canvas.appendChild(tableContainer);
    selectElement(tableContainer);

    // Add to elements array
    visualEditor.elements.push({
      id: tableContainer.id,
      type: 'items-table',
      element: tableContainer
    });

    console.log('Tabla de items agregada con variables de Handlebars');
  }

  function makeTemplateEditable(container) {
    // Find text elements and make them editable
    const textElements = container.querySelectorAll('h1, h2, h3, h4, p, td, th, span, div');
    
    textElements.forEach(el => {
      // Skip elements that are already containers or have specific roles
      if (el.querySelector('table, div') || el.classList.contains('tpl-element')) return;
      
      // Make text content editable
      if (el.textContent.trim() && !el.querySelector('*')) {
        el.contentEditable = 'true';
        el.style.outline = 'none';
        
        // Add hover effect for editable elements
        el.addEventListener('mouseenter', () => {
          el.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
          el.style.cursor = 'text';
        });
        
        el.addEventListener('mouseleave', () => {
          if (document.activeElement !== el) {
            el.style.backgroundColor = 'transparent';
          }
        });
        
        el.addEventListener('focus', () => {
          el.style.backgroundColor = 'rgba(37, 99, 235, 0.1)';
          el.style.boxShadow = '0 0 0 2px rgba(37, 99, 235, 0.3)';
        });
        
        el.addEventListener('blur', () => {
          el.style.backgroundColor = 'transparent';
          el.style.boxShadow = 'none';
        });
      }
    });

    // For sticker templates, DO NOT wrap the entire content; keep per-page elements
    const isSticker = (window.currentTemplateSession?.type === 'sticker-qr' || window.currentTemplateSession?.type === 'sticker-brand');
    if (isSticker) {
      // Reinitialize only tpl-elements found to keep them interactive
      const elements = container.querySelectorAll('.tpl-element');
      elements.forEach(el => makeElementInteractive(el));
      return;
    }

    // For non-sticker documents, keep previous behavior (wrapper enables moving whole layout)
    const wrapper = document.createElement('div');
    wrapper.className = 'tpl-element template-wrapper';
    wrapper.id = `element_${visualEditor.nextId++}`;
    wrapper.style.cssText = 'position: absolute; left: 20px; top: 20px; cursor: move; border: 2px solid transparent;';

    while (container.firstChild) {
      wrapper.appendChild(container.firstChild);
    }
    container.appendChild(wrapper);

    makeDraggable(wrapper);
    makeSelectable(wrapper);

    visualEditor.elements.push({ id: wrapper.id, type: 'template', element: wrapper });
    selectElement(wrapper);
  }

  // Make a previously saved .tpl-element interactive again (drag/select/resize, image hooks)
  function makeElementInteractive(element) {
    if (!element || !(element instanceof HTMLElement)) return;
    if (element.dataset && element.dataset.interactive === 'true') return;

    // Ensure absolute positioning if missing
    const style = element.style || {};
    if (!style.position) element.style.position = 'absolute';
    if (!style.left) element.style.left = (getSafeInsetPx() || 20) + 'px';
    if (!style.top) element.style.top = (getSafeInsetPx() || 20) + 'px';
    // Clear legacy min constraints so user can shrink freely
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

    // Image handling: placeholder or existing container
    try {
      const placeholder = element.querySelector && element.querySelector('.image-placeholder');
      if (placeholder) setupImageUpload(element);
      const imgContainer = element.querySelector && element.querySelector('.image-container');
      if (imgContainer) {
        const img = imgContainer.querySelector('img');
        if (img) {
          // Normalize wrappers to image size on load
          imgContainer.style.padding = '0';
          imgContainer.style.margin = '0';
          imgContainer.style.lineHeight = '0';
          imgContainer.style.display = 'inline-block';
          // If widths/heights exist, sync outer tpl-element too
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

    // Register into editor model if not present
    try {
      const exists = visualEditor.elements.some(rec => rec && rec.element === element);
      if (!exists) {
        visualEditor.elements.push({ id: element.id || `element_${visualEditor.nextId++}`, type: element.dataset?.type || 'unknown', element });
      }
    } catch(_) {}

    if (element.dataset) element.dataset.interactive = 'true';
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

  // Helper function to convert RGB to HEX
  function rgbToHex(rgb) {
    const result = rgb.match(/\d+/g);
    if (!result) return '#000000';
    
    const r = parseInt(result[0]);
    const g = parseInt(result[1]);
    const b = parseInt(result[2]);
    
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Variable groups for insertion - specific for invoices
  const VAR_GROUPS = [
    {
      title: 'Empresa',
      items: [
        { label: 'Nombre', value: '{{company.name}}' },
        { label: 'Dirección', value: '{{company.address}}' },
        { label: 'Teléfono', value: '{{company.phone}}' },
        { label: 'Email', value: '{{company.email}}' },
        { label: 'Logo URL', value: '{{company.logoUrl}}' }
      ]
    },
    {
      title: 'Venta/Factura',
      items: [
        { label: 'Número de factura', value: '{{sale.number}}' },
        { label: 'Fecha de venta', value: '{{date sale.date}}' },
        { label: 'Estado', value: '{{sale.status}}' },
        { label: 'Subtotal', value: '{{money sale.subtotal}}' },
        { label: 'Total', value: '{{money sale.total}}' },
        { label: 'Impuesto/IVA', value: '{{money sale.tax}}' }
      ]
    },
    {
      title: 'Cliente',
      items: [
        { label: 'Nombre completo', value: '{{sale.customerName}}' },
        { label: 'Teléfono', value: '{{sale.customerPhone}}' },
        { label: 'Email', value: '{{sale.customerEmail}}' }
      ]
    },
    {
      title: 'Vehículo',
      items: [
        { label: 'Placa', value: '{{sale.vehicle.plate}}' },
        { label: 'Marca/Modelo', value: '{{sale.vehicle.brand}}' },
        { label: 'Año', value: '{{sale.vehicle.year}}' },
        { label: 'Color', value: '{{sale.vehicle.color}}' }
      ]
    },
    {
      title: 'Items/Servicios',
      items: [
        { label: 'Lista de items', value: '{{#each sale.items}}\n• {{qty}}x {{description}} - {{money total}}\n{{/each}}' },
  { label: 'Tabla de items', value: '{{#each sale.items}}\n<tr><td>{{qty}}</td><td>{{description}}</td><td>{{money unitPrice}}</td><td>{{money total}}</td></tr>\n{{/each}}' },
        { label: 'Solo descripciones', value: '{{#each sale.items}}{{description}}{{#unless @last}}, {{/unless}}{{/each}}' }
      ]
    },
    {
      title: 'Técnico/Mecánico',
      items: [
        { label: 'Nombre del técnico', value: '{{sale.technician}}' }
      ]
    },
    {
      title: 'Helpers/Formateo',
      items: [
        { label: 'Formato fecha', value: '{{date sale.date}}' },
        { label: 'Formato dinero', value: '{{money sale.total}}' },
        { label: 'Texto mayúsculas', value: '{{uppercase sale.customerName}}' },
        { label: 'Texto minúsculas', value: '{{lowercase company.email}}' },
        { label: 'Número con ceros', value: '{{pad sale.number 5}}' }
      ]
    }
  ];

  function setupVariables() {
    const varList = qs('#var-list');
    if (!varList) return;

    // Obtener el tipo de documento actual
    const templateType = window.currentTemplateSession?.type || new URLSearchParams(window.location.search).get('type') || 'invoice';

    // Create user-friendly variable interface
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

    // Variables específicas según el tipo de documento
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
        <div style="background: #fff3cd; padding: 10px; border-radius: 6px; border: 1px solid #ffc107; margin-bottom: 8px;">
          <small style="color: #856404; font-size: 11px;">💡 Estos loops muestran los items agrupados por tipo</small>
        </div>
        ${createFriendlyButtons([
          { label: 'Lista de ingresos', icon: '📈', value: '{{#each settlement.itemsByType.earnings}}\n• {{name}}: {{money value}}\n{{/each}}', multiline: true },
          { label: 'Lista de descuentos', icon: '📉', value: '{{#each settlement.itemsByType.deductions}}\n• {{name}}: {{money value}}\n{{/each}}', multiline: true },
          { label: 'Lista de recargos', icon: '⚡', value: '{{#each settlement.itemsByType.surcharges}}\n• {{name}}: {{money value}}\n{{/each}}', multiline: true },
          { label: 'Tabla de ingresos', icon: '📊', value: '{{#each settlement.itemsByType.earnings}}\n<tr><td>{{name}}</td><td>{{money value}}</td></tr>\n{{/each}}', multiline: true },
          { label: 'Tabla de descuentos', icon: '📊', value: '{{#each settlement.itemsByType.deductions}}\n<tr><td>{{name}}</td><td>{{money value}}</td></tr>\n{{/each}}', multiline: true }
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
          { label: 'Total cotizado', icon: '💵', value: '{{money quote.total}}' },
          { label: 'Subtotal cotización', icon: '💴', value: '{{money quote.subtotal}}' }
        ])}
      </div>

      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">🔧 Datos de Orden de Trabajo</h4>
        ${createFriendlyButtons([
          { label: 'Número de orden', icon: '#️⃣', value: '{{workOrder.number}}' },
          { label: 'Fecha de inicio', icon: '📅', value: '{{date workOrder.startDate}}' },
          { label: 'Fecha estimada', icon: '⏰', value: '{{date workOrder.estimatedDate}}' },
          { label: 'Estado actual', icon: '🔄', value: '{{workOrder.status}}' },
          { label: 'Costo estimado', icon: '💰', value: '{{money workOrder.estimatedCost}}' },
          { label: 'Técnico asignado', icon: '👨‍🔧', value: '{{workOrder.technician}}' },
          { label: 'Problema reportado', icon: '⚠️', value: '{{workOrder.problemDescription}}' }
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
          { label: 'Año del vehículo', icon: '📅', value: '{{sale.vehicle.year || quote.vehicle.year || workOrder.vehicle.year}}' },
          { label: 'Kilometraje', icon: '🛣️', value: '{{workOrder.vehicle.mileage}} km' }
        ])}
      </div>

      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">🔧 Lista de Trabajos/Servicios</h4>
        <div style="background: #fff3cd; padding: 10px; border-radius: 6px; border: 1px solid #ffc107; margin-bottom: 8px;">
          <small style="color: #856404; font-size: 11px;">💡 Estos botones funcionan para ventas, cotizaciones y órdenes de trabajo</small>
        </div>
        ${createFriendlyButtons([
          { label: 'Lista de servicios (ventas)', icon: '📝', value: '{{#each sale.items}}• {{qty}}x {{description}} - {{money total}}\\n{{/each}}', multiline: true },
          { label: 'Lista de servicios (cotizaciones)', icon: '💰', value: '{{#each quote.items}}• {{qty}}x {{description}} - {{money price}} c/u = {{money total}}\\n{{/each}}', multiline: true },
          { label: 'Tareas de trabajo', icon: '🔧', value: '{{#each workOrder.tasks}}• {{description}} - Técnico: {{technician}}\\n{{/each}}', multiline: true },
          { label: 'Solo nombres (cualquiera)', icon: '✏️', value: '{{#each (sale.items || quote.items || workOrder.tasks)}}{{description}}{{#unless @last}}, {{/unless}}{{/each}}', multiline: true }
        ])}
        <button onclick="insertItemsTable()" style="width: 100%; padding: 8px; background: #6f42c1; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 5px;">
          📊 Crear Tabla Completa de Trabajos
        </button>
      </div>

      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">⚙️ Opciones Avanzadas</h4>
        <details style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin-bottom: 5px;">
          <summary style="cursor: pointer; font-size: 12px; color: #666;">🤓 Para usuarios técnicos</summary>
          <div style="margin-top: 8px; font-size: 10px;">
            <div style="margin: 3px 0; padding: 3px; background: #fff; border-radius: 2px; cursor: pointer;" onclick="insertVariableInCanvas('{{technician}}')">
              Técnico asignado: <code>{{technician}}</code>
            </div>
            <div style="margin: 3px 0; padding: 3px; background: #fff; border-radius: 2px; cursor: pointer;" onclick="insertVariableInCanvas('{{uppercase company.name}}')">
              Nombre en mayúsculas: <code>{{uppercase company.name}}</code>
            </div>
          </div>
        </details>
      </div>
    `;

    varList.innerHTML = html;
    
    // Add selection indicator at the top
    updateVariablesSelectionIndicator();
  }

  function updateVariablesSelectionIndicator() {
    const varList = qs('#var-list');
    if (!varList) return;

    // Remove existing indicator
    const existingIndicator = varList.querySelector('.selection-status');
    if (existingIndicator) existingIndicator.remove();

    // Create new indicator
    const indicator = document.createElement('div');
    indicator.className = 'selection-status';
    
    const selectedElement = visualEditor.selectedElement;
    
    if (selectedElement) {
      const elementType = selectedElement.querySelector('h1, h2, h3') ? 'título' :
                         selectedElement.querySelector('img') ? 'imagen' :
                         selectedElement.querySelector('table') ? 'tabla' : 'texto';
      
      indicator.innerHTML = `
        <div style="
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          padding: 10px 15px;
          border-radius: 8px;
          margin-bottom: 15px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
        ">
          <span style="font-size: 20px;">🎯</span>
          <div style="flex: 1;">
            <div style="font-weight: 600; margin-bottom: 2px;">Elemento ${elementType} seleccionado</div>
            <div style="font-size: 11px; opacity: 0.9;">Las variables se agregarán a este elemento</div>
          </div>
          <div style="font-size: 10px; opacity: 0.7;">✨ Activo</div>
        </div>
      `;
    } else {
      indicator.innerHTML = `
        <div style="
          background: linear-gradient(135deg, #6f42c1 0%, #e83e8c 100%);
          color: white;
          padding: 10px 15px;
          border-radius: 8px;
          margin-bottom: 15px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 2px 8px rgba(111, 66, 193, 0.3);
        ">
          <span style="font-size: 20px;">📝</span>
          <div style="flex: 1;">
            <div style="font-weight: 600; margin-bottom: 2px;">Modo crear elemento</div>
            <div style="font-size: 11px; opacity: 0.9;">Las variables crearán nuevos elementos</div>
          </div>
          <div style="font-size: 10px; opacity: 0.7;">🆕 Nuevo</div>
        </div>
      `;
    }

    // Insert at the beginning
    varList.insertBefore(indicator, varList.firstChild);
  }

  function updateDeleteButtonState(selectedElement) {
    const deleteBtn = qs('#delete-selected-btn');
    if (!deleteBtn) return;

    if (selectedElement) {
      // Element is selected - enable button
      deleteBtn.style.opacity = '1';
      deleteBtn.style.background = '#dc3545';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = '🗑️ Eliminar Seleccionado';
      deleteBtn.title = 'Eliminar elemento seleccionado';
    } else {
      // No element selected - disable button
      deleteBtn.style.opacity = '0.5';
      deleteBtn.style.background = '#6c757d';
      deleteBtn.style.cursor = 'not-allowed';
      deleteBtn.disabled = true;
      deleteBtn.innerHTML = '🗑️ Sin Selección';
      deleteBtn.title = 'Selecciona un elemento para eliminar';
    }
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

  // Global function for inserting variables
  window.insertVariableInCanvas = function(varText, isMultiline = false) {
    const parent = getActiveParent();
    if (!parent) return;
    const selectedEl = visualEditor.selectedElement;
    
    // If there's a selected element, add to it
    if (selectedEl) {
      const contentEl = selectedEl.querySelector('[contenteditable="true"]');
      if (contentEl) {
        // Add variable at cursor position or append
        if (isMultiline) {
          contentEl.style.whiteSpace = 'pre-line';
          // allow shrinking: no minHeight clamp
          contentEl.style.minHeight = '0';
        }
        
        // Insert at cursor position if possible
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
    
    // Clear placeholder if exists in canvas, regardless of parent
    const canvas = qs('#ce-canvas');
    if (canvas) {
      const ph = canvas.querySelector('#ce-placeholder');
      if (ph) ph.remove();
      if (canvas.innerHTML.includes('Haz clic en los botones')) {
        canvas.innerHTML = '';
      }
    }
    
    // Create appropriate element based on variable type
    let elementType = 'text';
    let content = varText;
    let styles = {};
    
    // Smart element creation based on content
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
        // no minHeight clamp
        fontFamily: 'monospace',
        backgroundColor: '#f8f9fa',
        padding: '10px',
        border: '1px solid #dee2e6',
        borderRadius: '4px'
      };
    }
    
    const inset = getSafeInsetPx();
    const newElement = createEditableElement(elementType, content, {
      position: { left: (inset || 20), top: (inset || 20) + (visualEditor.elements.length * 20) },
      styles: styles
    });
    
    parent.appendChild(newElement);
    selectElement(newElement);
  };

  // Insert QR as an image element (<img src="{{item.qr}}">) with resize handles
  window.insertQrImageInCanvas = function() {
    const parent = getActiveParent();
    if (!parent) return;
    const canvas = qs('#ce-canvas');
    if (parent === canvas) {
      const ph = canvas.querySelector('#ce-placeholder');
      if (ph) ph.remove();
      if (canvas.innerHTML.includes('Haz clic en los botones')) canvas.innerHTML = '';
    }

    // Create container for image to allow resize handles
    const id = `element_${visualEditor.nextId++}`;
    const wrapper = document.createElement('div');
    wrapper.id = id;
    wrapper.className = 'tpl-element';
    wrapper.style.cssText = 'position:absolute; cursor:move; border:2px solid transparent;';

    // Default spawn near safe inset
    const inset = getSafeInsetPx();
    wrapper.style.left = (inset || 10) + 'px';
    wrapper.style.top = (inset || 10) + 'px';

    const imgContainer = document.createElement('div');
    imgContainer.className = 'image-container';
    imgContainer.style.cssText = 'position:relative; display:inline-block; max-width:100%;';

    const img = document.createElement('img');
    img.src = '{{item.qr}}';
  img.style.cssText = 'width:80px; height:auto; display:block; user-select:none; margin:0; padding:0;';
    img.draggable = false;
    imgContainer.appendChild(img);
    wrapper.appendChild(imgContainer);

    parent.appendChild(wrapper);

    // Make interactive
    makeDraggable(wrapper);
    makeSelectable(wrapper);
    addResizeHandles(imgContainer, img);
    visualEditor.elements.push({ id, type: 'qr-image', element: wrapper });
    selectElement(wrapper);
  };

  // Global function to insert items table
  window.insertItemsTable = function() {
    addItemsTable();
  };



  // Setup keyboard shortcuts
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Delete element with Del or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && visualEditor.selectedElement) {
        // Don't delete if we're editing text (more robust check)
        const activeEl = document.activeElement;
        const isEditing = activeEl && (
          activeEl.contentEditable === 'true' || 
          activeEl.tagName === 'INPUT' || 
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable
        );
        
        if (isEditing) return;
        
        e.preventDefault();
        
        // Use the safer delete function
        deleteElementSafely(visualEditor.selectedElement);
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

  // More robust delete function
  function deleteElementSafely(element) {
    if (!element || !element.parentNode) {
      console.warn('Elemento no encontrado o ya eliminado');
      return false;
    }

    try {
      // Save element for undo functionality
      const elementData = visualEditor.elements.find(el => el.element === element);
      visualEditor.lastDeletedElement = {
        html: element.outerHTML,
        type: elementData?.type || 'unknown',
        position: {
          left: element.style.left,
          top: element.style.top
        },
        timestamp: Date.now()
      };

      // Clean up resize handles if it's an image
      const imageContainer = element.querySelector('.image-container');
      if (imageContainer && imageContainer._resizeCleanup) {
        imageContainer._resizeCleanup();
      }

      // Clean up drag functionality  
      if (element._dragCleanup) {
        element._dragCleanup();
      }

      // Remove from elements array first
      const elementIndex = visualEditor.elements.findIndex(el => el.element === element);
      if (elementIndex !== -1) {
        visualEditor.elements.splice(elementIndex, 1);
      }

      // Remove element from DOM
      element.remove();

      // Clear selection if this was the selected element
      if (visualEditor.selectedElement === element) {
        selectElement(null);
      }

      // Enable undo button
      updateUndoButtonState(true);

      // Auto-disable undo after 30 seconds
      setTimeout(() => {
        visualEditor.lastDeletedElement = null;
        updateUndoButtonState(false);
      }, 30000);

      console.log('Elemento eliminado exitosamente');
      return true;
    } catch (error) {
      console.error('Error al eliminar elemento:', error);
      return false;
    }
  }

  function restoreDeletedElement() {
    if (!visualEditor.lastDeletedElement) return;

    try {
      const canvas = qs('#ce-canvas');
      if (!canvas) return;

      // Create element from saved HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = visualEditor.lastDeletedElement.html;
      const restoredElement = tempDiv.firstElementChild;

      // Restore position
      if (visualEditor.lastDeletedElement.position) {
        restoredElement.style.left = visualEditor.lastDeletedElement.position.left;
        restoredElement.style.top = visualEditor.lastDeletedElement.position.top;
      }

      // Add to canvas
      canvas.appendChild(restoredElement);

      // Make it functional again
      makeDraggable(restoredElement);
      makeSelectable(restoredElement);

      // Add to elements array
      visualEditor.elements.push({
        id: restoredElement.id,
        type: visualEditor.lastDeletedElement.type,
        element: restoredElement
      });

      // Select the restored element
      selectElement(restoredElement);

      // Clear undo data
      visualEditor.lastDeletedElement = null;
      updateUndoButtonState(false);

      console.log('Elemento restaurado');
    } catch (error) {
      console.error('Error al restaurar elemento:', error);
    }
  }

  function updateUndoButtonState(canUndo) {
    const undoBtn = qs('#undo-btn');
    if (!undoBtn) return;

    if (canUndo) {
      undoBtn.style.opacity = '1';
      undoBtn.style.cursor = 'pointer';
      undoBtn.disabled = false;
      undoBtn.title = 'Deshacer última eliminación (30s)';
    } else {
      undoBtn.style.opacity = '0.5';
      undoBtn.style.cursor = 'not-allowed';
      undoBtn.disabled = true;
      undoBtn.title = 'No hay elementos para restaurar';
    }
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
    
  // Offset and clamp within safe area
  const currentLeft = parseInt(newElement.style.left) || 0;
  const currentTop = parseInt(newElement.style.top) || 0;
  const inset = getSafeInsetPx();
  const parentRect = parent.getBoundingClientRect();
  const tempRect = { width: newElement.offsetWidth || 150, height: newElement.offsetHeight || 60 };
  const minLeft = inset;
  const minTop = inset;
  const maxLeft = Math.max(minLeft, parentRect.width - tempRect.width - inset);
  const maxTop = Math.max(minTop, parentRect.height - tempRect.height - inset);
  const nl = Math.max(minLeft, Math.min(currentLeft + 20, maxLeft));
  const nt = Math.max(minTop, Math.min(currentTop + 20, maxTop));
  newElement.style.left = nl + 'px';
  newElement.style.top = nt + 'px';
    
    // Re-setup functionality
    makeDraggable(newElement);
    makeSelectable(newElement);
    
    // Setup image upload if it's an image element
    if (visualEditor.copiedElement.type === 'image') {
      setupImageUpload(newElement);
    }
    
  parent.appendChild(newElement);
    selectElement(newElement);
    
    // Add to elements array
    visualEditor.elements.push({
      id: newId,
      type: visualEditor.copiedElement.type,
      element: newElement
    });
    
    console.log('Elemento pegado');
  }

  function addCompanyIndicator(companyEmail) {
    if (!companyEmail) return;
    
    // Find a good place to add the company indicator
    const body = document.body;
    
    // Create company indicator
    const indicator = document.createElement('div');
    indicator.id = 'company-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      z-index: 2000;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
      border: 2px solid rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(10px);
    `;
    indicator.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <div style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;"></div>
        <span>📋 ${companyEmail}</span>
      </div>
    `;
    
    body.appendChild(indicator);
    
    // Add pulsing animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
    
    console.log(`✅ Indicador de empresa agregado: ${companyEmail}`);
  }

  // Add environment and connectivity indicator
  function addEnvironmentIndicator() {
    const body = document.body;
    
    // Check environment usando la detección corregida
    const isProduction = window.IS_PRODUCTION || false;
    const environment = isProduction ? 'PRODUCCIÓN' : 'DESARROLLO';
    const envColor = isProduction ? '#28a745' : '#ffc107';
    const envIcon = isProduction ? '🌐' : '🔧';
    
    // Create environment indicator
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
      backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    
    envIndicator.innerHTML = `
      <span style="font-size: 14px;">${envIcon}</span>
      <span>${environment}</span>
      <div id="connection-status" style="width: 8px; height: 8px; background: #6c757d; border-radius: 50%; margin-left: 4px;"></div>
    `;
    
    body.appendChild(envIndicator);
    
    // Test backend connection and update indicator
    updateConnectionStatus();
    
    // Update connection status every 30 seconds
    setInterval(updateConnectionStatus, 30000);
    
    console.log(`✅ Indicador de entorno agregado: ${environment}`);
  }

  async function updateConnectionStatus() {
    const statusDot = document.getElementById('connection-status');
    if (!statusDot) return;
    
    try {
      const response = await fetch(window.BACKEND_URL + '/health', {
        method: 'GET',
        timeout: 5000
      });
      
      if (response.ok) {
        statusDot.style.background = '#28a745'; // Green - connected
        statusDot.title = 'Backend conectado y funcionando';
        window.BACKEND_CONNECTED = true;
        console.log('✅ Backend conectado correctamente');
      } else {
        statusDot.style.background = '#ffc107'; // Yellow - issues
        statusDot.title = 'Backend responde con errores';
        window.BACKEND_CONNECTED = false;
        console.warn('⚠️ Backend responde con errores');
      }
    } catch (error) {
      statusDot.style.background = '#dc3545'; // Red - disconnected
      statusDot.title = 'Backend desconectado - Aplicación no funcionará';
      window.BACKEND_CONNECTED = false;
      console.error('❌ Backend no disponible:', error.message);
    }
  }

  // Check URL parameters immediately (before DOM load to prevent flash)
  const urlParams = new URLSearchParams(window.location.search);
  const documentType = urlParams.get('type');
  const action = urlParams.get('action');
  const formatId = urlParams.get('formatId');
  const formatName = urlParams.get('formatName');
  
  // If no parameters, redirect immediately to prevent flash
  if (!documentType || !action) {
    console.log('🔄 Redirigiendo a selector de formato...');
    window.location.replace('template-selector.html');
    // Don't continue execution
    throw new Error('Redirecting to template selector');
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    console.log('🎨 Inicializando Editor Visual Completo...');
    
    // Store current session info
    window.currentTemplateSession = {
      type: documentType,
      action: action,
      formatId: formatId,
      name: formatName || null // Use provided name or set when saving
    };
    
    console.log('📋 Sesión de plantilla:', window.currentTemplateSession);
    
    try {
      // Check if API is available
      if (typeof API === 'undefined') {
        console.warn('API no está disponible, funcionando en modo offline');
        // Initialize without backend features
        setupVisualEditor();
        setupVariables();
        setupKeyboardShortcuts();
        
        // Add environment indicator even in offline mode
        addEnvironmentIndicator();
        
        // Add session header even in offline mode
        addSessionHeader(documentType, action, formatId);
        
        // Load format based on action (offline mode) with small delay to ensure DOM is ready
        console.log(`🔌 Modo offline - Acción: ${action}, Tipo: ${documentType}`);
        setTimeout(() => {
          if (action === 'edit' && formatId) {
            console.log('📝 Modo offline: No se puede cargar formato existente');
            // No cargar plantilla por defecto en EDIT
            showQuickNotification('⚠️ Modo offline: no es posible cargar el formato para edición.', 'warning');
          } else if (action === 'create') {
            console.log('➕ Modo offline: Cargando plantilla por defecto...');
            loadDefaultTemplate(documentType);
          }
        }, 500);
        return;
      }
      
      // Verify we have an active company
      const activeCompany = API.getActiveCompany();
      if (!activeCompany) {
        console.warn('No hay empresa activa, funcionando en modo demo');
        // Initialize in demo mode
        setupVisualEditor();
        setupVariables();
        setupKeyboardShortcuts();
        
        // Add environment indicator even in demo mode
        addEnvironmentIndicator();
        
        // Add session header in demo mode
        addSessionHeader(documentType, action, formatId);
        
        // Load format based on action (demo mode) with small delay
        console.log(`🎭 Modo demo - Acción: ${action}, Tipo: ${documentType}`);
        setTimeout(() => {
          if (action === 'edit' && formatId) {
            console.log('📝 Modo demo: No se debe inyectar plantilla por defecto al editar');
            showQuickNotification('ℹ️ Modo demo: no hay contenido para cargar en edición.', 'info');
          } else if (action === 'create') {
            console.log('➕ Modo demo: Cargando plantilla por defecto...');
            loadDefaultTemplate(documentType);
          }
        }, 500);
        return;
      }
      
      console.log(`📋 Editor iniciado para empresa: ${activeCompany}`);
      
      setupVisualEditor();
      setupVariables();
      setupKeyboardShortcuts();
      
      // Add environment and connectivity indicators
      addEnvironmentIndicator();
      
      // Add company indicator to the interface
      addCompanyIndicator(activeCompany);
      
      // Update page title to show document type and action
      document.title = `Editor de ${getDocumentTypeName(documentType)} - ${action === 'edit' ? 'Editando' : 'Creando'} | Taller Automotriz`;
      
      // Add header info to show current session
      addSessionHeader(documentType, action, formatId);
      
      // Load format based on action with delay to ensure DOM is ready
      console.log(`🎯 Acción: ${action}, Tipo: ${documentType}, FormatId: ${formatId}`);
      
      setTimeout(() => {
        if (action === 'edit' && formatId) {
          console.log('📝 Cargando formato existente...');
          loadExistingFormat(formatId);
        } else if (action === 'create') {
          console.log('➕ Creando nuevo formato, cargando plantilla por defecto...');
          loadDefaultTemplate(documentType);
        } else {
          console.error('❌ Acción no reconocida:', action);
        }
      }, 500);
      
      // Load existing templates from backend (for reference)
      loadExistingTemplates();
      
    } catch (error) {
      console.error('Error al inicializar el editor:', error);
      // Fallback initialization
      setupVisualEditor();
      setupVariables();
      setupKeyboardShortcuts();
    }
    
    // Setup existing buttons if they exist
    const saveBtn = qs('#save-template');
    if (saveBtn) {
      console.log('✅ Botón Guardar Plantilla encontrado');
      saveBtn.onclick = function(e) {
        e.preventDefault();
        console.log('🔄 Ejecutando saveTemplateAndReturn...');
        saveTemplateAndReturn();
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
        previewTemplateEnhanced();
      };
    } else {
      console.error('❌ No se encontró el botón preview-template');
    }

    // Quick save button removed - only save template and preview remain
    
    console.log('✅ Editor Visual inicializado correctamente');
  });

  // Global: deseleccionar al hacer clic fuera de cualquier elemento del editor
  // (ignora clics dentro de .tpl-element, #element-properties, #ce-toolbar y #pages-controls)
  document.addEventListener('click', (e) => {
    try {
      const el = e.target;
      const insideTpl = el.closest && el.closest('.tpl-element');
      const insideProps = el.closest && el.closest('#element-properties');
      const insideToolbar = el.closest && el.closest('#ce-toolbar');
      const insidePages = el.closest && el.closest('#pages-controls');
      const insideCanvas = el.closest && el.closest('#ce-canvas');
      if (!insideTpl && !insideProps && !insideToolbar && !insidePages && insideCanvas) {
        // Clic dentro del canvas pero fuera de un elemento
        selectElement(null);
      }
    } catch (_) { /* noop */ }
  }, true);

  // Template loading functions
  async function loadExistingFormat(formatId) {
    try {
      showQuickNotification('🔄 Cargando formato existente...', 'info');
      
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
      if (canvas) {
        // If sticker types, enforce proper size before injecting
        if (template.type === 'sticker-qr') {
          applyStickerCanvasSize('qr');
        } else if (template.type === 'sticker-brand') {
          applyStickerCanvasSize('brand');
        }
        if (template.contentHtml && template.contentHtml.trim() !== '') {
          // Load existing content
          canvas.innerHTML = template.contentHtml;
          // For sticker templates, ensure elements are interactive even in legacy content
          if (template.type === 'sticker-qr' || template.type === 'sticker-brand') {
            try {
              // Helper: recursively convert legacy nodes into interactive elements, avoiding full-page wrappers
              const convertLegacyToInteractive = (parentEl, refRect) => {
                if (!parentEl) return;
                const children = Array.from(parentEl.children || []);
                children.forEach(el => {
                  if (!el || el.classList?.contains('tpl-element')) return;
                  const tag = (el.tagName || '').toLowerCase();
                  if (tag === 'script' || tag === 'style') return;
                  const rect = el.getBoundingClientRect();
                  const isWrapper = (
                    (el.querySelector && el.querySelector('.tpl-element')) ||
                    el.children.length > 1 ||
                    rect.width >= (refRect.width * 0.9) ||
                    rect.height >= (refRect.height * 0.9)
                  );
                  if (isWrapper) {
                    // Make wrapper transparent to pointer events so inner items are clickable
                    try { el.style.pointerEvents = 'none'; } catch(_) {}
                    convertLegacyToInteractive(el, refRect);
                    return;
                  }
                  // Promote leaf to interactive element
                  el.classList.add('tpl-element');
                  el.style.position = 'absolute';
                  el.style.left = Math.max(0, Math.round(rect.left - refRect.left)) + 'px';
                  el.style.top = Math.max(0, Math.round(rect.top - refRect.top)) + 'px';
                  const cs = window.getComputedStyle(el);
                  if (!el.style.width || el.style.width === 'auto') el.style.width = rect.width + 'px';
                  if (!el.style.height || el.style.height === 'auto') { if (cs.display !== 'inline') el.style.height = rect.height + 'px'; }
                  try { makeElementInteractive(el); } catch(_) {}
                });
              };
              // Prefer working inside each page so we don't accidentally wrap page containers
              const pages = Array.from(canvas.querySelectorAll('.editor-page'));
              if (pages.length > 0) {
                pages.forEach(page => {
                  // Rebind existing interactive elements first
                  const pageTpls = Array.from(page.querySelectorAll('.tpl-element'));
                  if (pageTpls.length > 0) {
                    pageTpls.forEach(el => makeElementInteractive(el));
                  } else {
                    // Legacy: promote page's direct children to interactive elements
                    const pRect = page.getBoundingClientRect();
                    convertLegacyToInteractive(page, pRect);
                  }
                });
              } else {
                // No explicit pages: operate on the canvas content directly
                const container = canvas.querySelector('[data-pages-container="true"]') || canvas;
                const tpls = Array.from(container.querySelectorAll('.tpl-element'));
                if (tpls.length > 0) {
                  tpls.forEach(el => makeElementInteractive(el));
                } else {
                  const cRect = container.getBoundingClientRect();
                  convertLegacyToInteractive(container, cRect);
                }
              }
            } catch(e) {
              console.warn('Sticker legacy conversion failed:', e?.message || e);
            }

            // Detect pages and setup controls when present; default to single page for QR-only
            const pageCount = canvas.querySelectorAll('.editor-page').length || 1;
            if (!state.pages) state.pages = { count: pageCount, current: 1 };
            state.pages.count = pageCount;
            state.pages.current = 1;
            setupPagesControls(pageCount);
            if (typeof window._showEditorPage === 'function') window._showEditorPage(1);
            insertStickerVarsHint();
            updateSafeGuidesVisibility && updateSafeGuidesVisibility();
          } else {
            // For non-sticker, reinitialize as before
            reinitializeElements();
          }
          showQuickNotification(`✅ Formato "${template.name}" cargado para editar`, 'success');
          console.log('✅ Formato existente cargado:', template);
        } else {
          // Si el formato está vacío (caso típico tras crear y redirigir a editar),
          // inyectamos la plantilla base correspondiente para arrancar.
          console.log('ℹ️ Formato sin contenido. Inyectando plantilla base por ser primera edición...');
          if (template.type === 'sticker-qr' || template.type === 'sticker-brand' || template.type === 'invoice' || template.type === 'quote' || template.type === 'workOrder') {
            loadDefaultTemplate(template.type);
            // Mostrar variables si es sticker
            if (template.type === 'sticker-qr' || template.type === 'sticker-brand') {
              insertStickerVarsHint();
            }
            showQuickNotification(`🧩 "${template.name}": plantilla base cargada`, 'success');
          } else {
            // Fallback: dejamos el lienzo vacío con el placeholder
            console.log('⚠️ Tipo no reconocido para carga automática, dejando lienzo vacío');
            showQuickNotification(`ℹ️ "${template.name}" no tiene contenido guardado aún.`, 'info');
          }
        }
      } else {
        throw new Error('Canvas del editor no encontrado');
      }
      
    } catch (error) {
      console.error('Error cargando formato:', error);
      showQuickNotification(`⚠️ Error cargando formato: ${error.message}`, 'warning');
      
      // En edición, no cargar plantilla por defecto
      showQuickNotification('⚠️ No fue posible cargar el formato para edición.', 'warning');
    }
  }

  function loadDefaultTemplate(documentType) {
    console.log(`🎨 Cargando plantilla automática para: ${documentType}`);
    
    const canvas = qs('#ce-canvas');
    if (!canvas) {
      console.error('❌ Canvas no encontrado, no se puede cargar plantilla');
      return;
    }
    
    console.log('✅ Canvas encontrado, procediendo con carga de plantilla...');
    
    // Always load the appropriate template for the document type
    if (documentType === 'invoice') {
      createInvoiceTemplate(canvas);
      showQuickNotification(`📄 Plantilla de Factura cargada`, 'success');
    } else if (documentType === 'quote') {
      createQuoteTemplate(canvas);
      showQuickNotification(`💰 Plantilla de Cotización cargada`, 'success');
    } else if (documentType === 'workOrder') {
      createWorkOrderTemplate(canvas);
      showQuickNotification(`🔧 Plantilla de Orden de Trabajo cargada`, 'success');
    } else if (documentType === 'sticker-qr') {
      // 1 sola hoja 5x3 cm
      applyStickerCanvasSize('qr');
      createStickerTemplateQR(canvas);
      showQuickNotification(`🏷️ Plantilla de Sticker (Solo SKU/QR) cargada`, 'success');
    } else if (documentType === 'sticker-brand') {
      // 2 hojas de 5x3 cm apiladas
      applyStickerCanvasSize('brand');
      createStickerTemplateBrand(canvas);
      showQuickNotification(`🏷️ Plantilla de Sticker (Marca + SKU) cargada`, 'success');
    } else if (documentType === 'payroll') {
      createPayrollTemplate(canvas);
      showQuickNotification(`💰 Plantilla de Nómina cargada`, 'success');
    } else {
      // Fallback - this shouldn't happen with proper selector flow
      canvas.innerHTML = '<div style="color: #666; text-align: center; padding: 50px; background: #f8f9fa; border: 2px dashed #dee2e6; border-radius: 8px;"><h3>⚠️ Tipo de documento no reconocido</h3><p>Por favor usa el <a href="template-selector.html" style="color: #007bff;">selector de plantillas</a> para comenzar.</p></div>';
      showQuickNotification(`⚠️ Tipo de documento no válido`, 'error');
      return;
    }
    
    console.log(`✅ Plantilla de ${getDocumentTypeName(documentType)} lista para editar`);
  }

  function reinitializeElements() {
    // Reinitialize all interactive elements after loading content
    const canvas = qs('#ce-canvas');
    if (!canvas) return;
    const elements = canvas.querySelectorAll('.tpl-element');
    if (elements.length === 0) {
      // Fallback mejorado: convertir nodos existentes en elementos interactivos
      try {
        // Forzar layout antes de medir
        const canvasRect = canvas.getBoundingClientRect();
        const children = Array.from(canvas.children);
        let converted = 0;
        children.forEach(el => {
          // Ignorar nodos vacíos o contenedores sin contenido visual
          if (!el || el.classList.contains('tpl-element')) return;
          const tag = (el.tagName || '').toLowerCase();
          if (tag === 'script' || tag === 'style') return;
          const rect = el.getBoundingClientRect();
          const left = Math.max(0, Math.round(rect.left - canvasRect.left));
          const top = Math.max(0, Math.round(rect.top - canvasRect.top));
          // Promover a elemento interactivo
          el.classList.add('tpl-element');
          // Asegurar posicionamiento absoluto para poder arrastrar
          el.style.position = 'absolute';
          el.style.left = left + 'px';
          el.style.top = top + 'px';
          // Mantener tamaño actual si no está fijado
          const cs = window.getComputedStyle(el);
          if (!el.style.width || el.style.width === 'auto') el.style.width = rect.width + 'px';
          if (!el.style.height || el.style.height === 'auto') {
            // Solo fijar height si es un bloque no auto-ajustable
            if (cs.display !== 'inline') el.style.height = rect.height + 'px';
          }
          makeElementInteractive(el);
          converted++;
        });
        if (converted === 0) {
          // Último recurso: edición de texto inline
          makeTemplateEditable(canvas);
          console.log('↺ Sin elementos convertibles. Modo edición de texto activado.');
        } else {
          console.log(`✅ Convertidos ${converted} elementos legacy a interactivos`);
        }
      } catch (e) {
        console.warn('⚠️ Conversión legacy falló, usando edición de texto:', e?.message || e);
        makeTemplateEditable(canvas);
      }
    } else {
      elements.forEach(el => makeElementInteractive(el));
      console.log(`🔄 ${elements.length} elementos reinicializados`);
    }
    updateSafeGuidesVisibility();
  }

  // ======== STICKER SUPPORT ========
  function applyStickerCanvasSize(kind) {
    const sizeSelect = qs('#canvas-size');
    // We will force dimensions regardless of select, using existing applyCanvasSize via onchange
    if (sizeSelect) {
      sizeSelect.value = 'sticker';
      sizeSelect.dispatchEvent(new Event('change'));
    }
    // En modo paginado cada página es 5 x 3 cm; el lienzo muestra una página a la vez
    const canvas = qs('#ce-canvas');
    if (canvas) {
      const pxW = Math.round(5 * 37.795275591);
      const pxH = Math.round(3 * 37.795275591);
      canvas.style.width = pxW + 'px';
      canvas.style.height = pxH + 'px';
      canvas.style.maxWidth = pxW + 'px';
      canvas.style.maxHeight = pxH + 'px';
      canvas.style.minWidth = pxW + 'px';
      canvas.style.minHeight = pxH + 'px';
    }
  }

  // Helpers de paginado
  function initPages(count) {
    // Estado
    if (!state.pages) state.pages = { count: 1, current: 1 };
    state.pages.count = count;
    state.pages.current = 1;

    const canvas = qs('#ce-canvas');
    if (!canvas) return null;

    // Limpiar canvas y crear contenedor de páginas
    canvas.innerHTML = '';
  const container = document.createElement('div');
  container.dataset.pagesContainer = 'true';
  container.style.cssText = 'width:100%; height:100%; position:relative; display:flex; align-items:center; justify-content:center;';
    canvas.appendChild(container);

    for (let i = 1; i <= count; i++) {
      const page = document.createElement('div');
      page.className = 'editor-page';
      page.dataset.page = String(i);
      page.style.cssText = 'width:100%; height:100%; position:relative; background:#fff; border:1px dashed var(--border); border-radius:4px; box-sizing:border-box;';
      if (i !== 1) page.style.display = 'none';
      container.appendChild(page);
      // Build safe guides overlay
      buildSafeGuideForPage(page);
    }

    setupPagesControls(count);
    return container;
  }

  function setupPagesControls(count) {
    let toolbar = qs('#ce-toolbar');
    if (!toolbar) return;

    let ctrl = qs('#pages-controls');
    if (!ctrl) {
      ctrl = document.createElement('div');
      ctrl.id = 'pages-controls';
      ctrl.style.cssText = 'margin-left:12px; display:flex; gap:6px; align-items:center;';
      toolbar.appendChild(ctrl);
    }

    ctrl.innerHTML = `
      <div style="border-left:2px solid var(--border); height:24px; margin:0 8px 0 2px;"></div>
      <span style="font-weight:600;">Página:</span>
      <button id="page-prev" class="toolbar-btn secondary" style="padding:6px 10px;">◀</button>
      <span id="page-indicator" class="muted">1 / ${count}</span>
      <button id="page-next" class="toolbar-btn secondary" style="padding:6px 10px;">▶</button>
    `;

    const indicator = qs('#page-indicator');
    const prev = qs('#page-prev');
    const next = qs('#page-next');

    const showPage = (n) => {
      const container = qs('[data-pages-container="true"]');
      if (!container) return;
      const pages = container.querySelectorAll('.editor-page');
      pages.forEach(p => p.style.display = p.dataset.page === String(n) ? 'block' : 'none');
      state.pages.current = n;
      if (indicator) indicator.textContent = `${n} / ${state.pages.count}`;
    };

    prev.onclick = () => {
      const n = state.pages.current <= 1 ? state.pages.count : state.pages.current - 1;
      showPage(n);
    };
    next.onclick = () => {
      const n = state.pages.current >= state.pages.count ? 1 : state.pages.current + 1;
      showPage(n);
    };

    // Exponer helper por si se usa en otro lugar
    window._showEditorPage = showPage;
    updateClearCanvasButtonLabel();
  }

  function getPageEl(n) {
    return qs(`[data-pages-container="true"] .editor-page[data-page="${n}"]`);
  }

  function updateClearCanvasButtonLabel(){
    const btn = qs('#clear-canvas-btn');
    if (!btn) return;
    if (state.pages && state.pages.count > 1){
      btn.textContent = '🧹 Limpiar Página';
      btn.title = 'Limpia solo la página actual (no elimina otras páginas)';
    } else {
      btn.textContent = '🧹 Limpiar Todo';
      btn.title = 'Limpia todo el lienzo';
    }
  }

  function createStickerTemplateQR(canvas) {
    // Clear canvas - plantilla será creada desde cero
    canvas.innerHTML = '';
    reinitializeElements();
  }

  function createStickerTemplateBrand(canvas) {
    // Clear canvas - plantilla será creada desde cero
    canvas.innerHTML = '';
    reinitializeElements();
  }

  function getDocumentTypeName(type) {
    const names = {
      'invoice': 'Factura',
      'quote': 'Cotización', 
      'workOrder': 'Orden de Trabajo',
      'sticker-qr': 'Sticker (Solo QR)',
      'sticker-brand': 'Sticker (Marca + QR)'
    };
    return names[type] || type;
  }

  // Inserta una guía breve de variables disponibles cuando se trabaja con stickers
  function insertStickerVarsHint(){
    // Mover el hint de variables al panel lateral de variables, con chips interactivos
    const varList = document.querySelector('#var-list');
    if (!varList) return;
    if (document.querySelector('#sticker-vars-hint')) return;
    const hint = document.createElement('div');
    hint.id = 'sticker-vars-hint';
    hint.style.cssText = 'margin: 0 0 12px 0; background: var(--card); border:1px solid var(--border); border-radius:10px; padding:12px;';

    const header = `<h4 style="margin: 0 0 10px 0; color: #cbd5e1; font-size: 14px;">🧩 Variables rápidas (Stickers)</h4>`;
    const buttonsHtml = [
      createFriendlyButtons([
        { label: 'SKU del ítem', icon: '🏷️', value: '{{item.sku}}' },
        { label: 'Nombre del ítem', icon: '📦', value: '{{item.name}}' },
        { label: 'Ubicación', icon: '📍', value: '{{item.location}}' },
        { label: 'Nombre de la empresa', icon: '🏢', value: '{{company.name}}' }
      ]),
      // QR como imagen (inserta <img src="{{item.qr}}">)
      `<button onclick="insertQrImageInCanvas()" 
               style="width:100%; padding:8px 10px; margin:3px 0; background:linear-gradient(135deg,#f8f9fa,#e9ecef); border:1px solid #dee2e6; border-radius:6px; cursor:pointer; text-align:left; font-size:12px; display:flex; align-items:center; gap:8px;"
               onmouseover="this.style.background='linear-gradient(135deg,#e3f2fd,#bbdefb)'; this.style.borderColor='#2196f3';"
               onmouseout="this.style.background='linear-gradient(135deg,#f8f9fa,#e9ecef)'; this.style.borderColor='#dee2e6';">
         <span style="font-size:14px;">🖼️</span>
         <span style="flex:1; font-weight:500; color:#495057;">QR (como imagen)</span>
         <span style="font-size:10px; color:#6c757d;">Clic para agregar</span>
      </button>`,
      // QR como texto/URL (para depuración o necesidad específica)
      createFriendlyButtons([{ label: 'QR (texto/URL)', icon: '🔗', value: '{{item.qr}}' }])
    ].join('');

    hint.innerHTML = header + buttonsHtml;
    varList.insertBefore(hint, varList.firstChild);
  }

  function addSessionHeader(documentType, action, formatId) {
    // Add a header to show current session info
    const header = document.querySelector('h1');
    if (header) {
      const sessionInfo = document.createElement('div');
      sessionInfo.style.cssText = `
        background: var(--card-alt);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 14px;
        margin: 10px 0 16px 0;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
      `;
      
      const icon = action === 'edit' ? '✏️' : '➕';
      const actionText = action === 'edit' ? 'Editando' : 'Creando';
  const typeIcon = documentType === 'invoice' ? '🧾' : documentType === 'quote' ? '💰' : documentType === 'workOrder' ? '🔧' : documentType === 'payroll' ? '💰' : '🏷️';
      
      // Get current session name
      const currentName = window.currentTemplateSession?.name || formatName;
      
      sessionInfo.innerHTML = `
        <span style="font-size: 16px;">${icon}</span>
        <strong>${actionText} ${getDocumentTypeName(documentType)}</strong>
        <span style="font-size: 16px;">${typeIcon}</span>
        ${currentName ? `<span style="opacity:.8;">• "${currentName}"</span>` : ''}
        ${formatId ? `<span style="opacity:.8;">• ID: ${formatId}</span>` : ''}
        <div style="margin-left: auto;">
          <a href="template-selector.html" style="color: var(--text); text-decoration: none; font-size: 13px; opacity:.9;">
            ← Cambiar tipo/formato
          </a>
        </div>
      `;
      
      header.parentNode.insertBefore(sessionInfo, header.nextSibling);
    }
  }

  // Backend API integration functions
  async function saveTemplateToBackend() {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;

    // Consider non-empty if any .tpl-element exists
    const hasElements = !!canvas.querySelector('.tpl-element');
    await optimizeCanvasImages(canvas);
    const content = canvas.innerHTML;
    if ((!content || content.includes('Haz clic en los botones')) && !hasElements) {
      alert('Por favor crea contenido antes de guardar');
      return;
    }

    // Check if API is available
    if (typeof API === 'undefined') {
      alert('API no disponible. No se puede guardar en el servidor.');
      console.log('Contenido que se guardaría:', content);
      return;
    }

    // Get template details from current session
    const session = window.currentTemplateSession;
    let templateName = session.name;
    let templateType = session.type;
    let isUpdate = session.action === 'edit';

    // If creating new or name not set, ask user
    if (!templateName || session.action === 'create') {
      templateName = prompt('Nombre del formato:', templateName || `Nuevo ${getDocumentTypeName(templateType)}`);
      if (!templateName) return;
      
      // Update session name
      window.currentTemplateSession.name = templateName;
    }

    const activate = isUpdate ? 
      confirm('¿Actualizar formato existente?') :
      confirm('¿Activar como formato principal para este tipo?\n(Recomendado: Sí)');

    try {
      // Use API module to ensure proper authentication and company isolation
      const savedTemplate = await API.templates.create({
        name: templateName,
        type: templateType,
        contentHtml: content,
        contentCss: '', // Could be extracted from styles
        activate: activate
      });

      const company = API.getActiveCompany() || 'empresa actual';
      
      // Show success message with more details
      const successMsg = `✅ Plantilla guardada exitosamente!\n\n` +
                        `📝 Nombre: ${templateName}\n` +
                        `📋 Tipo: ${templateType}\n` +
                        `🏢 Empresa: ${company}\n` +
                        `${activate ? '✅ Activada como principal' : '📂 Guardada como borrador'}`;
      
      alert(successMsg);
      console.log('Plantilla guardada:', savedTemplate);
      
      // Refresh template list
      if (typeof loadExistingTemplates === 'function') {
        loadExistingTemplates();
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert(`❌ Error al guardar la plantilla:\n\n${error.message}\n\nRevisa la consola para más detalles.`);
    }
  }

  async function quickSaveTemplate() {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;

    await optimizeCanvasImages(canvas);
    const content = canvas.innerHTML;
    if (!content || content.includes('Haz clic en los botones')) {
      alert('Por favor crea contenido antes de guardar');
      return;
    }

    // Check if API is available
    if (typeof API === 'undefined') {
      alert('API no disponible. No se puede guardar en el servidor.');
      return;
    }

    // Get session info or auto-detect
    const session = window.currentTemplateSession;
    let templateType = session?.type || 'invoice';
    let templateName = session?.name;

    // If no session name, auto-detect from content
    if (!templateName) {
      if (content.toLowerCase().includes('cotización')) {
        templateType = 'quote';
        templateName = 'Cotización Borrador';
      } else if (content.toLowerCase().includes('orden de trabajo')) {
        templateType = 'workOrder';
        templateName = 'Orden de Trabajo Borrador';
      } else if (content.toLowerCase().includes('factura')) {
        templateType = 'invoice';
        templateName = 'Factura Borrador';
      } else {
        templateName = `${getDocumentTypeName(templateType)} Borrador`;
      }
    } else {
      templateName = `${templateName} - Guardado Rápido`;
    }

    // Add timestamp to make it unique
    const timestamp = new Date().toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    templateName += ` ${timestamp}`;

    try {
      // Save as draft (not activated)
      const savedTemplate = await API.templates.create({
        name: templateName,
        type: templateType,
        contentHtml: content,
        contentCss: (window.currentTemplateSession && window.currentTemplateSession.contentCss) || ''
      });

      const company = API.getActiveCompany() || 'empresa actual';
      
      // Show quick success notification
      showQuickNotification(`✅ Guardado: ${templateName}`, 'success');
      console.log('Borrador guardado:', savedTemplate);
      
    } catch (error) {
      console.error('Error saving draft:', error);
      showQuickNotification(`❌ Error al guardar: ${error.message}`, 'error');
    }
  }

  function showQuickNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#28a745' : '#dc3545'};
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
    
    // Add animation styles if not exists
    if (!document.querySelector('#notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutToRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOutToRight 0.3s ease-in';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 3000);
  }

  async function loadExistingTemplates() {
    if (typeof API === 'undefined') {
      console.warn('API no disponible, saltando carga de plantillas');
      return;
    }
    
    try {
      const templates = await API.templates.list();
      updateTemplateSelector(templates);
      console.log(`Plantillas cargadas para empresa: ${API.getActiveCompany()}`);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  }

  function updateTemplateSelector(templates) {
    // Create or update template selector
    let selector = qs('#existing-templates');
    if (!selector) {
      const toolbar = qs('.editor-toolbar');
      if (toolbar) {
        const selectorDiv = document.createElement('div');
        selectorDiv.style.cssText = 'display: flex; gap: 8px; align-items: center; border-left: 2px solid #ddd; padding-left: 15px; margin-left: 15px;';
        selectorDiv.innerHTML = `
          <label style="font-weight: 600;">Mis Plantillas:</label>
          <select id="existing-templates" style="padding: 5px; border-radius: 4px; border: 1px solid #ccc; min-width: 150px;">
            <option value="">Seleccionar plantilla...</option>
          </select>
          <button id="load-existing-btn" style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Cargar</button>
          <button id="delete-template-btn" style="padding: 6px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Eliminar</button>
        `;
        
        // Insert before canvas size controls
        const canvasSizeDiv = toolbar.querySelector('div:last-child');
        if (canvasSizeDiv) {
          toolbar.insertBefore(selectorDiv, canvasSizeDiv);
        } else {
          toolbar.appendChild(selectorDiv);
        }
        
        selector = qs('#existing-templates');
        
        // Setup event listeners
        qs('#load-existing-btn').onclick = () => loadExistingTemplate();
        qs('#delete-template-btn').onclick = () => deleteExistingTemplate();
      }
    }

    if (selector) {
      // Populate with templates
      const activeCompany = API.getActiveCompany();
      selector.innerHTML = `<option value="">📋 Plantillas de ${activeCompany}...</option>`;
      
      if (templates.length === 0) {
        const option = document.createElement('option');
        option.disabled = true;
        option.textContent = '(No hay plantillas guardadas)';
        selector.appendChild(option);
      } else {
        templates.forEach(template => {
          const option = document.createElement('option');
          option.value = template._id;
          option.textContent = `${template.name} (${template.type})${template.active ? ' ★' : ''}`;
          selector.appendChild(option);
        });
      }
    }
  }

  async function loadExistingTemplate() {
    const selector = qs('#existing-templates');
    const templateId = selector?.value;
    
    if (!templateId) {
      alert('Por favor selecciona una plantilla');
      return;
    }

    try {
      const template = await API.templates.get(templateId);
      
      // Clear canvas and load template
      const canvas = qs('#ce-canvas');
      if (canvas) {
        canvas.innerHTML = template.contentHtml;
        
        // Make loaded content editable
        setTimeout(() => {
          makeTemplateEditable(canvas);
        }, 100);
      }
      
      console.log(`Plantilla "${template.name}" cargada para empresa: ${API.getActiveCompany()}`);
    } catch (error) {
      console.error('Error loading template:', error);
      alert('Error al cargar la plantilla: ' + error.message);
    }
  }

  async function deleteExistingTemplate() {
    const selector = qs('#existing-templates');
    const templateId = selector?.value;
    
    if (!templateId) {
      alert('Por favor selecciona una plantilla para eliminar');
      return;
    }

    const templateName = selector.options[selector.selectedIndex].text;
    
    if (!confirm(`¿Estás seguro de eliminar "${templateName}"?`)) {
      return;
    }

    try {
      await API.templates.delete(templateId);
      alert(`Plantilla eliminada exitosamente de ${API.getActiveCompany()}`);
      loadExistingTemplates(); // Refresh list
      selector.selectedIndex = 0;
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Error al eliminar la plantilla: ' + error.message);
    }
  }

  // Preview with real data
  async function previewWithRealData() {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;

    await optimizeCanvasImages(canvas);
    const content = canvas.innerHTML;
    if (!content || content.includes('Haz clic en los botones')) {
      alert('Por favor crea contenido antes de hacer vista previa');
      return;
    }

    // Auto-detect template type based on content
    let templateType = 'invoice'; // default
    if (content.toLowerCase().includes('cotización')) {
      templateType = 'quote';
    } else if (content.toLowerCase().includes('orden de trabajo')) {
      templateType = 'workOrder';
    } else if (content.toLowerCase().includes('factura')) {
      templateType = 'invoice';
    }

    // Check if API is available
    if (typeof API === 'undefined') {
      alert('API no disponible. Mostrando vista previa sin datos reales.');
      showOfflinePreview(content, templateType);
      return;
    }

    try {
      showQuickNotification('🔄 Obteniendo datos reales...', 'info');
      
      const result = await API.templates.preview({
        type: templateType,
        contentHtml: content,
        contentCss: (window.currentTemplateSession && window.currentTemplateSession.contentCss) || ''
      });

      // Show preview in new window with PDF-like styles
      const previewWindow = window.open('', '_blank', 'width=850,height=1100,scrollbars=yes');
      
      const previewHTML = `
        <html>
          <head>
            <title>Vista Previa PDF - ${templateType.toUpperCase()} | ${API.getActiveCompany()}</title>
            <meta charset="UTF-8">
            <style>
              * { box-sizing: border-box; }
              
              body { 
                font-family: 'Arial', sans-serif; 
                margin: 0; 
                padding: 20px; 
                background: #525659; 
                color: #333;
                font-size: 14px;
                line-height: 1.4;
              }
              
              .pdf-viewer {
                background: white;
                width: 21cm;
                min-height: 29.7cm;
                margin: 0 auto;
                padding: 2cm;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                border-radius: 4px;
                position: relative;
              }
              
              .preview-header {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: #2c3e50;
                color: white;
                padding: 10px 20px;
                z-index: 1000;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 14px;
              }
              
              .preview-content {
                margin-top: 50px;
              }
              
              .close-btn {
                background: #e74c3c;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
              }
              
              .download-btn {
                background: #27ae60;
                color: white;
                border: none;
                padding: 8px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                margin-right: 10px;
              }
              
              /* Ensure proper PDF rendering */
              /* Ensure proper PDF rendering */
              .tpl-element {
                border: none !important;
                outline: none !important;
                box-shadow: none !important;
                color: #333 !important;
              }
              
              table {
                border-collapse: collapse;
                width: 100%;
              }
              
              th, td {
                border: 1px solid #333;
                padding: 8px;
                text-align: left;
              }
              
              th {
                background-color: #f5f5f5;
                font-weight: bold;
              }
              
              @media print {
                body { background: white; padding: 0; }
                .preview-header { display: none; }
                .preview-content { margin-top: 0; }
                .pdf-viewer { 
                  box-shadow: none; 
                  width: 100%; 
                  padding: 1cm;
                  min-height: auto;
                }
              }
            </style>
            <style id="template-css">${(result && result.css) || (window.currentTemplateSession && window.currentTemplateSession.contentCss) || ''}</style>
          </head>
          <body>
            <div class="preview-header">
              <div>
                <strong>📄 Vista Previa PDF</strong> | 
                Tipo: ${templateType.toUpperCase()} | 
                Empresa: ${API.getActiveCompany()} |
                <span style="font-size: 11px; opacity: 0.8;">Datos actualizados: ${new Date().toLocaleString('es-ES')}</span>
              </div>
              <div>
                <button class="download-btn" onclick="window.print()">🖨️ Imprimir/PDF</button>
                <button class="close-btn" onclick="window.close()">✕ Cerrar</button>
              </div>
            </div>
            <div class="preview-content">
              <div class="pdf-viewer">
                ${result.rendered || content}
              </div>
            </div>
            <script>
              console.log('📊 Datos de contexto:', ${JSON.stringify(result.context || {}, null, 2)});
              console.log('🔧 Tipo de plantilla:', '${templateType}');
              
              // Add keyboard shortcuts
              document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                  window.close();
                } else if (e.ctrlKey && e.key === 'p') {
                  e.preventDefault();
                  window.print();
                }
              });
              
              // Focus window for keyboard shortcuts
              window.focus();
            </script>
          </body>
        </html>
      `;
      
      previewWindow.document.write(previewHTML);
      previewWindow.document.close();
      
      showQuickNotification('✅ Vista previa generada con datos reales', 'success');
      
    } catch (error) {
      console.error('Error in preview:', error);
      showQuickNotification('❌ Error en vista previa: ' + error.message, 'error');
      
      // Fallback to offline preview
      showOfflinePreview(content, templateType);
    }
  }

  function showOfflinePreview(content, templateType) {
    // Show preview without real data as fallback
    const previewWindow = window.open('', '_blank', 'width=850,height=1100,scrollbars=yes');
    
    const mockData = getMockDataForType(templateType);
    const processedContent = replaceMockVariables(content, mockData);
    
    const previewHTML = `
      <html>
        <head>
          <title>Vista Previa (Datos de Ejemplo) - ${templateType.toUpperCase()}</title>
          <meta charset="UTF-8">
          <style>
            body { 
              font-family: 'Arial', sans-serif; 
              margin: 0; 
              padding: 20px; 
              background: #525659; 
              color: #333;
            }
            .pdf-viewer {
              background: white;
              width: 21cm;
              min-height: 29.7cm;
              margin: 0 auto;
              padding: 2cm;
              box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            }
            .warning {
              background: #fff3cd;
              border: 1px solid #ffc107;
              color: #856404;
              padding: 15px;
              border-radius: 4px;
              margin-bottom: 20px;
              text-align: center;
            }
            .tpl-element {
              border: none !important;
              outline: none !important;
              box-shadow: none !important;
            }
            </style>
            <style id="template-css">${(window.currentTemplateSession && window.currentTemplateSession.contentCss) || ''}</style>
        </head>
        <body>
          <div class="pdf-viewer">
            <div class="warning">
              ⚠️ <strong>Vista Previa con Datos de Ejemplo</strong><br>
              <small>La API no está disponible. Los datos mostrados son ficticios.</small>
            </div>
            ${processedContent}
          </div>
        </body>
      </html>
    `;
    
    previewWindow.document.write(previewHTML);
    previewWindow.document.close();
  }

  function getMockDataForType(templateType) {
    const mockData = {
      company: {
        name: 'Taller Automotriz Ejemplo',
        address: 'Calle Principal #123, Centro',
        phone: '(555) 123-4567'
      },
      date: new Date().toLocaleDateString('es-ES'),
      customerName: 'Juan Carlos Pérez',
      customerPhone: '(555) 987-6543'
    };

    if (templateType === 'invoice') {
      return {
        ...mockData,
        sale: {
          number: 'F-2024-001',
          date: mockData.date,
          customerName: mockData.customerName,
          total: 1250.00,
          subtotal: 1077.59,
          tax: 172.41,
          vehicle: { plate: 'ABC-123', brand: 'Toyota Corolla' },
          items: [
            { description: 'Cambio de aceite', qty: 1, price: 450.00, total: 450.00 },
            { description: 'Revisión de frenos', qty: 1, price: 800.00, total: 800.00 }
          ]
        }
      };
    } else if (templateType === 'quote') {
      return {
        ...mockData,
        quote: {
          number: 'COT-2024-089',
          date: mockData.date,
          validUntil: new Date(Date.now() + 15*24*60*60*1000).toLocaleDateString('es-ES'),
          customerName: mockData.customerName,
          total: 2100.00,
          subtotal: 1810.34,
          tax: 289.66,
          vehicle: { plate: 'XYZ-789', brand: 'Honda Civic', model: '2020' },
          items: [
            { description: 'Diagnóstico completo', qty: 1, price: 300.00, total: 300.00 },
            { description: 'Reparación de transmisión', qty: 1, price: 1800.00, total: 1800.00 }
          ]
        }
      };
    } else if (templateType === 'workOrder') {
      return {
        ...mockData,
        workOrder: {
          number: 'OT-2024-156',
          startDate: mockData.date,
          estimatedDate: new Date(Date.now() + 3*24*60*60*1000).toLocaleDateString('es-ES'),
          customerName: mockData.customerName,
          status: 'En Proceso',
          estimatedCost: 1500.00,
          technician: 'Carlos Rodríguez',
          problemDescription: 'Vehículo presenta ruidos extraños al frenar',
          vehicle: { 
            plate: 'DEF-456', 
            brand: 'Nissan', 
            model: 'Sentra', 
            year: 2019,
            mileage: 45000 
          },
          tasks: [
            { description: 'Inspección del sistema de frenos', technician: 'Carlos Rodríguez' },
            { description: 'Reemplazo de pastillas de freno', technician: 'Carlos Rodríguez' }
          ]
        }
      };
    }
    
    return mockData;
  }

  function replaceMockVariables(content, data) {
    let result = content;
    
    // Simple variable replacement for offline preview
    const replacements = {
      '{{company.name}}': data.company?.name || 'Empresa Ejemplo',
      '{{company.address}}': data.company?.address || 'Dirección Ejemplo',
      '{{company.phone}}': data.company?.phone || 'Teléfono Ejemplo',
      '{{sale.number}}': data.sale?.number || 'NUM-EJEMPLO',
      '{{quote.number}}': data.quote?.number || 'COT-EJEMPLO', 
      '{{workOrder.number}}': data.workOrder?.number || 'OT-EJEMPLO'
    };

    Object.entries(replacements).forEach(([variable, value]) => {
      result = result.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), value);
    });
    
    return result;
  }

  function showQuickNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const colors = {
      'success': '#28a745',
      'error': '#dc3545', 
      'info': '#17a2b8'
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

  // Enhanced save function with redirect to template selector
  async function saveTemplateAndReturn() {
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
    console.log('📄 Contenido del canvas:', content.substring(0, 100) + '...');
    
    if ((!content || content.includes('Haz clic en los botones') || content.includes('Tu plantilla está vacía')) && !hasElements) {
      alert('❌ No se puede guardar una plantilla vacía.\n\nPor favor agrega contenido antes de guardar.');
      return;
    }

    console.log('🔍 Verificando disponibilidad de API...');
    console.log('API disponible:', typeof API !== 'undefined');
    
    // Verificación básica: solo verificar que API esté definido
    if (typeof API === 'undefined') {
      console.error('❌ API no está disponible');
      alert('❌ Error: API no disponible\n\nPor favor recarga la página y asegúrate de que config.js y api.js estén cargados correctamente.');
      return;
    }

    console.log('✅ API disponible, procediendo con el guardado...');

    console.log('✅ API disponible, procediendo con el guardado...');

    // Get template details from current session
    const session = window.currentTemplateSession;
    let templateName = session?.name;
    let templateType = session?.type || 'invoice';
    let isUpdate = session?.action === 'edit';

    // If creating new or name not set, ask user
    if (!templateName || session?.action === 'create') {
      templateName = prompt('📝 Nombre del formato:', templateName || `Nuevo ${getDocumentTypeName(templateType)}`);
      if (!templateName) return;
      
      // Update session name
      if (window.currentTemplateSession) {
        window.currentTemplateSession.name = templateName;
      }
    }

    const activate = isUpdate ? 
      confirm(`💾 ¿Actualizar formato existente "${templateName}"?\n\n✅ Sí - Actualizar formato\n❌ No - Cancelar`) :
      confirm(`📋 ¿Activar "${templateName}" como formato principal?\n\n✅ Sí - Activar como principal (Recomendado)\n❌ No - Guardar como borrador`);

    if (isUpdate && !activate) return; // User cancelled update

    try {
      showQuickNotification('💾 Guardando plantilla...', 'info');
      
      // Usar API para crear o actualizar plantilla
      let savedTemplate;
      
      if (isUpdate && session?.formatId) {
        // Actualizar plantilla existente
        savedTemplate = await API.templates.update(session.formatId, {
          name: templateName,
          contentHtml: content,
          contentCss: '', // Could be extracted from styles
          activate: activate
        });
      } else {
        // Crear nueva plantilla
        savedTemplate = await API.templates.create({
          name: templateName,
          type: templateType,
          contentHtml: content,
          contentCss: '', // Could be extracted from styles
          activate: activate
        });
      }
      
      // Show success message
      showQuickNotification(`✅ "${templateName}" guardada correctamente`, 'success');
      
      console.log('✅ Plantilla guardada exitosamente:', savedTemplate);
      console.log(`📋 Tipo: ${templateType}, Activada: ${activate}`);
      
      // Wait a moment to show the success message, then redirect
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
  }

  // Enhanced preview function with better error handling
  async function previewTemplateEnhanced() {
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

    // Auto-detect template type based on content or session
    let templateType = (sessionInfo && sessionInfo.type) || 'invoice';
    
    // Try to detect from content if session is not available
    if (!sessionInfo) {
      if (content.toLowerCase().includes('cotización')) {
        templateType = 'quote';
      } else if (content.toLowerCase().includes('orden de trabajo')) {
        templateType = 'workOrder';
      } else if (content.toLowerCase().includes('factura')) {
        templateType = 'invoice';
      }
    }

    console.log('🔍 Generando vista previa para tipo:', templateType);

    // Verificación básica: solo verificar que API esté definido
    if (typeof API === 'undefined') {
      console.error('❌ API no disponible para vista previa');
      alert('❌ Error: API no disponible\n\nPor favor recarga la página y asegúrate de que config.js y api.js estén cargados correctamente.');
      return;
    }

    try {
      showQuickNotification('🔄 Generando vista previa con datos reales...', 'info');
      
      const result = await API.templates.preview({
        type: templateType,
        contentHtml: content,
        contentCss: templateCss
      });
      
      console.log('📄 Respuesta de vista previa:', result);
      
      // Extract rendered content from response
      let renderedContent;
      if (typeof result === 'string') {
        renderedContent = result;
      } else if (result && result.rendered) {
        renderedContent = result.rendered;
      } else {
        // Fallback: use original content if preview fails
        console.warn('⚠️ No se pudo obtener contenido renderizado, usando original');
        renderedContent = content;
      }

      // Create preview window with enhanced styling
      const previewWindow = window.open('', '_blank', 'width=900,height=1200,scrollbars=yes,resizable=yes');
      
      if (!previewWindow) {
        alert('❌ No se pudo abrir la ventana de vista previa.\n\nVerifica que tu navegador no esté bloqueando ventanas emergentes.');
        return;
      }
      
      const company = 'Taller Automotriz'; // Simplified for now
      const currentDate = new Date().toLocaleString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const previewHTML = `
        <!DOCTYPE html>
        <html lang="es">
          <head>
            <title>Vista Previa PDF - ${getDocumentTypeName(templateType)} | ${company}</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              * { box-sizing: border-box; }
              
              body { 
                font-family: 'Arial', 'Helvetica', sans-serif; 
                margin: 0; 
                padding: 0; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #333;
                font-size: 14px;
                line-height: 1.4;
                min-height: 100vh;
              }
              
              .preview-header {
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                border-bottom: 1px solid rgba(0,0,0,0.1);
                padding: 15px 25px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                top: 0;
                z-index: 1000;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              
              .header-left {
                display: flex;
                align-items: center;
                gap: 15px;
              }
              
              .header-title {
                font-size: 18px;
                font-weight: 600;
                color: #2c3e50;
              }
              
              .header-info {
                font-size: 12px;
                color: #666;
                background: #f8f9fa;
                padding: 4px 8px;
                border-radius: 12px;
              }
              
              .header-buttons {
                display: flex;
                gap: 10px;
              }
              
              .btn {
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
              }
              
              .btn-primary { background: #007bff; color: white; }
              .btn-success { background: #28a745; color: white; }
              .btn-danger { background: #dc3545; color: white; }
              
              .btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              }
              
              .preview-container {
                padding: 40px 20px;
                display: flex;
                justify-content: center;
              }
              
              .pdf-viewer {
                background: white;
                width: 21cm;
                min-height: 29.7cm;
                padding: 2cm;
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                border-radius: 8px;
                position: relative;
                animation: slideUp 0.5s ease-out;
              }
              
              @keyframes slideUp {
                from {
                  opacity: 0;
                  transform: translateY(30px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
              
              /* Clean up template elements for print */
              .tpl-element {
                border: none !important;
                outline: none !important;
                box-shadow: none !important;
                color: #333 !important;
                /* No cambiar position/top/left/transform para respetar layout y rotaciones */
              }
              
              /* Ensure tables look good */
              table {
                border-collapse: collapse;
                width: 100%;
                margin: 15px 0;
              }
              
              th, td {
                border: 1px solid #333;
                padding: 8px 12px;
                text-align: left;
                font-size: 13px;
              }
              
              th {
                background-color: #f5f5f5;
                font-weight: bold;
              }
              
              /* Print styles */
              @media print {
                body { 
                  background: white !important; 
                  padding: 0; 
                  font-size: 12px;
                }
                .preview-header { display: none !important; }
                .preview-container { padding: 0; }
                .pdf-viewer { 
                  box-shadow: none !important; 
                  width: 100%; 
                  padding: 1cm;
                  min-height: auto;
                  border-radius: 0;
                }
              }
              
              /* Responsive design */
              @media (max-width: 1000px) {
                .pdf-viewer {
                  width: 95%;
                  padding: 1.5cm;
                }
                .header-title {
                  font-size: 16px;
                }
                .btn {
                  padding: 8px 15px;
                  font-size: 12px;
                }
              }
            </style>
            <style id="template-css">${(result && result.css) || templateCss || ''}</style>
          </head>
          <body>
            <div class="preview-header">
              <div class="header-left">
                <div class="header-title">📄 Vista Previa PDF</div>
                <div class="header-info">${getDocumentTypeName(templateType)}</div>
                <div class="header-info">${company}</div>
                <div class="header-info">${currentDate}</div>
              </div>
              <div class="header-buttons">
                <button class="btn btn-success" onclick="window.print()" title="Imprimir o guardar como PDF">
                  🖨️ Imprimir/PDF
                </button>
                <button class="btn btn-primary" onclick="window.location.reload()" title="Recargar vista previa">
                  🔄 Actualizar
                </button>
                <button class="btn btn-danger" onclick="window.close()" title="Cerrar ventana">
                  ✕ Cerrar
                </button>
              </div>
            </div>
            
            <div class="preview-container">
              <div class="pdf-viewer">
                ${renderedContent}
              </div>
            </div>
            
            <script>
              console.log('📊 Vista previa generada exitosamente');
              console.log('🔧 Tipo de plantilla:', '${templateType}');
              try {
                console.log('📋 Contexto de datos:', ${JSON.stringify((result && result.context) || {})});
              } catch (e) {
                console.log('📋 Contexto de datos: [error al serializar]');
              }
              
              // Add keyboard shortcuts
              document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                  window.close();
                } else if (e.ctrlKey && e.key === 'p') {
                  e.preventDefault();
                  window.print();
                } else if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                  e.preventDefault();
                  window.location.reload();
                }
              });
              
              // Focus window for keyboard shortcuts
              window.focus();
              
              // Add loading indicator for print
              window.addEventListener('beforeprint', function() {
                document.title = '🖨️ Preparando impresión...';
              });
              
              window.addEventListener('afterprint', function() {
                document.title = 'Vista Previa PDF - ${getDocumentTypeName(templateType)} | ${company}';
              });
            </script>
          </body>
        </html>
      `;
      
      previewWindow.document.write(previewHTML);
      previewWindow.document.close();
      
      showQuickNotification('✅ Vista previa generada con datos reales', 'success');
      
    } catch (error) {
      console.error('❌ Error generating preview:', error);
      
      const errorMsg = `❌ Error al generar vista previa: ${error.message || 'Error desconocido'}`;
      showQuickNotification(errorMsg, 'error');
      
      console.error('❌ Vista previa falló completamente - no hay modo offline disponible');
    }
  }

  // Make functions globally available for button onclick handlers
  // These must be defined after the functions are declared
  window.saveTemplateToBackend = saveTemplateAndReturn;
  window.previewWithRealData = previewTemplateEnhanced;
  window.saveTemplateAndReturn = saveTemplateAndReturn;
  window.previewTemplateEnhanced = previewTemplateEnhanced;

  // Global error handler
  window.addEventListener('error', function(event) {
    const isProduction = window.IS_PRODUCTION || false;
    
    console.error('Error en aplicación:', event.error);
    
    // Mostrar errores críticos relacionados con conectividad
    if (event.error?.message?.includes('API') || 
        event.error?.message?.includes('network') || 
        event.error?.message?.includes('fetch')) {
      showQuickNotification('❌ Error crítico de conectividad', 'error');
      
      if (!isProduction) {
        // En desarrollo, mostrar más detalles
        console.error('Detalles del error:', event.error);
      }
    }
  });

  // Global unhandled promise rejection handler
  window.addEventListener('unhandledrejection', function(event) {
    const isProduction = window.IS_PRODUCTION || false;
    
    console.error('Promesa rechazada:', event.reason);
    
    if (event.reason?.message?.includes('fetch') || 
        event.reason?.message?.includes('network') ||
        event.reason?.message?.includes('API')) {
      showQuickNotification('❌ Error de conexión al servidor', 'error');
      
      if (!isProduction) {
        console.error('Detalles de promesa rechazada:', event.reason);
      }
    }
    
    event.preventDefault();
  });

})();
