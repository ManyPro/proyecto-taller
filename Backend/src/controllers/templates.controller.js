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

// Helpers para armar contexto base multi-documento
// Params:
//  - type: tipo de plantilla (invoice, workOrder, quote, sticker, order)
//  - sampleType (opcional): fuerza el tipo de documento para el contexto (si distinto al type de la plantilla)
//  - sampleId (opcional): id especÃ­fico del documento
async function buildContext({ companyId, type, sampleType, sampleId }) {
  const ctx = { company: {}, now: new Date(), meta: { requestedType: type, sampleType: sampleType || null } };
  const company = await Company.findOne({ _id: companyId });
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

  // Venta (invoice/workOrder comparten sale)
  if (['invoice','workOrder','sale'].includes(effective)) {
    let sale = null;
    if (sampleId) {
      sale = await Sale.findOne({ _id: sampleId, companyId });
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildContext Sale] Buscando venta:', {
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
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildContext Sale] Items antes de procesar:', {
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
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildContext Sale] Items agrupados:', {
          productsCount: products.length,
          servicesCount: services.length,
          combosCount: combos.length,
          products: products.map(i => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
          services: services.map(i => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
          combos: combos.map(c => ({ name: c.name, itemsCount: c.items.length, items: c.items.map(i => ({ name: i.name, unitPrice: i.unitPrice })) }))
        });
        console.log('[buildContext Sale] sale.itemsGrouped creado:', {
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
      // Asegurar que cada item tenga las propiedades necesarias
      // NO filtrar items vacíos aquí, dejarlos pasar para que el template decida
      quoteObj.items = quoteObj.items.map(item => ({
        sku: item.sku || '',
        description: item.description || '',
        qty: item.qty || null,
        unitPrice: Number(item.unitPrice) || 0,
        subtotal: Number(item.subtotal) || (item.qty ? Number(item.qty) : 1) * (Number(item.unitPrice) || 0)
      }));
      
      // Log para depuración
      if (process.env.NODE_ENV !== 'production') {
        console.log('[buildContext Quote]', {
          quoteId: quoteObj._id,
          quoteNumber: quoteObj.number,
          itemsCount: quoteObj.items.length,
          items: quoteObj.items.map(i => ({ description: i.description, qty: i.qty, unitPrice: i.unitPrice, subtotal: i.subtotal }))
        });
      }
      // Asegurar que customer esté presente
      if (!quoteObj.customer) {
        quoteObj.customer = { name: '', phone: '', email: '' };
      }
      // Asegurar que vehicle esté presente
      if (!quoteObj.vehicle) {
        quoteObj.vehicle = { plate: '', make: '', line: '', modelYear: '', displacement: '' };
      }
      ctx.quote = quoteObj;
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
          // MÃ¡rgenes mÃ­nimos para mejor densidad en stickers pequeÃ±os
          ctx.item.qr = await QRCode.toDataURL(qrValue, { margin: 0, scale: 4, color: { dark: '#000000', light: '#FFFFFF' } });
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
  // Helper para verificar si un array tiene elementos
  Handlebars.registerHelper('hasItems', function(items) {
    if (!items) return false;
    if (!Array.isArray(items)) return false;
    return items.length > 0;
  });
  hbInitialized = true;
}

function renderHB(tpl, context) {
  ensureHB();
  try {
    if (!tpl || !tpl.trim()) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[renderHB] Template vacío o solo espacios');
      }
      return '';
    }
    
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
    
    const compiled = Handlebars.compile(tpl || '');
    const rendered = compiled(context || {});
    
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
  // Para remisiones/invoices
  if (output.includes('remission-table') || output.includes('items-table')) {
    const tbodyMatches = output.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tbodyMatches) {
      tbodyMatches.forEach((match) => {
        // Si tiene {{#each sale.items}} pero NO tiene sale.itemsGrouped, convertir a nueva estructura
        if (match.includes('{{#each sale.items}}') && !match.includes('sale.itemsGrouped')) {
          const newTbody = `<tbody>
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
            <td>{{#if sku}}[{{sku}}] {{/if}}{{name}}</td>
            <td class="t-center">{{qty}}</td>
            <td class="t-right">{{money unitPrice}}</td>
            <td class="t-right">{{money total}}</td>
          </tr>
          {{/each}}
          {{/if}}
          
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
          
          {{#unless sale.itemsGrouped.hasProducts}}{{#unless sale.itemsGrouped.hasServices}}{{#unless sale.itemsGrouped.hasCombos}}
          <tr>
            <td colspan="4" style="text-align: center; color: #666;">Sin ítems</td>
          </tr>
          {{/unless}}{{/unless}}{{/unless}}
        </tbody>`;
          output = output.replace(match, newTbody);
          console.log('[normalizeTemplateHtml] ✅ Convertido tbody de remisión de estructura vieja a nueva (sale.itemsGrouped)');
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
          console.log('[normalizeTemplateHtml] ✅ Agregado tbody de remisión con estructura nueva (sale.itemsGrouped)');
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
          console.log('[normalizeTemplateHtml] ✅ Agregado tfoot con total a tabla de remisión');
        }
      });
    }
  }
  
  // Para cotizaciones
  if (output.includes('quote-table')) {
    const tbodyMatches = output.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tbodyMatches) {
      tbodyMatches.forEach((match) => {
        if (match.includes('{{description}}') && !match.includes('{{#each quote.items}}')) {
          const newTbody = `<tbody>
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
        </tbody>`;
          output = output.replace(match, newTbody);
          console.log('[normalizeTemplateHtml] ✅ Corregido tbody de cotización sin {{#each}}');
        }
      });
    }
  }
  
  // Para orden de trabajo - convertir a estructura agrupada
  if (output.includes('workorder-table')) {
    const tbodyMatches = output.match(/<tbody>([\s\S]*?)<\/tbody>/gi);
    if (tbodyMatches) {
      tbodyMatches.forEach((match) => {
        // Si tiene {{#each sale.items}} pero NO tiene sale.itemsGrouped, convertir a nueva estructura
        if (match.includes('{{#each sale.items}}') && !match.includes('sale.itemsGrouped')) {
          const newTbody = `<tbody>
          {{#if sale.itemsGrouped.hasCombos}}
          <tr class="section-header">
            <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding: 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 11px;">COMBOS</td>
          </tr>
          {{#each sale.itemsGrouped.combos}}
          <tr>
            <td><strong>{{name}}</strong></td>
            <td class="t-center">{{qty}}</td>
          </tr>
          {{#each items}}
          <tr>
            <td style="padding-left: 30px;">• {{name}}</td>
            <td class="t-center">{{qty}}</td>
          </tr>
          {{/each}}
          {{/each}}
          {{/if}}
          
          {{#if sale.itemsGrouped.hasProducts}}
          <tr class="section-header">
            <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding: 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 11px;">PRODUCTOS</td>
          </tr>
          {{#each sale.itemsGrouped.products}}
          <tr>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{name}}</td>
            <td class="t-center">{{qty}}</td>
          </tr>
          {{/each}}
          {{/if}}
          
          {{#if sale.itemsGrouped.hasServices}}
          <tr class="section-header">
            <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding: 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 11px;">SERVICIOS</td>
          </tr>
          {{#each sale.itemsGrouped.services}}
          <tr>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{name}}</td>
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
          console.log('[normalizeTemplateHtml] ✅ Convertido tbody de orden de trabajo a estructura agrupada');
        } else if (match.includes('{{name}}') && !match.includes('{{#each sale.items}}') && !match.includes('sale.itemsGrouped')) {
          // Template sin estructura, agregar estructura agrupada
          const newTbody = `<tbody>
          {{#if sale.itemsGrouped.hasCombos}}
          <tr class="section-header">
            <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding: 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 11px;">COMBOS</td>
          </tr>
          {{#each sale.itemsGrouped.combos}}
          <tr>
            <td><strong>{{name}}</strong></td>
            <td class="t-center">{{qty}}</td>
          </tr>
          {{#each items}}
          <tr>
            <td style="padding-left: 30px;">• {{name}}</td>
            <td class="t-center">{{qty}}</td>
          </tr>
          {{/each}}
          {{/each}}
          {{/if}}
          
          {{#if sale.itemsGrouped.hasProducts}}
          <tr class="section-header">
            <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding: 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 11px;">PRODUCTOS</td>
          </tr>
          {{#each sale.itemsGrouped.products}}
          <tr>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{name}}</td>
            <td class="t-center">{{qty}}</td>
          </tr>
          {{/each}}
          {{/if}}
          
          {{#if sale.itemsGrouped.hasServices}}
          <tr class="section-header">
            <td colspan="2" style="font-weight: bold; background: #f0f0f0; padding: 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 11px;">SERVICIOS</td>
          </tr>
          {{#each sale.itemsGrouped.services}}
          <tr>
            <td>{{#if sku}}[{{sku}}] {{/if}}{{name}}</td>
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
          console.log('[normalizeTemplateHtml] ✅ Agregado estructura agrupada a orden de trabajo');
        }
      });
    }
    
    // Asegurar que las tablas de orden de trabajo solo tengan 2 columnas (Detalle y Cantidad)
    // Eliminar columnas de Precio y Total si existen
    // Buscar y corregir el thead para que solo tenga 2 columnas
      const theadMatches = output.match(/<thead>([\s\S]*?)<\/thead>/gi);
      if (theadMatches) {
        theadMatches.forEach((match) => {
          // Si tiene más de 2 columnas (Precio, Total), reducirlas a 2
          if (match.includes('Precio') || match.includes('Total') || match.includes('Price') || (match.match(/<th>/g) || []).length > 2) {
            const newThead = `<thead>
          <tr>
            <th>Detalle</th>
            <th>Cantidad</th>
          </tr>
        </thead>`;
            output = output.replace(match, newThead);
            console.log('[normalizeTemplateHtml] ✅ Corregido thead de orden de trabajo a 2 columnas');
          }
        });
      }
      
      // Buscar y corregir filas que tengan más de 2 columnas
      output = output.replace(/<tr[^>]*>[\s\S]*?<td[^>]*>[\s\S]*?<\/td>[\s\S]*?<td[^>]*>[\s\S]*?<\/td>[\s\S]*?<td[^>]*>[\s\S]*?<\/td>/g, (match) => {
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
      
    // Limpiar cualquier referencia a columnas de precio o total en las filas de items
    // Eliminar columnas con clase t-right (precio/total)
    output = output.replace(/<td[^>]*class="[^"]*t-right[^"]*"[^>]*>[\s\S]*?<\/td>/g, '');
    // Eliminar columnas con $ (precio)
    output = output.replace(/<td[^>]*>\s*\$[\s\S]*?<\/td>/g, '');
    // Eliminar columnas con {{money}} (precio/total)
    output = output.replace(/<td[^>]*>\s*{{money[^}]*}}[\s\S]*?<\/td>/g, '');
    
    // Corregir colspan en section-headers para que sea 2
    output = output.replace(/(<tr[^>]*class="[^"]*section-header[^"]*"[^>]*>[\s\S]*?<td[^>]*)colspan="[^"]*"([^>]*>[\s\S]*?PRODUCTOS|SERVICIOS|COMBOS[\s\S]*?<\/td>)/g, '$1colspan="2"$2');
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
  let { type, contentHtml = '', contentCss = '', name = '', activate = false } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });
  contentHtml = normalizeTemplateHtml(sanitize(contentHtml));
  const last = await Template.findOne({ companyId: req.companyId, type }).sort({ version: -1 });
  const version = last ? (last.version + 1) : 1;
  if (activate) {
    await Template.updateMany({ companyId: req.companyId, type, active: true }, { $set: { active: false } });
  }
  const doc = await Template.create({ companyId: req.companyId, type, contentHtml, contentCss, name, version, active: !!activate });
  res.json(doc);
}

export async function updateTemplate(req, res) {
  const { id } = req.params;
  const { contentHtml, contentCss, name, activate } = req.body || {};
  const doc = await Template.findOne({ _id: id, companyId: req.companyId });
  if (!doc) return res.status(404).json({ error: 'not found' });
  if (contentHtml !== undefined) doc.contentHtml = normalizeTemplateHtml(sanitize(contentHtml));
  if (contentCss !== undefined) doc.contentCss = contentCss;
  if (name !== undefined) doc.name = name;
  if (activate !== undefined && activate) {
    await Template.updateMany({ companyId: req.companyId, type: doc.type, active: true }, { $set: { active: false } });
    doc.active = true;
  }
  await doc.save();
  res.json(doc);
}

export async function previewTemplate(req, res) {
  const { type, sampleId, sampleType, quoteData } = req.body || {};
  let { contentHtml = '', contentCss = '' } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type required' });
  
  console.log('[previewTemplate] ===== INICIO PREVIEW =====');
  console.log('[previewTemplate] Type:', type);
  console.log('[previewTemplate] SampleId:', sampleId);
  console.log('[previewTemplate] SampleType:', sampleType);
  console.log('[previewTemplate] Has quoteData:', !!quoteData);
  console.log('[previewTemplate] ContentHtml length:', contentHtml?.length || 0);
  
  // Verificar variables en el HTML ANTES de sanitize
  const hasSaleEachBefore = contentHtml?.includes('{{#each sale.items}}');
  const hasQuoteEachBefore = contentHtml?.includes('{{#each quote.items}}');
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
  
  const originalHtmlLength = contentHtml?.length || 0;
  contentHtml = normalizeTemplateHtml(sanitize(contentHtml));
  const sanitizedHtmlLength = contentHtml?.length || 0;
  
  // Verificar variables DESPUÉS de sanitize
  const hasSaleEachAfter = contentHtml?.includes('{{#each sale.items}}');
  const hasQuoteEachAfter = contentHtml?.includes('{{#each quote.items}}');
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
  
  const ctx = await buildContext({ companyId: req.companyId, type, sampleId, sampleType });
  
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
  
  // Si se proporcionan datos de cotización directamente (desde UI sin guardar), sobrescribir el contexto
  // O si hay quoteData y los items del contexto están vacíos, usar quoteData
  if (quoteData && type === 'quote') {
    const hasItemsInData = (quoteData.items || []).length > 0;
    const hasItemsInContext = (ctx.quote?.items || []).length > 0;
    
    console.log('[previewTemplate] QuoteData check:', {
      hasItemsInData,
      hasItemsInContext,
      quoteDataItemsCount: (quoteData.items || []).length
    });
    
    // Usar quoteData si no hay sampleId o si los items del contexto están vacíos pero quoteData tiene items
    if (!sampleId || (!hasItemsInContext && hasItemsInData)) {
      console.log('[previewTemplate] Usando quoteData para sobrescribir contexto');
      ctx.quote = {
        number: quoteData.number || '',
        createdAt: quoteData.date || new Date(),
        customer: {
          name: quoteData.customer?.name || '',
          phone: quoteData.customer?.phone || '',
          email: quoteData.customer?.email || ''
        },
        vehicle: {
          plate: quoteData.vehicle?.plate || '',
          make: quoteData.vehicle?.make || '',
          line: quoteData.vehicle?.line || '',
          modelYear: quoteData.vehicle?.modelYear || '',
          displacement: quoteData.vehicle?.displacement || ''
        },
        validity: quoteData.validity || '',
        items: (quoteData.items || []).map(item => ({
          description: item.description || '',
          qty: item.qty || null,
          unitPrice: Number(item.unitPrice) || 0,
          subtotal: Number(item.subtotal) || (item.qty > 0 ? Number(item.qty) : 1) * (Number(item.unitPrice) || 0),
          sku: item.sku || ''
        })),
        total: quoteData.totals?.total || 0
      };
      console.log('[previewTemplate] Quote context actualizado con items:', ctx.quote.items?.length || 0);
    }
  }
  
  const html = renderHB(contentHtml, ctx);
  
  console.log('[previewTemplate] ===== FIN PREVIEW =====');
  
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

