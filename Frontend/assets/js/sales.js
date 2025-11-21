import { API } from './api.esm.js';
import { loadFeatureOptionsAndRestrictions, getFeatureOptions, gateElement } from './feature-gating.js';

const $  = (s, r=document)=>r.querySelector(s);
const clone = (id)=>document.getElementById(id)?.content?.firstElementChild?.cloneNode(true);
const money = (n)=> new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));

// Cache global para PriceEntry (inicializar una sola vez al cargar el módulo)
if (typeof window !== 'undefined') {
  if (!window.priceEntryCache) {
    window.priceEntryCache = new Map();
  }
  if (!window.priceEntryErrors) {
    window.priceEntryErrors = new Set();
  }
  if (!window.priceEntryPending) {
    window.priceEntryPending = new Map(); // Promesas pendientes para evitar llamadas duplicadas
  }
}

// Función helper global para obtener PriceEntry con cache
async function getPriceEntryCached(refId) {
  if (!refId) return null;
  const refIdStr = String(refId);
  
  // Si ya está en cache, retornar inmediatamente
  if (window.priceEntryCache.has(refIdStr)) {
    return window.priceEntryCache.get(refIdStr);
  }
  
  // Si ya sabemos que hay un error, no intentar de nuevo
  if (window.priceEntryErrors.has(refIdStr)) {
    return null;
  }
  
  // Si hay una llamada pendiente para este ID, esperar a que termine
  if (window.priceEntryPending.has(refIdStr)) {
    try {
      return await window.priceEntryPending.get(refIdStr);
    } catch {
      return null;
    }
  }
  
  // Crear una nueva promesa para esta llamada
  const promise = (async () => {
    try {
      const pe = await API.prices.get(refId);
      if (pe && pe._id) {
        // Guardar en cache
        window.priceEntryCache.set(refIdStr, pe);
        return pe;
      }
      return null;
    } catch (err) {
      // Detectar 404 por mensaje o status (api.js lanza Error con message, no status)
      const errorMsg = String(err?.message || err || '').toLowerCase();
      const is404 = err?.status === 404 || 
                    errorMsg.includes('404') || 
                    errorMsg.includes('not found') || 
                    errorMsg.includes('priceentry not found') ||
                    errorMsg.includes('price entry not found') ||
                    errorMsg.includes('no encontrado') ||
                    errorMsg.includes('no existe');
      
      if (is404) {
        window.priceEntryErrors.add(refIdStr);
        // Solo loguear una vez para evitar spam en consola
        if (!window.priceEntryErrorsLogged) {
          window.priceEntryErrorsLogged = new Set();
        }
        if (!window.priceEntryErrorsLogged.has(refIdStr)) {
          window.priceEntryErrorsLogged.add(refIdStr);
          console.warn(`[PriceEntry Cache] No se encontró PriceEntry ${refIdStr}, evitando futuros intentos`);
        }
      } else {
        // Para otros errores, solo loguear pero no cachear el error (puede ser temporal)
        console.warn(`[PriceEntry Cache] Error al obtener PriceEntry ${refIdStr}:`, err);
      }
      return null;
    } finally {
      // Limpiar la promesa pendiente
      window.priceEntryPending.delete(refIdStr);
    }
  })();
  
  // Guardar la promesa pendiente
  window.priceEntryPending.set(refIdStr, promise);
  
  return await promise;
}
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
    const modalScript = `
      <script>
        (function() {
          function showModal() {
            if (!document.body) {
              setTimeout(showModal, 50);
              return;
            }
            
            const pageSize = 'MEDIA CARTA (5.5" x 8.5")';
            const modal = document.createElement('div');
            modal.id = 'page-size-modal';
            modal.style.cssText = 'position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);';
            modal.innerHTML = \`
              <div style="background: linear-gradient(to bottom right, #1e293b, #0f172a); border: 1px solid rgba(148, 163, 184, 0.5); border-radius: 1rem; padding: 2rem; max-width: 28rem; width: 100%; margin: 1rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); transform: scale(0.95); transition: transform 0.2s ease-in-out;">
                <div style="text-align: center; margin-bottom: 1.5rem;">
                  <div style="display: inline-flex; align-items: center; justify-content: center; width: 4rem; height: 4rem; background: rgba(59, 130, 246, 0.2); border-radius: 9999px; margin-bottom: 1rem;">
                    <svg style="width: 2rem; height: 2rem; color: #60a5fa;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                  </div>
                  <h3 style="font-size: 1.5rem; font-weight: 700; color: white; margin-bottom: 0.5rem;">Tamaño de Hoja Requerido</h3>
                </div>
                <div style="background: rgba(51, 65, 85, 0.3); border: 1px solid rgba(100, 116, 139, 0.3); border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1.5rem;">
                  <div style="text-align: center;">
                    <div style="font-size: 1.875rem; font-weight: 700; color: #60a5fa; margin-bottom: 0.5rem;">\${pageSize}</div>
                    <p style="font-size: 0.875rem; color: #cbd5e1; margin-top: 0.5rem;">
                      Asegúrate de configurar tu impresora con este tamaño antes de imprimir.
                    </p>
                  </div>
                </div>
                <div style="display: flex; gap: 0.75rem;">
                  <button id="page-size-cancel" style="flex: 1; padding: 0.75rem 1rem; background: rgba(51, 65, 85, 0.5); border: 1px solid rgba(100, 116, 139, 0.5); border-radius: 0.5rem; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                    Cancelar
                  </button>
                  <button id="page-size-accept" style="flex: 1; padding: 0.75rem 1rem; background: linear-gradient(to right, #2563eb, #1d4ed8); border: none; border-radius: 0.5rem; color: white; font-weight: 600; cursor: pointer; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); transition: all 0.2s;">
                    Aceptar
                  </button>
                </div>
              </div>
            \`;
            document.body.appendChild(modal);
            const modalContent = modal.querySelector('div > div');
            const acceptBtn = document.getElementById('page-size-accept');
            const cancelBtn = document.getElementById('page-size-cancel');
            const closeModal = () => {
              modal.style.opacity = '0';
              if (modalContent) modalContent.style.transform = 'scale(0.95)';
              setTimeout(() => modal.remove(), 200);
            };
            acceptBtn.onclick = () => {
              closeModal();
              setTimeout(() => window.print(), 100);
            };
            cancelBtn.onclick = () => {
              closeModal();
              window.close();
            };
            setTimeout(() => {
              modal.style.opacity = '1';
              if (modalContent) modalContent.style.transform = 'scale(1)';
            }, 10);
          }
          
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showModal);
          } else {
            setTimeout(showModal, 100);
          }
        })();
      </script>
    `;
            win.document.write(`<!doctype html><html><head><meta charset='utf-8'><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">${modalScript}</head><body><pre>${txt}</pre></body></html>`);
    win.document.close(); win.focus();
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
            
            // Función para mostrar modal de tamaño de hoja en la ventana de impresión
            const modalScript = `
              <script>
                (function() {
                  function showModal() {
                    // Verificar que el body existe
                    if (!document.body) {
                      setTimeout(showModal, 50);
                      return;
                    }
                    
                    // Determinar tamaño de página dinámicamente
                    const body = document.body;
                    const html = document.documentElement;
                    // Calcular altura del contenido de manera más precisa
                    // Media carta: 5.5" x 8.5" = 139.7mm x 215.9mm
                    // Con margen de 2.5mm arriba y abajo: altura útil = 215.9mm - 5mm = 210.9mm ≈ 795px (a 96 DPI)
                    // Usar un valor conservador de 750px para asegurar que realmente quepa
                    const contentHeight = Math.max(
                      body?.scrollHeight || 0, body?.offsetHeight || 0, html?.clientHeight || 0, html?.scrollHeight || 0, html?.offsetHeight || 0
                    );
                    const mediaCartaMaxHeight = 750; // Reducido para asegurar que realmente quepa en media carta
                    const isMediaCarta = contentHeight <= mediaCartaMaxHeight;
                    const pageSize = isMediaCarta ? 'MEDIA CARTA (5.5" x 8.5")' : 'CARTA COMPLETA (8.5" x 11")';
                    
                    const modal = document.createElement('div');
                    modal.id = 'page-size-modal';
                    modal.style.cssText = 'position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);';
                    modal.innerHTML = \`
                    <div style="background: linear-gradient(to bottom right, #1e293b, #0f172a); border: 1px solid rgba(148, 163, 184, 0.5); border-radius: 1rem; padding: 2rem; max-width: 28rem; width: 100%; margin: 1rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); transform: scale(0.95); transition: transform 0.2s ease-in-out;">
                      <div style="text-align: center; margin-bottom: 1.5rem;">
                        <div style="display: inline-flex; align-items: center; justify-content: center; width: 4rem; height: 4rem; background: rgba(59, 130, 246, 0.2); border-radius: 9999px; margin-bottom: 1rem;">
                          <svg style="width: 2rem; height: 2rem; color: #60a5fa;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                          </svg>
                        </div>
                        <h3 style="font-size: 1.5rem; font-weight: 700; color: white; margin-bottom: 0.5rem;">Tamaño de Hoja Requerido</h3>
                      </div>
                      <div style="background: rgba(51, 65, 85, 0.3); border: 1px solid rgba(100, 116, 139, 0.3); border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1.5rem;">
                        <div style="text-align: center;">
                          <div style="font-size: 1.875rem; font-weight: 700; color: #60a5fa; margin-bottom: 0.5rem;">\${pageSize}</div>
                          <p style="font-size: 0.875rem; color: #cbd5e1; margin-top: 0.5rem;">
                            Asegúrate de configurar tu impresora con este tamaño antes de imprimir.
                          </p>
                        </div>
                      </div>
                      <div style="display: flex; gap: 0.75rem;">
                        <button id="page-size-cancel" style="flex: 1; padding: 0.75rem 1rem; background: rgba(51, 65, 85, 0.5); border: 1px solid rgba(100, 116, 139, 0.5); border-radius: 0.5rem; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                          Cancelar
                        </button>
                        <button id="page-size-accept" style="flex: 1; padding: 0.75rem 1rem; background: linear-gradient(to right, #2563eb, #1d4ed8); border: none; border-radius: 0.5rem; color: white; font-weight: 600; cursor: pointer; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); transition: all 0.2s;">
                          Aceptar
                        </button>
                      </div>
                    </div>
                  \`;
                  document.body.appendChild(modal);
                  
                  const modalContent = modal.querySelector('div > div');
                  const acceptBtn = document.getElementById('page-size-accept');
                  const cancelBtn = document.getElementById('page-size-cancel');
                  
                  const closeModal = () => {
                    modal.style.opacity = '0';
                    if (modalContent) {
                      modalContent.style.transform = 'scale(0.95)';
                    }
                    setTimeout(() => {
                      modal.remove();
                    }, 200);
                  };
                  
                  acceptBtn.onclick = () => {
                    closeModal();
                    setTimeout(() => {
                      window.print();
                    }, 100);
                  };
                  
                  cancelBtn.onclick = () => {
                    closeModal();
                    window.close();
                  };
                  
                    // Animación de entrada
                    setTimeout(() => {
                      modal.style.opacity = '1';
                      if (modalContent) {
                        modalContent.style.transform = 'scale(1)';
                      }
                    }, 10);
                  }
                  
                  // Intentar mostrar el modal inmediatamente, o esperar a que el DOM esté listo
                  if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', showModal);
                  } else {
                    setTimeout(showModal, 100);
                  }
                })();
              </script>
            `;
            
            win.document.write(`<!doctype html><html><head><meta charset='utf-8'><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">${css}${debugScript}${modalScript}
              <style>
                /* Estilos base para mejor uso del espacio y centrado */
                * {
                  box-sizing: border-box;
                }
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
                  width: 100%;
                  overflow-x: hidden;
                }
                
                /* Contenedor centrado para el contenido de la remisión */
                .remission-wrapper {
                  max-width: 720px;
                  width: 100%;
                  min-width: 0;
                  margin: 0 auto;
                  position: relative;
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
                  
                  /* Estilos para cuadros de datos del cliente y empresa */
                  .client-data-box,
                  .company-data-box {
                    position: absolute !important;
                    border: 2px solid #000 !important;
                    padding: 6px !important;
                    background: white !important;
                    z-index: 10 !important;
                    page-break-inside: avoid !important;
                    overflow: visible !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                  }
                  .client-data-box {
                    left: 19px !important;
                    top: 83px !important;
                    width: 240px !important;
                  }
                  .company-data-box {
                    right: 19px !important;
                    top: 83px !important;
                    width: 240px !important;
                  }
                  .client-data-box table,
                  .company-data-box table {
                    width: 100% !important;
                    border-collapse: collapse !important;
                    font-size: 11px !important;
                  }
                  .client-data-box table,
                  .company-data-box table {
                    margin-top: 2px !important;
                  }
                  .client-data-box td,
                  .company-data-box td {
                    border: 1px solid #000 !important;
                    padding: 5px 4px !important;
                  }
                }
              </style>
            </head><body><div class="remission-wrapper">${r.rendered}</div></body></html>`);
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
              const mediaCartaMaxHeight = 750; // px - Reducido para asegurar que realmente quepa en media carta
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
                // Usar media carta (half-letter) con márgenes mínimos superiores (0.25 cm = 2.5mm)
                pageSizeStyle.textContent = `
                  @page {
                    size: 5.5in 8.5in;
                    margin-top: 2.5mm;
                    margin-bottom: 2.5mm;
                    margin-left: 5mm;
                    margin-right: 5mm;
                  }
                  @media print {
                    body {
                      margin: 0 !important;
                      padding-top: 2.5mm !important;
                      padding-bottom: 2.5mm !important;
                      padding-left: 5mm !important;
                      padding-right: 5mm !important;
                      max-height: 210.9mm !important;
                      display: flex !important;
                      justify-content: center !important;
                      align-items: flex-start !important;
                    }
                    .remission-wrapper {
                      max-width: 720px !important;
                      width: 100% !important;
                      min-width: 0 !important;
                      margin: 0 auto !important;
                      position: relative !important;
                      padding: 0 5mm !important;
                    }
                    /* Asegurar que la tabla de items tenga el mismo ancho que los cuadros de datos */
                    .items-table {
                      width: 682px !important;
                      max-width: 682px !important;
                    }
                    /* Estilos para cuadros de datos del cliente y empresa */
                    .client-data-box,
                    .company-data-box {
                      position: absolute !important;
                      border: 2px solid #000 !important;
                      padding: 8px !important;
                      background: white !important;
                      z-index: 10 !important;
                      page-break-inside: avoid !important;
                      overflow: visible !important;
                      visibility: visible !important;
                      opacity: 1 !important;
                      max-width: calc(50% - 5px) !important;
                      box-sizing: border-box !important;
                    }
                    .client-data-box {
                      left: 5mm !important;
                      top: 83px !important;
                      width: calc(50% - 5px) !important;
                      margin-right: 5px !important;
                    }
                    .company-data-box {
                      right: 5mm !important;
                      left: auto !important;
                      top: 83px !important;
                      width: calc(50% - 5px) !important;
                      margin-left: 5px !important;
                    }
                    .client-data-box table,
                    .company-data-box table {
                      width: 100% !important;
                      border-collapse: collapse !important;
                      font-size: 11px !important;
                      margin-top: 2px !important;
                    }
                    .client-data-box td,
                    .company-data-box td {
                      border: 1px solid #000 !important;
                      padding: 5px 4px !important;
                    }
                    * {
                      box-sizing: border-box !important;
                    }
                  }
                `;
                console.log('[printSaleTicket] ✅ Configurado para MEDIA CARTA (5.5" x 8.5") con márgenes superiores de 0.25cm');
              } else {
                // Usar carta completa con márgenes mínimos superiores (0.25 cm = 2.5mm)
                pageSizeStyle.textContent = `
                  @page {
                    size: letter;
                    margin-top: 2.5mm;
                    margin-bottom: 2.5mm;
                    margin-left: 5mm;
                    margin-right: 5mm;
                  }
                  @media print {
                    body {
                      margin: 0 !important;
                      padding-top: 2.5mm !important;
                      padding-bottom: 2.5mm !important;
                      padding-left: 5mm !important;
                      padding-right: 5mm !important;
                      max-height: 274mm !important;
                      display: flex !important;
                      justify-content: center !important;
                      align-items: flex-start !important;
                    }
                    .remission-wrapper {
                      max-width: 720px !important;
                      width: 100% !important;
                      min-width: 0 !important;
                      margin: 0 auto !important;
                      position: relative !important;
                      padding: 0 5mm !important;
                    }
                    /* Asegurar que la tabla de items tenga el mismo ancho que los cuadros de datos */
                    .items-table {
                      width: 682px !important;
                      max-width: 682px !important;
                    }
                    /* Estilos para cuadros de datos del cliente y empresa */
                    .client-data-box,
                    .company-data-box {
                      position: absolute !important;
                      border: 2px solid #000 !important;
                      padding: 8px !important;
                      background: white !important;
                      z-index: 10 !important;
                      page-break-inside: avoid !important;
                      overflow: visible !important;
                      visibility: visible !important;
                      opacity: 1 !important;
                      max-width: calc(50% - 5px) !important;
                      box-sizing: border-box !important;
                    }
                    .client-data-box {
                      left: 5mm !important;
                      top: 83px !important;
                      width: calc(50% - 5px) !important;
                      margin-right: 5px !important;
                    }
                    .company-data-box {
                      right: 5mm !important;
                      left: auto !important;
                      top: 83px !important;
                      width: calc(50% - 5px) !important;
                      margin-left: 5px !important;
                    }
                    .client-data-box table,
                    .company-data-box table {
                      width: 100% !important;
                      border-collapse: collapse !important;
                      font-size: 11px !important;
                      margin-top: 2px !important;
                    }
                    .client-data-box td,
                    .company-data-box td {
                      border: 1px solid #000 !important;
                      padding: 5px 4px !important;
                    }
                    * {
                      box-sizing: border-box !important;
                    }
                  }
                `;
                console.log('[printSaleTicket] ✅ Configurado para CARTA COMPLETA (8.5" x 11") con márgenes superiores de 0.25cm');
              }
            };
            
            // NOTA: El total ahora está dentro de la tabla como tfoot, así que ya no necesitamos ajustar posición separada
            // Solo detectar y configurar el tamaño de página
            win.addEventListener('DOMContentLoaded', () => {
              // Detectar y configurar tamaño de página después de que se renderice el contenido
              setTimeout(detectAndSetPageSize, 100);
              setTimeout(detectAndSetPageSize, 500);
            });
            
            // También ajustar cuando la ventana se carga completamente
            win.addEventListener('load', () => {
              setTimeout(detectAndSetPageSize, 100);
              setTimeout(detectAndSetPageSize, 500);
            });
            
            // CRÍTICO: Detectar tamaño de página justo antes de imprimir
            win.addEventListener('beforeprint', () => {
              console.log('[printSaleTicket] Evento beforeprint - detectando tamaño de página...');
              detectAndSetPageSize();
            });
            
            // El modal ya está en la página de impresión, solo necesitamos detectar tamaño
            win.focus();
            
            // Esperar a que se cargue y detectar tamaño
            setTimeout(() => {
              detectAndSetPageSize();
              
              // Esperar un poco más para asegurar que todo esté renderizado
              setTimeout(() => {
                detectAndSetPageSize();
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
    const modalScript = `
      <script>
        (function() {
          const pageSize = 'MEDIA CARTA (5.5" x 8.5")';
          const modal = document.createElement('div');
          modal.id = 'page-size-modal';
          modal.style.cssText = 'position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);';
          modal.innerHTML = \`
            <div style="background: linear-gradient(to bottom right, #1e293b, #0f172a); border: 1px solid rgba(148, 163, 184, 0.5); border-radius: 1rem; padding: 2rem; max-width: 28rem; width: 100%; margin: 1rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); transform: scale(0.95); transition: transform 0.2s ease-in-out;">
              <div style="text-align: center; margin-bottom: 1.5rem;">
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 4rem; height: 4rem; background: rgba(59, 130, 246, 0.2); border-radius: 9999px; margin-bottom: 1rem;">
                  <svg style="width: 2rem; height: 2rem; color: #60a5fa;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                </div>
                <h3 style="font-size: 1.5rem; font-weight: 700; color: white; margin-bottom: 0.5rem;">Tamaño de Hoja Requerido</h3>
              </div>
              <div style="background: rgba(51, 65, 85, 0.3); border: 1px solid rgba(100, 116, 139, 0.3); border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1.5rem;">
                <div style="text-align: center;">
                  <div style="font-size: 1.875rem; font-weight: 700; color: #60a5fa; margin-bottom: 0.5rem;">\${pageSize}</div>
                  <p style="font-size: 0.875rem; color: #cbd5e1; margin-top: 0.5rem;">
                    Asegúrate de configurar tu impresora con este tamaño antes de imprimir.
                  </p>
                </div>
              </div>
              <div style="display: flex; gap: 0.75rem;">
                <button id="page-size-cancel" style="flex: 1; padding: 0.75rem 1rem; background: rgba(51, 65, 85, 0.5); border: 1px solid rgba(100, 116, 139, 0.5); border-radius: 0.5rem; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                  Cancelar
                </button>
                <button id="page-size-accept" style="flex: 1; padding: 0.75rem 1rem; background: linear-gradient(to right, #2563eb, #1d4ed8); border: none; border-radius: 0.5rem; color: white; font-weight: 600; cursor: pointer; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); transition: all 0.2s;">
                  Aceptar
                </button>
              </div>
            </div>
          \`;
            document.body.appendChild(modal);
            const modalContent = modal.querySelector('div > div');
            const acceptBtn = document.getElementById('page-size-accept');
            const cancelBtn = document.getElementById('page-size-cancel');
            const closeModal = () => {
              modal.style.opacity = '0';
              if (modalContent) modalContent.style.transform = 'scale(0.95)';
              setTimeout(() => modal.remove(), 200);
            };
            acceptBtn.onclick = () => {
              closeModal();
              setTimeout(() => window.print(), 100);
            };
            cancelBtn.onclick = () => {
              closeModal();
              window.close();
            };
            setTimeout(() => {
              modal.style.opacity = '1';
              if (modalContent) modalContent.style.transform = 'scale(1)';
            }, 10);
          }
          
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showModal);
          } else {
            setTimeout(showModal, 100);
          }
        })();
      </script>
    `;
    win.document.write(`<!doctype html><html><head><meta charset='utf-8'>${modalScript}</head><body><pre>${lines.join('\n')}</pre></body></html>`);
    win.document.close(); win.focus();
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
            win.document.write(`<!doctype html><html><head><meta charset='utf-8'><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">${css}
              <style>
                /* Estilos base para mejor uso del espacio */
                * {
                  box-sizing: border-box;
                }
                body {
                  margin: 0;
                  padding: 10mm;
                  font-family: Arial, sans-serif;
                  font-size: 12px;
                  line-height: 1.4;
                  color: #000;
                  width: 100%;
                  overflow-x: hidden;
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
                  
                  /* Estilos para cuadros de datos del cliente y empresa */
                  .client-data-box,
                  .company-data-box {
                    position: absolute !important;
                    border: 2px solid #000 !important;
                    padding: 8px !important;
                    background: white !important;
                    z-index: 10 !important;
                    page-break-inside: avoid !important;
                    overflow: visible !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    max-width: calc(50% - 5px) !important;
                    box-sizing: border-box !important;
                  }
                  .client-data-box {
                    left: 0 !important;
                    top: 83px !important;
                    width: calc(50% - 5px) !important;
                    margin-right: 5px !important;
                  }
                  .company-data-box {
                    right: 0 !important;
                    left: auto !important;
                    top: 83px !important;
                    width: calc(50% - 5px) !important;
                    margin-left: 5px !important;
                  }
                  .client-data-box table,
                  .company-data-box table {
                    width: 100% !important;
                    border-collapse: collapse !important;
                    font-size: 11px !important;
                  }
                  .client-data-box table,
                  .company-data-box table {
                    margin-top: 2px !important;
                  }
                  .client-data-box td,
                  .company-data-box td {
                    border: 1px solid #000 !important;
                    padding: 5px 4px !important;
                  }
                }
              </style>
            </head><body><div class="remission-wrapper">${r.rendered}</div></body></html>`);
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
              const mediaCartaMaxHeight = 750; // px - Reducido para asegurar que realmente quepa en media carta
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
            
            // El modal ya está en la página de impresión, solo necesitamos configurar tamaño y detectar
            win.focus();
            
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
            
            // Esperar a que se cargue y detectar tamaño de página
            setTimeout(() => {
              detectAndSetPageSize();
              
              // Esperar un poco más para asegurar que todo esté renderizado
              setTimeout(() => {
                detectAndSetPageSize();
              }, 500);
            }, 1000);
            
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

// Función auxiliar para validar y refrescar la venta actual antes de operaciones
async function ensureCurrentSale() {
  if (!current || !current._id) {
    throw new Error('No hay venta activa. Por favor, crea una venta primero.');
  }
  
  // Asegurar que el ID es un string válido
  const saleId = String(current._id || '').trim();
  if (!saleId || saleId.length < 10) {
    console.error('ID de venta inválido:', current._id);
    current = null;
    await refreshOpenSales();
    throw new Error('ID de venta inválido. Por favor, crea una nueva venta.');
  }
  
  try {
    // Refrescar la venta actual para asegurar que tenemos el ID correcto y está abierta
    const freshSale = await API.sales.get(saleId);
    if (!freshSale) {
      console.error('Venta no encontrada en backend:', saleId);
      current = null;
      await refreshOpenSales();
      throw new Error('La venta no existe o fue cerrada. Por favor, crea una nueva venta.');
    }
    if (freshSale.status !== 'draft') {
      console.warn('Venta no está en estado draft:', freshSale.status);
      current = null;
      await refreshOpenSales();
      throw new Error('La venta ya fue cerrada. Por favor, crea una nueva venta.');
    }
    current = freshSale;
    syncCurrentIntoOpenList();
    return current;
  } catch (err) {
    if (err.message && (err.message.includes('No hay venta') || err.message.includes('no existe') || err.message.includes('cerrada') || err.message.includes('inválido'))) {
      throw err;
    }
    // Si es un error de red u otro, intentar continuar con la venta actual
    console.warn('Error al refrescar venta, continuando con venta actual:', err);
    // Aún así validar que tenemos un ID válido
    if (!current || !current._id) {
      throw new Error('No se pudo validar la venta. Por favor, crea una nueva venta.');
    }
    return current;
  }
}

// Función consolidada para renderizar todos los componentes (elimina duplicación)
let renderPending = false;
async function renderAll(options = {}) {
  const { skipQuote = false, includeMini = true } = options;
  if (renderPending) return; // Evitar renders simultáneos
  renderPending = true;
  
  try {
    renderTabs();
    renderSale();
    await renderWO();
    if (includeMini) renderMini();
    if (!skipQuote) {
      await renderQuoteForCurrentSale();
    }
  } finally {
    renderPending = false;
  }
}

async function refreshOpenSales(options = {}) {
  const { focusId = null, preferCurrent = null, skipRender = false } = options;
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
    
    if (!skipRender) {
      await renderAll();
    }
  } catch (err) {
    console.error('refreshOpenSales failed', err);
  }
}

// Optimizar auto-refresh: solo cuando la pestaña está visible
function startSalesAutoRefresh() {
  if (salesRefreshTimer) return;
  
  // Verificar visibilidad antes de refrescar
  const refreshIfVisible = () => {
    if (document.visibilityState === 'visible') {
      refreshOpenSales({ focusId: current?._id || null });
    }
  };
  
  salesRefreshTimer = setInterval(refreshIfVisible, 10000);
  
  // También refrescar cuando la pestaña se vuelve visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshIfVisible();
    }
  });
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
  // Usar función optimizada con cache para técnicos
  await loadTechnicians();
  
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
    // CRÍTICO: Leer valores directamente de los inputs para evitar problemas de sincronización
    // Sincronizar valores de inputs con objetos payments antes de calcular
    payments.forEach((p, idx) => {
      const rows = pmBody.querySelectorAll('tr');
      if (rows[idx]) {
        const amtInput = rows[idx].querySelector('input[data-role=amount]');
        if (amtInput) {
          // Limpiar el valor: remover cualquier carácter no numérico
          const rawValue = String(amtInput.value || '0').replace(/[^0-9]/g, '');
          const inputValue = Math.round(Number(rawValue) || 0);
          p.amount = inputValue;
          // Sincronizar el input con el valor limpio
          if (amtInput.value !== String(inputValue)) {
            amtInput.value = inputValue;
          }
        }
      }
    });
    
    // CRÍTICO: Calcular suma leyendo directamente de los inputs para garantizar precisión
    const rows = pmBody.querySelectorAll('tr');
    let sum = 0;
    rows.forEach((row) => {
      const amtInput = row.querySelector('input[data-role=amount]');
      if (amtInput) {
        // Limpiar y parsear el valor directamente del input
        const rawValue = String(amtInput.value || '0').replace(/[^0-9]/g, '');
        const amount = Math.round(Number(rawValue) || 0);
        sum += amount;
      }
    });
    
    const total = Math.round(Number(current?.total||0));
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
    amt.addEventListener('input', ()=>{ 
      // CRÍTICO: Limpiar el valor removiendo cualquier carácter no numérico
      const rawValue = String(amt.value || '0');
      // Remover cualquier carácter no numérico (incluyendo puntos, comas, espacios, etc.)
      const cleanValue = rawValue.replace(/[^0-9]/g, '');
      const numValue = Math.round(Number(cleanValue) || 0);
      pay.amount = numValue;
      // Asegurar que el input muestre el valor limpio
      if (amt.value !== String(numValue)) {
        amt.value = numValue;
      }
      recalc(); 
    });
    // También actualizar cuando el usuario sale del campo (blur)
    amt.addEventListener('blur', ()=>{ 
      // CRÍTICO: Limpiar el valor removiendo cualquier carácter no numérico
      const rawValue = String(amt.value || '0');
      const cleanValue = rawValue.replace(/[^0-9]/g, '');
      const numValue = Math.round(Number(cleanValue) || 0);
      pay.amount = numValue;
      amt.value = numValue; // Asegurar formato correcto
      recalc(); 
    });
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
    
    // Asegurar que el input muestre el valor correcto después de crear la fila
    const amtInput = tr.querySelector('input[data-role=amount]');
    if (amtInput && pay.amount) {
      amtInput.value = Math.round(Number(pay.amount) || 0);
      // Sincronizar el objeto payment con el valor del input
      pay.amount = Number(amtInput.value) || 0;
    }
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
    msg.classList.remove('error');
    
    // CRÍTICO: Refrescar la venta antes de cerrarla para obtener el total actualizado
    // Esto asegura que el total que validamos coincida con el que el backend calculará
    try {
      const freshSale = await API.sales.get(current._id);
      if (freshSale) {
        current = freshSale;
        syncCurrentIntoOpenList();
        // Asegurar que el total esté calculado correctamente
        if (!current.total && current.items && current.items.length > 0) {
          const calculatedSubtotal = current.items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
          current.total = Math.round(calculatedSubtotal);
        }
        console.log('[closeSale] Venta refrescada antes de cerrar:', {
          saleId: current._id,
          total: current.total,
          itemsCount: current.items?.length || 0,
          calculatedTotal: current.items?.reduce((sum, it) => sum + (Number(it.total) || 0), 0) || 0
        });
      }
    } catch (err) {
      console.warn('[closeSale] Error al refrescar venta, usando total actual:', err);
      // Si no se puede refrescar, calcular el total desde los items
      if (current && current.items && current.items.length > 0) {
        const calculatedSubtotal = current.items.reduce((sum, it) => sum + (Number(it.total) || 0), 0);
        current.total = Math.round(calculatedSubtotal);
        console.log('[closeSale] Total calculado desde items:', current.total);
      }
    }
    
    // CRÍTICO: Leer valores directamente de los inputs para evitar problemas de sincronización
    // Asegurar que todos los inputs tengan el valor correcto antes de calcular
    payments.forEach((p, idx) => {
      const row = pmBody.querySelectorAll('tr')[idx];
      if (row) {
        const amtInput = row.querySelector('input[data-role=amount]');
        if (amtInput) {
          // Limpiar el valor: remover cualquier carácter no numérico
          const rawValue = String(amtInput.value || '0').replace(/[^0-9]/g, '');
          const inputValue = Math.round(Number(rawValue) || 0);
          p.amount = inputValue;
          amtInput.value = inputValue; // Asegurar que el input muestre el valor correcto
        }
      }
    });
    
    // CRÍTICO: Calcular suma leyendo directamente de los inputs para garantizar precisión
    const rows = pmBody.querySelectorAll('tr');
    let sum = 0;
    rows.forEach((row) => {
      const amtInput = row.querySelector('input[data-role=amount]');
      if (amtInput) {
        // Limpiar y parsear el valor directamente del input
        const rawValue = String(amtInput.value || '0').replace(/[^0-9]/g, '');
        const amount = Math.round(Number(rawValue) || 0);
        sum += amount;
        console.log('Sumando pago desde input:', { amount, rawValue: amtInput.value });
      }
    });
    
    const total = Math.round(Number(current?.total||0));
    console.log('Validación de cierre:', { sum, total, diff: Math.abs(sum - total), paymentsCount: payments.length, rowsCount: rows.length });
    const diff = Math.abs(sum - total);
    if(diff > 0.01){ 
      msg.textContent=`La suma de pagos (${money(sum)}) no coincide con el total (${money(total)}). Diferencia: ${money(diff)}.`; 
      msg.classList.add('error');
      return; 
    }
    
    // CRÍTICO: Filtrar pagos leyendo directamente de los inputs, no del objeto payments
    // Esto asegura que solo se incluyan pagos con valores válidos en los inputs
    const filtered = [];
    rows.forEach((row, idx) => {
      const amtInput = row.querySelector('input[data-role=amount]');
      const methodSelect = row.querySelector('select[data-role=method]');
      if (amtInput && methodSelect) {
        const rawValue = String(amtInput.value || '0').replace(/[^0-9]/g, '');
        const amount = Math.round(Number(rawValue) || 0);
        const method = String(methodSelect.value || '').trim().toUpperCase();
        if (method && amount > 0) {
          // Sincronizar el objeto payment correspondiente
          if (payments[idx]) {
            payments[idx].amount = amount;
            payments[idx].method = method;
          }
          filtered.push(payments[idx] || { method, amount: amount, accountId: null });
        }
      }
    });
    if(!filtered.length){ 
      msg.textContent='Agregar al menos una forma de pago válida'; 
      msg.classList.add('error');
      return; 
    }
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
      
      // CRÍTICO: Leer valores directamente de los inputs para garantizar precisión
      // Ya filtramos usando los inputs, ahora solo necesitamos mapear y limpiar
      const paymentMethodsToSend = filtered.map(p=>{
        // Buscar la fila correspondiente al payment por índice
        const rowIndex = payments.indexOf(p);
        let finalAmount = Math.round(Number(p.amount) || 0);
        let method = String(p.method || '').toUpperCase();
        let accountId = p.accountId || null;
        
        // Si encontramos la fila, leer directamente del input para garantizar precisión
        if (rowIndex >= 0 && rowIndex < rows.length) {
          const row = rows[rowIndex];
          const amtInput = row.querySelector('input[data-role=amount]');
          const methodSelect = row.querySelector('select[data-role=method]');
          const accountSelect = row.querySelector('select[data-role=account]');
          
          if (amtInput) {
            // Limpiar y parsear el valor directamente del input
            const rawValue = String(amtInput.value || '0').replace(/[^0-9]/g, '');
            finalAmount = Math.round(Number(rawValue) || 0);
            // Sincronizar el objeto payment
            p.amount = finalAmount;
            // Asegurar que el input tenga el valor correcto
            amtInput.value = finalAmount;
          }
          
          if (methodSelect) {
            method = String(methodSelect.value || '').trim().toUpperCase();
            p.method = method;
          }
          
          if (accountSelect) {
            accountId = accountSelect.value || null;
            p.accountId = accountId;
          }
        }
        
        const isCredit = method === 'CREDITO';
        console.log('Preparando pago para enviar:', { method, amount: finalAmount, accountId, isCredit });
        return { 
          method: method, 
          amount: finalAmount, 
          accountId: isCredit ? null : accountId
        };
      });
      
      console.log('Payload de cierre:', { 
        paymentMethods: paymentMethodsToSend, 
        total: current?.total,
        sum: paymentMethodsToSend.reduce((a, p) => a + p.amount, 0)
      });
      
      const payload = {
        paymentMethods: paymentMethodsToSend,
        technician: techSel.value||'',
        laborValue: laborValueFromSale,
        laborPercent: laborPercentValue,
        laborCommissions: comm,
        paymentReceiptUrl: receiptUrl,
        total: total // Enviar el total para que el backend pueda validarlo
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
    await renderAll();
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

// Cache para técnicos (evita múltiples llamadas al backend)
let techniciansCache = null;
let techniciansCacheTime = 0;
const TECHNICIANS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function loadTechnicians(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && techniciansCache && (now - techniciansCacheTime) < TECHNICIANS_CACHE_TTL) {
    return techniciansCache;
  }
  
  try {
    const techs = await API.company.getTechnicians();
    companyTechnicians = Array.isArray(techs) ? techs.map(t => extractTechnicianName(t)).filter(n => n && n.trim() !== '') : [];
    techniciansCache = companyTechnicians;
    techniciansCacheTime = now;
    return companyTechnicians;
  } catch {
    companyTechnicians = [];
    techniciansCache = [];
    techniciansCacheTime = now;
    return [];
  }
}

async function setupTechnicianSelect(){
  const sel = document.getElementById('sales-technician');
  if(!sel) return;
  
  // Cargar lista dinámica si aún no cargada (con cache)
  if(!companyTechnicians.length){
    await loadTechnicians();
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
            techniciansCache = companyTechnicians; // Actualizar cache
            techniciansCacheTime = Date.now();
            await setupTechnicianSelect();
            // Reseleccionar el recién agregado si existe
            const upper = String(name).trim().toUpperCase();
            if(companyTechnicians.includes(upper)){
              sel.value = upper;
              if(current?._id){
                try{ 
                  current = await API.sales.setTechnician(current._id, upper); 
                  syncCurrentIntoOpenList(); 
                  renderCapsules(); 
                }catch{}
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
          // Usar slot.slotIndex que es el índice real del slot en el combo, no el índice del array filtrado
          await completeOpenSlotWithQR(current._id, slot.slotIndex, slot);
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
      // IMPORTANTE: Solo agregar items que REALMENTE son parte del combo
      // Los items del combo pueden tener:
      // - SKU que empieza con "CP-" (producto del combo sin vincular)
      // - source 'inventory' con refId que está en los productos del combo
      // Detener si encontramos:
      // - Otro combo
      // - Un item que NO es parte del combo (no tiene CP- ni refId del combo)
      
      // Obtener los refIds de los productos del combo para verificar
      let comboProductRefIds = new Set();
      if (it.refId) {
        // Usar cache para evitar múltiples llamadas
        const comboPE = await getPriceEntryCached(it.refId);
        if (comboPE && comboPE.comboProducts) {
          comboPE.comboProducts.forEach(cp => {
            if (cp.itemId && cp.itemId._id) {
              comboProductRefIds.add(String(cp.itemId._id));
            }
          });
        }
      }
      
      while (i < items.length) {
        const nextIt = items[i];
        const nextSku = String(nextIt.sku || '').toUpperCase();
        
        // Si encontramos otro combo, detener
        if (nextSku.startsWith('COMBO-')) {
          break;
        }
        
        // Si el SKU empieza con "CP-", es definitivamente parte del combo (sin importar el source)
        if (nextSku.startsWith('CP-')) {
          comboItems.push(nextIt);
          i++;
          continue;
        }
        
        // Si es un item de inventario y su refId está en los productos del combo
        if (nextIt.source === 'inventory' && nextIt.refId && comboProductRefIds.has(String(nextIt.refId))) {
          comboItems.push(nextIt);
          i++;
          continue;
        }
        
        // Si es un item con source 'price' pero tiene precio 0 y su nombre coincide con algún producto del combo
        // (productos del combo sin vincular que se agregaron como price)
        const nextPrice = Number(nextIt.unitPrice) || 0;
        if (nextIt.source === 'price' && nextPrice === 0 && nextIt.refId && 
            String(nextIt.refId) !== String(it.refId)) {
          // Verificar si el nombre coincide con algún producto del combo
          // Usar cache para evitar múltiples llamadas
          const comboPE = await getPriceEntryCached(it.refId);
          if (comboPE && comboPE.comboProducts) {
            const comboProductNames = new Set();
            comboPE.comboProducts.forEach(cp => {
              if (cp.name) {
                comboProductNames.add(String(cp.name).trim().toUpperCase());
              }
            });
            const nextName = String(nextIt.name || '').trim().toUpperCase();
            if (comboProductNames.has(nextName)) {
              comboItems.push(nextIt);
              i++;
              continue;
            }
          }
        }
        
        // Si llegamos aquí, el item NO es parte del combo
        // Detener para no agregar items independientes al combo
        break;
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
  
  // Función optimizada para actualizar venta y renderizar (evita llamadas redundantes)
  async function updateSaleAndRender(updateFn) {
    try {
      await updateFn();
      syncCurrentIntoOpenList();
      await renderAll();
    } catch (err) {
      console.error('Error updating sale:', err);
      alert(err?.message || 'Error al actualizar');
    }
  }

  function setupItemActions(tr, it) {
    const qty = tr.querySelector('.qty');
    // Debounce para cambios de cantidad
    let qtyTimeout = null;
    qty.addEventListener('change', async () => {
      clearTimeout(qtyTimeout);
      qtyTimeout = setTimeout(async () => {
        const v = Math.max(1, Number(qty.value || 1) || 1);
        await updateSaleAndRender(async () => {
          current = await API.sales.updateItem(current._id, it._id, { qty: v });
        });
      }, 300);
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
      await openEditPriceModal(it);
    };
    
    const btnZero = document.createElement('button');
    btnZero.textContent = 'Precio 0';
    btnZero.className = 'secondary';
    btnZero.style.cssText = 'padding: 6px 10px; font-size: 11px; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; font-weight: 500; background: rgba(100, 116, 139, 0.3); color: white;';
    btnZero.onclick = async () => {
      await updateSaleAndRender(async () => {
        current = await API.sales.updateItem(current._id, it._id, { unitPrice: 0 });
      });
    };
    
    const btnDel = tr.querySelector('button.remove');
    if (btnDel) {
      btnDel.style.cssText = 'padding: 6px 10px; font-size: 11px; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; font-weight: 500; background: rgba(239, 68, 68, 0.2); color: #fca5a5;';
      btnDel.onclick = async () => {
        if (!confirm('¿Eliminar este item?')) return;
        await updateSaleAndRender(async () => {
          await API.sales.removeItem(current._id, it._id);
          // Usar la respuesta del removeItem si está disponible, sino hacer get
          current = await API.sales.get(current._id);
        });
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
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // En móviles, no necesitamos enumerar dispositivos, solo usar cámara trasera automáticamente
        if (isMobile) {
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Cámara trasera (automática)';
          sel.replaceChildren(defaultOpt);
          sel.value = '';
          return; // Retornar temprano para móviles
        }
        
        // En desktop, intentar enumerar dispositivos
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput' && d.label);
          
          if (videoDevices.length === 0) {
            // Si no hay labels, crear opción por defecto
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = 'Cámara predeterminada';
            sel.replaceChildren(defaultOpt);
            sel.value = '';
            return;
          }
          
          sel.innerHTML = '<option value="">Seleccionar cámara...</option>';
          videoDevices.forEach((dev, idx) => {
            const opt = document.createElement('option');
            opt.value = dev.deviceId;
            opt.textContent = dev.label || `Cámara ${idx + 1}`;
            sel.appendChild(opt);
          });
          
          // Si solo hay una cámara, seleccionarla automáticamente
          if (videoDevices.length === 1) {
            sel.value = videoDevices[0].deviceId;
          }
        } catch (enumErr) {
          console.warn('Error al enumerar dispositivos:', enumErr);
          // Crear opción por defecto
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = 'Cámara predeterminada';
          sel.replaceChildren(defaultOpt);
          sel.value = '';
        }
      } catch (err) {
        console.warn('No se pudieron listar cámaras:', err);
        // Crear opción por defecto
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Cámara predeterminada';
        sel.replaceChildren(defaultOpt);
        sel.value = '';
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
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // Construir constraints de video - priorizar cámara trasera en móviles
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
      
      try {
        msg.textContent = 'Solicitando acceso a la cámara...';
        stream = await navigator.mediaDevices.getUserMedia(cs);
        
        // Configurar el video para móviles
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.srcObject = stream;
        
        // En móviles, esperar a que el video esté listo
        if (isMobile) {
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
            }, 10000);
          });
        } else {
          await video.play();
        }
        
        running = true;
        msg.textContent = `Escaneando para slot: "${slot.slotName}"...`;
        tickNative();
      } catch (err) {
        console.error('Error al iniciar cámara:', err);
        msg.textContent = 'Error al acceder a la cámara: ' + (err?.message || 'Desconocido');
        msg.style.color = 'var(--danger, #ef4444)';
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
        await renderAll();
        closeModal();
        
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
        
        // Mostrar popup de confirmación
        const popup = document.createElement('div');
        popup.textContent = '✓ Slot completado!';
        popup.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--success, #10b981);
          color: white;
          padding: 20px 40px;
          border-radius: 8px;
          font-size: 18px;
          font-weight: bold;
          z-index: 10000;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
          animation: fadeInOut 1.5s ease-in-out;
        `;
        document.body.appendChild(popup);
        setTimeout(() => {
          if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
          }
        }, 1500);
        
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
    
    // Cargar cámaras y luego iniciar automáticamente
    fillCams().then(() => {
      // Iniciar cámara automáticamente después de cargar la lista
      // start() manejará tanto si hay una cámara seleccionada como si no (usará cámara por defecto)
      setTimeout(() => {
        start();
      }, 100); // Pequeño delay para asegurar que el DOM esté listo
    }).catch(err => {
      console.warn('Error al cargar cámaras:', err);
      // Intentar iniciar sin selección específica (usará cámara por defecto)
      setTimeout(() => {
        start();
      }, 100);
    });
    
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

async function renderWO(){
  const b = document.getElementById('sv-wo-body'); if (!b) return;
  b.innerHTML = '';
  
  if (!current?.items || current.items.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="2" class="text-center py-4 text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay items en la orden de trabajo</td>`;
    b.appendChild(emptyRow);
    return;
  }
  
  const items = current.items || [];
  
  // Identificar combos consultando PriceEntry (usar cache global)
  
  const priceEntryIds = items
    .filter(item => item.source === 'price' && item.refId)
    .map(item => item.refId);
  
  let priceEntryMap = {};
  if (priceEntryIds.length > 0) {
    try {
      const priceEntries = await Promise.all(
        priceEntryIds.map(id => getPriceEntryCached(id))
      );
      priceEntries.forEach(pe => {
        if (pe && pe._id) {
          priceEntryMap[pe._id] = pe;
        }
      });
    } catch (e) {
      console.warn('Error fetching price entries:', e);
    }
  }
  
  // Identificar productos que son parte de combos (para excluirlos)
  const comboProductRefIds = new Set();
  Object.values(priceEntryMap).forEach(pe => {
    if (pe.type === 'combo' && pe.comboProducts && Array.isArray(pe.comboProducts)) {
      pe.comboProducts.forEach(cp => {
        if (cp.itemId) {
          comboProductRefIds.add(String(cp.itemId));
        }
      });
    }
  });
  
  // Agrupar items
  const combos = [];
  const products = [];
  const services = [];
  
  items.forEach(item => {
    // Verificar si es parte de un combo (producto anidado)
    const itemRefId = item.refId ? String(item.refId) : '';
    if (comboProductRefIds.has(itemRefId)) {
      // Es un producto anidado de un combo, no lo incluimos aquí
      return;
    }
    
    // Verificar si el SKU empieza con "CP-" (producto de combo)
    const sku = String(item.sku || '').toUpperCase();
    if (sku.startsWith('CP-')) {
      // Es un producto anidado de un combo, no lo incluimos aquí
      return;
    }
    
    // Clasificar el item
    if (item.source === 'price' && item.refId && priceEntryMap[item.refId]) {
      const pe = priceEntryMap[item.refId];
      if (pe.type === 'combo') {
        combos.push(item);
      } else if (pe.type === 'service') {
        services.push(item);
      } else {
        products.push(item);
      }
    } else if (item.source === 'inventory') {
      products.push(item);
    } else if (item.source === 'service') {
      services.push(item);
    } else {
      // Por defecto, tratar como servicio
      services.push(item);
    }
  });
  
  // Renderizar Combos primero (morado)
  if (combos.length > 0) {
    const headerRow = document.createElement('tr');
    headerRow.className = 'wo-section-header';
    headerRow.innerHTML = `
      <td colspan="2" class="py-2 px-1" style="background: #9333ea; color: white; border-bottom: 2px solid #7e22ce;">
        <div class="flex items-center gap-2">
          <span class="text-lg">🎁</span>
          <span class="font-semibold">Combos</span>
          <span class="text-xs opacity-90">(${combos.length})</span>
        </div>
      </td>
    `;
    b.appendChild(headerRow);
    
    combos.forEach(it => {
      const tr = document.createElement('tr');
      tr.className = 'wo-item wo-combo';
      tr.innerHTML = `
        <td class="py-1.5 px-1 text-white dark:text-white theme-light:text-slate-900">${it.name||''}</td>
        <td class="t-center py-1.5 px-1 text-white dark:text-white theme-light:text-slate-900 font-medium">${String(it.qty||1)}</td>
      `;
      b.appendChild(tr);
    });
  }
  
  // Renderizar Productos (verde)
  if (products.length > 0) {
    if (combos.length > 0) {
      const spacerRow = document.createElement('tr');
      spacerRow.innerHTML = `<td colspan="2" class="py-2"></td>`;
      b.appendChild(spacerRow);
    }
    
    const headerRow = document.createElement('tr');
    headerRow.className = 'wo-section-header';
    headerRow.innerHTML = `
      <td colspan="2" class="py-2 px-1" style="background: #22c55e; color: white; border-bottom: 2px solid #16a34a;">
        <div class="flex items-center gap-2">
          <span class="text-lg">📦</span>
          <span class="font-semibold">Productos</span>
          <span class="text-xs opacity-90">(${products.length})</span>
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
  
  // Renderizar Servicios (azul)
  if (services.length > 0) {
    if (combos.length > 0 || products.length > 0) {
      const spacerRow = document.createElement('tr');
      spacerRow.innerHTML = `<td colspan="2" class="py-2"></td>`;
      b.appendChild(spacerRow);
    }
    
    const headerRow = document.createElement('tr');
    headerRow.className = 'wo-section-header';
    headerRow.innerHTML = `
      <td colspan="2" class="py-2 px-1" style="background: #3b82f6; color: white; border-bottom: 2px solid #2563eb;">
        <div class="flex items-center gap-2">
          <span class="text-lg">🔧</span>
          <span class="font-semibold">Servicios</span>
          <span class="text-xs opacity-90">(${services.length})</span>
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
      // Validar y refrescar la venta antes de agregar
      await ensureCurrentSale();
      const saleId = String(current._id).trim();
      
      if (parsed.itemId){
        current = await API.sales.addItem(saleId, { source:'inventory', refId: parsed.itemId, qty:1 });
      } else {
        const candidate = (parsed.sku || text).toUpperCase();
        current = await API.sales.addItem(saleId, { source:'inventory', sku:candidate, qty:1 });
      }
      syncCurrentIntoOpenList();
      await renderAll();
      
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
async function openAddUnified(){
  console.log('openAddUnified llamada, current:', current);
  if (!current) {
    console.warn('No hay venta actual');
    alert('Crea primero una venta');
    return;
  }
  
  // Validar y refrescar la venta antes de abrir el modal
  try {
    await ensureCurrentSale();
  } catch (err) {
    alert(err.message || 'Error al validar la venta');
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
  
  // Si no hay vehicleId, mostrar solo precios generales
  const isGeneralOnly = !vehicleId;
  
  try {
    // Obtener información del vehículo si existe
    let vehicle = null;
    if (vehicleId) {
      vehicle = await API.vehicles.get(vehicleId);
    }
    
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
          page: currentPage, 
          limit: pageSize,
          includeGeneral: true // Siempre incluir precios generales
        };
        
        // Si hay vehicleId, incluirlo para obtener precios del vehículo Y generales
        if (vehicleId) {
          pricesParams.vehicleId = vehicleId;
        } else {
          // Si no hay vehicleId, buscar solo precios generales
          pricesParams.vehicleId = null;
        }
        
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
      if (!pricesList) {
        console.error('No se encontró el elemento #prices-list');
        return;
      }
    
    if (prices.length === 0) {
        pricesList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">No hay precios que coincidan con los filtros.</div>';
        return;
      }
      
      pricesList.innerHTML = '';
      prices.forEach(pe => {
        const card = document.createElement('div');
        card.style.cssText = 'padding:12px;background:var(--card-alt);border:1px solid var(--border);border-radius:8px;display:flex;justify-content:space-between;align-items:center;';
        
        const isGeneral = !pe.vehicleId;
        let typeBadge = '';
        if (pe.type === 'combo') {
          typeBadge = '<span style="background:#9333ea;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">COMBO</span>';
        } else if (pe.type === 'product') {
          typeBadge = '<span style="background:var(--primary,#3b82f6);color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">PRODUCTO</span>';
        } else {
          typeBadge = '<span style="background:var(--success,#10b981);color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">SERVICIO</span>';
        }
        
        const generalBadge = isGeneral ? '<span style="background:#06b6d4;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:8px;">🌐 GENERAL</span>' : '';
        
        card.innerHTML = `
          <div style="flex:1;">
            ${typeBadge}${generalBadge}
            <span style="font-weight:600;">${pe.name || 'Sin nombre'}</span>
          </div>
          <div style="margin:0 16px;font-weight:600;color:var(--primary);">${money(pe.total || pe.price || 0)}</div>
          <button class="add-price-btn primary" data-price-id="${pe._id}" style="padding:6px 16px;border-radius:6px;border:none;cursor:pointer;font-weight:600;">Agregar</button>
        `;
        
        const addBtn = card.querySelector('.add-price-btn');
        if (!addBtn) {
          console.error('No se encontró el botón add-price-btn');
          return; // En forEach, usar return en lugar de continue
        }
        
        addBtn.onclick = async () => {
          const btn = card.querySelector('.add-price-btn');
          const originalText = btn.textContent;
          try {
            btn.disabled = true;
            btn.textContent = 'Agregando...';
            
            // Validar y refrescar la venta
            await ensureCurrentSale();
            
            // Verificar nuevamente que tenemos un ID válido
            if (!current || !current._id) {
              throw new Error('No hay venta activa. Por favor, crea una venta primero.');
            }
            
            // Asegurar que el ID es un string válido
            const saleId = String(current._id).trim();
            if (!saleId || saleId.length < 10) {
              throw new Error('ID de venta inválido. Por favor, crea una nueva venta.');
            }
            
            // Verificar que la venta todavía existe y está abierta antes de agregar
            console.log('Verificando venta antes de agregar item:', { saleId, priceId: pe._id, currentStatus: current.status });
            const verifySale = await API.sales.get(saleId);
            if (!verifySale) {
              throw new Error('La venta no existe. Por favor, crea una nueva venta.');
            }
            if (verifySale.status !== 'draft') {
              throw new Error(`La venta está en estado "${verifySale.status}" y no se pueden agregar items. Por favor, crea una nueva venta.`);
            }
            
            console.log('Agregando item a venta:', { saleId, priceId: pe._id, saleStatus: verifySale.status });
            current = await API.sales.addItem(saleId, { source:'price', refId: pe._id, qty:1 });
            syncCurrentIntoOpenList();
            await renderAll();
            
            // Mostrar feedback de éxito
            btn.textContent = '✓ Agregado';
            btn.style.background = 'var(--success, #10b981)';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.disabled = false;
              btn.style.background = '';
            }, 2000);
          } catch (err) {
            console.error('Error al agregar item:', err);
            btn.disabled = false;
            btn.textContent = originalText;
            alert('Error: ' + (err?.message || 'No se pudo agregar el item. Verifica que la venta esté abierta.'));
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
      ${vehicle ? `
      <div style="margin-bottom:16px;padding:12px;background:var(--card-alt);border-radius:8px;">
        <div style="font-weight:600;margin-bottom:4px;">${vehicle?.make || ''} ${vehicle?.line || ''}</div>
        <div style="font-size:12px;color:var(--muted);">Cilindraje: ${vehicle?.displacement || ''}${vehicle?.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}</div>
      </div>
      ` : `
      <div style="margin-bottom:16px;padding:12px;background:var(--card-alt);border-radius:8px;border-left:4px solid #06b6d4;">
        <div style="font-weight:600;margin-bottom:4px;">🌐 Precios Generales</div>
        <div style="font-size:12px;color:var(--muted);">Precios disponibles para todos los vehículos</div>
      </div>
      `}
      <div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
        ${vehicleId ? `
        <button id="create-service-btn" class="secondary" style="flex:1;min-width:120px;padding:10px;border-radius:8px;font-weight:600;">
          ➕ Crear servicio
        </button>
        <button id="create-product-btn" class="secondary" style="flex:1;min-width:120px;padding:10px;border-radius:8px;font-weight:600;">
          ➕ Crear producto
        </button>
        <button id="create-combo-btn" class="secondary" style="flex:1;min-width:120px;padding:10px;border-radius:8px;font-weight:600;background:#9333ea;color:white;border:none;">
          🎁 Crear combo
        </button>
        ` : `
        <p style="text-align:center;color:var(--muted);font-size:13px;padding:8px;">Los precios generales se crean desde la sección de Lista de precios</p>
        `}
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
    
    // Botones de crear (solo si hay vehículo seleccionado)
    const createServiceBtn = container.querySelector('#create-service-btn');
    if (createServiceBtn) {
      createServiceBtn.onclick = () => {
        closeModal();
        createPriceFromSale('service', vehicleId, vehicle);
      };
    }
    
    const createProductBtn = container.querySelector('#create-product-btn');
    if (createProductBtn) {
      createProductBtn.onclick = () => {
        closeModal();
        createPriceFromSale('product', vehicleId, vehicle);
      };
    }
    
    const createComboBtn = container.querySelector('#create-combo-btn');
    if (createComboBtn) {
      createComboBtn.onclick = () => {
        closeModal();
        createPriceFromSale('combo', vehicleId, vehicle);
      };
    }
    
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
          const btn = card.querySelector('.add-inventory-btn');
          const originalText = btn.textContent;
          try {
            btn.disabled = true;
            btn.textContent = 'Agregando...';
            
            // Validar y refrescar la venta
            await ensureCurrentSale();
            
            // Verificar nuevamente que tenemos un ID válido
            if (!current || !current._id) {
              throw new Error('No hay venta activa. Por favor, crea una venta primero.');
            }
            
            // Asegurar que el ID es un string válido
            const saleId = String(current._id).trim();
            if (!saleId || saleId.length < 10) {
              throw new Error('ID de venta inválido. Por favor, crea una nueva venta.');
            }
            
            console.log('Agregando item de inventario a venta:', { saleId, itemId: item._id });
            current = await API.sales.addItem(saleId, { source:'inventory', refId: item._id, qty:1 });
            syncCurrentIntoOpenList();
            await renderAll();
            
            // Mostrar feedback de éxito
            btn.textContent = '✓ Agregado';
            btn.style.background = 'var(--success, #10b981)';
            setTimeout(() => {
              btn.textContent = originalText;
              btn.disabled = false;
              btn.style.background = '';
            }, 2000);
          } catch (err) {
            console.error('Error al agregar item:', err);
            btn.disabled = false;
            btn.textContent = originalText;
            alert('Error: ' + (err?.message || 'No se pudo agregar el item. Verifica que la venta esté abierta.'));
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
          // Establecer el nombre del producto con el nombre del item
          if (nameInput && item.name) {
            nameInput.value = item.name;
          }
          // Establecer el precio siempre como 0 cuando se linkea a un item del inventario
          totalInput.value = 0;
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
          // Establecer el nombre del producto con el nombre del item
          if (nameInput && item.name) {
            nameInput.value = item.name;
          }
          // Establecer el precio siempre como 0 cuando se linkea a un item del inventario
          totalInput.value = 0;
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
              // Establecer el nombre del combo product con el nombre del item
              const nameInput = row.querySelector('.combo-product-name');
              if (nameInput && item.name) {
                nameInput.value = item.name;
              }
              // Establecer el precio siempre como 0 cuando se linkea a un item del inventario
              const priceInput = row.querySelector('.combo-product-price');
              priceInput.value = 0;
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
                // Establecer el nombre del combo product con el nombre del item
                const nameInput = row.querySelector('.combo-product-name');
                if (nameInput && item.name) {
                  nameInput.value = item.name;
                }
                // Establecer el precio siempre como 0 cuando se linkea a un item del inventario
                const priceInput = row.querySelector('.combo-product-price');
                priceInput.value = 0;
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
        await renderAll();
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
    closeModal();
    await renderAll();
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
        await renderAll();
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
    const params = { serviceId: svc.value||'', page, limit, includeGeneral: true };
    if (currentVehicleId) {
      params.vehicleId = currentVehicleId;
      const vehicleYear = current?.vehicle?.year || null;
      if (vehicleYear) {
        params.vehicleYear = vehicleYear;
      }
    } else {
      // Si no hay vehículo, buscar solo precios generales
      params.vehicleId = null;
    }
    const rows = await API.pricesList(params);
    cnt.textContent = rows.length;
    body.innerHTML = '';
    for(const pe of rows){
      const tr = clone('tpl-price-row');
      const vehicleCell = tr.querySelector('[data-vehicle]') || tr.querySelector('td');
      if (vehicleCell) {
        if (!pe.vehicleId) {
          // Precio general
          vehicleCell.innerHTML = `
            <div style="font-weight:600;color:#06b6d4;">🌐 General</div>
            <div style="font-size:12px;color:var(--muted);">Disponible para todos</div>
          `;
        } else if (pe.vehicleId && pe.vehicleId.make) {
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
        await renderAll();
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
    tr.className = 'bg-white dark:bg-white theme-light:bg-white border-b border-slate-300 dark:border-slate-300 theme-light:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-50 theme-light:hover:bg-slate-50 transition-colors';
    tr.innerHTML = `
      <td class="py-1 px-0.5 text-xs text-slate-900 dark:text-slate-900 theme-light:text-slate-900 align-top border-r border-slate-300 dark:border-slate-300 theme-light:border-slate-300 border-b border-slate-300 dark:border-slate-300 theme-light:border-slate-300">${typeLabel}</td>
      <td class="py-1 px-0.5 text-xs text-slate-900 dark:text-slate-900 theme-light:text-slate-900 break-words align-top border-r border-slate-300 dark:border-slate-300 theme-light:border-slate-300 border-b border-slate-300 dark:border-slate-300 theme-light:border-slate-300">${htmlEscape(name || 'Item')}</td>
      <td class="py-1 px-0.5 text-center text-[10px] text-slate-900 dark:text-slate-900 theme-light:text-slate-900 align-top border-r border-slate-300 dark:border-slate-300 theme-light:border-slate-300 border-b border-slate-300 dark:border-slate-300 theme-light:border-slate-300">${qty}</td>
      <td class="py-1 px-0.5 text-right text-[10px] text-slate-900 dark:text-slate-900 theme-light:text-slate-900 font-medium whitespace-nowrap align-top border-r border-slate-300 dark:border-slate-300 theme-light:border-slate-300 border-b border-slate-300 dark:border-slate-300 theme-light:border-slate-300">${money(unit)}</td>
      <td class="py-1 px-0.5 text-right text-[10px] text-slate-900 dark:text-slate-900 theme-light:text-slate-900 font-semibold whitespace-nowrap align-top border-r border-slate-300 dark:border-slate-300 theme-light:border-slate-300 border-b border-slate-300 dark:border-slate-300 theme-light:border-slate-300">${money(total)}</td>
      <td class="py-1 px-0.5 text-center align-top border-b border-slate-300 dark:border-slate-300 theme-light:border-slate-300">
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
          await renderAll({ skipQuote: true });
        }
        ensureSaleQuoteLink(q);
        try {
          const payload = mapQuoteItemToSale(it);
          current = await API.sales.addItem(current._id, payload);
          syncCurrentIntoOpenList();
          await renderAll();
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
        await renderAll({ skipQuote: true });
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
        await renderAll();
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
            
            if (!linkInput || !linkInput.value.trim()) {
              return alert('El link de calificación es obligatorio');
            }
            
            // Guardar configuración (solo link, sin QR)
            const prefs = await API.company.getPreferences();
            prefs.postServiceMessage = {
              ratingLink: linkInput.value.trim()
            };
            
            await API.company.setPreferences(prefs);
            
            // Ocultar el botón de configuración después de guardar
            const configurePostServiceBtn = document.getElementById('sales-configure-post-service');
            if (configurePostServiceBtn) {
              configurePostServiceBtn.style.display = 'none';
            }
            
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
    message += 'Muchas gracias!';
    
    // Codificar mensaje para URL
    const encodedMessage = encodeURIComponent(message);
    
    // Abrir WhatsApp Web/App
    // WhatsApp automáticamente mostrará una vista previa de la imagen si:
    // 1. La URL es HTTPS
    // 2. La imagen es accesible públicamente (sin autenticación)
    // 3. La URL está en una línea separada en el mensaje
    // 4. La imagen tiene un formato soportado (JPG, PNG, etc.)
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
      // CRÍTICO: Usar timeZone: 'UTC' para mostrar la hora exacta (sin conversión de zona horaria)
      const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
      eventDate = saleDate.toLocaleDateString('es-CO', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        timeZone: 'UTC'  // Forzar UTC para que coincida con la hora de la cita
      });
      eventTime = saleDate.toLocaleTimeString('es-CO', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'UTC'  // Forzar UTC para que coincida con la hora de la cita
      });
      
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
            // CRÍTICO: Usar timeZone: 'UTC' para mostrar la hora exacta de la cita (sin conversión de zona horaria)
            eventDate = eventDateObj.toLocaleDateString('es-CO', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              timeZone: 'UTC'  // Forzar UTC para que coincida con la hora de la cita
            });
            eventTime = eventDateObj.toLocaleTimeString('es-CO', { 
              hour: '2-digit', 
              minute: '2-digit',
              timeZone: 'UTC'  // Forzar UTC para que coincida con la hora de la cita
            });
          }
        } catch (err) {
          console.warn('No se pudo obtener evento del calendario:', err);
        }
      }
    } catch (err) {
      console.error('Error getting event date:', err);
      // CRÍTICO: Usar timeZone: 'UTC' también en el fallback
      const fallbackDate = new Date();
      eventDate = fallbackDate.toLocaleDateString('es-CO', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        timeZone: 'UTC'
      });
      eventTime = fallbackDate.toLocaleTimeString('es-CO', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'UTC'
      });
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
    let phone = (sale.customer?.phone || '').replace(/\D/g, '');
    if (!phone) {
      return alert('No se encontró número de teléfono del cliente');
    }
    
    // Formatear para WhatsApp (agregar código de país +57 si no tiene)
    // Si el número no empieza con código de país, asumir Colombia (+57)
    if (!phone.startsWith('57') && phone.length === 10) {
      phone = '57' + phone;
    } else if (phone.startsWith('+57')) {
      // Si tiene +57, remover el + (wa.me no necesita el +)
      phone = phone.replace('+', '');
    } else if (phone.startsWith('57') && phone.length === 12) {
      // Ya tiene 57 y es válido (57 + 10 dígitos)
      // No hacer nada
    } else if (phone.length < 10) {
      return alert('El número de teléfono debe tener al menos 10 dígitos');
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
      await renderAll({ skipQuote: true });
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
    await renderAll({ includeMini: true });
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

  // Funcionalidad de asociar cliente a empresa
  let selectedCompanyId = null;
  let currentLink = null;
  
  // Cargar link existente si hay placa
  const loadExistingLink = async () => {
    const plate = plateInput?.value?.trim().toUpperCase();
    if (!plate) {
      selectedCompanyId = null;
      currentLink = null;
      updateCompanyUI();
      return;
    }
    
    try {
      const link = await API.receivables?.links?.getByPlate(plate);
      if (link && link.active) {
        currentLink = link;
        selectedCompanyId = link.companyAccountId?._id || link.companyAccountId;
        updateCompanyUI();
      } else {
        selectedCompanyId = null;
        currentLink = null;
        updateCompanyUI();
      }
    } catch (err) {
      console.warn('Error loading company link:', err);
      selectedCompanyId = null;
      currentLink = null;
      updateCompanyUI();
    }
  };
  
  const updateCompanyUI = () => {
    const companyInfo = $('#cv-company-info', node);
    const companyName = $('#cv-company-name', node);
    const companyTypeBadge = $('#cv-company-type-badge', node);
    const companyStatus = $('#cv-company-status', node);
    
    if (selectedCompanyId && currentLink?.companyAccountId) {
      const company = currentLink.companyAccountId;
      companyInfo?.classList.remove('hidden');
      if (companyName) companyName.textContent = company.name || '—';
      if (companyTypeBadge) {
        const isRecurrente = company.type === 'recurrente';
        companyTypeBadge.textContent = isRecurrente ? 'Recurrente' : 'Particular';
        companyTypeBadge.className = `ml-2 px-2 py-0.5 rounded text-xs font-semibold ${
          isRecurrente 
            ? 'bg-green-500/20 text-green-400 dark:text-green-400 theme-light:text-green-700'
            : 'bg-purple-500/20 text-purple-400 dark:text-purple-400 theme-light:text-purple-700'
        }`;
      }
      if (companyStatus) companyStatus.textContent = 'Cambiar empresa';
    } else {
      companyInfo?.classList.add('hidden');
      if (companyStatus) companyStatus.textContent = 'Seleccionar empresa';
    }
  };
  
  // Cargar link al cambiar placa
  if (plateInput) {
    plateInput.addEventListener('change', loadExistingLink);
    plateInput.addEventListener('blur', loadExistingLink);
  }
  
  // Cargar link inicial si hay placa
  if (plateInput?.value) {
    loadExistingLink();
  }
  
  // Botón para seleccionar empresa
  $('#cv-associate-company', node)?.addEventListener('click', async () => {
    try {
      const companies = await API.receivables?.companies?.list() || [];
      if (companies.length === 0) {
        alert('No hay empresas registradas. Ve a Cartera > Empresas para crear una.');
        return;
      }
      
      // Crear modal de selección
      const selectModal = document.createElement('div');
      selectModal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/60 theme-light:bg-black/40 backdrop-blur-sm';
      selectModal.innerHTML = `
        <div class="bg-slate-800/95 dark:bg-slate-800/95 theme-light:bg-sky-50 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">Seleccionar Empresa</h3>
          <div class="space-y-2 mb-4">
            ${companies.map(c => `
              <div class="p-3 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white rounded-lg border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 cursor-pointer hover:bg-slate-800/70 dark:hover:bg-slate-800/70 theme-light:hover:bg-slate-100 transition-colors" data-company-id="${c._id}">
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${(c.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                    <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">
                      ${c.contact?.phone ? `Tel: ${(c.contact.phone || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}` : ''}
                      ${c.type === 'recurrente' ? ' · Recurrente' : ' · Particular'}
                    </div>
                  </div>
                  <span class="px-2 py-1 rounded text-xs font-semibold ${
                    c.type === 'recurrente'
                      ? 'bg-green-500/20 text-green-400 dark:text-green-400 theme-light:text-green-700'
                      : 'bg-purple-500/20 text-purple-400 dark:text-purple-400 theme-light:text-purple-700'
                  }">${c.type === 'recurrente' ? 'Recurrente' : 'Particular'}</span>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="flex justify-end gap-2">
            <button class="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors" data-cancel>Cancelar</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(selectModal);
      
      // Event listeners
      selectModal.querySelectorAll('[data-company-id]').forEach(div => {
        div.addEventListener('click', async () => {
          const companyId = div.dataset.companyId;
          const company = companies.find(c => c._id === companyId);
          if (!company) return;
          
          try {
            const plate = plateInput?.value?.trim().toUpperCase();
            const customerName = $('#c-name', node)?.value?.trim() || '';
            const customerPhone = $('#c-phone', node)?.value?.trim() || '';
            const customerIdNumber = $('#c-id', node)?.value?.trim() || '';
            
            if (!plate) {
              alert('Debes ingresar una placa primero');
              document.body.removeChild(selectModal);
              return;
            }
            
            // Crear link
            await API.receivables?.links?.create({
              companyAccountId: companyId,
              plate: plate,
              customerName: customerName,
              customerPhone: customerPhone,
              customerIdNumber: customerIdNumber,
              saleId: current?._id || null
            });
            
            selectedCompanyId = companyId;
            currentLink = { companyAccountId: company };
            updateCompanyUI();
            
            document.body.removeChild(selectModal);
            // Mostrar notificación de éxito
            const successMsg = document.createElement('div');
            successMsg.className = 'fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white rounded-lg shadow-lg';
            successMsg.textContent = `✅ Cliente asociado a ${company.name}`;
            document.body.appendChild(successMsg);
            setTimeout(() => successMsg.remove(), 3000);
          } catch (err) {
            console.error('Error associating company:', err);
            alert(err?.response?.data?.error || err?.message || 'Error al asociar empresa');
          }
        });
      });
      
      selectModal.querySelector('[data-cancel]')?.addEventListener('click', () => {
        document.body.removeChild(selectModal);
      });
      
      selectModal.addEventListener('click', (e) => {
        if (e.target === selectModal) {
          document.body.removeChild(selectModal);
        }
      });
    } catch (err) {
      console.error('Error loading companies:', err);
      alert('Error al cargar empresas');
    }
  });
  
  // Botón para desvincular
  $('#cv-remove-company', node)?.addEventListener('click', async () => {
    if (!currentLink?._id) return;
    if (!confirm('¿Desvincular este cliente de la empresa?')) return;
    
    try {
      await API.receivables?.links?.delete(currentLink._id);
      selectedCompanyId = null;
      currentLink = null;
      updateCompanyUI();
      // Mostrar notificación de éxito
      const successMsg = document.createElement('div');
      successMsg.className = 'fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white rounded-lg shadow-lg';
      successMsg.textContent = '✅ Cliente desvinculado de la empresa';
      document.body.appendChild(successMsg);
      setTimeout(() => successMsg.remove(), 3000);
    } catch (err) {
      console.error('Error removing link:', err);
      alert(err?.response?.data?.error || err?.message || 'Error al desvincular');
    }
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
    
    // Agrupar items por tipo (productos, servicios, combos)
    const itemsGrouped = node.querySelector('[data-items-grouped]');
    itemsGrouped.innerHTML = '';
    
    if (!sale.items || sale.items.length === 0) {
      if (sale.notes) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'p-4 bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-sky-100 rounded-lg text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600';
        emptyDiv.innerHTML = `Notas: ${sale.notes.replace(/\n/g,'<br/>')}`;
        itemsGrouped.appendChild(emptyDiv);
      }
    } else {
      // Determinar tipo de cada item
      const products = [];
      const services = [];
      const combos = [];
      
      // Necesitamos identificar combos consultando PriceEntry si tienen source='price'
      // Usar cache global (función getPriceEntryCached definida al inicio del módulo)
      
      const priceEntryIds = sale.items
        .filter(item => item.source === 'price' && item.refId)
        .map(item => item.refId);
      
      let priceEntryMap = {};
      if (priceEntryIds.length > 0) {
        try {
          const priceEntries = await Promise.all(
            priceEntryIds.map(id => getPriceEntryCached(id))
          );
          priceEntries.forEach(pe => {
            if (pe && pe._id) {
              priceEntryMap[pe._id] = pe;
            }
          });
        } catch (e) {
          console.warn('Error fetching price entries:', e);
        }
      }
      
      sale.items.forEach(item => {
        if (item.source === 'price' && item.refId && priceEntryMap[item.refId]) {
          const pe = priceEntryMap[item.refId];
          if (pe.type === 'combo') {
            combos.push(item);
          } else if (pe.type === 'service') {
            services.push(item);
          } else {
            products.push(item);
          }
        } else if (item.source === 'inventory') {
          products.push(item);
        } else if (item.source === 'service') {
          services.push(item);
        } else {
          // Por defecto, tratar como servicio
          services.push(item);
        }
      });
      
      // Renderizar cada grupo con su color
      if (combos.length > 0) {
        const comboGroup = createItemGroup('Combos', combos, 'purple');
        itemsGrouped.appendChild(comboGroup);
      }
      if (services.length > 0) {
        const serviceGroup = createItemGroup('Servicios', services, 'blue');
        itemsGrouped.appendChild(serviceGroup);
      }
      if (products.length > 0) {
        const productGroup = createItemGroup('Productos', products, 'green');
        itemsGrouped.appendChild(productGroup);
      }
    }
    
    node.querySelector('[data-subtotal]').textContent = money(sale.subtotal || 0);
    node.querySelector('[data-total]').textContent = money(sale.total || 0);
    
    // Render pagos mejorados
    try {
      const payBody = node.querySelector('[data-payments]');
      const payTotalEl = node.querySelector('[data-payments-total]');
      if (payBody && payTotalEl) {
        payBody.innerHTML='';
        const list = Array.isArray(sale.paymentMethods) && sale.paymentMethods.length ? sale.paymentMethods : (sale.paymentMethod ? [{ method: sale.paymentMethod, amount: sale.total||0, accountId: null, accountName: null }] : []);
        let acc = 0;
        
        if (list.length === 0) {
          const emptyDiv = document.createElement('div');
          emptyDiv.className = 'text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-center py-2';
          emptyDiv.textContent = 'Sin información de pagos';
          payBody.appendChild(emptyDiv);
        } else {
          list.forEach(p => {
            const method = (p.method||'').toString().toUpperCase();
            const accountName = p.accountName || p.account?.name || 'Sin cuenta';
            const accountId = p.accountId || p.account?._id;
            const amt = Number(p.amount||0);
            acc += amt;
            
            const paymentDiv = document.createElement('div');
            paymentDiv.className = 'flex items-center justify-between p-4 bg-gradient-to-r from-slate-800/70 to-slate-800/50 dark:from-slate-700/70 dark:to-slate-700/50 theme-light:from-white theme-light:to-slate-50 rounded-lg border border-slate-700/40 dark:border-slate-600/40 theme-light:border-slate-200 shadow-sm hover:shadow-md transition-all duration-200';
            
            const methodColors = {
              'EFECTIVO': 'text-green-300 dark:text-green-400 theme-light:text-green-700',
              'TRANSFERENCIA': 'text-blue-300 dark:text-blue-400 theme-light:text-blue-700',
              'TARJETA': 'text-purple-300 dark:text-purple-400 theme-light:text-purple-700',
              'NEQUI': 'text-cyan-300 dark:text-cyan-400 theme-light:text-cyan-700',
              'DAVIPLATA': 'text-yellow-300 dark:text-yellow-400 theme-light:text-yellow-700'
            };
            const methodColor = methodColors[method] || 'text-slate-300 dark:text-slate-300 theme-light:text-slate-700';
            
            const leftDiv = document.createElement('div');
            leftDiv.className = 'flex-1';
            leftDiv.innerHTML = `
              <div class="font-bold text-lg ${methodColor} mb-1">${method}</div>
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">
                ${accountId ? `<span class="cursor-pointer hover:text-blue-400 dark:hover:text-blue-300 theme-light:hover:text-blue-600 hover:underline transition-colors font-medium" data-account-id="${accountId}">💳 ${accountName}</span>` : `<span class="text-slate-500">${accountName}</span>`}
              </div>
            `;
            
            const rightDiv = document.createElement('div');
            rightDiv.className = 'text-right';
            rightDiv.innerHTML = `
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Monto</div>
              <div class="font-bold text-xl text-white dark:text-white theme-light:text-slate-900">${money(amt)}</div>
            `;
            
            paymentDiv.appendChild(leftDiv);
            paymentDiv.appendChild(rightDiv);
            payBody.appendChild(paymentDiv);
            
            // Agregar click handler para ir al flujo de caja
            if (accountId) {
              const accountLink = leftDiv.querySelector('[data-account-id]');
              if (accountLink) {
                accountLink.addEventListener('click', () => {
                  closeModal();
                  // Navegar a flujo de caja con filtro por cuenta
                  if (window.location.pathname.includes('ventas.html')) {
                    window.location.href = `cashflow.html?accountId=${accountId}`;
                  } else {
                    window.location.href = `cashflow.html?accountId=${accountId}`;
                  }
                });
              }
            }
          });
        }
        payTotalEl.textContent = money(acc);
      }
    } catch(e) { console.warn('render pagos historial', e); }
    
    openModal(node);
  }catch(e){ alert(e?.message || 'No se pudo cargar la venta'); }
}

function createItemGroup(title, items, color) {
  // Colores mejorados con mejor contraste y visibilidad
  const colorConfigs = {
    purple: {
      border: 'border-purple-500/60 dark:border-purple-400/60 theme-light:border-purple-500',
      bg: 'bg-purple-500/15 dark:bg-purple-500/20 theme-light:bg-purple-50',
      headerText: 'text-purple-200 dark:text-purple-300 theme-light:text-purple-800',
      headerBg: 'bg-purple-500/20 dark:bg-purple-500/30 theme-light:bg-purple-100',
      icon: '🟣'
    },
    blue: {
      border: 'border-blue-500/60 dark:border-blue-400/60 theme-light:border-blue-500',
      bg: 'bg-blue-500/15 dark:bg-blue-500/20 theme-light:bg-blue-50',
      headerText: 'text-blue-200 dark:text-blue-300 theme-light:text-blue-800',
      headerBg: 'bg-blue-500/20 dark:bg-blue-500/30 theme-light:bg-blue-100',
      icon: '🔵'
    },
    green: {
      border: 'border-green-500/60 dark:border-green-400/60 theme-light:border-green-500',
      bg: 'bg-green-500/15 dark:bg-green-500/20 theme-light:bg-green-50',
      headerText: 'text-green-200 dark:text-green-300 theme-light:text-green-800',
      headerBg: 'bg-green-500/20 dark:bg-green-500/30 theme-light:bg-green-100',
      icon: '🟢'
    }
  };
  
  const config = colorConfigs[color] || colorConfigs.blue;
  
  const groupDiv = document.createElement('div');
  groupDiv.className = `rounded-xl border-2 ${config.border} ${config.bg} p-4 shadow-lg`;
  
  const header = document.createElement('div');
  header.className = `flex items-center gap-2 font-bold text-sm mb-4 px-3 py-2 rounded-lg ${config.headerBg} ${config.headerText}`;
  header.innerHTML = `<span>${config.icon}</span><span>${title}</span><span class="ml-auto text-xs opacity-75">(${items.length})</span>`;
  groupDiv.appendChild(header);
  
  const itemsList = document.createElement('div');
  itemsList.className = 'space-y-3';
  
  items.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'bg-slate-900/60 dark:bg-slate-800/60 theme-light:bg-white rounded-lg p-4 border border-slate-700/40 dark:border-slate-600/40 theme-light:border-slate-200 shadow-sm hover:shadow-md transition-shadow';
    
    const itemInfo = `
      <div class="flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 text-base mb-1">${item.name || item.sku || 'Sin nombre'}</div>
          ${item.sku ? `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2 font-mono">SKU: ${item.sku}</div>` : ''}
          ${item.purchaseInfo ? `
            <div class="mt-3 p-3 bg-slate-800/70 dark:bg-slate-700/50 theme-light:bg-slate-100 rounded-lg border border-slate-700/30 dark:border-slate-600/30 theme-light:border-slate-200">
              <div class="font-semibold text-slate-200 dark:text-slate-200 theme-light:text-slate-800 mb-2 text-xs uppercase tracking-wide">📦 Información de compra</div>
              <div class="text-slate-300 dark:text-slate-300 theme-light:text-slate-700 space-y-1.5 text-xs">
                ${item.purchaseInfo.purchasePlace ? `<div class="flex items-center gap-2"><span class="font-medium">Proveedor:</span><span>${item.purchaseInfo.purchasePlace}</span></div>` : ''}
                ${item.purchaseInfo.intakeDate ? `<div class="flex items-center gap-2"><span class="font-medium">Fecha:</span><span>${new Date(item.purchaseInfo.intakeDate).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>` : ''}
                ${item.purchaseInfo.vehicleInfo ? `<div class="flex items-center gap-2"><span class="font-medium">Vehículo:</span><span>${item.purchaseInfo.vehicleInfo}</span></div>` : ''}
                ${item.purchaseInfo.meta?.supplier ? `<div class="flex items-center gap-2"><span class="font-medium">Proveedor:</span><span>${item.purchaseInfo.meta.supplier}</span></div>` : ''}
                ${item.purchaseInfo.meta?.purchaseOrder ? `<div class="flex items-center gap-2"><span class="font-medium">Orden:</span><span class="font-mono">${item.purchaseInfo.meta.purchaseOrder}</span></div>` : ''}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="text-right ml-4 flex-shrink-0">
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Cantidad</div>
          <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-3">${item.qty || 0}</div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Precio unit.</div>
          <div class="text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-3">${money(item.unitPrice || 0)}</div>
          <div class="pt-2 border-t border-slate-700/30 dark:border-slate-600/30 theme-light:border-slate-200">
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Total</div>
            <div class="font-bold text-lg text-white dark:text-white theme-light:text-slate-900">${money(item.total || 0)}</div>
          </div>
        </div>
      </div>
    `;
    
    itemDiv.innerHTML = itemInfo;
    itemsList.appendChild(itemDiv);
  });
  
  groupDiv.appendChild(itemsList);
  return groupDiv;
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
            .then(async (s)=>{ current = s; syncCurrentIntoOpenList(); await renderAll(); })
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
          await renderAll({ includeMini: true });
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
            await renderAll({ includeMini: true });
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
      await renderAll();
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
        
        await renderAll();
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
  async function setupConfigurePostServiceButton() {
    const configurePostServiceBtn = document.getElementById('sales-configure-post-service');
    if (!configurePostServiceBtn) {
      // Retry después de un pequeño delay si el botón no existe aún
      setTimeout(setupConfigurePostServiceButton, 100);
      return;
    }
    
    // Verificar si ya hay configuración y ocultar el botón si está configurado
    try {
      const prefs = await API.company.getPreferences();
      const config = prefs.postServiceMessage || {};
      if (config.ratingLink && config.ratingLink.trim()) {
        configurePostServiceBtn.style.display = 'none';
        return; // No configurar eventos si el botón está oculto
      }
    } catch (err) {
      console.error('Error checking post-service config:', err);
      // Continuar con la configuración del botón aunque haya error
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
let historialPlate = null; // Filtro por placa
let historialTechnician = null; // Filtro por técnico
let historialLoading = false; // Flag para evitar múltiples cargas simultáneas
let historialCache = null; // Cache simple para evitar recargas innecesarias
let historialCacheKey = null;

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
      // Cargar historial al cambiar a esa vista (solo si no está cargado)
      if (!historialCache || historialCache.length === 0) {
        loadHistorial();
      }
    });

  // Configurar delegación de eventos una sola vez
  setupHistorialEventDelegation();

  // Filtros de fecha, placa y técnico con debounce
  const btnFiltrar = document.getElementById('historial-filtrar');
  const btnLimpiar = document.getElementById('historial-limpiar');
  const btnExportarReporte = document.getElementById('historial-exportar-reporte');
  const fechaDesde = document.getElementById('historial-fecha-desde');
  const fechaHasta = document.getElementById('historial-fecha-hasta');
  const placaInput = document.getElementById('historial-placa');
  const tecnicoSelect = document.getElementById('historial-tecnico');
  
  // Cargar lista de técnicos al inicializar
  async function loadTechniciansForHistorial() {
    try {
      const technicians = await API.company.getTechnicians();
      if (tecnicoSelect && Array.isArray(technicians)) {
        tecnicoSelect.innerHTML = '<option value="">Todos los técnicos</option>';
        technicians.forEach(tech => {
          const name = typeof tech === 'string' ? tech : (tech?.name || '');
          if (name) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            tecnicoSelect.appendChild(option);
          }
        });
      }
    } catch (err) {
      console.warn('Error cargando técnicos para historial:', err);
    }
  }
  
  // Cargar técnicos al inicializar
  loadTechniciansForHistorial();
  
  // Botón exportar reporte
  if(btnExportarReporte) {
    btnExportarReporte.addEventListener('click', () => {
      openReportModal();
    });
  }

  let filterTimeout = null;
  const applyFilters = () => {
    historialDateFrom = fechaDesde?.value || null;
    historialDateTo = fechaHasta?.value || null;
    historialPlate = placaInput?.value?.trim().toUpperCase() || null;
    historialTechnician = tecnicoSelect?.value?.trim() || null;
    historialCurrentPage = 1;
    historialCache = null; // Invalidar cache al cambiar filtros
    loadHistorial(true);
  };

  if (btnFiltrar) {
    btnFiltrar.addEventListener('click', () => {
      clearTimeout(filterTimeout);
      applyFilters();
    });
  }

  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', () => {
      if (fechaDesde) fechaDesde.value = '';
      if (fechaHasta) fechaHasta.value = '';
      if (placaInput) placaInput.value = '';
      if (tecnicoSelect) tecnicoSelect.value = '';
      historialDateFrom = null;
      historialDateTo = null;
      historialPlate = null;
      historialTechnician = null;
      historialCurrentPage = 1;
      historialCache = null; // Invalidar cache al limpiar filtros
      loadHistorial(true);
    });
  }
  
  // Permitir filtrar con Enter en el campo de placa
  if (placaInput) {
    placaInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyFilters();
      }
    });
  }

  // Paginación
  const btnPrev = document.getElementById('historial-prev');
  const btnNext = document.getElementById('historial-next');

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (historialCurrentPage > 1) {
        historialCurrentPage--;
        loadHistorial(true); // Forzar refresh al cambiar página
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      if (historialCurrentPage < historialTotalPages) {
        historialCurrentPage++;
        loadHistorial(true); // Forzar refresh al cambiar página
      }
    });
  }
}

// Función consolidada para actualizar paginación (elimina duplicación)
function updateHistorialPagination() {
  const paginationInfo = document.getElementById('historial-pagination-info');
  const pageInfo = document.getElementById('historial-page-info');
  const btnPrev = document.getElementById('historial-prev');
  const btnNext = document.getElementById('historial-next');

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
}

// Función helper para formatear fecha de cierre (reutilizable)
function formatClosedDate(date) {
  if (!date) return 'Sin fecha';
  return new Date(date).toLocaleDateString('es-CO', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadHistorial(forceRefresh = false) {
  const container = document.getElementById('historial-ventas-container');
  if (!container) return;

  // Evitar múltiples cargas simultáneas
  if (historialLoading) return;
  historialLoading = true;

  try {
    container.innerHTML = '<div class="text-center py-8 text-slate-400">Cargando ventas...</div>';

    const params = {
      status: 'closed',
      limit: historialPageSize,
      page: historialCurrentPage
    };

    // Si hay filtros de fecha, placa o técnico, usarlos; si no, cargar últimas 20
    if (historialDateFrom || historialDateTo || historialPlate || historialTechnician) {
      if (historialDateFrom) params.from = historialDateFrom;
      if (historialDateTo) params.to = historialDateTo;
      if (historialPlate) params.plate = historialPlate;
      if (historialTechnician) params.technician = historialTechnician;
    } else {
      // Sin filtros: cargar últimas 20 ventas
      params.limit = 20;
      params.page = 1;
    }

    // Generar clave de cache
    const cacheKey = JSON.stringify(params);
    
    // Usar cache si está disponible y no se fuerza refresh
    if (!forceRefresh && historialCache && historialCacheKey === cacheKey) {
      const sales = historialCache;
      renderHistorialSales(sales);
      return;
    }

    const res = await API.sales.list(params);
    let sales = Array.isArray(res?.items) ? res.items : [];
    
    // Filtrar por técnico en el frontend si está especificado
    if (historialTechnician) {
      sales = sales.filter(sale => {
        const tech = sale?.technician || sale?.closingTechnician || sale?.initialTechnician || '';
        return String(tech).trim().toUpperCase() === String(historialTechnician).trim().toUpperCase();
      });
    }
    
    // Actualizar cache
    historialCache = sales;
    historialCacheKey = cacheKey;
    
    // Ajustar totales si se filtró por técnico
    if (historialTechnician) {
      historialTotal = sales.length;
      historialTotalPages = Math.ceil(historialTotal / historialPageSize);
    } else {
      historialTotal = res?.total || sales.length;
      historialTotalPages = res?.pages || Math.ceil(historialTotal / historialPageSize);
    }

    renderHistorialSales(sales);

  } catch (err) {
    console.error('Error loading historial:', err);
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="text-red-400 dark:text-red-400 theme-light:text-red-600 text-lg mb-2">Error al cargar ventas</div>
        <div class="text-slate-500 dark:text-slate-500 theme-light:text-slate-500 text-sm">${err?.message || 'Error desconocido'}</div>
      </div>
    `;
    updateHistorialPagination();
  } finally {
    historialLoading = false;
  }
}

// Función consolidada para renderizar ventas del historial
async function renderHistorialSales(sales) {
  const container = document.getElementById('historial-ventas-container');
  if (!container) return;

  if (sales.length === 0) {
    const filterText = historialPlate 
      ? `para la placa "${historialPlate}"` 
      : historialDateFrom || historialDateTo 
        ? 'con los filtros de fecha seleccionados' 
        : '';
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-lg mb-2">No se encontraron ventas</div>
        <div class="text-slate-500 dark:text-slate-500 theme-light:text-slate-500 text-sm">${filterText ? `Intenta ajustar los filtros ${filterText}` : 'Intenta ajustar los filtros de fecha o placa'}</div>
      </div>
    `;
    updateHistorialPagination();
    return;
  }

  // Renderizar ventas de forma async
  container.innerHTML = '';
  
  // Crear todas las tarjetas en paralelo
  const cardPromises = sales.map(sale => createHistorialSaleCard(sale));
  const cards = await Promise.all(cardPromises);
  
  // Agregar todas las tarjetas al contenedor
  cards.forEach(card => {
    container.appendChild(card);
  });
  
  updateHistorialPagination();
}

// Optimización: usar delegación de eventos en lugar de listeners individuales
let historialEventDelegationSetup = false;

function setupHistorialEventDelegation() {
  if (historialEventDelegationSetup) return;
  
  const container = document.getElementById('historial-ventas-container');
  if (!container) return;

  // Delegación de eventos para todos los botones del historial
  container.addEventListener('click', (e) => {
    const saleId = e.target.closest('[data-sale-id]')?.dataset?.saleId;
    if (!saleId) return;

    if (e.target.closest('.btn-historial-print')) {
      printSaleFromHistorial(saleId);
    } else if (e.target.closest('.btn-historial-view')) {
      viewSaleSummary(saleId);
    } else if (e.target.closest('.btn-historial-edit')) {
      openEditCloseModal(saleId);
    } else if (e.target.closest('.btn-historial-edit-technician')) {
      editTechnicianFromHistorial(saleId);
    }
  });

  historialEventDelegationSetup = true;
}

// Función helper para extraer servicios y combos de una venta (solo nombres, sin precios)
// IMPORTANTE: Excluye productos (source='inventory' o source='price' con type='product')
async function extractServicesAndCombos(sale) {
  if (!sale?.items || !Array.isArray(sale.items)) return { services: [], combos: [] };
  
  const services = [];
  const combos = [];
  const processedComboSkus = new Set();
  
  // Obtener PriceEntries para items con source='price' y refId
  const priceEntryIds = sale.items
    .filter(item => item.source === 'price' && item.refId)
    .map(item => item.refId);
  
  const priceEntryMap = {};
  if (priceEntryIds.length > 0) {
    try {
      const priceEntries = await Promise.all(
        priceEntryIds.map(id => getPriceEntryCached(id))
      );
      priceEntries.forEach(pe => {
        if (pe && pe._id) {
          priceEntryMap[String(pe._id)] = pe;
        }
      });
    } catch (e) {
      console.warn('Error fetching price entries in extractServicesAndCombos:', e);
    }
  }
  
  // Identificar productos que son parte de combos (para excluirlos)
  const comboProductRefIds = new Set();
  Object.values(priceEntryMap).forEach(pe => {
    if (pe.type === 'combo' && pe.comboProducts && Array.isArray(pe.comboProducts)) {
      pe.comboProducts.forEach(cp => {
        if (cp.itemId) {
          comboProductRefIds.add(String(cp.itemId));
        }
      });
    }
  });
  
  sale.items.forEach(item => {
    const sku = String(item.sku || '').toUpperCase();
    const name = item.name || '';
    const source = item.source || '';
    const refId = item.refId ? String(item.refId) : '';
    
    // Excluir productos que son parte de combos (productos anidados)
    if (comboProductRefIds.has(refId)) {
      return; // Es un producto anidado de un combo, no incluirlo
    }
    
    // Excluir productos con SKU que empieza con "CP-" (producto de combo)
    if (sku.startsWith('CP-')) {
      return; // Es un producto anidado de un combo, no incluirlo
    }
    
    // Clasificar el item
    if (source === 'price' && refId && priceEntryMap[refId]) {
      const pe = priceEntryMap[refId];
      if (pe.type === 'combo') {
        // Es un combo
        if (!processedComboSkus.has(sku) && name) {
          combos.push({ name, sku });
          processedComboSkus.add(sku);
        }
      } else if (pe.type === 'service') {
        // Es un servicio
        if (name && !services.find(s => s.name === name)) {
          services.push({ name, sku });
        }
      }
      // Si pe.type === 'product', no hacer nada (excluir productos)
    } else if (source === 'inventory') {
      // source='inventory' siempre es producto, excluir
      return;
    } else if (source === 'service') {
      // source='service' siempre es servicio
      if (name && !services.find(s => s.name === name)) {
        services.push({ name, sku });
      }
    } else if (sku.startsWith('COMBO-')) {
      // SKU que empieza con COMBO- es un combo
      if (!processedComboSkus.has(sku) && name) {
        combos.push({ name, sku });
        processedComboSkus.add(sku);
      }
    } else if (sku.startsWith('SRV-')) {
      // SKU que empieza con SRV- es un servicio
      if (name && !services.find(s => s.name === name)) {
        services.push({ name, sku });
      }
    }
    // Por defecto, si no se puede determinar, no incluirlo (evitar mostrar productos)
  });
  
  return { 
    services: services.map(s => s.name), 
    combos: combos.map(c => c.name) 
  };
}

async function createHistorialSaleCard(sale) {
  const card = document.createElement('div');
  card.className = 'historial-sale-card bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-4';
  
  const plate = sale?.vehicle?.plate || 'Sin placa';
  const closedDate = formatClosedDate(sale?.closedAt);
  const saleNumber = padSaleNumber(sale?.number || sale?._id || '');
  const technician = sale?.technician || sale?.closingTechnician || 'Sin asignar';
  const { services, combos } = await extractServicesAndCombos(sale);
  
  // Crear resumen de servicios y combos como tarjetas pequeñas
  const summaryItems = [...services, ...combos];
  
  // Generar HTML de tarjetas pequeñas para cada item del resumen
  const summaryCardsHTML = summaryItems.length > 0
    ? summaryItems.map(item => `
        <div class="inline-flex items-center px-2 py-1 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-sky-100 rounded-md text-xs text-white dark:text-white theme-light:text-slate-900 font-medium border border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-300/50">
          ${htmlEscape(item)}
        </div>
      `).join('')
    : '<span class="text-slate-500 dark:text-slate-500 theme-light:text-slate-500 text-xs italic">Sin servicios ni combos</span>';

  card.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center gap-4">
      <!-- Placa a la izquierda -->
      <div class="flex-shrink-0">
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Placa</div>
        <div class="text-lg font-bold text-white dark:text-white theme-light:text-slate-900">${htmlEscape(plate.toUpperCase())}</div>
      </div>
      
      <!-- Resumen en el medio con tarjetas -->
      <div class="flex-1 min-w-0">
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">Resumen</div>
        <div class="flex flex-wrap gap-2">
          ${summaryCardsHTML}
        </div>
        <!-- Técnico debajo del resumen -->
        <div class="flex items-center gap-2 mt-3">
          <span class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Técnico:</span>
          <span class="text-sm text-blue-400 dark:text-blue-400 theme-light:text-blue-600 font-semibold">${htmlEscape(technician)}</span>
          <button class="btn-historial-edit-technician ml-1 p-1 text-blue-400 dark:text-blue-400 theme-light:text-blue-600 hover:text-blue-300 dark:hover:text-blue-300 theme-light:hover:text-blue-700 transition-colors" data-sale-id="${sale._id}" title="Editar técnico">
            ✏️
          </button>
        </div>
      </div>
      
      <!-- Botones hamburguesa a la derecha -->
      <div class="flex-shrink-0 flex flex-col gap-2">
        <button class="btn-historial-print px-3 py-2 text-xs bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300" data-sale-id="${sale._id}" title="Imprimir remisión">
          🖨️
        </button>
        <button class="btn-historial-view px-3 py-2 text-xs bg-blue-600/50 dark:bg-blue-600/50 hover:bg-blue-600 dark:hover:bg-blue-600 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-blue-500/50 dark:border-blue-500/50" data-sale-id="${sale._id}" title="Ver resumen">
          👁️
        </button>
        <button class="btn-historial-edit px-3 py-2 text-xs bg-purple-600/50 dark:bg-purple-600/50 hover:bg-purple-600 dark:hover:bg-purple-600 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-purple-500/50 dark:border-purple-500/50" data-sale-id="${sale._id}" title="Editar cierre">
          ✏️
        </button>
      </div>
    </div>
    <div class="mt-3 pt-3 border-t border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300/30 flex justify-between items-center text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
      <span>Venta #${saleNumber}</span>
      <span>Cerrada: ${closedDate}</span>
    </div>
  `;

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

// Cache simple para ventas cargadas (evita múltiples llamadas para la misma venta)
const saleCache = new Map();
const SALE_CACHE_TTL = 2 * 60 * 1000; // 2 minutos

async function getSaleWithCache(saleId) {
  const cached = saleCache.get(saleId);
  if (cached && (Date.now() - cached.timestamp) < SALE_CACHE_TTL) {
    return cached.data;
  }
  
  const sale = await API.sales.get(saleId);
  saleCache.set(saleId, { data: sale, timestamp: Date.now() });
  
  // Limpiar cache antiguo (mantener solo últimos 50)
  if (saleCache.size > 50) {
    const oldest = Array.from(saleCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    saleCache.delete(oldest[0]);
  }
  
  return sale;
}

async function printSaleFromHistorial(saleId) {
  try {
    const sale = await getSaleWithCache(saleId);
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
    const sale = await getSaleWithCache(saleId);
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

async function openEditPriceModal(item) {
  try {
    if (!current || !current._id) {
      alert('No hay venta activa');
      return;
    }
    
    const currentPrice = Number(item.unitPrice || 0);
    const itemName = item.name || 'Item';
    
    // Crear modal HTML
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.getElementById('modalClose');
    
    if (!modal || !modalBody) {
      alert('Error: No se pudo abrir el modal');
      return;
    }
    
    // Construir HTML del modal
    modalBody.innerHTML = `
      <div class="space-y-6">
        <div>
          <h2 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-2">
            Editar precio unitario
          </h2>
          <p class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
            ${htmlEscape(itemName)}
          </p>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">
              Precio actual
            </label>
            <div class="px-4 py-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg text-sm text-white dark:text-white theme-light:text-slate-900">
              ${money(currentPrice)}
            </div>
          </div>
          
          <div>
            <label for="edit-price-input" class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">
              Nuevo precio unitario
            </label>
            <input 
              type="number" 
              id="edit-price-input" 
              step="1"
              min="0"
              value="${currentPrice}"
              class="w-full px-4 py-2.5 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-lg"
              placeholder="Ingrese el nuevo precio"
              autofocus
            />
          </div>
        </div>
        
        <div class="flex gap-3 justify-end pt-4 border-t border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">
          <button 
            id="edit-price-cancel" 
            class="px-6 py-2.5 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-slate-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-900 font-semibold rounded-lg transition-all duration-200"
          >
            Cancelar
          </button>
          <button 
            id="edit-price-save" 
            class="px-6 py-2.5 bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-700 theme-light:bg-blue-500 theme-light:hover:bg-blue-600 text-white font-semibold rounded-lg transition-all duration-200"
          >
            Guardar
          </button>
        </div>
      </div>
    `;
    
    // Mostrar modal
    modal.classList.remove('hidden');
    
    // Referencias a elementos
    const priceInput = document.getElementById('edit-price-input');
    const cancelBtn = document.getElementById('edit-price-cancel');
    const saveBtn = document.getElementById('edit-price-save');
    
    // Función para cerrar modal
    const closeModal = () => {
      modal.classList.add('hidden');
    };
    
    // Event listeners
    cancelBtn.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    
    // Cerrar con ESC
    const escHandler = (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    
    // Guardar precio
    const savePrice = async () => {
      const newPrice = Number(priceInput.value || 0);
      
      if (newPrice < 0) {
        alert('El precio no puede ser negativo');
        priceInput.focus();
        return;
      }
      
      try {
        // Función para actualizar y renderizar
        async function updateSaleAndRender(updateFn) {
          try {
            await updateFn();
            syncCurrentIntoOpenList();
            await renderAll();
          } catch (err) {
            console.error('Error updating sale:', err);
            alert(err?.message || 'Error al actualizar');
          }
        }
        
        await updateSaleAndRender(async () => {
          current = await API.sales.updateItem(current._id, item._id, { unitPrice: newPrice });
        });
        
        closeModal();
        document.removeEventListener('keydown', escHandler);
      } catch (err) {
        console.error('Error actualizando precio:', err);
        alert('Error al actualizar precio: ' + (err?.message || 'Error desconocido'));
      }
    };
    
    saveBtn.addEventListener('click', savePrice);
    
    // Permitir guardar con Enter
    priceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        savePrice();
      }
    });
    
    // Enfocar el input y seleccionar todo el texto
    setTimeout(() => {
      priceInput.focus();
      priceInput.select();
    }, 100);
    
  } catch (err) {
    console.error('Error en openEditPriceModal:', err);
    alert('Error: ' + (err?.message || 'Error desconocido'));
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
  }
}

async function editTechnicianFromHistorial(saleId) {
  try {
    // Cargar técnicos si no están cargados
    if (!companyTechnicians || companyTechnicians.length === 0) {
      await loadTechnicians();
    }
    
    const sale = await getSaleWithCache(saleId);
    if (!sale) {
      alert('No se pudo cargar la venta');
      return;
    }
    
    const currentTechnician = sale?.technician || sale?.closingTechnician || '';
    const saleNumber = padSaleNumber(sale?.number || sale?._id || '');
    
    // Crear modal HTML
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.getElementById('modalClose');
    
    if (!modal || !modalBody) {
      alert('Error: No se pudo abrir el modal');
      return;
    }
    
    // Construir HTML del modal
    modalBody.innerHTML = `
      <div class="space-y-6">
        <div>
          <h2 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-2">
            Editar técnico
          </h2>
          <p class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
            Venta #${saleNumber}
          </p>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">
              Técnico actual
            </label>
            <div class="px-4 py-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg text-sm text-white dark:text-white theme-light:text-slate-900">
              ${currentTechnician || 'Sin asignar'}
            </div>
          </div>
          
          <div>
            <label for="edit-tech-select" class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">
              Seleccionar técnico
            </label>
            <select 
              id="edit-tech-select" 
              class="w-full px-4 py-2.5 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            >
              <option value="">-- Ninguno --</option>
              ${(companyTechnicians || []).map(t => 
                `<option value="${htmlEscape(t)}" ${t === currentTechnician ? 'selected' : ''}>${htmlEscape(t)}</option>`
              ).join('')}
              <option value="__ADD_TECH__">+ Agregar técnico nuevo…</option>
            </select>
          </div>
          
          <div id="edit-tech-add-section" class="hidden space-y-2">
            <label for="edit-tech-new-name" class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700">
              Nombre del nuevo técnico
            </label>
            <input 
              type="text" 
              id="edit-tech-new-name" 
              placeholder="Ingrese el nombre del técnico"
              class="w-full px-4 py-2.5 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>
        </div>
        
        <div class="flex gap-3 justify-end pt-4 border-t border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">
          <button 
            id="edit-tech-cancel" 
            class="px-6 py-2.5 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-slate-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-900 font-semibold rounded-lg transition-all duration-200"
          >
            Cancelar
          </button>
          <button 
            id="edit-tech-save" 
            class="px-6 py-2.5 bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-700 theme-light:bg-blue-500 theme-light:hover:bg-blue-600 text-white font-semibold rounded-lg transition-all duration-200"
          >
            Guardar
          </button>
        </div>
      </div>
    `;
    
    // Mostrar modal
    modal.classList.remove('hidden');
    
    // Referencias a elementos
    const selectEl = document.getElementById('edit-tech-select');
    const addSectionEl = document.getElementById('edit-tech-add-section');
    const newNameInputEl = document.getElementById('edit-tech-new-name');
    const cancelBtn = document.getElementById('edit-tech-cancel');
    const saveBtn = document.getElementById('edit-tech-save');
    
    // Manejar selección de "Agregar técnico nuevo"
    selectEl.addEventListener('change', () => {
      if (selectEl.value === '__ADD_TECH__') {
        addSectionEl.classList.remove('hidden');
        newNameInputEl.focus();
      } else {
        addSectionEl.classList.add('hidden');
      }
    });
    
    // Función para cerrar modal
    const closeModal = () => {
      modal.classList.add('hidden');
    };
    
    // Event listeners
    cancelBtn.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    
    // Cerrar con ESC
    const escHandler = (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
    
    // Guardar técnico
    saveBtn.addEventListener('click', async () => {
      let newTechnician = '';
      
      if (selectEl.value === '__ADD_TECH__') {
        // Agregar nuevo técnico
        const newName = String(newNameInputEl.value || '').trim();
        if (!newName) {
          alert('Por favor ingrese un nombre para el técnico');
          newNameInputEl.focus();
          return;
        }
        
        newTechnician = newName.toUpperCase();
        
        // Agregar técnico a la lista
        try {
          companyTechnicians = await API.company.addTechnician(newTechnician);
          techniciansCache = companyTechnicians;
          techniciansCacheTime = Date.now();
        } catch (err) {
          console.error('Error agregando técnico:', err);
          alert('Error al agregar técnico: ' + (err?.message || 'Error desconocido'));
          return;
        }
      } else {
        // Usar técnico seleccionado
        newTechnician = String(selectEl.value || '').trim().toUpperCase();
      }
      
      // Actualizar técnico en la venta cerrada
      try {
        await API.sales.updateClose(saleId, { technician: newTechnician });
        
        // Invalidar cache de la venta para que se recargue
        saleCache.delete(saleId);
        
        // Recargar el historial para mostrar el cambio
        await loadHistorial(true);
        
        closeModal();
        document.removeEventListener('keydown', escHandler);
      } catch (err) {
        console.error('Error actualizando técnico:', err);
        alert('Error al actualizar técnico: ' + (err?.message || 'Error desconocido'));
      }
    });
    
  } catch (err) {
    console.error('Error en editTechnicianFromHistorial:', err);
    alert('Error: ' + (err?.message || 'Error desconocido'));
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
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
    const sale = await getSaleWithCache(saleId);
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
  
  // CRÍTICO: Leer valores directamente de los inputs para garantizar precisión
  const body = document.getElementById('ecv-payments-body');
  if (!body) return;
  
  const rows = body.querySelectorAll('tr');
  let sum = 0;
  rows.forEach((row) => {
    const amtInput = row.querySelector('.ecv-payment-amount');
    if (amtInput) {
      // Limpiar y parsear el valor directamente del input
      const rawValue = String(amtInput.value || '0').replace(/[^0-9]/g, '');
      const amount = Math.round(Number(rawValue) || 0);
      sum += amount;
      
      // Sincronizar el objeto payment correspondiente
      const idx = parseInt(amtInput.dataset.idx);
      if (idx >= 0 && idx < payments.length) {
        payments[idx].amount = amount;
      }
    }
  });
  
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
      // CRÍTICO: Limpiar el valor removiendo cualquier carácter no numérico
      const rawValue = String(input.value || '0').replace(/[^0-9]/g, '');
      const numValue = Math.round(Number(rawValue) || 0);
      payments[idx].amount = numValue;
      // Asegurar que el input muestre el valor limpio
      if (input.value !== String(numValue)) {
        input.value = numValue;
      }
      updateEditPaymentsSummary(payments);
    });
    input.addEventListener('blur', () => {
      const idx = parseInt(input.dataset.idx);
      // CRÍTICO: Limpiar el valor al salir del campo también
      const rawValue = String(input.value || '0').replace(/[^0-9]/g, '');
      const numValue = Math.round(Number(rawValue) || 0);
      payments[idx].amount = numValue;
      input.value = numValue;
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

    // CRÍTICO: Leer valores directamente de los inputs para validar
    const body = document.getElementById('ecv-payments-body');
    if (!body) {
      msg.textContent = 'Error: No se encontró el cuerpo de pagos';
      msg.classList.add('error');
      return;
    }
    
    const rows = body.querySelectorAll('tr');
    let sum = 0;
    const validPayments = [];
    
    rows.forEach((row, idx) => {
      const amtInput = row.querySelector('.ecv-payment-amount');
      const methodSelect = row.querySelector('.ecv-payment-method');
      const accountSelect = row.querySelector('.ecv-payment-account');
      
      if (amtInput && methodSelect) {
        // Limpiar y parsear el valor directamente del input
        const rawValue = String(amtInput.value || '0').replace(/[^0-9]/g, '');
        const amount = Math.round(Number(rawValue) || 0);
        const method = String(methodSelect.value || '').trim().toUpperCase();
        
        // Sincronizar el objeto payment
        if (idx < payments.length) {
          payments[idx].amount = amount;
          payments[idx].method = method;
          if (accountSelect) {
            payments[idx].accountId = accountSelect.value || null;
          }
        }
        
        if (method && amount > 0) {
          sum += amount;
          validPayments.push(payments[idx] || { method, amount, accountId: null });
        }
      }
    });
    
    const total = Number(document.querySelector('#ecv-payments-block')?.closest('.space-y-4')?.querySelector('strong')?.textContent?.replace(/[^0-9]/g, '') || 0);
    
    if (Math.abs(sum - total) > 0.01) {
      msg.textContent = `La suma de pagos (${money(sum)}) no coincide con el total (${money(total)}). Diferencia: ${money(Math.abs(sum - total))}.`;
      msg.classList.add('error');
      return;
    }

    const filtered = validPayments;
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

      // CRÍTICO: Leer valores directamente de los inputs una vez más antes de enviar
      const paymentMethodsToSend = [];
      rows.forEach((row, idx) => {
        const amtInput = row.querySelector('.ecv-payment-amount');
        const methodSelect = row.querySelector('.ecv-payment-method');
        const accountSelect = row.querySelector('.ecv-payment-account');
        
        if (amtInput && methodSelect) {
          const rawValue = String(amtInput.value || '0').replace(/[^0-9]/g, '');
          const amount = Math.round(Number(rawValue) || 0);
          const method = String(methodSelect.value || '').trim().toUpperCase();
          const isCredit = method === 'CREDITO' || method === 'CRÉDITO';
          
          if (method && amount > 0) {
            paymentMethodsToSend.push({
              method: method,
              amount: amount,
              accountId: isCredit ? null : (accountSelect?.value || null)
            });
          }
        }
      });
      
      const payload = {
        paymentMethods: paymentMethodsToSend,
        laborCommissions: comm,
        paymentReceiptUrl: receiptUrl
      };

      await API.sales.updateClose(saleId, payload);
      msg.textContent = 'Venta actualizada correctamente';
      msg.classList.remove('error');
      
      setTimeout(() => {
        document.getElementById('modal')?.classList.add('hidden');
        // Recargar historial si estamos en esa vista (invalidar cache)
        if (!document.getElementById('sales-view-historial')?.classList.contains('hidden')) {
          historialCache = null;
          loadHistorial(true);
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

// ========== REPORTE DE VENTAS ==========

function openReportModal() {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modalBody');
  if(!modal||!body) return;
  
  const div = document.createElement('div');
  div.innerHTML = `<div class="space-y-4">
    <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">📊 Generar Reporte de Ventas</h3>
    <p class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-4">
      Selecciona el rango de fechas para generar un reporte completo con estadísticas de ventas, flujo de caja, cartera, inventario y mano de obra.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Fecha desde</label>
        <input id='report-fecha-desde' type='date' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"/>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Fecha hasta</label>
        <input id='report-fecha-hasta' type='date' class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"/>
      </div>
    </div>
    <div class="flex gap-2 mt-6">
      <button id='report-generar' class="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-600 to-green-700 dark:from-green-600 dark:to-green-700 theme-light:from-green-500 theme-light:to-green-600 hover:from-green-700 hover:to-green-800 dark:hover:from-green-700 dark:hover:to-green-800 theme-light:hover:from-green-600 theme-light:hover:to-green-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">📊 Generar Reporte</button>
      <button id='report-cancel' class="px-4 py-2.5 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
    </div>
    <div id='report-msg' class="mt-2 text-xs text-slate-300 dark:text-slate-300 theme-light:text-slate-600"></div>
  </div>`;
  
  body.innerHTML=''; body.appendChild(div); modal.classList.remove('hidden');
  
  const fechaDesdeInput = div.querySelector('#report-fecha-desde');
  const fechaHastaInput = div.querySelector('#report-fecha-hasta');
  const msgEl = div.querySelector('#report-msg');
  const generarBtn = div.querySelector('#report-generar');
  const cancelBtn = div.querySelector('#report-cancel');
  
  // Establecer fechas por defecto (último mes)
  const hoy = new Date();
  const haceUnMes = new Date();
  haceUnMes.setMonth(haceUnMes.getMonth() - 1);
  
  fechaDesdeInput.value = haceUnMes.toISOString().split('T')[0];
  fechaHastaInput.value = hoy.toISOString().split('T')[0];
  
  cancelBtn.onclick = () => modal.classList.add('hidden');
  
  generarBtn.onclick = async () => {
    const desde = fechaDesdeInput?.value;
    const hasta = fechaHastaInput?.value;
    
    if(!desde || !hasta) {
      msgEl.textContent = '⚠️ Selecciona ambas fechas';
      msgEl.style.color = '#ef4444';
      return;
    }
    
    if(new Date(desde) > new Date(hasta)) {
      msgEl.textContent = '⚠️ La fecha desde debe ser anterior a la fecha hasta';
      msgEl.style.color = '#ef4444';
      return;
    }
    
    msgEl.textContent = 'Generando reporte...';
    msgEl.style.color = '#3b82f6';
    generarBtn.disabled = true;
    
    try {
      await generateReport(desde, hasta);
      modal.classList.add('hidden');
    } catch(err) {
      msgEl.textContent = '❌ ' + (err?.message || 'Error al generar reporte');
      msgEl.style.color = '#ef4444';
      generarBtn.disabled = false;
    }
  };
}

async function generateReport(fechaDesde, fechaHasta) {
  // Mostrar loading
  const viewHistorial = document.getElementById('sales-view-historial');
  if(!viewHistorial) return;
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  loadingDiv.innerHTML = `
    <div class="bg-slate-800 rounded-xl p-8 shadow-2xl border border-slate-700">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
        <div class="text-white text-lg font-semibold">Generando reporte...</div>
        <div class="text-slate-400 text-sm mt-2">Esto puede tomar unos momentos</div>
      </div>
    </div>
  `;
  document.body.appendChild(loadingDiv);
  
  try {
    // Recopilar todos los datos en paralelo
    const [salesData, cashflowData, receivablesData, inventoryData, calendarData, techniciansData, accountsBalances] = await Promise.all([
      // Ventas
      API.sales.list({ status: 'closed', from: fechaDesde, to: fechaHasta, limit: 10000 }),
      // Flujo de caja
      API.cashflow.list({ from: fechaDesde, to: fechaHasta, limit: 10000 }),
      // Cartera
      API.receivables.list({ from: fechaDesde, to: fechaHasta, limit: 10000 }),
      // Inventario
      API.inventory.itemsList({ limit: 10000 }),
      // Calendario/Agendas
      API.calendar.list({ from: fechaDesde, to: fechaHasta }),
      // Técnicos
      API.company.getTechnicians(),
      // Valores de caja actuales (balances de todas las cuentas)
      API.accounts.balances()
    ]);
    
    const sales = Array.isArray(salesData?.items) ? salesData.items : [];
    const cashflowEntries = Array.isArray(cashflowData?.items) ? cashflowData.items : [];
    const receivables = Array.isArray(receivablesData) ? receivablesData : [];
    const inventoryItems = Array.isArray(inventoryData) ? inventoryData : [];
    const appointments = Array.isArray(calendarData) ? calendarData : [];
    const technicians = Array.isArray(techniciansData) ? techniciansData : [];
    const currentCashBalances = Array.isArray(accountsBalances?.balances) ? accountsBalances.balances : [];
    const currentCashTotal = accountsBalances?.total || 0;
    
    // Procesar datos
    const reportData = processReportData(sales, cashflowEntries, receivables, inventoryItems, appointments, technicians, fechaDesde, fechaHasta, currentCashBalances, currentCashTotal);
    
    // Mostrar reporte
    showReport(reportData, fechaDesde, fechaHasta);
    
  } catch(err) {
    console.error('Error generando reporte:', err);
    alert('Error al generar reporte: ' + (err?.message || 'Error desconocido'));
  } finally {
    loadingDiv.remove();
  }
}

function processReportData(sales, cashflowEntries, receivables, inventoryItems, appointments, technicians, fechaDesde, fechaHasta, currentCashBalances = [], currentCashTotal = 0) {
  const money = (n) => '$' + Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  
  // 1. Estadísticas de ventas
  const totalVentas = sales.length;
  const totalIngresos = sales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  
  // 2. Ingresos por cuenta
  const ingresosPorCuenta = {};
  cashflowEntries
    .filter(e => e.kind === 'IN')
    .forEach(e => {
      const accountName = e.accountId?.name || e.accountName || 'Sin cuenta';
      ingresosPorCuenta[accountName] = (ingresosPorCuenta[accountName] || 0) + (Number(e.amount) || 0);
    });
  
  // 3. Valor en cartera (solo pendientes y parciales, usar balance)
  const valorCartera = receivables
    .filter(r => r.status === 'pending' || r.status === 'partial')
    .reduce((sum, r) => {
      // Usar balance si existe, sino calcularlo
      const balance = Number(r.balance) || (Number(r.totalAmount) || 0) - (Number(r.paidAmount) || 0);
      return sum + Math.max(0, balance); // Asegurar que no sea negativo
    }, 0);
  
  // 4. Detalle de deudores (para el reporte de cartera)
  const deudores = receivables
    .filter(r => r.status === 'pending' || r.status === 'partial')
    .map(r => {
      const balance = Number(r.balance) || (Number(r.totalAmount) || 0) - (Number(r.paidAmount) || 0);
      return {
        cliente: r.customer?.name || 'Sin nombre',
        identificacion: r.customer?.idNumber || '-',
        placa: r.vehicle?.plate || '-',
        venta: r.saleNumber || r.saleId?.number || '-',
        total: Number(r.totalAmount) || 0,
        pagado: Number(r.paidAmount) || 0,
        pendiente: Math.max(0, balance),
        estado: r.status === 'pending' ? 'Pendiente' : 'Parcial',
        fecha: r.createdAt || r.dueDate || null
      };
    })
    .sort((a, b) => b.pendiente - a.pendiente); // Ordenar por monto pendiente descendente
  
  // 5. Ítems que salieron del inventario (de ventas)
  const itemsSalidos = {};
  sales.forEach(sale => {
    sale.items?.forEach(item => {
      if(item.source === 'inventory' && item.refId) {
        const itemId = String(item.refId);
        itemsSalidos[itemId] = (itemsSalidos[itemId] || 0) + (Number(item.qty) || 0);
      }
    });
  });
  
  // 6. Ítems que necesitan restock
  const itemsNecesitanRestock = inventoryItems
    .filter(item => {
      const stock = Number(item.stock) || 0;
      const minStock = Number(item.minStock) || 0;
      return stock <= minStock && minStock > 0;
    })
    .map(item => ({
      name: item.name || 'Sin nombre',
      sku: item.sku || '-',
      stock: Number(item.stock) || 0,
      minStock: Number(item.minStock) || 0
    }));
  
  // 7. Dinero que entró y salió (flujo de caja)
  const dineroEntrado = cashflowEntries
    .filter(e => e.kind === 'IN')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  
  const dineroSalido = cashflowEntries
    .filter(e => e.kind === 'OUT')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  
  // 8. Mano de obra por técnico
  const manoObraPorTecnico = {};
  const tipoManoObra = {};
  
  sales.forEach(sale => {
    const technician = sale.closingTechnician || sale.technician || 'Sin técnico';
    sale.items?.forEach(item => {
      if(item.source === 'service') {
        const laborValue = Number(item.total) || 0;
        manoObraPorTecnico[technician] = (manoObraPorTecnico[technician] || 0) + laborValue;
        
        const tipo = item.name || 'Servicio';
        tipoManoObra[tipo] = (tipoManoObra[tipo] || 0) + laborValue;
      }
    });
  });
  
  // Calcular porcentajes de técnicos (asumiendo que cada técnico tiene un porcentaje configurado)
  // Por ahora, asumimos 70% técnico, 30% empresa (esto debería venir de configuración)
  const porcentajeTecnico = 70;
  const porcentajeEmpresa = 30;
  
  const manoObraDetalle = Object.entries(manoObraPorTecnico).map(([tech, total]) => ({
    tecnico: tech,
    total: total,
    porcentajeTecnico: porcentajeTecnico,
    montoTecnico: (total * porcentajeTecnico) / 100,
    porcentajeEmpresa: porcentajeEmpresa,
    montoEmpresa: (total * porcentajeEmpresa) / 100
  }));
  
  // Tipo de mano de obra más usado
  const tipoMasUsado = Object.entries(tipoManoObra)
    .sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];
  
  // 9. Número de agendas
  const totalAgendas = appointments.length;
  
  return {
    periodo: { desde: fechaDesde, hasta: fechaHasta },
    ventas: {
      total: totalVentas,
      ingresos: totalIngresos
    },
    ingresosPorCuenta,
    cartera: {
      valor: valorCartera,
      deudores: deudores,
      totalDeudores: deudores.length
    },
    itemsSalidos,
    itemsNecesitanRestock,
    flujoCaja: {
      entrada: dineroEntrado,
      salida: dineroSalido,
      neto: dineroEntrado - dineroSalido
    },
    manoObra: {
      porTecnico: manoObraDetalle,
      tipoMasUsado: {
        nombre: tipoMasUsado[0],
        monto: tipoMasUsado[1]
      },
      porcentajeTecnico,
      porcentajeEmpresa
    },
    agendas: {
      total: totalAgendas
    },
    valoresCajaActuales: {
      cuentas: currentCashBalances.map(acc => ({
        nombre: acc.name || 'Sin nombre',
        balance: Number(acc.balance) || 0,
        tipo: acc.type || 'CASH'
      })),
      total: currentCashTotal
    }
  };
}

// Helper para escapar HTML en reportes
function escapeHtmlReport(str) {
  if(!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showReport(reportData, fechaDesde, fechaHasta) {
  const viewHistorial = document.getElementById('sales-view-historial');
  if(!viewHistorial) return;
  
  const money = (n) => '$' + Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  
  // Crear contenedor del reporte
  const reportContainer = document.createElement('div');
  reportContainer.id = 'report-container';
  reportContainer.className = 'space-y-6';
  
  reportContainer.innerHTML = `
    <!-- Header del reporte -->
    <div class="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 rounded-xl shadow-lg border border-blue-500/50 p-6 mb-6">
      <div class="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h2 class="text-2xl font-bold text-white mb-2">📊 Reporte de Ventas</h2>
          <p class="text-blue-100 text-sm">Período: ${new Date(fechaDesde).toLocaleDateString('es-CO')} - ${new Date(fechaHasta).toLocaleDateString('es-CO')}</p>
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <button id="report-download-image" class="px-4 py-2 bg-green-600/80 hover:bg-green-600 text-white font-semibold rounded-lg transition-all duration-200 whitespace-nowrap">
            🖨️ Imprimir Reporte
          </button>
        </div>
      </div>
      <!-- Opciones de selección para imprimir reporte -->
      <div class="mt-4 pt-4 border-t border-blue-500/30">
        <p class="text-blue-100 text-xs mb-3 font-semibold">Selecciona las secciones a incluir en el reporte:</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <label class="report-checkbox-label flex items-center gap-2 text-blue-100 text-xs cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" class="report-section-checkbox" data-section="resumen" checked>
            <span>Resumen</span>
          </label>
          <label class="report-checkbox-label flex items-center gap-2 text-blue-100 text-xs cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" class="report-section-checkbox" data-section="cartera" checked>
            <span>Cartera</span>
          </label>
          <label class="report-checkbox-label flex items-center gap-2 text-blue-100 text-xs cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" class="report-section-checkbox" data-section="ingresos" checked>
            <span>Ingresos</span>
          </label>
          <label class="report-checkbox-label flex items-center gap-2 text-blue-100 text-xs cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" class="report-section-checkbox" data-section="flujo" checked>
            <span>Flujo Caja</span>
          </label>
          <label class="report-checkbox-label flex items-center gap-2 text-blue-100 text-xs cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" class="report-section-checkbox" data-section="manoobra" checked>
            <span>Mano Obra</span>
          </label>
          <label class="report-checkbox-label flex items-center gap-2 text-blue-100 text-xs cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" class="report-section-checkbox" data-section="grafico" checked>
            <span>Gráfico</span>
          </label>
          <label class="report-checkbox-label flex items-center gap-2 text-blue-100 text-xs cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" class="report-section-checkbox" data-section="restock" checked>
            <span>Restock</span>
          </label>
        </div>
      </div>
    </div>
    
    <!-- Resumen general -->
    <div id="report-section-resumen" class="report-section grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-4">
        <div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Total Ventas</div>
        <div class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900">${reportData.ventas.total}</div>
      </div>
      <div class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-4">
        <div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Ingresos Totales</div>
        <div class="text-2xl font-bold text-green-400 dark:text-green-400 theme-light:text-green-600">${money(reportData.ventas.ingresos)}</div>
      </div>
      <div class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-4">
        <div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Valor en Cartera</div>
        <div class="text-2xl font-bold text-yellow-400 dark:text-yellow-400 theme-light:text-yellow-600">${money(reportData.cartera.valor)}</div>
        <div class="text-xs text-slate-500 dark:text-slate-500 theme-light:text-slate-500 mt-1">${reportData.cartera.totalDeudores} cuenta(s) pendiente(s)</div>
      </div>
      <div class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-4">
        <div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Total Agendas</div>
        <div class="text-2xl font-bold text-blue-400 dark:text-blue-400 theme-light:text-blue-600">${reportData.agendas.total}</div>
      </div>
    </div>
    
    <!-- Reporte de Cartera -->
    <div id="report-section-cartera" class="report-section bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
      <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">💼 Reporte de Cartera</h3>
      <div class="mb-4 p-4 bg-yellow-600/20 dark:bg-yellow-600/20 theme-light:bg-yellow-50 rounded-lg border border-yellow-600/30">
        <div class="text-sm text-yellow-400 dark:text-yellow-400 theme-light:text-yellow-600 mb-1">Valor Total en Cartera</div>
        <div class="text-2xl font-bold text-yellow-400 dark:text-yellow-400 theme-light:text-yellow-600">${money(reportData.cartera.valor)}</div>
        <div class="text-xs text-yellow-300 dark:text-yellow-300 theme-light:text-yellow-700 mt-1">${reportData.cartera.totalDeudores} cuenta(s) pendiente(s)</div>
      </div>
      ${reportData.cartera.deudores.length > 0 ? `
        <div class="max-h-96 overflow-y-auto custom-scrollbar">
          <table class="w-full text-sm border-collapse">
            <thead class="sticky top-0 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100 z-10">
              <tr class="border-b-2 border-slate-600/70 dark:border-slate-600/70 theme-light:border-slate-400">
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Cliente</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">ID</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Placa</th>
                <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Venta</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Total</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Pagado</th>
                <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 border-r border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">Pendiente</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${reportData.cartera.deudores.map(d => `
                <tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-50">
                  <td class="px-4 py-3 text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${escapeHtmlReport(d.cliente)}</td>
                  <td class="px-4 py-3 text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${escapeHtmlReport(d.identificacion)}</td>
                  <td class="px-4 py-3 text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 font-mono">${escapeHtmlReport(d.placa)}</td>
                  <td class="px-4 py-3 text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${escapeHtmlReport(d.venta)}</td>
                  <td class="px-4 py-3 text-right text-white dark:text-white theme-light:text-slate-900 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${money(d.total)}</td>
                  <td class="px-4 py-3 text-right text-green-400 dark:text-green-400 theme-light:text-green-600 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">${money(d.pagado)}</td>
                  <td class="px-4 py-3 text-right text-red-400 dark:text-red-400 theme-light:text-red-600 border-r border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 font-semibold">${money(d.pendiente)}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="px-2 py-1 text-xs rounded ${d.estado === 'Pendiente' ? 'bg-yellow-600/20 dark:bg-yellow-600/20 theme-light:bg-yellow-50 text-yellow-400 dark:text-yellow-400 theme-light:text-yellow-600' : 'bg-blue-600/20 dark:bg-blue-600/20 theme-light:bg-blue-50 text-blue-400 dark:text-blue-400 theme-light:text-blue-600'}">
                      ${d.estado}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-center py-4">No hay cuentas pendientes</p>'}
    </div>
    
    <!-- Ingresos por cuenta -->
    <div id="report-section-ingresos" class="report-section bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
      <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">💰 Ingresos por Cuenta</h3>
      <div class="space-y-2">
        ${Object.entries(reportData.ingresosPorCuenta).map(([cuenta, monto]) => `
          <div class="flex justify-between items-center p-3 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-white rounded-lg">
            <span class="text-white dark:text-white theme-light:text-slate-900 font-medium">${escapeHtmlReport(cuenta)}</span>
            <span class="text-green-400 dark:text-green-400 theme-light:text-green-600 font-semibold">${money(monto)}</span>
          </div>
        `).join('')}
        ${Object.keys(reportData.ingresosPorCuenta).length === 0 ? '<p class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-center py-4">No hay ingresos registrados</p>' : ''}
      </div>
    </div>
    
    <!-- Valores de Caja Actuales -->
    <div id="report-section-caja-actual" class="report-section bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
      <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">💵 Valores de Caja Actuales</h3>
      <div class="space-y-2 mb-4">
        ${(reportData.valoresCajaActuales?.cuentas || []).map(cuenta => `
          <div class="flex justify-between items-center p-3 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-white rounded-lg">
            <span class="text-white dark:text-white theme-light:text-slate-900 font-medium">${escapeHtmlReport(cuenta.nombre)}</span>
            <span class="text-blue-400 dark:text-blue-400 theme-light:text-blue-600 font-semibold">${money(cuenta.balance)}</span>
          </div>
        `).join('')}
        ${(!reportData.valoresCajaActuales?.cuentas || reportData.valoresCajaActuales.cuentas.length === 0) ? '<p class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 text-center py-4">No hay cuentas registradas</p>' : ''}
      </div>
      <div class="p-4 bg-blue-600/20 dark:bg-blue-600/20 theme-light:bg-blue-50 rounded-lg border border-blue-600/30 mt-4">
        <div class="text-sm text-blue-400 dark:text-blue-400 theme-light:text-blue-600 mb-1">Total en Caja</div>
        <div class="text-2xl font-bold text-blue-400 dark:text-blue-400 theme-light:text-blue-600">${money(reportData.valoresCajaActuales?.total || 0)}</div>
      </div>
    </div>
    
    <!-- Flujo de caja -->
    <div id="report-section-flujo" class="report-section bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
      <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">💵 Flujo de Caja</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="p-4 bg-green-600/20 dark:bg-green-600/20 theme-light:bg-green-50 rounded-lg border border-green-600/30">
          <div class="text-sm text-green-400 dark:text-green-400 theme-light:text-green-600 mb-1">Entradas</div>
          <div class="text-xl font-bold text-green-400 dark:text-green-400 theme-light:text-green-600">${money(reportData.flujoCaja.entrada)}</div>
        </div>
        <div class="p-4 bg-red-600/20 dark:bg-red-600/20 theme-light:bg-red-50 rounded-lg border border-red-600/30">
          <div class="text-sm text-red-400 dark:text-red-400 theme-light:text-red-600 mb-1">Salidas</div>
          <div class="text-xl font-bold text-red-400 dark:text-red-400 theme-light:text-red-600">${money(reportData.flujoCaja.salida)}</div>
        </div>
        <div class="p-4 bg-blue-600/20 dark:bg-blue-600/20 theme-light:bg-blue-50 rounded-lg border border-blue-600/30">
          <div class="text-sm text-blue-400 dark:text-blue-400 theme-light:text-blue-600 mb-1">Neto</div>
          <div class="text-xl font-bold text-blue-400 dark:text-blue-400 theme-light:text-blue-600">${money(reportData.flujoCaja.neto)}</div>
        </div>
      </div>
    </div>
    
    <!-- Mano de obra por técnico -->
    <div id="report-section-manoobra" class="report-section bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
      <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">👷 Mano de Obra por Técnico</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="border-b-2 border-slate-600/70">
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 border-r border-slate-700/50">Técnico</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 border-r border-slate-700/50">Total</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 border-r border-slate-700/50">${reportData.manoObra.porcentajeTecnico}% Técnico</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300">${reportData.manoObra.porcentajeEmpresa}% Empresa</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.manoObra.porTecnico.map(t => `
              <tr class="border-b border-slate-700/30">
                <td class="px-4 py-3 text-white border-r border-slate-700/30">${escapeHtmlReport(t.tecnico)}</td>
                <td class="px-4 py-3 text-right text-white border-r border-slate-700/30">${money(t.total)}</td>
                <td class="px-4 py-3 text-right text-green-400 border-r border-slate-700/30">${money(t.montoTecnico)}</td>
                <td class="px-4 py-3 text-right text-blue-400">${money(t.montoEmpresa)}</td>
              </tr>
            `).join('')}
            ${reportData.manoObra.porTecnico.length === 0 ? '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-400">No hay datos de mano de obra</td></tr>' : ''}
          </tbody>
        </table>
      </div>
      <div class="mt-4 p-4 bg-purple-600/20 dark:bg-purple-600/20 theme-light:bg-purple-50 rounded-lg border border-purple-600/30">
        <div class="text-sm text-purple-400 dark:text-purple-400 theme-light:text-purple-600 mb-1">Tipo de Mano de Obra Más Usado</div>
        <div class="text-lg font-bold text-purple-400 dark:text-purple-400 theme-light:text-purple-600">${escapeHtmlReport(reportData.manoObra.tipoMasUsado.nombre)} - ${money(reportData.manoObra.tipoMasUsado.monto)}</div>
      </div>
    </div>
    
    <!-- Gráfico de pastel para mano de obra -->
    <div id="report-section-grafico" class="report-section bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
      <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">📊 Distribución de Mano de Obra</h3>
      <div class="flex justify-center">
        <canvas id="manoObraChart" style="max-width: 400px; max-height: 400px;"></canvas>
      </div>
    </div>
    
    <!-- Ítems que necesitan restock -->
    <div id="report-section-restock" class="report-section bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6">
      <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">⚠️ Ítems que Necesitan Restock</h3>
      <div class="max-h-64 overflow-y-auto custom-scrollbar">
        <table class="w-full text-sm border-collapse">
          <thead class="sticky top-0 bg-slate-900/50 z-10">
            <tr class="border-b-2 border-slate-600/70">
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 border-r border-slate-700/50">SKU</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-300 border-r border-slate-700/50">Nombre</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300 border-r border-slate-700/50">Stock Actual</th>
              <th class="px-4 py-3 text-right text-xs font-semibold text-slate-300">Stock Mínimo</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.itemsNecesitanRestock.map(item => `
              <tr class="border-b border-slate-700/30">
                <td class="px-4 py-3 text-white border-r border-slate-700/30">${escapeHtmlReport(item.sku)}</td>
                <td class="px-4 py-3 text-white border-r border-slate-700/30">${escapeHtmlReport(item.name)}</td>
                <td class="px-4 py-3 text-right text-red-400 border-r border-slate-700/30">${item.stock}</td>
                <td class="px-4 py-3 text-right text-yellow-400">${item.minStock}</td>
              </tr>
            `).join('')}
            ${reportData.itemsNecesitanRestock.length === 0 ? '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-400">Todos los ítems tienen stock suficiente</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Botón para volver -->
    <div class="flex justify-center">
      <button id="report-volver" class="px-6 py-3 bg-slate-700/50 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all duration-200">
        ← Volver al Historial
      </button>
    </div>
  `;
  
  // Reemplazar contenido del historial con el reporte
  viewHistorial.innerHTML = '';
  viewHistorial.appendChild(reportContainer);
  
  // Configurar eventos
  document.getElementById('report-volver')?.addEventListener('click', () => {
    loadHistorial(true);
  });
  
  document.getElementById('report-download-image')?.addEventListener('click', () => {
    exportReportAsImage(reportData, fechaDesde, fechaHasta);
  });
  
  // Crear gráfico de pastel
  setTimeout(() => {
    createManoObraChart(reportData.manoObra.porTecnico);
  }, 100);
}

// Función simplificada para exportar reporte como imagen/PDF
function exportReportAsImage(reportData, fechaDesde, fechaHasta) {
  // Obtener secciones seleccionadas
  const checkboxes = document.querySelectorAll('.report-section-checkbox:checked');
  const selectedSections = Array.from(checkboxes).map(cb => cb.dataset.section);
  
  if (selectedSections.length === 0) {
    alert('Por favor selecciona al menos una sección para imprimir');
    return;
  }
  
  // Guardar datos en sessionStorage para que la nueva página los lea
  try {
    sessionStorage.setItem('reportExportData', JSON.stringify(reportData));
    sessionStorage.setItem('reportExportSections', JSON.stringify(selectedSections));
    sessionStorage.setItem('reportExportFechaDesde', fechaDesde instanceof Date ? fechaDesde.toISOString() : new Date(fechaDesde).toISOString());
    sessionStorage.setItem('reportExportFechaHasta', fechaHasta instanceof Date ? fechaHasta.toISOString() : new Date(fechaHasta).toISOString());
    
    // Abrir nueva ventana con la página de exportación
    const exportWindow = window.open('reporte-export.html', '_blank');
    
    if (!exportWindow) {
      alert('Por favor permite ventanas emergentes para exportar el reporte');
      return;
    }
    
    // Mostrar mensaje al usuario
    const btn = document.getElementById('report-download-image');
    const originalText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '📄 Abriendo página de impresión...';
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = originalText;
      }, 2000);
    }
  } catch (error) {
    console.error('Error al exportar reporte:', error);
    alert('Error al exportar reporte: ' + (error.message || 'Error desconocido'));
  }
}

function createManoObraChart(manoObraData) {
  const canvas = document.getElementById('manoObraChart');
  if(!canvas || !window.Chart) return;
  
  const ctx = canvas.getContext('2d');
  
  const labels = manoObraData.map(t => t.tecnico);
  const data = manoObraData.map(t => t.total);
  
  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#3b82f6',
          '#10b981',
          '#f59e0b',
          '#ef4444',
          '#8b5cf6',
          '#ec4899',
          '#06b6d4'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#e5e7eb',
            font: {
              size: 12
            }
          }
        }
      }
    }
  });
}

function downloadReportPDF(reportData, fechaDesde, fechaHasta) {
  if(!window.jspdf?.jsPDF) {
    alert('Error: jsPDF no está disponible');
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const money = (n) => '$' + Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  
  let yPos = 20;
  
  // Título
  doc.setFontSize(20);
  doc.text('Reporte de Ventas', 105, yPos, { align: 'center' });
  yPos += 10;
  
  doc.setFontSize(12);
  doc.text(`Período: ${new Date(fechaDesde).toLocaleDateString('es-CO')} - ${new Date(fechaHasta).toLocaleDateString('es-CO')}`, 105, yPos, { align: 'center' });
  yPos += 15;
  
  // Resumen general
  doc.setFontSize(16);
  doc.text('Resumen General', 14, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.text(`Total Ventas: ${reportData.ventas.total}`, 14, yPos);
  yPos += 6;
  doc.text(`Ingresos Totales: ${money(reportData.ventas.ingresos)}`, 14, yPos);
  yPos += 6;
  doc.text(`Valor en Cartera: ${money(reportData.cartera.valor)}`, 14, yPos);
  yPos += 6;
  doc.text(`Total Agendas: ${reportData.agendas.total}`, 14, yPos);
  yPos += 10;
  
  // Ingresos por cuenta
  if(Object.keys(reportData.ingresosPorCuenta).length > 0) {
    doc.setFontSize(14);
    doc.text('Ingresos por Cuenta', 14, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    Object.entries(reportData.ingresosPorCuenta).forEach(([cuenta, monto]) => {
      if(yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(`${cuenta}: ${money(monto)}`, 20, yPos);
      yPos += 6;
    });
    yPos += 5;
  }
  
  // Flujo de caja
  doc.setFontSize(14);
  if(yPos > 270) {
    doc.addPage();
    yPos = 20;
  }
  doc.text('Flujo de Caja', 14, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.text(`Entradas: ${money(reportData.flujoCaja.entrada)}`, 14, yPos);
  yPos += 6;
  doc.text(`Salidas: ${money(reportData.flujoCaja.salida)}`, 14, yPos);
  yPos += 6;
  doc.text(`Neto: ${money(reportData.flujoCaja.neto)}`, 14, yPos);
  yPos += 10;
  
  // Mano de obra
  if(reportData.manoObra.porTecnico.length > 0) {
    doc.setFontSize(14);
    if(yPos > 270) {
      doc.addPage();
      yPos = 20;
    }
    doc.text('Mano de Obra por Técnico', 14, yPos);
    yPos += 8;
    
    const tableData = reportData.manoObra.porTecnico.map(t => [
      t.tecnico,
      money(t.total),
      money(t.montoTecnico),
      money(t.montoEmpresa)
    ]);
    
    doc.autoTable({
      startY: yPos,
      head: [['Técnico', 'Total', `${reportData.manoObra.porcentajeTecnico}% Técnico`, `${reportData.manoObra.porcentajeEmpresa}% Empresa`]],
      body: tableData,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
    
    if(yPos > 270) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(10);
    doc.text(`Tipo más usado: ${reportData.manoObra.tipoMasUsado.nombre} - ${money(reportData.manoObra.tipoMasUsado.monto)}`, 14, yPos);
    yPos += 10;
  }
  
  // Reporte de cartera
  if(reportData.cartera.deudores.length > 0) {
    doc.setFontSize(14);
    if(yPos > 270) {
      doc.addPage();
      yPos = 20;
    }
    doc.text('Reporte de Cartera', 14, yPos);
    yPos += 8;
    
    doc.setFontSize(10);
    doc.text(`Valor Total en Cartera: ${money(reportData.cartera.valor)}`, 14, yPos);
    yPos += 6;
    doc.text(`Total de Deudores: ${reportData.cartera.totalDeudores}`, 14, yPos);
    yPos += 10;
    
    const carteraData = reportData.cartera.deudores.map(d => [
      d.cliente.substring(0, 20),
      d.placa || '-',
      d.venta || '-',
      money(d.total),
      money(d.pagado),
      money(d.pendiente),
      d.estado
    ]);
    
    doc.autoTable({
      startY: yPos,
      head: [['Cliente', 'Placa', 'Venta', 'Total', 'Pagado', 'Pendiente', 'Estado']],
      body: carteraData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [234, 179, 8] },
      columnStyles: {
        5: { fontStyle: 'bold', textColor: [239, 68, 68] }
      }
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
  }
  
  // Ítems que necesitan restock
  if(reportData.itemsNecesitanRestock.length > 0) {
    doc.setFontSize(14);
    if(yPos > 270) {
      doc.addPage();
      yPos = 20;
    }
    doc.text('Ítems que Necesitan Restock', 14, yPos);
    yPos += 8;
    
    const restockData = reportData.itemsNecesitanRestock.map(item => [
      item.sku,
      item.name.substring(0, 30),
      String(item.stock),
      String(item.minStock)
    ]);
    
    doc.autoTable({
      startY: yPos,
      head: [['SKU', 'Nombre', 'Stock Actual', 'Stock Mínimo']],
      body: restockData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [239, 68, 68] }
    });
  }
  
  // Descargar
  const fileName = `reporte-ventas-${fechaDesde}-${fechaHasta}.pdf`;
  doc.save(fileName);
}


