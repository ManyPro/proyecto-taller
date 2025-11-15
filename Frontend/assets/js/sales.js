import { API } from './api.esm.js';
import { loadFeatureOptionsAndRestrictions, getFeatureOptions, gateElement } from './feature-gating.js';

const $  = (s, r=document)=>r.querySelector(s);
const clone = (id)=>document.getElementById(id)?.content?.firstElementChild?.cloneNode(true);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));
const htmlEscape = (str) => {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
};

// Función para restaurar variables Handlebars acortadas antes de enviar al backend
function restoreHandlebarsVarsForPreview(html) {
  if (!html) return html;
  
  console.log('[restoreHandlebarsVarsForPreview] Iniciando restauración, HTML length:', html.length);
  const hasShortNumber = html.includes('{{#if S.nº}}');
  console.log('[restoreHandlebarsVarsForPreview] HTML tiene expresión acortada de número:', hasShortNumber);
  
  // Restaurar variables acortadas a su forma completa
  const replacements = [
    // Variables de cliente
    { from: /\{\{C\.nombre\}\}/g, to: '{{sale.customer.name}}' },
    { from: /\{\{C\.email\}\}/g, to: '{{sale.customer.email}}' },
    { from: /\{\{C\.tel\}\}/g, to: '{{sale.customer.phone}}' },
    { from: /\{\{C\.dir\}\}/g, to: '{{sale.customer.address}}' },
    // Variables de venta
    // IMPORTANTE: Restaurar expresión completa ANTES que variables individuales
    { from: /\{\{#if S\.nº\}\}\{\{S\.nº\}\}\{\{else\}\}\[Sin nº\]\{\{\/if\}\}/g, to: '{{#if sale.formattedNumber}}{{sale.formattedNumber}}{{else}}{{#if sale.number}}{{pad sale.number}}{{else}}[Sin número]{{/if}}{{/if}}' },
    { from: /\{\{pad S\.nº\}\}/g, to: '{{pad sale.number}}' },
    { from: /\{\{S\.nº\}\}/g, to: '{{sale.formattedNumber}}' }, // Restaurar S.nº a formattedNumber, no a number
    { from: /\{\{S\.total\}\}/g, to: '{{sale.total}}' },
    { from: /\{\{\$ S\.total\}\}/g, to: '{{money sale.total}}' },
    { from: /\{\{S\.fecha\}\}/g, to: '{{sale.date}}' },
    { from: /\{\{date S\.fecha\}\}/g, to: '{{date sale.date}}' },
    // Variables de empresa
    { from: /\{\{E\.nombre\}\}/g, to: '{{company.name}}' },
    { from: /\{\{E\.email\}\}/g, to: '{{company.email}}' },
    { from: /\{\{E\.logo\}\}/g, to: '{{company.logoUrl}}' },
    // Variables de agrupación
    { from: /\{\{#if S\.P\}\}/g, to: '{{#if sale.itemsGrouped.hasProducts}}' },
    { from: /\{\{#if S\.S\}\}/g, to: '{{#if sale.itemsGrouped.hasServices}}' },
    { from: /\{\{#if S\.C\}\}/g, to: '{{#if sale.itemsGrouped.hasCombos}}' },
    { from: /\{\{#each S\.P\}\}/g, to: '{{#each sale.itemsGrouped.products}}' },
    { from: /\{\{#each S\.S\}\}/g, to: '{{#each sale.itemsGrouped.services}}' },
    { from: /\{\{#each S\.C\}\}/g, to: '{{#each sale.itemsGrouped.combos}}' },
    // Variables de items
    { from: /\{\{nom\}\}/g, to: '{{name}}' },
    { from: /\{\{cant\}\}/g, to: '{{qty}}' },
    { from: /\{\{precio\}\}/g, to: '{{unitPrice}}' },
    { from: /\{\{\$ precio\}\}/g, to: '{{money unitPrice}}' },
    { from: /\{\{tot\}\}/g, to: '{{total}}' },
    { from: /\{\{\$ tot\}\}/g, to: '{{money total}}' },
    // Variables de vehículo
    { from: /\{\{V\.placa\}\}/g, to: '{{sale.vehicle.plate}}' },
    { from: /\{\{V\.marca\}\}/g, to: '{{sale.vehicle.brand}}' },
    { from: /\{\{V\.modelo\}\}/g, to: '{{sale.vehicle.model}}' },
    { from: /\{\{V\.año\}\}/g, to: '{{sale.vehicle.year}}' },
    // Variables de cotización
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
    // Restaurar detalles de tabla
    { from: /\{\{#if sku\}\}\[\{\{sku\}\}\] \{\{\/if\}\}\{\{nom\}\}/g, to: '{{#if sku}}[{{sku}}] {{/if}}{{name}}' },
    // Variables de agrupación negativas
    { from: /\{\{#unless S\.P\}\}/g, to: '{{#unless sale.itemsGrouped.hasProducts}}' },
    { from: /\{\{#unless S\.S\}\}/g, to: '{{#unless sale.itemsGrouped.hasServices}}' },
    { from: /\{\{#unless S\.C\}\}/g, to: '{{#unless sale.itemsGrouped.hasCombos}}' },
  ];
  
  let result = html;
  replacements.forEach(({ from, to }) => {
    const before = result;
    result = result.replace(from, to);
    if (before !== result && from.toString().includes('S.nº')) {
      console.log('[restoreHandlebarsVarsForPreview] Reemplazo aplicado:', {
        pattern: from.toString().substring(0, 50),
        replacement: to.substring(0, 50)
      });
    }
  });
  
  const hasFullNumberAfter = result.includes('{{#if sale.formattedNumber}}');
  const stillHasShortNumber = result.includes('{{#if S.nº}}');
  console.log('[restoreHandlebarsVarsForPreview] Después de restauración:', {
    hasFullNumber: hasFullNumberAfter,
    stillHasShortNumber: stillHasShortNumber,
    sample: result.match(/Nº:.*?\{\{.*?\}\}/)?.[0]?.substring(0, 150)
  });
  
  return result;
}

function padSaleNumber(n){
  return String(n ?? '').toString().padStart(5,'0');
}

function describeCustomer(customer){
  const c = customer || {};
  const parts = [];
  if (c.name) parts.push(c.name);
  if (c.idNumber) parts.push('ID: ' + c.idNumber);
  if (c.phone) parts.push('Tel: ' + c.phone);
  if (c.email) parts.push(c.email);
  if (c.address) parts.push(c.address);
  return parts.join(' | ') || 'N/A';
}

function describeVehicle(vehicle){
  const v = vehicle || {};
  const parts = [];
  if (v.plate) parts.push(v.plate);
  const specs = [v.brand, v.line, v.engine].filter(Boolean).join(' ');
  if (specs) parts.push(specs.trim());
  if (v.year) parts.push('Año ' + v.year);
  if (v.mileage != null) parts.push((v.mileage || 0) + ' km');
  return parts.join(' | ') || 'N/A';
}

function printSaleTicket(sale){
  if(!sale) return;
  function fallback(){
    const number = padSaleNumber(sale.number || sale._id || '');
    const linesOut = [
      'Remisión simple',
      '',
      '# ' + number + '  Total: ' + money(sale.total || 0),
      '',
      'Cliente: ' + describeCustomer(sale.customer),
      'Vehículo: ' + describeVehicle(sale.vehicle),
      '',
      'Items:'
    ];
    (sale.items || []).forEach(it => {
      linesOut.push('- ' + (it.qty || 0) + ' x ' + (it.name || it.sku || '') + ' (' + money(it.total || 0) + ')');
    });
    const txt = linesOut.join('\n');
    const win = window.open('', '_blank');
    if (!win) { alert('No se pudo abrir ventana de impresión'); return; }
    win.document.write('<pre>' + txt + '</pre>');
    win.document.close(); win.focus(); win.print(); try { win.close(); } catch {}
  }
  // Intento con plantilla activa invoice
  if(API?.templates?.active){
    API.templates.active('invoice')
      .then(tpl=>{
        console.log('[printSaleTicket] Template activo recibido:', {
          hasTemplate: !!tpl,
          hasContentHtml: !!(tpl?.contentHtml),
          contentHtmlLength: tpl?.contentHtml?.length || 0,
          hasContentCss: !!(tpl?.contentCss),
          templateId: tpl?._id,
          templateName: tpl?.name
        });
        if(!tpl || !tpl.contentHtml){ 
          console.warn('[printSaleTicket] No hay template activo o contentHtml está vacío, usando fallback');
          fallback(); 
          return; 
        }
        console.log('[printSaleTicket] Usando template guardado:', tpl.name || tpl._id);
        console.log('[printSaleTicket] HTML del template (primeros 500 chars):', tpl.contentHtml?.substring(0, 500));
        
        // Restaurar variables acortadas antes de enviar al preview
        const restoredHtml = restoreHandlebarsVarsForPreview(tpl.contentHtml);
        console.log('[printSaleTicket] Variables restauradas, HTML length:', restoredHtml?.length);
        
        // Verificar el HTML original antes de restaurar
        const hasShortNumberInOriginal = tpl.contentHtml?.includes('{{#if S.nº}}');
        const hasShortNumberInRestored = restoredHtml?.includes('{{#if S.nº}}');
        const hasFullNumberInRestored = restoredHtml?.includes('{{#if sale.formattedNumber}}');
        console.log('[printSaleTicket] Verificación de número:', {
          originalHasShort: hasShortNumberInOriginal,
          restoredHasShort: hasShortNumberInRestored,
          restoredHasFull: hasFullNumberInRestored,
          originalSample: tpl.contentHtml?.match(/Nº:.*?\{\{.*?\}\}/)?.[0]?.substring(0, 100),
          restoredSample: restoredHtml?.match(/Nº:.*?\{\{.*?\}\}/)?.[0]?.substring(0, 100)
        });
        
        console.log('[printSaleTicket] Verificando variables en HTML:', {
          hasSaleItems: restoredHtml?.includes('{{#each sale.items}}') || restoredHtml?.includes('{{#if sale.itemsGrouped.hasProducts}}'),
          hasSaleNumber: restoredHtml?.includes('{{sale.number}}') || restoredHtml?.includes('{{pad sale.number}}') || restoredHtml?.includes('{{sale.formattedNumber}}'),
          hasSaleCustomer: restoredHtml?.includes('{{sale.customer'),
          hasSaleTotal: restoredHtml?.includes('{{sale.total}}') || restoredHtml?.includes('{{money sale.total}}'),
          hasMoneyHelper: restoredHtml?.includes('{{money'),
          hasFormattedNumberExpression: restoredHtml?.includes('{{#if sale.formattedNumber}}'),
          hasShortNumberExpression: restoredHtml?.includes('{{#if S.nº}}'),
          sampleNumberExpression: restoredHtml?.match(/\{\{#if.*?sale\.(formattedNumber|number).*?\}\}/)?.[0] || 'NO ENCONTRADA'
        });
        
        // Verificar específicamente la expresión del número
        const numberExpressions = restoredHtml?.match(/\{\{#if.*?S\.nº.*?\}\}[\s\S]*?\{\{\/if\}\}/g) || [];
        console.log('[printSaleTicket] Expresiones de número encontradas (acortadas):', numberExpressions);
        const fullNumberExpressions = restoredHtml?.match(/\{\{#if.*?sale\.(formattedNumber|number).*?\}\}[\s\S]*?\{\{\/if\}\}/g) || [];
        console.log('[printSaleTicket] Expresiones de número encontradas (completas):', fullNumberExpressions);
        
        // Extraer y mostrar el contenido del tbody del template
        const templateTbodyMatch = restoredHtml?.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
        if (templateTbodyMatch) {
          console.log('[printSaleTicket] Tablas encontradas en template:', templateTbodyMatch.length);
          templateTbodyMatch.forEach((match, idx) => {
            console.log(`[printSaleTicket] Template tbody ${idx + 1} (COMPLETO):`, match);
            console.log(`[printSaleTicket] Template tbody ${idx + 1} tiene {{#each sale.items}}:`, match.includes('{{#each sale.items}}'));
            console.log(`[printSaleTicket] Template tbody ${idx + 1} tiene {{#unless sale.items}}:`, match.includes('{{#unless sale.items}}'));
          });
        } else {
          console.warn('[printSaleTicket] ⚠️ NO se encontraron tablas <tbody> en el template guardado!');
        }
        return API.templates.preview({ type:'invoice', contentHtml: restoredHtml, contentCss: tpl.contentCss || '', sampleId: sale._id })
          .then(r=>{
            console.log('[printSaleTicket] ===== PREVIEW RECIBIDO =====');
            console.log('[printSaleTicket] Has rendered:', !!r.rendered);
            console.log('[printSaleTicket] Rendered length:', r.rendered?.length || 0);
            console.log('[printSaleTicket] Has CSS:', !!r.css);
            console.log('[printSaleTicket] Context sale items count:', r.context?.sale?.items?.length || 0);
            console.log('[printSaleTicket] Context sale items:', JSON.stringify(r.context?.sale?.items || [], null, 2));
            console.log('[printSaleTicket] Context sale number:', r.context?.sale?.number);
            console.log('[printSaleTicket] Context sale formattedNumber:', r.context?.sale?.formattedNumber);
            console.log('[printSaleTicket] Context sale tiene number:', !!r.context?.sale?.number);
            console.log('[printSaleTicket] Context sale tiene formattedNumber:', !!r.context?.sale?.formattedNumber);
            console.log('[printSaleTicket] Context sale number type:', typeof r.context?.sale?.number);
            console.log('[printSaleTicket] Context sale formattedNumber type:', typeof r.context?.sale?.formattedNumber);
            
            // Verificar si el HTML renderizado tiene filas de tabla
            const renderedRows = (r.rendered?.match(/<tr>/g) || []).length;
            console.log('[printSaleTicket] Filas <tr> en HTML renderizado:', renderedRows);
            
            // Extraer fragmento renderizado de las tablas
            const renderedTableMatch = r.rendered?.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
            if (renderedTableMatch) {
              console.log('[printSaleTicket] Tablas renderizadas encontradas:', renderedTableMatch.length);
              renderedTableMatch.forEach((match, idx) => {
                console.log(`[printSaleTicket] Tabla renderizada ${idx + 1} (COMPLETA):`, match);
                console.log(`[printSaleTicket] Tabla ${idx + 1} tiene filas <tr>:`, (match.match(/<tr>/g) || []).length);
              });
            } else {
              console.warn('[printSaleTicket] ⚠️ NO se encontraron tablas renderizadas en el HTML!');
              // Buscar cualquier referencia a tablas
              console.log('[printSaleTicket] Buscando referencias a tablas en HTML...');
              console.log('[printSaleTicket] Tiene <table>:', r.rendered?.includes('<table'));
              console.log('[printSaleTicket] Tiene remission-table:', r.rendered?.includes('remission-table'));
              console.log('[printSaleTicket] Tiene items-table:', r.rendered?.includes('items-table'));
            }
            
            // Buscar si hay contenido de items en el HTML
            const firstItemName = r.context?.sale?.items?.[0]?.name;
            if (firstItemName) {
              console.log('[printSaleTicket] Buscando primer item en HTML:', firstItemName);
              console.log('[printSaleTicket] HTML contiene primer item:', r.rendered?.includes(firstItemName));
            }
            
            console.log('[printSaleTicket] Rendered preview (primeros 2000 chars):', r.rendered?.substring(0, 2000));
            console.log('[printSaleTicket] ===== FIN PREVIEW =====');
            
            const win = window.open('', '_blank');
            if(!win){ fallback(); return; }
            const css = r.css ? `<style>${r.css}</style>`:'';
            
            // Agregar script para logs en la ventana de impresión
            const debugScript = `
              <script>
                window.addEventListener('DOMContentLoaded', function() {
                  console.log('[VENTANA IMPRESION] Ventana abierta');
                  console.log('[VENTANA IMPRESION] HTML length:', document.body ? document.body.innerHTML.length : 'body no disponible');
                  const tables = document.querySelectorAll('table');
                  console.log('[VENTANA IMPRESION] Tablas encontradas:', tables.length);
                  tables.forEach((table, idx) => {
                    const rows = table.querySelectorAll('tr');
                    console.log(\`[VENTANA IMPRESION] Tabla \${idx + 1} tiene \${rows.length} filas\`);
                    rows.forEach((row, rowIdx) => {
                      console.log(\`[VENTANA IMPRESION] Tabla \${idx + 1}, Fila \${rowIdx}:\`, row.innerHTML.substring(0, 200));
                    });
                  });
                  const tbodyElements = document.querySelectorAll('tbody');
                  console.log('[VENTANA IMPRESION] Elementos tbody encontrados:', tbodyElements.length);
                  tbodyElements.forEach((tbody, idx) => {
                    console.log(\`[VENTANA IMPRESION] tbody \${idx + 1} contenido:\`, tbody.innerHTML.substring(0, 500));
                  });
                  
                  // Verificar si hay contenido de items
                  const hasItemsText = document.body.textContent.includes('CAMBIO DE ACEITE') || 
                                       document.body.textContent.includes('FILTRO') ||
                                       document.body.textContent.includes('Sin ítems');
                  console.log('[VENTANA IMPRESION] Contiene texto de items:', hasItemsText);
                  console.log('[VENTANA IMPRESION] Contiene "Sin ítems":', document.body.textContent.includes('Sin ítems'));
                });
              </script>
            `;
            
            win.document.write(`<!doctype html><html><head><meta charset='utf-8'>${css}${debugScript}
              <style>
                /* Estilos base para mejor uso del espacio */
                body {
                  margin: 0;
                  padding: 10mm;
                  font-family: Arial, sans-serif;
                  font-size: 12px;
                  line-height: 1.4;
                  color: #000;
                }
                
                /* Aumentar tamaño de fuente para mejor legibilidad en carta */
                h1, h2, h3 {
                  font-size: 1.5em !important;
                  margin: 0.5em 0 !important;
                }
                
                table {
                  width: 100%;
                  border-collapse: collapse;
                  font-size: 11px;
                }
                
                table th, table td {
                  padding: 8px 6px;
                  border: 1px solid #000;
                }
                
                table th {
                  font-weight: bold;
                  background: #f0f0f0;
                }
                
                /* Detectar tamaño de página automáticamente */
                @page {
                  size: auto;
                  margin: 10mm;
                }
                
                /* Estilos específicos para impresión del total y asegurar que quepa en una página */
                @media print {
                  body {
                    margin: 0 !important;
                    padding: 10mm !important;
                    overflow: hidden !important;
                    font-size: 12px !important;
                  }
                  
                  /* Aumentar tamaño de fuente en impresión */
                  h1, h2 {
                    font-size: 2em !important;
                  }
                  
                  table {
                    font-size: 11px !important;
                  }
                  
                  table th, table td {
                    padding: 10px 8px !important;
                  }
                  
                  .tpl-total-line,
                  .tpl-total-box {
                    position: absolute !important;
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    page-break-inside: avoid !important;
                    page-break-after: avoid !important;
                  }
                  .tpl-total-box {
                    border: 2px solid #000 !important;
                    background: white !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    font-size: 14px !important;
                    font-weight: bold !important;
                  }
                  /* Asegurar que la tabla no se corte */
                  table.remission-table {
                    page-break-inside: auto !important;
                  }
                  table.remission-table tr {
                    page-break-inside: avoid !important;
                  }
                }
              </style>
            </head><body>${r.rendered}</body></html>`);
            win.document.close(); 
            
            // Función para detectar si el contenido cabe en media carta y ajustar tamaño de página
            const detectAndSetPageSize = () => {
              const body = win.document.body;
              const html = win.document.documentElement;
              
              // Obtener altura total del contenido
              const contentHeight = Math.max(
                body.scrollHeight,
                body.offsetHeight,
                html.clientHeight,
                html.scrollHeight,
                html.offsetHeight
              );
              
              // Media carta: ~816px (21.6cm a 96 DPI) menos márgenes (~20mm = ~76px) = ~740px disponible
              // Carta completa: ~1054px (27.9cm a 96 DPI) menos márgenes = ~978px disponible
              // Ajustar umbrales para mejor detección
              const mediaCartaMaxHeight = 800; // px (más tolerante)
              const cartaMaxHeight = 1000; // px
              
              console.log('[printSaleTicket] Detectando tamaño de página:', {
                contentHeight,
                mediaCartaMaxHeight,
                cartaMaxHeight,
                fitsMediaCarta: contentHeight <= mediaCartaMaxHeight
              });
              
              // Crear o actualizar estilo para tamaño de página
              let pageSizeStyle = win.document.getElementById('dynamic-page-size');
              if (!pageSizeStyle) {
                pageSizeStyle = win.document.createElement('style');
                pageSizeStyle.id = 'dynamic-page-size';
                win.document.head.appendChild(pageSizeStyle);
              }
              
              if (contentHeight <= mediaCartaMaxHeight) {
                // Usar media carta (half-letter)
                pageSizeStyle.textContent = `
                  @page {
                    size: 5.5in 8.5in;
                    margin: 10mm;
                  }
                  @media print {
                    body {
                      max-height: 216mm !important;
                    }
                  }
                `;
                console.log('[printSaleTicket] ✅ Configurado para MEDIA CARTA (5.5" x 8.5")');
              } else {
                // Usar carta completa
                pageSizeStyle.textContent = `
                  @page {
                    size: letter;
                    margin: 10mm;
                  }
                  @media print {
                    body {
                      max-height: 279mm !important;
                    }
                  }
                `;
                console.log('[printSaleTicket] ✅ Configurado para CARTA COMPLETA (8.5" x 11")');
              }
            };
            
            // Función robusta para ajustar posición del total
            const adjustTotalPosition = () => {
              const table = win.document.querySelector('table.remission-table');
              const totalLine = win.document.querySelector('.tpl-total-line');
              const totalBox = win.document.querySelector('.tpl-total-box');
              
              if (!table) {
                console.log('[printSaleTicket] Tabla no encontrada aún, reintentando...');
                return false;
              }
              
              if (!totalLine && !totalBox) {
                console.log('[printSaleTicket] Total no encontrado aún, reintentando...');
                return false;
              }
              
              // Detectar tamaño de página primero
              detectAndSetPageSize();
              
              // Método más confiable: obtener posición y altura de la tabla
              // Usar múltiples métodos para asegurar precisión
              const tableRect = table.getBoundingClientRect();
              const scrollTop = win.pageYOffset || win.document.documentElement.scrollTop || win.document.body.scrollTop || 0;
              const scrollLeft = win.pageXOffset || win.document.documentElement.scrollLeft || win.document.body.scrollLeft || 0;
              
              // Obtener posición absoluta: posición relativa al viewport + scroll
              const tableTop = tableRect.top + scrollTop;
              const tableLeft = tableRect.left + scrollLeft;
              
              // Obtener ancho real de la tabla
              const tableWidth = Math.max(
                table.offsetWidth || 0,
                table.scrollWidth || 0,
                tableRect.width || 0,
                table.clientWidth || 0
              );
              
              // Obtener altura real de la tabla (usar el mayor valor para asegurar que incluya todo)
              const tableHeight = Math.max(
                table.offsetHeight || 0,
                table.scrollHeight || 0,
                tableRect.height || 0,
                table.clientHeight || 0
              );
              
              // Calcular nueva posición: inicio de tabla + altura + espacio adicional
              const newTop = tableTop + tableHeight + 10; // 10px de espacio adicional para evitar solapamiento
              
              // Obtener altura total del contenido para determinar límite máximo
              const body = win.document.body;
              const html = win.document.documentElement;
              const contentHeight = Math.max(
                body.scrollHeight,
                body.offsetHeight,
                html.clientHeight,
                html.scrollHeight,
                html.offsetHeight
              );
              
              // Ajustar límite máximo según tamaño de página detectado
              const mediaCartaMaxHeight = 800; // px (más tolerante)
              const maxTop = contentHeight <= mediaCartaMaxHeight ? 700 : 1100; // Límite más bajo para media carta
              const finalTop = Math.min(newTop, maxTop);
              
              console.log('[printSaleTicket] Ajustando total:', {
                tableRectTop: tableRect.top,
                scrollTop,
                tableTop,
                tableLeft,
                tableWidth,
                tableHeight,
                newTop,
                finalTop,
                maxTop,
                contentHeight,
                pageSize: contentHeight <= mediaCartaMaxHeight ? 'MEDIA CARTA' : 'CARTA COMPLETA',
                offsetHeight: table.offsetHeight,
                scrollHeight: table.scrollHeight,
                clientHeight: table.clientHeight,
                rectHeight: tableRect.height
              });
              
              if (totalLine) {
                totalLine.style.top = `${finalTop}px`;
                totalLine.style.left = `${tableLeft}px`;
                totalLine.style.width = `${tableWidth}px`;
                totalLine.style.position = 'absolute';
                totalLine.style.zIndex = '1000';
                totalLine.style.display = 'block';
                totalLine.style.visibility = 'visible';
              }
              if (totalBox) {
                totalBox.style.top = `${finalTop + 1}px`;
                totalBox.style.left = `${tableLeft}px`;
                totalBox.style.width = `${tableWidth}px`;
                totalBox.style.position = 'absolute';
                totalBox.style.zIndex = '1000';
                totalBox.style.display = 'block';
                totalBox.style.visibility = 'visible';
              }
              
              return true;
            };
            
            // Ajustar posición del total dinámicamente después de que se renderice la tabla
            // Múltiples intentos para asegurar que funcione
            win.addEventListener('DOMContentLoaded', () => {
              // Intentar inmediatamente
              setTimeout(() => {
                if (!adjustTotalPosition()) {
                  // Si falla, intentar de nuevo con más delay
                  setTimeout(() => {
                    if (!adjustTotalPosition()) {
                      setTimeout(adjustTotalPosition, 500);
                    }
                  }, 300);
                }
              }, 100);
              
              // También intentar después de que las imágenes se carguen
              setTimeout(adjustTotalPosition, 500);
              setTimeout(adjustTotalPosition, 1000);
              setTimeout(adjustTotalPosition, 2000);
            });
            
            // También ajustar cuando la ventana se carga completamente
            win.addEventListener('load', () => {
              setTimeout(adjustTotalPosition, 100);
              setTimeout(adjustTotalPosition, 500);
            });
            
            // CRÍTICO: Ajustar justo antes de imprimir
            win.addEventListener('beforeprint', () => {
              console.log('[printSaleTicket] Evento beforeprint - ajustando total...');
              adjustTotalPosition();
            });
            
            // Abrir diálogo de impresión automáticamente después de detectar tamaño y ajustar posición
            win.focus();
            
            // Esperar a que se cargue y ajuste todo, luego abrir diálogo de impresión automáticamente
            setTimeout(() => {
              // Ajustar posición del total
              adjustTotalPosition();
              
              // Esperar un poco más para asegurar que todo esté renderizado
              setTimeout(() => {
                adjustTotalPosition();
                detectAndSetPageSize();
                
                // Determinar tamaño de página para el modal
                const body = win.document.body;
                const html = win.document.documentElement;
                const contentHeight = Math.max(
                  body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight
                );
                const mediaCartaMaxHeight = 800;
                const isMediaCarta = contentHeight <= mediaCartaMaxHeight;
                const pageSize = isMediaCarta ? 'MEDIA CARTA (5.5" x 8.5")' : 'CARTA COMPLETA (8.5" x 11")';
                
                // Mostrar modal con el tamaño de página
                showPageSizeModal(pageSize, () => {
                  // Abrir diálogo de impresión automáticamente con el tamaño correcto
                  setTimeout(() => {
                    adjustTotalPosition();
                    requestAnimationFrame(() => {
                      adjustTotalPosition();
                      // Abrir diálogo de impresión automáticamente
                      win.print();
                    });
                  }, 300);
                });
              }, 500);
            }, 1000);
          })
          .catch((err)=>{
            console.error('[printSaleTicket] Error en preview:', err);
            fallback();
          });
      })
      .catch((err)=>{
        console.error('[printSaleTicket] Error obteniendo template activo:', err);
        fallback();
      });
  } else fallback();
}

// Función para mostrar modal de tamaño de hoja antes de imprimir
function showPageSizeModal(pageSize, onAccept) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/60 backdrop-blur-sm';
    modal.style.opacity = '0';
    modal.style.transition = 'opacity 0.2s ease-in-out';
    modal.innerHTML = `
      <div class="bg-gradient-to-br from-slate-800 to-slate-900 dark:from-slate-800 dark:to-slate-900 theme-light:from-white theme-light:to-slate-50 rounded-2xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 p-8 max-w-md w-full mx-4 transform transition-all">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-600/20 dark:bg-blue-600/20 theme-light:bg-blue-100 rounded-full mb-4">
            <svg class="w-8 h-8 text-blue-400 dark:text-blue-400 theme-light:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
          </div>
          <h3 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-2">Tamaño de Hoja Requerido</h3>
        </div>
        
        <div class="bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg p-6 mb-6 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-300">
          <div class="text-center">
            <div class="text-3xl font-bold text-blue-400 dark:text-blue-400 theme-light:text-blue-600 mb-2">${pageSize}</div>
            <p class="text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-600 mt-2">
              Asegúrate de configurar tu impresora con este tamaño antes de imprimir.
            </p>
          </div>
        </div>
        
        <div class="flex gap-3">
          <button id="page-size-cancel" class="flex-1 px-4 py-3 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-200 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-900 font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
            Cancelar
          </button>
          <button id="page-size-accept" class="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200">
            Aceptar
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const acceptBtn = modal.querySelector('#page-size-accept');
    const cancelBtn = modal.querySelector('#page-size-cancel');
    
    const closeModal = () => {
      modal.style.opacity = '0';
      const modalContent = modal.querySelector('div > div');
      if (modalContent) {
        modalContent.style.transform = 'scale(0.95)';
      }
      setTimeout(() => {
        modal.remove();
      }, 200);
    };
    
    acceptBtn.onclick = () => {
      closeModal();
      if (onAccept) onAccept();
      resolve(true);
    };
    
    cancelBtn.onclick = () => {
      closeModal();
      resolve(false);
    };
    
    // Cerrar al hacer clic fuera del modal
    modal.onclick = (e) => {
      if (e.target === modal) {
        closeModal();
        resolve(false);
      }
    };
    
    // Animación de entrada
    const modalContent = modal.querySelector('div > div');
    setTimeout(() => {
      modal.style.opacity = '1';
      if (modalContent) {
        modalContent.style.transform = 'scale(1)';
      }
    }, 10);
  });
}

// Imprimir Orden de Trabajo usando plantilla workOrder si existe
function printWorkOrder(){
  if(!current){ alert('No hay venta activa'); return; }
  const sale = current;
  function fallback(){
    const lines = [];
    lines.push('ORDEN DE TRABAJO');
    lines.push('# ' + padSaleNumber(sale.number||''));
    lines.push('Cliente: ' + describeCustomer(sale.customer));
    lines.push('Vehículo: ' + describeVehicle(sale.vehicle));
    lines.push('--- Ítems ---');
    (sale.items||[]).forEach(it=> lines.push('- '+ (it.qty||0) + ' x ' + (it.name||it.sku||'') ));
    const win = window.open('', '_blank');
    if(!win){ alert('No se pudo abrir impresión'); return; }
    win.document.write('<pre>'+lines.join('\n')+'</pre>');
    win.document.close(); win.focus(); win.print(); try{ win.close(); }catch{}
  }
  if(API?.templates?.active){
    API.templates.active('workOrder')
      .then(tpl=>{
        if(!tpl || !tpl.contentHtml){ fallback(); return; }
        // Restaurar variables acortadas antes de enviar al preview
        const restoredHtml = restoreHandlebarsVarsForPreview(tpl.contentHtml);
        return API.templates.preview({ type:'workOrder', contentHtml: restoredHtml, contentCss: tpl.contentCss, sampleId: sale._id })
          .then(r=>{
            console.log('[printWorkOrder] ===== PREVIEW RECIBIDO =====');
            console.log('[printWorkOrder] Has rendered:', !!r.rendered);
            console.log('[printWorkOrder] Rendered length:', r.rendered?.length || 0);
            console.log('[printWorkOrder] Context sale items count:', r.context?.sale?.items?.length || 0);
            console.log('[printWorkOrder] Context sale items:', JSON.stringify(r.context?.sale?.items || [], null, 2));
            
            // Verificar si el HTML renderizado tiene filas de tabla
            const renderedRows = (r.rendered?.match(/<tr>/g) || []).length;
            console.log('[printWorkOrder] Filas <tr> en HTML renderizado:', renderedRows);
            
            console.log('[printWorkOrder] ===== FIN PREVIEW =====');
            
            const win = window.open('', '_blank');
            if(!win){ fallback(); return; }
            const css = r.css? `<style>${r.css}</style>`:'';
            win.document.write(`<!doctype html><html><head><meta charset='utf-8'>${css}
              <style>
                /* Estilos base para mejor uso del espacio */
                body {
                  margin: 0;
                  padding: 10mm;
                  font-family: Arial, sans-serif;
                  font-size: 12px;
                  line-height: 1.4;
                  color: #000;
                }
                
                /* Aumentar tamaño de fuente para mejor legibilidad en carta */
                h1, h2, h3 {
                  font-size: 1.5em !important;
                  margin: 0.5em 0 !important;
                }
                
                table {
                  width: 100%;
                  border-collapse: collapse;
                  font-size: 11px;
                }
                
                table th, table td {
                  padding: 8px 6px;
                  border: 1px solid #000;
                }
                
                table th {
                  font-weight: bold;
                  background: #f0f0f0;
                }
                
                /* Detectar tamaño de página automáticamente */
                @page {
                  size: auto;
                  margin: 10mm;
                }
                
                /* Estilos específicos para impresión del total y asegurar que quepa en una página */
                @media print {
                  body {
                    margin: 0 !important;
                    padding: 10mm !important;
                    overflow: hidden !important;
                    font-size: 12px !important;
                  }
                  
                  /* Aumentar tamaño de fuente en impresión */
                  h1, h2 {
                    font-size: 2em !important;
                  }
                  
                  table {
                    font-size: 11px !important;
                  }
                  
                  table th, table td {
                    padding: 10px 8px !important;
                  }
                  
                  /* Asegurar que las tablas no se corten */
                  table.workorder-table,
                  table.remission-table {
                    page-break-inside: auto !important;
                  }
                  table.workorder-table tr,
                  table.remission-table tr {
                    page-break-inside: avoid !important;
                  }
                }
              </style>
            </head><body>${r.rendered}</body></html>`);
            win.document.close();
            
            // Función para detectar si el contenido cabe en media carta y ajustar tamaño de página
            const detectAndSetPageSize = () => {
              const body = win.document.body;
              const html = win.document.documentElement;
              
              // Obtener altura total del contenido
              const contentHeight = Math.max(
                body.scrollHeight,
                body.offsetHeight,
                html.clientHeight,
                html.scrollHeight,
                html.offsetHeight
              );
              
              // Media carta: ~816px (21.6cm a 96 DPI) menos márgenes (~20mm = ~76px) = ~740px disponible
              // Carta completa: ~1054px (27.9cm a 96 DPI) menos márgenes = ~978px disponible
              // Ajustar umbrales para mejor detección
              const mediaCartaMaxHeight = 800; // px (más tolerante)
              const cartaMaxHeight = 1000; // px
              
              console.log('[printWorkOrder] Detectando tamaño de página:', {
                contentHeight,
                mediaCartaMaxHeight,
                cartaMaxHeight,
                fitsMediaCarta: contentHeight <= mediaCartaMaxHeight
              });
              
              // Crear o actualizar estilo para tamaño de página
              let pageSizeStyle = win.document.getElementById('dynamic-page-size');
              if (!pageSizeStyle) {
                pageSizeStyle = win.document.createElement('style');
                pageSizeStyle.id = 'dynamic-page-size';
                win.document.head.appendChild(pageSizeStyle);
              }
              
              if (contentHeight <= mediaCartaMaxHeight) {
                // Usar media carta (half-letter)
                pageSizeStyle.textContent = `
                  @page {
                    size: 5.5in 8.5in;
                    margin: 10mm;
                  }
                  @media print {
                    body {
                      max-height: 216mm !important;
                    }
                  }
                `;
                console.log('[printWorkOrder] ✅ Configurado para MEDIA CARTA (5.5" x 8.5")');
              } else {
                // Usar carta completa
                pageSizeStyle.textContent = `
                  @page {
                    size: letter;
                    margin: 10mm;
                  }
                  @media print {
                    body {
                      max-height: 279mm !important;
                    }
                  }
                `;
                console.log('[printWorkOrder] ✅ Configurado para CARTA COMPLETA (8.5" x 11")');
              }
            };
            
            // Abrir diálogo de impresión automáticamente después de detectar tamaño
            win.focus();
            
            // Mostrar modal con el tamaño de página (siempre media carta para orden de trabajo)
            showPageSizeModal('MEDIA CARTA (5.5" x 8.5")', () => {
              // Forzar tamaño a media carta para orden de trabajo
              let pageSizeStyle = win.document.getElementById('dynamic-page-size');
              if (!pageSizeStyle) {
                pageSizeStyle = win.document.createElement('style');
                pageSizeStyle.id = 'dynamic-page-size';
                win.document.head.appendChild(pageSizeStyle);
              }
              pageSizeStyle.textContent = `
                @page {
                  size: 5.5in 8.5in;
                  margin: 10mm;
                }
                @media print {
                  body {
                    max-height: 216mm !important;
                  }
                }
              `;
              
              // Esperar a que se cargue y detectar tamaño de página, luego abrir diálogo de impresión automáticamente
              setTimeout(() => {
                detectAndSetPageSize();
                
                // Esperar un poco más para asegurar que todo esté renderizado
                setTimeout(() => {
                  detectAndSetPageSize();
                  
                  // Abrir diálogo de impresión automáticamente con el tamaño correcto
                  setTimeout(() => {
                    detectAndSetPageSize();
                    requestAnimationFrame(() => {
                      detectAndSetPageSize();
                      // Abrir diálogo de impresión automáticamente
                      win.print();
                    });
                  }, 300);
                }, 500);
              }, 1000);
            });
            
            // Detectar tamaño antes de imprimir también
            win.addEventListener('beforeprint', () => {
              console.log('[printWorkOrder] Evento beforeprint - detectando tamaño de página...');
              detectAndSetPageSize();
            });
          })
          .catch(()=> fallback());
      })
      .catch(()=> fallback());
  } else fallback();
}


let es = null;
let current = null;
let openSales = [];
let companyTechnicians = [];
let technicianSelectInitialized = false;
let starting = false;
let salesRefreshTimer = null;
let lastQuoteLoaded = null;
const QUOTE_LINK_KEY = 'sales:quoteBySale';
let saleQuoteLinks = loadSaleQuoteLinks();
const saleQuoteCache = new Map();
let saleQuoteRequestToken = 0;

function loadSaleQuoteLinks(){
  if (typeof localStorage === 'undefined') return {};
  try{
    const raw = localStorage.getItem(QUOTE_LINK_KEY);
    if(!raw) return {};
    const parsed = JSON.parse(raw);
    if(parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }catch{}
  return {};
}

function persistSaleQuoteLinks(){
  if (typeof localStorage === 'undefined') return;
  try{ localStorage.setItem(QUOTE_LINK_KEY, JSON.stringify(saleQuoteLinks)); }catch{}
}

function setSaleQuoteLink(saleId, quoteId){
  if(!saleId) return;
  if(quoteId){
    saleQuoteLinks[saleId] = quoteId;
  } else {
    delete saleQuoteLinks[saleId];
  }
  persistSaleQuoteLinks();
}

function getSaleQuoteId(saleId){
  return saleQuoteLinks?.[saleId] || '';
}

function ensureSaleQuoteLink(q){
  if(!current?._id) return;
  const quoteId = q?._id || q?.id || '';
  if(!quoteId) return;
  saleQuoteCache.set(quoteId, q);
  setSaleQuoteLink(current._id, quoteId);
}

async function renderQuoteForCurrentSale(){
  const saleId = current?._id;
  if(!saleId){
    renderQuoteMini(null);
    return;
  }
  
  // Primero verificar si hay una cotización vinculada a la venta
  let quoteId = getSaleQuoteId(saleId);
  
  // Si no hay cotización vinculada, verificar si hay una pendiente de cargar desde localStorage
  // (esto puede pasar cuando se crea la venta desde el calendario)
  if(!quoteId){
    const pendingQuoteId = localStorage.getItem('sales:lastQuoteId');
    if(pendingQuoteId){
      quoteId = pendingQuoteId;
      // Vincular la cotización a la venta
      try {
        const quote = await API.quoteGet(quoteId);
        if(quote){
          ensureSaleQuoteLink(quote);
          // Limpiar localStorage después de vincular
          localStorage.removeItem('sales:lastQuoteId');
        }
      } catch(err){
        console.warn('No se pudo cargar cotización pendiente:', err);
        localStorage.removeItem('sales:lastQuoteId');
      }
    }
  }
  
  if(!quoteId){
    renderQuoteMini(null);
    return;
  }
  
  const token = ++saleQuoteRequestToken;
  try{
    let quote = saleQuoteCache.get(quoteId);
    if(!quote){
      quote = await API.quoteGet(quoteId);
      if(quote) saleQuoteCache.set(quoteId, quote);
    }
    if(token !== saleQuoteRequestToken) return;
    if(quote){
      renderQuoteMini(quote);
    } else {
      setSaleQuoteLink(saleId, null);
      renderQuoteMini(null);
    }
  }catch(err){
    if(token === saleQuoteRequestToken){
      console.warn('No se pudo cargar la cotizacion vinculada', err);
      renderQuoteMini(null);
    }
  }
}

function mapQuoteItemToSale(it){
  const unit = Number(it.unitPrice ?? it.unit ?? 0) || 0;
  const qty  = Number(it.qty || 1) || 1;
  let source = it.source || it.kindSource || '';
  const refId = it.refId || it.refID || it.ref_id || null;
  const kindUpper = String(it.kind || it.type || '').toUpperCase();
  const hasComboParent = it.comboParent || it.combo_parent;
  
  // Si es tipo COMBO y tiene refId (es el combo principal), usar source='price' con refId
  // Los items anidados del combo (que también tienen kind='Combo' pero tienen comboParent)
  // NO deben pasarse como combos separados, sino que el backend los expandirá desde el combo principal
  if (kindUpper === 'COMBO' && !hasComboParent && refId) {
    // Es el combo principal, pasarlo como price con refId
    return { source:'price', refId: refId || undefined, qty, unitPrice:unit };
  }
  
  // Si es un item anidado de combo (tiene comboParent), NO pasarlo
  // El backend lo expandirá automáticamente desde el combo principal
  if (hasComboParent) {
    // Omitir items anidados del combo, el backend los agregará automáticamente
    return null;
  }
  
  // Si es combo pero no tiene refId ni comboParent, tratar como servicio
  if (kindUpper === 'COMBO' && !refId) {
    return {
      source:'service',
      name: it.description || it.name || 'Item',
      sku: it.sku || undefined,
      qty,
      unitPrice: unit
    };
  }
  
  if(!source && kindUpper === 'PRODUCTO' && (refId || it.sku)) source = 'inventory';
  if(source === 'inventory'){
    return { source:'inventory', refId: refId || undefined, sku: it.sku || undefined, qty, unitPrice:unit };
  }
  if(source === 'price'){
    return { source:'price', refId: refId || undefined, qty, unitPrice:unit };
  }
  return {
    source:'service',
    name: it.description || it.name || 'Item',
    sku: it.sku || undefined,
    qty,
    unitPrice: unit
  };
}

function labelForSale(sale) {
  const plate = sale?.vehicle?.plate || '';
  return plate ? `VENTA - ${plate.toUpperCase()}` : String(sale?._id || '').slice(-6).toUpperCase();
}

function syncCurrentIntoOpenList() {
  if (!current?._id) return;
  const idx = openSales.findIndex((s) => s._id === current._id);
  const copy = JSON.parse(JSON.stringify(current));
  if (idx >= 0) openSales[idx] = copy;
  else openSales.unshift(copy);
}

async function refreshOpenSales(options = {}) {
  const { focusId = null, preferCurrent = null } = options;
  try {
    const res = await API.sales.list({ status: 'draft', limit: 100 });
    const items = Array.isArray(res?.items) ? res.items : [];
    openSales = items;
    let targetId = focusId || preferCurrent?._id || current?._id || null;
    if (targetId) {
      const found = openSales.find((s) => s._id === targetId);
      if (found) {
        current = found;
      } else if (preferCurrent) {
        current = preferCurrent;
        syncCurrentIntoOpenList();
      } else if (current && current._id === targetId) {
        current = null;
      }
    }
    if (!current && openSales.length) current = openSales[0];
    renderTabs();
    renderSale();
    renderWO();
    await renderQuoteForCurrentSale();
  } catch (err) {
    console.error('refreshOpenSales failed', err);
  }
}

function startSalesAutoRefresh() {
  if (salesRefreshTimer) return;
  salesRefreshTimer = setInterval(() => {
    refreshOpenSales({ focusId: current?._id || null });
  }, 10000);
}

document.addEventListener('DOMContentLoaded', ()=>{
  const btnWO = document.getElementById('sv-print-wo');
  if(btnWO) btnWO.addEventListener('click', ()=> printWorkOrder());
});

let companyPrefs = { laborPercents: [] };
let techConfig = { laborKinds: [], technicians: [] };
// Función helper para extraer el nombre del técnico (reutilizable)
function extractTechnicianName(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj.trim();
  if (typeof obj === 'object') {
    if (obj.name) return String(obj.name).trim();
    // Si es un objeto con caracteres indexados (ej: {0: 'J', 1: 'o', 2: 'h', 3: 'n'})
    const keys = Object.keys(obj).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0) {
      return keys.map(k => String(obj[k] || '')).join('').trim();
    }
  }
  return '';
}

async function ensureCompanyData(){
  try { 
    const techs = await API.company.getTechnicians();
    // Normalizar técnicos: extraer solo los nombres como strings
    companyTechnicians = Array.isArray(techs) ? techs.map(t => extractTechnicianName(t)).filter(n => n && n.trim() !== '') : [];
  } catch { 
    companyTechnicians = []; 
  }
  try { companyPrefs = await API.company.getPreferences(); } catch { companyPrefs = { laborPercents: [] }; }
  try { 
    const response = await API.get('/api/v1/company/tech-config');
    techConfig = response?.config || response || { laborKinds: [], technicians: [] };
  } catch (err) { 
    techConfig = { laborKinds: [], technicians: [] }; 
  }
}

function buildCloseModalContent(){
  const total = current?.total || 0;
  const wrap = document.createElement('div');
  wrap.className = 'space-y-4';
  wrap.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 m-0">Cerrar venta</h3>
    </div>
    <div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-4">
      Total venta: <strong class="text-white dark:text-white theme-light:text-slate-900">${money(total)}</strong>
    </div>
    <div id="cv-payments-block" class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 p-4 mb-4">
      <div class="flex justify-between items-center mb-4">
        <strong class="text-base font-semibold text-white dark:text-white theme-light:text-slate-900">Formas de pago</strong>
        <button id="cv-add-payment" type="button" class="px-3 py-1.5 text-xs bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-sky-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-700 rounded-lg transition-colors duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">+ Agregar</button>
      </div>
      <table class="w-full text-xs border-collapse" id="cv-payments-table">
        <thead>
          <tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">
            <th class="py-2 px-2 text-left text-slate-300 dark:text-slate-300 theme-light:text-slate-700 font-semibold">Método</th>
            <th class="py-2 px-2 text-left text-slate-300 dark:text-slate-300 theme-light:text-slate-700 font-semibold">Cuenta</th>
            <th class="py-2 px-2 text-left text-slate-300 dark:text-slate-300 theme-light:text-slate-700 font-semibold w-24">Monto</th>
            <th class="py-2 px-2 w-8"></th>
          </tr>
        </thead>
        <tbody id="cv-payments-body"></tbody>
      </table>
      <div id="cv-payments-summary" class="mt-3 text-xs"></div>
    </div>
    <div id="cv-labor-commissions-block" class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 p-4 mb-4">
      <div class="flex justify-between items-center mb-4">
        <div>
          <label class="block text-base font-bold text-white dark:text-white theme-light:text-slate-900 mb-1">Desglose de mano de obra</label>
          <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Agrega líneas para asignar participación técnica. Los valores pueden venir del combo/servicio o ingresarse manualmente.</p>
        </div>
        <button id="cv-add-commission" type="button" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 text-sm whitespace-nowrap">+ Agregar línea</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs border-collapse">
          <thead>
            <tr class="border-b-2 border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-400 bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-sky-200">
              <th class="py-3 px-3 text-left text-slate-200 dark:text-slate-200 theme-light:text-slate-800 font-bold">Técnico</th>
              <th class="py-3 px-3 text-left text-slate-200 dark:text-slate-200 theme-light:text-slate-800 font-bold">Tipo de MO</th>
              <th class="py-3 px-3 text-right text-slate-200 dark:text-slate-200 theme-light:text-slate-800 font-bold">Valor MO</th>
              <th class="py-3 px-3 text-right text-slate-200 dark:text-slate-200 theme-light:text-slate-800 font-bold">% Técnico</th>
              <th class="py-3 px-3 text-right text-slate-200 dark:text-slate-200 theme-light:text-slate-800 font-bold">Participación</th>
              <th class="py-3 px-3 w-10"></th>
            </tr>
          </thead>
          <tbody id="cv-comm-body">
            <tr>
              <td colspan="6" class="py-8 text-center text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-sm">
                <div class="flex flex-col items-center gap-2">
                  <span>No hay líneas de participación técnica</span>
                  <span class="text-xs">Haz clic en "+ Agregar línea" para comenzar</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="hidden">
        <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Técnico (cierre)</label>
        <select id="cv-technician" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></select>
        <div id="cv-initial-tech" class="mt-2 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 hidden"></div>
      </div>
      <div class="hidden">
        <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">% Técnico (Mano de obra)</label>
        <select id="cv-laborPercent" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"></select>
        <input id="cv-laborPercentManual" type="number" min="0" max="100" step="0.1" placeholder="Ej: 15.5" class="w-full px-3 py-2 mt-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 hidden" />
        <div class="flex items-center gap-2 mt-2">
          <button id="cv-toggle-percent" type="button" class="px-3 py-1.5 text-xs bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-sky-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-700 rounded-lg transition-colors duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 font-medium">📝 Manual %</button>
        </div>
        <div id="cv-laborSharePreview" class="mt-3 p-2 bg-blue-900/20 dark:bg-blue-900/20 theme-light:bg-blue-50 rounded border border-blue-700/30 dark:border-blue-700/30 theme-light:border-blue-300 text-xs text-blue-300 dark:text-blue-300 theme-light:text-blue-700 font-medium hidden"></div>
      </div>
      <div class="md:col-span-2">
        <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Comprobante (opcional)</label>
        <div class="relative">
          <input id="cv-receipt" type="file" accept="image/*,.pdf" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-600/50 file:text-white file:cursor-pointer hover:file:bg-slate-600" />
        </div>
        <div id="cv-receipt-status" class="mt-2 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Sin archivos seleccionados</div>
      </div>
      <div class="md:col-span-2 flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mt-4">
        <button id="cv-confirm" class="w-full sm:flex-1 px-3 sm:px-4 py-2.5 sm:py-2.5 text-sm sm:text-base bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Confirmar cierre</button>
        <button type="button" id="cv-send-survey" class="w-full sm:w-auto px-3 sm:px-4 py-2.5 sm:py-2.5 text-sm sm:text-base bg-gradient-to-r from-green-600 to-green-700 dark:from-green-600 dark:to-green-700 theme-light:from-green-500 theme-light:to-green-600 hover:from-green-700 hover:to-green-800 dark:hover:from-green-700 dark:hover:to-green-800 theme-light:hover:from-green-600 theme-light:hover:to-green-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">📱 Enviar encuesta</button>
        <button type="button" id="cv-cancel" class="w-full sm:w-auto px-3 sm:px-4 py-2.5 sm:py-2.5 text-sm sm:text-base bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-sky-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-700 font-semibold rounded-lg transition-colors duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Cancelar</button>
      </div>
      <div id="cv-msg" class="md:col-span-2 mt-2 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600"></div>
    </div>`;
  return wrap;
}

function openCloseModal(){
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  if(!modal||!body) return;
  ensureCompanyData().then(()=>{
    // Asegurar que techConfig esté cargado
    console.log('techConfig después de ensureCompanyData:', techConfig);
    console.log('laborKinds disponibles:', techConfig?.laborKinds);
    body.innerHTML='';
    const content = buildCloseModalContent();
    body.appendChild(content);
    fillCloseModal();
    // Agregar clase para hacer el modal más ancho
    const modalContent = modal.querySelector('.modal-content');
    if(modalContent) {
      modalContent.classList.add('close-sale-modal');
    }
    modal.classList.remove('hidden');
  }).catch(err => {
    console.error('Error al cargar datos de la empresa:', err);
    alert('Error al cargar configuración. Por favor, recarga la página.');
  });
}

function fillCloseModal(){
  const techSel = document.getElementById('cv-technician');
  // companyTechnicians ya está normalizado como array de strings en ensureCompanyData
  techSel.innerHTML = '<option value="">-- Ninguno --</option>' + 
    (companyTechnicians||[]).map(t=>`<option value="${t}">${t}</option>`).join('') + 
    '<option value="__ADD_TECH__">+ Agregar técnico…</option>';
  const initialTechLabel = document.getElementById('cv-initial-tech');
  if(current){
    if(current.initialTechnician){
      if(initialTechLabel){
        initialTechLabel.style.display='block';
        initialTechLabel.textContent = 'Asignado al inicio: ' + current.initialTechnician;
      }
      techSel.value = current.technician || current.initialTechnician;
    } else if(current.technician){
      techSel.value = current.technician;
    }
  }

  // Labor percent options
  const percSel = document.getElementById('cv-laborPercent');
  const perc = (companyPrefs?.laborPercents||[]);
  percSel.innerHTML = '<option value="">-- % --</option>' + perc.map(p=>`<option value="${p}">${p}%</option>`).join('');
  const manualPercentInput = document.getElementById('cv-laborPercentManual');
  const percentToggle = document.getElementById('cv-toggle-percent');
  const sharePrev = document.getElementById('cv-laborSharePreview');
  const msg = document.getElementById('cv-msg');
  
  // Función para calcular y mostrar el preview del labor share
  function updateLaborSharePreview() {
    if (!sharePrev) return;
    const laborValue = Number(current?.laborValue || 0);
    const percent = Number(percSel.value || manualPercentInput.value || 0);
    
    if (laborValue > 0 && percent > 0) {
      const share = Math.round(laborValue * percent / 100);
      sharePrev.innerHTML = `<span class="font-semibold">💰 Participación calculada:</span> <span class="text-blue-200 dark:text-blue-200 theme-light:text-blue-600">${money(share)}</span> <span class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600">(${percent}% de ${money(laborValue)})</span>`;
      sharePrev.classList.remove('hidden');
    } else {
      sharePrev.innerHTML = '';
      sharePrev.classList.add('hidden');
    }
  }
  
  // Toggle entre select y input manual
  let isManualMode = false;
  if (percentToggle && manualPercentInput && percSel) {
    percentToggle.addEventListener('click', () => {
      isManualMode = !isManualMode;
      if (isManualMode) {
        percSel.classList.add('hidden');
        manualPercentInput.classList.remove('hidden');
        manualPercentInput.value = percSel.value || '';
        percentToggle.textContent = 'Usar lista';
        manualPercentInput.focus();
      } else {
        percSel.classList.remove('hidden');
        manualPercentInput.classList.add('hidden');
        percSel.value = manualPercentInput.value || '';
        percentToggle.textContent = 'Manual %';
        updateLaborSharePreview();
      }
    });
    
    // Listeners para actualizar preview
    percSel.addEventListener('change', updateLaborSharePreview);
    manualPercentInput.addEventListener('input', updateLaborSharePreview);
  }
  
  // Actualizar preview inicial
  updateLaborSharePreview();

  // Listener para actualizar estado del archivo
  const receiptInput = document.getElementById('cv-receipt');
  const receiptStatus = document.getElementById('cv-receipt-status');
  if (receiptInput && receiptStatus) {
    receiptInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        receiptStatus.textContent = `Archivo seleccionado: ${file.name}`;
        receiptStatus.classList.remove('text-slate-400', 'dark:text-slate-400', 'theme-light:text-slate-600');
        receiptStatus.classList.add('text-green-400', 'dark:text-green-400', 'theme-light:text-green-600');
      } else {
        receiptStatus.textContent = 'Sin archivos seleccionados';
        receiptStatus.classList.remove('text-green-400', 'dark:text-green-400', 'theme-light:text-green-600');
        receiptStatus.classList.add('text-slate-400', 'dark:text-slate-400', 'theme-light:text-slate-600');
      }
    });
  }

  // ---- Desglose por maniobra (PRINCIPAL - siempre visible) ----
  // La tabla ya está en el HTML, solo necesitamos obtener referencias y configurar eventos
  try {
    const tbody = document.getElementById('cv-comm-body');
    if (!tbody) {
      console.error('No se encontró el elemento #cv-comm-body en el modal de cierre');
      return;
    }
    
    // Función para obtener laborKinds actualizados
    async function getLaborKinds() {
      try {
        // Usar API.get directamente como alternativa más robusta
        const response = await API.get('/api/v1/company/tech-config');
        const config = response?.config || response || { laborKinds: [] };
        return config?.laborKinds || [];
      } catch (err) {
        console.error('Error obteniendo laborKinds:', err);
        // Fallback a techConfig cargado previamente
        return techConfig?.laborKinds || [];
      }
    }
    
    async function addLine(pref={}){
      const tr = document.createElement('tr');
      // companyTechnicians ya está normalizado como array de strings en ensureCompanyData
      const techOpts = '<option value="">-- Seleccione técnico --</option>' + (companyTechnicians||[]).map(t=> `<option value="${t}">${t}</option>`).join('');
      
      // Obtener laborKinds actualizados
      const laborKinds = await getLaborKinds();
      const laborKindsList = laborKinds.map(k=> {
        const name = typeof k === 'string' ? k : (k?.name || '');
        return name;
      }).filter(k => k && k.trim() !== ''); // Filtrar vacíos
      
      console.log('laborKinds obtenidos:', laborKinds);
      console.log('laborKindsList procesado:', laborKindsList);
      
      const kindOpts = '<option value="">-- Seleccione tipo --</option>' + laborKindsList.map(k=> `<option value="${k}">${k}</option>`).join('');
      tr.className = 'border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 hover:bg-slate-800/30 dark:hover:bg-slate-800/30 theme-light:hover:bg-slate-50';
      tr.innerHTML = `
        <td class="py-2.5 px-3"><select data-role="tech" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200">${techOpts}</select></td>
        <td class="py-2.5 px-3"><select data-role="kind" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200">${kindOpts}</select></td>
        <td class="py-2.5 px-3 text-right"><input data-role="lv" type="number" min="0" step="1" value="${Number(pref.laborValue||0)||0}" class="w-28 px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200" placeholder="0"></td>
        <td class="py-2.5 px-3 text-right"><input data-role="pc" type="number" min="0" max="100" step="0.1" value="${Number(pref.percent||0)||0}" class="w-24 px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200" placeholder="0%"></td>
        <td class="py-2.5 px-3 text-right text-white dark:text-white theme-light:text-slate-900 font-bold text-sm" data-role="share">$0</td>
        <td class="py-2.5 px-3 text-center"><button type="button" class="px-3 py-1.5 text-sm bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 theme-light:bg-red-50 theme-light:hover:bg-red-100 text-red-400 dark:text-red-400 theme-light:text-red-600 rounded-lg transition-colors duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:border-red-300 font-bold" data-role="del">×</button></td>`;
      tbody.appendChild(tr);
      const techSel2 = tr.querySelector('select[data-role=tech]');
      const kindSel2 = tr.querySelector('select[data-role=kind]');
      const lvInp = tr.querySelector('input[data-role=lv]');
      const pcInp = tr.querySelector('input[data-role=pc]');
      const shareCell = tr.querySelector('[data-role=share]');
      const delBtn = tr.querySelector('button[data-role=del]');
      if(pref.technician) {
        techSel2.value = pref.technician;
      } else {
        // Si no se proporciona técnico, intentar usar el de la venta actual
        const saleTechnician = (current?.technician || current?.initialTechnician || '').trim().toUpperCase();
        if (saleTechnician) {
          // Buscar el técnico en la lista (case-insensitive)
          const foundTech = companyTechnicians.find(t => String(t).trim().toUpperCase() === saleTechnician);
          if (foundTech) {
            techSel2.value = foundTech; // Usar el valor exacto de la lista
          }
        }
      }
      if(pref.kind) kindSel2.value = pref.kind;
      function recalc(){
        const lv = Number(lvInp.value||0)||0; const pc=Number(pcInp.value||0)||0; const sh = Math.round(lv*pc/100);
        shareCell.textContent = money(sh);
      }
      [lvInp, pcInp, techSel2, kindSel2].forEach(el=> el.addEventListener('input', recalc));
      delBtn.addEventListener('click', ()=> {
        tr.remove();
        updateEmptyMessage(); // Actualizar mensaje vacío después de eliminar
      });
      recalc();
      // autocompletar % desde perfil del técnico o desde defaultPercent del tipo
      function autoFillPercent(){
        const name = techSel2.value; const kind = (kindSel2.value||'').toUpperCase();
        if(!name || !kind) return;
        // Primero buscar en el perfil del técnico
        const prof = (techConfig?.technicians||[]).find(t=> t.name===name);
        if(prof && kind){ 
          const r = (prof.rates||[]).find(x=> String(x.kind||'').toUpperCase()===kind); 
          if(r && r.percent > 0){ 
            pcInp.value = Number(r.percent||0); 
            recalc(); 
            return;
          }
        }
        // Si no está en el perfil, usar el defaultPercent del tipo
        getLaborKinds().then(laborKinds => {
          const laborKind = laborKinds.find(k=> {
            const kindName = typeof k === 'string' ? k : (k?.name || '');
            return String(kindName).toUpperCase() === kind;
          });
          if(laborKind && typeof laborKind === 'object' && laborKind.defaultPercent > 0){
            pcInp.value = Number(laborKind.defaultPercent||0);
            recalc();
          }
        });
      }
      techSel2.addEventListener('change', autoFillPercent);
      kindSel2.addEventListener('change', autoFillPercent);
      return tr;
    }
    // Función para verificar si hay líneas y mostrar/ocultar mensaje vacío
    function updateEmptyMessage() {
      const rows = Array.from(tbody.querySelectorAll('tr')).filter(tr => {
        // Filtrar filas ocultas y filas de mensaje vacío
        return !tr.querySelector('td[colspan]') && tr.style.display !== 'none';
      });
      
      const emptyRow = tbody.querySelector('tr td[colspan]');
      if (rows.length === 0) {
        // Si no hay filas, agregar mensaje vacío
        if (!emptyRow) {
          const newEmptyRow = document.createElement('tr');
          newEmptyRow.innerHTML = `
            <td colspan="6" class="py-8 text-center text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-sm">
              <div class="flex flex-col items-center gap-2">
                <span>No hay líneas de participación técnica</span>
                <span class="text-xs">Haz clic en "+ Agregar línea" para comenzar</span>
              </div>
            </td>
          `;
          tbody.appendChild(newEmptyRow);
        }
      } else {
        // Si hay filas, remover mensaje vacío si existe
        if (emptyRow) {
          emptyRow.closest('tr')?.remove();
        }
      }
    }
    
    const addCommissionBtn = document.getElementById('cv-add-commission');
    if (addCommissionBtn) {
      addCommissionBtn.addEventListener('click', ()=> {
        // Remover mensaje de "No hay líneas" si existe antes de agregar
        updateEmptyMessage();
        
        // Obtener el técnico de la venta actual para asignarlo automáticamente
        const saleTechnician = (current?.technician || current?.initialTechnician || '').trim().toUpperCase();
        const pref = saleTechnician ? { technician: saleTechnician } : {};
        
        addLine(pref).catch(err => console.error('Error agregando línea:', err));
      });
    }
    
    // Observar cambios en la tabla para actualizar mensaje vacío
    const observer = new MutationObserver(() => {
      setTimeout(updateEmptyMessage, 50); // Pequeño delay para evitar actualizaciones excesivas
    });
    observer.observe(tbody, { childList: true, subtree: true });
    
    // Inicializar mensaje vacío
    updateEmptyMessage();
    
    // Detectar automáticamente items con laborValue y laborKind del PriceEntry
    async function autoAddLaborFromItems() {
      if (!current || !current.items || current.items.length === 0) return;
      
      // Obtener el técnico de la venta actual (initialTechnician o technician)
      const saleTechnician = (current.technician || current.initialTechnician || '').trim().toUpperCase();
      if (!saleTechnician) {
        console.log('No hay técnico asignado a la venta, no se pueden agregar líneas automáticas');
        return; // No hay técnico asignado
      }
      
      try {
        // Obtener todos los refIds de los items de la venta
        const refIds = current.items
          .map(item => item.refId)
          .filter(refId => refId && refId.trim() !== '');
        
        if (refIds.length === 0) return;
        
        // Buscar los PriceEntries correspondientes
        const priceEntries = await Promise.all(
          refIds.map(async (refId) => {
            try {
              // Buscar el precio usando pricesList con el ID
              const prices = await API.pricesList({ limit: 1000 }); // Obtener todos los precios
              const price = prices?.items?.find(p => String(p._id) === String(refId)) || null;
              return price || null;
            } catch (err) {
              console.error('Error obteniendo precio:', err);
              return null;
            }
          })
        );
        
        // Filtrar los que tienen laborValue y laborKind
        const itemsWithLabor = priceEntries
          .filter(pe => pe && pe.laborValue > 0 && pe.laborKind && pe.laborKind.trim() !== '')
          .map(pe => ({
            laborValue: Number(pe.laborValue || 0),
            laborKind: String(pe.laborKind || '').trim().toUpperCase()
          }));
        
        // Agregar líneas automáticamente para cada item con mano de obra
        for (const item of itemsWithLabor) {
          // Buscar el técnico exacto en la lista (para usar el valor correcto del select)
          const foundTech = companyTechnicians.find(t => String(t).trim().toUpperCase() === saleTechnician);
          if (!foundTech) {
            console.log(`Técnico "${saleTechnician}" no encontrado en la lista de técnicos`);
            continue; // Saltar si el técnico no está en la lista
          }
          
          const technician = foundTech; // Usar el valor exacto de la lista
          const kind = item.laborKind;
          const laborValue = item.laborValue;
          
          // Verificar si ya existe una línea con este técnico y tipo
          const existingRows = Array.from(tbody.querySelectorAll('tr'));
          const alreadyExists = existingRows.some(tr => {
            if (tr.querySelector('td[colspan]')) return false; // Ignorar mensaje vacío
            const techSelect = tr.querySelector('select[data-role=tech]');
            const kindSelect = tr.querySelector('select[data-role=kind]');
            return techSelect?.value?.trim().toUpperCase() === technician.toUpperCase() &&
                   kindSelect?.value?.trim().toUpperCase() === kind;
          });
          
          if (!alreadyExists && technician && kind && laborValue > 0) {
            // Obtener el porcentaje del perfil del técnico o del tipo
            let percent = 0;
            const techNameUpper = String(technician).trim().toUpperCase();
            const prof = (techConfig?.technicians||[]).find(t=> String(t.name||'').toUpperCase() === techNameUpper);
            if(prof && kind){ 
              const r = (prof.rates||[]).find(x=> String(x.kind||'').toUpperCase() === kind); 
              if(r && r.percent > 0){ 
                percent = Number(r.percent||0);
              }
            }
            
            // Si no está en el perfil, usar el defaultPercent del tipo
            if (percent === 0) {
              const laborKinds = await getLaborKinds();
              const laborKind = laborKinds.find(k=> {
                const kindName = typeof k === 'string' ? k : (k?.name || '');
                return String(kindName).toUpperCase() === kind;
              });
              if(laborKind && typeof laborKind === 'object' && laborKind.defaultPercent > 0){
                percent = Number(laborKind.defaultPercent||0);
              }
            }
            
            // Agregar la línea
            await addLine({
              technician: technician,
              kind: kind,
              laborValue: laborValue,
              percent: percent
            });
            // Actualizar mensaje vacío después de agregar línea automática
            updateEmptyMessage();
          }
        }
      } catch (err) {
        console.error('Error agregando líneas automáticas de mano de obra:', err);
      }
    }
    
    // Ejecutar después de un pequeño delay para asegurar que todo esté cargado
    setTimeout(() => {
      autoAddLaborFromItems();
    }, 500);
  } catch{}

  // Dynamic payments
  const pmBody = document.getElementById('cv-payments-body');
  const addBtn = document.getElementById('cv-add-payment');
  const summary = document.getElementById('cv-payments-summary');
  let accountsCache = [];
  let payments = [];

  async function loadAccounts(){
    try {
      accountsCache = await API.accounts.list();
      if(!accountsCache.length){
        try { await API.accounts.create({ name:'Caja', type:'CASH' }); } catch{}
        accountsCache = await API.accounts.list();
      }
    }catch{ accountsCache = []; }
  }

  function methodOptionsHTML(selected=''){
    const opts = ['', 'EFECTIVO','TRANSFERENCIA','TARJETA','CREDITO','OTRO'];
    return opts.map(v=>`<option value="${v}" ${v===selected?'selected':''}>${v? v : '--'}</option>`).join('');
  }
  function accountOptionsHTML(selected=''){
    if(!accountsCache.length) return '<option value="">(sin cuentas)</option>';
    return accountsCache.map(a=>`<option value="${a._id}" ${a._id===selected?'selected':''}>${a.name}</option>`).join('');
  }
  function recalc(){
    const sum = payments.reduce((a,p)=> a + (Number(p.amount)||0), 0);
    const total = Number(current?.total||0);
    const diff = total - sum;
    let html = `Suma: <strong class="text-white dark:text-white theme-light:text-slate-900">${money(sum)}</strong> / Total: <span class="text-white dark:text-white theme-light:text-slate-900">${money(total)}</span>.`;
    if(Math.abs(diff) > 0.01){
      html += diff>0 ? ` <span class="text-red-400 dark:text-red-400 theme-light:text-red-600">Falta ${money(diff)}.</span>` : ` <span class="text-red-400 dark:text-red-400 theme-light:text-red-600">Excede por ${money(-diff)}.</span>`;
      summary.className = 'mt-3 text-xs text-red-400 dark:text-red-400 theme-light:text-red-600';
    }else{ 
      summary.className = 'mt-3 text-xs text-green-400 dark:text-green-400 theme-light:text-green-600';
      html += ' <span class="text-green-400 dark:text-green-400 theme-light:text-green-600">✓ OK</span>'; 
    }
    summary.innerHTML = html;
    const confirmBtn = document.getElementById('cv-confirm');
    if(confirmBtn){ 
      confirmBtn.disabled = Math.abs(diff) > 0.01 || payments.length===0;
      if(confirmBtn.disabled){
        confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
        confirmBtn.classList.remove('hover:from-blue-700', 'hover:to-blue-800', 'hover:shadow-lg');
      } else {
        confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        confirmBtn.classList.add('hover:from-blue-700', 'hover:to-blue-800', 'hover:shadow-lg');
      }
    }
  }
  function bindRowEvents(tr, pay){
    const mSel = tr.querySelector('select[data-role=method]');
    const aSel = tr.querySelector('select[data-role=account]');
    const amt  = tr.querySelector('input[data-role=amount]');
    const del  = tr.querySelector('button[data-role=del]');
    const accountCell = tr.querySelector('td:nth-child(2)'); // Celda de cuenta (segunda columna)
    
    // Función para mostrar/ocultar selector de cuenta según el método
    function toggleAccountVisibility() {
      const method = mSel.value.trim().toUpperCase();
      const isCredit = method === 'CREDITO';
      
      if (isCredit) {
        // Ocultar selector de cuenta para crédito
        if (accountCell) accountCell.style.display = 'none';
        pay.accountId = null; // Limpiar accountId cuando es crédito
        if (aSel) aSel.value = ''; // Limpiar el select
      } else {
        // Mostrar selector de cuenta para otros métodos
        if (accountCell) accountCell.style.display = '';
      }
    }
    
    mSel.addEventListener('change', ()=>{ 
      pay.method = mSel.value.trim().toUpperCase(); 
      toggleAccountVisibility();
      recalc(); 
    });
    aSel.addEventListener('change', ()=>{ pay.accountId = aSel.value||null; });
    amt.addEventListener('input', ()=>{ pay.amount = Number(amt.value||0)||0; recalc(); });
    del.addEventListener('click', ()=>{
      payments = payments.filter(p => p !== pay);
      tr.remove(); recalc();
    });
    
    // Aplicar visibilidad inicial
    toggleAccountVisibility();
  }
  function addPaymentRow(p){
    const pay = { method:'', amount:0, accountId:'', ...(p||{}) };
    payments.push(pay);
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 hover:bg-slate-800/30 dark:hover:bg-slate-800/30 theme-light:hover:bg-slate-50';
    tr.innerHTML = `
      <td class="py-2 px-2"><select data-role="method" class="w-full px-2 py-1 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">${methodOptionsHTML(pay.method)}</select></td>
      <td class="py-2 px-2"><select data-role="account" class="w-full px-2 py-1 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">${accountOptionsHTML(pay.accountId)}</select></td>
      <td class="py-2 px-2"><input data-role="amount" type="number" min="0" step="1" value="${pay.amount||''}" class="w-full px-2 py-1 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500" /></td>
      <td class="py-2 px-2 text-center"><button data-role="del" type="button" class="px-2 py-1 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 theme-light:bg-red-50 theme-light:hover:bg-red-100 text-red-400 dark:text-red-400 theme-light:text-red-600 rounded transition-colors duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:border-red-300">×</button></td>`;
    pmBody.appendChild(tr);
    bindRowEvents(tr, pay);
  }
  addBtn.addEventListener('click', ()=> addPaymentRow({ amount:0 }));

  (async ()=>{
    await loadAccounts();
    // Cargar pagos existentes si la venta ya está cerrada, sino crear uno nuevo
    if (current && current.paymentMethods && Array.isArray(current.paymentMethods) && current.paymentMethods.length > 0) {
      // Cargar pagos existentes
      current.paymentMethods.forEach(p => {
        addPaymentRow({ 
          method: p.method || '', 
          amount: Number(p.amount || 0), 
          accountId: p.accountId || '' 
        });
      });
    } else if (current && current.paymentMethod) {
      // Cargar método de pago único (legacy)
      addPaymentRow({ 
        method: current.paymentMethod, 
        amount: Number(current?.total||0), 
        accountId: null 
      });
    } else {
      // Prefill single row with full total (nueva venta)
    addPaymentRow({ method:'EFECTIVO', amount: Number(current?.total||0), accountId: accountsCache[0]?._id||'' });
    }
    recalc();
  })();

  // Technician add inline
  techSel.addEventListener('change', async ()=>{
    if(techSel.value === '__ADD_TECH__'){
      const name = prompt('Nombre del técnico (se guardará en mayúsculas):');
      techSel.value='';
      if(!name) return;
      try{ companyTechnicians = await API.company.addTechnician(name); fillCloseModal(); }
      catch(e){ alert(e?.message||'No se pudo agregar'); }
    }
  });

  document.getElementById('cv-cancel').addEventListener('click', ()=>{
    // Detect if user edited payments and ask
    const edited = payments.some(p=>p.amount>0 || p.method);
    if(edited && !confirm('Hay cambios en los pagos sin cerrar. ¿Cerrar modal?')) return;
    document.getElementById('modal')?.classList.add('hidden');
  });
  
  // Botón de enviar encuesta - Configurar para móvil y desktop
  // Usar setTimeout para asegurar que el botón esté en el DOM
  setTimeout(() => {
    const sendSurveyBtn = document.getElementById('cv-send-survey');
    if (sendSurveyBtn) {
      // Remover listeners anteriores si existen (clonar el botón)
      const newBtn = sendSurveyBtn.cloneNode(true);
      sendSurveyBtn.parentNode.replaceChild(newBtn, sendSurveyBtn);
      
      // Función unificada para manejar tanto click como touch
      let touchStarted = false;
      const handleSurveyEvent = async (e) => {
        if (e.type === 'touchstart') {
          e.preventDefault();
          touchStarted = true;
          return;
        }
        
        if (e.type === 'touchend') {
          if (!touchStarted) return;
          e.preventDefault();
          e.stopPropagation();
          touchStarted = false;
          if (!current) {
            alert('No hay venta activa');
            return;
          }
          try {
            await sendPostServiceSurvey(current);
          } catch (err) {
            alert('Error al enviar encuesta: ' + (err.message || 'Error desconocido'));
          }
          return;
        }
        
        if (e.type === 'click') {
          if (touchStarted) {
            touchStarted = false;
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          if (!current) {
            alert('No hay venta activa');
            return;
          }
          try {
            await sendPostServiceSurvey(current);
          } catch (err) {
            alert('Error al enviar encuesta: ' + (err.message || 'Error desconocido'));
          }
        }
      };
      
      newBtn.addEventListener('touchstart', handleSurveyEvent, { passive: false });
      newBtn.addEventListener('touchend', handleSurveyEvent, { passive: false });
      newBtn.addEventListener('click', handleSurveyEvent);
      
      // Asegurar que el botón sea clickeable y visible en móvil
      newBtn.style.cursor = 'pointer';
      newBtn.style.pointerEvents = 'auto';
      newBtn.style.touchAction = 'manipulation';
      newBtn.style.userSelect = 'none';
      newBtn.style.webkitUserSelect = 'none';
      newBtn.style.webkitTapHighlightColor = 'transparent';
    } else {
      // Si no se encuentra, intentar de nuevo después de un delay
      console.warn('Botón cv-send-survey no encontrado, reintentando...');
      setTimeout(() => {
        const retryBtn = document.getElementById('cv-send-survey');
        if (retryBtn) {
          // Configurar el botón encontrado
          const newBtn = retryBtn.cloneNode(true);
          retryBtn.parentNode.replaceChild(newBtn, retryBtn);
          
          let touchStarted = false;
          const handleSurveyEvent = async (e) => {
            if (e.type === 'touchstart') {
              e.preventDefault();
              touchStarted = true;
              return;
            }
            if (e.type === 'touchend') {
              if (!touchStarted) return;
              e.preventDefault();
              e.stopPropagation();
              touchStarted = false;
              if (!current) {
                alert('No hay venta activa');
                return;
              }
              try {
                await sendPostServiceSurvey(current);
              } catch (err) {
                alert('Error al enviar encuesta: ' + (err.message || 'Error desconocido'));
              }
              return;
            }
            if (e.type === 'click') {
              if (touchStarted) {
                touchStarted = false;
                return;
              }
              e.preventDefault();
              e.stopPropagation();
              if (!current) {
                alert('No hay venta activa');
                return;
              }
              try {
                await sendPostServiceSurvey(current);
              } catch (err) {
                alert('Error al enviar encuesta: ' + (err.message || 'Error desconocido'));
              }
            }
          };
          
          newBtn.addEventListener('touchstart', handleSurveyEvent, { passive: false });
          newBtn.addEventListener('touchend', handleSurveyEvent, { passive: false });
          newBtn.addEventListener('click', handleSurveyEvent);
          
          newBtn.style.cursor = 'pointer';
          newBtn.style.pointerEvents = 'auto';
          newBtn.style.touchAction = 'manipulation';
          newBtn.style.userSelect = 'none';
          newBtn.style.webkitUserSelect = 'none';
          newBtn.style.webkitTapHighlightColor = 'transparent';
        }
      }, 200);
    }
  }, 100);

  document.getElementById('cv-confirm').addEventListener('click', async ()=>{
    if(!current) return;
    msg.textContent='Procesando...';
    // Validar suma exacta
    const sum = payments.reduce((a,p)=> a + (Number(p.amount)||0), 0);
    const total = Number(current?.total||0);
    if(Math.abs(sum-total) > 0.01){ msg.textContent='La suma de pagos no coincide con el total.'; return; }
    const filtered = payments.filter(p=> p.method && p.amount>0);
    if(!filtered.length){ msg.textContent='Agregar al menos una forma de pago válida'; return; }
    try{
      let receiptUrl='';
      const file = document.getElementById('cv-receipt').files?.[0];
      if(file){
        const uploadRes = await API.mediaUpload ? API.mediaUpload([file]) : null;
        if(uploadRes && uploadRes.files && uploadRes.files[0]){
          receiptUrl = uploadRes.files[0].url || uploadRes.files[0].path || '';
        }
      }
      // Build labor commissions from table if present
      const comm = [];
      const commBody = document.getElementById('cv-comm-body');
      if (commBody) {
        commBody.querySelectorAll('tr').forEach(tr=>{
          // Ignorar fila de mensaje vacío
          if (tr.querySelector('td[colspan]')) return;
          
          const tech = tr.querySelector('select[data-role=tech]')?.value?.trim().toUpperCase();
          const kind = tr.querySelector('select[data-role=kind]')?.value?.trim().toUpperCase();
          const lv = Number(tr.querySelector('input[data-role=lv]')?.value||0)||0;
          const pc = Number(tr.querySelector('input[data-role=pc]')?.value||0)||0;
          
          // Validar que tenga técnico, tipo, valor y porcentaje
          if(tech && kind && lv>0 && pc>0) {
            comm.push({ technician: tech, kind, laborValue: lv, percent: pc });
          } else if(tech || kind || lv>0 || pc>0) {
            // Si tiene algún valor pero no está completo, mostrar error
            msg.textContent = 'Todas las líneas de participación técnica deben tener: técnico, tipo, valor MO y % completos.';
            msg.className = 'md:col-span-2 mt-2 text-xs text-red-400 dark:text-red-400 theme-light:text-red-600';
            return;
          }
        });
      }
      
      // Validar que si hay líneas, todas estén completas
      if (commBody && commBody.querySelectorAll('tr:not([style*="display: none"])').length > 0) {
        const incompleteRows = Array.from(commBody.querySelectorAll('tr')).filter(tr => {
          if (tr.querySelector('td[colspan]')) return false; // Ignorar mensaje vacío
          const tech = tr.querySelector('select[data-role=tech]')?.value?.trim();
          const kind = tr.querySelector('select[data-role=kind]')?.value?.trim();
          const lv = Number(tr.querySelector('input[data-role=lv]')?.value||0)||0;
          const pc = Number(tr.querySelector('input[data-role=pc]')?.value||0)||0;
          return (tech || kind || lv>0 || pc>0) && (!tech || !kind || lv<=0 || pc<=0);
        });
        
        if (incompleteRows.length > 0) {
          msg.textContent = 'Todas las líneas de participación técnica deben tener: técnico, tipo, valor MO y % completos.';
          msg.className = 'md:col-span-2 mt-2 text-xs text-red-400 dark:text-red-400 theme-light:text-red-600';
          return;
        }
      }
      
      // Obtener el porcentaje de mano de obra del campo (solo si no hay comisiones en la tabla - para compatibilidad legacy)
      const laborPercentValue = comm.length === 0 ? (Number(percSel.value || manualPercentInput.value || 0) || 0) : 0;
      const laborValueFromSale = Number(current?.laborValue || 0);
      
      const payload = {
        paymentMethods: filtered.map(p=>{
          const method = String(p.method || '').toUpperCase();
          const isCredit = method === 'CREDITO';
          // No enviar accountId si es crédito (va a cartera, no a flujo de caja)
          return { 
            method: p.method, 
            amount: Number(p.amount)||0, 
            accountId: isCredit ? null : (p.accountId||null) 
          };
        }),
        technician: techSel.value||'',
        laborValue: laborValueFromSale,
        laborPercent: laborPercentValue,
        laborCommissions: comm,
        paymentReceiptUrl: receiptUrl
      };
      await API.sales.close(current._id, payload);
      alert('Venta cerrada');
      document.getElementById('modal')?.classList.add('hidden');
      setSaleQuoteLink(current._id, null);
      current = null;
      await refreshOpenSales();
    }catch(e){ msg.textContent = e?.message||'Error'; msg.classList.add('error'); }
  });
}

function stopSalesAutoRefresh() {
  if (!salesRefreshTimer) return;
  clearInterval(salesRefreshTimer);
  salesRefreshTimer = null;
}


// ---------- tabs ----------
async function switchTo(id){
  try{
    const sale = await API.sales.get(id);
    current = sale;
    syncCurrentIntoOpenList();
    renderTabs(); renderSale(); renderWO(); await renderQuoteForCurrentSale();
  }catch(e){ console.error(e); }
}

function renderTabs(){ /* legacy no-op kept for backward compatibility */ renderCapsules(); }

function renderCapsules(){
  const cont = document.getElementById('sales-capsules'); if(!cont) return;
  cont.innerHTML='';
  for(const sale of openSales){
    if(!sale?._id) continue;
    const tpl = document.getElementById('tpl-sale-capsule');
    const node = tpl?.content?.firstElementChild?.cloneNode(true);
    if(!node) continue;
    node.dataset.id = sale._id;
    node.querySelector('.sc-plate').textContent = (sale.vehicle?.plate||'—');
  const vehParts = [sale.vehicle?.brand, sale.vehicle?.line, sale.vehicle?.engine].filter(Boolean).map(v=>String(v).toUpperCase());
  node.querySelector('[data-veh]').textContent = vehParts.join(' ') || '—';
    node.querySelector('[data-total]').textContent = money(sale.total||0);
    node.querySelector('[data-tech]').textContent = sale.technician || '—';
    if(current && sale._id===current._id) node.classList.add('active');
    node.addEventListener('click', (e)=>{
      if(e.target.classList.contains('sc-close')) return; // handled separately
      switchTo(sale._id);
    });
    node.querySelector('.sc-close').addEventListener('click', async (e)=>{
      e.stopPropagation();
      if(!confirm('Cancelar esta venta?')) return;
      try{ await API.sales.cancel(sale._id); }catch(err){ alert(err?.message||'No se pudo cancelar'); }
      setSaleQuoteLink(sale._id, null);
      if(current && current._id===sale._id) current=null;
      await refreshOpenSales();
    });
    cont.appendChild(node);
  }
  if(!openSales.length){
    const empty=document.createElement('div'); empty.className='muted'; empty.style.fontSize='12px'; empty.textContent='No hay ventas abiertas';
    cont.appendChild(empty);
  }
  setupTechnicianSelect();
}

async function setupTechnicianSelect(){
  const sel = document.getElementById('sales-technician');
  if(!sel) return;
  // Cargar lista dinámica si aún no cargada
  if(!companyTechnicians.length){
    try { companyTechnicians = await API.company.getTechnicians(); } catch { companyTechnicians = []; }
  }
  sel.innerHTML='';
  sel.appendChild(new Option('— Técnico —',''));
  (companyTechnicians||[]).forEach(t=> sel.appendChild(new Option(t,t)));
  sel.appendChild(new Option('+ Agregar técnico…','__ADD_TECH__'));
  sel.classList.remove('hidden');
  if(current){ sel.value = current.technician || current.initialTechnician || ''; }
  if(!technicianSelectInitialized){
    sel.addEventListener('change', async ()=>{
      if(sel.value === '__ADD_TECH__'){
        const name = prompt('Nombre del técnico (se guardará en mayúsculas):');
        sel.value = ''; // reset temporal
        if(name){
          try{
            companyTechnicians = await API.company.addTechnician(name);
            await setupTechnicianSelect();
            // Reseleccionar el recién agregado si existe
            const upper = String(name).trim().toUpperCase();
            if(companyTechnicians.includes(upper)){
              sel.value = upper;
              if(current?._id){
                try{ current = await API.sales.setTechnician(current._id, upper); syncCurrentIntoOpenList(); renderCapsules(); }catch{}
              }
            }
          }catch(e){ alert(e?.message||'No se pudo agregar'); }
        }
        return;
      }
      if(!current?._id) return;
      try{
        current = await API.sales.setTechnician(current._id, sel.value||'');
        syncCurrentIntoOpenList();
        renderCapsules();
      }catch(e){ alert(e?.message||'No se pudo asignar técnico'); }
    });
    technicianSelectInitialized = true;
  }
}

function renderMini(){
  const lp = document.getElementById('sv-mini-plate'), ln = document.getElementById('sv-mini-name'), lr = document.getElementById('sv-mini-phone');
  const c = current?.customer || {}, v = current?.vehicle || {};
  if (lp) lp.textContent = v.plate || '—';
  if (ln) ln.textContent = `Cliente: ${c.name || '—'}`;
  if (lr) lr.textContent = `Cel: ${c.phone || '—'}`;
  
  // Verificar si la venta viene de un evento del calendario
  const fromCalendarEventId = localStorage.getItem('sales:fromCalendarEvent');
  const urlParams = new URLSearchParams(window.location.search);
  const calendarEventId = fromCalendarEventId || urlParams.get('fromCalendar');
  
  // Botón de WhatsApp removido - ahora está en el modal del evento del calendario
  // Eliminar botón si existe
  const existingBtn = document.getElementById('sv-whatsapp-btn');
  if (existingBtn) existingBtn.remove();
}

async function renderSale(){
  const body = document.getElementById('sales-body'), total = document.getElementById('sales-total');
  if (!body) return;
  body.innerHTML = '';
  
  // Verificar si hay una cotización pendiente de cargar cuando se renderiza la venta
  // Esto asegura que se cargue incluso si no se detectó al inicio
  if (current?._id) {
    const pendingQuoteId = localStorage.getItem('sales:lastQuoteId');
    if (pendingQuoteId && !getSaleQuoteId(current._id)) {
      // Hay una cotización pendiente y la venta actual no tiene cotización vinculada
      // Cargarla en el siguiente tick para no bloquear el render
      setTimeout(async () => {
        if (current?._id) {
          await renderQuoteForCurrentSale();
        }
      }, 100);
    }
  }

  if (current?.openSlots && current.openSlots.length > 0) {
    const incompleteSlots = current.openSlots.filter(slot => !slot.completed);
    incompleteSlots.forEach((slot, slotIdx) => {
      const tr = clone('tpl-sale-row');
      tr.querySelector('[data-sku]').textContent = 'SLOT';
      const nameCell = tr.querySelector('[data-name]');
      nameCell.innerHTML = '';
      const badge = document.createElement('span');
      badge.className = 'open-slot-badge';
      badge.textContent = 'SLOT ABIERTO';
      badge.style.cssText = 'background:var(--warning, #f59e0b);color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;';
      nameCell.appendChild(badge);
      nameCell.appendChild(document.createTextNode(slot.slotName || 'Slot abierto'));
      tr.classList.add('sale-row-open-slot');
      
      const qty = tr.querySelector('.qty');
      qty.value = String(slot.qty || 1);
      qty.disabled = true;
      
      tr.querySelector('[data-unit]').textContent = money(slot.estimatedPrice || 0);
      tr.querySelector('[data-total]').textContent = money((slot.qty || 1) * (slot.estimatedPrice || 0));
      
      const actions = tr.querySelector('td:last-child');
      actions.innerHTML = '';
      const btnComplete = document.createElement('button');
      btnComplete.className = 'primary';
      btnComplete.textContent = '📷 Completar con QR';
      btnComplete.style.cssText = 'padding:6px 12px;border-radius:4px;border:none;cursor:pointer;font-size:12px;';
      btnComplete.onclick = async () => {
        try {
          await completeOpenSlotWithQR(current._id, slotIdx, slot);
        } catch (err) {
          alert('Error: ' + (err?.message || 'No se pudo completar el slot'));
        }
      };
      actions.appendChild(btnComplete);
      
      body.appendChild(tr);
    });
  }
  
  const items = current?.items || [];
  let i = 0;
  const comboProductsCountCache = new Map();
  
  while (i < items.length) {
    const it = items[i];
    const sku = String(it.sku || '').toUpperCase();
    const isCombo = sku.startsWith('COMBO-');
    
    if (isCombo) {
      // Encontramos un combo, agrupar items siguientes hasta el próximo combo o fin
      const comboItems = [it];
      i++;
      
      // Obtener el número de productos del combo desde el PriceEntry (con cache)
      let comboProductsCount = 0;
      if (it.refId) {
        if (comboProductsCountCache.has(it.refId)) {
          comboProductsCount = comboProductsCountCache.get(it.refId);
        } else {
          // Intentar obtener el PriceEntry del combo para saber cuántos productos tiene
          // Por ahora, usamos una heurística mejorada
          comboProductsCount = null; // null significa que no sabemos
        }
      }
      
      // Agregar items consecutivos que son parte del combo
      // Los items del combo pueden tener:
      // - SKU que empieza con "CP-" (producto del combo sin vincular)
      // - source 'inventory' o 'price' y venir inmediatamente después del combo
      // Detener si encontramos:
      // - Otro combo
      // - Más items de los que tiene el combo (si sabemos el número)
      // - Un item que claramente no pertenece al combo
      while (i < items.length) {
        const nextIt = items[i];
        const nextSku = String(nextIt.sku || '').toUpperCase();
        
        // Si encontramos otro combo, detener
        if (nextSku.startsWith('COMBO-')) {
          break;
        }
        
        // Si sabemos cuántos productos tiene el combo y ya agregamos todos, detener
        if (comboProductsCount !== null && comboItems.length - 1 >= comboProductsCount) {
          break;
        }
        
        // Si el SKU empieza con "CP-", es definitivamente parte del combo
        if (nextSku.startsWith('CP-')) {
          comboItems.push(nextIt);
          i++;
          continue;
        }
        
        // Heurística conservadora: solo agregar items que claramente son parte del combo
        // Los items del combo pueden tener:
        // - SKU que empieza con "CP-" (definitivamente parte del combo) - ya manejado arriba
        // - Precio 0 (parte del combo sin precio)
        // NOTA: Los items del combo con item vinculado pueden tener precio > 0, pero sin una forma
        // confiable de identificarlos, preferimos ser conservadores y solo agregar items con precio 0 o CP-
        // para evitar agregar items independientes al combo
        
        const nextUnitPrice = Number(nextIt.unitPrice || 0);
        const nextTotal = Number(nextIt.total || 0);
        
        if (nextUnitPrice === 0 && nextTotal === 0) {
          // Item con precio 0, probablemente parte del combo
          comboItems.push(nextIt);
          i++;
        } else {
          // Item con precio > 0 y no es CP-
          // Para evitar agregar items independientes (como el amortiguador), no lo agregamos al combo
          // Si el combo tiene items vinculados con precio, estos se mostrarán como items independientes
          // pero es preferible a mostrar items independientes como parte del combo
          break;
        }
      }
      
      renderComboGroup(body, it.refId, comboItems);
    } else {
      // Item normal, renderizar individualmente
      renderSaleItem(body, it);
      i++;
    }
  }
  
  function renderComboGroup(container, comboRefId, comboItemsList) {
    if (comboItemsList.length === 0) return;
    
    // El primer item es el combo principal
    const comboMain = comboItemsList[0];
    const comboSubItems = comboItemsList.slice(1);
    
    // Renderizar combo principal (más grande)
    const comboTr = clone('tpl-sale-row');
    comboTr.classList.add('sale-row-combo-main');
    comboTr.style.cssText = 'background:rgba(147, 51, 234, 0.1);border-left:4px solid #9333ea;font-weight:600;';
    
    comboTr.querySelector('[data-sku]').textContent = comboMain.sku || '';
    const nameCell = comboTr.querySelector('[data-name]');
    nameCell.innerHTML = '';
    const badge = document.createElement('span');
    badge.className = 'combo-badge';
    badge.textContent = 'COM';
    badge.style.cssText = 'background:#9333ea;color:white;padding:4px 10px;border-radius:6px;font-size:14px;font-weight:700;margin-right:10px;display:inline-block;';
    nameCell.appendChild(badge);
    nameCell.appendChild(document.createTextNode(comboMain.name || ''));
    
    const qty = comboTr.querySelector('.qty');
    qty.value = String(comboMain.qty || 1);
    qty.style.cssText = 'font-weight:600;font-size:14px;';
    
    const unitCell = comboTr.querySelector('[data-unit]');
    unitCell.textContent = money(comboMain.unitPrice || 0);
    unitCell.style.cssText = 'font-weight:700;font-size:16px;color:#9333ea;';
    
    const totalCell = comboTr.querySelector('[data-total]');
    totalCell.textContent = money(comboMain.total || 0);
    totalCell.style.cssText = 'font-weight:700;font-size:16px;color:#9333ea;';
    
    setupItemActions(comboTr, comboMain);
    container.appendChild(comboTr);
    
    // Renderizar items del combo (indentados)
    comboSubItems.forEach(subItem => {
      const subTr = clone('tpl-sale-row');
      subTr.classList.add('sale-row-combo-item');
      subTr.style.cssText = 'background:rgba(147, 51, 234, 0.05);padding-left:32px;border-left:2px solid #9333ea;margin-left:16px;';
      
      subTr.querySelector('[data-sku]').textContent = subItem.sku || '';
      const subNameCell = subTr.querySelector('[data-name]');
      subNameCell.innerHTML = '';
      
      // Determinar badge según el tipo de item del combo
      let badgeText = 'PRD';
      let badgeColor = '#86efac'; // Verde claro
      if (subItem.source === 'inventory') {
        badgeText = 'INV';
        badgeColor = '#10b981'; // Verde
      } else if (String(subItem.sku || '').toUpperCase().startsWith('SRV-')) {
        badgeText = 'SRV';
        badgeColor = '#3b82f6'; // Azul
      }
      
      const subBadge = document.createElement('span');
      subBadge.textContent = badgeText;
      subBadge.style.cssText = `background:${badgeColor};color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;`;
      subNameCell.appendChild(subBadge);
      subNameCell.appendChild(document.createTextNode(subItem.name || ''));
      
      const subQty = subTr.querySelector('.qty');
      subQty.value = String(subItem.qty || 1);
      
      subTr.querySelector('[data-unit]').textContent = money(subItem.unitPrice || 0);
      subTr.querySelector('[data-total]').textContent = money(subItem.total || 0);
      
      setupItemActions(subTr, subItem);
      container.appendChild(subTr);
    });
  }
  
  function renderSaleItem(container, it) {
    const tr = clone('tpl-sale-row');
    tr.querySelector('[data-sku]').textContent = it.sku || '';
    const nameCell = tr.querySelector('[data-name]');
    let label = it.name || '';
    nameCell.textContent = label; // default
    
    const sku = String(it.sku || '').toUpperCase();
    
    // Determinar tipo y badge
    if (it.source === 'inventory') {
      const badge = document.createElement('span');
      badge.className = 'inv-badge';
      badge.textContent = 'INV';
      badge.style.cssText = 'background:#10b981;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;';
      nameCell.textContent = '';
      nameCell.appendChild(badge);
      nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-inventory');
    } else if (sku.startsWith('COMBO-')) {
      // Combo (no debería llegar aquí si está agrupado, pero por si acaso)
      const badge = document.createElement('span');
      badge.className = 'combo-badge';
      badge.textContent = 'COM';
      badge.style.cssText = 'background:#9333ea;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;';
      nameCell.textContent = '';
      nameCell.appendChild(badge);
      nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-combo');
    } else if (sku.startsWith('SRV-') || it.source === 'service') {
      const badge = document.createElement('span');
      badge.className = 'service-badge';
      badge.textContent = 'SRV';
      badge.style.cssText = 'background:#3b82f6;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;';
      nameCell.textContent = '';
      nameCell.appendChild(badge);
      nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-service');
    } else if (it.source === 'price' || sku.startsWith('CP-') || sku.startsWith('PRD-')) {
      // Producto sin item linkeado
      const badge = document.createElement('span');
      badge.className = 'product-badge';
      badge.textContent = 'PRD';
      badge.style.cssText = 'background:#86efac;color:#065f46;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-right:8px;';
      nameCell.textContent = '';
      nameCell.appendChild(badge);
      nameCell.appendChild(document.createTextNode(label));
      tr.classList.add('sale-row-product');
    }
    
    const qty = tr.querySelector('.qty');
    qty.value = String(it.qty || 1);
    tr.querySelector('[data-unit]').textContent = money(it.unitPrice || 0);
    tr.querySelector('[data-total]').textContent = money(it.total || 0);
    
    setupItemActions(tr, it);
    container.appendChild(tr);
  }
  
  function setupItemActions(tr, it) {
    const qty = tr.querySelector('.qty');
    qty.addEventListener('change', async () => {
      const v = Math.max(1, Number(qty.value || 1) || 1);
      current = await API.sales.updateItem(current._id, it._id, { qty: v });
      syncCurrentIntoOpenList();
      renderTabs();
      renderSale();
      renderWO();
    });

    const actions = tr.querySelector('td:last-child');
    actions.style.display = 'flex';
    actions.style.flexDirection = 'column';
    actions.style.gap = '4px';
    actions.style.alignItems = 'stretch';
    
    const btnEdit = document.createElement('button');
    btnEdit.textContent = 'Editar $';
    btnEdit.className = 'secondary';
    btnEdit.style.cssText = 'padding: 6px 10px; font-size: 11px; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; font-weight: 500; background: rgba(100, 116, 139, 0.3); color: white;';
    btnEdit.onclick = async () => {
      const v = prompt('Nuevo precio unitario:', String(it.unitPrice || 0));
      if (v == null) return;
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: Number(v) || 0 });
      syncCurrentIntoOpenList();
      renderTabs();
      renderSale();
      renderWO();
    };
    
    const btnZero = document.createElement('button');
    btnZero.textContent = 'Precio 0';
    btnZero.className = 'secondary';
    btnZero.style.cssText = 'padding: 6px 10px; font-size: 11px; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; font-weight: 500; background: rgba(100, 116, 139, 0.3); color: white;';
    btnZero.onclick = async () => {
      current = await API.sales.updateItem(current._id, it._id, { unitPrice: 0 });
      syncCurrentIntoOpenList();
      renderTabs();
      renderSale();
      renderWO();
    };
    
    const btnDel = tr.querySelector('button.remove');
    if (btnDel) {
      btnDel.style.cssText = 'padding: 6px 10px; font-size: 11px; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; font-weight: 500; background: rgba(239, 68, 68, 0.2); color: #fca5a5;';
      btnDel.onclick = async () => {
        await API.sales.removeItem(current._id, it._id);
        current = await API.sales.get(current._id);
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale();
        renderWO();
      };
    }
    
    actions.innerHTML = '';
    actions.appendChild(btnEdit);
    actions.appendChild(btnZero);
    if (btnDel) actions.appendChild(btnDel);
  }

  if (total) total.textContent = money(current?.total||0);
  renderMini(); renderCapsules(); setupTechnicianSelect();

  // Leyenda dinámica de orígenes
  try {
    const legendId='sales-legend-origin';
    const items = current?.items||[];
    const hasInventory = items.some(i=>i.source === 'inventory');
    const hasCombo = items.some(i=>String(i.sku||'').toUpperCase().startsWith('COMBO-'));
    const hasService = items.some(i=>i.source === 'service' || String(i.sku||'').toUpperCase().startsWith('SRV-'));
    const hasProduct = items.some(i=>i.source === 'price' && !String(i.sku||'').toUpperCase().startsWith('COMBO-') && !String(i.sku||'').toUpperCase().startsWith('SRV-'));
    
    let legend=document.getElementById(legendId);
    if(hasInventory || hasCombo || hasService || hasProduct){
      const parts=[];
      if(hasInventory) parts.push('<span style="background:#10b981;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">INV</span> Inventario');
      if(hasCombo) parts.push('<span style="background:#9333ea;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">COM</span> Combo');
      if(hasService) parts.push('<span style="background:#3b82f6;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">SRV</span> Servicio');
      if(hasProduct) parts.push('<span style="background:#86efac;color:#065f46;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">PRD</span> Producto');
      const html = parts.join(' &nbsp; ');
      if(!legend){
        legend=document.createElement('div'); legend.id=legendId; legend.style.marginTop='6px'; legend.style.fontSize='11px'; legend.style.opacity='.8';
        body.parentElement?.appendChild(legend);
      }
      legend.innerHTML = html;
    } else if(legend){ legend.remove(); }
  }catch{}
}

// ---------- completar slot abierto con QR ----------
async function completeOpenSlotWithQR(saleId, slotIndex, slot) {
  return new Promise((resolve, reject) => {
    // Abrir modal QR similar a openQR pero específico para completar slot
    const tpl = document.getElementById('tpl-qr-scanner');
    if (!tpl) {
      reject(new Error('Template de QR no encontrado'));
      return;
    }
    const node = tpl.content.firstElementChild.cloneNode(true);
    openModal(node);
    
    const video = node.querySelector('#qr-video');
    const canvas = node.querySelector('#qr-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sel = node.querySelector('#qr-cam');
    const msg = node.querySelector('#qr-msg');
    const list = node.querySelector('#qr-history');
    const manualInput = node.querySelector('#qr-manual');
    const manualBtn = node.querySelector('#qr-add-manual');
    
    let stream = null, running = false, detector = null, lastCode = '', lastTs = 0;
    let cameraDisabled = false;
    
    msg.textContent = `Escanea el código QR del item para completar el slot: "${slot.slotName}"`;
    
    async function fillCams() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        sel.innerHTML = '<option value="">Seleccionar cámara...</option>';
        videoDevices.forEach((dev, idx) => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          opt.textContent = dev.label || `Cámara ${idx + 1}`;
          sel.appendChild(opt);
        });
        if (videoDevices.length === 1) sel.value = videoDevices[0].deviceId;
      } catch (err) {
        console.warn('No se pudieron listar cámaras:', err);
      }
    }
    
    function stop() {
      running = false;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      if (video.srcObject) video.srcObject = null;
    }
    
    async function start() {
      if (running || cameraDisabled) return;
      stop();
      const deviceId = sel.value;
      if (!deviceId) {
        msg.textContent = 'Selecciona una cámara';
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, facingMode: 'environment' }
        });
        video.srcObject = stream;
        await video.play();
        running = true;
        msg.textContent = `Escaneando para slot: "${slot.slotName}"...`;
        tickNative();
      } catch (err) {
        console.error('Error al iniciar cámara:', err);
        msg.textContent = 'Error al acceder a la cámara';
      }
    }
    
    function parseInventoryCode(text) {
      if (text.toUpperCase().startsWith('IT:')) {
        const parts = text.split(':').map(p => p.trim()).filter(Boolean);
        return { itemId: parts.length >= 3 ? parts[2] : (parts.length === 2 ? parts[1] : null) };
      }
      return { sku: text.toUpperCase() };
    }
    
    function accept(text) {
      const now = Date.now();
      if (text === lastCode && (now - lastTs) < 2000) return false;
      lastCode = text;
      lastTs = now;
      return true;
    }
    
    async function handleCode(raw, fromManual = false) {
      const text = String(raw || '').trim();
      if (!text) return;
      if (!fromManual && !accept(text)) return;
      
      cameraDisabled = true;
      stop();
      
      const li = document.createElement('li');
      li.textContent = text;
      list.prepend(li);
      
      const parsed = parseInventoryCode(text);
      try {
        let itemId = null;
        let sku = null;
        
        if (parsed.itemId) {
          itemId = parsed.itemId;
        } else if (parsed.sku) {
          sku = parsed.sku;
        }
        
        const result = await API.sales.completeSlot(saleId, slotIndex, itemId, sku);
        current = result.sale;
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale();
        renderWO();
        closeModal();
        playConfirmSound();
        showItemAddedPopup();
        resolve(result);
      } catch (err) {
        cameraDisabled = false;
        msg.textContent = 'Error: ' + (err?.message || 'No se pudo completar el slot');
        msg.style.color = 'var(--danger, #ef4444)';
        reject(err);
      }
    }
    
    async function tickNative() {
      if (!running || cameraDisabled) return;
      try {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          if (typeof BarcodeDetector !== 'undefined') {
            if (!detector) detector = new BarcodeDetector({ formats: ['qr_code'] });
            const codes = await detector.detect(imageData);
            if (codes && codes.length > 0) {
              await handleCode(codes[0].rawValue);
              return;
            }
          }
          
          // Fallback a jsQR si está disponible
          if (typeof jsQR !== 'undefined') {
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
              await handleCode(code.data);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Error en detección QR:', err);
      }
      requestAnimationFrame(tickNative);
    }
    
    sel.addEventListener('change', start);
    manualBtn?.addEventListener('click', () => {
      const val = manualInput?.value.trim();
      if (!val) return;
      handleCode(val, true);
      manualInput.value = '';
    });
    manualInput?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        const val = manualInput.value.trim();
        if (val) handleCode(val, true);
      }
    });
    
    fillCams();
    
    // Limpiar al cerrar modal
    const originalClose = window.closeModal;
    window.closeModal = function() {
      stop();
      if (originalClose) originalClose();
      window.closeModal = originalClose;
      reject(new Error('Cancelado por el usuario'));
    };
  });
}

function renderWO(){
  const b = document.getElementById('sv-wo-body'); if (!b) return;
  b.innerHTML = '';
  
  if (!current?.items || current.items.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="2" class="text-center py-4 text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay items en la orden de trabajo</td>`;
    b.appendChild(emptyRow);
    return;
  }
  
  const items = current.items || [];
  const services = items.filter(it => {
    const sku = String(it.sku || '').toUpperCase();
    return it.source === 'service' || sku.startsWith('SRV-');
  });
  const products = items.filter(it => {
    const sku = String(it.sku || '').toUpperCase();
    return !(it.source === 'service' || sku.startsWith('SRV-'));
  });
  
  // Sección de Servicios
  if (services.length > 0) {
    const headerRow = document.createElement('tr');
    headerRow.className = 'wo-section-header';
    headerRow.innerHTML = `
      <td colspan="2" class="py-2 px-1 bg-blue-600/20 dark:bg-blue-600/20 theme-light:bg-blue-50 border-b border-blue-600/30 dark:border-blue-600/30 theme-light:border-blue-200">
        <div class="flex items-center gap-2">
          <span class="text-lg">🔧</span>
          <span class="font-semibold text-blue-400 dark:text-blue-400 theme-light:text-blue-700">Servicios</span>
          <span class="text-xs text-blue-300 dark:text-blue-300 theme-light:text-blue-600">(${services.length})</span>
        </div>
      </td>
    `;
    b.appendChild(headerRow);
    
    services.forEach(it => {
      const tr = document.createElement('tr');
      tr.className = 'wo-item wo-service';
      tr.innerHTML = `
        <td class="py-1.5 px-1 text-white dark:text-white theme-light:text-slate-900">${it.name||''}</td>
        <td class="t-center py-1.5 px-1 text-white dark:text-white theme-light:text-slate-900 font-medium">${String(it.qty||1)}</td>
      `;
      b.appendChild(tr);
    });
  }
  
  // Sección de Productos
  if (products.length > 0) {
    if (services.length > 0) {
      const spacerRow = document.createElement('tr');
      spacerRow.innerHTML = `<td colspan="2" class="py-2"></td>`;
      b.appendChild(spacerRow);
    }
    
    const headerRow = document.createElement('tr');
    headerRow.className = 'wo-section-header';
    headerRow.innerHTML = `
      <td colspan="2" class="py-2 px-1 bg-green-600/20 dark:bg-green-600/20 theme-light:bg-green-50 border-b border-green-600/30 dark:border-green-600/30 theme-light:border-green-200">
        <div class="flex items-center gap-2">
          <span class="text-lg">📦</span>
          <span class="font-semibold text-green-400 dark:text-green-400 theme-light:text-green-700">Productos</span>
          <span class="text-xs text-green-300 dark:text-green-300 theme-light:text-green-600">(${products.length})</span>
        </div>
      </td>
    `;
    b.appendChild(headerRow);
    
    products.forEach(it => {
      const tr = document.createElement('tr');
      tr.className = 'wo-item wo-product';
      tr.innerHTML = `
        <td class="py-1.5 px-1 text-white dark:text-white theme-light:text-slate-900">${it.name||''}</td>
        <td class="t-center py-1.5 px-1 text-white dark:text-white theme-light:text-slate-900 font-medium">${String(it.qty||1)}</td>
      `;
      b.appendChild(tr);
    });
  }
}

function openModal(node){
  const modal = document.getElementById('modal'), slot = document.getElementById('modalBody'), x = document.getElementById('modalClose');
  if (!modal||!slot||!x) return;
  slot.replaceChildren(node);
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
function closeModal(){ const m = document.getElementById('modal'); if (m) m.classList.add('hidden'); }

function openQR(){
  if (!current) return alert('Crea primero una venta');
  const tpl = document.getElementById('tpl-qr-scanner'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);

  const video = node.querySelector('#qr-video');
  const canvas = node.querySelector('#qr-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const sel = node.querySelector('#qr-cam');
  const msg = node.querySelector('#qr-msg');
  const list = node.querySelector('#qr-history');
  const singleModeBtn = node.querySelector('#qr-single-mode');
  const multiModeBtn = node.querySelector('#qr-multi-mode');
  const finishMultiBtn = node.querySelector('#qr-finish-multi');
  const manualInput = node.querySelector('#qr-manual');
  const manualBtn = node.querySelector('#qr-add-manual');

  let stream=null, running=false, detector=null, lastCode='', lastTs=0;
  let multiMode = false;
  let cameraDisabled = false;

  async function fillCams(){
    try{
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Cámara trasera (automática)';
        sel.replaceChildren(defaultOpt);
        sel.value = '';
        return;
      }
      
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const cams = devs.filter(d=>d.kind==='videoinput');
        
        if (cams.length === 0) {
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Cámara predeterminada';
          sel.replaceChildren(defaultOpt);
          sel.value = '';
          return;
        }
        
        sel.replaceChildren(...cams.map((c,i)=>{
          const o=document.createElement('option'); 
          o.value=c.deviceId; 
          o.textContent=c.label||('Cam '+(i+1)); 
          return o;
        }));
      } catch (enumErr) {
        console.warn('Error al enumerar dispositivos:', enumErr);
        // Crear opción por defecto
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Cámara predeterminada';
        sel.replaceChildren(defaultOpt);
        sel.value = '';
      }
    }catch(err){
      console.error('Error al cargar cámaras:', err);
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 'Cámara predeterminada';
      sel.replaceChildren(defaultOpt);
      sel.value = '';
    }
  }

  function stop(){ 
    try{ 
      video.pause(); 
      video.srcObject = null;
    }catch{}; 
    try{ 
      (stream?.getTracks()||[]).forEach(t=>t.stop()); 
    }catch{}; 
    running=false; 
    stream = null;
  }
  
  async function start(){
    try{
      stop();
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // Construir constraints de video
      let videoConstraints;
      
      if (sel.value && sel.value.trim() !== '') {
        // Si hay una cámara seleccionada manualmente, usarla
        videoConstraints = { deviceId: { exact: sel.value } };
      } else if (isMobile) {
        // En móviles, forzar cámara trasera (environment) con configuración más específica
        videoConstraints = { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };
      } else {
        // En desktop, usar cualquier cámara disponible
        videoConstraints = true;
      }
      
      const cs = { 
        video: videoConstraints, 
        audio: false 
      };
      
      msg.textContent = 'Solicitando acceso a la cámara...';
      msg.style.color = 'var(--text)';
      
      // Solicitar acceso a la cámara
      stream = await navigator.mediaDevices.getUserMedia(cs);
      
      // Configurar el video para móviles
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;
      video.srcObject = stream; 
      
      // En móviles, esperar a que el video esté listo
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve).catch(reject);
        };
        video.onerror = reject;
        // Timeout de seguridad
        setTimeout(() => {
          if (video.readyState >= 2) {
            video.play().then(resolve).catch(reject);
          } else {
            reject(new Error('Timeout esperando video'));
          }
        }, 5000);
      });
      
      running = true;
      
      // Actualizar lista de cámaras después de obtener permisos (solo en desktop)
      if (!isMobile) {
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const cams = devs.filter(d=>d.kind==='videoinput' && d.label);
          if (cams.length > 0 && sel.children.length <= 1) {
            sel.replaceChildren(...cams.map((c,i)=>{
              const o=document.createElement('option'); 
              o.value=c.deviceId; 
              o.textContent=c.label||('Cam '+(i+1)); 
              return o;
            }));
          }
        } catch (enumErr) {
          console.warn('No se pudieron actualizar las cámaras:', enumErr);
        }
      }
      
      if (window.BarcodeDetector) { 
        detector = new BarcodeDetector({ formats: ['qr_code'] }); 
        tickNative(); 
      } else { 
        tickCanvas(); 
      }
      msg.textContent='';
    }catch(e){ 
      console.error('Error al iniciar cámara:', e);
      let errorMsg = '';
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        errorMsg = '❌ Permisos de cámara denegados. Por favor, permite el acceso a la cámara en la configuración del navegador.';
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        errorMsg = '❌ No se encontró ninguna cámara. Verifica que tu dispositivo tenga una cámara disponible.';
      } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
        errorMsg = '❌ La cámara está siendo usada por otra aplicación. Cierra otras apps que usen la cámara e intenta de nuevo.';
      } else if (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError') {
        errorMsg = '❌ La cámara no soporta las características requeridas. Intenta con otra cámara.';
      } else {
        errorMsg = '❌ No se pudo abrir cámara: ' + (e?.message||e?.name||'Error desconocido');
      }
      msg.textContent = errorMsg;
      msg.style.color = 'var(--danger, #ef4444)';
      running = false;
    }
  }
  function accept(value){
    // Si la cámara está deshabilitada (durante delay), no aceptar códigos
    if (cameraDisabled) return false;
    
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return false;
    
    const t = Date.now();
    // Delay más corto en modo múltiple (500ms) vs modo single (1500ms) para evitar escaneos duplicados pero permitir escaneos rápidos
    const delay = multiMode ? 500 : 1500;
    
    // Si es el mismo código y está dentro del delay, rechazar
    if (lastCode === normalized && t - lastTs < delay) {
      return false;
    }
    
    // Si es un código diferente, aceptarlo inmediatamente
    // Si es el mismo código pero pasó el delay, también aceptarlo
    lastCode = normalized;
    lastTs = t;
    return true;
  }

  function parseInventoryCode(raw){
    const text = String(raw || '').trim();
    if (!text) return { itemId:'', sku:'', raw:text };
    const upper = text.toUpperCase();
    if (upper.startsWith('IT:')){
      const parts = text.split(':').map(p => p.trim()).filter(Boolean);
      return {
        companyId: parts[1] || '',
        itemId: parts[2] || '',
        sku: parts[3] || ''
      };
    }
    const match = text.match(/[a-f0-9]{24}/i);
    return { companyId:'', itemId: match ? match[0] : '', sku:'', raw:text };
  }

  // Función para reproducir sonido de confirmación
  function playConfirmSound(){
    try {
      // Crear un sonido de beep usando AudioContext
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // Frecuencia del beep
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (err) {
      console.warn('No se pudo reproducir sonido:', err);
    }
  }
  
  // Función para mostrar popup de confirmación
  function showItemAddedPopup(){
    // Crear popup temporal
    const popup = document.createElement('div');
    popup.textContent = '✓ Item agregado!';
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(16, 185, 129, 0.95);
      color: white;
      padding: 20px 40px;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      animation: fadeInOut 1.5s ease-in-out;
    `;
    
    // Agregar animación CSS si no existe
    if (!document.getElementById('qr-popup-style')) {
      const style = document.createElement('style');
      style.id = 'qr-popup-style';
      style.textContent = `
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(popup);
    
    // Remover después de 1.5 segundos
    setTimeout(() => {
      popup.remove();
    }, 1500);
  }

  async function handleCode(raw, fromManual = false){
    const text = String(raw || '').trim();
    if (!text) return;
    if (!fromManual && !accept(text)) return;
    
    // Deshabilitar cámara inmediatamente al detectar un código para evitar procesar el mismo código múltiples veces
    cameraDisabled = true;
    console.log('Código detectado, deshabilitando cámara temporalmente:', text);
    
    const li=document.createElement('li'); li.textContent=text; list.prepend(li);
    const parsed = parseInventoryCode(text);
    try{
      if (parsed.itemId){
        current = await API.sales.addItem(current._id, { source:'inventory', refId: parsed.itemId, qty:1 });
      } else {
        const candidate = (parsed.sku || text).toUpperCase();
        current = await API.sales.addItem(current._id, { source:'inventory', sku:candidate, qty:1 });
      }
      syncCurrentIntoOpenList();
      renderTabs();
      renderSale(); renderWO();
      
      // Reproducir sonido de confirmación
      playConfirmSound();
      
      // Mostrar popup de confirmación (dura 1.5 segundos)
      showItemAddedPopup();
      
      // Si es modo single, cerrar después de 1.5 segundos (cuando desaparece la notificación)
      if (!multiMode && !fromManual){ 
        setTimeout(() => {
          stop(); 
          closeModal();
        }, 1500);
        return; // No reanudar cámara en modo single
      }
      
      // En modo múltiple, reanudar cámara después de un delay corto (500ms)
      // NO llamar a stop(), solo deshabilitar temporalmente la detección
      const resumeDelay = 500;
      setTimeout(() => {
        cameraDisabled = false;
        // Limpiar el último código escaneado para permitir escanear el mismo código nuevamente después del delay
        // Esto permite escanear múltiples veces el mismo item si es necesario
        lastCode = '';
        lastTs = 0;
        console.log('Reanudando detección QR en modo múltiple. Stream activo:', stream?.active, 'Running:', running);
        
        // Verificar que el stream siga activo
        if (stream && stream.active) {
          const tracks = stream.getTracks();
          const videoTrack = tracks.find(t => t.kind === 'video');
          if (videoTrack && videoTrack.readyState === 'ended') {
            console.warn('El track de video terminó, reiniciando cámara...');
            if (multiMode) {
              start().catch(err => {
                console.warn('Error al reiniciar cámara:', err);
                msg.textContent = 'Error al reiniciar cámara. Intenta escanear de nuevo.';
              });
            }
          } else if (video && (video.paused || video.ended)) {
            console.warn('Video pausado o terminado, intentando reproducir...');
            video.play().catch(err => {
              console.warn('Error al reproducir video:', err);
            });
          }
        } else if (!running && multiMode) {
          console.log('Stream no está corriendo, reiniciando cámara...');
          start().catch(err => {
            console.warn('Error al reiniciar cámara:', err);
            msg.textContent = 'Error al reiniciar cámara. Intenta escanear de nuevo.';
          });
        } else if (running && multiMode) {
          console.log('Cámara ya está corriendo, solo reanudando detección');
        }
      }, resumeDelay);
      
      msg.textContent = '';
    }catch(e){ 
      msg.textContent = e?.message || 'No se pudo agregar';
      // Reanudar cámara incluso si hay error (más rápido en modo múltiple)
      const resumeDelay = multiMode ? 500 : 1500;
      setTimeout(() => {
        cameraDisabled = false;
        // Limpiar el último código escaneado para permitir reintentos
        lastCode = '';
        lastTs = 0;
        
        // Asegurarse de que el stream siga corriendo en modo múltiple
        if (!running && multiMode) {
          start().catch(err => {
            console.warn('Error al reanudar cámara después de error:', err);
          });
        }
      }, resumeDelay);
    }
  }

  function onCode(code){
    handleCode(code);
  }
  async function tickNative(){ 
    if(!running || cameraDisabled) {
      if (running && cameraDisabled) {
        // La cámara está corriendo pero deshabilitada temporalmente (normal durante delay)
        requestAnimationFrame(tickNative);
      }
      return;
    }
    try{ 
      const codes=await detector.detect(video); 
      if(codes && codes.length > 0 && codes[0]?.rawValue) {
        console.log('QR detectado en modo múltiple:', codes[0].rawValue);
        onCode(codes[0].rawValue);
      }
    }catch(e){
      // Silenciar errores de detección, pero loguear si es necesario
      if (e.message && !e.message.includes('No image') && !e.message.includes('not readable')) {
        console.warn('Error en detección nativa:', e);
      }
    } 
    requestAnimationFrame(tickNative); 
  }
  
  function tickCanvas(){
    if(!running || cameraDisabled) {
      if (running && cameraDisabled) {
        // La cámara está corriendo pero deshabilitada temporalmente (normal durante delay)
        requestAnimationFrame(tickCanvas);
      }
      return;
    }
    try{
      const w = video.videoWidth|0, h = video.videoHeight|0;
      if(!w||!h){ 
        requestAnimationFrame(tickCanvas); 
        return; 
      }
      canvas.width=w; 
      canvas.height=h;
      ctx.drawImage(video,0,0,w,h);
      const img = ctx.getImageData(0,0,w,h);
      if (window.jsQR){
        const qr = window.jsQR(img.data, w, h);
        if (qr && qr.data) {
          console.log('QR detectado (jsQR) en modo múltiple:', qr.data);
          onCode(qr.data);
        }
      }
    }catch(e){
      // Silenciar errores menores, pero loguear si es necesario
      if (e.message && !e.message.includes('videoWidth') && !e.message.includes('not readable')) {
        console.warn('Error en tickCanvas:', e);
      }
    }
    requestAnimationFrame(tickCanvas);
  }

  // Manejar botón de modo single (solo un item)
  singleModeBtn?.addEventListener('click', async () => {
    multiMode = false;
    singleModeBtn.style.display = 'none';
    multiModeBtn.style.display = 'none';
    if (finishMultiBtn) finishMultiBtn.style.display = 'none';
    msg.textContent = 'Modo: Agregar solo un item. Escanea un código para agregarlo y cerrar.';
    await fillCams();
    await start();
  });

  // Manejar botón de modo múltiples
  multiModeBtn?.addEventListener('click', async () => {
    multiMode = true;
    singleModeBtn.style.display = 'none';
    multiModeBtn.style.display = 'none';
    if (finishMultiBtn) finishMultiBtn.style.display = 'inline-block';
    msg.textContent = 'Modo múltiples items activado. Escanea varios items seguidos.';
    await fillCams();
    await start();
  });

  // Manejar botón de terminar modo múltiples
  finishMultiBtn?.addEventListener('click', () => {
    multiMode = false;
    singleModeBtn.style.display = 'inline-block';
    multiModeBtn.style.display = 'inline-block';
    if (finishMultiBtn) finishMultiBtn.style.display = 'none';
    msg.textContent = 'Modo múltiples items desactivado.';
    stop();
    closeModal();
  });

  // Inicialmente ocultar el botón de terminar
  if (finishMultiBtn) finishMultiBtn.style.display = 'none';

  manualBtn?.addEventListener('click', () => {
    const val = manualInput?.value.trim();
    if (!val) return;
    handleCode(val, true);
    manualInput.value = '';
    manualInput.focus();
  });
  manualInput?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const val = manualInput.value.trim();
      if (val) {
        handleCode(val, true);
        manualInput.value = '';
      }
    }
  });

  // Cargar cámaras al abrir el modal
  fillCams();
}

// ---------- agregar unificado (QR + Manual) ----------
function openAddUnified(){
  console.log('openAddUnified llamada, current:', current);
  if (!current) {
    console.warn('No hay venta actual');
    alert('Crea primero una venta');
    return;
  }
  
  console.log('Creando modal de agregar...');
  // Modal inicial: elegir entre QR y Manual
  const node = document.createElement('div');
  node.className = 'bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6';
  node.style.cssText = 'max-width:600px;margin:0 auto;';
  node.innerHTML = `
    <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-6 text-center">Agregar items</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
      <button id="add-qr-btn" class="px-6 py-8 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex flex-col items-center gap-3 border-none cursor-pointer">
        <span class="text-5xl">📷</span>
        <span class="text-base">Agregar QR</span>
      </button>
      <button id="add-manual-btn" class="px-6 py-8 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-200 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-900 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex flex-col items-center gap-3 border-none cursor-pointer">
        <span class="text-5xl">✏️</span>
        <span class="text-base">Agregar manual</span>
      </button>
    </div>
    <div class="text-center">
      <button id="add-cancel-btn" class="px-6 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-200 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-900 font-semibold rounded-lg transition-all duration-200">Cancelar</button>
    </div>
  `;
  
  const modal = document.getElementById('modal');
  const slot = document.getElementById('modalBody');
  const x = document.getElementById('modalClose');
  
  if (!modal || !slot || !x) {
    console.error('Modal no encontrado:', { modal: !!modal, slot: !!slot, x: !!x });
    alert('Error: No se pudo abrir el modal. Por favor, recarga la página.');
    return;
  }
  
  slot.replaceChildren(node);
  modal.classList.remove('hidden');
  
  // Función para cerrar el modal
  const closeModalHandler = () => {
    modal.classList.add('hidden');
    // Limpiar listeners
    document.removeEventListener('keydown', escHandler);
    modal.removeEventListener('click', backdropHandler);
  };
  
  // Listener para ESC
  const escHandler = (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModalHandler();
    }
  };
  
  // Listener para clic fuera del modal (en el backdrop)
  const backdropHandler = (e) => {
    if (e.target === modal) {
      closeModalHandler();
    }
  };
  
  // Agregar listeners
  document.addEventListener('keydown', escHandler);
  modal.addEventListener('click', backdropHandler);
  
  x.onclick = closeModalHandler;
  
  console.log('Modal de agregar abierto');
  
  // Estilos hover para los botones
  const qrBtn = node.querySelector('#add-qr-btn');
  const manualBtn = node.querySelector('#add-manual-btn');
  const cancelBtn = node.querySelector('#add-cancel-btn');
  
  if (!qrBtn || !manualBtn || !cancelBtn) {
    console.error('Botones no encontrados en el modal:', { qrBtn: !!qrBtn, manualBtn: !!manualBtn, cancelBtn: !!cancelBtn });
    return;
  }
  
  qrBtn.addEventListener('mouseenter', () => {
    qrBtn.style.transform = 'scale(1.05)';
    qrBtn.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
  });
  qrBtn.addEventListener('mouseleave', () => {
    qrBtn.style.transform = 'scale(1)';
    qrBtn.style.boxShadow = '';
  });
  
  manualBtn.addEventListener('mouseenter', () => {
    manualBtn.style.transform = 'scale(1.05)';
    manualBtn.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
  });
  manualBtn.addEventListener('mouseleave', () => {
    manualBtn.style.transform = 'scale(1)';
    manualBtn.style.boxShadow = '';
  });
  
  // Si selecciona QR, abrir el modal de QR
  qrBtn.addEventListener('click', (e) => {
    console.log('Click en botón QR detectado');
    e.preventDefault();
    e.stopPropagation();
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
    openQR();
  });
  
  // Si selecciona Manual, mostrar navegación entre Lista de precios e Inventario
  manualBtn.addEventListener('click', (e) => {
    console.log('Click en botón Manual detectado');
    e.preventDefault();
    e.stopPropagation();
    showManualView(node);
  });
  
  cancelBtn.addEventListener('click', (e) => {
    console.log('Click en botón Cancelar detectado');
    e.preventDefault();
    e.stopPropagation();
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
  });
}

// Vista de agregar manual (navegación entre Lista de precios e Inventario)
function showManualView(parentNode) {
  const currentVehicleId = current?.vehicle?.vehicleId || null;
  let currentView = currentVehicleId ? 'prices' : 'inventory'; // Por defecto, mostrar inventario si no hay vehículo
  
  function renderView() {
    parentNode.innerHTML = `
      <div style="margin-bottom:16px;">
        <h3 style="margin-top:0;margin-bottom:16px;">Agregar manual</h3>
        <div style="display:flex;gap:8px;border-bottom:2px solid var(--border);padding-bottom:8px;">
          <button id="nav-prices" class="${currentView === 'prices' ? 'primary' : 'secondary'}" style="flex:1;padding:12px;border-radius:8px 8px 0 0;border:none;font-weight:600;cursor:pointer;transition:all 0.2s;">
            💰 Lista de precios
          </button>
          <button id="nav-inventory" class="${currentView === 'inventory' ? 'primary' : 'secondary'}" style="flex:1;padding:12px;border-radius:8px 8px 0 0;border:none;font-weight:600;cursor:pointer;transition:all 0.2s;">
            📦 Inventario
          </button>
        </div>
      </div>
      <div id="manual-content" style="min-height:400px;max-height:70vh;overflow-y:auto;"></div>
      <div style="margin-top:16px;text-align:center;">
        <button id="manual-back-btn" class="secondary" style="padding:8px 24px;">← Volver</button>
      </div>
    `;
    
    const navPrices = parentNode.querySelector('#nav-prices');
    const navInventory = parentNode.querySelector('#nav-inventory');
    const manualBack = parentNode.querySelector('#manual-back-btn');
    const content = parentNode.querySelector('#manual-content');
    
    navPrices.onclick = () => {
      currentView = 'prices';
      renderView();
    };
    
    navInventory.onclick = () => {
      currentView = 'inventory';
      renderView();
    };
    
    manualBack.onclick = () => {
      // Volver al menú inicial
      openAddUnified();
    };
    
    // Renderizar contenido según la vista actual
    if (currentView === 'prices') {
      renderPricesView(content, currentVehicleId);
    } else {
      renderInventoryView(content);
    }
  }
  
  renderView();
}

// Vista de Lista de precios
async function renderPricesView(container, vehicleId) {
  container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">Cargando...</div>';
  
  if (!vehicleId) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px;">
        <div style="font-size:48px;margin-bottom:16px;">🚗</div>
        <h4 style="margin-bottom:8px;">No hay vehículo vinculado</h4>
        <p style="color:var(--muted);margin-bottom:16px;">Vincula un vehículo a la venta para ver los precios disponibles.</p>
        <button id="edit-vehicle-btn" class="primary" style="padding:8px 16px;">Editar vehículo</button>
      </div>
    `;
    container.querySelector('#edit-vehicle-btn')?.addEventListener('click', () => {
      closeModal();
      openEditCV();
    });
    return;
  }
  
  try {
    // Obtener información del vehículo
    const vehicle = await API.vehicles.get(vehicleId);
    
    // Variables de estado para filtros y paginación
    let currentPage = 1;
    const pageSize = 10;
    let filterType = '';
    let filterName = '';
    let totalPrices = 0;
    
    async function loadPrices() {
      try {
    const vehicleYear = current?.vehicle?.year || null;
        const pricesParams = { 
          vehicleId, 
          page: currentPage, 
          limit: pageSize 
        };
    if (vehicleYear) {
      pricesParams.vehicleYear = vehicleYear;
    }
        if (filterType) {
          pricesParams.type = filterType;
        }
        if (filterName) {
          pricesParams.name = filterName;
        }
        
    const pricesData = await API.pricesList(pricesParams);
    const prices = Array.isArray(pricesData?.items) ? pricesData.items : (Array.isArray(pricesData) ? pricesData : []);
        totalPrices = pricesData?.total || pricesData?.items?.length || prices.length;
        
        renderPricesList(prices);
        updatePagination();
      } catch (err) {
        console.error('Error loading prices:', err);
        container.querySelector('#prices-list').innerHTML = '<div style="text-align:center;padding:24px;color:var(--danger);">Error al cargar precios</div>';
      }
    }
    
    function renderPricesList(prices) {
    const pricesList = container.querySelector('#prices-list');
      if (!pricesList) return;
    
    if (prices.length === 0) {
        pricesList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">No hay precios que coincidan con los filtros.</div>';
        return;
      }
      
      pricesList.innerHTML = '';
      prices.forEach(pe => {
        const card = document.createElement('div');
        card.style.cssText = 'padding:12px;background:var(--card-alt);border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;';
        
        let typeBadge = '';
        if (pe.type === 'combo') {
          typeBadge = '<span style="background:#9333ea;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">COMBO</span>';
        } else if (pe.type === 'product') {
          typeBadge = '<span style="background:var(--primary,#3b82f6);color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">PRODUCTO</span>';
        } else {
          typeBadge = '<span style="background:var(--success,#10b981);color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">SERVICIO</span>';
        }
        
        card.innerHTML = `
          <div style="flex:1;">
            ${typeBadge}
            <span style="font-weight:600;">${pe.name || 'Sin nombre'}</span>
          </div>
          <div style="margin:0 16px;font-weight:600;color:var(--primary);">${money(pe.total || pe.price || 0)}</div>
          <button class="add-price-btn primary" data-price-id="${pe._id}" style="padding:6px 16px;border-radius:6px;border:none;cursor:pointer;font-weight:600;">Agregar</button>
        `;
        
        card.querySelector('.add-price-btn').onclick = async () => {
          try {
            current = await API.sales.addItem(current._id, { source:'price', refId: pe._id, qty:1 });
            syncCurrentIntoOpenList();
            renderTabs();
            renderSale();
            renderWO();
            // Mostrar feedback
            const btn = card.querySelector('.add-price-btn');
            const originalText = btn.textContent;
            btn.textContent = '✓ Agregado';
            btn.disabled = true;
            btn.style.background = 'var(--success, #10b981)';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.disabled = false;
              btn.style.background = '';
            }, 2000);
          } catch (err) {
            alert('Error: ' + (err?.message || 'No se pudo agregar'));
          }
        };
        
        pricesList.appendChild(card);
      });
    }
    
    function updatePagination() {
      const pageInfo = container.querySelector('#page-info');
      const btnPrev = container.querySelector('#btn-prev-prices');
      const btnNext = container.querySelector('#btn-next-prices');
      const totalPages = Math.ceil(totalPrices / pageSize);
      
      if (pageInfo) {
        const start = (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, totalPrices);
        pageInfo.textContent = `${start}-${end} de ${totalPrices}`;
      }
      
      if (btnPrev) btnPrev.disabled = currentPage <= 1;
      if (btnNext) btnNext.disabled = currentPage >= totalPages;
    }
    
    container.innerHTML = `
      <div style="margin-bottom:16px;padding:12px;background:var(--card-alt);border-radius:8px;">
        <div style="font-weight:600;margin-bottom:4px;">${vehicle?.make || ''} ${vehicle?.line || ''}</div>
        <div style="font-size:12px;color:var(--muted);">Cilindraje: ${vehicle?.displacement || ''}${vehicle?.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}</div>
      </div>
      <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="create-service-btn" class="secondary" style="flex:1;min-width:120px;padding:10px;border-radius:8px;font-weight:600;">
          ➕ Crear servicio
        </button>
        <button id="create-product-btn" class="secondary" style="flex:1;min-width:120px;padding:10px;border-radius:8px;font-weight:600;">
          ➕ Crear producto
        </button>
        <button id="create-combo-btn" class="secondary" style="flex:1;min-width:120px;padding:10px;border-radius:8px;font-weight:600;background:#9333ea;color:white;border:none;">
          🎁 Crear combo
        </button>
      </div>
      <div style="margin-bottom:12px;">
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <select id="filter-type-prices" style="flex:1;min-width:120px;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);">
            <option value="">Todos los tipos</option>
            <option value="service">Servicios</option>
            <option value="product">Productos</option>
            <option value="combo">Combos</option>
          </select>
          <input type="text" id="filter-name-prices" placeholder="Buscar por nombre..." style="flex:2;min-width:150px;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--text);" />
          <button id="btn-apply-filters-prices" class="primary" style="padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-weight:600;">Buscar</button>
        </div>
        <h4 style="margin-bottom:8px;">Precios disponibles</h4>
        <div id="prices-list" style="display:grid;gap:8px;"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
          <div style="font-size:12px;color:var(--muted);">
            Mostrando <span id="page-info">0-0</span>
          </div>
          <div style="display:flex;gap:8px;">
            <button id="btn-prev-prices" class="secondary" style="padding:6px 12px;border-radius:6px;border:none;cursor:pointer;" disabled>← Anterior</button>
            <button id="btn-next-prices" class="secondary" style="padding:6px 12px;border-radius:6px;border:none;cursor:pointer;">Siguiente →</button>
          </div>
        </div>
      </div>
    `;
    
    // Event listeners para filtros
    container.querySelector('#btn-apply-filters-prices')?.addEventListener('click', () => {
      filterType = container.querySelector('#filter-type-prices')?.value || '';
      filterName = container.querySelector('#filter-name-prices')?.value.trim() || '';
      currentPage = 1;
      loadPrices();
    });
    
    container.querySelector('#filter-name-prices')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        filterType = container.querySelector('#filter-type-prices')?.value || '';
        filterName = container.querySelector('#filter-name-prices')?.value.trim() || '';
        currentPage = 1;
        loadPrices();
      }
    });
    
    // Event listeners para paginación
    container.querySelector('#btn-prev-prices')?.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadPrices();
      }
    });
    
    container.querySelector('#btn-next-prices')?.addEventListener('click', () => {
      currentPage++;
      loadPrices();
    });
    
    // Botones de crear
    container.querySelector('#create-service-btn').onclick = () => {
      closeModal();
      createPriceFromSale('service', vehicleId, vehicle);
    };
    
    container.querySelector('#create-product-btn').onclick = () => {
      closeModal();
      createPriceFromSale('product', vehicleId, vehicle);
    };
    
    container.querySelector('#create-combo-btn').onclick = () => {
      closeModal();
      createPriceFromSale('combo', vehicleId, vehicle);
    };
    
    // Cargar precios iniciales
    await loadPrices();
    
  } catch (err) {
    console.error('Error al cargar precios:', err);
    container.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--danger);">
        <div style="font-size:48px;margin-bottom:16px;">❌</div>
        <p>Error al cargar precios: ${err?.message || 'Error desconocido'}</p>
      </div>
    `;
  }
}

// Vista de Inventario
async function renderInventoryView(container) {
  container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">Cargando...</div>';
  
  let page = 1;
  const limit = 10;
  let searchSku = '';
  let searchName = '';
  
  async function loadItems(reset = false) {
    if (reset) {
      page = 1;
      container.querySelector('#inventory-list')?.replaceChildren();
    }
    
    try {
      const items = await API.inventory.itemsList({ 
        sku: searchSku || '', 
        name: searchName || '', 
        page, 
        limit 
      });
      
      const listContainer = container.querySelector('#inventory-list');
      if (!listContainer) return;
      
      if (reset) {
        listContainer.innerHTML = '';
      }
      
      if (items.length === 0 && page === 1) {
        listContainer.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">No se encontraron items.</div>';
        return;
      }
      
      items.forEach(item => {
        const card = document.createElement('div');
        card.style.cssText = 'padding:12px;background:var(--card-alt);border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
        
        card.innerHTML = `
          <div style="flex:1;">
            <div style="font-weight:600;margin-bottom:4px;">${item.name || 'Sin nombre'}</div>
            <div style="font-size:13px;color:var(--text);"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku || 'N/A'}</strong> | Stock: ${item.stock || 0} | ${money(item.salePrice || 0)}</div>
          </div>
          <button class="add-inventory-btn primary" data-item-id="${item._id}" style="padding:6px 16px;border-radius:6px;border:none;cursor:pointer;font-weight:600;margin-left:12px;">Agregar</button>
        `;
        
        card.querySelector('.add-inventory-btn').onclick = async () => {
          try {
            current = await API.sales.addItem(current._id, { source:'inventory', refId: item._id, qty:1 });
            syncCurrentIntoOpenList();
            renderTabs();
            renderSale();
            renderWO();
            // Mostrar feedback
            const btn = card.querySelector('.add-inventory-btn');
            const originalText = btn.textContent;
            btn.textContent = '✓ Agregado';
            btn.disabled = true;
            btn.style.background = 'var(--success, #10b981)';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.disabled = false;
              btn.style.background = '';
            }, 2000);
          } catch (err) {
            alert('Error: ' + (err?.message || 'No se pudo agregar'));
          }
        };
        
        listContainer.appendChild(card);
      });
      
      // Mostrar botón "Cargar más" si hay más items
      const loadMoreBtn = container.querySelector('#load-more-inventory');
      if (loadMoreBtn) {
        loadMoreBtn.style.display = items.length >= limit ? 'block' : 'none';
      }
      
    } catch (err) {
      console.error('Error al cargar inventario:', err);
      container.querySelector('#inventory-list').innerHTML = `
        <div style="text-align:center;padding:24px;color:var(--danger);">
          <p>Error al cargar inventario: ${err?.message || 'Error desconocido'}</p>
        </div>
      `;
    }
  }
  
  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h4 style="margin-bottom:12px;">Filtrar inventario</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <input id="inventory-filter-sku" type="text" placeholder="Buscar por SKU..." style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        <input id="inventory-filter-name" type="text" placeholder="Buscar por nombre..." style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
      </div>
      <button id="inventory-search-btn" class="primary" style="width:100%;padding:10px;border-radius:6px;border:none;font-weight:600;cursor:pointer;">🔍 Buscar</button>
    </div>
    <div id="inventory-list" style="max-height:50vh;overflow-y:auto;"></div>
    <div style="text-align:center;margin-top:12px;">
      <button id="load-more-inventory" class="secondary" style="padding:8px 16px;display:none;">Cargar más</button>
    </div>
  `;
  
  const filterSku = container.querySelector('#inventory-filter-sku');
  const filterName = container.querySelector('#inventory-filter-name');
  const searchBtn = container.querySelector('#inventory-search-btn');
  const loadMoreBtn = container.querySelector('#load-more-inventory');
  
  let searchTimeout = null;
  
  filterSku.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchSku = filterSku.value.trim();
      loadItems(true);
    }, 500);
  });
  
  filterName.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchName = filterName.value.trim();
      loadItems(true);
    }, 500);
  });
  
  searchBtn.onclick = () => {
    searchSku = filterSku.value.trim();
    searchName = filterName.value.trim();
    loadItems(true);
  };
  
  loadMoreBtn.onclick = () => {
    page++;
    loadItems(false);
  };
  
  // Cargar items iniciales
  loadItems(true);
}

// Crear precio desde venta (reutilizar lógica de prices.js)
async function createPriceFromSale(type, vehicleId, vehicle) {
  // Importar la función de prices.js o recrearla aquí
  // Por ahora, abrir un modal simple para crear el precio
  const node = document.createElement('div');
  node.className = 'card';
  node.style.cssText = 'max-width:600px;margin:0 auto;';
  
  const isCombo = type === 'combo';
  const isProduct = type === 'product';
  const isService = type === 'service';
  
  node.innerHTML = `
    <h3 style="margin-top:0;margin-bottom:16px;">Crear ${type === 'combo' ? 'Combo' : (type === 'service' ? 'Servicio' : 'Producto')}</h3>
    <p class="muted" style="margin-bottom:16px;font-size:13px;">
      Vehículo: <strong>${vehicle?.make || ''} ${vehicle?.line || ''}</strong>
    </p>
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Nombre</label>
      <input id="price-name" placeholder="${type === 'combo' ? 'Ej: Combo mantenimiento completo' : (type === 'service' ? 'Ej: Cambio de aceite' : 'Ej: Filtro de aire')}" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
    </div>
    ${isProduct ? `
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Vincular con item del inventario (opcional)</label>
      <div class="row" style="gap:8px;margin-bottom:8px;">
        <input id="price-item-search" placeholder="Buscar por SKU o nombre..." style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        <button id="price-item-qr" class="secondary" style="padding:8px 16px;">📷 QR</button>
      </div>
      <div id="price-item-selected" style="margin-top:8px;padding:8px;background:var(--card-alt);border-radius:6px;font-size:12px;display:none;"></div>
      <input type="hidden" id="price-item-id" />
    </div>
    ` : ''}
    ${isCombo ? `
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Productos del combo</label>
      <div id="price-combo-products" style="margin-bottom:8px;"></div>
      <button id="price-add-combo-product" class="secondary" style="width:100%;padding:8px;margin-bottom:8px;">➕ Agregar producto</button>
    </div>
    ` : ''}
    ${!isCombo ? `
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Precio</label>
      <input id="price-total" type="number" step="0.01" placeholder="0" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
    </div>
    ` : `
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Precio total del combo</label>
      <input id="price-total" type="number" step="0.01" placeholder="0 (se calcula automáticamente)" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
      <p class="muted" style="margin-top:4px;font-size:11px;">El precio se calcula automáticamente desde los productos, o puedes establecerlo manualmente.</p>
    </div>
    `}
    <div style="margin-bottom:16px;padding:12px;background:var(--card-alt);border-radius:8px;border:1px solid var(--border);">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500;">Rango de años (opcional)</label>
      <p class="muted" style="margin-bottom:8px;font-size:11px;">Solo aplicar este precio si el año del vehículo está en el rango especificado. Déjalo vacío para aplicar a todos los años.</p>
      <div class="row" style="gap:8px;">
        <div style="flex:1;">
          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;">Desde</label>
          <input id="price-year-from" type="number" min="1900" max="2100" placeholder="Ej: 2018" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        </div>
        <div style="flex:1;">
          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;">Hasta</label>
          <input id="price-year-to" type="number" min="1900" max="2100" placeholder="Ej: 2022" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        </div>
      </div>
    </div>
    ${isCombo || isProduct || isService ? `
    <div style="margin-bottom:16px;padding:12px;background:rgba(59, 130, 246, 0.1);border-radius:8px;border:1px solid rgba(59, 130, 246, 0.3);">
      <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:500;">Mano de obra (opcional)</label>
      <p class="muted" style="margin-bottom:8px;font-size:11px;">Estos valores se usarán automáticamente al cerrar la venta para agregar participación técnica.</p>
      <div class="row" style="gap:8px;">
        <div style="flex:1;">
          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;">Valor de mano de obra</label>
          <input id="price-labor-value" type="number" min="0" step="1" placeholder="0" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
        </div>
        <div style="flex:1;">
          <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:4px;">Tipo de mano de obra</label>
          <select id="price-labor-kind" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
            <option value="">-- Seleccione tipo --</option>
          </select>
        </div>
      </div>
    </div>
    ` : ''}
    <div id="price-msg" style="margin-bottom:16px;font-size:13px;"></div>
    <div class="row" style="gap:8px;">
      <button id="price-save" style="flex:1;padding:10px;">💾 Guardar</button>
      <button id="price-cancel" class="secondary" style="flex:1;padding:10px;">Cancelar</button>
    </div>
  `;
  
  openModal(node);
  
  const nameInput = node.querySelector('#price-name');
  const totalInput = node.querySelector('#price-total');
  const msgEl = node.querySelector('#price-msg');
  const saveBtn = node.querySelector('#price-save');
  const cancelBtn = node.querySelector('#price-cancel');
  let selectedItem = null;
  
  // Cargar laborKinds en el select si existe
  if (isCombo || isProduct || isService) {
    const laborKindSelect = node.querySelector('#price-labor-kind');
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
            laborKindsList.map(k => `<option value="${k}">${k}</option>`).join('');
        } catch (err) {
          console.error('Error cargando laborKinds:', err);
        }
      }
      loadLaborKinds();
    }
  }
  
  // Funcionalidad de búsqueda de items (solo para productos)
  if (isProduct) {
    const itemSearch = node.querySelector('#price-item-search');
    const itemSelected = node.querySelector('#price-item-selected');
    const itemIdInput = node.querySelector('#price-item-id');
    const itemQrBtn = node.querySelector('#price-item-qr');
    
    let searchTimeout = null;
    
    async function searchItems(query) {
      if (!query || query.length < 2) return;
      try {
        let items = [];
        try {
          items = await API.inventory.itemsList({ sku: query });
          if (items.length === 0) {
            items = await API.inventory.itemsList({ name: query });
          }
        } catch (err) {
          console.error('Error al buscar items:', err);
        }
        // Mostrar resultados en un dropdown (simplificado)
        if (items && items.length > 0) {
          const item = items[0]; // Tomar el primero
          selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
          itemIdInput.value = item._id;
          itemSearch.value = `${item.sku} - ${item.name}`;
          itemSelected.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong>${item.name}</strong><br>
                <span style="font-size:12px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span>
              </div>
              <button id="price-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
            </div>
          `;
          itemSelected.style.display = 'block';
          if (!totalInput.value || totalInput.value === '0') {
            totalInput.value = item.salePrice || 0;
          }
        }
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
    
    itemQrBtn.onclick = async () => {
      try {
        // Importar openQRForItem desde prices.js
        const { openQRForItem } = await import('./prices.js');
        const qrCode = await openQRForItem();
        if (!qrCode) return;
        
        if (qrCode.toUpperCase().startsWith('IT:')) {
          const parts = qrCode.split(':').map(p => p.trim()).filter(Boolean);
          const itemId = parts.length >= 3 ? parts[2] : null;
          if (itemId) {
            const items = await API.inventory.itemsList({});
            const item = items.find(i => String(i._id) === itemId);
            if (item) {
              selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
              itemIdInput.value = item._id;
              itemSearch.value = `${item.sku} - ${item.name}`;
              itemSelected.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <strong>${item.name}</strong><br>
                    <span class="muted">SKU: ${item.sku} | Stock: ${item.stock || 0}</span>
                  </div>
                  <button id="price-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
                </div>
              `;
              itemSelected.style.display = 'block';
              if (!totalInput.value || totalInput.value === '0') {
                totalInput.value = item.salePrice || 0;
              }
              return;
            }
          }
        }
        
        const items = await API.inventory.itemsList({ sku: qrCode, limit: 1 });
        if (items && items.length > 0) {
          const item = items[0];
          selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
          itemIdInput.value = item._id;
          itemSearch.value = `${item.sku} - ${item.name}`;
          itemSelected.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong>${item.name}</strong><br>
                <span style="font-size:12px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span>
              </div>
              <button id="price-item-remove" class="danger" style="padding:4px 8px;font-size:11px;">✕</button>
            </div>
          `;
          itemSelected.style.display = 'block';
          if (!totalInput.value || totalInput.value === '0') {
            totalInput.value = item.salePrice || 0;
          }
        } else {
          alert('Item no encontrado');
        }
      } catch (err) {
        alert('Error al leer QR: ' + (err?.message || 'Error desconocido'));
      }
    };
    
    const removeBtn = itemSelected.querySelector('#price-item-remove');
    if (removeBtn) {
      removeBtn.onclick = () => {
        selectedItem = null;
        itemIdInput.value = '';
        itemSearch.value = '';
        itemSelected.style.display = 'none';
      };
    }
  }
  
  // Funcionalidad para combos
  if (isCombo) {
    const comboProductsContainer = node.querySelector('#price-combo-products');
    const addComboProductBtn = node.querySelector('#price-add-combo-product');
    
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
            <input type="text" class="combo-product-item-search" placeholder="Buscar item del inventario (opcional)..." style="flex:1;padding:6px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);" />
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
      
      const openSlotCheckbox = row.querySelector('.combo-product-open-slot');
      const itemSection = row.querySelector('.combo-product-item-section');
      
      openSlotCheckbox.addEventListener('change', (e) => {
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
      
      const itemSearch = row.querySelector('.combo-product-item-search');
      const itemSelected = row.querySelector('.combo-product-item-selected');
      const itemIdInput = row.querySelector('.combo-product-item-id');
      const itemQrBtn = row.querySelector('.combo-product-item-qr');
      let selectedComboItem = productData.itemId ? { _id: productData.itemId._id, sku: productData.itemId.sku, name: productData.itemId.name, stock: productData.itemId.stock, salePrice: productData.itemId.salePrice } : null;
      
      if (productData.itemId) {
        itemSearch.value = `${productData.itemId.sku || ''} - ${productData.itemId.name || ''}`;
        itemSelected.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div><strong>${productData.itemId.name || productData.itemId.sku}</strong> <span style="font-size:12px;margin-left:8px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${productData.itemId.sku}</strong> | Stock: ${productData.itemId.stock || 0}</span></div>
            <button class="combo-product-item-remove-btn danger" style="padding:2px 6px;font-size:10px;">✕</button>
          </div>
        `;
        itemSelected.style.display = 'block';
      }
      
      let searchTimeout = null;
      async function searchComboItems(query) {
        if (!query || query.length < 2) return;
        try {
          let items = [];
          try {
            items = await API.inventory.itemsList({ sku: query });
            if (items.length === 0) {
              items = await API.inventory.itemsList({ name: query });
            }
          } catch (err) {
            console.error('Error al buscar items:', err);
          }
          if (!items || items.length === 0) return;
          
          // Limpiar dropdown anterior si existe antes de crear uno nuevo
          const existingDropdown = itemSearch.parentElement.querySelector('div[style*="position:absolute"]');
          if (existingDropdown) existingDropdown.remove();
          
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
                  itemSelected.style.display = 'none';
                };
              }
              dropdown.remove();
              const priceInput = row.querySelector('.combo-product-price');
              if (!priceInput.value || priceInput.value === '0') {
                priceInput.value = item.salePrice || 0;
              }
              updateComboTotal();
            });
            div.addEventListener('mouseenter', () => { div.style.background = 'var(--hover, rgba(0,0,0,0.05))'; });
            div.addEventListener('mouseleave', () => { div.style.background = ''; });
            return div;
          }));
          
          const searchContainer = itemSearch.parentElement;
          searchContainer.style.position = 'relative';
          searchContainer.appendChild(dropdown);
          
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
      
      itemQrBtn.onclick = async () => {
        try {
          const { openQRForItem } = await import('./prices.js');
          const qrCode = await openQRForItem();
          if (!qrCode) return;
          
          if (qrCode.toUpperCase().startsWith('IT:')) {
            const parts = qrCode.split(':').map(p => p.trim()).filter(Boolean);
            const itemId = parts.length >= 3 ? parts[2] : null;
            if (itemId) {
              const items = await API.inventory.itemsList({});
              const item = items.find(i => String(i._id) === itemId);
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
                const priceInput = row.querySelector('.combo-product-price');
                if (!priceInput.value || priceInput.value === '0') {
                  priceInput.value = item.salePrice || 0;
                }
                updateComboTotal();
                return;
              }
            }
          }
          
          const items = await API.inventory.itemsList({ sku: qrCode, limit: 1 });
          if (items && items.length > 0) {
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
            const priceInput = row.querySelector('.combo-product-price');
            if (!priceInput.value || priceInput.value === '0') {
              priceInput.value = item.salePrice || 0;
            }
            updateComboTotal();
          } else {
            alert('Item no encontrado');
          }
        } catch (err) {
          if (err?.message !== 'Cancelado por el usuario') {
            alert('Error al leer QR: ' + (err?.message || 'Error desconocido'));
          }
        }
      };
      
      row.querySelector('.combo-product-price').addEventListener('input', updateComboTotal);
      row.querySelector('.combo-product-qty').addEventListener('input', updateComboTotal);
      
      comboProductsContainer.appendChild(row);
    }
    
    function updateComboTotal() {
      const products = Array.from(comboProductsContainer.querySelectorAll('.combo-product-item'));
      let total = 0;
      products.forEach(prod => {
        const qty = Number(prod.querySelector('.combo-product-qty')?.value || 1);
        const price = Number(prod.querySelector('.combo-product-price')?.value || 0);
        total += qty * price;
      });
      if (totalInput && (!totalInput.value || totalInput.value === '0' || totalInput !== document.activeElement)) {
        if (totalInput !== document.activeElement) {
          totalInput.value = total;
        }
      }
    }
    
    addComboProductBtn.onclick = () => {
      addComboProductRow();
      updateComboTotal();
    };
    
    // Inicializar con un producto por defecto
    addComboProductRow();
  }
  
  saveBtn.onclick = async () => {
    const name = nameInput.value.trim();
    let total = Number(totalInput.value) || 0;
    
    if (!name) {
      msgEl.textContent = 'El nombre es requerido';
      msgEl.style.color = 'var(--danger, #ef4444)';
      return;
    }
    
    if (total < 0) {
      msgEl.textContent = 'El precio debe ser mayor o igual a 0';
      msgEl.style.color = 'var(--danger, #ef4444)';
      return;
    }
    
    // Validar combo
    if (isCombo) {
      const comboProductsContainer = node.querySelector('#price-combo-products');
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
      saveBtn.textContent = 'Guardando...';
      
      const yearFromInput = node.querySelector('#price-year-from');
      const yearToInput = node.querySelector('#price-year-to');
      const yearFrom = yearFromInput?.value?.trim() || null;
      const yearTo = yearToInput?.value?.trim() || null;
      
      const payload = {
        vehicleId: vehicleId,
        name: name,
        type: type,
        total: total,
        yearFrom: yearFrom || null,
        yearTo: yearTo || null
      };
      
      if (isProduct && selectedItem) {
        payload.itemId = selectedItem._id;
      }
      
      if (isCombo) {
        const comboProductsContainer = node.querySelector('#price-combo-products');
        const products = Array.from(comboProductsContainer.querySelectorAll('.combo-product-item'));
        payload.comboProducts = products.map(prod => {
          const isOpenSlot = prod.querySelector('.combo-product-open-slot')?.checked || false;
          return {
            name: prod.querySelector('.combo-product-name')?.value.trim() || '',
            qty: Number(prod.querySelector('.combo-product-qty')?.value || 1),
            unitPrice: Number(prod.querySelector('.combo-product-price')?.value || 0),
            itemId: isOpenSlot ? null : (prod.querySelector('.combo-product-item-id')?.value || null),
            isOpenSlot: isOpenSlot
          };
        }).filter(p => p.name);
      }
      
      // Agregar campos de mano de obra si existen
      if (isCombo || isProduct || isService) {
        const laborValueInput = node.querySelector('#price-labor-value');
        const laborKindSelect = node.querySelector('#price-labor-kind');
        if (laborValueInput && laborKindSelect) {
          const laborValue = Number(laborValueInput.value || 0) || 0;
          const laborKind = laborKindSelect.value?.trim() || '';
          if (laborValue > 0 || laborKind) {
            payload.laborValue = laborValue;
            payload.laborKind = laborKind;
          }
        }
      }
      
      // Crear el precio y obtener el precio completo con comboProducts si es combo
      const newPrice = await API.priceCreate(payload);
      
      // Agregar el precio recién creado a la venta
      // El backend maneja automáticamente los combos cuando se agrega un precio tipo combo
      // Buscará el precio completo y agregará todos los productos del combo automáticamente
      if (newPrice && newPrice._id) {
        current = await API.sales.addItem(current._id, { source:'price', refId: newPrice._id, qty:1 });
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale();
        renderWO();
      }
      
      closeModal();
    } catch(e) {
      msgEl.textContent = 'Error: ' + (e?.message || 'Error desconocido');
      msgEl.style.color = 'var(--danger, #ef4444)';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Guardar';
    }
  };
  
  cancelBtn.onclick = () => {
    closeModal();
  };
}

function openAddManual(){
  if (!current) return alert('Crea primero una venta');
  const tpl = document.getElementById('tpl-add-manual'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  node.querySelector('#am-cancel').onclick = ()=> closeModal();
  node.querySelector('#am-add').onclick = async ()=>{
    const name = node.querySelector('#am-name').value.trim();
    const qty  = Number(node.querySelector('#am-qty').value||1)||1;
    const price= Number(node.querySelector('#am-price').value||0)||0;
    const sku  = node.querySelector('#am-sku').value.trim();
    if (!name) return alert('Descripción requerida');
    current = await API.sales.addItem(current._id, { source:'service', sku, name, qty, unitPrice:price });
    syncCurrentIntoOpenList();
    renderTabs();
    closeModal(); renderSale(); renderWO();
  };
}

function openAddPicker(){
  if (!current) return alert('Crea primero una venta');
  const node = document.createElement('div'); node.className='card';
  node.innerHTML = `<h3>Agregar</h3>
    <div class="row" style="gap:8px;">
      <button id="go-inv" class="secondary">Desde inventario</button>
      <button id="go-pr"  class="secondary">Desde lista de precios</button>
    </div>`;
  openModal(node);
  node.querySelector('#go-inv').onclick = ()=>{ closeModal(); openPickerInventory(); };
  node.querySelector('#go-pr').onclick  = ()=>{ closeModal(); openPickerPrices(); };
}

async function openPickerInventory(){
  const tpl = document.getElementById('tpl-inv-picker'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const body=node.querySelector('#p-inv-body'), cnt=node.querySelector('#p-inv-count');
  const qName=node.querySelector('#p-inv-name'), qSku=node.querySelector('#p-inv-sku');
  let page=1, limit=20;
  async function load(reset=false){
    if(reset){ body.innerHTML=''; page=1; }
    const items = await API.inventory.itemsList({ name:qName.value||'', sku:qSku.value||'', page, limit });
    cnt.textContent = items.length;
    body.innerHTML = '';
    for(const it of items){
      const tr = clone('tpl-inv-row');
      tr.querySelector('img.thumb').src = (it.media?.[0]?.thumbUrl || it.media?.[0]?.url || '') || '';
      tr.querySelector('[data-sku]').textContent = it.sku||'';
      tr.querySelector('[data-name]').textContent = it.name||'';
      tr.querySelector('[data-stock]').textContent = it.stock ?? 0;
      tr.querySelector('[data-price]').textContent = money(it.salePrice||0);
      tr.querySelector('button.add').onclick = async ()=>{
        current = await API.sales.addItem(current._id, { source:'inventory', refId: it._id, qty:1 });
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale(); renderWO();
      };
      body.appendChild(tr);
    }
  }
  node.querySelector('#p-inv-search').onclick = ()=> load(true);
  node.querySelector('#p-inv-more').onclick   = ()=> { page++; load(); };
  node.querySelector('#p-inv-cancel').onclick = ()=> closeModal();
  load(true);
}

async function openPickerPrices(){
  const tpl = document.getElementById('tpl-price-picker'); const node = tpl.content.firstElementChild.cloneNode(true);
  openModal(node);
  const head=node.querySelector('#p-pr-head'), body=node.querySelector('#p-pr-body'), cnt=node.querySelector('#p-pr-count');
  const svc=node.querySelector('#p-pr-svc');
  head.innerHTML = '<th>Vehículo</th><th class="t-right">Precio</th><th></th>';
  try{
    const svcs = await API.servicesList();
    svc.replaceChildren(...(svcs||[]).map(s=>{ const o=document.createElement('option'); o.value=s._id; o.textContent=s.name||('Servicio '+s._id.slice(-6)); return o; }));
  }catch{}
  let page=1, limit=20;
  const currentVehicleId = current?.vehicle?.vehicleId || null;
  
  async function load(reset=false){
    if(reset){ body.innerHTML=''; page=1; }
    const params = { serviceId: svc.value||'', page, limit };
    if (currentVehicleId) {
      params.vehicleId = currentVehicleId;
      const vehicleYear = current?.vehicle?.year || null;
      if (vehicleYear) {
        params.vehicleYear = vehicleYear;
      }
    }
    const rows = await API.pricesList(params);
    cnt.textContent = rows.length;
    body.innerHTML = '';
    for(const pe of rows){
      const tr = clone('tpl-price-row');
      const vehicleCell = tr.querySelector('[data-vehicle]') || tr.querySelector('td');
      if (vehicleCell) {
        if (pe.vehicleId && pe.vehicleId.make) {
          vehicleCell.innerHTML = `
            <div style="font-weight:600;">${pe.vehicleId.make} ${pe.vehicleId.line}</div>
            <div style="font-size:12px;color:var(--muted);">Cilindraje: ${pe.vehicleId.displacement}${pe.vehicleId.modelYear ? ` | Modelo: ${pe.vehicleId.modelYear}` : ''}</div>
          `;
        } else {
          vehicleCell.innerHTML = `
            <div>${pe.brand || ''} ${pe.line || ''}</div>
            <div style="font-size:12px;color:var(--muted);">${pe.engine || ''} ${pe.year || ''}</div>
          `;
        }
      }
      const priceCell = tr.querySelector('[data-price]');
      if (priceCell) priceCell.textContent = money(pe.total||pe.price||0);
      tr.querySelector('button.add').onclick = async ()=>{
        current = await API.sales.addItem(current._id, { source:'price', refId: pe._id, qty:1 });
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale(); renderWO();
      };
      body.appendChild(tr);
    }
  }
  node.querySelector('#p-pr-search').onclick = ()=> load(true);
  node.querySelector('#p-pr-more').onclick   = ()=> { page++; load(); };
  node.querySelector('#p-pr-cancel').onclick = ()=> closeModal();
  load(true);
}

// ---------- cotización → venta (mini) ----------
async function loadQuote(){
  const node=document.createElement('div');
  node.className='bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6';
  node.innerHTML=`<h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-6 text-center">Selecciona una cotización</h3>
    <div class="flex flex-col sm:flex-row gap-3 mb-4">
      <input id="qh-text" placeholder="Buscar por cliente/placa..." class="flex-1 px-4 py-2.5 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-50 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 placeholder-slate-500 dark:placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200" />
      <button id="qh-apply" class="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap">Buscar</button>
    </div>
    <div id="qh-list" class="custom-scrollbar space-y-2" style="max-height:400px; overflow-y:auto; margin-top:8px; padding-right:4px;"></div>
    <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50">
      <div id="qh-meta" class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600"></div>
      <div class="flex gap-2">
        <button id="qh-prev" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-white theme-light:text-slate-900 font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-sky-200 theme-light:hover:bg-slate-300" disabled>◀</button>
        <button id="qh-next" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-white theme-light:text-slate-900 font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-sky-200 theme-light:hover:bg-slate-300" disabled>▶</button>
      </div>
    </div>`;
  openModal(node);
  const list=node.querySelector('#qh-list'); const q=node.querySelector('#qh-text');
  const metaEl = node.querySelector('#qh-meta');
  const btnPrev = node.querySelector('#qh-prev');
  const btnNext = node.querySelector('#qh-next');
  let page=1; const pageSize=25;

  async function fetchList(reset=false){
    if(reset) page=1;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if(q.value) params.set('q', q.value);
    const url='?'+params.toString();
    let raw=null; let items=[]; let metadata=null;
    try{
      raw = await API.quotesListRaw(url);
      if (Array.isArray(raw)) { items = raw; metadata = null; }
      else { items = raw.items||[]; metadata = raw.metadata||null; }
    }catch(e){
      list.innerHTML = `<div class="p-4 text-red-400 bg-red-900/20 rounded-lg border border-red-800/50">Error: ${e?.message||'No se pudo cargar'}</div>`; return;
    }
    list.innerHTML='';
    items.forEach(qq=>{
      const card=document.createElement('button');
      card.className='w-full text-left p-4 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-sky-100 hover:bg-slate-700/50 dark:hover:bg-slate-700/50 theme-light:hover:bg-slate-200 border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-300 rounded-lg transition-all duration-200 group';
      card.innerHTML=`
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 group-hover:text-blue-400 dark:group-hover:text-blue-400 theme-light:group-hover:text-blue-600 transition-colors">
              ${(qq.number||'').toString().padStart(5,'0')} - ${qq?.client?.name||qq?.customer?.name||'Sin nombre'}
            </div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">
              ${qq?.vehicle?.plate||'Sin placa'}
            </div>
          </div>
          <div class="ml-4 text-slate-500 dark:text-slate-500 theme-light:text-slate-400 group-hover:text-blue-400 dark:group-hover:text-blue-400 theme-light:group-hover:text-blue-600 transition-colors">
            →
          </div>
        </div>
      `;
      card.onclick = ()=>{ closeModal(); renderQuoteMini(qq); };
      list.appendChild(card);
    });
    if(items.length===0){
      const empty=document.createElement('div');
      empty.className='p-6 text-center text-slate-400 dark:text-slate-400 theme-light:text-slate-600 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-50 rounded-lg border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300';
      empty.textContent = 'No hay cotizaciones en esta página';
      list.appendChild(empty);
    }
    if(metadata){
      metaEl.textContent = `Página ${metadata.page} de ${metadata.pages} (Total ${metadata.total})`;
      btnPrev.disabled = !metadata.hasPrev;
      btnNext.disabled = !metadata.hasNext;
    } else {
      metaEl.textContent = `Página ${page}`;
      btnPrev.disabled = page<=1;
      btnNext.disabled = items.length < pageSize;
    }
  }
  node.querySelector('#qh-apply').onclick = ()=> fetchList(true);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      fetchList(true);
    }
  });
  btnPrev.onclick = ()=>{ if(page>1){ page--; fetchList(); } };
  btnNext.onclick = ()=>{ page++; fetchList(); };
  fetchList();
}
function renderQuoteMini(q){
  const head = document.getElementById('sv-q-header');
  const body = document.getElementById('sv-q-body');
  if (!head || !body) return;
  lastQuoteLoaded = q || null;

  if (lastQuoteLoaded && current?._id) {
    ensureSaleQuoteLink(lastQuoteLoaded);
  } else if (!lastQuoteLoaded && current?._id) {
    setSaleQuoteLink(current._id, null);
  }

  if (!q) {
    head.textContent = '- ninguna cotizacion cargada -';
    body.innerHTML = '';
    const btnReset = document.getElementById('sv-q-to-sale');
    if (btnReset) btnReset.onclick = null;
    return;
  }

  const clientName = q?.client?.name || q?.customer?.name || '';
  const number = q?.number ?? q?.code ?? q?._id ?? '';
  const titleParts = [`Cotizacion #${number ? String(number) : '-'}`];
  if (clientName) titleParts.push(clientName);
  head.textContent = titleParts.join(' - ');
  body.innerHTML = '';

  const itemsAlready = Array.isArray(current?.items) ? current.items : [];

  (q?.items || []).forEach(it => {
    const unit = Number(it.unitPrice ?? it.unit ?? 0) || 0;
    const qty = Number(it.qty || 1) || 1;
    const total = unit * qty;
    const sku = it.sku || '';
    const name = it.description || it.name || '';
    const type = it.type || (it.source === 'service' || String(sku || '').toUpperCase().startsWith('SRV-') ? 'SERVICIO' : 'PRODUCTO');
    const typeLabel = type === 'SERVICIO' ? 'Servicio' : 'Producto';
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-50 transition-colors';
    tr.innerHTML = `
      <td class="py-1 px-0.5 text-xs text-white dark:text-white theme-light:text-slate-900 align-top border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${typeLabel}</td>
      <td class="py-1 px-0.5 text-xs text-white dark:text-white theme-light:text-slate-900 break-words align-top border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${htmlEscape(name || 'Item')}</td>
      <td class="py-1 px-0.5 text-center text-[10px] text-white dark:text-white theme-light:text-slate-900 align-top border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${qty}</td>
      <td class="py-1 px-0.5 text-right text-[10px] text-white dark:text-white theme-light:text-slate-900 font-medium whitespace-nowrap align-top border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${money(unit)}</td>
      <td class="py-1 px-0.5 text-right text-[10px] text-white dark:text-white theme-light:text-slate-900 font-semibold whitespace-nowrap align-top border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${money(total)}</td>
      <td class="py-1 px-0.5 text-center align-top border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">
        <button class="add w-5 h-5 flex items-center justify-center text-[10px] bg-blue-600/20 dark:bg-blue-600/20 hover:bg-blue-600/40 dark:hover:bg-blue-600/40 text-blue-400 dark:text-blue-400 hover:text-blue-300 dark:hover:text-blue-300 font-bold rounded transition-all duration-200 border border-blue-600/30 dark:border-blue-600/30 theme-light:bg-blue-50 theme-light:text-blue-600 theme-light:hover:bg-blue-100 theme-light:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed" type="button" title="Agregar">+</button>
      </td>
    `;
    const btn = tr.querySelector('button.add');
    const alreadyInSale = itemsAlready.some(ci => {
      const skuMatch = (ci.sku || '').toUpperCase() === String(it.sku || '').toUpperCase();
      const nameMatch = (ci.name || '').toUpperCase() === String(it.description || it.name || '').toUpperCase();
      return skuMatch || nameMatch;
    });
    if (btn) {
      btn.onclick = async () => {
        if (!current) {
          current = await API.sales.start();
          syncCurrentIntoOpenList();
          renderTabs();
        }
        ensureSaleQuoteLink(q);
        try {
          const payload = mapQuoteItemToSale(it);
          current = await API.sales.addItem(current._id, payload);
          syncCurrentIntoOpenList();
          renderTabs();
          renderSale();
          renderWO();
          tr.classList.add('added');
          btn.disabled = true;
          btn.textContent = 'V';
          btn.className = 'add px-2 py-1 text-xs bg-green-600/20 dark:bg-green-600/20 text-green-400 dark:text-green-400 font-medium rounded transition-all duration-200 border border-green-600/30 dark:border-green-600/30 theme-light:bg-green-50 theme-light:text-green-600 opacity-50 cursor-not-allowed';
        } catch (err) {
          alert(err?.message || 'No se pudo agregar el item');
        }
      };
    }
    if (alreadyInSale) {
      tr.classList.add('added');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'V';
        btn.className = 'add px-2 py-1 text-xs bg-green-600/20 dark:bg-green-600/20 text-green-400 dark:text-green-400 font-medium rounded transition-all duration-200 border border-green-600/30 dark:border-green-600/30 theme-light:bg-green-50 theme-light:text-green-600 opacity-50 cursor-not-allowed';
      }
    }
    body.appendChild(tr);
  });

  const btnAll = document.getElementById('sv-q-to-sale');
  if (btnAll) {
    btnAll.onclick = async () => {
      if (!q?.items?.length) return;
      if (!current) {
        current = await API.sales.start();
        syncCurrentIntoOpenList();
        renderTabs();
      }
      ensureSaleQuoteLink(q);
      
      // Filtrar items para evitar duplicados de combos
      // El backend expandirá automáticamente los combos, así que si la cotización
      // ya tiene los productos del combo desglosados, debemos omitirlos
      // Estrategia: enviar todos los items, pero el backend verificará si un producto
      // ya viene en el batch antes de expandirlo desde el combo
      // También omitir items anidados del combo (que tienen comboParent)
      const filteredItems = q.items.map(mapQuoteItemToSale).filter(item => item !== null);
      
      try {
        current = await API.sales.addItemsBatch(current._id, filteredItems);
        syncCurrentIntoOpenList();
        renderTabs();
        renderSale();
        renderWO();
      } catch (err) {
        alert(err?.message || 'No se pudo agregar items (batch)');
        return;
      }
      Array.from(document.querySelectorAll('#sv-q-body tr')).forEach(row => {
        row.classList.add('added');
        const button = row.querySelector('button.add');
        if (button) {
          button.disabled = true;
          button.textContent = 'V';
          button.className = 'add px-2 py-1 text-xs bg-green-600/20 dark:bg-green-600/20 text-green-400 dark:text-green-400 font-medium rounded transition-all duration-200 border border-green-600/30 dark:border-green-600/30 theme-light:bg-green-50 theme-light:text-green-600 opacity-50 cursor-not-allowed';
        }
      });
    };
  }
}

// Abrir modal de configuración del mensaje post-servicio
async function openPostServiceConfigModal() {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  const close = document.getElementById('modalClose');
  if (!modal || !body || !close) return;
  
  try {
    // Obtener configuración actual
    const prefs = await API.company.getPreferences();
    const currentConfig = prefs.postServiceMessage || { ratingLink: '', ratingQrImageUrl: '' };
    
    body.innerHTML = `
      <div class="space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar pr-2">
        <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Configurar mensaje post-servicio</h3>
        
        <div class="bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-sky-100/50 p-4 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 mb-4">
          <p class="text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">
            <strong>Plantilla del mensaje:</strong>
          </p>
          <pre class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 whitespace-pre-wrap bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white p-3 rounded border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">Hola {nombre del cliente}, ha sido un placer atenderte en nuestras instalaciones.

Espero todo haya sido de tu agrado, seria genial que nos dieras tu opinion por este medio: {link calificanos}

{Qr calificanos}

Muchas gracias!</pre>
        </div>
        
        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">
            Link de calificación <span class="text-red-400">*</span>
          </label>
          <input 
            id="ps-rating-link" 
            type="url" 
            value="${htmlEscape(currentConfig.ratingLink || '')}"
            class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="https://ejemplo.com/calificar"
          />
          <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">
            Este link reemplazará {link calificanos} en el mensaje
          </p>
        </div>
        
        <div class="mb-4">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">
            QR de calificación (imagen)
          </label>
          <div class="mb-2">
            <input 
              id="ps-rating-qr-file" 
              type="file" 
              accept="image/*"
              class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-600/50 file:text-white file:cursor-pointer hover:file:bg-slate-600"
            />
          </div>
          ${currentConfig.ratingQrImageUrl ? `
            <div class="mt-3 p-3 bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
              <p class="text-xs text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Imagen actual:</p>
              <img src="${htmlEscape(currentConfig.ratingQrImageUrl)}" alt="QR de calificación" class="max-w-[200px] max-h-[200px] rounded border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300" />
            </div>
          ` : ''}
          <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">
            Esta imagen reemplazará {Qr calificanos} en el mensaje
          </p>
        </div>
        
        <div class="flex flex-wrap gap-3 mt-6 pt-4 border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
          <button id="ps-save" class="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar</button>
          <button id="ps-cancel" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-sky-200 theme-light:text-slate-800 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
        </div>
      </div>
    `;
    
    modal.classList.remove('hidden');
    
    // Configurar botón de cerrar del modal
    close.onclick = () => {
      modal.classList.add('hidden');
      body.innerHTML = '';
    };
    
    // Event listeners con setTimeout para asegurar que los elementos existan
    setTimeout(() => {
      const cancelBtn = document.getElementById('ps-cancel');
      const saveBtn = document.getElementById('ps-save');
      
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          modal.classList.add('hidden');
          body.innerHTML = '';
        };
        // Asegurar que sea clickeable en móvil
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.pointerEvents = 'auto';
        cancelBtn.style.touchAction = 'manipulation';
      }
      
      if (saveBtn) {
        saveBtn.onclick = async () => {
          try {
            const linkInput = document.getElementById('ps-rating-link');
            const fileInput = document.getElementById('ps-rating-qr-file');
            
            if (!linkInput || !linkInput.value.trim()) {
              return alert('El link de calificación es obligatorio');
            }
            
            let qrImageUrl = currentConfig.ratingQrImageUrl || '';
            
            // Subir imagen si se seleccionó una nueva
            if (fileInput && fileInput.files && fileInput.files[0]) {
              const uploadRes = await API.mediaUpload([fileInput.files[0]]);
              if (uploadRes && uploadRes.files && uploadRes.files[0]) {
                qrImageUrl = uploadRes.files[0].url || uploadRes.files[0].path || '';
              }
            }
            
            // Guardar configuración
            const prefs = await API.company.getPreferences();
            prefs.postServiceMessage = {
              ratingLink: linkInput.value.trim(),
              ratingQrImageUrl: qrImageUrl
            };
            
            await API.company.setPreferences(prefs);
            
            alert('Configuración guardada exitosamente');
            modal.classList.add('hidden');
            body.innerHTML = '';
          } catch (err) {
            alert('Error al guardar configuración: ' + (err.message || 'Error desconocido'));
          }
        };
        // Asegurar que sea clickeable en móvil
        saveBtn.style.cursor = 'pointer';
        saveBtn.style.pointerEvents = 'auto';
        saveBtn.style.touchAction = 'manipulation';
      }
    }, 50);
  } catch (err) {
    console.error('Error opening post-service config modal:', err);
    alert('Error al cargar configuración: ' + (err.message || 'Error desconocido'));
  }
}

// Enviar encuesta post-servicio por WhatsApp
async function sendPostServiceSurvey(sale) {
  try {
    // Obtener configuración
    const prefs = await API.company.getPreferences();
    const config = prefs.postServiceMessage || {};
    
    if (!config.ratingLink) {
      return alert('Por favor configura el mensaje post-servicio primero usando el botón "Configurar mensaje post-servicio"');
    }
    
    const customerName = sale.customer?.name || 'Cliente';
    const phone = (sale.customer?.phone || '').replace(/\D/g, '');
    
    if (!phone) {
      return alert('No se encontró número de teléfono del cliente');
    }
    
    // Construir mensaje reemplazando variables
    let message = `Hola ${customerName}, ha sido un placer atenderte en nuestras instalaciones.\n\n`;
    message += `Espero todo haya sido de tu agrado, seria genial que nos dieras tu opinion por este medio: ${config.ratingLink}\n\n`;
    
    if (config.ratingQrImageUrl) {
      message += `${config.ratingQrImageUrl}\n\n`;
    }
    
    message += 'Muchas gracias!';
    
    // Codificar mensaje para URL
    const encodedMessage = encodeURIComponent(message);
    
    // Abrir WhatsApp Web/App
    const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  } catch (err) {
    console.error('Error sending post-service survey:', err);
    throw err;
  }
}

// Enviar confirmación por WhatsApp desde evento del calendario
async function sendWhatsAppConfirmation(sale, calendarEventId) {
  try {
    // Obtener configuración del calendario
    const settings = await API.calendar.getSettings();
    
    // Obtener evento del calendario para obtener fecha/hora
    let eventDate = null;
    let eventTime = null;
    try {
      // Buscar evento por ID (necesitamos obtenerlo de alguna manera)
      // Por ahora, usaremos la fecha/hora actual o la fecha de creación de la venta
      const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
      eventDate = saleDate.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      eventTime = saleDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      
      // Intentar obtener el evento del calendario si tenemos el ID
      if (calendarEventId) {
        try {
          // Obtener eventos del mes actual y el siguiente para encontrar el evento
          const now = new Date();
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
          const events = await API.calendar.list({
            from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
            to: nextMonth.toISOString()
          });
          const event = events.items?.find(e => String(e._id) === String(calendarEventId));
          if (event && event.startDate) {
            const eventDateObj = new Date(event.startDate);
            eventDate = eventDateObj.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            eventTime = eventDateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
          }
        } catch (err) {
          console.warn('No se pudo obtener evento del calendario:', err);
        }
      }
    } catch (err) {
      console.error('Error getting event date:', err);
      eventDate = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      eventTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    }
    
    const customerName = sale.customer?.name || 'Cliente';
    const companyName = settings.companyName || 'Nuestra empresa';
    const address = settings.address || '';
    const mapsLink = settings.mapsLink || '';
    
    // Formatear mensaje según especificación
    let message = `Estimado ${customerName}, su cita en ${companyName}, está confirmada para el día ${eventDate} y hora ${eventTime}.\n\n`;
    
    if (address) {
      message += `Te esperamos en esta dirección: ${address}\n`;
    }
    
    if (mapsLink) {
      message += `${mapsLink}\n`;
    }
    
    message += '\nTe esperamos!';
    
    // Codificar mensaje para URL
    const encodedMessage = encodeURIComponent(message);
    
    // Número de teléfono del cliente (limpiar formato)
    const phone = (sale.customer?.phone || '').replace(/\D/g, '');
    if (!phone) {
      return alert('No se encontró número de teléfono del cliente');
    }
    
    // Abrir WhatsApp Web/App
    const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  } catch (err) {
    console.error('Error sending WhatsApp confirmation:', err);
    throw err;
  }
}

// Aplica cliente/vehículo desde la última cotización cargada
async function applyQuoteCustomerVehicle(){
  if(!lastQuoteLoaded){ alert('Primero selecciona una cotización'); return; }
  try{
    if(!current){
      current = await API.sales.start();
      syncCurrentIntoOpenList();
      renderTabs();
    }
    const q = lastQuoteLoaded;
    ensureSaleQuoteLink(q);
    const payload = {
      customer: {
        name: q?.client?.name || q?.customer?.name || '',
        phone: q?.client?.phone || q?.customer?.phone || '',
        email: q?.client?.email || q?.customer?.email || '',
        address: ''
      },
      vehicle: {
        plate: (q?.vehicle?.plate||'').toUpperCase(),
        brand: (q?.vehicle?.make||q?.vehicle?.brand||'').toUpperCase(),
        line:  (q?.vehicle?.line||'').toUpperCase(),
        engine: (q?.vehicle?.displacement||'').toUpperCase(),
        year: q?.vehicle?.modelYear ? Number(q.vehicle.modelYear)||null : null,
        mileage: null
      }
    };
    current = await API.sales.setCustomerVehicle(current._id, payload);
    syncCurrentIntoOpenList();
    renderTabs(); renderMini();
  }catch(e){ alert(e?.message||'No se pudo aplicar datos'); }
}

// ---------- editar cliente/vehículo ----------
function openEditCV(){
  if(!current) return alert('Crea primero una venta');
  const node = clone('sales-cv-template');
  const c=current.customer||{}, v=current.vehicle||{};
  node.querySelector('#c-name').value = c.name||'';
  node.querySelector('#c-id').value   = c.idNumber||'';
  node.querySelector('#c-phone').value= c.phone||'';
  node.querySelector('#c-email').value= c.email||'';
  node.querySelector('#c-address').value= c.address||'';
  node.querySelector('#v-plate').value = v.plate||'';
  node.querySelector('#v-brand').value = v.brand||'';
  node.querySelector('#v-line').value  = v.line||'';
  node.querySelector('#v-engine').value= v.engine||'';
  node.querySelector('#v-year').value  = v.year??'';
  node.querySelector('#v-mile').value  = v.mileage??'';
  
  // Inicializar selector de vehículo
  const vehicleSearch = $('#v-vehicle-search', node);
  const vehicleIdInput = $('#v-vehicle-id', node);
  const vehicleDropdown = $('#v-vehicle-dropdown', node);
  const vehicleSelected = $('#v-vehicle-selected', node);
  const yearInput = $('#v-year', node);
  const yearWarning = $('#v-year-warning', node);
  let selectedVehicle = null;
  let vehicleSearchTimeout = null;
  
  if (v.vehicleId) {
    vehicleIdInput.value = v.vehicleId;
    API.vehicles.get(v.vehicleId).then(vehicle => {
      if (vehicle) {
        selectedVehicle = vehicle;
        vehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
        vehicleSelected.innerHTML = `
          <span style="color:var(--success, #10b981);">✓</span> 
          <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
        `;
        $('#v-brand', node).value = vehicle.make || '';
        $('#v-line', node).value = vehicle.line || '';
        $('#v-engine', node).value = vehicle.displacement || '';
      }
    }).catch(() => {});
  }
  
  async function searchVehicles(query) {
    if (!query || query.trim().length < 1) {
      vehicleDropdown.style.display = 'none';
      return;
    }
    try {
      const r = await API.vehicles.search({ q: query.trim(), limit: 30 });
      const vehicles = Array.isArray(r?.items) ? r.items : [];
      if (vehicles.length === 0) {
        vehicleDropdown.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px;">No se encontraron vehículos</div>';
        vehicleDropdown.style.display = 'block';
        return;
      }
      vehicleDropdown.replaceChildren(...vehicles.map(v => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);';
        div.innerHTML = `
          <div style="font-weight:600;">${v.make} ${v.line}</div>
          <div style="font-size:12px;color:var(--muted);">Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}</div>
        `;
        div.addEventListener('click', () => {
          selectedVehicle = v;
          vehicleIdInput.value = v._id;
          vehicleSearch.value = `${v.make} ${v.line} ${v.displacement}`;
          vehicleSelected.innerHTML = `
            <span style="color:var(--success, #10b981);">✓</span> 
            <strong>${v.make} ${v.line}</strong> - Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}
          `;
          vehicleDropdown.style.display = 'none';
          $('#v-brand', node).value = v.make || '';
          $('#v-line', node).value = v.line || '';
          $('#v-engine', node).value = v.displacement || '';
          // Validar año si ya está ingresado
          if (yearInput.value) {
            validateYear();
          }
        });
        div.addEventListener('mouseenter', () => {
          div.style.background = 'var(--hover, rgba(0,0,0,0.05))';
        });
        div.addEventListener('mouseleave', () => {
          div.style.background = '';
        });
        return div;
      }));
      vehicleDropdown.style.display = 'block';
    } catch (err) {
      console.error('Error al buscar vehículos:', err);
    }
  }
  
  // Validar año contra rango del vehículo
  async function validateYear() {
    if (!selectedVehicle || !yearInput.value) {
      yearWarning.style.display = 'none';
      return;
    }
    const yearNum = Number(yearInput.value);
    if (!Number.isFinite(yearNum)) {
      yearWarning.style.display = 'none';
      return;
    }
    try {
      const validation = await API.vehicles.validateYear(selectedVehicle._id, yearNum);
      if (!validation.valid) {
        yearWarning.textContent = validation.message || 'Año fuera de rango';
        yearWarning.style.display = 'block';
      } else {
        yearWarning.style.display = 'none';
      }
    } catch (err) {
      console.error('Error al validar año:', err);
    }
  }
  
  if (vehicleSearch) {
    vehicleSearch.addEventListener('input', (e) => {
      clearTimeout(vehicleSearchTimeout);
      const query = e.target.value.trim();
      if (query.length >= 1) {
        vehicleSearchTimeout = setTimeout(() => {
          searchVehicles(query);
        }, 150);
      } else {
        if (vehicleDropdown) vehicleDropdown.style.display = 'none';
      }
    });
    vehicleSearch.addEventListener('focus', () => {
      if (vehicleSearch.value.trim().length >= 1) {
        searchVehicles(vehicleSearch.value.trim());
      }
    });
  }
  
  if (yearInput) {
    yearInput.addEventListener('input', () => {
      if (selectedVehicle) {
        validateYear();
      }
    });
  }
  
  // Cerrar dropdown al hacer click fuera
  document.addEventListener('click', (e) => {
    if (vehicleSearch && !vehicleSearch.contains(e.target) && vehicleDropdown && !vehicleDropdown.contains(e.target)) {
      vehicleDropdown.style.display = 'none';
    }
  });
  
  openModal(node);

  const plateInput = $('#v-plate', node);
  const idInput = $('#c-id', node);
  const mileageInput = $('#v-mile', node);
  const watchSelectors = ['#c-name','#c-id','#c-phone','#c-email','#c-address','#v-brand','#v-line','#v-engine','#v-year','#v-mile'];
  watchSelectors.forEach((sel)=>{ const input=$(sel,node); if(input) input.addEventListener('input',()=>{ input.dataset.dirty='1'; }); });

  let lastLookupPlate = '';
  let lastLookupId = '';
  let loadingProfile = false;

  const applyProfile = async (profile, plateCode) => {
    if (!profile) return;
    const cust = profile.customer || {};
    const veh = profile.vehicle || {};
    const assign = (selector, value) => {
      const input = $(selector, node);
      if (!input) return;
      if (input.dataset.dirty === '1' && input.dataset.prefilledPlate === plateCode) return;
      const normalized = value == null ? '' : String(value);
      input.value = normalized;
      input.dataset.prefilledPlate = plateCode;
      if (normalized) delete input.dataset.dirty;
    };

    assign('#c-name', cust.name || '');
    assign('#c-id', cust.idNumber || '');
    assign('#c-phone', cust.phone || '');
    assign('#c-email', cust.email || '');
    assign('#c-address', cust.address || '');
    assign('#v-brand', veh.brand || '');
    assign('#v-line', veh.line || '');
    assign('#v-engine', veh.engine || '');
    assign('#v-year', veh.year != null ? veh.year : '');

    // Si el perfil tiene vehicleId, cargar y seleccionar el vehículo
    if (veh.vehicleId && vehicleIdInput) {
      try {
        const vehicle = await API.vehicles.get(veh.vehicleId);
        if (vehicle) {
          selectedVehicle = vehicle;
          vehicleIdInput.value = vehicle._id;
          if (vehicleSearch) vehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
          if (vehicleSelected) {
            vehicleSelected.innerHTML = `
              <span style="color:var(--success, #10b981);">✓</span> 
              <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
            `;
          }
          // Asegurar que los campos estén sincronizados
          assign('#v-brand', vehicle.make || '');
          assign('#v-line', vehicle.line || '');
          assign('#v-engine', vehicle.displacement || '');
        }
      } catch (err) {
        console.warn('No se pudo cargar vehículo del perfil:', err);
      }
    } else if (veh.brand && veh.line && veh.engine) {
      // Si no tiene vehicleId pero tiene marca/línea/cilindraje, buscar en la BD
      try {
        const searchResult = await API.vehicles.search({ 
          q: `${veh.brand} ${veh.line} ${veh.engine}`, 
          limit: 1 
        });
        if (searchResult?.items?.length > 0) {
          const vehicle = searchResult.items[0];
          selectedVehicle = vehicle;
          vehicleIdInput.value = vehicle._id;
          if (vehicleSearch) vehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
          if (vehicleSelected) {
            vehicleSelected.innerHTML = `
              <span style="color:var(--success, #10b981);">✓</span> 
              <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
            `;
          }
        }
      } catch (err) {
        console.warn('No se pudo buscar vehículo:', err);
      }
    }

    if (plateInput) {
      plateInput.value = plateCode;
      plateInput.dataset.prefilledPlate = plateCode;
    }

    if (mileageInput) {
      if (mileageInput.dataset.dirty !== '1') mileageInput.value = '';
      if (veh.mileage != null && veh.mileage !== '') {
        mileageInput.placeholder = `Ultimo: ${veh.mileage}`;
      } else {
        mileageInput.placeholder = '';
      }
    }
  };

  const loadProfile = async (force=false) => {
    if (!plateInput || loadingProfile) return;
    let raw = plateInput.value.trim().toUpperCase();
    plateInput.value = raw;
    if (!raw) return;
    if (!force && raw === lastLookupPlate) return;
    loadingProfile = true;
    try{
      let profile = null;
      try { profile = await API.sales.profileByPlate(raw, { fuzzy: true }); } catch {}
      if (!profile) { try { profile = await API.sales.profileByPlate(raw); } catch {} }
      if (profile) {
        await applyProfile(profile, raw);
      }
    }catch(err){ console.warn('No se pudo cargar perfil', err?.message||err); }
    finally{
      loadingProfile = false;
      lastLookupPlate = raw;
    }
  };

  const loadProfileById = async (force = false) => {
    if (!idInput || loadingProfile) return;
    const raw = String(idInput.value || '').trim();
    if (!raw) return;
    if (!force && raw === lastLookupId) return;
    loadingProfile = true;
    try {
      const profile = await API.sales.profileById(raw);
      if (profile) {
        // Mantener placa actual si el usuario ya la ingresó manualmente; si viene en el perfil y el campo no está sucio, aplícala
        const plateCode = (plateInput?.value || '').trim().toUpperCase() || (profile.vehicle?.plate || '').toUpperCase();
        await applyProfile(profile, plateCode);
      }
    } catch (err) {
      console.warn('No se pudo cargar perfil por ID', err?.message || err);
    } finally {
      loadingProfile = false;
      lastLookupId = raw;
    }
  };

  if (plateInput) {
    plateInput.addEventListener('input', (ev)=>{
      const upper = ev.target.value.toUpperCase();
      if (ev.target.value !== upper) ev.target.value = upper;
      if(current){
        current.vehicle = current.vehicle||{};
        current.vehicle.plate = upper;
        syncCurrentIntoOpenList();
        renderCapsules();
      }
    });
    plateInput.addEventListener('change', ()=> loadProfile(true));
    plateInput.addEventListener('keydown', (ev)=>{
      if (ev.key === 'Enter') {
        ev.preventDefault();
        loadProfile(true);
      }
    });
  }

  if (idInput) {
    idInput.addEventListener('change', () => loadProfileById(true));
    idInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); loadProfileById(true); }
    });
  }

  if (mileageInput) {
    mileageInput.addEventListener('input', ()=>{ mileageInput.dataset.dirty='1'; });
  }

  if (plateInput && plateInput.value && !c.name && !c.phone && !v.brand && !v.line && !v.engine) {
    loadProfile(true);
  }

  // Live update brand/line/engine in capsule
  ['#v-brand','#v-line','#v-engine'].forEach(sel=>{
    const input=$(sel,node); if(!input) return;
    input.addEventListener('input', ()=>{
      if(!current) return;
      current.vehicle = current.vehicle||{};
      current.vehicle.brand = $('#v-brand',node).value.trim().toUpperCase();
      current.vehicle.line = $('#v-line',node).value.trim().toUpperCase();
      current.vehicle.engine = $('#v-engine',node).value.trim().toUpperCase();
      syncCurrentIntoOpenList();
      renderCapsules();
    });
  });

  node.querySelector('#sales-save-cv').onclick = async ()=>{
    const payload = {
      customer:{
        name: $('#c-name',node).value.trim(),
        idNumber: $('#c-id',node).value.trim(),
        phone: $('#c-phone',node).value.trim(),
        email: $('#c-email',node).value.trim(),
        address: $('#c-address',node).value.trim()
      },
      vehicle:{
        plate: $('#v-plate',node).value.trim(),
        vehicleId: vehicleIdInput?.value || null,
        brand: $('#v-brand',node).value.trim(),
        line:  $('#v-line',node).value.trim(),
        engine:$('#v-engine',node).value.trim(),
        year:  Number($('#v-year',node).value||'')||null,
        mileage:Number($('#v-mile',node).value||'')||null
      }
    };
    try{
      await API.sales.setCustomerVehicle(current._id, payload);
      current = await API.sales.get(current._id);
      syncCurrentIntoOpenList();
      renderCapsules();
      renderMini();
      closeModal();
    }catch(e){ alert(e?.message||'No se pudo guardar'); }
  };
}

// ---------- historial ----------
function openSalesHistory(){
  const node = clone('tpl-sales-history');
  openModal(node);
  const from=$('#sh-from',node), to=$('#sh-to',node), plate=$('#sh-plate',node);
  const body=$('#sh-body',node), total=$('#sh-total',node);
  const prevBtn=$('#sh-prev',node), nextBtn=$('#sh-next',node), pagEl=$('#sh-pag',node);
  let page = 1;
  // Set default date range to today ONLY when no plate filter is used
  try {
    const setToday = !plate.value; // if plate is empty
    if (setToday){
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      const today = `${yyyy}-${mm}-${dd}`;
      from.value = from.value || today;
      to.value = to.value || today;
    }
  } catch {}
  async function load(){
    const params = { status:'closed' };
    const hasPlate = !!plate.value.trim();
    if (hasPlate){
      params.plate = plate.value.trim();
      params.limit = 50;
    } else {
      if(from.value) params.from=from.value;
      if(to.value)   params.to=to.value;
      params.limit = 50;
    }
    params.page = page;
    const res = await API.sales.list(params);
    body.innerHTML=''; let acc=0;
    (res?.items||[]).forEach(s=>{
      const tr=document.createElement('tr');
      const date=new Date(s.createdAt); const d=date.toLocaleDateString();
      const num = padSaleNumber(s.number || s._id || '');
      tr.innerHTML = `<td>${num}</td><td>${s?.vehicle?.plate||''}</td><td>${d}</td><td class="t-right">${money(s.total||0)}</td><td class="t-right"><button class="secondary" data-id="${s._id}">Ver</button></td>`;
      tr.querySelector('button').onclick = ()=> openSaleHistoryDetail(s._id);
      body.appendChild(tr); acc += Number(s.total||0);
    });
    total.textContent = money(acc);
    try{
      const cur = Number(res?.page||page||1);
      const lim = Number(res?.limit||params.limit||50);
      const tot = Number(res?.total||0);
      const pages = Math.max(1, Math.ceil((tot||0)/(lim||50)));
      page = Math.min(Math.max(1, cur), pages);
      if (pagEl) pagEl.textContent = `Página ${page} de ${pages} · ${tot} registros`;
      if (prevBtn) prevBtn.disabled = page <= 1;
      if (nextBtn) nextBtn.disabled = page >= pages;
    } catch{}
  }
  $('#sh-search',node).onclick = ()=>{ page = 1; load(); };
  if (prevBtn) prevBtn.onclick = ()=>{ if(page>1){ page--; load(); } };
  if (nextBtn) nextBtn.onclick = ()=>{ page++; load(); };
  load();
}

async function openSaleHistoryDetail(id){
  if (!id) return;
  try{
    const sale = await API.sales.get(id);
    const node = clone('tpl-sale-history-detail');
    if (!node) return;
    node.querySelector('[data-number]').textContent = padSaleNumber(sale.number || sale._id || '');
    node.querySelector('[data-date]').textContent = sale.createdAt ? new Date(sale.createdAt).toLocaleString() : '';
    node.querySelector('[data-status]').textContent = sale.status || 'N/A';
    node.querySelector('[data-customer]').textContent = describeCustomer(sale.customer);
    node.querySelector('[data-vehicle]').textContent = describeVehicle(sale.vehicle);
    const itemsBody = node.querySelector('[data-items]');
    itemsBody.innerHTML = '';
    (sale.items || []).forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${it.sku || ''}</td><td>${it.name || ''}</td><td class="t-center">${it.qty || 0}</td><td class="t-right">${money(it.unitPrice || 0)}</td><td class="t-right">${money(it.total || 0)}</td>`;
      itemsBody.appendChild(tr);
    });
    // If no items (e.g., legacy import), show notes as a hint of work done
    if ((!sale.items || sale.items.length === 0) && sale.notes) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" class="muted">Notas: ${sale.notes.replace(/\n/g,'<br/>')}</td>`;
      itemsBody.appendChild(tr);
    }
    node.querySelector('[data-subtotal]').textContent = money(sale.subtotal || 0);
    node.querySelector('[data-total]').textContent = money(sale.total || 0);
    // Render pagos (multi-payment)
    try {
      const payBody = node.querySelector('[data-payments]');
      const payTotalEl = node.querySelector('[data-payments-total]');
      if (payBody && payTotalEl) {
        payBody.innerHTML='';
        const list = Array.isArray(sale.paymentMethods) && sale.paymentMethods.length ? sale.paymentMethods : (sale.paymentMethod ? [{ method: sale.paymentMethod, amount: sale.total||0, accountId: null }] : []);
        let acc = 0;
        list.forEach(p => {
          const tr = document.createElement('tr');
            const method = (p.method||'').toString().toUpperCase();
            const accountName = p.account?.name || p.accountName || p.accountId || '';
            const amt = Number(p.amount||0);
            acc += amt;
            tr.innerHTML = `<td>${method}</td><td>${accountName||'—'}</td><td class="t-right">${money(amt)}</td>`;
            payBody.appendChild(tr);
        });
        payTotalEl.textContent = money(acc);
        if(!list.length){
          const tr=document.createElement('tr'); tr.innerHTML='<td colspan="3" class="t-center muted">Sin información de pagos</td>'; payBody.appendChild(tr);
        }
      }
    } catch(e) { console.warn('render pagos historial', e); }
    const printBtn = node.querySelector('[data-print]');
    if (printBtn) printBtn.onclick = () => printSaleTicket(sale);
    openModal(node);
  }catch(e){ alert(e?.message || 'No se pudo cargar la venta'); }
}
// ---------- live (SSE) ----------
function connectLive(){
  if (es || !API?.live?.connect) return;
  try{
    es = API.live.connect((event, data)=>{
      if (event === 'sale:started'){
        refreshOpenSales({ focusId: current?._id || null });
        return;
      }
      if (!data?.id) return;
      if (event === 'sale:updated'){
        if (current && current._id === data.id){
          API.sales.get(current._id)
            .then(async (s)=>{ current = s; syncCurrentIntoOpenList(); renderTabs(); renderSale(); renderWO(); await renderQuoteForCurrentSale(); })
            .catch((err)=> { console.warn('No se pudo refrescar venta en vivo', err); refreshOpenSales({ focusId: current?._id || null }); });
        } else {
          refreshOpenSales({ focusId: current?._id || null });
        }
        return;
      }
      if (event === 'sale:closed' || event === 'sale:cancelled'){
        setSaleQuoteLink(data.id, null);
        if (current && current._id === data.id) current = null;
        refreshOpenSales({ focusId: current?._id || null });
      }
    });
  }catch(e){ console.warn('SSE no disponible:', e?.message||e); }
}

export function initSales(){
  const ventas = document.getElementById('tab-ventas'); if (!ventas) return;

  (async ()=>{
    await loadFeatureOptionsAndRestrictions();
    const fo = getFeatureOptions();
    const v = (fo.ventas||{});
    const canImport = v.importarCotizacion !== false;
    gateElement(canImport, '#sv-loadQuote');
    gateElement(canImport, '#sv-applyQuoteCV');
    gateElement(canImport, '#sv-q-to-sale');
    const canWO = v.ordenesTrabajo !== false;
    gateElement(canWO, '#sv-wo-card');
    gateElement(canWO, '#sv-print-wo');
  })();

  // NO eliminar sales:lastQuoteId aquí, se necesita para cargar la cotización cuando se renderiza la venta
  
  // Detectar si viene del calendario y cargar cotización si existe
  const urlParams = new URLSearchParams(window.location.search);
  const fromCalendar = urlParams.get('fromCalendar');
  const saleId = urlParams.get('saleId');
  
  if (fromCalendar && saleId) {
    // Limpiar parámetros de URL después de leerlos
    const newUrl = window.location.pathname;
    window.history.replaceState({}, '', newUrl);
    
    // Cargar venta y cotización después de un breve delay
    setTimeout(async () => {
      try {
        const sale = await API.sales.get(saleId);
        if (sale) {
          current = sale;
          syncCurrentIntoOpenList();
          renderTabs();
          renderSale();
          renderMini();
          renderWO();
          
          // Cargar cotización - renderQuoteForCurrentSale ahora verifica localStorage automáticamente
          await renderQuoteForCurrentSale();
        }
      } catch (err) {
        console.error('Error loading sale from calendar:', err);
      }
    }, 500);
  }
  
  // Listener para cuando se crea una venta desde el calendario en la misma página
  window.addEventListener('calendar:saleCreated', async (event) => {
    const { saleId: eventSaleId, quoteId } = event.detail || {};
    if (eventSaleId) {
      // Si hay una venta actual y coincide, o si necesitamos cargar la venta
      if (current?._id === eventSaleId) {
        // La venta ya está cargada, solo cargar la cotización
        if (quoteId) {
          localStorage.setItem('sales:lastQuoteId', quoteId);
          await renderQuoteForCurrentSale();
        }
      } else {
        // La venta aún no está cargada, guardar el quoteId y esperar a que se cargue
        if (quoteId) {
          localStorage.setItem('sales:lastQuoteId', quoteId);
        }
        // Intentar cargar la venta
        try {
          const sale = await API.sales.get(eventSaleId);
          if (sale) {
            current = sale;
            syncCurrentIntoOpenList();
            renderTabs();
            renderSale();
            renderMini();
            renderWO();
            await renderQuoteForCurrentSale();
          }
        } catch (err) {
          console.error('Error loading sale from calendar event:', err);
        }
      }
    }
  });

  // Inicializar navegación interna
  initInternalNavigation();
  
  refreshOpenSales();
  startSalesAutoRefresh();

  document.getElementById('sales-start')?.addEventListener('click', async (ev)=>{
    if (starting) return; starting=true;
    const btn = ev.currentTarget; if (btn) btn.disabled=true;
    try{
      const s = await API.sales.start();
      current = s;
      syncCurrentIntoOpenList();
        renderTabs(); renderSale(); renderWO(); await renderQuoteForCurrentSale();
      await refreshOpenSales({ focusId: s._id, preferCurrent: s });
    }catch(e){ alert(e?.message||'No se pudo crear la venta'); }
    finally{ starting=false; if(btn) btn.disabled=false; }
  });

  async function openQRForNewSale(){
    if (starting) {
      return;
    }
    
    async function openQRForNewSaleWithOCR(){
    const tpl = document.getElementById('tpl-qr-scanner');
    if (!tpl) {
      console.error('Template de QR no encontrado');
      alert('Template de QR no encontrado');
      return;
    }
    
    const nodeOCR = tpl.content.firstElementChild.cloneNode(true);
    
    const modalOCR = document.getElementById('modal');
    const slotOCR = document.getElementById('modalBody');
    const xOCR = document.getElementById('modalClose');
    
    if (!modalOCR || !slotOCR || !xOCR) {
      console.error('Modal no encontrado');
      return;
    }
    
    slotOCR.replaceChildren(nodeOCR);
    
    const closeBtnContainer = document.createElement('div');
    closeBtnContainer.className = 'flex justify-between items-center mb-4';
    const title = nodeOCR.querySelector('h3');
    if (title) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all duration-200 text-sm';
      closeBtn.textContent = '✕ Cerrar';
      closeBtn.onclick = () => {
        const modal = document.getElementById('modal');
        if (modal) modal.classList.add('hidden');
        document.removeEventListener('keydown', escHandler);
        modalOCR.removeEventListener('click', backdropHandler);
      };
      title.parentNode.insertBefore(closeBtnContainer, title);
      closeBtnContainer.appendChild(title);
      closeBtnContainer.appendChild(closeBtn);
    }
    
    const closeModalHandler = () => {
      modalOCR.classList.add('hidden');
      document.removeEventListener('keydown', escHandler);
      modalOCR.removeEventListener('click', backdropHandler);
    };
    
    // Listener para ESC
    const escHandler = (e) => {
      if (e.key === 'Escape' && !modalOCR.classList.contains('hidden')) {
        closeModalHandler();
      }
    };
    
    // Listener para clic fuera del modal (en el backdrop)
    const backdropHandler = (e) => {
      if (e.target === modalOCR) {
        closeModalHandler();
      }
    };
    
    // Agregar listeners
    document.addEventListener('keydown', escHandler);
    modalOCR.addEventListener('click', backdropHandler);
    
    // Configurar botón X del modal
    xOCR.onclick = closeModalHandler;
    
    const video = nodeOCR.querySelector('#qr-video');
    const canvas = nodeOCR.querySelector('#qr-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sel = nodeOCR.querySelector('#qr-cam');
    const msg = nodeOCR.querySelector('#qr-msg');
    const manualInput = nodeOCR.querySelector('#qr-manual');
    const manualBtn = nodeOCR.querySelector('#qr-add-manual');
    const captureBtn = nodeOCR.querySelector('#qr-capture-plate');
    const confirmPanel = nodeOCR.querySelector('#qr-plate-confirm');
    const detectedPlateEl = nodeOCR.querySelector('#qr-detected-plate');
    const plateConfidenceEl = nodeOCR.querySelector('#qr-plate-confidence');
    const confirmPlateBtn = nodeOCR.querySelector('#qr-confirm-plate');
    const cancelPlateBtn = nodeOCR.querySelector('#qr-cancel-plate');
    
    // Ocultar controles de modo múltiple
    const singleModeBtn = nodeOCR.querySelector('#qr-single-mode');
    const multiModeBtn = nodeOCR.querySelector('#qr-multi-mode');
    const finishMultiBtn = nodeOCR.querySelector('#qr-finish-multi');
    if (singleModeBtn) singleModeBtn.style.display = 'none';
    if (multiModeBtn) multiModeBtn.style.display = 'none';
    if (finishMultiBtn) finishMultiBtn.style.display = 'none';
    
    // Variable para almacenar la placa detectada pendiente de confirmación
    let pendingPlateDetection = null;
    
    if (msg) {
      msg.textContent = 'Escanea la placa del vehículo (formato: ABC123 o ABC-123)';
      msg.style.color = 'var(--text)';
    }
    
    let stream = null, running = false, detector = null, lastCode = '', lastTs = 0;
    let cameraDisabled = false;
    let lastValidPlate = null;
    let plateConfidenceCount = 0;
    let plateDetectionHistory = [];
    let manualCaptureMode = false; // Modo de captura manual activo
    
    function stop(){ 
      try{ 
        if (video) {
          video.pause(); 
          video.srcObject = null;
        }
      }catch{}; 
      try{ 
        (stream?.getTracks()||[]).forEach(t=>t.stop()); 
      }catch{}; 
      running=false; 
      stream = null;
      
      // Terminar worker de OCR si existe
      if (ocrWorker) {
        try {
          ocrWorker.terminate().catch(() => {}); // Ignorar errores de terminación
          ocrWorker = null;
          console.log('OCR worker terminado');
        } catch (err) {
          console.warn('Error al terminar OCR worker:', err);
          ocrWorker = null; // Forzar a null incluso si hay error
        }
      }
      
        // Limpiar historial de detecciones
      plateDetectionHistory = [];
      lastValidPlate = null;
      plateConfidenceCount = 0;
      lastProcessedPlate = null;
      lastProcessedPlateTime = 0;
      apiRequestInProgress = false;
      pendingPlateDetection = null;
      
      // Ocultar botón de captura y panel de confirmación
      if (captureBtn) captureBtn.style.display = 'none';
      if (confirmPanel) confirmPanel.style.display = 'none';
      manualCaptureMode = false;
      
      // Restaurar botón de iniciar
      const startBtn = nodeOCR.querySelector('#qr-start');
      if (startBtn) {
        startBtn.textContent = '📷 Iniciar cámara';
        startBtn.onclick = () => {
          start().catch(err => {
            console.error('Error al iniciar cámara:', err);
            if (msg) {
              msg.textContent = '❌ Error: ' + (err?.message || 'No se pudo iniciar la cámara');
              msg.style.color = 'var(--danger, #ef4444)';
            }
          });
        };
      }
    }
    
    // Configurar onclick después de definir stop
    xOCR.onclick = () => {
      stop();
      modalOCR.classList.add('hidden');
    };
    
    // Mostrar modal
    modalOCR.classList.remove('hidden');

    // Función para validar formato de placa: 3 letras - 3 números
    function isValidPlate(text) {
      const normalized = String(text || '').trim().toUpperCase();
      // Patrón: 3 letras, guion opcional, 3 números
      const platePattern = /^[A-Z]{3}[-]?[0-9]{3}$/;
      return platePattern.test(normalized);
    }

    // Función para normalizar placa (asegurar formato ABC-123)
    function normalizePlate(text) {
      const normalized = String(text || '').trim().toUpperCase().replace(/\s+/g, '');
      // Si tiene formato ABC123, convertirlo a ABC-123
      const match = normalized.match(/^([A-Z]{3})([0-9]{3})$/);
      if (match) {
        return `${match[1]}-${match[2]}`;
      }
      return normalized;
    }

    async function fillCams(){
      if (!sel) return Promise.resolve();
      try{
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Cámara trasera (automática)';
          sel.replaceChildren(defaultOpt);
          sel.value = '';
          return Promise.resolve();
        }
        try {
          // Intentar enumerar sin permisos primero (puede que ya los tengamos)
          const devs = await navigator.mediaDevices.enumerateDevices();
          const cams = devs.filter(d=>d.kind==='videoinput');
          
          // Agregar opción "Predeterminada" al inicio
          const options = [document.createElement('option')];
          options[0].value = '';
          options[0].textContent = 'Cámara predeterminada';
          
          if (cams.length > 0) {
            // Si hay cámaras con labels, agregarlas
            const camsWithLabels = cams.filter(c => c.label);
            if (camsWithLabels.length > 0) {
              options.push(...camsWithLabels.map((c,i)=>{
                const o=document.createElement('option'); 
                o.value=c.deviceId; 
                o.textContent=c.label; 
                return o;
              }));
            } else {
              // Si no hay labels, agregar opciones genéricas
              options.push(...cams.map((c,i)=>{
                const o=document.createElement('option'); 
                o.value=c.deviceId; 
                o.textContent = 'Cámara ' + (i+1); 
                return o;
              }));
            }
          }
          
          sel.replaceChildren(...options);
          sel.value = ''; // Por defecto, usar cámara predeterminada
          return Promise.resolve();
        } catch (enumErr) {
          console.warn('Error al enumerar dispositivos:', enumErr);
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Cámara predeterminada';
          sel.replaceChildren(defaultOpt);
          sel.value = '';
          return Promise.resolve();
        }
      }catch(err){
        console.error('Error al cargar cámaras:', err);
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Cámara predeterminada';
        sel.replaceChildren(defaultOpt);
        sel.value = '';
        return Promise.resolve();
      }
    }

    async function start(){
      try{
        stop();
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        let videoConstraints;
        if (sel.value && sel.value.trim() !== '') {
          videoConstraints = { deviceId: { exact: sel.value } };
        } else if (isMobile) {
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
        video.muted = true;
        video.srcObject = stream; 
        
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = () => {
            video.play().then(resolve).catch(reject);
          };
          video.onerror = reject;
          setTimeout(() => {
            if (video.readyState >= 2) {
              video.play().then(resolve).catch(reject);
            } else {
              reject(new Error('Timeout esperando video'));
            }
          }, 5000);
        });
        
        running = true;
        
        // Mostrar botón de captura manual cuando la cámara esté activa
        if (captureBtn) {
          captureBtn.style.display = 'block';
        }
        
        // Ocultar panel de confirmación si estaba visible
        if (confirmPanel) {
          confirmPanel.style.display = 'none';
        }
        pendingPlateDetection = null;
        manualCaptureMode = false;
        
        // Después de obtener permisos, actualizar lista de cámaras con labels completos
        if (!isMobile) {
          try {
            const devs = await navigator.mediaDevices.enumerateDevices();
            const cams = devs.filter(d=>d.kind==='videoinput');
            if (cams.length > 0) {
              // Agregar opción "Predeterminada" al inicio
              const options = [document.createElement('option')];
              options[0].value = '';
              options[0].textContent = 'Cámara predeterminada';
              
              // Agregar todas las cámaras con labels completos
              options.push(...cams.map((c,i)=>{
                const o=document.createElement('option'); 
                o.value=c.deviceId; 
                o.textContent=c.label || ('Cámara '+(i+1)); 
                return o;
              }));
              
              // Mantener la selección actual si existe
              const currentValue = sel.value;
              sel.replaceChildren(...options);
              
              // Restaurar selección si existe, sino usar predeterminada
              if (currentValue && Array.from(sel.options).some(opt => opt.value === currentValue)) {
                sel.value = currentValue;
              } else {
                sel.value = '';
              }
            }
          } catch (enumErr) {
            console.warn('No se pudieron actualizar las cámaras:', enumErr);
          }
        }
        
        // Inicializar OCR
        await initOCR();
        
        if (window.BarcodeDetector) { 
          detector = new BarcodeDetector({ formats: ['qr_code'] }); 
          tickNative(); 
        } else { 
          tickCanvas(); 
        }
        
        // Actualizar mensaje y botón
        if (msg) {
          msg.textContent = 'Apunta la cámara a la placa y presiona "Capturar Placa" cuando esté bien enmarcada';
          msg.style.color = 'var(--text)';
        }
        
        // Cambiar texto del botón a "Detener cámara"
        const startBtn = nodeOCR.querySelector('#qr-start');
        if (startBtn) {
          startBtn.textContent = '⏹️ Detener cámara';
          startBtn.onclick = () => {
            stop();
            if (startBtn) {
              startBtn.textContent = '📷 Iniciar cámara';
              startBtn.onclick = () => {
                start().catch(err => {
                  console.error('Error al iniciar cámara:', err);
                  if (msg) {
                    msg.textContent = '❌ Error: ' + (err?.message || 'No se pudo iniciar la cámara');
                    msg.style.color = 'var(--danger, #ef4444)';
                  }
                });
              };
            }
            if (msg) {
              msg.textContent = 'Cámara detenida. Haz clic en "Iniciar cámara" para continuar';
              msg.style.color = 'var(--text)';
            }
          };
        }
        
        // Event listener para botón de captura manual
        if (captureBtn) {
          captureBtn.onclick = async () => {
            if (!running || !video || video.readyState < 2) {
              if (msg) {
                msg.textContent = '❌ La cámara no está lista. Espera un momento.';
                msg.style.color = 'var(--danger, #ef4444)';
              }
              return;
            }
            
            try {
              // Activar modo captura manual para deshabilitar detección automática
              manualCaptureMode = true;
              
              // Deshabilitar botón temporalmente
              captureBtn.disabled = true;
              captureBtn.textContent = '⏳ Procesando...';
              
              if (msg) {
                msg.textContent = '📸 Capturando imagen de alta calidad...';
                msg.style.color = 'var(--accent, #2563eb)';
              }
              
              // Capturar frame completo de alta calidad
              const w = video.videoWidth || 0;
              const h = video.videoHeight || 0;
              if (!w || !h) {
                throw new Error('Dimensiones de video inválidas');
              }
              
              // Crear canvas de alta calidad para captura
              const captureCanvas = document.createElement('canvas');
              captureCanvas.width = w;
              captureCanvas.height = h;
              const captureCtx = captureCanvas.getContext('2d', { willReadFrequently: false });
              
              // Dibujar frame completo
              captureCtx.drawImage(video, 0, 0, w, h);
              
              // Procesar región central (donde suele estar la placa)
              const region = {
                x: Math.floor(w * 0.15),  // Más amplio para capturar mejor
                y: Math.floor(h * 0.25),
                w: Math.floor(w * 0.7),
                h: Math.floor(h * 0.5)
              };
              
              const regionCanvas = document.createElement('canvas');
              regionCanvas.width = region.w;
              regionCanvas.height = region.h;
              const regionCtx = regionCanvas.getContext('2d');
              regionCtx.drawImage(captureCanvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
              
              // Intentar reconocer con API usando alta calidad
              if (USE_PLATE_RECOGNIZER && PLATE_RECOGNIZER_API_KEY) {
                const result = await recognizePlateWithAPI(regionCanvas, true); // highQuality = true
                
                if (result && result.plate && isValidPlate(result.plate)) {
                  // Mostrar panel de confirmación
                  pendingPlateDetection = result;
                  
                  if (detectedPlateEl) {
                    const displayPlate = result.plate.length === 6 
                      ? `${result.plate.substring(0,3)}-${result.plate.substring(3)}` 
                      : result.plate;
                    detectedPlateEl.textContent = displayPlate;
                  }
                  
                  if (plateConfidenceEl) {
                    const confidenceColor = result.confidence > 85 ? 'var(--accent)' : result.confidence > 70 ? '#f59e0b' : '#ef4444';
                    plateConfidenceEl.innerHTML = `Confianza: <span style="color:${confidenceColor};font-weight:600;">${result.confidence.toFixed(1)}%</span>`;
                  }
                  
                  if (confirmPanel) {
                    confirmPanel.style.display = 'block';
                  }
                  
                  // Ocultar botón de captura temporalmente
                  if (captureBtn) captureBtn.style.display = 'none';
                  
                  if (msg) {
                    msg.textContent = 'Revisa la placa detectada y confirma si es correcta';
                    msg.style.color = 'var(--accent, #2563eb)';
                  }
                } else {
                  // No se detectó placa válida
                  if (msg) {
                    msg.textContent = '❌ No se detectó una placa válida. Asegúrate de que la placa esté bien visible y enmarcada.';
                    msg.style.color = 'var(--danger, #ef4444)';
                  }
                  
                  // Mostrar mensaje temporal
                  setTimeout(() => {
                    if (msg) {
                      msg.textContent = 'Apunta la cámara a la placa y presiona "Capturar Placa" cuando esté bien enmarcada';
                      msg.style.color = 'var(--text)';
                    }
                  }, 3000);
                }
              } else {
                // Fallback a OCR si no hay API
                if (msg) {
                  msg.textContent = '⚠️ Plate Recognizer API no configurada. Usando OCR...';
                  msg.style.color = 'var(--warning, #f59e0b)';
                }
                
                // Intentar con OCR
                if (!ocrWorker) {
                  await initOCR();
                }
                
                if (ocrWorker) {
                  const imageData = regionCtx.getImageData(0, 0, region.w, region.h);
                  const enhancedCanvas = enhanceImageForOCR(regionCanvas, regionCtx, imageData);
                  
                  try {
                    const ocrResult = await ocrWorker.recognize(enhancedCanvas);
                    const text = ocrResult.data.text;
                    const plate = extractPlateFromText(text);
                    
                    if (plate && isValidPlate(plate)) {
                      const words = ocrResult.data.words || [];
                      const confidences = words.map(w => w.confidence || 0).filter(c => c > 0);
                      const avgConfidence = confidences.length > 0 
                        ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
                        : 0;
                      
                      pendingPlateDetection = { plate, confidence: avgConfidence };
                      
                      if (detectedPlateEl) {
                        const displayPlate = plate.length === 6 
                          ? `${plate.substring(0,3)}-${plate.substring(3)}` 
                          : plate;
                        detectedPlateEl.textContent = displayPlate;
                      }
                      
                      if (plateConfidenceEl) {
                        const confidenceColor = avgConfidence > 70 ? 'var(--accent)' : avgConfidence > 55 ? '#f59e0b' : '#ef4444';
                        plateConfidenceEl.innerHTML = `Confianza OCR: <span style="color:${confidenceColor};font-weight:600;">${avgConfidence.toFixed(1)}%</span>`;
                      }
                      
                      if (confirmPanel) {
                        confirmPanel.style.display = 'block';
                      }
                      
                      if (captureBtn) captureBtn.style.display = 'none';
                      
                      if (msg) {
                        msg.textContent = 'Revisa la placa detectada y confirma si es correcta';
                        msg.style.color = 'var(--accent, #2563eb)';
                      }
                    } else {
                      if (msg) {
                        msg.textContent = '❌ No se detectó una placa válida. Intenta de nuevo.';
                        msg.style.color = 'var(--danger, #ef4444)';
                      }
                      setTimeout(() => {
                        if (msg) {
                          msg.textContent = 'Apunta la cámara a la placa y presiona "Capturar Placa" cuando esté bien enmarcada';
                          msg.style.color = 'var(--text)';
                        }
                      }, 3000);
                    }
                  } catch (ocrErr) {
                    console.error('Error en OCR:', ocrErr);
                    if (msg) {
                      msg.textContent = '❌ Error al procesar imagen. Intenta de nuevo.';
                      msg.style.color = 'var(--danger, #ef4444)';
                    }
                  }
                } else {
                  if (msg) {
                    msg.textContent = '❌ OCR no disponible. Configura Plate Recognizer API para mejor precisión.';
                    msg.style.color = 'var(--danger, #ef4444)';
                  }
                }
              }
              
              // Restaurar botón solo si no hay placa pendiente de confirmación
              if (!pendingPlateDetection) {
                captureBtn.disabled = false;
                captureBtn.textContent = '📸 Capturar Placa';
                manualCaptureMode = false;
              }
              
            } catch (err) {
              console.error('Error al capturar placa:', err);
              if (msg) {
                msg.textContent = '❌ Error: ' + (err?.message || 'No se pudo capturar la imagen');
                msg.style.color = 'var(--danger, #ef4444)';
              }
              if (captureBtn) {
                captureBtn.disabled = false;
                captureBtn.textContent = '📸 Capturar Placa';
              }
              manualCaptureMode = false;
            }
          };
        }
        
        // Event listeners para confirmar/cancelar placa
        if (confirmPlateBtn) {
          confirmPlateBtn.onclick = () => {
            if (pendingPlateDetection && pendingPlateDetection.plate) {
              // Procesar la placa confirmada
              handlePlate(pendingPlateDetection.plate);
              // Ocultar panel y limpiar
              if (confirmPanel) confirmPanel.style.display = 'none';
              pendingPlateDetection = null;
            }
          };
        }
        
        if (cancelPlateBtn) {
          cancelPlateBtn.onclick = () => {
            // Cancelar y volver a mostrar botón de captura
            if (confirmPanel) confirmPanel.style.display = 'none';
            if (captureBtn) {
              captureBtn.style.display = 'block';
              captureBtn.disabled = false;
            }
            pendingPlateDetection = null;
            manualCaptureMode = false;
            if (msg) {
              msg.textContent = 'Apunta la cámara a la placa y presiona "Capturar Placa" cuando esté bien enmarcada';
              msg.style.color = 'var(--text)';
            }
          };
        }
      }catch(e){ 
        console.error('Error al iniciar cámara:', e);
        let errorMsg = '';
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          errorMsg = '❌ Permisos de cámara denegados. Por favor, permite el acceso a la cámara.';
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          errorMsg = '❌ No se encontró ninguna cámara.';
        } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
          errorMsg = '❌ La cámara está siendo usada por otra aplicación.';
        } else {
          errorMsg = '❌ No se pudo abrir cámara: ' + (e?.message||e?.name||'Error desconocido');
        }
        msg.textContent = errorMsg;
        msg.style.color = 'var(--danger, #ef4444)';
        running = false;
      }
    }

    // Función para validar formato de placa: 3 letras - 3 números (con o sin guion)
    function isValidPlate(text) {
      const normalized = String(text || '').trim().toUpperCase().replace(/[-]/g, '');
      // Patrón: 3 letras seguidas de 3 números (sin guion para validación)
      const platePattern = /^[A-Z]{3}[0-9]{3}$/;
      return platePattern.test(normalized);
    }

    // Función para normalizar placa (asegurar formato ABC123 sin guion)
    function normalizePlate(text) {
      const normalized = String(text || '').trim().toUpperCase().replace(/[\s-]/g, '');
      // Asegurar formato ABC123 (sin guion)
      const match = normalized.match(/^([A-Z]{3})([0-9]{3})$/);
      if (match) {
        return `${match[1]}${match[2]}`;
      }
      return normalized;
    }

    function accept(value){
      if (cameraDisabled) return false;
      
      // Solo aceptar si es una placa válida
      if (!isValidPlate(value)) {
        return false;
      }
      
      const normalized = normalizePlate(value);
      const t = Date.now();
      const delay = 1500;
      
      if (lastCode === normalized && t - lastTs < delay) {
        return false;
      }
      
      lastCode = normalized;
      lastTs = t;
      return true;
    }

    async function handlePlate(plateText){
      // Normalizar placa (sin guion: ABC123)
      const normalized = normalizePlate(plateText);
      if (!isValidPlate(normalized)) {
        if (msg) {
          msg.textContent = '❌ Formato de placa inválido. Debe ser: ABC123 o ABC-123';
          msg.style.color = 'var(--danger, #ef4444)';
        }
        setTimeout(() => {
          if (msg) {
            msg.textContent = 'Escanea la placa del vehículo (formato: ABC123 o ABC-123)';
            msg.style.color = 'var(--text)';
          }
          cameraDisabled = false;
        }, 2000);
        return;
      }
      
      // Evitar crear múltiples ventas para la misma placa
      // (pero permitir múltiples detecciones para verificación)
      const now = Date.now();
      if (lastProcessedPlate === normalized && (now - lastProcessedPlateTime) < PLATE_COOLDOWN) {
        console.log(`⚠️ Placa ${normalized} ya tiene una venta creada recientemente (cooldown activo), no se creará otra venta`);
        if (msg) {
          msg.textContent = `Placa ${normalized} ya tiene una venta activa`;
          msg.style.color = 'var(--warning, #f59e0b)';
          setTimeout(() => {
            if (msg) {
              msg.textContent = 'Escanea la placa del vehículo (formato: ABC123 o ABC-123)';
              msg.style.color = 'var(--text)';
            }
            cameraDisabled = false;
          }, 2000);
        }
        return;
      }
      
      console.log('Placa normalizada (sin guion):', normalized);
      
      // Marcar placa como procesada inmediatamente para evitar duplicados
      lastProcessedPlate = normalized;
      lastProcessedPlateTime = now;
      cameraDisabled = true;
      // Mostrar placa detectada en el mensaje
      const displayPlate = normalized.length === 6 ? `${normalized.substring(0,3)}-${normalized.substring(3)}` : normalized;
      if (msg) {
        msg.textContent = `Placa detectada: ${displayPlate}`;
        msg.style.color = 'var(--accent, #2563eb)';
      }
      
      msg.textContent = 'Procesando placa...';
      msg.style.color = 'var(--text)';

      try {
        // Iniciar nueva venta
        starting = true;
        const s = await API.sales.start();
        current = s;
        syncCurrentIntoOpenList();
        
        // Buscar perfil por placa
        let profile = null;
        try {
          profile = await API.sales.profileByPlate(normalized, { fuzzy: true });
        } catch {}
        if (!profile) {
          try {
            profile = await API.sales.profileByPlate(normalized);
          } catch {}
        }

        // Aplicar perfil si existe
        if (profile) {
          // Actualizar venta con datos del cliente y vehículo
          const customerData = {
            name: profile.customer?.name || '',
            idNumber: profile.customer?.idNumber || '',
            phone: profile.customer?.phone || '',
            email: profile.customer?.email || '',
            address: profile.customer?.address || ''
          };
          
          const vehicleData = {
            plate: normalized,
            brand: profile.vehicle?.brand || '',
            line: profile.vehicle?.line || '',
            engine: profile.vehicle?.engine || '',
            year: profile.vehicle?.year || null,
            mileage: profile.vehicle?.mileage || null,
            vehicleId: profile.vehicle?.vehicleId || null
          };

          await API.sales.setCustomerVehicle(s._id, {
            customer: customerData,
            vehicle: vehicleData
          });

          // Recargar venta actualizada
          current = await API.sales.get(s._id);
        } else {
          // Si no hay perfil, al menos establecer la placa
          await API.sales.setCustomerVehicle(s._id, {
            vehicle: { plate: normalized }
          });
          current = await API.sales.get(s._id);
        }

        // Reproducir sonido de confirmación
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.frequency.value = 800;
          oscillator.type = 'sine';
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.1);
        } catch (err) {
          console.warn('No se pudo reproducir sonido:', err);
        }

        // Cerrar modal y renderizar venta
        stop();
        if (modalOCR) modalOCR.classList.add('hidden');
        
        renderTabs();
        renderSale();
        renderWO();
        await renderQuoteForCurrentSale();
        await refreshOpenSales({ focusId: s._id, preferCurrent: current });

        // Si hay vehículo conectado, abrir automáticamente el modal de agregar items
        if (profile?.vehicle?.vehicleId) {
          setTimeout(() => {
            const addBtn = document.getElementById('sales-add-unified');
            if (addBtn) {
              addBtn.click();
            }
          }, 500);
        }

        starting = false;
      } catch(e) {
        console.error('Error al procesar placa:', e);
        msg.textContent = '❌ Error: ' + (e?.message || 'No se pudo crear la venta');
        msg.style.color = 'var(--danger, #ef4444)';
        starting = false;
        setTimeout(() => {
          cameraDisabled = false;
          msg.textContent = 'Escanea la placa del vehículo (formato: ABC123 o ABC-123)';
          msg.style.color = 'var(--text)';
        }, 3000);
      }
    }

    function onCode(code){
      if (!isValidPlate(code)) {
        // Ignorar códigos que no sean placas
        return;
      }
      handlePlate(code);
    }

    let ocrWorker = null;
    let lastOcrTime = 0;
    let lastApiTime = 0;
    let apiRequestInProgress = false; // Flag para evitar requests simultáneas
    let lastProcessedPlate = null; // Última placa procesada para evitar duplicados
    let lastProcessedPlateTime = 0; // Timestamp de última placa procesada
    const ocrInterval = 1000; // Procesar OCR cada 1 segundo
    const apiInterval = 2000; // Plate Recognizer API cada 2 segundos (evitar rate limits)
    const PLATE_COOLDOWN = 5000; // Cooldown de 5 segundos después de procesar una placa
    // plateDetectionHistory ya está declarada en openQRForNewSale
    
    // Usar Plate Recognizer API (más confiable que OCR genérico)
    // Plan gratuito: 2000 requests/mes
    // Obtén tu API key en: https://platerecognizer.com/
    const PLATE_RECOGNIZER_API_KEY = (typeof window !== 'undefined' && window.PLATE_RECOGNIZER_API_KEY) || '';
    const USE_PLATE_RECOGNIZER = (typeof window !== 'undefined' && window.USE_PLATE_RECOGNIZER) || false;
    
    async function recognizePlateWithAPI(canvas, highQuality = false) {
      if (!USE_PLATE_RECOGNIZER || !PLATE_RECOGNIZER_API_KEY || PLATE_RECOGNIZER_API_KEY === 'YOUR_API_KEY_HERE') {
        return null;
      }
      
      // Evitar requests simultáneas
      if (apiRequestInProgress) {
        return null;
      }
      
      apiRequestInProgress = true;
      
      try {
        // Usar calidad alta (0.95) para captura manual, calidad media (0.7) para detección automática
        const quality = highQuality ? 0.95 : 0.7;
        const blob = await new Promise(resolve => {
          canvas.toBlob(resolve, 'image/jpeg', quality);
        });
        
        const formData = new FormData();
        formData.append('upload', blob, 'plate.jpg');
        formData.append('regions', 'co'); // Colombia
        
        const response = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${PLATE_RECOGNIZER_API_KEY}`
          },
          body: formData
        });
        
        if (!response.ok) {
          if (response.status === 429) {
            console.warn('Plate Recognizer API: Rate limit alcanzado - aumentando intervalo');
            // Aumentar intervalo temporalmente si hay rate limit
            lastApiTime = now + 5000; // Esperar 5 segundos más
          }
          return null;
        }
        
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          const plate = data.results[0].plate?.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const confidence = data.results[0].score || 0;
          
          // Para captura manual, aceptar con confianza más baja (0.5) ya que el usuario confirmará
          // Para detección automática, mantener 0.6
          const minConfidence = highQuality ? 0.5 : 0.6;
          if (plate && plate.length >= 5 && confidence > minConfidence) {
            // Validar formato de placa colombiana
            const normalized = plate.replace(/[^A-Z0-9]/g, '');
            if (/^[A-Z]{3}[0-9]{3}$/.test(normalized)) {
              console.log(`✅ Placa detectada por API: ${normalized} (confianza: ${(confidence * 100).toFixed(1)}%, calidad: ${highQuality ? 'alta' : 'media'})`);
              return { plate: normalized, confidence: confidence * 100 };
            }
          }
        }
      } catch (err) {
        console.warn('Error en Plate Recognizer API:', err);
      } finally {
        apiRequestInProgress = false;
      }
      return null;
    }
    
    // Inicializar worker de OCR optimizado para velocidad
    async function initOCR() {
      if (typeof Tesseract === 'undefined') {
        console.warn('Tesseract.js no está disponible');
        return null;
      }
      try {
        if (!ocrWorker) {
          console.log('Inicializando OCR worker optimizado...');
          // Usar solo inglés para mejor velocidad (las placas son alfanuméricas)
          // Los parámetros que solo se pueden establecer durante la inicialización
          // deben pasarse en createWorker, no después
          ocrWorker = await Tesseract.createWorker('eng', 1, {
            logger: () => {}, // Silenciar todos los logs para mejor rendimiento
            // Parámetros que solo se pueden establecer durante la inicialización
            load_system_dawg: '0',
            load_freq_dawg: '0',
            load_unambig_dawg: '0',
            load_punc_dawg: '0',
            load_number_dawg: '0',
          });
          // Solo establecer parámetros que se pueden cambiar después de la inicialización
          await ocrWorker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            tessedit_pageseg_mode: '8', // Single word (más rápido para placas)
            classify_bln_numeric_mode: '0',
          });
          console.log('OCR worker inicializado (optimizado para velocidad)');
        }
        return ocrWorker;
      } catch (err) {
        console.error('Error al inicializar OCR:', err);
        ocrWorker = null; // Resetear en caso de error
        return null;
      }
    }
    
    // Función optimizada para mejorar imagen antes del OCR (más rápida)
    function enhanceImageForOCR(canvas, ctx, imageData) {
      const width = imageData.width;
      const height = imageData.height;
      
      // Escalar solo 1.5x para mejor balance velocidad/precisión (antes era 2x)
      const scale = 1.5;
      const scaledWidth = Math.floor(width * scale);
      const scaledHeight = Math.floor(height * scale);
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'medium'; // 'medium' en lugar de 'high' para velocidad
      
      tempCtx.drawImage(canvas, 0, 0, scaledWidth, scaledHeight);
      
      const scaledImageData = tempCtx.getImageData(0, 0, scaledWidth, scaledHeight);
      const scaledData = scaledImageData.data;
      
      // Binarización rápida con umbral fijo (más rápido que adaptativo)
      const threshold = 128;
      for (let i = 0; i < scaledData.length; i += 4) {
        const r = scaledData[i];
        const g = scaledData[i + 1];
        const b = scaledData[i + 2];
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const final = gray > threshold ? 255 : 0;
        scaledData[i] = final;
        scaledData[i + 1] = final;
        scaledData[i + 2] = final;
      }
      
      tempCtx.putImageData(scaledImageData, 0, 0);
      return tempCanvas;
    }
    
    // Función para corregir errores comunes de OCR (solo fragmentos, NO corrección T->I)
    function correctOCRCommonMistakes(text) {
      if (!text) return text;
      
      let corrected = text.toUpperCase().trim();
      
      // Solo corregir fragmentos obvios, NO hacer corrección automática T->I
      // Si solo detecta "AM -650" o "AM-650", agregar "I" al inicio
      // Esto maneja cuando la I se pierde completamente (no es T->I, es I faltante)
      const amPattern = /^AM[\s-]?([0-9]{3})$/;
      const amMatch = corrected.match(amPattern);
      if (amMatch) {
        corrected = 'IAM-' + amMatch[1];
        console.log(`Corrección OCR aplicada: "${text}" -> "${corrected}" (agregando I faltante)`);
      }
      
      return corrected;
    }
    
    // Función para extraer placa del texto OCR
    // Acepta formato: 3 letras seguidas de 3 números (con o sin guion: ABC123 o ABC-123)
    // Retorna SIN guion: ABC123 (formato usado en la base de datos)
    // MÁS ESTRICTA: Solo acepta placas que tengan formato perfecto
    function extractPlateFromText(text) {
      if (!text) return null;
      
      console.log('Extrayendo placa del texto OCR completo:', text);
      
      // Corregir errores comunes de OCR antes de procesar
      const corrected = correctOCRCommonMistakes(text);
      
      // Limpiar el texto y convertir a mayúsculas
      const clean = corrected.replace(/[^A-Z0-9\s-]/g, ' ').trim();
      
      // Validación estricta: el texto debe ser principalmente la placa
      // Rechazar si hay demasiado texto adicional
      const words = clean.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 4) {
        console.log('Rechazado: demasiado texto detectado (posible ruido)');
        return null;
      }
      
      // Buscar patrón EXACTO: 3 letras seguidas de 3 números (con o sin separador)
      // Priorizar patrones más estrictos primero
      const strictPatterns = [
        /^([A-Z]{3})[-]?([0-9]{3})$/g,  // Exactamente ABC123 o ABC-123 (sin nada más)
        /\b([A-Z]{3})[-]?([0-9]{3})\b/g,  // ABC123 o ABC-123 como palabra completa
      ];
      
      for (const pattern of strictPatterns) {
        const matches = [...clean.matchAll(pattern)];
        for (const match of matches) {
          let letters = match[1];
          const numbers = match[2];
          
          // NO hacer corrección automática T->I (el usuario indicó que no siempre es correcto)
          // Solo corregir si falta la I completamente (AM -> IAM)
          if (letters.length === 2 && /^[A-Z]{2}$/.test(letters) && numbers.length === 3) {
            // Verificar si podría ser AM -> IAM (I faltante, no T mal leída)
            if (letters === 'AM') {
              letters = 'IAM';
              console.log(`Corrección aplicada: agregando I faltante -> "${letters}"`);
            }
          }
          
          // Validación estricta adicional
          if (letters && letters.length === 3 && numbers && numbers.length === 3) {
            // Validar que las letras sean realmente letras (no números mal interpretados)
            if (!/^[A-Z]{3}$/.test(letters)) {
              console.log('Rechazado: letras inválidas:', letters);
              continue;
            }
            // Validar que los números sean realmente números
            if (!/^[0-9]{3}$/.test(numbers)) {
              console.log('Rechazado: números inválidos:', numbers);
              continue;
            }
            
            // Retornar SIN guion (formato de base de datos: ABC123)
            const plate = `${letters}${numbers}`;
            console.log('✅ Placa extraída encontrada (validada estrictamente):', plate);
            return plate;
          }
        }
      }
      
      // Si no encontró con patrones estrictos, buscar en palabras separadas
      // PERO solo si hay exactamente 2 palabras (3 letras + 3 números)
      if (words.length === 2) {
        let word1 = words[0];
        const word2 = words[1];
        
        // NO hacer corrección automática T->I
        // Solo corregir si falta la I completamente (AM -> IAM)
        if (word1 === 'AM' && word1.length === 2) {
          word1 = 'IAM';
          console.log(`Corrección aplicada en palabras separadas: "AM" -> "IAM" (I faltante)`);
        }
        
        // Patrón: primera palabra 3 letras, segunda palabra 3 números
        if (/^[A-Z]{3}$/.test(word1) && /^[0-9]{3}$/.test(word2)) {
          const plate = `${word1}${word2}`;
          console.log('✅ Placa extraída (palabras separadas, validada):', plate);
          return plate;
        }
      }
      
      // Si hay una sola palabra, verificar que sea exactamente ABC123
      if (words.length === 1) {
        let word = words[0];
        
        // NO hacer corrección automática T->I
        // Solo corregir si falta la I completamente (AM -> IAM)
        const amMatch = word.match(/^(AM)([0-9]{3})$/);
        if (amMatch) {
          word = 'IAM' + amMatch[2];
          console.log(`Corrección aplicada en palabra única: "AM" -> "IAM" (I faltante)`);
        }
        
        const finalMatch = word.match(/^([A-Z]{3})([0-9]{3})$/);
        if (finalMatch && finalMatch[1] && finalMatch[1].length === 3 && finalMatch[2] && finalMatch[2].length === 3) {
          const plate = `${finalMatch[1]}${finalMatch[2]}`;
          console.log('✅ Placa extraída (palabra única, validada):', plate);
          return plate;
        }
      }
      
      console.log('❌ No se encontró placa válida en el texto (validación estricta)');
      return null;
    }
    
    async function tickNative(){ 
      if(!running || cameraDisabled) {
        if (running && cameraDisabled) {
          requestAnimationFrame(tickNative);
        }
        return;
      }
      
      // Intentar primero con QR (por si acaso hay un código QR)
      try{ 
        if (detector) {
          const codes=await detector.detect(video); 
          if(codes && codes.length > 0 && codes[0]?.rawValue) {
            const code = codes[0].rawValue;
            if (isValidPlate(code)) {
              onCode(code);
              return;
            }
          }
        }
      }catch(e){
        // Ignorar errores de QR
      }
      
      const now = Date.now();
      
      // Si está en modo captura manual, no hacer detección automática
      if (manualCaptureMode || pendingPlateDetection) {
        requestAnimationFrame(tickNative);
        return;
      }
      
      // PRIORIDAD 1: Intentar con Plate Recognizer API (más rápido y preciso)
      if (USE_PLATE_RECOGNIZER && PLATE_RECOGNIZER_API_KEY && now - lastApiTime >= apiInterval && video.readyState >= 2) {
        lastApiTime = now;
        try {
          const w = video.videoWidth|0, h = video.videoHeight|0;
          if (w && h) {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            
            // Procesar región central (donde suele estar la placa)
            const region = {
              x: Math.floor(w * 0.2),
              y: Math.floor(h * 0.3),
              w: Math.floor(w * 0.6),
              h: Math.floor(h * 0.4)
            };
            
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = region.w;
            tempCanvas.height = region.h;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
            
              const result = await recognizePlateWithAPI(tempCanvas);
              if (result && result.plate && isValidPlate(result.plate)) {
                // Permitir múltiples detecciones para verificación (se mostrarán en consola)
                // El cooldown en handlePlate evitará crear múltiples ventas
                plateDetectionHistory.push({
                  plate: result.plate,
                  timestamp: now,
                  confidence: result.confidence
                });
                
                plateDetectionHistory = plateDetectionHistory.filter(
                  entry => now - entry.timestamp < 2000
                );
                
                const plateCount = plateDetectionHistory.filter(e => e.plate === result.plate).length;
                const requiredDetections = result.confidence > 80 ? 1 : 2;
                
                if (plateCount >= requiredDetections) {
                  console.log(`✅ Placa detectada por API (${plateCount} detecciones, confianza: ${result.confidence.toFixed(1)}):`, result.plate);
                  plateDetectionHistory = [];
                  // No marcar como procesada aquí - solo handlePlate lo hará al crear la venta
                  onCode(result.plate);
                  return;
                }
              }
          }
        } catch (apiErr) {
          console.warn('Error en Plate Recognizer API:', apiErr);
        }
      }
      
      // PRIORIDAD 2: Fallback a OCR Tesseract (más lento pero funciona sin API)
      if (now - lastOcrTime >= ocrInterval && running && !cameraDisabled) {
        lastOcrTime = now;
        try {
          if (!ocrWorker) {
            await initOCR();
          }
          
          // Verificar que el worker no haya sido terminado y que la cámara siga corriendo
          if (!ocrWorker || !running) {
            requestAnimationFrame(tickNative);
            return;
          }
          
          if (video.readyState >= 2) {
            const w = video.videoWidth|0, h = video.videoHeight|0;
            if (w && h) {
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              
              const region = {
                x: Math.floor(w * 0.2),
                y: Math.floor(h * 0.3),
                w: Math.floor(w * 0.6),
                h: Math.floor(h * 0.4)
              };
              
              const imageData = ctx.getImageData(region.x, region.y, region.w, region.h);
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = region.w;
              tempCanvas.height = region.h;
              const tempCtx = tempCanvas.getContext('2d');
              tempCtx.putImageData(imageData, 0, 0);
              
              const enhancedCanvas = enhanceImageForOCR(tempCanvas, tempCtx, imageData);
              
              try {
                // Verificar nuevamente que el worker existe y que la cámara sigue corriendo
                if (!ocrWorker || !running || cameraDisabled) {
                  requestAnimationFrame(tickNative);
                  return;
                }
                let text, words;
                try {
                  const result = await ocrWorker.recognize(enhancedCanvas);
                  // Verificar nuevamente después de await (puede haber cambiado)
                  if (!running || cameraDisabled) {
                    requestAnimationFrame(tickNative);
                    return;
                  }
                  text = result.data.text;
                  words = result.data.words;
                } catch (ocrErr) {
                  // Si el worker fue terminado, resetearlo
                  if (ocrErr.message?.includes('postMessage') || ocrErr.message?.includes('terminated') || ocrErr.message?.includes('null')) {
                    console.warn('OCR worker terminado, reseteando...');
                    ocrWorker = null;
                  }
                  requestAnimationFrame(tickNative);
                  return;
                }
                
                if (text && text.trim()) {
                  let processedText = text;
                  let avgConfidence = 0;
                  
                  if (words && words.length > 0) {
                    const confidences = words.map(w => w.confidence || 0).filter(c => c > 0);
                    avgConfidence = confidences.length > 0 
                      ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
                      : 0;
                    
                    if (avgConfidence > 0 && avgConfidence < 45) {
                      // Rechazar si confianza muy baja
                      requestAnimationFrame(tickNative);
                      return;
                    }
                    
                    const highConfWords = words.filter(w => (w.confidence || 0) > 55);
                    if (highConfWords.length > 0) {
                      processedText = highConfWords.map(w => w.text).join(' ').trim();
                    } else {
                      requestAnimationFrame(tickNative);
                      return;
                    }
                  }
                  
                  if (processedText && processedText.trim()) {
                    const plate = extractPlateFromText(processedText);
                    if (plate && isValidPlate(plate)) {
                      plateDetectionHistory.push({
                        plate,
                        timestamp: now,
                        confidence: avgConfidence
                      });
                      
                      plateDetectionHistory = plateDetectionHistory.filter(
                        entry => now - entry.timestamp < 3000
                      );
                      
                      const plateCount = plateDetectionHistory.filter(e => e.plate === plate).length;
                      // Aceptar más rápido: 1 detección si confianza > 70, 2 si > 55
                      const requiredDetections = avgConfidence > 70 ? 1 : (avgConfidence > 55 ? 2 : 2);
                      
                      if (plateCount >= requiredDetections) {
                        console.log(`✅ Placa detectada por OCR (${plateCount} detecciones, confianza: ${avgConfidence.toFixed(1)}):`, plate);
                        plateDetectionHistory = [];
                        onCode(plate);
                        return;
                      }
                    }
                  }
                }
              } catch (ocrErr) {
                // Continuar
              }
            }
          }
        } catch (ocrErr) {
          // Silenciar errores frecuentes
        }
      }
      
      requestAnimationFrame(tickNative); 
    }
    
    function tickCanvas(){
      if(!running || cameraDisabled) {
        if (running && cameraDisabled) {
          requestAnimationFrame(tickCanvas);
        }
        return;
      }
      try{
        const w = video.videoWidth|0, h = video.videoHeight|0;
        if(!w||!h){ 
          requestAnimationFrame(tickCanvas); 
          return; 
        }
        canvas.width=w; 
        canvas.height=h;
        ctx.drawImage(video,0,0,w,h);
        
        // Intentar primero con QR
        const imgData=ctx.getImageData(0,0,w,h);
        if (typeof jsQR !== 'undefined') {
          const code=jsQR(imgData.data, w, h);
          if(code && code.data && isValidPlate(code.data)) {
            onCode(code.data);
            return;
          }
        }
        
        const now = Date.now();
        
        // Si está en modo captura manual, no hacer detección automática
        if (manualCaptureMode || pendingPlateDetection) {
          requestAnimationFrame(tickCanvas);
          return;
        }
        
        // PRIORIDAD 1: Plate Recognizer API
        if (USE_PLATE_RECOGNIZER && PLATE_RECOGNIZER_API_KEY && now - lastApiTime >= apiInterval && video.readyState >= 2) {
          lastApiTime = now;
          (async () => {
            try {
              const region = {
                x: Math.floor(w * 0.2),
                y: Math.floor(h * 0.3),
                w: Math.floor(w * 0.6),
                h: Math.floor(h * 0.4)
              };
              
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = region.w;
              tempCanvas.height = region.h;
              const tempCtx = tempCanvas.getContext('2d');
              tempCtx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
              
              const result = await recognizePlateWithAPI(tempCanvas);
              if (result && result.plate && isValidPlate(result.plate)) {
                // Permitir múltiples detecciones para verificación (se mostrarán en consola)
                // El cooldown en handlePlate evitará crear múltiples ventas
                plateDetectionHistory.push({
                  plate: result.plate,
                  timestamp: now,
                  confidence: result.confidence
                });
                
                plateDetectionHistory = plateDetectionHistory.filter(
                  entry => now - entry.timestamp < 2000
                );
                
                const plateCount = plateDetectionHistory.filter(e => e.plate === result.plate).length;
                const requiredDetections = result.confidence > 80 ? 1 : 2;
                
                if (plateCount >= requiredDetections) {
                  console.log(`✅ Placa detectada por API (${plateCount} detecciones):`, result.plate);
                  plateDetectionHistory = [];
                  // No marcar como procesada aquí - solo handlePlate lo hará al crear la venta
                  onCode(result.plate);
                  return;
                }
              }
            } catch (apiErr) {
              console.warn('Error en Plate Recognizer API (tickCanvas):', apiErr);
            }
          })();
        }
        
        // PRIORIDAD 2: OCR Tesseract
        if (now - lastOcrTime >= ocrInterval && running && !cameraDisabled) {
          lastOcrTime = now;
          (async () => {
            try {
              if (!ocrWorker) {
                await initOCR();
              }
              
              // Verificar que el worker existe y que la cámara sigue corriendo
              if (!ocrWorker || !running) {
                requestAnimationFrame(tickCanvas);
                return;
              }
              
              const region = {
                x: Math.floor(w * 0.2),
                y: Math.floor(h * 0.3),
                w: Math.floor(w * 0.6),
                h: Math.floor(h * 0.4)
              };
              
              const imageData = ctx.getImageData(region.x, region.y, region.w, region.h);
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = region.w;
              tempCanvas.height = region.h;
              const tempCtx = tempCanvas.getContext('2d');
              tempCtx.putImageData(imageData, 0, 0);
              
              const enhancedCanvas = enhanceImageForOCR(tempCanvas, tempCtx, imageData);
              
              try {
                // Verificar nuevamente que el worker existe y que la cámara sigue corriendo
                if (!ocrWorker || !running || cameraDisabled) {
                  requestAnimationFrame(tickCanvas);
                  return;
                }
                let text, words;
                try {
                  const result = await ocrWorker.recognize(enhancedCanvas);
                  // Verificar nuevamente después de await (puede haber cambiado)
                  if (!running || cameraDisabled) {
                    requestAnimationFrame(tickCanvas);
                    return;
                  }
                  text = result.data.text;
                  words = result.data.words;
                } catch (ocrErr) {
                  // Si el worker fue terminado, resetearlo
                  if (ocrErr.message?.includes('postMessage') || ocrErr.message?.includes('terminated') || ocrErr.message?.includes('null')) {
                    console.warn('OCR worker terminado, reseteando...');
                    ocrWorker = null;
                  }
                  requestAnimationFrame(tickCanvas);
                  return;
                }
                
                if (text && text.trim()) {
                  let processedText = text;
                  let avgConfidence = 0;
                  
                  if (words && words.length > 0) {
                    const confidences = words.map(w => w.confidence || 0).filter(c => c > 0);
                    avgConfidence = confidences.length > 0 
                      ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
                      : 0;
                    
                    if (avgConfidence > 0 && avgConfidence < 45) {
                      requestAnimationFrame(tickCanvas);
                      return;
                    }
                    
                    const highConfWords = words.filter(w => (w.confidence || 0) > 55);
                    if (highConfWords.length > 0) {
                      processedText = highConfWords.map(w => w.text).join(' ').trim();
                    } else {
                      requestAnimationFrame(tickCanvas);
                      return;
                    }
                  }
                  
                  if (processedText && processedText.trim()) {
                    const plate = extractPlateFromText(processedText);
                    if (plate && isValidPlate(plate)) {
                      plateDetectionHistory.push({
                        plate,
                        timestamp: now,
                        confidence: avgConfidence
                      });
                      
                      plateDetectionHistory = plateDetectionHistory.filter(
                        entry => now - entry.timestamp < 3000
                      );
                      
                      const plateCount = plateDetectionHistory.filter(e => e.plate === plate).length;
                      const requiredDetections = avgConfidence > 70 ? 1 : (avgConfidence > 55 ? 2 : 2);
                      
                      if (plateCount >= requiredDetections) {
                        console.log(`✅ Placa detectada por OCR (${plateCount} detecciones):`, plate);
                        plateDetectionHistory = [];
                        onCode(plate);
                        return;
                      }
                    }
                  }
                }
              } catch (ocrErr) {
                // Continuar
              }
            } catch (ocrErr) {
              // Silenciar errores frecuentes
            }
          })();
        }
      }catch(e){
        console.warn('Error en tickCanvas:', e);
      }
      requestAnimationFrame(tickCanvas);
    }

    // Input manual
    if (manualBtn) {
      manualBtn.onclick = () => {
        const text = manualInput?.value?.trim() || '';
        if (text) {
          handlePlate(text);
        }
      };
    }

    // Crear botón de iniciar cámara si no existe
    let startBtn = nodeOCR.querySelector('#qr-start');
    if (!startBtn) {
      // Crear botón de iniciar cámara
      const qrbar = nodeOCR.querySelector('.qrbar');
      if (qrbar) {
        startBtn = document.createElement('button');
        startBtn.id = 'qr-start';
        startBtn.className = 'primary';
        startBtn.textContent = '📷 Iniciar cámara';
        startBtn.style.marginLeft = 'auto';
        startBtn.style.whiteSpace = 'nowrap';
        qrbar.appendChild(startBtn);
      }
    }

    // Función para actualizar selector de cámara cuando cambie
    if (sel) {
      sel.addEventListener('change', () => {
        // Si la cámara está corriendo, reiniciarla con la nueva cámara
        if (running) {
          stop();
          setTimeout(() => {
            start().catch(err => {
              console.error('Error al reiniciar cámara:', err);
              if (msg) {
                msg.textContent = '❌ Error al cambiar de cámara: ' + (err?.message || 'Error desconocido');
                msg.style.color = 'var(--danger, #ef4444)';
              }
            });
          }, 300);
        }
      });
    }

    // Botón de iniciar cámara
    if (startBtn) {
      startBtn.onclick = () => {
        start().catch(err => {
          console.error('Error al iniciar cámara:', err);
          if (msg) {
            msg.textContent = '❌ Error: ' + (err?.message || 'No se pudo iniciar la cámara');
            msg.style.color = 'var(--danger, #ef4444)';
          }
        });
      };
    }

    // Botón de cerrar
    const closeBtn = nodeOCR.querySelector('#qr-close');
    if (closeBtn) {
      closeBtn.onclick = () => {
        stop();
        if (modalOCR) modalOCR.classList.add('hidden');
      };
    }

    // Cargar lista de cámaras e iniciar automáticamente
    fillCams().then(() => {
      console.log('Lista de cámaras cargada');
      // Iniciar cámara automáticamente después de cargar
      setTimeout(() => {
        if (startBtn) {
          startBtn.click();
        } else {
          // Si no hay botón, iniciar directamente
          start().catch(err => {
            console.error('Error al iniciar cámara automáticamente:', err);
            if (msg) {
              msg.textContent = '❌ Error: ' + (err?.message || 'No se pudo iniciar la cámara');
              msg.style.color = 'var(--danger, #ef4444)';
            }
          });
        }
      }, 500);
    }).catch(err => {
      console.warn('Error al cargar cámaras:', err);
      // Intentar iniciar de todas formas
      setTimeout(() => {
        start().catch(startErr => {
          console.error('Error al iniciar cámara:', startErr);
          if (msg) {
            msg.textContent = '❌ Error: ' + (startErr?.message || 'No se pudo iniciar la cámara');
            msg.style.color = 'var(--danger, #ef4444)';
          }
        });
      }, 500);
    });
    
    // Actualizar mensaje inicial
    if (msg) {
      if (USE_PLATE_RECOGNIZER && PLATE_RECOGNIZER_API_KEY) {
        msg.textContent = '📷 Usando Plate Recognizer API (rápido y preciso) - Enfoca la placa...';
        msg.style.color = 'var(--text)';
      } else {
        msg.textContent = '📷 OCR optimizado activo - Enfoca la placa claramente. Para mejor precisión, configura Plate Recognizer API en config.js';
        msg.style.color = 'var(--text)';
      }
    }
    
    console.log('Modal QR abierto correctamente');
    } // Cerrar openQRForNewSaleWithOCR
    
    // Llamar a la función OCR directamente
    openQRForNewSaleWithOCR();
  } // Cerrar openQRForNewSale

  // Registrar event listeners DESPUÉS de definir las funciones
  // Función auxiliar para manejar eventos táctiles y de clic
  function setupMobileButton(buttonId, handler, buttonName) {
    const btn = document.getElementById(buttonId);
    if (!btn) {
      console.warn(`Botón ${buttonId} (${buttonName}) no encontrado en el DOM`);
      return;
    }
    
    console.log(`Registrando event listeners para ${buttonId} (${buttonName})`);
    
    // Función unificada para manejar tanto click como touch
    let touchStarted = false;
    const handleEvent = (e) => {
      console.log(`Evento ${e.type} detectado en ${buttonId}`);
      
      // Prevenir comportamiento por defecto solo en touchstart
      if (e.type === 'touchstart') {
        e.preventDefault();
        touchStarted = true;
      }
      
      // En touchend, solo procesar si hubo touchstart
      if (e.type === 'touchend') {
        if (!touchStarted) return;
        e.preventDefault();
        e.stopPropagation();
        touchStarted = false;
        handler();
        return;
      }
      
      // En click, solo procesar si no hubo touch (para evitar doble ejecución)
      if (e.type === 'click') {
        if (touchStarted) {
          touchStarted = false;
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        handler();
        return;
      }
    };
    
    // Registrar todos los eventos necesarios
    btn.addEventListener('touchstart', handleEvent, { passive: false });
    btn.addEventListener('touchend', handleEvent, { passive: false });
    btn.addEventListener('click', handleEvent);
    
    // Asegurar que el botón sea clickeable y visible
    btn.style.cursor = 'pointer';
    btn.style.pointerEvents = 'auto';
    btn.style.touchAction = 'manipulation';
    btn.style.userSelect = 'none';
    btn.style.webkitUserSelect = 'none';
    btn.style.webkitTapHighlightColor = 'transparent';
    
    // Verificar que el botón esté visible
    const rect = btn.getBoundingClientRect();
    console.log(`Botón ${buttonId} posición:`, { 
      visible: rect.width > 0 && rect.height > 0,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      zIndex: window.getComputedStyle(btn).zIndex
    });
  }
  
  // Usar requestAnimationFrame para asegurar que el DOM esté renderizado
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Nueva venta con placa
      setupMobileButton('sales-start-qr', () => {
        console.log('Ejecutando openQRForNewSale...');
        openQRForNewSale().catch(err => {
          console.error('Error al abrir QR para nueva venta:', err);
          alert('Error: ' + (err?.message || 'No se pudo abrir el lector de placa'));
        });
      }, 'Nueva venta con placa');
      
      // Agregar items
      setupMobileButton('sales-add-unified', () => {
        console.log('Ejecutando openAddUnified...');
        openAddUnified();
      }, 'Agregar items');
    });
  });
  document.getElementById('sv-edit-cv')?.addEventListener('click', openEditCV);
  document.getElementById('sv-loadQuote')?.addEventListener('click', loadQuote);
  document.getElementById('sv-applyQuoteCV')?.addEventListener('click', applyQuoteCustomerVehicle);

  document.getElementById('sales-close')?.addEventListener('click', async ()=>{
    if (!current) return;
    openCloseModal();
  });
  
  // Botón de configurar mensaje post-servicio - Configurar para móvil y desktop
  // Configurar botón de configuración post-servicio con retry
  function setupConfigurePostServiceButton() {
    const configurePostServiceBtn = document.getElementById('sales-configure-post-service');
    if (!configurePostServiceBtn) {
      // Retry después de un pequeño delay si el botón no existe aún
      setTimeout(setupConfigurePostServiceButton, 100);
      return;
    }
    
    // Remover listeners anteriores si existen
    const newBtn = configurePostServiceBtn.cloneNode(true);
    configurePostServiceBtn.parentNode.replaceChild(newBtn, configurePostServiceBtn);
    
    // Función unificada para manejar tanto click como touch
    let touchStarted = false;
    const handleConfigEvent = (e) => {
      if (e.type === 'touchstart') {
        e.preventDefault();
        touchStarted = true;
        return;
      }
      
      if (e.type === 'touchend') {
        if (!touchStarted) return;
        e.preventDefault();
        e.stopPropagation();
        touchStarted = false;
        openPostServiceConfigModal().catch(err => {
          console.error('Error opening post-service config modal:', err);
          alert('Error al abrir configuración: ' + (err.message || 'Error desconocido'));
        });
        return;
      }
      
      if (e.type === 'click') {
        if (touchStarted) {
          touchStarted = false;
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        openPostServiceConfigModal().catch(err => {
          console.error('Error opening post-service config modal:', err);
          alert('Error al abrir configuración: ' + (err.message || 'Error desconocido'));
        });
      }
    };
    
    newBtn.addEventListener('touchstart', handleConfigEvent, { passive: false });
    newBtn.addEventListener('touchend', handleConfigEvent, { passive: false });
    newBtn.addEventListener('click', handleConfigEvent);
    
    // Asegurar que el botón sea clickeable y visible en móvil
    newBtn.style.cursor = 'pointer';
    newBtn.style.pointerEvents = 'auto';
    newBtn.style.touchAction = 'manipulation';
    newBtn.style.userSelect = 'none';
    newBtn.style.webkitUserSelect = 'none';
    newBtn.style.webkitTapHighlightColor = 'transparent';
  }
  
  // Intentar configurar inmediatamente y con retry
  setupConfigurePostServiceButton();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupConfigurePostServiceButton);
  }

  document.getElementById('sales-print')?.addEventListener('click', async ()=>{
    if (!current) return;
    try{
      const fresh = await API.sales.get(current._id);
      printSaleTicket(fresh);
    }catch(e){ alert(e?.message||'No se pudo imprimir'); }
  });

  connectLive();
}

// ========================
// NAVEGACIÓN INTERNA Y HISTORIAL
// ========================

let historialCurrentPage = 1;
let historialPageSize = 20;
let historialTotalPages = 1;
let historialTotal = 0;
let historialDateFrom = null;
let historialDateTo = null;

function initInternalNavigation() {
  const btnVentas = document.getElementById('sales-nav-ventas');
  const btnHistorial = document.getElementById('sales-nav-historial');
  const viewVentas = document.getElementById('sales-view-ventas');
  const viewHistorial = document.getElementById('sales-view-historial');

  if (!btnVentas || !btnHistorial || !viewVentas || !viewHistorial) return;

  // Navegación entre vistas
  btnVentas.addEventListener('click', () => {
    btnVentas.classList.add('active');
    btnHistorial.classList.remove('active');
    viewVentas.classList.remove('hidden');
    viewHistorial.classList.add('hidden');
  });

  btnHistorial.addEventListener('click', () => {
    btnHistorial.classList.add('active');
    btnVentas.classList.remove('active');
    viewHistorial.classList.remove('hidden');
    viewVentas.classList.add('hidden');
    // Cargar historial al cambiar a esa vista
    loadHistorial();
  });

  // Filtros de fecha
  const btnFiltrar = document.getElementById('historial-filtrar');
  const btnLimpiar = document.getElementById('historial-limpiar');
  const fechaDesde = document.getElementById('historial-fecha-desde');
  const fechaHasta = document.getElementById('historial-fecha-hasta');

  if (btnFiltrar) {
    btnFiltrar.addEventListener('click', () => {
      historialDateFrom = fechaDesde?.value || null;
      historialDateTo = fechaHasta?.value || null;
      historialCurrentPage = 1;
      loadHistorial();
    });
  }

  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', () => {
      if (fechaDesde) fechaDesde.value = '';
      if (fechaHasta) fechaHasta.value = '';
      historialDateFrom = null;
      historialDateTo = null;
      historialCurrentPage = 1;
      loadHistorial();
    });
  }

  // Paginación
  const btnPrev = document.getElementById('historial-prev');
  const btnNext = document.getElementById('historial-next');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (historialCurrentPage > 1) {
        historialCurrentPage--;
        loadHistorial();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (historialCurrentPage < historialTotalPages) {
        historialCurrentPage++;
        loadHistorial();
      }
    });
  }
}

async function loadHistorial() {
  const container = document.getElementById('historial-ventas-container');
  const paginationInfo = document.getElementById('historial-pagination-info');
  const pageInfo = document.getElementById('historial-page-info');
  const btnPrev = document.getElementById('historial-prev');
  const btnNext = document.getElementById('historial-next');

  if (!container) return;

  try {
    container.innerHTML = '<div class="text-center py-8 text-slate-400">Cargando ventas...</div>';

    const params = {
      status: 'closed',
      limit: historialPageSize,
      page: historialCurrentPage
    };

    // Si hay filtros de fecha, usarlos; si no, cargar últimas 20
    if (historialDateFrom || historialDateTo) {
      if (historialDateFrom) params.from = historialDateFrom;
      if (historialDateTo) params.to = historialDateTo;
    } else {
      // Sin filtros: cargar últimas 20 ventas
      params.limit = 20;
      params.page = 1;
    }

    const res = await API.sales.list(params);
    const sales = Array.isArray(res?.items) ? res.items : [];
    
    historialTotal = res?.total || sales.length;
    historialTotalPages = res?.pages || Math.ceil(historialTotal / historialPageSize);

    if (sales.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12">
          <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-lg mb-2">No se encontraron ventas</div>
          <div class="text-slate-500 dark:text-slate-500 theme-light:text-slate-500 text-sm">Intenta ajustar los filtros de fecha</div>
        </div>
      `;
      if (paginationInfo) paginationInfo.textContent = '';
      if (pageInfo) pageInfo.textContent = '';
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = true;
      return;
    }

    // Renderizar ventas
    container.innerHTML = '';
    sales.forEach(sale => {
      const card = createHistorialSaleCard(sale);
      container.appendChild(card);
    });

    // Actualizar información de paginación
    if (paginationInfo) {
      const start = (historialCurrentPage - 1) * historialPageSize + 1;
      const end = Math.min(historialCurrentPage * historialPageSize, historialTotal);
      paginationInfo.textContent = `Mostrando ${start} - ${end} de ${historialTotal} ventas`;
    }

    if (pageInfo) {
      pageInfo.textContent = `Página ${historialCurrentPage} de ${historialTotalPages}`;
    }

    if (btnPrev) btnPrev.disabled = historialCurrentPage <= 1;
    if (btnNext) btnNext.disabled = historialCurrentPage >= historialTotalPages;

  } catch (err) {
    console.error('Error loading historial:', err);
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="text-red-400 dark:text-red-400 theme-light:text-red-600 text-lg mb-2">Error al cargar ventas</div>
        <div class="text-slate-500 dark:text-slate-500 theme-light:text-slate-500 text-sm">${err?.message || 'Error desconocido'}</div>
      </div>
    `;
  }
}

function createHistorialSaleCard(sale) {
  const card = document.createElement('div');
  card.className = 'historial-sale-card bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-4';
  
  const plate = sale?.vehicle?.plate || 'Sin placa';
  const customer = sale?.customer?.name || 'Sin cliente';
  const totalPaid = calculateTotalPaid(sale);
  const closedDate = sale?.closedAt ? new Date(sale.closedAt).toLocaleDateString('es-CO', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : 'Sin fecha';
  const saleNumber = sale?.number ? String(sale.number).padStart(5, '0') : sale?._id?.slice(-6) || 'N/A';

  card.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div class="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Placa</div>
          <div class="text-base font-bold text-white dark:text-white theme-light:text-slate-900">${plate.toUpperCase()}</div>
        </div>
        <div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Cliente</div>
          <div class="text-base font-semibold text-white dark:text-white theme-light:text-slate-900">${customer}</div>
        </div>
        <div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Valor pagado</div>
          <div class="text-lg font-bold text-green-400 dark:text-green-400 theme-light:text-green-600">${money(totalPaid)}</div>
        </div>
      </div>
      <div class="flex flex-col sm:flex-row gap-2">
        <button class="btn-historial-print px-3 py-2 text-xs bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300" data-sale-id="${sale._id}">
          🖨️ Imprimir remisión
        </button>
        <button class="btn-historial-view px-3 py-2 text-xs bg-blue-600/50 dark:bg-blue-600/50 hover:bg-blue-600 dark:hover:bg-blue-600 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-blue-500/50 dark:border-blue-500/50" data-sale-id="${sale._id}">
          👁️ Ver resumen
        </button>
        <button class="btn-historial-edit px-3 py-2 text-xs bg-purple-600/50 dark:bg-purple-600/50 hover:bg-purple-600 dark:hover:bg-purple-600 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-purple-500/50 dark:border-purple-500/50" data-sale-id="${sale._id}">
          ✏️ Editar cierre
        </button>
      </div>
    </div>
    <div class="mt-3 pt-3 border-t border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300/30 flex justify-between items-center text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
      <span>Venta #${saleNumber}</span>
      <span>Cerrada: ${closedDate}</span>
    </div>
  `;

  // Event listeners para los botones
  const btnPrint = card.querySelector('.btn-historial-print');
  const btnView = card.querySelector('.btn-historial-view');
  const btnEdit = card.querySelector('.btn-historial-edit');

  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      printSaleFromHistorial(btnPrint.dataset.saleId);
    });
  }

  if (btnView) {
    btnView.addEventListener('click', () => {
      viewSaleSummary(btnView.dataset.saleId);
    });
  }

  if (btnEdit) {
    btnEdit.addEventListener('click', () => {
      openEditCloseModal(btnEdit.dataset.saleId);
    });
  }

  return card;
}

function calculateTotalPaid(sale) {
  if (!sale) return 0;
  
  // Si tiene paymentMethods (multi-pago), sumar todos
  if (sale.paymentMethods && Array.isArray(sale.paymentMethods) && sale.paymentMethods.length > 0) {
    return sale.paymentMethods.reduce((sum, pm) => sum + (Number(pm.amount) || 0), 0);
  }
  
  // Fallback al total de la venta
  return Number(sale.total) || 0;
}

async function printSaleFromHistorial(saleId) {
  try {
    const sale = await API.sales.get(saleId);
    if (sale) {
      printSaleTicket(sale);
    } else {
      alert('No se pudo cargar la venta');
    }
  } catch (err) {
    console.error('Error printing sale:', err);
    alert('Error al imprimir: ' + (err?.message || 'Error desconocido'));
  }
}

async function viewSaleSummary(saleId) {
  try {
    const sale = await API.sales.get(saleId);
    if (!sale) {
      alert('No se pudo cargar la venta');
      return;
    }

    // Usar la función existente openSaleHistoryDetail si existe, o crear una nueva
    if (typeof openSaleHistoryDetail === 'function') {
      openSaleHistoryDetail(saleId);
    } else {
      // Crear modal simple con resumen
      const modal = document.getElementById('modal');
      const modalBody = document.getElementById('modalBody');
      if (!modal || !modalBody) return;

      const summary = buildSaleSummaryHTML(sale);
      modalBody.innerHTML = summary;
      modal.classList.remove('hidden');

      // Botón cerrar
      const closeBtn = modalBody.querySelector('#summary-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          modal.classList.add('hidden');
        });
      }
    }
  } catch (err) {
    console.error('Error viewing sale summary:', err);
    alert('Error al cargar resumen: ' + (err?.message || 'Error desconocido'));
  }
}

function buildSaleSummaryHTML(sale) {
  const plate = sale?.vehicle?.plate || 'Sin placa';
  const customer = sale?.customer?.name || 'Sin cliente';
  const customerId = sale?.customer?.idNumber || '';
  const customerPhone = sale?.customer?.phone || '';
  const total = Number(sale?.total) || 0;
  const closedDate = sale?.closedAt ? new Date(sale.closedAt).toLocaleDateString('es-CO', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : 'Sin fecha';
  const saleNumber = sale?.number ? String(sale.number).padStart(5, '0') : sale?._id?.slice(-6) || 'N/A';
  const paymentMethods = sale?.paymentMethods || [];
  const laborCommissions = sale?.laborCommissions || [];

  let itemsHTML = '';
  if (sale.items && sale.items.length > 0) {
    itemsHTML = sale.items.map((item, idx) => `
      <tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-sky-50 transition-colors duration-150 ${idx % 2 === 0 ? 'bg-slate-800/20 dark:bg-slate-800/20 theme-light:bg-white' : ''}">
        <td class="py-3 px-4 text-xs font-mono text-slate-300 dark:text-slate-300 theme-light:text-slate-700">${item.sku || '—'}</td>
        <td class="py-3 px-4 text-sm text-white dark:text-white theme-light:text-slate-900 font-medium">${item.name || 'Item'}</td>
        <td class="py-3 px-4 text-center text-sm text-white dark:text-white theme-light:text-slate-900">${item.qty || 1}</td>
        <td class="py-3 px-4 text-right text-sm text-white dark:text-white theme-light:text-slate-900">${money(item.unitPrice || 0)}</td>
        <td class="py-3 px-4 text-right text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">${money((item.qty || 1) * (item.unitPrice || 0))}</td>
      </tr>
    `).join('');
  }

  let paymentsHTML = '';
  if (paymentMethods.length > 0) {
    paymentsHTML = paymentMethods.map((pm, idx) => `
      <tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-sky-50 transition-colors duration-150 ${idx % 2 === 0 ? 'bg-slate-800/20 dark:bg-slate-800/20 theme-light:bg-white' : ''}">
        <td class="py-2 px-2 text-sm text-white dark:text-white theme-light:text-slate-900 font-medium">${pm.method || 'N/A'}</td>
        <td class="py-2 px-2 text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${pm.accountId ? '—' : '—'}</td>
        <td class="py-2 px-2 text-right text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">${money(pm.amount || 0)}</td>
      </tr>
    `).join('');
  }

  let commissionsHTML = '';
  if (laborCommissions.length > 0) {
    commissionsHTML = laborCommissions.map((comm, idx) => `
      <tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-sky-50 transition-colors duration-150 ${idx % 2 === 0 ? 'bg-slate-800/20 dark:bg-slate-800/20 theme-light:bg-white' : ''}">
        <td class="py-2 px-2 text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">${comm.technician || 'N/A'}</td>
        <td class="py-2 px-2 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${comm.kind || '—'}</td>
        <td class="py-2 px-2 text-right text-sm font-semibold text-blue-400 dark:text-blue-400 theme-light:text-blue-600">${money(comm.share || 0)}</td>
      </tr>
    `).join('');
  }

  return `
    <div class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6 max-w-5xl max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
        <div>
          <h3 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-1">Resumen de Venta</h3>
          <p class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Venta #${saleNumber}</p>
        </div>
        <button id="summary-close" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
          ✕ Cerrar
        </button>
      </div>

      <!-- Información General -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="bg-gradient-to-br from-slate-900/70 to-slate-800/70 dark:from-slate-900/70 dark:to-slate-800/70 theme-light:from-sky-100 theme-light:to-sky-50 rounded-lg p-4 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 shadow-md">
          <h4 class="text-xs font-semibold text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2 uppercase tracking-wide">Cliente</h4>
          <div class="text-lg font-bold text-white dark:text-white theme-light:text-slate-900 mb-2">${customer}</div>
          ${customerId ? `<div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 flex items-center gap-2"><span class="font-medium">ID:</span> <span>${customerId}</span></div>` : ''}
          ${customerPhone ? `<div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 flex items-center gap-2 mt-1"><span class="font-medium">Tel:</span> <span>${customerPhone}</span></div>` : ''}
        </div>
        <div class="bg-gradient-to-br from-slate-900/70 to-slate-800/70 dark:from-slate-900/70 dark:to-slate-800/70 theme-light:from-sky-100 theme-light:to-sky-50 rounded-lg p-4 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 shadow-md">
          <h4 class="text-xs font-semibold text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2 uppercase tracking-wide">Vehículo</h4>
          <div class="text-lg font-bold text-white dark:text-white theme-light:text-slate-900 mb-2">${plate.toUpperCase()}</div>
          ${sale.vehicle?.brand ? `<div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${sale.vehicle.brand} ${sale.vehicle.line || ''} ${sale.vehicle.year ? `(${sale.vehicle.year})` : ''}</div>` : ''}
        </div>
      </div>

      <!-- Items -->
      <div class="mb-6">
        <h4 class="text-lg font-bold text-white dark:text-white theme-light:text-slate-900 mb-4 flex items-center gap-2">
          <span class="text-2xl">📦</span>
          <span>Items de la Venta</span>
        </h4>
        <div class="overflow-x-auto rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 shadow-lg">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-slate-900/80 dark:bg-slate-900/80 theme-light:bg-sky-200 border-b-2 border-slate-700/70 dark:border-slate-700/70 theme-light:border-slate-400">
                <th class="text-left py-3 px-4 text-xs font-bold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider">SKU</th>
                <th class="text-left py-3 px-4 text-xs font-bold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider">Descripción</th>
                <th class="text-center py-3 px-4 text-xs font-bold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider">Cant.</th>
                <th class="text-right py-3 px-4 text-xs font-bold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider">Unit</th>
                <th class="text-right py-3 px-4 text-xs font-bold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody class="bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white">
              ${itemsHTML || '<tr><td colspan="5" class="text-center py-8 text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Sin items</td></tr>'}
            </tbody>
            <tfoot>
              <tr class="bg-slate-900/60 dark:bg-slate-900/60 theme-light:bg-sky-100 border-t-2 border-slate-700/70 dark:border-slate-700/70 theme-light:border-slate-400">
                <td colspan="4" class="text-right py-4 px-4 font-bold text-base text-white dark:text-white theme-light:text-slate-900">Subtotal</td>
                <td class="text-right py-4 px-4 font-bold text-lg text-white dark:text-white theme-light:text-slate-900">${money(total)}</td>
              </tr>
              <tr class="bg-gradient-to-r from-blue-900/40 to-blue-800/40 dark:from-blue-900/40 dark:to-blue-800/40 theme-light:from-blue-100 theme-light:to-blue-50 border-t-2 border-blue-700/50 dark:border-blue-700/50 theme-light:border-blue-400">
                <td colspan="4" class="text-right py-4 px-4 font-bold text-lg text-white dark:text-white theme-light:text-slate-900">Total</td>
                <td class="text-right py-4 px-4 font-bold text-xl text-blue-400 dark:text-blue-400 theme-light:text-blue-600">${money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Pagos y Comisiones -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <!-- Formas de pago -->
        <div class="bg-gradient-to-br from-slate-900/70 to-slate-800/70 dark:from-slate-900/70 dark:to-slate-800/70 theme-light:from-sky-100 theme-light:to-sky-50 rounded-lg p-4 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 shadow-md">
          <h4 class="text-base font-bold text-white dark:text-white theme-light:text-slate-900 mb-4 flex items-center gap-2">
            <span class="text-xl">💳</span>
            <span>Formas de Pago</span>
          </h4>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
                  <th class="text-left py-2 px-2 text-xs font-semibold text-slate-400 dark:text-slate-400 theme-light:text-slate-600 uppercase">Método</th>
                  <th class="text-left py-2 px-2 text-xs font-semibold text-slate-400 dark:text-slate-400 theme-light:text-slate-600 uppercase">Cuenta</th>
                  <th class="text-right py-2 px-2 text-xs font-semibold text-slate-400 dark:text-slate-400 theme-light:text-slate-600 uppercase">Monto</th>
                </tr>
              </thead>
              <tbody>
                ${paymentsHTML || '<tr><td colspan="3" class="text-center py-4 text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-sm">Sin información de pago</td></tr>'}
              </tbody>
              <tfoot>
                <tr class="border-t-2 border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-200">
                  <td colspan="2" class="text-right py-2 px-2 font-bold text-sm text-white dark:text-white theme-light:text-slate-900">Total pagos:</td>
                  <td class="text-right py-2 px-2 font-bold text-base text-green-400 dark:text-green-400 theme-light:text-green-600">${money(paymentMethods.reduce((sum, pm) => sum + (Number(pm.amount) || 0), 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <!-- Comisiones técnicas -->
        <div class="bg-gradient-to-br from-slate-900/70 to-slate-800/70 dark:from-slate-900/70 dark:to-slate-800/70 theme-light:from-sky-100 theme-light:to-sky-50 rounded-lg p-4 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 shadow-md">
          <h4 class="text-base font-bold text-white dark:text-white theme-light:text-slate-900 mb-4 flex items-center gap-2">
            <span class="text-xl">👷</span>
            <span>Comisiones Técnicas</span>
          </h4>
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
                  <th class="text-left py-2 px-2 text-xs font-semibold text-slate-400 dark:text-slate-400 theme-light:text-slate-600 uppercase">Técnico</th>
                  <th class="text-left py-2 px-2 text-xs font-semibold text-slate-400 dark:text-slate-400 theme-light:text-slate-600 uppercase">Tipo</th>
                  <th class="text-right py-2 px-2 text-xs font-semibold text-slate-400 dark:text-slate-400 theme-light:text-slate-600 uppercase">Participación</th>
                </tr>
              </thead>
              <tbody>
                ${commissionsHTML || '<tr><td colspan="3" class="text-center py-4 text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-sm">Sin comisiones registradas</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="pt-4 border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 text-center">
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
          <span class="font-medium">Cerrada el:</span> <span>${closedDate}</span>
        </div>
      </div>
    </div>
  `;
}

// ========================
// MODAL DE EDICIÓN DE CIERRE DE VENTA
// ========================

async function openEditCloseModal(saleId) {
  if (!saleId) return;
  
  try {
    const sale = await API.sales.get(saleId);
    if (!sale) {
      alert('No se pudo cargar la venta');
      return;
    }

    if (sale.status !== 'closed') {
      alert('Solo se pueden editar ventas cerradas');
      return;
    }

    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    if (!modal || !modalBody) return;

    // Construir contenido del modal similar al de cierre pero para edición
    const total = sale?.total || 0;
    const modalContent = buildEditCloseModalContent(sale, total);
    modalBody.innerHTML = '';
    modalBody.appendChild(modalContent);
    modal.classList.remove('hidden');

    // Configurar el modal
    setupEditCloseModal(sale);

    // Botón cancelar
    const cancelBtn = document.getElementById('ecv-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }

  } catch (err) {
    console.error('Error opening edit close modal:', err);
    alert('Error al cargar venta: ' + (err?.message || 'Error desconocido'));
  }
}

function buildEditCloseModalContent(sale, total) {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-4';
  wrap.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 m-0">Editar cierre de venta</h3>
    </div>
    <div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-4">
      Total venta: <strong class="text-white dark:text-white theme-light:text-slate-900">${money(total)}</strong>
    </div>
    <div id="ecv-payments-block" class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 p-4 mb-4">
      <div class="flex justify-between items-center mb-4">
        <strong class="text-base font-semibold text-white dark:text-white theme-light:text-slate-900">Formas de pago</strong>
        <button id="ecv-add-payment" type="button" class="px-3 py-1.5 text-xs bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-sky-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-700 rounded-lg transition-colors duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">+ Agregar</button>
      </div>
      <table class="w-full text-xs border-collapse" id="ecv-payments-table">
        <thead>
          <tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">
            <th class="py-2 px-2 text-left text-slate-300 dark:text-slate-300 theme-light:text-slate-700 font-semibold">Método</th>
            <th class="py-2 px-2 text-left text-slate-300 dark:text-slate-300 theme-light:text-slate-700 font-semibold">Cuenta</th>
            <th class="py-2 px-2 text-left text-slate-300 dark:text-slate-300 theme-light:text-slate-700 font-semibold w-24">Monto</th>
            <th class="py-2 px-2 w-8"></th>
          </tr>
        </thead>
        <tbody id="ecv-payments-body"></tbody>
      </table>
      <div id="ecv-payments-summary" class="mt-3 text-xs"></div>
    </div>
    <div id="ecv-labor-commissions-block" class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 p-4 mb-4">
      <div class="flex justify-between items-center mb-4">
        <div>
          <label class="block text-base font-bold text-white dark:text-white theme-light:text-slate-900 mb-1">Desglose de mano de obra</label>
          <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Edita las líneas de participación técnica.</p>
        </div>
        <button id="ecv-add-commission" type="button" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 text-sm whitespace-nowrap">+ Agregar línea</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs border-collapse">
          <thead>
            <tr class="border-b-2 border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-400 bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-sky-200">
              <th class="py-3 px-3 text-left text-slate-200 dark:text-slate-200 theme-light:text-slate-800 font-bold">Técnico</th>
              <th class="py-3 px-3 text-left text-slate-200 dark:text-slate-200 theme-light:text-slate-800 font-bold">Tipo de MO</th>
              <th class="py-3 px-3 text-right text-slate-200 dark:text-slate-200 theme-light:text-slate-800 font-bold">Valor MO</th>
              <th class="py-3 px-3 text-right text-slate-200 dark:text-slate-200 theme-light:text-slate-800 font-bold">% Técnico</th>
              <th class="py-3 px-3 text-right text-slate-200 dark:text-slate-200 theme-light:text-slate-800 font-bold">Participación</th>
              <th class="py-3 px-3 w-10"></th>
            </tr>
          </thead>
          <tbody id="ecv-comm-body">
            <tr>
              <td colspan="6" class="py-8 text-center text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-sm">
                <div class="flex flex-col items-center gap-2">
                  <span>No hay líneas de participación técnica</span>
                  <span class="text-xs">Haz clic en "+ Agregar línea" para comenzar</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="md:col-span-2">
        <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Comprobante (opcional)</label>
        <div class="relative">
          <input id="ecv-receipt" type="file" accept="image/*,.pdf" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-600/50 file:text-white file:cursor-pointer hover:file:bg-slate-600" />
        </div>
        <div id="ecv-receipt-status" class="mt-2 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
          ${sale.paymentReceiptUrl ? `<a href="${sale.paymentReceiptUrl}" target="_blank" class="text-blue-400 hover:text-blue-300">Ver comprobante actual</a>` : 'Sin archivos seleccionados'}
        </div>
      </div>
      <div class="md:col-span-2 flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mt-4">
        <button id="ecv-confirm" class="w-full sm:flex-1 px-3 sm:px-4 py-2.5 sm:py-2.5 text-sm sm:text-base bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar cambios</button>
        <button type="button" id="ecv-cancel" class="w-full sm:w-auto px-3 sm:px-4 py-2.5 sm:py-2.5 text-sm sm:text-base bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-sky-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-700 font-semibold rounded-lg transition-colors duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Cancelar</button>
      </div>
      <div id="ecv-msg" class="md:col-span-2 mt-2 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600"></div>
    </div>
  `;
  return wrap;
}

async function setupEditCloseModal(sale) {
  await ensureCompanyData();
  
  const payments = [];
  const commissions = [];
  
  // Cargar métodos de pago existentes
  if (sale.paymentMethods && Array.isArray(sale.paymentMethods) && sale.paymentMethods.length > 0) {
    sale.paymentMethods.forEach(p => {
      payments.push({
        method: p.method || '',
        amount: Number(p.amount) || 0,
        accountId: p.accountId || null
      });
    });
  } else if (sale.paymentMethod) {
    // Fallback al método único legacy
    payments.push({
      method: sale.paymentMethod,
      amount: Number(sale.total) || 0,
      accountId: null
    });
  }

  // Cargar comisiones existentes
  if (sale.laborCommissions && Array.isArray(sale.laborCommissions) && sale.laborCommissions.length > 0) {
    sale.laborCommissions.forEach(c => {
      commissions.push({
        technician: c.technician || '',
        kind: c.kind || '',
        laborValue: Number(c.laborValue) || 0,
        percent: Number(c.percent) || 0,
        share: Number(c.share) || 0
      });
    });
  }

  // Renderizar pagos
  renderEditPayments(payments);
  
  // Renderizar comisiones
  renderEditCommissions(commissions);

  // Event listeners
  setupEditCloseModalListeners(sale, payments, commissions);
}

function renderEditPayments(payments) {
  const body = document.getElementById('ecv-payments-body');
  const summary = document.getElementById('ecv-payments-summary');
  if (!body) return;

  body.innerHTML = '';
  
  if (payments.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-400 text-sm">No hay métodos de pago</td></tr>';
    if (summary) summary.textContent = '';
    return;
  }

  const commonPaymentMethods = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CREDITO', 'CRÉDITO', 'NEQUI', 'DAVIPLATA', 'PSE'];
  
  payments.forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200';
    const currentMethod = (p.method || '').toUpperCase();
    const isInCommon = commonPaymentMethods.includes(currentMethod);
    
    tr.innerHTML = `
      <td class="py-2 px-2">
        <select class="ecv-payment-method w-full px-2 py-1 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs" data-idx="${idx}">
          <option value="">Seleccionar método</option>
          ${commonPaymentMethods.map(m => `<option value="${m}" ${currentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}
          <option value="__CUSTOM__" ${!isInCommon && p.method ? 'selected' : ''}>Otro (personalizado)</option>
        </select>
        <input type="text" class="ecv-payment-method-custom w-full px-2 py-1 mt-1 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs ${isInCommon || !p.method ? 'hidden' : ''}" value="${!isInCommon ? (p.method || '') : ''}" data-idx="${idx}" placeholder="Escribir método personalizado" />
      </td>
      <td class="py-2 px-2">
        <select class="ecv-payment-account w-full px-2 py-1 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs" data-idx="${idx}">
          <option value="">Seleccionar cuenta</option>
        </select>
      </td>
      <td class="py-2 px-2">
        <input type="number" class="ecv-payment-amount w-full px-2 py-1 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs text-right" value="${p.amount || 0}" data-idx="${idx}" min="0" step="1" />
      </td>
      <td class="py-2 px-2 text-center">
        <button type="button" class="ecv-remove-payment px-2 py-1 bg-red-600/50 hover:bg-red-600 text-white text-xs rounded" data-idx="${idx}">✕</button>
      </td>
    `;
    body.appendChild(tr);
  });

  // Cargar cuentas en los selects
  loadAccountsForEditModal().then(() => {
    payments.forEach((p, idx) => {
      const select = body.querySelector(`.ecv-payment-account[data-idx="${idx}"]`);
      if (select && p.accountId) {
        select.value = p.accountId;
      }
    });
  });

  updateEditPaymentsSummary(payments);
}

function renderEditCommissions(commissions) {
  const body = document.getElementById('ecv-comm-body');
  if (!body) return;

  body.innerHTML = '';

  if (commissions.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-sm">
          <div class="flex flex-col items-center gap-2">
            <span>No hay líneas de participación técnica</span>
            <span class="text-xs">Haz clic en "+ Agregar línea" para comenzar</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  commissions.forEach((c, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200';
    const share = c.share || (c.laborValue * c.percent / 100);
    tr.innerHTML = `
      <td class="py-2 px-3">
        <select class="ecv-comm-technician w-full px-2 py-1 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs" data-idx="${idx}">
          <option value="">Seleccionar técnico</option>
        </select>
      </td>
      <td class="py-2 px-3">
        <select class="ecv-comm-kind w-full px-2 py-1 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs" data-idx="${idx}">
          <option value="">Seleccionar tipo</option>
        </select>
      </td>
      <td class="py-2 px-3">
        <input type="number" class="ecv-comm-labor-value w-full px-2 py-1 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs text-right" value="${c.laborValue || 0}" data-idx="${idx}" min="0" step="1" />
      </td>
      <td class="py-2 px-3">
        <input type="number" class="ecv-comm-percent w-full px-2 py-1 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs text-right" value="${c.percent || 0}" data-idx="${idx}" min="0" max="100" step="0.1" />
      </td>
      <td class="py-2 px-3 text-right text-sm font-semibold text-blue-400 dark:text-blue-400 theme-light:text-blue-600">
        <span class="ecv-comm-share">${money(share)}</span>
      </td>
      <td class="py-2 px-3 text-center">
        <button type="button" class="ecv-remove-commission px-2 py-1 bg-red-600/50 hover:bg-red-600 text-white text-xs rounded" data-idx="${idx}">✕</button>
      </td>
    `;
    body.appendChild(tr);
  });

  // Cargar técnicos y tipos de MO
  loadTechsAndKindsForEditModal().then(() => {
    commissions.forEach((c, idx) => {
      const techSelect = body.querySelector(`.ecv-comm-technician[data-idx="${idx}"]`);
      const kindSelect = body.querySelector(`.ecv-comm-kind[data-idx="${idx}"]`);
      if (techSelect && c.technician) {
        techSelect.value = c.technician;
      }
      if (kindSelect && c.kind) {
        kindSelect.value = c.kind;
      }
    });
  });

  // Event listeners para calcular participación
  body.querySelectorAll('.ecv-comm-labor-value, .ecv-comm-percent').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.dataset.idx);
      updateCommissionShare(idx);
    });
  });
}

async function loadAccountsForEditModal() {
  try {
    const accounts = await API.accounts.list();
    const selects = document.querySelectorAll('.ecv-payment-account');
    selects.forEach(select => {
      const currentValue = select.value;
      select.innerHTML = '<option value="">Seleccionar cuenta</option>';
      if (Array.isArray(accounts)) {
        accounts.forEach(acc => {
          const option = document.createElement('option');
          option.value = acc._id;
          option.textContent = acc.name || 'Sin nombre';
          select.appendChild(option);
        });
      }
      if (currentValue) select.value = currentValue;
    });
  } catch (err) {
    console.error('Error loading accounts:', err);
  }
}

async function loadTechsAndKindsForEditModal() {
  const techSelects = document.querySelectorAll('.ecv-comm-technician');
  const kindSelects = document.querySelectorAll('.ecv-comm-kind');

  // Cargar técnicos
  techSelects.forEach(select => {
    const currentValue = select.value;
    select.innerHTML = '<option value="">Seleccionar técnico</option>';
    companyTechnicians.forEach(tech => {
      const option = document.createElement('option');
      option.value = tech;
      option.textContent = tech;
      select.appendChild(option);
    });
    if (currentValue) select.value = currentValue;
  });

  // Cargar tipos de MO
  const kinds = techConfig?.laborKinds || [];
  kindSelects.forEach(select => {
    const currentValue = select.value;
    select.innerHTML = '<option value="">Seleccionar tipo</option>';
    kinds.forEach(kind => {
      const option = document.createElement('option');
      option.value = kind;
      option.textContent = kind;
      select.appendChild(option);
    });
    if (currentValue) select.value = currentValue;
  });
}

function updateEditPaymentsSummary(payments) {
  const summary = document.getElementById('ecv-payments-summary');
  if (!summary) return;
  
  const sum = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const total = Number(document.querySelector('#ecv-payments-block')?.closest('.space-y-4')?.querySelector('strong')?.textContent?.replace(/[^0-9]/g, '') || 0);
  
  summary.innerHTML = `
    <div class="flex justify-between items-center">
      <span class="text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Suma:</span>
      <span class="font-semibold ${Math.abs(sum - total) < 0.01 ? 'text-green-400' : 'text-red-400'}">${money(sum)}</span>
    </div>
  `;
}

function updateCommissionShare(idx) {
  const row = document.querySelector(`.ecv-comm-labor-value[data-idx="${idx}"]`)?.closest('tr');
  if (!row) return;
  
  const laborValue = Number(row.querySelector('.ecv-comm-labor-value')?.value || 0);
  const percent = Number(row.querySelector('.ecv-comm-percent')?.value || 0);
  const share = Math.round(laborValue * percent / 100);
  
  const shareEl = row.querySelector('.ecv-comm-share');
  if (shareEl) shareEl.textContent = money(share);
}

function setupEditCloseModalListeners(sale, payments, commissions) {
  const saleId = sale._id;
  const msg = document.getElementById('ecv-msg');
  
  // Agregar pago
  document.getElementById('ecv-add-payment')?.addEventListener('click', () => {
    payments.push({ method: '', amount: 0, accountId: null });
    renderEditPayments(payments);
    setupEditCloseModalListeners(sale, payments, commissions);
  });

  // Remover pago
  document.querySelectorAll('.ecv-remove-payment').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      payments.splice(idx, 1);
      renderEditPayments(payments);
      setupEditCloseModalListeners(sale, payments, commissions);
    });
  });

  // Actualizar pago - método
  document.querySelectorAll('.ecv-payment-method').forEach(select => {
    select.addEventListener('change', () => {
      const idx = parseInt(select.dataset.idx);
      const customInput = document.querySelector(`.ecv-payment-method-custom[data-idx="${idx}"]`);
      if (select.value === '__CUSTOM__') {
        if (customInput) customInput.classList.remove('hidden');
        payments[idx].method = customInput?.value || '';
      } else {
        if (customInput) customInput.classList.add('hidden');
        payments[idx].method = select.value || '';
      }
      updateEditPaymentsSummary(payments);
    });
  });

  // Actualizar pago - método personalizado
  document.querySelectorAll('.ecv-payment-method-custom').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.dataset.idx);
      payments[idx].method = input.value;
      updateEditPaymentsSummary(payments);
    });
  });

  // Actualizar pago - monto
  document.querySelectorAll('.ecv-payment-amount').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.dataset.idx);
      payments[idx].amount = Number(input.value) || 0;
      updateEditPaymentsSummary(payments);
    });
  });

  document.querySelectorAll('.ecv-payment-account').forEach(select => {
    select.addEventListener('change', () => {
      const idx = parseInt(select.dataset.idx);
      payments[idx].accountId = select.value || null;
    });
  });

  // Agregar comisión
  document.getElementById('ecv-add-commission')?.addEventListener('click', () => {
    commissions.push({ technician: '', kind: '', laborValue: 0, percent: 0, share: 0 });
    renderEditCommissions(commissions);
    setupEditCloseModalListeners(sale, payments, commissions);
  });

  // Remover comisión
  document.querySelectorAll('.ecv-remove-commission').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      commissions.splice(idx, 1);
      renderEditCommissions(commissions);
      setupEditCloseModalListeners(sale, payments, commissions);
    });
  });

  // Actualizar comisión
  document.querySelectorAll('.ecv-comm-technician, .ecv-comm-kind').forEach(select => {
    select.addEventListener('change', () => {
      const idx = parseInt(select.dataset.idx);
      if (select.classList.contains('ecv-comm-technician')) {
        commissions[idx].technician = select.value;
      } else if (select.classList.contains('ecv-comm-kind')) {
        commissions[idx].kind = select.value;
      }
    });
  });

  // Confirmar guardado
  document.getElementById('ecv-confirm')?.addEventListener('click', async () => {
    if (!msg) return;
    msg.textContent = 'Procesando...';
    msg.classList.remove('error');

    // Validar suma de pagos
    const sum = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const total = Number(document.querySelector('#ecv-payments-block')?.closest('.space-y-4')?.querySelector('strong')?.textContent?.replace(/[^0-9]/g, '') || 0);
    
    if (Math.abs(sum - total) > 0.01) {
      msg.textContent = 'La suma de pagos no coincide con el total.';
      msg.classList.add('error');
      return;
    }

    const filtered = payments.filter(p => p.method && p.amount > 0);
    if (!filtered.length) {
      msg.textContent = 'Agregar al menos una forma de pago válida';
      msg.classList.add('error');
      return;
    }

    try {
      let receiptUrl = sale.paymentReceiptUrl || '';
      const file = document.getElementById('ecv-receipt')?.files?.[0];
      if (file) {
        const uploadRes = await API.mediaUpload ? API.mediaUpload([file]) : null;
        if (uploadRes && uploadRes.files && uploadRes.files[0]) {
          receiptUrl = uploadRes.files[0].url || uploadRes.files[0].path || '';
        }
      }

      // Construir comisiones desde la tabla
      const comm = [];
      const commBody = document.getElementById('ecv-comm-body');
      if (commBody) {
        commBody.querySelectorAll('tr').forEach(tr => {
          const techSelect = tr.querySelector('.ecv-comm-technician');
          const kindSelect = tr.querySelector('.ecv-comm-kind');
          const laborValueInput = tr.querySelector('.ecv-comm-labor-value');
          const percentInput = tr.querySelector('.ecv-comm-percent');
          
          if (techSelect && techSelect.value && (laborValueInput?.value || percentInput?.value)) {
            const laborValue = Number(laborValueInput?.value || 0);
            const percent = Number(percentInput?.value || 0);
            comm.push({
              technician: techSelect.value,
              kind: kindSelect?.value || '',
              laborValue,
              percent,
              share: Math.round(laborValue * percent / 100)
            });
          }
        });
      }

      const payload = {
        paymentMethods: filtered.map(p => {
          const method = String(p.method || '').toUpperCase();
          const isCredit = method === 'CREDITO' || method === 'CRÉDITO';
          return {
            method: p.method,
            amount: Number(p.amount) || 0,
            accountId: isCredit ? null : (p.accountId || null)
          };
        }),
        laborCommissions: comm,
        paymentReceiptUrl: receiptUrl
      };

      await API.sales.updateClose(saleId, payload);
      msg.textContent = 'Venta actualizada correctamente';
      msg.classList.remove('error');
      
      setTimeout(() => {
        document.getElementById('modal')?.classList.add('hidden');
        // Recargar historial si estamos en esa vista
        if (!document.getElementById('sales-view-historial')?.classList.contains('hidden')) {
          loadHistorial();
        }
      }, 1500);

    } catch (e) {
      msg.textContent = e?.message || 'Error al actualizar';
      msg.classList.add('error');
    }
  });

  // Actualizar estado del comprobante
  document.getElementById('ecv-receipt')?.addEventListener('change', (e) => {
    const status = document.getElementById('ecv-receipt-status');
    if (status) {
      if (e.target.files && e.target.files.length > 0) {
        status.textContent = `Archivo seleccionado: ${e.target.files[0].name}`;
      } else {
        status.textContent = sale.paymentReceiptUrl ? `<a href="${sale.paymentReceiptUrl}" target="_blank" class="text-blue-400 hover:text-blue-300">Ver comprobante actual</a>` : 'Sin archivos seleccionados';
      }
    }
  });
}





