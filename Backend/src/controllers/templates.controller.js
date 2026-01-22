import Template from '../models/Template.js';
import Sale from '../models/Sale.js';
import Quote from '../models/Quote.js';
import Company from '../models/Company.js';
import Order from '../models/Order.js';
import Item from '../models/Item.js';
import PriceEntry from '../models/PriceEntry.js';
import PayrollSettlement from '../models/PayrollSettlement.js';
import PayrollPeriod from '../models/PayrollPeriod.js';
import Handlebars from 'handlebars';
import QRCode from 'qrcode';

const TEMPLATE_DEBUG = process.env.DEBUG_TEMPLATES === 'true';
const debugLog = (...args) => { if (TEMPLATE_DEBUG) console.log(...args); };
const debugWarn = (...args) => { if (TEMPLATE_DEBUG) console.warn(...args); };

// ===== Helpers específicos para stickers (5cm x 3cm, motor basado en layout) =====
function isStickerType(type = '') {
  const t = String(type || '').toLowerCase();
  return t === 'sticker' || t === 'sticker-qr' || t === 'sticker-brand';
}

// Genera HTML imprimible a partir de un layout de sticker (coordenadas en px dentro de un canvas lógico 5cm x 3cm)
// El HTML resultante se envuelve en .sticker-wrapper y usa contexto Handlebars (ctx.item.*) para los datos dinámicos
function buildStickerHtmlFromLayout(rawLayout = {}, rawMeta = {}) {
  const layout = rawLayout && typeof rawLayout === 'object' ? rawLayout : {};
  const elements = Array.isArray(layout.elements) ? layout.elements : [];

  // CRÍTICO: Forzar valores exactos (5cm y 3cm) para evitar problemas de precisión
  // Si viene width/height en meta, usarlos, pero siempre redondear a valores exactos
  let widthCm = Number(rawMeta.width) || Number(layout.widthCm) || Number(layout.width) || 5;
  let heightCm = Number(rawMeta.height) || Number(layout.heightCm) || Number(layout.height) || 3;
  
  // CRÍTICO: Forzar valores exactos (5cm y 3cm) redondeando a 2 decimales y luego forzando valores exactos
  widthCm = Math.round(widthCm * 100) / 100; // Redondear a 2 decimales
  heightCm = Math.round(heightCm * 100) / 100;
  // Si está cerca de 5 o 3, forzar exactamente 5 o 3
  if (Math.abs(widthCm - 5) < 0.01) widthCm = 5;
  if (Math.abs(heightCm - 3) < 0.01) heightCm = 3;

  // Convertir cm a px para el wrapper (1cm = 37.795275591px)
  const PX_PER_CM = 37.795275591;
  const widthPx = Math.round(widthCm * PX_PER_CM);
  const heightPx = Math.round(heightCm * PX_PER_CM);

  const safe = (v) => (v === undefined || v === null ? '' : String(v));

  const htmlParts = [];
  // CRÍTICO: Usar píxeles en lugar de cm para que coincida exactamente con el canvas
  htmlParts.push(
    `<div class="sticker-wrapper" style="position:relative;width:${widthPx}px;height:${heightPx}px;max-width:${widthPx}px;max-height:${heightPx}px;min-width:${widthPx}px;min-height:${heightPx}px;box-sizing:border-box;overflow:hidden;background:#ffffff;">`
  );

  for (const el of elements) {
    if (!el) continue;
    const id = safe(el.id || '');
    const x = Number(el.x) || 0;
    const y = Number(el.y) || 0;
    const w = Number(el.w) || 10;
    const h = Number(el.h) || 10;
    const type = (el.type || 'text').toString();
    const source = (el.source || type).toString();
    const fontSize = Number(el.fontSize) || 12;
    const fontWeight = safe(el.fontWeight || '600');
    const color = safe(el.color || '#000000');
    const wrap = el.wrap !== false;
    const align = safe(el.align || 'flex-start');
    const vAlign = safe(el.vAlign || 'center');
    const lineHeight = Number(el.lineHeight) || 1.1;
    const fit = safe(el.fit || 'contain');
    const rotation = el.rotation != null ? Number(el.rotation) : 0;

    const baseStyle = [
      'position:absolute',
      `left:${x}px`,
      `top:${y}px`,
      `width:${w}px`,
      `height:${h}px`,
      'box-sizing:border-box',
      'overflow:hidden'
    ];
    
    // Agregar z-index para evitar superposiciones: QR debe estar por encima de textos
    if (type === 'image' && source === 'qr') {
      baseStyle.push('z-index:10'); // QR con mayor prioridad
    } else if (type === 'text') {
      baseStyle.push('z-index:1'); // Textos con menor prioridad
    } else {
      baseStyle.push('z-index:2'); // Otras imágenes
    }
    
    // Agregar rotación si existe
    if (rotation !== 0) {
      baseStyle.push(`transform:rotate(${rotation}deg)`, 'transform-origin:center center');
    }

    let innerHtml = '';

    if (type === 'image') {
      // Mapear fuentes conocidas a campos del contexto / helpers
      let srcExpr = '';
      if (source === 'qr') {
        // QR generado en buildContext sobre ctx.item.qr
        srcExpr = '{{item.qr}}';
      } else if (source === 'company-logo' || source === 'logo') {
        // Logo de la compañía
        srcExpr = el.url ? safe(el.url) : '{{company.logoUrl}}';
      } else if (source === 'item-image') {
        // Imagen principal del item:
        //  - Si el layout trae una URL fija, usarla
        //  - Si no, usar helper Handlebars itemImage para tomar la primera imagen disponible de ctx.item.images
        srcExpr = el.url ? safe(el.url) : "{{itemImage item ''}}";
      } else {
        // Otros tipos de imagen pueden apoyarse también en itemImage como fallback
        srcExpr = el.url ? safe(el.url) : "{{itemImage item ''}}";
      }

      // Para QR, asegurar que la imagen ocupe todo el espacio disponible sin comprimirse
      const imgStyle = source === 'qr' 
        ? `width:100%;height:100%;max-width:100%;max-height:100%;min-width:${w}px;min-height:${h}px;object-fit:${fit};display:block;border:0;margin:0;padding:0;box-sizing:border-box;`
        : `width:${w}px;height:${h}px;max-width:${w}px;max-height:${h}px;object-fit:${fit};display:block;border:0;margin:0;padding:0;box-sizing:border-box;`;
      
      innerHtml =
        `<img src="${srcExpr}" alt="" style="${imgStyle}"/>`;
    } else {
      // Texto
      let textExpr = '';
      if (source === 'sku') textExpr = '{{item.sku}}';
      else if (source === 'name') textExpr = '{{item.name}}';
      else if (source === 'qr-text') textExpr = '{{item.qrText}}';
      else if (source === 'custom') textExpr = safe(el.text || 'Texto');
      else textExpr = safe(el.text || '');

      // CRÍTICO: Usar dimensiones ABSOLUTAS en píxeles, NO porcentajes
      // El contenedor ya tiene width y height en px desde baseStyle, así que el contenido interno
      // debe usar esas mismas dimensiones absolutas, no 100%
      const innerWidth = w - 4; // Restar padding
      const innerHeight = h - 4; // Restar padding
      
      // Para texto con wrap: usar estructura con contenedor interno que se expande verticalmente
      if (wrap) {
        // Con wrap: contenedor flex column con elemento interno que permite wrap
        const containerStyles = [
          'display:flex',
          'flex-direction:column',
          `align-items:${align === 'flex-end' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start'}`,
          `justify-content:${vAlign === 'flex-end' ? 'flex-end' : vAlign === 'center' ? 'center' : 'flex-start'}`, // CRÍTICO: Usar flex-start para que el texto empiece desde arriba
          'padding:2px',
          'margin:0',
          `width:${w}px`,
          `height:${h}px`,
          `max-width:${w}px`,
          `max-height:${h}px`,
          'min-width:0',
          'min-height:0',
          'box-sizing:border-box',
          'overflow:hidden'
        ];
        const textInnerStyles = [
          `font-size:${fontSize}px !important`,
          `font-weight:${fontWeight} !important`,
          `line-height:${lineHeight} !important`,
          `color:${color} !important`,
          'white-space:normal !important',
          'word-wrap:break-word !important',
          'word-break:break-word !important',
          'overflow-wrap:break-word !important',
          'hyphens:auto',
          `width:${innerWidth}px !important`,
          `max-width:${innerWidth}px !important`,
          'height:100% !important', // CRÍTICO: Usar 100% para ocupar TODO el espacio vertical
          `max-height:${innerHeight}px !important`, // Pero limitar con max-height
          'margin:0',
          'padding:0',
          'box-sizing:border-box',
          'overflow:hidden !important',
          'display:block',
          'text-align:left',
          'flex:1 1 0% !important' // CRÍTICO: Permitir que se expanda verticalmente
        ];
        htmlParts.push(
          `<div class="st-el" data-id="${id}" style="${baseStyle.join(';')};${containerStyles.join(';')}"><div style="${textInnerStyles.join(';')}">${textExpr}</div></div>`
        );
      } else {
        // Sin wrap explícito en el layout, pero PERMITIR wrap si el texto es largo
        const textStyles = [
          'display:block',
          `font-size:${fontSize}px !important`,
          `font-weight:${fontWeight} !important`,
          `line-height:${lineHeight} !important`,
          `color:${color} !important`,
          'white-space:normal !important',
          'word-wrap:break-word !important',
          'word-break:break-word !important',
          'overflow-wrap:break-word !important',
          'overflow:hidden',
          'text-overflow:clip',
          'padding:2px',
          'margin:0',
          `width:${innerWidth}px !important`,
          `max-width:${innerWidth}px !important`,
          `height:${innerHeight}px !important`,
          `max-height:${innerHeight}px !important`,
          'box-sizing:border-box',
          'text-align:left'
        ];
        htmlParts.push(
          `<div class="st-el" data-id="${id}" style="${baseStyle.join(';')};${textStyles.join(';')}">${textExpr}</div>`
        );
      }
      continue;
    }

    htmlParts.push(
      `<div class="st-el" data-id="${id}" style="${baseStyle.join(';')}">${innerHtml}</div>`
    );
  }

  htmlParts.push(`</div>`);
  return htmlParts.join('\n');
}

// Helpers para armar contexto base multi-documento
// Params:
//  - type: tipo de plantilla (invoice, workOrder, quote, sticker, order)
//  - sampleType (opcional): fuerza el tipo de documento para el contexto (si distinto al type de la plantilla)
//  - sampleId (opcional): id especÃ­fico del documento
//  - originalCompanyId (opcional): ID original de la empresa (para obtener info de empresa cuando hay BD compartida)
async function buildContext({ companyId, type, sampleType, sampleId, originalCompanyId }) {
  const ctx = { company: {}, now: new Date(), meta: { requestedType: type, sampleType: sampleType || null } };
  // Usar originalCompanyId para obtener información de la empresa (nombre, logo, etc.)
  // porque cuando hay BD compartida, queremos la info de la empresa real, no de la principal
  const companyIdForInfo = originalCompanyId || companyId;
  const company = await Company.findOne({ _id: companyIdForInfo });
  if (company) {
    ctx.company = {
      name: company.name || company.email || '',
      email: company.email,
      phone: company.phone || '',
      address: company.address || '',
      logoUrl: company.logoUrl || ''
    };
  }

  const effective = sampleType || type;

  // Venta (invoice/invoice-factura/workOrder comparten sale)
  if (['invoice','invoice-factura','workOrder','sale'].includes(effective)) {
    let sale = null;
    if (sampleId) {
      sale = await Sale.findOne({ _id: sampleId, companyId });
      if (TEMPLATE_DEBUG) {
        debugLog('[buildContext Sale] Buscando venta:', {
          sampleId,
          companyId,
          found: !!sale,
          saleId: sale?._id?.toString(),
          saleStatus: sale?.status,
          saleItemsCount: sale?.items?.length || 0,
          saleItems: sale?.items || []
        });
      }
    } else {
      sale = await Sale.findOne({ companyId, status: 'closed' }).sort({ createdAt: -1 });
    }
    if (sale) {
      const saleObj = sale.toObject();
      // Asegurar que items esté presente y sea un array
      if (!saleObj.items || !Array.isArray(saleObj.items)) {
        saleObj.items = [];
      }
      
      // Log antes de procesar items
      if (TEMPLATE_DEBUG) {
        debugLog('[buildContext Sale] Items antes de procesar:', {
          itemsCount: saleObj.items.length,
          items: saleObj.items
        });
      }
      
      // Procesar items y agrupar por tipo (productos, servicios, combos)
      // Primero, identificar qué items son combos consultando PriceEntry
      const priceEntryIds = saleObj.items
        .filter(item => item.source === 'price' && item.refId)
        .map(item => item.refId);
      
      const priceEntries = priceEntryIds.length > 0 
        ? await PriceEntry.find({ _id: { $in: priceEntryIds }, companyId }).lean()
        : [];
      
      const priceEntryMap = {};
      priceEntries.forEach(pe => {
        priceEntryMap[pe._id.toString()] = pe;
      });
      
      // Procesar items y crear estructura jerárquica
      const processedItems = [];
      const products = [];
      const services = [];
      const combos = [];
      
      // Primero, identificar combos y sus productos anidados
      // Necesitamos cargar los combos con sus productos para identificar correctamente
      const comboPriceEntries = priceEntries.filter(pe => pe.type === 'combo');
      const comboProductItemIds = new Set();
      comboPriceEntries.forEach(pe => {
        if (pe.comboProducts && Array.isArray(pe.comboProducts)) {
          pe.comboProducts.forEach(cp => {
            if (cp.itemId) {
              comboProductItemIds.add(String(cp.itemId));
            }
          });
        }
      });
      
      let i = 0;
      while (i < saleObj.items.length) {
        const item = saleObj.items[i];
        const itemObj = {
          sku: item.sku || '',
          name: item.name || '',
          qty: Number(item.qty) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          total: Number(item.total) || (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
          source: item.source || '',
          refId: item.refId || null,
          isNested: false // Para items anidados de combos
        };
        
        // Verificar si es un combo
        if (item.source === 'price' && item.refId) {
          const pe = priceEntryMap[item.refId.toString()];
          if (pe && pe.type === 'combo') {
            // Es un combo - cargar el combo completo con sus productos
            const fullCombo = await PriceEntry.findOne({ _id: item.refId, companyId })
              .populate('comboProducts.itemId', 'sku name stock salePrice')
              .lean();
            
            const comboItems = [];
            const comboProductRefIds = new Set();
            const comboProductNames = new Set();
            
            // Primero, construir un mapa de los productos del combo desde PriceEntry
            if (fullCombo && fullCombo.comboProducts) {
              fullCombo.comboProducts.forEach(cp => {
                if (cp.itemId) {
                  comboProductRefIds.add(String(cp.itemId));
                }
                if (cp.name) {
                  comboProductNames.add(String(cp.name).trim().toUpperCase());
                }
              });
            }
            
            // Buscar items siguientes que pertenecen a este combo
            let j = i + 1;
            const processedComboItemIndices = new Set();
            
            while (j < saleObj.items.length) {
              const nextItem = saleObj.items[j];
              const nextSku = String(nextItem.sku || '').toUpperCase();
              const nextName = String(nextItem.name || '').trim().toUpperCase();
              const nextRefId = nextItem.refId ? String(nextItem.refId) : '';
              
              // Si el SKU empieza con "CP-", es definitivamente parte del combo
              if (nextSku.startsWith('CP-')) {
                comboItems.push({
                  sku: nextItem.sku || '',
                  name: nextItem.name || '',
                  qty: Number(nextItem.qty) || 0,
                  unitPrice: Number(nextItem.unitPrice) || 0,
                  total: Number(nextItem.total) || 0,
                  source: nextItem.source || '',
                  refId: nextItem.refId || null,
                  isNested: true
                });
                processedComboItemIndices.add(j);
                j++;
                continue;
              }
              
              // Si es un item de inventario y su refId está en los productos del combo
              if (nextItem.source === 'inventory' && nextItem.refId && comboProductRefIds.has(nextRefId)) {
                comboItems.push({
                  sku: nextItem.sku || '',
                  name: nextItem.name || '',
                  qty: Number(nextItem.qty) || 0,
                  unitPrice: Number(nextItem.unitPrice) || 0,
                  total: Number(nextItem.total) || 0,
                  source: nextItem.source || '',
                  refId: nextItem.refId || null,
                  isNested: true
                });
                processedComboItemIndices.add(j);
                j++;
                continue;
              }
              
              // Si el SKU empieza con "CP-", es definitivamente parte del combo (sin importar source o precio)
              if (nextSku.startsWith('CP-')) {
                comboItems.push({
                  sku: nextItem.sku || '',
                  name: nextItem.name || '',
                  qty: Number(nextItem.qty) || 0,
                  unitPrice: Number(nextItem.unitPrice) || 0,
                  total: Number(nextItem.total) || 0,
                  source: nextItem.source || '',
                  refId: nextItem.refId || null,
                  isNested: true
                });
                processedComboItemIndices.add(j);
                j++;
                continue;
              }
              
              // Si tiene precio 0 y es price sin refId o con refId diferente, podría ser producto del combo sin vincular
              const nextPrice = Number(nextItem.unitPrice) || 0;
              if (nextPrice === 0 && nextItem.source === 'price' && 
                  (!nextItem.refId || String(nextItem.refId) !== String(item.refId))) {
                // Verificar si el nombre coincide con algún producto del combo
                if (comboProductNames.has(nextName)) {
                  comboItems.push({
                    sku: nextItem.sku || '',
                    name: nextItem.name || '',
                    qty: Number(nextItem.qty) || 0,
                    unitPrice: Number(nextItem.unitPrice) || 0,
                    total: Number(nextItem.total) || 0,
                    source: nextItem.source || '',
                    refId: nextItem.refId || null,
                    isNested: true
                  });
                  processedComboItemIndices.add(j);
                  j++;
                  continue;
                }
              }
              
              // Si encontramos otro combo o servicio con precio > 0, parar
              if (nextItem.source === 'price' && nextItem.refId) {
                const nextPe = priceEntryMap[nextItem.refId.toString()];
                if (nextPe && nextPe.type === 'combo') {
                  // Es otro combo, parar aquí
                  break;
                } else if (nextPrice > 0) {
                  // Es un servicio con precio, parar aquí
                  break;
                }
              } else if (nextItem.source === 'inventory' && nextPrice > 0 && 
                        !comboProductRefIds.has(nextRefId)) {
                // Es un producto del inventario con precio > 0 que NO es del combo, parar
                break;
              } else if (nextItem.source === 'service' || (nextItem.source === 'price' && !nextItem.refId && nextPrice > 0)) {
                // Es un servicio independiente, parar
                break;
              } else {
                // Otro caso, parar por seguridad
                break;
              }
            }
            
            // IMPORTANTE: Solo incluir items que están REALMENTE en la venta
            // NO agregar items del PriceEntry que no están en saleObj.items
            // Esto asegura que si el usuario elimina un item del combo, no aparezca en la remisión
            
            combos.push({
              name: itemObj.name,
              qty: itemObj.qty,
              unitPrice: itemObj.unitPrice,
              total: itemObj.total,
              sku: itemObj.sku,
              items: comboItems // Productos anidados del combo
            });
            
            // Saltar los items que ya procesamos como parte del combo
            i = j;
            continue;
          } else {
            // Es un servicio (price pero no combo)
            services.push(itemObj);
          }
        } else if (item.source === 'inventory') {
          // Es un producto del inventario
          // Verificar si NO es parte de un combo (no está en comboProductItemIds)
          const itemRefId = item.refId ? String(item.refId) : '';
          if (!comboProductItemIds.has(itemRefId)) {
            products.push(itemObj);
          }
          // Si es parte de un combo, ya fue procesado arriba
        } else if (item.source === 'service') {
          // Es un servicio explícito
          services.push(itemObj);
        } else {
          // Fallback: tratar como servicio
          services.push(itemObj);
        }
        
        i++;
      }
      
      // Crear estructura agrupada para el template
      // IMPORTANTE: Los combos deben ir primero en la remisión
      saleObj.itemsGrouped = {
        combos: combos,
        products: products,
        services: services,
        hasCombos: combos.length > 0,
        hasProducts: products.length > 0,
        hasServices: services.length > 0
      };
      
      // Mantener items originales para compatibilidad
      saleObj.items = saleObj.items.map(item => ({
        sku: item.sku || '',
        name: item.name || '',
        qty: Number(item.qty) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        total: Number(item.total) || (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
        source: item.source || '',
        refId: item.refId || null
      }));
      
      // Log después de procesar items
      if (TEMPLATE_DEBUG) {
        debugLog('[buildContext Sale] Items agrupados:', {
          productsCount: products.length,
          servicesCount: services.length,
          combosCount: combos.length,
          products: products.map(i => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
          services: services.map(i => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
          combos: combos.map(c => ({ name: c.name, itemsCount: c.items.length, items: c.items.map(i => ({ name: i.name, unitPrice: i.unitPrice })) }))
        });
        debugLog('[buildContext Sale] sale.itemsGrouped creado:', {
          hasProducts: saleObj.itemsGrouped.hasProducts,
          hasServices: saleObj.itemsGrouped.hasServices,
          hasCombos: saleObj.itemsGrouped.hasCombos,
          productsLength: saleObj.itemsGrouped.products.length,
          servicesLength: saleObj.itemsGrouped.services.length,
          combosLength: saleObj.itemsGrouped.combos.length
        });
      }
      
      // Asegurar que customer esté presente
      if (!saleObj.customer) {
        saleObj.customer = { name: '', email: '', phone: '', address: '' };
      }
      // Asegurar que vehicle esté presente
      if (!saleObj.vehicle) {
        saleObj.vehicle = { plate: '', brand: '', line: '', engine: '', year: null, mileage: null };
      }
      // Asegurar que el número de remisión esté presente y formateado
      // Si no tiene número pero tiene _id, usar el _id como fallback temporal
      if (!saleObj.number || !Number.isFinite(Number(saleObj.number))) {
        // Si la venta no tiene número asignado, intentar obtenerlo del contador
        // Pero solo si es una venta cerrada (para no afectar el contador)
        if (saleObj.status === 'closed') {
          // Para ventas cerradas sin número, usar un número temporal basado en _id
          saleObj.number = saleObj._id ? parseInt(saleObj._id.toString().slice(-6), 16) % 100000 : 0;
        } else {
          saleObj.number = null;
        }
      }
      // Formatear número de remisión
      if (saleObj.number && Number.isFinite(Number(saleObj.number))) {
        saleObj.formattedNumber = String(saleObj.number).padStart(5, '0');
      } else {
        saleObj.formattedNumber = '';
      }
      
      // Agregar fecha formateada de la venta (usar createdAt si no hay closedAt)
      const saleDate = saleObj.closedAt || saleObj.createdAt || new Date();
      saleObj.date = saleDate;
      saleObj.formattedDate = new Date(saleDate).toLocaleDateString('es-CO', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
      
      // Asegurar que specialNotes esté presente
      if (!saleObj.specialNotes || !Array.isArray(saleObj.specialNotes)) {
        saleObj.specialNotes = [];
      }
      
      // Log para depuración
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildContext Sale]', {
          saleId: saleObj._id,
          saleNumber: saleObj.number,
          saleFormattedNumber: saleObj.formattedNumber,
          saleStatus: saleObj.status,
          itemsCount: saleObj.items.length,
          items: saleObj.items.map(i => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice, total: i.total })),
          customer: saleObj.customer,
          vehicle: saleObj.vehicle
        });
      }
      
      ctx.sale = saleObj;
      
      // Calcular descuento si existe
      const subtotalRaw = Number(saleObj.subtotal) || 0;
      let discountAmount = 0;
      if (saleObj.discount && saleObj.discount.type && Number(saleObj.discount.value) > 0) {
        if (saleObj.discount.type === 'percent') {
          discountAmount = Math.round(subtotalRaw * (Number(saleObj.discount.value) / 100));
        } else if (saleObj.discount.type === 'fixed') {
          discountAmount = Math.round(Number(saleObj.discount.value));
        }
        if (discountAmount > subtotalRaw) discountAmount = subtotalRaw;
        if (discountAmount < 0) discountAmount = 0;
      }

      const hasDiscount = discountAmount > 0;
      
      // Para facturas (invoice-factura), calcular subtotal, IVA y total
      // El total de la venta es el subtotal, calcular IVA (19%) y total con IVA
      if (effective === 'invoice-factura') {
        const subtotal = subtotalRaw;
        const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
        const iva = subtotalAfterDiscount * 0.19;
        const totalWithIva = subtotalAfterDiscount + iva;
        
        // Crear objeto S con valores calculados para facturas
        ctx.S = {
          subtotal: subtotal,
          discount: discountAmount,
          hasDiscount,
          subtotalAfterDiscount: subtotalAfterDiscount,
          iva: iva,
          total: totalWithIva,
          'nº': saleObj.formattedNumber || saleObj.number || '',
          fecha: saleObj.date || saleObj.createdAt || new Date(),
          P: saleObj.itemsGrouped?.hasProducts || false,
          S: saleObj.itemsGrouped?.hasServices || false,
          C: saleObj.itemsGrouped?.hasCombos || false
        };
      } else {
        // Para remisiones, S.total es igual al total de la venta (sin IVA)
        const subtotal = subtotalRaw;
        ctx.S = {
          subtotal: subtotal,
          discount: discountAmount,
          hasDiscount,
          total: Number(saleObj.total) || 0,
          'nº': saleObj.formattedNumber || saleObj.number || '',
          fecha: saleObj.date || saleObj.createdAt || new Date(),
          P: saleObj.itemsGrouped?.hasProducts || false,
          S: saleObj.itemsGrouped?.hasServices || false,
          C: saleObj.itemsGrouped?.hasCombos || false
        };
      }
      
      // Exponer descuento calculado en sale (útil para plantillas)
      saleObj.discountAmount = discountAmount;
      saleObj.hasDiscount = hasDiscount;
    } else {
      // Log si no se encontró la venta
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildContext Sale]', {
          error: 'Sale not found',
          sampleId,
          companyId
        });
      }
    }
  }
  // CotizaciÃ³n
  if (effective === 'quote') {
    let quote = null;
    if (sampleId) quote = await Quote.findOne({ _id: sampleId, companyId });
    else quote = await Quote.findOne({ companyId }).sort({ createdAt: -1 });
    if (quote) {
      const quoteObj = quote.toObject();
      // Asegurar que items esté presente y sea un array
      if (!quoteObj.items || !Array.isArray(quoteObj.items)) {
        quoteObj.items = [];
      }
      
      // Procesar items y agrupar por tipo (productos, servicios, combos) - igual que en sales
      // Primero, identificar qué items son combos consultando PriceEntry
      const priceEntryIds = quoteObj.items
        .filter(item => item.source === 'price' && item.refId)
        .map(item => item.refId);
      
      const priceEntries = priceEntryIds.length > 0 
        ? await PriceEntry.find({ _id: { $in: priceEntryIds }, companyId }).lean()
        : [];
      
      const priceEntryMap = {};
      priceEntries.forEach(pe => {
        priceEntryMap[pe._id.toString()] = pe;
      });
      
      // Procesar items y crear estructura jerárquica
      const processedItems = [];
      const products = [];
      const services = [];
      const combos = [];
      
      // Primero, identificar combos y sus productos anidados
      const comboPriceEntries = priceEntries.filter(pe => pe.type === 'combo');
      const comboProductItemIds = new Set();
      comboPriceEntries.forEach(pe => {
        if (pe.comboProducts && Array.isArray(pe.comboProducts)) {
          pe.comboProducts.forEach(cp => {
            if (cp.itemId) {
              comboProductItemIds.add(String(cp.itemId));
            }
          });
        }
      });
      
      let i = 0;
      while (i < quoteObj.items.length) {
        const item = quoteObj.items[i];
        const itemObj = {
          sku: item.sku || '',
          name: item.description || item.name || '',
          description: item.description || '',
          qty: Number(item.qty) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          total: Number(item.subtotal) || (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
          subtotal: Number(item.subtotal) || (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
          source: item.source || '',
          refId: item.refId || null,
          kind: item.kind || '',
          isNested: false
        };
        
        // Verificar si es un combo
        if (item.source === 'price' && item.refId) {
          const pe = priceEntryMap[item.refId.toString()];
          if (pe && pe.type === 'combo') {
            // Es un combo - cargar el combo completo con sus productos
            const fullCombo = await PriceEntry.findOne({ _id: item.refId, companyId })
              .populate('comboProducts.itemId', 'sku name stock salePrice')
              .lean();
            
            const comboItems = [];
            const comboProductRefIds = new Set();
            const comboProductNames = new Set();
            
            // Primero, construir un mapa de los productos del combo desde PriceEntry
            if (fullCombo && fullCombo.comboProducts) {
              fullCombo.comboProducts.forEach(cp => {
                if (cp.itemId) {
                  comboProductRefIds.add(String(cp.itemId));
                }
                if (cp.name) {
                  comboProductNames.add(String(cp.name).trim().toUpperCase());
                }
              });
            }
            
            // Buscar items siguientes que pertenecen a este combo
            let j = i + 1;
            const processedComboItemIndices = new Set();
            
            while (j < quoteObj.items.length) {
              const nextItem = quoteObj.items[j];
              const nextSku = String(nextItem.sku || '').toUpperCase();
              const nextName = String(nextItem.description || nextItem.name || '').trim().toUpperCase();
              const nextRefId = nextItem.refId ? String(nextItem.refId) : '';
              
              // Si el SKU empieza con "CP-", es definitivamente parte del combo
              if (nextSku.startsWith('CP-')) {
                comboItems.push({
                  sku: nextItem.sku || '',
                  name: nextItem.description || nextItem.name || '',
                  description: nextItem.description || '',
                  qty: Number(nextItem.qty) || 0,
                  unitPrice: Number(nextItem.unitPrice) || 0,
                  total: Number(nextItem.subtotal) || 0,
                  subtotal: Number(nextItem.subtotal) || 0,
                  source: nextItem.source || '',
                  refId: nextItem.refId || null,
                  isNested: true
                });
                processedComboItemIndices.add(j);
                j++;
                continue;
              }
              
              // Si es un item de inventario y su refId está en los productos del combo
              if (nextItem.source === 'inventory' && nextItem.refId && comboProductRefIds.has(nextRefId)) {
                comboItems.push({
                  sku: nextItem.sku || '',
                  name: nextItem.description || nextItem.name || '',
                  description: nextItem.description || '',
                  qty: Number(nextItem.qty) || 0,
                  unitPrice: Number(nextItem.unitPrice) || 0,
                  total: Number(nextItem.subtotal) || 0,
                  subtotal: Number(nextItem.subtotal) || 0,
                  source: nextItem.source || '',
                  refId: nextItem.refId || null,
                  isNested: true
                });
                processedComboItemIndices.add(j);
                j++;
                continue;
              }
              
              // Si encontramos otro combo o servicio con precio > 0, parar
              if (nextItem.source === 'price' && nextItem.refId) {
                const nextPe = priceEntryMap[nextItem.refId.toString()];
                if (nextPe && nextPe.type === 'combo') {
                  // Es otro combo, parar aquí
                  break;
                } else if (Number(nextItem.unitPrice || 0) > 0) {
                  // Es un servicio con precio, parar aquí
                  break;
                }
              } else if (nextItem.source === 'inventory' && Number(nextItem.unitPrice || 0) > 0 && 
                        !comboProductRefIds.has(nextRefId)) {
                // Es un producto del inventario con precio > 0 que NO es del combo, parar
                break;
              } else if (nextItem.source === 'service' || (nextItem.source === 'price' && !nextItem.refId && Number(nextItem.unitPrice || 0) > 0)) {
                // Es un servicio independiente, parar
                break;
              } else {
                // Otro caso, parar por seguridad
                break;
              }
            }
            
            combos.push({
              name: itemObj.name,
              description: itemObj.description,
              qty: itemObj.qty,
              unitPrice: itemObj.unitPrice,
              total: itemObj.total,
              subtotal: itemObj.subtotal,
              sku: itemObj.sku,
              items: comboItems // Productos anidados del combo
            });
            
            // Saltar los items que ya procesamos como parte del combo
            i = j;
            continue;
          } else {
            // Es un servicio (price pero no combo)
            services.push(itemObj);
          }
        } else if (item.source === 'inventory') {
          // Es un producto del inventario
          // Verificar si NO es parte de un combo (no está en comboProductItemIds)
          const itemRefId = item.refId ? String(item.refId) : '';
          if (!comboProductItemIds.has(itemRefId)) {
            products.push(itemObj);
          }
          // Si es parte de un combo, ya fue procesado arriba
        } else if (item.source === 'service') {
          // Es un servicio explícito
          services.push(itemObj);
        } else {
          // Fallback: tratar como servicio
          services.push(itemObj);
        }
        
        i++;
      }
      
      // Crear estructura agrupada para el template
      // IMPORTANTE: Los combos deben ir primero en la cotización
      quoteObj.itemsGrouped = {
        combos: combos,
        products: products,
        services: services,
        hasCombos: combos.length > 0,
        hasProducts: products.length > 0,
        hasServices: services.length > 0
      };
      
      // Mantener items originales para compatibilidad
      quoteObj.items = quoteObj.items.map(item => ({
        sku: item.sku || '',
        description: item.description || '',
        name: item.description || item.name || '',
        qty: Number(item.qty) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        subtotal: Number(item.subtotal) || (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
        total: Number(item.subtotal) || (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
        source: item.source || '',
        refId: item.refId || null
      }));
      
      // Log después de procesar items
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildContext Quote] Items agrupados:', {
          productsCount: products.length,
          servicesCount: services.length,
          combosCount: combos.length,
          products: products.map(i => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
          services: services.map(i => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
          combos: combos.map(c => ({ name: c.name, itemsCount: c.items.length, items: c.items.map(i => ({ name: i.name, unitPrice: i.unitPrice })) }))
        });
        console.log('[buildContext Quote] quote.itemsGrouped creado:', {
          hasProducts: quoteObj.itemsGrouped.hasProducts,
          hasServices: quoteObj.itemsGrouped.hasServices,
          hasCombos: quoteObj.itemsGrouped.hasCombos,
          productsLength: quoteObj.itemsGrouped.products.length,
          servicesLength: quoteObj.itemsGrouped.services.length,
          combosLength: quoteObj.itemsGrouped.combos.length
        });
      }
      
      // Asegurar que customer esté presente
      if (!quoteObj.customer) {
        quoteObj.customer = { name: '', phone: '', email: '', address: '' };
      }
      // Asegurar que vehicle esté presente
      if (!quoteObj.vehicle) {
        quoteObj.vehicle = { plate: '', make: '', line: '', modelYear: '', displacement: '' };
      }
      ctx.quote = quoteObj;
      
      // Para cotizaciones con IVA habilitado, calcular subtotal, IVA y total
      // Similar a como se hace para facturas en ventas
      if (quoteObj.ivaEnabled) {
        const subtotal = Number(quoteObj.total) || 0;
        const iva = subtotal * 0.19;
        const totalWithIva = subtotal + iva;
        
        // Crear objeto Q con valores calculados para cotizaciones con IVA
        ctx.Q = {
          subtotal: subtotal,
          iva: iva,
          total: totalWithIva,
          'nº': quoteObj.number || '',
          fecha: quoteObj.date || quoteObj.createdAt || new Date(),
          P: quoteObj.itemsGrouped?.hasProducts || false,
          S: quoteObj.itemsGrouped?.hasServices || false,
          C: quoteObj.itemsGrouped?.hasCombos || false
        };
      } else {
        // Para cotizaciones sin IVA, Q.total es igual al total de la cotización
        ctx.Q = {
          total: Number(quoteObj.total) || 0,
          'nº': quoteObj.number || '',
          fecha: quoteObj.date || quoteObj.createdAt || new Date(),
          P: quoteObj.itemsGrouped?.hasProducts || false,
          S: quoteObj.itemsGrouped?.hasServices || false,
          C: quoteObj.itemsGrouped?.hasCombos || false
        };
      }
    }
  }
  // Pedido (order)
  if (effective === 'order') {
    let order = null;
    if (sampleId) order = await Order.findOne({ _id: sampleId, companyId });
    else order = await Order.findOne({ companyId }).sort({ createdAt: -1 });
    if (order) ctx.order = order.toObject();
  }
  // Sticker / Item individual (admite variantes sticker-qr / sticker-brand)
  if (['sticker','sticker-qr','sticker-brand','item'].includes(effective)) {
    let item = null;
    if (sampleId) item = await Item.findOne({ _id: sampleId, companyId });
    else item = await Item.findOne({ companyId }).sort({ updatedAt: -1 });
    if (item) {
      ctx.item = item.toObject();
      try {
        const qrValue = ctx.item.sku || String(ctx.item._id || '');
        if (qrValue) {
          // Generar QR con tamaño MUY GRANDE para stickers de 5cm x 3cm
          // El QR debe ocupar aproximadamente 2.5-3cm del sticker
          // A 300 DPI (resolución de impresión), 2.5cm = ~295px, 3cm = ~354px
          // Usamos 600px para asegurar que el QR sea grande y se escale correctamente
          // cuando se renderice en el contenedor de 90px (el QR se escalará hacia abajo manteniendo calidad)
          const qrSizePx = 600;
          ctx.item.qr = await QRCode.toDataURL(qrValue, { 
            margin: 2, // Margen para mejor escaneo
            width: qrSizePx, // Tamaño muy grande para mejor calidad al escalar
            color: { dark: '#000000', light: '#FFFFFF' }
          });
          ctx.item.qrText = qrValue;
        }
      } catch (e) {
        // No bloquear si falla QR; continuar sin QR
        ctx.item.qr = '';
      }
    }
  }
  // Liquidación de nómina (payroll)
  if (effective === 'payroll') {
    let settlement = null;
    if (sampleId) settlement = await PayrollSettlement.findOne({ _id: sampleId, companyId });
    else settlement = await PayrollSettlement.findOne({ companyId }).sort({ createdAt: -1 });
    if (settlement) {
      const settlementObj = settlement.toObject();
      const period = await PayrollPeriod.findOne({ _id: settlement.periodId, companyId });
      
      // Separar items por tipo
      const itemsByType = {
        earnings: (settlementObj.items || []).filter(i => i.type === 'earning'),
        deductions: (settlementObj.items || []).filter(i => i.type === 'deduction'),
        surcharges: (settlementObj.items || []).filter(i => i.type === 'surcharge')
      };
      
      ctx.settlement = {
        ...settlementObj,
        itemsByType,
        formattedGrossTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.grossTotal || 0),
        formattedDeductionsTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.deductionsTotal || 0),
        formattedNetTotal: new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(settlementObj.netTotal || 0)
      };
      
      if (period) {
        // Calcular días trabajados basándose en el periodo
        let daysWorked = 0;
        if (period.startDate && period.endDate) {
          const start = new Date(period.startDate);
          const end = new Date(period.endDate);
          // Calcular diferencia en días (incluyendo ambos días)
          const diffTime = Math.abs(end - start);
          daysWorked = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 para incluir ambos días
        }
        
        ctx.period = {
          ...period.toObject(),
          formattedStartDate: period.startDate ? new Date(period.startDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
          formattedEndDate: period.endDate ? new Date(period.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
          periodTypeLabel: period.periodType === 'monthly' ? 'Mensual' : period.periodType === 'biweekly' ? 'Quincenal' : period.periodType === 'weekly' ? 'Semanal' : period.periodType,
          daysWorked
        };
      }
      
      // Buscar datos del técnico desde Company.technicians
      if (settlementObj.technicianName) {
        const company = await Company.findOne({ _id: companyId });
        if (company && company.technicians) {
          const technicians = company.technicians.map(t => {
            if (typeof t === 'string') {
              return { name: t.toUpperCase(), identification: '', basicSalary: null, workHoursPerMonth: null, basicSalaryPerDay: null, contractType: '' };
            }
            return { 
              name: String(t.name || '').toUpperCase(), 
              identification: String(t.identification || '').trim(),
              basicSalary: t.basicSalary !== undefined && t.basicSalary !== null ? Number(t.basicSalary) : null,
              workHoursPerMonth: t.workHoursPerMonth !== undefined && t.workHoursPerMonth !== null ? Number(t.workHoursPerMonth) : null,
              basicSalaryPerDay: t.basicSalaryPerDay !== undefined && t.basicSalaryPerDay !== null ? Number(t.basicSalaryPerDay) : null,
              contractType: String(t.contractType || '').trim()
            };
          });
          const tech = technicians.find(t => t.name === String(settlementObj.technicianName).toUpperCase());
          if (tech) {
            ctx.settlement.technician = {
              name: tech.name,
              identification: tech.identification || '',
              basicSalary: tech.basicSalary,
              workHoursPerMonth: tech.workHoursPerMonth,
              basicSalaryPerDay: tech.basicSalaryPerDay,
              contractType: tech.contractType || ''
            };
            // Mantener compatibilidad con código anterior
            if (tech.identification) {
              ctx.settlement.technicianIdentification = tech.identification;
            }
          }
        }
      }
      
      // Asegurar que technicianIdentification esté disponible
      if (!ctx.settlement.technicianIdentification && settlementObj.technicianIdentification) {
        ctx.settlement.technicianIdentification = settlementObj.technicianIdentification;
      }
      
      // Agregar formattedNow al contexto
      ctx.now = new Date();
      ctx.formattedNow = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  }
  return ctx;
}

// ===== Handlebars helpers (whitelist) =====
let hbInitialized = false;
function ensureHB() {
  if (hbInitialized) return;
  Handlebars.registerHelper('money', (v) => {
    const n = Number(v || 0);
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
  });
  Handlebars.registerHelper('date', (v, fmt) => {
    const d = v ? new Date(v) : new Date();
    if (fmt === 'iso') return d.toISOString().slice(0, 10);
    return d.toLocaleString('es-CO');
  });
  Handlebars.registerHelper('pad', (v, len = 5) => String(v ?? '').toString().padStart(len, '0'));
  Handlebars.registerHelper('uppercase', (v) => String(v || '').toUpperCase());
  Handlebars.registerHelper('lowercase', (v) => String(v || '').toLowerCase());
  // Helper para obtener la URL de la primera imagen del item
  // Uso: {{itemImage item 'fallback'}}
  Handlebars.registerHelper('itemImage', (item, fallback = '') => {
    if (!item || typeof item !== 'object') return fallback || '';
    const images = Array.isArray(item.images) ? item.images : [];
    const first = images.find((img) => img && (img.url || img.secure_url || img.path));
    return (
      (first && (first.url || first.secure_url || first.path)) ||
      String(fallback || '')
    );
  });
  // Helper para verificar si un array tiene elementos
  Handlebars.registerHelper('hasItems', function(items) {
    if (!items) return false;
    if (!Array.isArray(items)) return false;
    return items.length > 0;
  });
  // Helper $ para formatear valores numéricos como dinero
  // Uso: {{$ S.subtotal}} o {{$ Q.total}}
  // En Handlebars, S.subtotal se evalúa primero, luego se pasa el valor al helper
  Handlebars.registerHelper('$', function(value) {
    // El valor ya viene evaluado desde el contexto (ej: S.subtotal)
    if (value === undefined || value === null) return '';
    const n = Number(value || 0);
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
  });
  hbInitialized = true;
}

function renderHB(tpl, context) {
  ensureHB();
  const debug = TEMPLATE_DEBUG;
  try {
    if (!tpl || !tpl.trim()) {
      if (debug) {
        console.warn('[renderHB] Template vacío o solo espacios');
      }
      return '';
    }

    if (debug) {
      // Log detallado ANTES de compilar
      console.log('[renderHB] ===== INICIO RENDERIZADO =====');
      console.log('[renderHB] Template length:', tpl.length);
      console.log('[renderHB] Context keys:', Object.keys(context || {}));
      console.log('[renderHB] Has sale:', !!context?.sale);
      console.log('[renderHB] Has quote:', !!context?.quote);

      if (context?.sale) {
        console.log('[renderHB] Sale items count:', context.sale.items?.length || 0);
        console.log('[renderHB] Sale items:', JSON.stringify(context.sale.items || [], null, 2));
        console.log('[renderHB] Sale number:', context.sale.number);
        console.log('[renderHB] Sale formattedNumber:', context.sale.formattedNumber);
        console.log('[renderHB] Sale tiene itemsGrouped:', !!context.sale.itemsGrouped);
        if (context.sale.itemsGrouped) {
          console.log('[renderHB] Sale itemsGrouped:', {
            hasProducts: context.sale.itemsGrouped.hasProducts,
            hasServices: context.sale.itemsGrouped.hasServices,
            hasCombos: context.sale.itemsGrouped.hasCombos,
            productsCount: context.sale.itemsGrouped.products?.length || 0,
            servicesCount: context.sale.itemsGrouped.services?.length || 0,
            combosCount: context.sale.itemsGrouped.combos?.length || 0
          });
        }
      }

      if (context?.quote) {
        console.log('[renderHB] Quote items count:', context.quote.items?.length || 0);
        console.log('[renderHB] Quote items:', JSON.stringify(context.quote.items || [], null, 2));
        console.log('[renderHB] Quote number:', context.quote.number);
      }

      // Verificar si el template tiene las variables correctas
      const hasSaleEach = tpl.includes('{{#each sale.items}}');
      const hasQuoteEach = tpl.includes('{{#each quote.items}}');
      const hasSaleUnless = tpl.includes('{{#unless sale.items}}');
      const hasQuoteUnless = tpl.includes('{{#unless quote.items}}');

      console.log('[renderHB] Template tiene {{#each sale.items}}:', hasSaleEach);
      console.log('[renderHB] Template tiene {{#each quote.items}}:', hasQuoteEach);
      console.log('[renderHB] Template tiene {{#unless sale.items}}:', hasSaleUnless);
      console.log('[renderHB] Template tiene {{#unless quote.items}}:', hasQuoteUnless);

      // Extraer fragmento del template que contiene las tablas
      const tableMatch = tpl.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
      if (tableMatch) {
        console.log('[renderHB] Tablas encontradas en template:', tableMatch.length);
        tableMatch.forEach((match, idx) => {
          console.log(`[renderHB] Tabla ${idx + 1} (COMPLETA):`, match);
          console.log(`[renderHB] Tabla ${idx + 1} tiene {{#each sale.items}}:`, match.includes('{{#each sale.items}}'));
          console.log(`[renderHB] Tabla ${idx + 1} tiene {{#each quote.items}}:`, match.includes('{{#each quote.items}}'));
          console.log(`[renderHB] Tabla ${idx + 1} tiene {{#unless sale.items}}:`, match.includes('{{#unless sale.items}}'));
          console.log(`[renderHB] Tabla ${idx + 1} tiene {{#unless quote.items}}:`, match.includes('{{#unless quote.items}}'));
          // Verificar si tiene variables escapadas
          console.log(`[renderHB] Tabla ${idx + 1} tiene variables escapadas (&#123;):`, match.includes('&#123;'));
        });
      }
    }

    const compiled = Handlebars.compile(tpl || '');
    const rendered = compiled(context || {});

    if (debug) {
      // Log DESPUÉS de renderizar
      console.log('[renderHB] Rendered length:', rendered.length);

      // Verificar si el HTML renderizado tiene filas de tabla
      const renderedRows = (rendered.match(/<tr>/g) || []).length;
      console.log('[renderHB] Filas <tr> en HTML renderizado:', renderedRows);

      // Extraer fragmento renderizado de las tablas
      const renderedTableMatch = rendered.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
      if (renderedTableMatch) {
        console.log('[renderHB] Tablas renderizadas encontradas:', renderedTableMatch.length);
        renderedTableMatch.forEach((match, idx) => {
          console.log(`[renderHB] Tabla renderizada ${idx + 1} (COMPLETA):`, match);
          const rowCount = (match.match(/<tr>/g) || []).length;
          console.log(`[renderHB] Tabla renderizada ${idx + 1} tiene ${rowCount} filas <tr>`);
        });
      } else {
        console.warn('[renderHB] ⚠️ NO se encontraron tablas renderizadas en el HTML resultante!');
      }

      console.log('[renderHB] ===== FIN RENDERIZADO =====');
    }

    return rendered;
  } catch (e) {
    console.error('[renderHB] Error renderizando:', e);
    console.error('[renderHB] Stack:', e.stack);
    console.error('[renderHB] Template que causó error (primeros 500 chars):', tpl?.substring(0, 500));
    return `<!-- render error: ${e.message} -->`;
  }
}

// Sanitizador simple (server-side) para evitar <script> y atributos on*
function sanitize(html=''){ if(!html) return ''; let out = String(html); out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,''); out = out.replace(/ on[a-z]+="[^"]*"/gi,''); out = out.replace(/ on[a-z]+='[^']*'/gi,''); return out; }

function normalizeTemplateHtml(html='') {
  if (!html) return '';
  let output = String(html);

  // Primero, reemplazar cualquier escape HTML de las llaves de Handlebars
  output = output.replace(/&#123;&#123;/g, '{{');
  output = output.replace(/&#125;&#125;/g, '}}');
  output = output.replace(/&amp;#123;&amp;#123;/g, '{{');
  output = output.replace(/&amp;#125;&amp;#125;/g, '}}');
  
  // CORREGIR: Convertir templates antiguos que usan {{#each sale.items}} a la nueva estructura con sale.itemsGrouped
  // Para remisiones/invoices y workOrder
  if (output.includes('remission-table') || output.includes('items-table') || output.includes('workorder-table')) {
    // Primero, agregar fila de vehículo al thead si existe y no la tiene
    const theadMatches = output.match(/<thead>([\s\S]*?)<\/thead>/gi);
    if (theadMatches) {
      theadMatches.forEach((match) => {
        // Si el thead no tiene la fila del vehículo, agregarla antes de la fila de encabezados
        if (!match.includes('sale.vehicle.brand') && !match.includes('sale.vehicle.line')) {
          // Para workOrder, la tabla solo tiene 2 columnas (Detalle, Cantidad)
          // Para remisiones, tiene 4 columnas (Detalle, Cantidad, Precio, Total)
          const isWorkOrder = output.includes('workorder-table');
          const vehicleRow = isWorkOrder ? `          {{#if sale.vehicle}}
          <tr style="background: #e8f4f8; font-weight: bold; border: 2px solid #000; border-bottom: 1px solid #000;">
            <th style="padding: 3px 6px; font-size: 11px; border-right: 1px solid #000; text-align: left;">
              {{#if sale.vehicle.brand}}{{sale.vehicle.brand}}{{/if}}{{#if sale.vehicle.line}} {{sale.vehicle.line}}{{/if}}{{#if sale.vehicle.engine}} {{sale.vehicle.engine}}{{/if}}
            </th>
            <th style="padding: 3px 6px; font-size: 11px; text-align: left;">
              {{#if sale.vehicle.plate}}<strong>{{sale.vehicle.plate}}</strong>{{else}}—{{/if}}{{#if sale.vehicle.mileage}} | Kilometraje: {{sale.vehicle.mileage}} km{{/if}}
            </th>
          </tr>
          {{/if}}
          ` : `          {{#if sale.vehicle}}
          <tr style="background: #e8f4f8; font-weight: bold; border: 2px solid #000; border-bottom: 1px solid #000;">
            <th style="padding: 3px 6px; font-size: 11px; border-right: 1px solid #000; text-align: left;">
              {{#if sale.vehicle.brand}}{{sale.vehicle.brand}}{{/if}}{{#if sale.vehicle.line}} {{sale.vehicle.line}}{{/if}}{{#if sale.vehicle.engine}} {{sale.vehicle.engine}}{{/if}}
            </th>
            <th style="padding: 3px 6px; font-size: 11px; border-right: 1px solid #000; text-align: center; background: #fff; border: 2px solid #000;">
              {{#if sale.vehicle.plate}}<strong>{{sale.vehicle.plate}}</strong>{{else}}—{{/if}}
            </th>
            <th colspan="2" style="padding: 3px 6px; font-size: 11px; text-align: left;">
              {{#if sale.vehicle.mileage}}Kilometraje: {{sale.vehicle.mileage}} km{{/if}}
            </th>
          </tr>
          {{/if}}
          `;
          // Insertar antes de la fila de encabezados (Detalle, Cantidad, etc.)
          const updatedThead = match.replace(/(<thead>[\s\S]*?)(<tr>[\s\S]*?<th>Detalle)/i, `$1${vehicleRow}$2`);
          if (updatedThead !== match) {
            output = output.replace(match, updatedThead);
            const templateType = isWorkOrder ? 'orden de trabajo' : 'remisión';
            console.log(`[normalizeTemplateHtml] ✅ Agregada fila de vehículo al thead de ${templateType}`);
          }
        }
      });
    }
    
    const tbodyMatches = output.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tbodyMatches) {
      tbodyMatches.forEach((match) => {
        // Si tiene {{#each sale.items}} pero NO tiene sale.itemsGrouped, convertir a nueva estructura
        if (match.includes('{{#each sale.items}}') && !match.includes('sale.itemsGrouped')) {
          // Remover la fila del vehículo del tbody si existe (ya estará en el thead)
          const newTbody = `<tbody>
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
        </tbody>`;
          output = output.replace(match, newTbody);
          debugLog('[normalizeTemplateHtml] ✅ Convertido tbody de remisión de estructura vieja a nueva (sale.itemsGrouped)');
        }
        // Si tiene {{name}} pero NO tiene {{#each sale.items}} ni sale.itemsGrouped, agregar estructura básica
        else if (match.includes('{{name}}') && !match.includes('{{#each sale.items}}') && !match.includes('sale.itemsGrouped')) {
          const newTbody = `<tbody>
          {{#if sale.itemsGrouped.hasCombos}}
          <tr class="section-header">
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 11px;">COMBOS</td>
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
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 11px;">PRODUCTOS</td>
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
            <td colspan="4" style="font-weight: bold; background: #f0f0f0; padding: 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 11px;">SERVICIOS</td>
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
        </tbody>`;
          output = output.replace(match, newTbody);
          debugLog('[normalizeTemplateHtml] ✅ Agregado tbody de remisión con estructura nueva (sale.itemsGrouped)');
        }
      });
    }
    
    // Asegurar que la tabla tenga tfoot con el total si no lo tiene
    const tableMatches = output.match(/<table[^>]*class="[^"]*remission-table[^"]*"[^>]*>([\s\S]*?)<\/table>/gi);
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
          output = output.replace(tableMatch, newTableMatch);
          debugLog('[normalizeTemplateHtml] ✅ Agregado tfoot con total a tabla de remisión');
        }
      });
    }

    // Ocultar fila de descuento si no hay descuento (solo remisión/factura)
    // REMOVIDO: No agregar condicionales automáticamente alrededor de DESCUENTO
    // La plantilla por defecto ya tiene la estructura correcta sin condicionales
    // Si el usuario quiere condicionales, debe agregarlos manualmente en el editor
  }
  
  // Para cotizaciones - convertir a estructura agrupada igual que remisiones
  if (output.includes('quote-table')) {
    const tbodyMatches = output.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tbodyMatches) {
      tbodyMatches.forEach((match) => {
        // Si tiene {{#each quote.items}} pero NO tiene quote.itemsGrouped, convertir a nueva estructura
        if (match.includes('{{#each quote.items}}') && !match.includes('quote.itemsGrouped')) {
          const newTbody = `<tbody>
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
          <tr>
            <td colspan="4" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}{{/unless}}{{/unless}}
        </tbody>`;
          output = output.replace(match, newTbody);
          debugLog('[normalizeTemplateHtml] ✅ Convertido tbody de cotización de estructura vieja a nueva (quote.itemsGrouped)');
        } else if (match.includes('{{description}}') && !match.includes('{{#each quote.items}}') && !match.includes('quote.itemsGrouped')) {
          const newTbody = `<tbody>
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
          <tr>
            <td colspan="4" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}{{/unless}}{{/unless}}
        </tbody>`;
          output = output.replace(match, newTbody);
          debugLog('[normalizeTemplateHtml] ✅ Agregado tbody de cotización con estructura nueva (quote.itemsGrouped)');
        }
      });
    }
    
    // Asegurar que las tablas de cotización tengan tfoot con total
    const tableMatches = output.match(/<table[^>]*class="[^"]*quote-table[^"]*"[^>]*>[\s\S]*?<\/table>/gi);
    if (tableMatches) {
      tableMatches.forEach((tableHtml) => {
        if (!tableHtml.includes('<tfoot>')) {
          // Agregar tfoot si no existe
          const tbodyEnd = tableHtml.indexOf('</tbody>');
          if (tbodyEnd !== -1) {
            const beforeTbodyEnd = tableHtml.substring(0, tbodyEnd + 8);
            const afterTbodyEnd = tableHtml.substring(tbodyEnd + 8);
            const newTableHtml = beforeTbodyEnd + `
        <tfoot>
          <tr style="border-top: 2px solid #000;">
            <td colspan="3" style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">TOTAL</td>
            <td style="text-align: right; font-weight: bold; padding: 2px 4px; font-size: 9px;">{{money quote.total}}</td>
          </tr>
        </tfoot>` + afterTbodyEnd;
            output = output.replace(tableHtml, newTableHtml);
            debugLog('[normalizeTemplateHtml] ✅ Agregado tfoot con total a tabla de cotización');
          }
        }
      });
    }
  }
  
  // Para orden de trabajo - convertir a estructura agrupada
  if (output.includes('workorder-table')) {
    const tbodyMatches = output.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tbodyMatches) {
      tbodyMatches.forEach((match) => {
        // Para orden de trabajo, siempre usar 2 columnas (sin precios) y sin items individuales de combos
        // Si tiene {{#each sale.items}} pero NO tiene sale.itemsGrouped, convertir a nueva estructura
        if (match.includes('{{#each sale.items}}') && !match.includes('sale.itemsGrouped')) {
          const newTbody = `<tbody>
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
        </tbody>`;
          output = output.replace(match, newTbody);
          debugLog('[normalizeTemplateHtml] ✅ Convertido tbody de orden de trabajo a estructura agrupada (2 columnas, sin items de combos)');
        } else if (match.includes('{{name}}') && !match.includes('{{#each sale.items}}') && !match.includes('sale.itemsGrouped')) {
          // Template sin estructura, agregar estructura agrupada
          const newTbody = `<tbody>
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
        </tbody>`;
          output = output.replace(match, newTbody);
          debugLog('[normalizeTemplateHtml] ✅ Agregado estructura agrupada a orden de trabajo (2 columnas, sin items de combos)');
        }
      });
    }
    
    // Para orden de trabajo, siempre usar 2 columnas (sin precios) y sin items individuales de combos
    // Solo aplicar cambios dentro de la tabla workorder-table, no a otras tablas
    if (output.includes('workorder-table')) {
      // Extraer solo la sección de la tabla workorder-table para procesarla
      // Buscar la tabla completa incluyendo el tag de apertura y cierre
      const tableMatch = output.match(/<table[^>]*class="[^"]*workorder-table[^"]*"[^>]*>[\s\S]*?<\/table>/gi);
      if (tableMatch) {
        tableMatch.forEach((tableHtml) => {
          let processedTable = tableHtml;
          
          // Eliminar cualquier loop de items dentro de combos ({{#each items}})
          processedTable = processedTable.replace(/{{#each\s+items}}[\s\S]*?{{\/each}}/g, '');
          
          // Eliminar columnas de precio y total del thead (solo dentro de esta tabla)
          processedTable = processedTable.replace(/<thead>([\s\S]*?)<\/thead>/gi, (theadMatch) => {
            if (theadMatch.includes('Precio') || theadMatch.includes('Total') || theadMatch.includes('Price') || (theadMatch.match(/<th>/g) || []).length > 2) {
              return `<thead>
          <tr>
            <th>Detalle</th>
            <th>Cantidad</th>
          </tr>
        </thead>`;
            }
            return theadMatch;
          });
          
          // Eliminar columnas de precio y total de las filas (solo dentro de esta tabla)
          processedTable = processedTable.replace(/<td[^>]*class="[^"]*t-right[^"]*"[^>]*>[\s\S]*?<\/td>/g, '');
          processedTable = processedTable.replace(/<td[^>]*>\s*{{\/?money[^}]*}}[\s\S]*?<\/td>/gi, '');
          processedTable = processedTable.replace(/<td[^>]*>\s*{{\$[^}]*}}[\s\S]*?<\/td>/gi, '');
          
          // Asegurar que los section-headers tengan colspan="2" (solo dentro de esta tabla)
          processedTable = processedTable.replace(/<tr[^>]*class="[^"]*section-header[^"]*"[^>]*>[\s\S]*?<td[^>]*colspan="[^"]*"[^>]*>/g, (match) => {
            return match.replace(/colspan="[^"]*"/g, 'colspan="2"');
          });
          
          // Buscar y corregir filas que tengan más de 2 columnas (solo dentro de esta tabla)
          processedTable = processedTable.replace(/<tr[^>]*>[\s\S]*?<td[^>]*>[\s\S]*?<\/td>[\s\S]*?<td[^>]*>[\s\S]*?<\/td>[\s\S]*?<td[^>]*>[\s\S]*?<\/td>/g, (match) => {
            // Si es un section-header, mantenerlo con colspan="2"
            if (match.includes('section-header') || match.includes('PRODUCTOS') || match.includes('SERVICIOS') || match.includes('COMBOS')) {
              return match.replace(/colspan="[^"]*"/g, 'colspan="2"');
            }
            // Si tiene más de 2 td, eliminar los extras (Precio y Total)
            const tdMatches = match.match(/<td[^>]*>[\s\S]*?<\/td>/g);
            if (tdMatches && tdMatches.length > 2) {
              // Mantener solo los primeros 2 td
              const firstTwo = tdMatches.slice(0, 2);
              return match.replace(/<td[^>]*>[\s\S]*?<\/td>/g, (m, i) => {
                if (i < 2) return firstTwo[i];
                return '';
              }).replace(/<tr[^>]*>/, '<tr>').replace(/<\/tr>/, '</tr>');
            }
            return match;
          });
          
          // Eliminar tfoot si existe (no debe haber total en orden de trabajo)
          processedTable = processedTable.replace(/<tfoot>[\s\S]*?<\/tfoot>/gi, '');
          
          // Reemplazar la tabla original con la procesada
          output = output.replace(tableHtml, processedTable);
        });
        
        debugLog('[normalizeTemplateHtml] ✅ Orden de trabajo configurado a 2 columnas (sin precios, sin items de combos)');
      }
    }
  }
  
  // Luego, normalizar patrones antiguos
  const salePattern = /{{#if\s*\(hasItems\s+sale\.items\)}}\s*{{#each\s+sale\.items}}([\s\S]*?){{\/each}}\s*{{else}}([\s\S]*?){{\/if}}/g;
  output = output.replace(salePattern, (match, itemsBlock, elseBlock) => {
    return `{{#each sale.items}}${itemsBlock}{{else}}${elseBlock}{{/each}}`;
  });

  const quotePattern = /{{#if\s*\(hasItems\s+quote\.items\)}}\s*{{#each\s+quote\.items}}([\s\S]*?){{\/each}}\s*{{else}}([\s\S]*?){{\/if}}/g;
  output = output.replace(quotePattern, (match, itemsBlock, elseBlock) => {
    return `{{#each quote.items}}${itemsBlock}{{else}}${elseBlock}{{/each}}`;
  });

  return output;
}

export async function listTemplates(req, res) {
  const { type } = req.query || {};
  const q = { companyId: req.companyId };
  if (type) q.type = type;
  const rows = await Template.find(q).sort({ type: 1, active: -1, updatedAt: -1 });
  res.json(rows);
}

export async function getTemplate(req, res) {
  const doc = await Template.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: 'not found' });
  
  // Corregir automáticamente el HTML si tiene tablas sin {{#each}}
  if (doc.contentHtml) {
    const originalHtml = doc.contentHtml;
    doc.contentHtml = normalizeTemplateHtml(doc.contentHtml);
    
    // Si se corrigió, guardar el template corregido
    if (originalHtml !== doc.contentHtml) {
      await doc.save();
      console.log(`[getTemplate] ✅ Template "${doc.name}" corregido automáticamente`);
    }
  }
  
  res.json(doc);
}

export async function createTemplate(req, res) {
  let {
    type,
    contentHtml = '',
    contentCss = '',
    name = '',
    activate = false,
    meta = {},
    layout
  } = req.body || {};

  if (!type) return res.status(400).json({ error: 'type required' });

  contentHtml = normalizeTemplateHtml(sanitize(contentHtml));

  const last = await Template.findOne({ companyId: req.companyId, type }).sort({ version: -1 });
  const version = last ? last.version + 1 : 1;

  if (activate) {
    await Template.updateMany(
      { companyId: req.companyId, type, active: true },
      { $set: { active: false } }
    );
  }

  const metaPayload = Object.assign({}, meta || {});
  if (layout && typeof layout === 'object') {
    metaPayload.layout = layout;
  }

  const doc = await Template.create({
    companyId: req.companyId,
    type,
    contentHtml,
    contentCss,
    name,
    version,
    active: !!activate,
    meta: metaPayload
  });

  res.json(doc);
}

export async function updateTemplate(req, res) {
  const { id } = req.params;
  const { contentHtml, contentCss, name, activate, meta, layout } = req.body || {};
  const doc = await Template.findOne({ _id: id, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: 'not found' });
  if (contentHtml !== undefined) doc.contentHtml = normalizeTemplateHtml(sanitize(contentHtml));
  if (contentCss !== undefined) doc.contentCss = contentCss;
  if (name !== undefined) doc.name = name;
  if (meta !== undefined && meta && typeof meta === 'object') {
    doc.meta = Object.assign({}, doc.meta || {}, meta);
  }
  if (layout && typeof layout === 'object') {
    doc.meta = Object.assign({}, doc.meta || {}, { layout });
  }
  if (activate !== undefined && activate) {
    await Template.updateMany({ companyId: req.companyId, type: doc.type, active: true }, { $set: { active: false } });
    doc.active = true;
  }
  await doc.save();
  res.json(doc);
}

export async function previewTemplate(req, res) {
  const { type, sampleId, sampleType, quoteData } = req.body || {};
  let { contentHtml = '', contentCss = '', layout, meta = {} } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });
  const debug = TEMPLATE_DEBUG;
  
  if (debug) {
    console.log('[previewTemplate] ===== INICIO PREVIEW =====');
    console.log('[previewTemplate] Type:', type);
    console.log('[previewTemplate] SampleId:', sampleId);
    console.log('[previewTemplate] SampleType:', sampleType);
    console.log('[previewTemplate] Has quoteData:', !!quoteData);
    console.log('[previewTemplate] ContentHtml length:', contentHtml?.length || 0);
  }

  // Sobrescribir contentHtml si es un sticker basado en layout
  if (isStickerType(type)) {
    // El layout puede venir explícito o embebido en meta
    const effectiveLayout =
      (layout && typeof layout === 'object' && layout) ||
      (meta && typeof meta === 'object' && meta.layout) ||
      null;

    if (effectiveLayout) {
      try {
        contentHtml = buildStickerHtmlFromLayout(effectiveLayout, meta || {});
      } catch (e) {
        debugWarn('[previewTemplate] Error generando HTML de sticker desde layout:', e?.message);
      }
    }
  }

  // Verificar variables en el HTML ANTES de sanitize
  const hasSaleEachBefore = contentHtml?.includes('{{#each sale.items}}');
  const hasQuoteEachBefore = contentHtml?.includes('{{#each quote.items}}');
  if (debug) {
    console.log('[previewTemplate] HTML tiene {{#each sale.items}} ANTES sanitize:', hasSaleEachBefore);
    console.log('[previewTemplate] HTML tiene {{#each quote.items}} ANTES sanitize:', hasQuoteEachBefore);

    // Extraer fragmento de tabla del HTML ANTES de sanitize
    const tableMatchBefore = contentHtml.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tableMatchBefore) {
      console.log('[previewTemplate] Tablas encontradas ANTES sanitize:', tableMatchBefore.length);
      tableMatchBefore.forEach((match, idx) => {
        console.log(`[previewTemplate] Tabla ${idx + 1} ANTES (primeros 200 chars):`, match.substring(0, 200));
      });
    }
  }
  
  const originalHtmlLength = contentHtml?.length || 0;
  contentHtml = normalizeTemplateHtml(sanitize(contentHtml));
  const sanitizedHtmlLength = contentHtml?.length || 0;
  
  // Verificar variables DESPUÉS de sanitize
  const hasSaleEachAfter = contentHtml?.includes('{{#each sale.items}}');
  const hasQuoteEachAfter = contentHtml?.includes('{{#each quote.items}}');
  if (debug) {
    console.log('[previewTemplate] HTML tiene {{#each sale.items}} DESPUÉS sanitize:', hasSaleEachAfter);
    console.log('[previewTemplate] HTML tiene {{#each quote.items}} DESPUÉS sanitize:', hasQuoteEachAfter);

    if (originalHtmlLength !== sanitizedHtmlLength) {
      console.warn('[previewTemplate] ⚠️ Sanitize cambió la longitud del HTML:', {
        original: originalHtmlLength,
        sanitized: sanitizedHtmlLength,
        difference: originalHtmlLength - sanitizedHtmlLength
      });
    }

    // Extraer fragmento de tabla del HTML DESPUÉS de sanitize
    const tableMatchAfter = contentHtml.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tableMatchAfter) {
      console.log('[previewTemplate] Tablas encontradas DESPUÉS sanitize:', tableMatchAfter.length);
      tableMatchAfter.forEach((match, idx) => {
        console.log(`[previewTemplate] Tabla ${idx + 1} DESPUÉS (primeros 200 chars):`, match.substring(0, 200));
      });
    } else {
      console.warn('[previewTemplate] ⚠️ NO se encontraron tablas <tbody> en el HTML DESPUÉS de sanitize!');
    }
  }
  
  // Usar originalCompanyId para obtener información de la empresa (nombre, logo)
  // pero companyId para buscar datos (items, ventas, etc.) cuando hay BD compartida
  const ctx = await buildContext({ 
    companyId: req.companyId, 
    originalCompanyId: req.originalCompanyId || req.companyId,
    type, 
    sampleId, 
    sampleType 
  });
  
  if (debug) {
    console.log('[previewTemplate] Context después de buildContext:');
    console.log('[previewTemplate] - Has sale:', !!ctx.sale);
    console.log('[previewTemplate] - Has quote:', !!ctx.quote);
    if (ctx.sale) {
      console.log('[previewTemplate] - Sale items count:', ctx.sale.items?.length || 0);
      console.log('[previewTemplate] - Sale items:', JSON.stringify(ctx.sale.items || [], null, 2));
      console.log('[previewTemplate] - Sale number:', ctx.sale.number);
    }
    if (ctx.quote) {
      console.log('[previewTemplate] - Quote items count:', ctx.quote.items?.length || 0);
      console.log('[previewTemplate] - Quote items:', JSON.stringify(ctx.quote.items || [], null, 2));
      console.log('[previewTemplate] - Quote number:', ctx.quote.number);
    }
  }
  
  // Si se proporcionan datos de cotización directamente (desde UI sin guardar o desde historial), sobrescribir el contexto
  // IMPORTANTE: Siempre usar quoteData cuando se proporciona, ya que son los datos más actualizados de la UI
  if (quoteData && type === 'quote') {
    const hasItemsInData = (quoteData.items || []).length > 0;
    const hasItemsInContext = (ctx.quote?.items || []).length > 0;
    const contextItemsAreValid = hasItemsInContext && (ctx.quote?.itemsGrouped?.hasProducts || ctx.quote?.itemsGrouped?.hasServices || ctx.quote?.itemsGrouped?.hasCombos);
    
    if (debug) {
      console.log('[previewTemplate] QuoteData check:', {
        hasItemsInData,
        hasItemsInContext,
        contextItemsAreValid,
        quoteDataItemsCount: (quoteData.items || []).length,
        contextItemsCount: (ctx.quote?.items || []).length,
        hasProducts: ctx.quote?.itemsGrouped?.hasProducts,
        hasServices: ctx.quote?.itemsGrouped?.hasServices,
        hasCombos: ctx.quote?.itemsGrouped?.hasCombos,
        sampleId: sampleId || 'none'
      });
    }
    
    // CRÍTICO: SIEMPRE usar quoteData cuando se proporciona Y tiene items
    // Esto asegura que los datos de la UI (que pueden tener cambios no guardados) o del historial se usen para la impresión
    // La única excepción es si quoteData NO tiene items Y el contexto SÍ tiene items válidos (usar contexto en ese caso)
    // Pero en la práctica, si quoteData se proporciona, siempre debe usarse porque viene de la UI o del historial
    if (hasItemsInData || !contextItemsAreValid) {
      if (debug) {
        console.log('[previewTemplate] ✅ Usando quoteData para sobrescribir contexto (items actualizados de la UI/historial)', {
          hasItemsInData,
          hasItemsInContext,
          contextItemsAreValid,
          quoteDataItemsCount: (quoteData.items || []).length,
          contextItemsCount: (ctx.quote?.items || []).length,
          willUseQuoteData: true,
          reason: hasItemsInData ? 'quoteData tiene items' : 'contexto no tiene items válidos'
        });
      }
      
      // Procesar items y crear estructura agrupada (igual que en buildContext)
      // CRÍTICO: Calcular subtotal real desde los items (sin IVA)
      let calculatedSubtotal = 0;
      
      // Primero, identificar items de combos (que tienen comboParent o SKU que empieza con "CP-")
      const comboProductItemIds = new Set();
      const comboMap = new Map(); // refId del combo -> { main: item, items: [] }
      
      // Primera pasada: identificar items de combos
      (quoteData.items || []).forEach((item, idx) => {
        const itemSku = String(item.sku || '').toUpperCase();
        const itemRefId = item.refId ? String(item.refId) : '';
        const comboParent = item.comboParent ? String(item.comboParent) : '';
        
        // Si tiene comboParent, es un item anidado de un combo
        if (comboParent) {
          if (!comboMap.has(comboParent)) {
            comboMap.set(comboParent, { main: null, items: [] });
          }
          comboMap.get(comboParent).items.push({ item, idx });
          comboProductItemIds.add(itemRefId || `idx_${idx}`);
        }
        
        // Si el SKU empieza con "CP-", también es parte de un combo
        if (itemSku.startsWith('CP-') && item.refId) {
          const parentId = String(item.refId);
          if (!comboMap.has(parentId)) {
            comboMap.set(parentId, { main: null, items: [] });
          }
          comboMap.get(parentId).items.push({ item, idx });
          comboProductItemIds.add(itemRefId || `idx_${idx}`);
        }
      });
      
      const products = [];
      const services = [];
      const combos = [];
      
      // Segunda pasada: procesar items y agrupar
      (quoteData.items || []).forEach((item, idx) => {
        const itemRefId = item.refId ? String(item.refId) : '';
        const itemSku = String(item.sku || '').toUpperCase();
        const comboParent = item.comboParent ? String(item.comboParent) : '';
        
        // Si es parte de un combo (tiene comboParent o SKU empieza con "CP-"), saltarlo
        if (comboParent || (itemSku.startsWith('CP-') && item.refId)) {
          return; // Ya será procesado como parte del combo
        }
        
        // Calcular subtotal del item (usar subtotal si existe, sino calcular)
        const itemQty = item.qty === null || item.qty === undefined || item.qty === '' ? null : Number(item.qty);
        const itemUnitPrice = Number(item.unitPrice) || 0;
        // Si qty es null, usar 1 para cálculo (pero preservar null para display)
        const qtyForCalc = itemQty === null ? 1 : (itemQty > 0 ? itemQty : 1);
        // Usar nullish coalescing para preservar 0 si el subtotal es explícitamente 0
        const itemSubtotal = (item.subtotal !== null && item.subtotal !== undefined) 
          ? Number(item.subtotal) 
          : (qtyForCalc * itemUnitPrice);
        calculatedSubtotal += itemSubtotal;
        
        const itemObj = {
          sku: item.sku || '',
          name: item.description || '',
          description: item.description || '',
          qty: itemQty, // Preservar null si es null, no convertir a 0
          unitPrice: itemUnitPrice,
          total: itemSubtotal,
          subtotal: itemSubtotal,
          source: item.source || 'service',
          kind: item.kind || 'SERVICIO'
        };
        
        // Verificar si es un combo principal (tiene refId y hay items asociados)
        if (item.refId && comboMap.has(itemRefId)) {
          const comboData = comboMap.get(itemRefId);
          // Es un combo principal - agregar items anidados
          const comboItems = comboData.items.map(({ item: nestedItem }) => {
            const nestedQty = nestedItem.qty === null || nestedItem.qty === undefined || nestedItem.qty === '' ? null : Number(nestedItem.qty);
            const nestedUnitPrice = Number(nestedItem.unitPrice) || 0;
            const nestedQtyForCalc = nestedQty === null ? 1 : (nestedQty > 0 ? nestedQty : 1);
            const nestedSubtotal = (nestedItem.subtotal !== null && nestedItem.subtotal !== undefined) 
              ? Number(nestedItem.subtotal) 
              : (nestedQtyForCalc * nestedUnitPrice);
            calculatedSubtotal += nestedSubtotal; // Incluir en el subtotal total
            
            return {
              sku: nestedItem.sku || '',
              name: nestedItem.description || nestedItem.name || '',
              description: nestedItem.description || '',
              qty: nestedQty,
              unitPrice: nestedUnitPrice,
              total: nestedSubtotal,
              subtotal: nestedSubtotal,
              source: nestedItem.source || '',
              refId: nestedItem.refId || null
            };
          });
          
          combos.push({
            ...itemObj,
            items: comboItems
          });
        } else if (!comboProductItemIds.has(itemRefId) && !comboProductItemIds.has(`idx_${idx}`)) {
          // No es parte de un combo, clasificar por kind
          const kind = String(item.kind || 'SERVICIO').trim().toUpperCase();
          if (kind === 'PRODUCTO' || kind === 'PRODUCT') {
            products.push(itemObj);
          } else {
            services.push(itemObj);
          }
        }
      });
      
      // Crear estructura agrupada
      const itemsGrouped = {
        combos: combos,
        products: products,
        services: services,
        hasCombos: combos.length > 0,
        hasProducts: products.length > 0,
        hasServices: services.length > 0
      };
      
      const ivaEnabled = quoteData.ivaEnabled || false;
      const frontendTotal = Number(quoteData.totals?.total || 0);
      
      // CRÍTICO: Calcular descuento implícito desde la diferencia entre el subtotal calculado
      // y el total del frontend (que ya incluye descuento e IVA si aplica)
      // El frontend aplica: subtotal -> descuento -> subtotalAfterDiscount -> IVA (si aplica) -> total
      let discountValue = 0;
      let subtotalAfterDiscount = calculatedSubtotal;
      
      if (ivaEnabled && frontendTotal > 0) {
        // Si IVA está activado: frontendTotal = (subtotal - discount) * 1.19
        // Entonces: subtotalAfterDiscount = frontendTotal / 1.19
        // Y: discount = calculatedSubtotal - subtotalAfterDiscount
        subtotalAfterDiscount = Math.round(frontendTotal / 1.19);
        discountValue = Math.max(0, Math.round(calculatedSubtotal - subtotalAfterDiscount));
        // Recalcular subtotalAfterDiscount para evitar errores de redondeo
        subtotalAfterDiscount = calculatedSubtotal - discountValue;
      } else if (ivaEnabled && frontendTotal <= 0) {
        // Si IVA está activado pero el total es 0 o negativo (100% descuento)
        // El descuento es igual al subtotal calculado
        discountValue = Math.max(0, calculatedSubtotal);
        subtotalAfterDiscount = 0;
      } else {
        // Si IVA no está activado: frontendTotal = subtotal - discount
        // Entonces: discount = calculatedSubtotal - frontendTotal
        discountValue = Math.max(0, Math.round(calculatedSubtotal - frontendTotal));
        subtotalAfterDiscount = calculatedSubtotal - discountValue;
      }
      
      // Usar subtotalAfterDiscount como el subtotal base para cálculos
      const subtotal = subtotalAfterDiscount;
      
      ctx.quote = {
        number: quoteData.number || '',
        createdAt: quoteData.date || new Date(),
        date: quoteData.date || new Date(),
        customer: {
          name: quoteData.customer?.name || '',
          phone: quoteData.customer?.phone || '',
          email: quoteData.customer?.email || '',
          address: quoteData.customer?.address || ''
        },
        vehicle: {
          plate: quoteData.vehicle?.plate || '',
          make: quoteData.vehicle?.make || '',
          line: quoteData.vehicle?.line || '',
          modelYear: quoteData.vehicle?.modelYear || '',
          displacement: quoteData.vehicle?.displacement || '',
          brand: quoteData.vehicle?.make || '',
          mileage: quoteData.vehicle?.mileage || ''
        },
        validity: quoteData.validity || '',
        items: (quoteData.items || []).map(item => {
          // CRÍTICO: Preservar null qty para consistencia con itemsGrouped
          const itemQty = item.qty === null || item.qty === undefined || item.qty === '' ? null : Number(item.qty);
          const itemUnitPrice = Number(item.unitPrice) || 0;
          const qtyForCalc = itemQty === null ? 1 : (itemQty > 0 ? itemQty : 1);
          // Usar nullish coalescing para preservar 0 si el subtotal es explícitamente 0
          const itemSubtotal = (item.subtotal !== null && item.subtotal !== undefined) 
            ? Number(item.subtotal) 
            : (qtyForCalc * itemUnitPrice);
          
          return {
            description: item.description || '',
            qty: itemQty, // Preservar null, no convertir a 0
            unitPrice: itemUnitPrice,
            subtotal: itemSubtotal,
            sku: item.sku || '',
            name: item.description || '',
            total: itemSubtotal
          };
        }),
        itemsGrouped: itemsGrouped,
        total: subtotal,
        ivaEnabled: ivaEnabled,
        discount: discountValue > 0 ? { value: discountValue, type: 'fixed' } : null
      };
      
      // Calcular IVA si está habilitado (sobre el subtotal después de descuento)
      if (ivaEnabled) {
        // Usar el total del frontend directamente para evitar discrepancias por redondeo
        // El frontend ya calculó el total correctamente: (subtotal - discount) * 1.19
        const totalWithIva = frontendTotal;
        // Calcular IVA como la diferencia entre el total y el subtotal para garantizar consistencia
        // Esto asegura que subtotal + iva = total exactamente
        const iva = Math.round(totalWithIva - subtotal);
        
        ctx.Q = {
          subtotal: subtotal,
          iva: iva,
          total: totalWithIva,
          'nº': quoteData.number || '',
          fecha: quoteData.date || new Date(),
          P: itemsGrouped.hasProducts,
          S: itemsGrouped.hasServices,
          C: itemsGrouped.hasCombos
        };
      } else {
        ctx.Q = {
          total: subtotal,
          'nº': quoteData.number || '',
          fecha: quoteData.date || new Date(),
          P: itemsGrouped.hasProducts,
          S: itemsGrouped.hasServices,
          C: itemsGrouped.hasCombos
        };
      }
      
      if (debug) {
        console.log('[previewTemplate] ✅ Quote context actualizado con items:', {
          itemsCount: ctx.quote.items?.length || 0,
          itemsGrouped: {
            hasProducts: ctx.quote.itemsGrouped?.hasProducts,
            hasServices: ctx.quote.itemsGrouped?.hasServices,
            hasCombos: ctx.quote.itemsGrouped?.hasCombos,
            productsCount: ctx.quote.itemsGrouped?.products?.length || 0,
            servicesCount: ctx.quote.itemsGrouped?.services?.length || 0,
            combosCount: ctx.quote.itemsGrouped?.combos?.length || 0
          },
          ivaEnabled: ivaEnabled,
          total: ctx.quote.total
        });
      }
    }
  }
  
  const html = renderHB(contentHtml, ctx);
  
  if (debug) console.log('[previewTemplate] ===== FIN PREVIEW =====');
  
  res.json({ rendered: html, css: contentCss, context: ctx });
}

// Obtener plantilla activa para un tipo (uso futuro impresiÃ³n)
export async function activeTemplate(req, res) {
  const { type } = req.params;
  const doc = await Template.findOne({ companyId: req.companyId, type, active: true }).sort({ updatedAt: -1 });
  if (!doc) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[activeTemplate] No se encontró template activo:', { type, companyId: req.companyId });
    }
    return res.json(null);
  }
  
  // Corregir automáticamente el HTML si tiene tablas sin {{#each}}
  if (doc.contentHtml) {
    const originalHtml = doc.contentHtml;
    doc.contentHtml = normalizeTemplateHtml(doc.contentHtml);
    
    // Si se corrigió, guardar el template corregido
    if (originalHtml !== doc.contentHtml) {
      await doc.save();
      console.log(`[activeTemplate] ✅ Template activo "${doc.name}" corregido automáticamente`);
    }
  }
  
  if (process.env.NODE_ENV !== 'production') {
    console.log('[activeTemplate] Template encontrado:', {
      id: doc._id,
      name: doc.name,
      type: doc.type,
      active: doc.active,
      contentHtmlLength: doc.contentHtml?.length || 0,
      contentCssLength: doc.contentCss?.length || 0,
      hasContentHtml: !!(doc.contentHtml && doc.contentHtml.trim()),
      hasContentCss: !!(doc.contentCss && doc.contentCss.trim())
    });
  }
  res.json(doc);
}

// Duplicar plantilla
export async function duplicateTemplate(req, res) {
  const { id } = req.params;
  const { name } = req.body || {};
  
  const original = await Template.findOne({ _id: id, companyId: req.companyId });
  if (!original) return res.status(404).json({ error: 'Template not found' });
  
  // Get next version number
  const last = await Template.findOne({ companyId: req.companyId, type: original.type }).sort({ version: -1 });
  const version = last ? (last.version + 1) : 1;
  
  // Create duplicate with new name
  const duplicateName = name || `${original.name} - Copia`;
  const duplicate = await Template.create({
    companyId: req.companyId,
    type: original.type,
    contentHtml: original.contentHtml,
    contentCss: original.contentCss,
    name: duplicateName,
    version: version,
    active: false // Duplicates are never active by default
  });
  
  res.json(duplicate);
}

// Eliminar plantilla
export async function deleteTemplate(req, res) {
  const { id } = req.params;
  const doc = await Template.findOne({ _id: id, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: 'not found' });
  
  // If this was the active template, we need to handle that
  const wasActive = doc.active;
  const templateType = doc.type;
  
  await Template.deleteOne({ _id: id, companyId: req.companyId });
  
  // If we deleted the active template, activate the most recent one of the same type
  if (wasActive) {
    const nextTemplate = await Template.findOne({ 
      companyId: req.companyId, 
      type: templateType 
    }).sort({ updatedAt: -1 });
    
    if (nextTemplate) {
      nextTemplate.active = true;
      await nextTemplate.save();
    }
  }
  
  res.json({ success: true, deletedId: id });
}

