// Editor Visual de Plantillas Completo para templates.html
// Sistema drag & drop con propiedades de texto, imágenes y elementos

(function(){
  const state = {
    templates: [],
    editing: null,
    mode: 'visual',
    exampleSnippets: {
      invoice: '', // Will be created dynamically with individual elements
      
      quote: `<!-- Cotización Completa -->
<div style="max-width: 800px; font-family: Arial, sans-serif; padding: 20px; background: white;">
  <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #28a745; padding-bottom: 15px;">
    <h1 style="color: #28a745; margin: 0; font-size: 28px;">COTIZACIÓN</h1>
    <h2 style="color: #666; margin: 5px 0; font-size: 20px;"># COT-2024-00289</h2>
  </div>
  
  <div style="display: flex; justify-content: space-between; margin-bottom: 25px;">
    <div style="flex: 1;">
      <h3 style="color: #28a745; margin: 0 0 10px 0;">TALLER AUTOMOTRIZ PÉREZ</h3>
      <p style="margin: 3px 0; color: #666;">Calle Principal #123, Centro</p>
      <p style="margin: 3px 0; color: #666;">Tel: (555) 123-4567</p>
      <p style="margin: 3px 0; color: #666;">contacto@tallerperez.com</p>
    </div>
    <div style="flex: 1; text-align: right;">
      <h3 style="color: #333; margin: 0 0 10px 0;">CLIENTE:</h3>
      <p style="margin: 3px 0; font-weight: bold;">María García López</p>
      <p style="margin: 3px 0; color: #666;">Tel: (555) 456-7890</p>
      <p style="margin: 3px 0; color: #666;">Fecha: 08/10/2024</p>
      <p style="margin: 3px 0; color: #666;">Válida hasta: 15/10/2024</p>
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
    <h2 style="color: #666; margin: 5px 0; font-size: 20px;"># OT-2024-00445</h2>
  </div>
  
  <div style="display: flex; justify-content: space-between; margin-bottom: 25px;">
    <div style="flex: 1;">
      <h3 style="color: #fd7e14; margin: 0 0 10px 0;">TALLER AUTOMOTRIZ PÉREZ</h3>
      <p style="margin: 3px 0; color: #666;">Calle Principal #123, Centro</p>
      <p style="margin: 3px 0; color: #666;">Tel: (555) 123-4567</p>
    </div>
    <div style="flex: 1; text-align: right;">
      <p style="margin: 3px 0; color: #666;"><strong>Fecha inicio:</strong> 08/10/2024</p>
      <p style="margin: 3px 0; color: #666;"><strong>Fecha estimada:</strong> 10/10/2024</p>
      <p style="margin: 3px 0; color: #666;"><strong>Estado:</strong> <span style="color: #28a745; font-weight: bold;">EN PROCESO</span></p>
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
          <small style="color: #666;">Incluye revisión de pastillas, discos, líquido y mangueras</small>
        </td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">
          <strong style="color: #fd7e14;">Carlos Mendoza</strong><br>
          <small style="color: #666;">Especialista en frenos</small>
        </td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">
          <span style="background: #ffc107; color: white; padding: 3px 8px; border-radius: 12px; font-size: 12px;">EN PROCESO</span>
        </td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">$1,850.00</td>
      </tr>
      <tr style="background: #f8f9fa;">
        <td style="border: 1px solid #ddd; padding: 12px;">
          <strong>Mantenimiento preventivo completo</strong><br>
          <small style="color: #666;">Cambio de aceite, filtros, revisión de niveles y sistemas</small>
        </td>
        <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">
          <strong style="color: #fd7e14;">Miguel Torres</strong><br>
          <small style="color: #666;">Mecánico general</small>
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
    <p style="color: #666; margin: 5px 0;"><strong>Responsable:</strong> Ing. Juan Pérez - Supervisor de Taller</p>
    <p style="color: #666; margin: 5px 0; font-size: 12px;">Cualquier cambio o trabajo adicional será consultado previamente con el cliente</p>
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

    // Make canvas suitable for visual editing
    canvas.style.cssText = `
      min-height: 500px;
      border: 2px dashed #ddd;
      padding: 20px;
      position: relative;
      background: #fff;
      overflow: visible;
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
    
    // Apply styles
    toolbar.style.cssText = 'padding: 15px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';

    toolbar.innerHTML = `
      <button id="add-title-btn" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">+ Título</button>
      <button id="add-text-btn" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">+ Texto</button>
      <button id="add-image-btn" style="padding: 8px 16px; background: #ffc107; color: black; border: none; border-radius: 4px; cursor: pointer;">+ Imagen</button>
      <button id="add-table-btn" style="padding: 8px 16px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">+ Tabla</button>
      <button id="add-items-table-btn" style="padding: 8px 16px; background: #6f42c1; color: white; border: none; border-radius: 4px; cursor: pointer;">+ Tabla Items</button>
      <button id="clear-canvas-btn" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Limpiar</button>
      
      <div style="border-left: 2px solid #ddd; padding-left: 15px; margin-left: 15px;">
        <label style="font-weight: 600; margin-right: 8px;">Plantillas:</label>
        <button id="load-invoice-btn" style="padding: 6px 12px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px;">Factura</button>
        <button id="load-quote-btn" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px;">Cotización</button>
        <button id="load-workorder-btn" style="padding: 6px 12px; background: #fd7e14; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 5px;">Orden Trabajo</button>
        <button id="load-sticker-btn" style="padding: 6px 12px; background: #6f42c1; color: white; border: none; border-radius: 4px; cursor: pointer;">Sticker</button>
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
    qs('#clear-canvas-btn').onclick = clearCanvas;
    
    // Setup template loading handlers
    qs('#load-invoice-btn').onclick = () => loadTemplate('invoice');
    qs('#load-quote-btn').onclick = () => loadTemplate('quote');
    qs('#load-workorder-btn').onclick = () => loadTemplate('workOrder');
    qs('#load-sticker-btn').onclick = () => loadTemplate('sticker');
    
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

    // Update variables panel indicator
    updateVariablesSelectionIndicator();

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
    
    canvas.innerHTML = `
      <div style="
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
    visualEditor.elements = [];
    visualEditor.selectedElement = null;
    selectElement(null);
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
    // Clear placeholder text
    canvas.innerHTML = '';

    // Create individual editable elements for invoice
    
    // 1. Header - Title and number
    const headerTitle = createEditableElement('title', 'FACTURA', {
      position: { left: 300, top: 30 },
      styles: { fontSize: '32px', fontWeight: 'bold', color: '#2563eb', textAlign: 'center' }
    });
    canvas.appendChild(headerTitle);

    const invoiceNumber = createEditableElement('text', '{{sale.number}}', {
      position: { left: 280, top: 80 },
      styles: { fontSize: '18px', color: '#666', textAlign: 'center' }
    });
    canvas.appendChild(invoiceNumber);

    // 2. Company info (left side)
    const companyTitle = createEditableElement('text', '{{company.name}}', {
      position: { left: 30, top: 140 },
      styles: { fontSize: '18px', fontWeight: 'bold', color: '#2563eb' }
    });
    canvas.appendChild(companyTitle);

    const companyAddress = createEditableElement('text', '{{company.address}}', {
      position: { left: 30, top: 170 },
      styles: { fontSize: '14px', color: '#666' }
    });
    canvas.appendChild(companyAddress);

    const companyPhone = createEditableElement('text', 'Tel: {{company.phone}}', {
      position: { left: 30, top: 195 },
      styles: { fontSize: '14px', color: '#666' }
    });
    canvas.appendChild(companyPhone);

    // 3. Customer info (right side)
    const customerLabel = createEditableElement('text', 'CLIENTE:', {
      position: { left: 500, top: 140 },
      styles: { fontSize: '16px', fontWeight: 'bold', color: '#333' }
    });
    canvas.appendChild(customerLabel);

    const customerName = createEditableElement('text', '{{sale.customerName}}', {
      position: { left: 500, top: 170 },
      styles: { fontSize: '14px', fontWeight: 'bold' }
    });
    canvas.appendChild(customerName);

    const saleDate = createEditableElement('text', 'Fecha: {{date sale.date}}', {
      position: { left: 500, top: 195 },
      styles: { fontSize: '14px', color: '#666' }
    });
    canvas.appendChild(saleDate);

    // 4. Vehicle info section
    const vehicleSection = createEditableElement('text', 'VEHÍCULO: {{sale.vehicle.plate}} - {{sale.vehicle.brand}}', {
      position: { left: 30, top: 250 },
      styles: { 
        fontSize: '14px', 
        backgroundColor: '#f8f9fa', 
        padding: '15px', 
        borderRadius: '8px',
        border: '1px solid #e9ecef',
        minWidth: '700px'
      }
    });
    canvas.appendChild(vehicleSection);

    // 5. Items table header
    const tableHeaderRow = createItemsTableHeader();
    tableHeaderRow.style.left = '30px';
    tableHeaderRow.style.top = '320px';
    canvas.appendChild(tableHeaderRow);

    // 6. Dynamic items section
    const itemsContainer = createEditableElement('text', '{{#each sale.items}}\n• {{qty}}x {{description}} - {{money total}}\n{{/each}}', {
      position: { left: 30, top: 360 },
      styles: { 
        fontSize: '14px',
        minHeight: '120px',
        minWidth: '700px',
        border: '1px solid #ddd',
        padding: '15px',
        backgroundColor: '#fff',
        fontFamily: 'monospace',
        whiteSpace: 'pre-line'
      }
    });
    canvas.appendChild(itemsContainer);

    // 7. Totals section (right aligned)
    const subtotalLabel = createEditableElement('text', 'Subtotal:', {
      position: { left: 500, top: 520 },
      styles: { fontSize: '14px', textAlign: 'right' }
    });
    canvas.appendChild(subtotalLabel);

    const subtotalValue = createEditableElement('text', '{{money sale.subtotal}}', {
      position: { left: 600, top: 520 },
      styles: { fontSize: '14px', fontWeight: 'bold', textAlign: 'right' }
    });
    canvas.appendChild(subtotalValue);

    const taxLabel = createEditableElement('text', 'IVA (16%):', {
      position: { left: 500, top: 550 },
      styles: { fontSize: '14px', textAlign: 'right' }
    });
    canvas.appendChild(taxLabel);

    const taxValue = createEditableElement('text', '{{money sale.tax}}', {
      position: { left: 600, top: 550 },
      styles: { fontSize: '14px', fontWeight: 'bold', textAlign: 'right' }
    });
    canvas.appendChild(taxValue);

    const totalLabel = createEditableElement('text', 'TOTAL:', {
      position: { left: 500, top: 590 },
      styles: { fontSize: '18px', fontWeight: 'bold', color: '#2563eb', textAlign: 'right' }
    });
    canvas.appendChild(totalLabel);

    const totalValue = createEditableElement('text', '{{money sale.total}}', {
      position: { left: 600, top: 590 },
      styles: { fontSize: '18px', fontWeight: 'bold', color: '#2563eb', textAlign: 'right' }
    });
    canvas.appendChild(totalValue);

    // 8. Footer
    const footer = createEditableElement('text', 'Garantía de 30 días en mano de obra | Válido solo con esta factura', {
      position: { left: 200, top: 650 },
      styles: { fontSize: '12px', color: '#666', textAlign: 'center' }
    });
    canvas.appendChild(footer);
  }

  function createEditableElement(type, content, options = {}) {
    const element = document.createElement('div');
    element.className = 'tpl-element';
    element.id = `element_${visualEditor.nextId++}`;
    
    // Default positioning
    const pos = options.position || { left: 20, top: 20 };
    element.style.position = 'absolute';
    element.style.left = pos.left + 'px';
    element.style.top = pos.top + 'px';
    element.style.cursor = 'move';
    element.style.border = '2px solid transparent';
    element.style.minWidth = '100px';
    element.style.minHeight = '20px';

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
      min-width: 700px;
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
      min-width: 700px;
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
          <tr style="background: #f8f9fa;">
            <td colspan="4" style="border: 1px solid #ddd; padding: 15px; font-family: monospace; background: #fff3cd; color: #856404; text-align: center;">
              <strong>{{#each sale.items}}</strong><br>
              <div style="display: flex; border-bottom: 1px solid #ddd; padding: 8px 0;">
                <div style="width: 80px; text-align: center;">{{qty}}</div>
                <div style="flex: 1; padding-left: 10px;">{{description}}</div>
                <div style="width: 120px; text-align: right;">{{money price}}</div>
                <div style="width: 120px; text-align: right; font-weight: bold;">{{money total}}</div>
              </div>
              <strong>{{/each}}</strong>
            </td>
          </tr>
          <tr>
            <td colspan="4" style="border: 1px solid #ddd; padding: 8px; text-align: center; color: #666; font-size: 12px;">
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

    // Wrap the entire template in a draggable container
    const wrapper = document.createElement('div');
    wrapper.className = 'tpl-element template-wrapper';
    wrapper.id = `element_${visualEditor.nextId++}`;
    wrapper.style.cssText = 'position: absolute; left: 20px; top: 20px; cursor: move; border: 2px solid transparent;';
    
    // Move all canvas content into the wrapper
    while (container.firstChild) {
      wrapper.appendChild(container.firstChild);
    }
    
    container.appendChild(wrapper);
    
    // Make the wrapper draggable and selectable
    makeDraggable(wrapper);
    makeSelectable(wrapper);
    
    // Add to elements array
    visualEditor.elements.push({
      id: wrapper.id,
      type: 'template',
      element: wrapper
    });
    
    // Select the loaded template
    selectElement(wrapper);
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
        { label: 'Tabla de items', value: '{{#each sale.items}}\n<tr><td>{{qty}}</td><td>{{description}}</td><td>{{money price}}</td><td>{{money total}}</td></tr>\n{{/each}}' },
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

    // Create user-friendly variable interface
    const html = `
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">📋 Información de la Empresa</h4>
        ${createFriendlyButtons([
          { label: 'Nombre de mi taller', icon: '🏢', value: '{{company.name}}' },
          { label: 'Mi dirección', icon: '📍', value: '{{company.address}}' },
          { label: 'Mi teléfono', icon: '📞', value: '{{company.phone}}' }
        ])}
      </div>

      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">💰 Datos de la Venta</h4>
        ${createFriendlyButtons([
          { label: 'Número de factura', icon: '#️⃣', value: '{{sale.number}}' },
          { label: 'Fecha de hoy', icon: '📅', value: '{{date sale.date}}' },
          { label: 'Total a cobrar', icon: '💵', value: '{{money sale.total}}' },
          { label: 'Subtotal (sin IVA)', icon: '💴', value: '{{money sale.subtotal}}' }
        ])}
      </div>

      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">👤 Datos del Cliente</h4>
        ${createFriendlyButtons([
          { label: 'Nombre del cliente', icon: '👤', value: '{{sale.customerName}}' },
          { label: 'Teléfono del cliente', icon: '📱', value: '{{sale.customerPhone}}' }
        ])}
      </div>

      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">🚗 Datos del Vehículo</h4>
        ${createFriendlyButtons([
          { label: 'Placa del carro', icon: '🚗', value: '{{sale.vehicle.plate}}' },
          { label: 'Marca y modelo', icon: '🏷️', value: '{{sale.vehicle.brand}}' }
        ])}
      </div>

      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">🔧 Lista de Trabajos</h4>
        <div style="background: #fff3cd; padding: 10px; border-radius: 6px; border: 1px solid #ffc107; margin-bottom: 8px;">
          <small style="color: #856404; font-size: 11px;">💡 Estos botones crean listas automáticas de todos los trabajos</small>
        </div>
        ${createFriendlyButtons([
          { label: 'Lista simple de trabajos', icon: '📝', value: '{{#each sale.items}}• {{qty}}x {{description}} - {{money total}}\\n{{/each}}', multiline: true },
          { label: 'Solo nombres de trabajos', icon: '🔧', value: '{{#each sale.items}}{{description}}{{#unless @last}}, {{/unless}}{{/each}}', multiline: true }
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
    const selectedEl = visualEditor.selectedElement;
    
    // If there's a selected element, add to it
    if (selectedEl) {
      const contentEl = selectedEl.querySelector('[contenteditable="true"]');
      if (contentEl) {
        // Add variable at cursor position or append
        if (isMultiline) {
          contentEl.style.whiteSpace = 'pre-line';
          contentEl.style.minHeight = '60px';
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
        
        // Show feedback
        showInsertionFeedback(contentEl, '✅ Variable agregada');
        return;
      }
    }
    
    // Create new element for the variable
    const canvas = qs('#ce-canvas');
    if (!canvas) return;
    
    // Clear placeholder if exists
    if (canvas.innerHTML.includes('Haz clic en los botones')) {
      canvas.innerHTML = '';
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
        minHeight: '60px',
        fontFamily: 'monospace',
        backgroundColor: '#f8f9fa',
        padding: '10px',
        border: '1px solid #dee2e6',
        borderRadius: '4px'
      };
    }
    
    const newElement = createEditableElement(elementType, content, {
      position: { left: 50, top: 50 + (visualEditor.elements.length * 40) },
      styles: styles
    });
    
    canvas.appendChild(newElement);
    selectElement(newElement);
    
    // Show success message
    showInsertionFeedback(newElement, '✅ Variable creada como nuevo elemento');
  };

  // Global function to insert items table
  window.insertItemsTable = function() {
    addItemsTable();
    
    // Show feedback
    const canvas = qs('#ce-canvas');
    if (canvas) {
      showInsertionFeedback(canvas, '✅ Tabla de trabajos creada');
    }
  };

  function showInsertionFeedback(element, message) {
    // Create feedback tooltip
    const feedback = document.createElement('div');
    feedback.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #28a745;
      color: white;
      padding: 10px 15px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      z-index: 3000;
      box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
      animation: slideInRight 0.3s ease-out;
    `;
    feedback.textContent = message;
    
    document.body.appendChild(feedback);
    
    // Add animation styles
    if (!document.querySelector('#feedback-animations')) {
      const animationStyle = document.createElement('style');
      animationStyle.id = 'feedback-animations';
      animationStyle.textContent = `
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(animationStyle);
    }
    
    // Remove after 3 seconds
    setTimeout(() => {
      feedback.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.remove();
        }
      }, 300);
    }, 3000);
  }

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

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    console.log('🎨 Inicializando Editor Visual Completo...');
    
    try {
      // Check if API is available
      if (typeof API === 'undefined') {
        console.warn('API no está disponible, funcionando en modo offline');
        // Initialize without backend features
        setupVisualEditor();
        setupVariables();
        setupKeyboardShortcuts();
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
        return;
      }
      
      console.log(`📋 Editor iniciado para empresa: ${activeCompany}`);
      
      setupVisualEditor();
      setupVariables();
      setupKeyboardShortcuts();
      
      // Add company indicator to the interface
      addCompanyIndicator(activeCompany);
      
      // Load existing templates from backend
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
      saveBtn.onclick = function() {
        saveTemplateToBackend();
      };
    }
    
    const previewBtn = qs('#preview-template');
    if (previewBtn) {
      previewBtn.onclick = function() {
        previewWithRealData();
      };
    }
    
    console.log('✅ Editor Visual inicializado correctamente');
  });

  // Backend API integration functions
  async function saveTemplateToBackend() {
    const canvas = qs('#ce-canvas');
    if (!canvas) return;

    const content = canvas.innerHTML;
    if (!content || content.includes('Haz clic en los botones')) {
      alert('Por favor crea contenido antes de guardar');
      return;
    }

    // Check if API is available
    if (typeof API === 'undefined') {
      alert('API no disponible. No se puede guardar en el servidor.');
      console.log('Contenido que se guardaría:', content);
      return;
    }

    // Ask user for template details
    const templateName = prompt('Nombre de la plantilla:');
    if (!templateName) return;

    const templateType = prompt('Tipo de plantilla (invoice, quote, workOrder, sticker):', 'invoice');
    if (!templateType) return;

    const activate = confirm('¿Activar como plantilla principal para este tipo?');

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
      alert(`Plantilla "${templateName}" guardada exitosamente para ${company}!`);
      console.log('Plantilla guardada:', savedTemplate);
      
      // Refresh template list
      if (typeof loadExistingTemplates === 'function') {
        loadExistingTemplates();
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error al guardar la plantilla: ' + error.message);
    }
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

    const content = canvas.innerHTML;
    if (!content || content.includes('Haz clic en los botones')) {
      alert('Por favor crea contenido antes de hacer vista previa');
      return;
    }

    // Default to invoice for now since we're focusing on it
    const templateType = 'invoice';

    try {
      const result = await API.templates.preview({
        type: templateType,
        contentHtml: content,
        contentCss: ''
      });
        
      // Show preview in new window
      const previewWindow = window.open('', '_blank', 'width=800,height=600');
      previewWindow.document.write(`
        <html>
          <head>
            <title>Vista Previa con Datos Reales - ${templateType} (${API.getActiveCompany()})</title>
            <style>
              body { font-family: Arial; padding: 20px; background: #f5f5f5; }
              .preview-container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              ${result.css || ''}
            </style>
          </head>
          <body>
            <div class="preview-container">
              <h2>Vista Previa con Datos Reales (${templateType.toUpperCase()})</h2>
              <p style="color: #666; font-size: 12px; margin-bottom: 20px;">Empresa: ${API.getActiveCompany()}</p>
              <hr style="margin-bottom: 20px;">
              ${result.rendered}
            </div>
            <script>
              // Add context info
              console.log('Contexto de datos:', ${JSON.stringify(result.context, null, 2)});
            </script>
          </body>
        </html>
      `);
      previewWindow.document.close();
    } catch (error) {
      console.error('Error in preview:', error);
      alert('Error en vista previa: ' + error.message);
    }
  }
})();