import { API } from "./api.esm.js";
import { normalizeText, matchesSearch } from "./search-utils.js";

// Función para restaurar variables Handlebars acortadas antes de enviar al backend
function restoreHandlebarsVarsForPreview(html) {
  if (!html) return html;
  
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
    result = result.replace(from, to);
  });
  
  return result;
}

export function initQuotes({ getCompanyEmail }) {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let inited = false;
  let emailScope = '';
  let currentQuoteId = null;
  let currentDiscount = { type: null, value: 0 };
  const dirty = {
    clientName:false, clientPhone:false, clientEmail:false,
    brand:false, line:false, year:false, cc:false
  };
  function markDirty(key){ if(dirty.hasOwnProperty(key)) dirty[key]=true; }
  function clearDirtyFlags(){ Object.keys(dirty).forEach(k=>dirty[k]=false); }

  const KEYS = (window.QUOTES_KEYS || {
    lastNumber: 'quotes:lastNumber',
    draft: 'quotes:current',
  });

  const tab = $('#tab-cotizaciones');
  if(!tab) return;

  const iNumber = $('#q-number');
  const iNumberBig = $('#q-number-big');
  const iDatetime = $('#q-datetime');
  const iClientName  = $('#q-client-name');
  const iClientPhone = $('#q-client-phone');
  const iClientEmail = $('#q-client-email');
  const iPlate = $('#q-plate');
  const iBrand = $('#q-brand');
  const iLine  = $('#q-line');
  const iYear  = $('#q-year');
  const iCc    = $('#q-cc');
  const iMileage = $('#q-mileage');
  const iVehicleSearch = $('#q-vehicle-search');
  const iVehicleId = $('#q-vehicle-id');
  const iVehicleDropdown = $('#q-vehicle-dropdown');
  const iVehicleSelected = $('#q-vehicle-selected');
  const iYearWarning = $('#q-year-warning');
  let selectedQuoteVehicle = null;
  let quoteVehicleSearchTimeout = null;
  const iValidDays = $('#q-valid-days');
  const iSpecialNotesList = $('#q-special-notes-list');
  const iAddSpecialNote = $('#q-add-special-note');
  const iSaveDraft = $('#q-saveDraft');
  const btnClear   = $('#q-clearAll');
  const btnWA      = $('#q-sendWhatsApp');
  const btnPDF     = $('#q-exportPdf');
  const btnSaveBackend = $('#q-saveBackend');
  const rowsBox = $('#q-rows');
  const rowTemplate = $('#q-row-template');
  const btnAddUnified = $('#q-add-unified');
  const lblSubtotalProducts = $('#q-subtotal-products');
  const lblSubtotalServices = $('#q-subtotal-services');
  const lblTotal = $('#q-total');
  const discountSection = $('#q-discount-section');
  const discountAmount = $('#q-discount-amount');
  const btnDiscountPercent = $('#q-discount-percent');
  const btnDiscountFixed = $('#q-discount-fixed');
  const btnDiscountClear = $('#q-discount-clear');
  const previewWA = $('#q-whatsappPreview');
  const qData = $('#q-data');
  const qSummary = $('#q-summary');
  const qhText = $('#qh-text');
  const qhFrom = $('#qh-from');
  const qhTo   = $('#qh-to');
  const qhApply= $('#qh-apply');
  const qhClear= $('#qh-clear');
  const qhList = $('#q-history-list');

  const pad5 = (n) => String(n).padStart(5,'0');
  const money = (n)=>'$'+Math.round(Number(n||0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  const parseMoney = (s)=>Number((s||'').replace(/\D+/g,'')||0);
  const todayIso = () => {
    try {
      return (window.dayjs ? window.dayjs() : new Date()).format
        ? window.dayjs().format('YYYY-MM-DD HH:mm')
        : new Date().toLocaleString();
    } catch { return new Date().toLocaleString(); }
  };
  const toast = (m)=>console.log(m);
  const kLast  = ()=>`${KEYS.lastNumber}:${emailScope}`;
  const kDraft = ()=>`${KEYS.draft}:${emailScope}`;

  async function searchVehiclesForQuote(query) {
    if (!query || query.trim().length < 1) {
      if (iVehicleDropdown) iVehicleDropdown.style.display = 'none';
      return;
    }
    try {
      const r = await API.vehicles.search({ q: query.trim(), limit: 30 });
      const vehicles = Array.isArray(r?.items) ? r.items : [];
      if (!iVehicleDropdown) return;
      if (vehicles.length === 0) {
        iVehicleDropdown.innerHTML = '<div class="p-3 text-center text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No se encontraron vehículos</div>';
        iVehicleDropdown.style.display = 'block';
        return;
      }
      iVehicleDropdown.replaceChildren(...vehicles.map(v => {
        const div = document.createElement('div');
        div.className = 'p-2 px-3 cursor-pointer border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-50 transition-colors';
        div.innerHTML = `
          <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${v.make} ${v.line}</div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}</div>
        `;
        div.addEventListener('click', () => {
          selectedQuoteVehicle = v;
          if (iVehicleId) iVehicleId.value = v._id;
          if (iVehicleSearch) iVehicleSearch.value = `${v.make} ${v.line} ${v.displacement}`;
          if (iVehicleSelected) {
            iVehicleSelected.innerHTML = `
              <span class="text-green-500 dark:text-green-400 theme-light:text-green-600">✓</span> 
              <strong class="text-white dark:text-white theme-light:text-slate-900">${v.make} ${v.line}</strong> - Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}
            `;
          }
          if (iVehicleDropdown) iVehicleDropdown.style.display = 'none';
          if (iBrand) iBrand.value = v.make || '';
          if (iLine) iLine.value = v.line || '';
          if (iCc) iCc.value = v.displacement || '';
          if (iYear && iYear.value) {
            validateQuoteYear();
          }
        });
        div.addEventListener('mouseenter', () => {
          div.classList.add('bg-slate-700/20', 'dark:bg-slate-700/20', 'theme-light:bg-slate-50');
        });
        div.addEventListener('mouseleave', () => {
          div.classList.remove('bg-slate-700/20', 'dark:bg-slate-700/20', 'theme-light:bg-slate-50');
        });
        return div;
      }));
      iVehicleDropdown.style.display = 'block';
    } catch (err) {
      console.error('Error al buscar vehículos:', err);
    }
  }
  
  async function validateQuoteYear() {
    if (!selectedQuoteVehicle || !iYear || !iYear.value) {
      if (iYearWarning) iYearWarning.style.display = 'none';
      return;
    }
    const yearNum = Number(iYear.value);
    if (!Number.isFinite(yearNum)) {
      if (iYearWarning) iYearWarning.style.display = 'none';
      return;
    }
    try {
      const validation = await API.vehicles.validateYear(selectedQuoteVehicle._id, yearNum);
      if (!validation.valid) {
        if (iYearWarning) {
          iYearWarning.textContent = validation.message || 'Año fuera de rango';
          iYearWarning.style.display = 'block';
        }
      } else {
        if (iYearWarning) iYearWarning.style.display = 'none';
      }
    } catch (err) {
      console.error('Error al validar año:', err);
    }
  }

  function ensureInit(){
    if(inited) return; inited = true;

  emailScope = (getCompanyEmail?.()||API.getActiveCompany?.()||'').trim().toLowerCase();

    iNumber.value = nextNumber();
    iNumberBig.textContent = iNumber.value;
    iDatetime.value = todayIso();

    clearRows(); addRow();
    loadDraft();
    recalcAll();
    bindUI();

    syncSummaryHeight();
    window.addEventListener('resize', syncSummaryHeight);

    loadHistory();
    
    if (iVehicleSearch) {
      iVehicleSearch.addEventListener('input', (e) => {
        clearTimeout(quoteVehicleSearchTimeout);
        const query = e.target.value.trim();
        if (query.length >= 1) {
          quoteVehicleSearchTimeout = setTimeout(() => {
            searchVehiclesForQuote(query);
          }, 150);
        } else {
          if (iVehicleDropdown) iVehicleDropdown.style.display = 'none';
        }
      });
      iVehicleSearch.addEventListener('focus', () => {
        if (iVehicleSearch.value.trim().length >= 1) {
          searchVehiclesForQuote(iVehicleSearch.value.trim());
        }
      });
    }
    
    if (iYear) {
      iYear.addEventListener('input', () => {
        if (selectedQuoteVehicle) {
          validateQuoteYear();
        }
      });
    }
    
    document.addEventListener('click', (e) => {
      if (iVehicleSearch && !iVehicleSearch.contains(e.target) && iVehicleDropdown && !iVehicleDropdown.contains(e.target)) {
        if (iVehicleDropdown) iVehicleDropdown.style.display = 'none';
      }
    });
  }

  function openModal(node){
    const modal = document.getElementById('modal');
    const slot  = document.getElementById('modalBody');
    const x     = document.getElementById('modalClose');
    if(!modal||!slot||!x) return;
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
  function closeModal(){ const m=document.getElementById('modal'); if(m) m.classList.add('hidden'); }

  function nextNumber(){
    const raw = localStorage.getItem(kLast());
    let n = Number(raw||0); n = isNaN(n)?0:n;
    return pad5(n+1);
  }
  function advanceNumber(){
    const shown = Number(iNumber.value||'1');
    localStorage.setItem(kLast(), String(shown));
  }

  function getDraftData(){
    return {
      number:iNumber.value, datetime:iDatetime.value,
      clientName:iClientName.value, clientPhone:iClientPhone.value, clientEmail:iClientEmail.value,
      plate:iPlate.value, brand:iBrand.value, line:iLine.value, year:iYear.value, cc:iCc.value, mileage:iMileage.value,
      validDays:iValidDays.value, specialNotes:specialNotes, rows:readRows()
    };
  }
  function saveDraft(){
    localStorage.setItem(kDraft(), JSON.stringify(getDraftData()));
    toast('Borrador guardado.');
  }
  function loadDraft(){
    const raw = localStorage.getItem(kDraft()); if(!raw) return;
    try{
      const d = JSON.parse(raw);
      iNumber.value = d.number || iNumber.value;
      iNumberBig.textContent = iNumber.value;
      iDatetime.value = d.datetime || iDatetime.value;
      iClientName.value  = d.clientName  || '';
      iClientPhone.value = d.clientPhone || '';
      iClientEmail.value = d.clientEmail || '';
      iPlate.value = d.plate || ''; iBrand.value = d.brand || ''; iLine.value = d.line || '';
      iYear.value  = d.year  || ''; iCc.value   = d.cc   || ''; iMileage.value = d.mileage || '';
      iValidDays.value = d.validDays || '';
      specialNotes = d.specialNotes || [];
      renderSpecialNotes();
      clearRows(); (d.rows||[]).forEach(addRowFromData);
      clearDirtyFlags();
      // Llamar recalcAll después de cargar los datos para actualizar el preview
      recalcAll();
    }catch(e){
      console.error('[loadDraft] Error cargando borrador:', e);
    }
  }
  function clearDraft(){ localStorage.removeItem(kDraft()); }

  let specialNotes = [];
  
  function addSpecialNote() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/60 theme-light:bg-black/40 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="relative bg-slate-800 dark:bg-slate-800 theme-light:bg-white rounded-2xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 max-w-lg w-full overflow-hidden">
        <div class="p-6">
          <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Agregar Nota Especial</h3>
          <textarea id="special-note-input" placeholder="Escribe tu nota especial aquí..." class="w-full h-24 p-3 mb-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"></textarea>
          <div class="flex justify-end gap-2">
            <button id="cancel-note" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
            <button id="save-note" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Agregar Nota</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = modal.querySelector('#special-note-input');
    const saveBtn = modal.querySelector('#save-note');
    const cancelBtn = modal.querySelector('#cancel-note');
    
    input.focus();
    
    const closeModal = () => {
      modal.remove();
    };
    
    const handleBackdropClick = (e) => {
      if (e.target === modal) closeModal();
    };
    
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEsc);
        modal.removeEventListener('click', handleBackdropClick);
      }
    };
    
    saveBtn.onclick = () => {
      const note = input.value.trim();
      if (note) {
        specialNotes.push(note);
        renderSpecialNotes();
        recalcAll();
        closeModal();
      }
    };
    
    cancelBtn.onclick = closeModal;
    
    document.addEventListener('keydown', handleEsc);
    modal.addEventListener('click', handleBackdropClick);
  }
  
  function removeSpecialNote(index) {
    if (confirm('¿Eliminar esta nota especial?')) {
      specialNotes.splice(index, 1);
      renderSpecialNotes();
      recalcAll();
    }
  }
  
  window.removeSpecialNote = removeSpecialNote;
  
  function renderSpecialNotes() {
    if (!iSpecialNotesList) return;
    iSpecialNotesList.innerHTML = '';
    specialNotes.forEach((note, index) => {
      const noteDiv = document.createElement('div');
      noteDiv.className = 'flex items-center gap-3 mb-3 p-3 bg-gradient-to-r from-slate-800/50 to-slate-700/50 dark:from-slate-800/50 dark:to-slate-700/50 theme-light:from-slate-100 theme-light:to-slate-50 rounded-lg border-l-4 border-blue-500 shadow-sm transition-all duration-200';
      noteDiv.innerHTML = `
        <div class="flex-1 flex items-center gap-2">
          <span class="text-base">📝</span>
          <span class="flex-1 leading-relaxed text-white dark:text-white theme-light:text-slate-900">${note}</span>
        </div>
        <button type="button" onclick="removeSpecialNote(${index})" class="text-xs px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white border-0 cursor-pointer transition-colors duration-200 whitespace-nowrap">Eliminar</button>
      `;
      iSpecialNotesList.appendChild(noteDiv);
    });
  }

  function clearRows(){ rowsBox.innerHTML=''; }
  function addRowFromData(r){
    const row = cloneRow();
    row.querySelector('select').value = r.type || 'PRODUCTO';
    row.querySelectorAll('input')[0].value = r.desc  || '';
    row.querySelectorAll('input')[1].value = r.qty   || '';
    row.querySelectorAll('input')[2].value = r.price || '';
    
    
    // Metadata origen (inventario / lista precios)
    if(r.source) row.dataset.source = r.source;
    if(r.refId)  row.dataset.refId = r.refId;
    if(r.sku)    row.dataset.sku = r.sku;
    updateRowSubtotal(row); rowsBox.appendChild(row);
  }
  function addRow(){ rowsBox.appendChild(cloneRow()); }
  function cloneRow(){
    const n = rowTemplate.cloneNode(true);
    n.classList.remove('hidden'); n.removeAttribute('id'); n.removeAttribute('data-template');
    n.querySelectorAll('input,select').forEach(el=>{
      el.addEventListener('input',()=>{ updateRowSubtotal(n); recalcAll(); });
    });
    const removeBtn = n.querySelector('button');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        n.remove(); 
        recalcAll();
      });
    }
    return n;
  }
  function readRows(){
    const rows=[]; 
    // Buscar filas con clase .tr o .q-row-card que no sean el template
    const allRows = rowsBox.querySelectorAll('.tr:not([data-template]), .q-row-card:not([data-template])');
    console.log('[readRows] Filas encontradas en DOM:', allRows.length);
    
    allRows.forEach((r, idx) => {
      console.log(`[readRows] Procesando fila ${idx + 1}:`, {
        className: r.className,
        hasSelect: !!r.querySelector('select'),
        hasInputs: r.querySelectorAll('input').length,
        descValue: r.querySelectorAll('input')[0]?.value,
        qtyValue: r.querySelectorAll('input')[1]?.value,
        priceValue: r.querySelectorAll('input')[2]?.value
      });
      
      const type=r.querySelector('select')?.value || 'PRODUCTO';
      const desc=r.querySelectorAll('input')[0]?.value?.trim() || '';
      const qtyRaw = r.querySelectorAll('input')[1]?.value;
      const qty = qtyRaw === '' || qtyRaw === null || qtyRaw === undefined ? null : Number(qtyRaw);
      const price=Number(r.querySelectorAll('input')[2]?.value||0);
      
      // Solo filtrar si realmente está vacío (sin descripción Y sin precio Y sin cantidad)
      // Si tiene descripción O precio O cantidad, incluir el item
      if(!desc && !price && (!qty || qty === 0)) {
        console.log(`[readRows] Filtrando fila ${idx + 1} (vacía)`);
        return;
      }
      
      let refId = r.dataset.refId;
      if (refId && typeof refId === 'string' && refId.includes('[object Object]')) {
        refId = undefined;
      } else if (refId) {
        refId = String(refId).trim() || undefined;
      }
      
      const rowData = {
        type,desc,qty,price,
        source: r.dataset.source || undefined,
        refId: refId,
        sku: r.dataset.sku || undefined,
        comboParent: r.dataset.comboParent || undefined
      };
      
      console.log(`[readRows] Agregando fila ${idx + 1}:`, rowData);
      rows.push(rowData);
    }); 
    
    console.log('[readRows] Total de filas válidas:', rows.length);
    return rows;
  }
  
  function updateRowSubtotal(r){
    const qty=Number(r.querySelectorAll('input')[1].value||0);
    const price=Number(r.querySelectorAll('input')[2].value||0);
    const subtotal=(qty>0?qty:1)*(price||0);
    r.querySelectorAll('input')[3].value = money(subtotal);
  }

  function recalcAll(){
    const rows=readRows(); 
    console.log('[recalcAll] Rows leídos:', rows.length, rows);
    
    // Leer datos del cliente y vehículo directamente de los inputs
    const cliente = iClientName?.value || '';
    const placa = iPlate?.value || '';
    const brand = iBrand?.value || '';
    const line = iLine?.value || '';
    const year = iYear?.value || '';
    
    console.log('[recalcAll] Datos del formulario:', {
      cliente,
      placa,
      brand,
      line,
      year,
      rowsCount: rows.length
    });
    
    let subP=0, subS=0;
    rows.forEach(({type,qty,price})=>{
      const q=qty>0?qty:1; const st=q*(price||0);
      if((type||'PRODUCTO')==='PRODUCTO') subP+=st; else subS+=st;
    });
    const subtotal=subP+subS;
    let discountValue = 0;
    if (currentDiscount.type && currentDiscount.value > 0) {
      if (currentDiscount.type === 'percent') {
        discountValue = (subtotal * currentDiscount.value) / 100;
      } else {
        discountValue = currentDiscount.value;
      }
    }
    
    const total = subtotal - discountValue;
    
    if (lblSubtotalProducts) lblSubtotalProducts.textContent=money(subP);
    if (lblSubtotalServices) lblSubtotalServices.textContent=money(subS);
    
    if (discountSection) {
      if (discountValue > 0) {
        discountSection.style.display = 'block';
        if (discountAmount) discountAmount.textContent = money(discountValue);
        if (btnDiscountClear) btnDiscountClear.style.display = 'inline-block';
      } else {
        discountSection.style.display = 'none';
        if (btnDiscountClear) btnDiscountClear.style.display = 'none';
      }
    }
    
    if (lblTotal) lblTotal.textContent=money(total);
    
    // Actualizar preview de WhatsApp
    if (previewWA) {
      const previewText = buildWhatsAppText(rows,subP,subS,total);
      console.log('[recalcAll] Preview WhatsApp generado:', previewText);
      previewWA.textContent = previewText;
    } else {
      console.warn('[recalcAll] previewWA no encontrado!');
    }
    
    syncSummaryHeight();
  }

  function buildWhatsAppText(rows,subP,subS,total){
    const num=iNumber.value;
  const cliente=iClientName.value||'—';
    const veh=`${iBrand.value||''} ${iLine.value||''} ${iYear.value||''}`.trim();
  const placa=iPlate.value||'—'; const cc=iCc.value||'—'; const mileage=iMileage.value||'—';
  const val=iValidDays.value?`\nValidez: ${iValidDays.value} días`:'';
    const lines=[];
  lines.push(`*Cotización ${num}*`);
    lines.push(`Cliente: ${cliente}`);
  lines.push(`Vehículo: ${veh} — Placa: ${placa} — Cilindraje: ${cc} — Kilometraje: ${mileage}`);
    lines.push('');
    
    // Agrupar items por combos
    const comboMap = new Map(); // refId del combo -> { main: row, items: [] }
    const regularRows = [];
    
    // Primera pasada: identificar items de combos (con comboParent)
    rows.forEach(row => {
      if (row.comboParent) {
        // Es un item de un combo - normalizar el refId para comparación
        const parentId = String(row.comboParent).trim();
        if (!comboMap.has(parentId)) {
          comboMap.set(parentId, { main: null, items: [] });
        }
        comboMap.get(parentId).items.push(row);
      }
    });
    
    // Segunda pasada: identificar combos principales (que tienen items asociados)
    rows.forEach(row => {
      if (!row.comboParent && row.source === 'price' && row.refId) {
        const refId = String(row.refId).trim();
        if (comboMap.has(refId)) {
          // Este es el combo principal que tiene items asociados
          comboMap.get(refId).main = row;
        } else {
          // Es un precio normal sin items asociados
          regularRows.push(row);
        }
      } else if (!row.comboParent) {
        // Es un item regular sin comboParent
        regularRows.push(row);
      }
    });
    
    // Procesar combos primero (solo los que tienen items asociados)
    comboMap.forEach((combo, refId) => {
      if (combo.main && combo.items.length > 0) {
        const {type,desc,qty,price} = combo.main;
        const q=qty>0?qty:1; const st=q*(price||0);
        const cantSuffix=(qty&&Number(qty)>0)?` x${q}`:'';
        lines.push(`*${desc||'Combo'}${cantSuffix}*`);
        if (st > 0) {
          lines.push(`${money(st)}`);
        }
        
        // Agregar items del combo anidados
        combo.items.forEach(item => {
          const itemQ = item.qty>0?item.qty:1;
          const itemSt = itemQ*(item.price||0);
          const itemCantSuffix = (item.qty&&Number(item.qty)>0)?` x${item.qty}`:'';
          lines.push(`     *${item.desc||'Item'}${itemCantSuffix}*`);
          // Solo mostrar precio si es mayor a 0
          if (itemSt > 0) {
            lines.push(`     ${money(itemSt)}`);
          }
        });
      } else if (combo.items.length > 0 && !combo.main) {
        // Items huérfanos (tienen comboParent pero no se encontró el combo principal)
        // Agregarlos como items regulares
        combo.items.forEach(item => regularRows.push(item));
      }
    });
    
    // Procesar items regulares
    regularRows.forEach(({type,desc,qty,price})=>{
      const q=qty>0?qty:1; const st=q*(price||0);
      const tipo=(type==='SERVICIO')?'Servicio':'Producto';
      const cantSuffix=(qty&&Number(qty)>0)?` x${q}`:'';
      lines.push(`• ${desc||tipo}${cantSuffix}`);
      // Solo mostrar precio si es mayor a 0
      if (st > 0) {
        lines.push(`${money(st)}`);
      }
    });
    
    lines.push('');
    lines.push(`Subtotal Productos: ${money(subP)}`);
    lines.push(`Subtotal Servicios: ${money(subS)}`);
    
    // Agregar descuento si existe
    if (currentDiscount.type && currentDiscount.value > 0) {
      const discountValue = currentDiscount.type === 'percent' 
        ? (subP + subS) * currentDiscount.value / 100 
        : currentDiscount.value;
      lines.push(`Descuento: ${money(discountValue)}`);
    }
    
    lines.push(`*TOTAL: ${money(total)}*`);
    
    // Añadir notas especiales antes de "Valores SIN IVA"
    if (specialNotes.length > 0) {
      lines.push('');
      specialNotes.forEach(note => {
        lines.push(`📝 ${note}`);
      });
    }
    
    lines.push(`Valores con iva excluido`);
    lines.push(val.trim());
    return lines.join('\n').replace(/\n{3,}/g,'\n\n');
  }

  // ===== Helpers para logo =====
  function loadImage(src){
    return new Promise((resolve,reject)=>{
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = ()=>resolve(img);
      img.onerror = ()=>reject(new Error('No se pudo cargar el logo: '+src));
      img.src = src;
    });
  }
  async function addPdfLogo(d, pageW, right){
    try{
      const src = window.RENAULT_LOGO_URL || 'assets/img/renault_logo.png';
      const img = await loadImage(src);
      // Escalado proporcional ~40px alto
      const targetH = 40;
      const ratio = img.width / img.height || 1;
      const targetW = Math.round(targetH * ratio);
      const x = pageW - right - targetW;
      const y = 45;
      d.addImage(img, 'PNG', x, y, targetW, targetH, undefined, 'FAST');
    }catch(e){
      console.warn(e?.message || e);
    }
  }

  // ====== PDF (desde UI) ======
  async function exportPDF(){
    // Función fallback simple si no hay plantilla
    function fallback(){
      const number = iNumber.value || '00001';
      const linesOut = [
        'Cotización',
        '',
        '# ' + number + '  Total: ' + (lblTotal.textContent || '$0'),
        '',
        'Cliente: ' + (iClientName.value || ''),
        'Vehículo: ' + (iPlate.value || '') + ' - ' + (iBrand.value || '') + ' ' + (iLine.value || ''),
        '',
        'Items:'
      ];
      readRows().forEach(r => {
        linesOut.push('- ' + (r.qty || 0) + ' x ' + (r.desc || '') + ' (' + money((r.qty>0?r.qty:1)*(r.price||0)) + ')');
      });
      const txt = linesOut.join('\n');
      const win = window.open('', '_blank');
      if (!win) { alert('No se pudo abrir ventana de impresión'); return; }
      win.document.write('<pre>' + txt + '</pre>');
      win.document.close(); win.focus(); win.print(); try { win.close(); } catch {}
    }
    
    // Intentar usar plantilla activa (quote) -> abrir ventana/imprimir (igual que en ventas)
    if(API?.templates?.active){
      API.templates.active('quote')
        .then(tpl=>{
          console.log('[exportPDF] Template activo recibido:', {
            hasTemplate: !!tpl,
            hasContentHtml: !!(tpl?.contentHtml),
            contentHtmlLength: tpl?.contentHtml?.length || 0,
            hasContentCss: !!(tpl?.contentCss),
            templateId: tpl?._id,
            templateName: tpl?.name
          });
          if(!tpl || !tpl.contentHtml){ 
            console.warn('[exportPDF] No hay template activo o contentHtml está vacío, usando fallback');
            fallback(); 
            return; 
          }
          console.log('[exportPDF] Usando template guardado:', tpl.name || tpl._id);
          
          // Restaurar variables acortadas antes de enviar al preview
          const restoredHtml = restoreHandlebarsVarsForPreview(tpl.contentHtml);
          
          // Preparar datos de la cotización desde la UI
          const quoteData = {
            number: iNumber.value || '',
            date: iDatetime.value || todayIso(),
            customer: {
              name: iClientName.value || '',
              phone: iClientPhone.value || '',
              email: iClientEmail.value || ''
            },
            vehicle: {
              plate: iPlate.value || '',
              make: iBrand.value || '',
              line: iLine.value || '',
              modelYear: iYear.value || '',
              displacement: iCc.value || ''
            },
            validity: iValidDays.value || '',
            items: readRows().map(r => ({
              description: r.desc || '',
              qty: r.qty === null || r.qty === undefined || r.qty === '' ? null : Number(r.qty),
              unitPrice: Number(r.price || 0),
              subtotal: (r.qty > 0 ? r.qty : 1) * (r.price || 0),
              sku: r.sku || ''
            })),
            totals: {
              total: parseMoney(lblTotal.textContent) || 0
            }
          };
          
          // Si hay una cotización guardada, usar su ID para obtener datos reales
          const sampleId = currentQuoteId || undefined;
          
          // Enviar a endpoint preview con datos de la UI
          return API.templates.preview({ 
            type:'quote', 
            contentHtml: restoredHtml, 
            contentCss: tpl.contentCss || '', 
            sampleId,
            quoteData: quoteData // Siempre pasar quoteData para que se use si los items de la BD están vacíos
          })
          .then(r=>{
            console.log('[exportPDF] ===== PREVIEW RECIBIDO =====');
            console.log('[exportPDF] Has rendered:', !!r.rendered);
            console.log('[exportPDF] Rendered length:', r.rendered?.length || 0);
            
            const win = window.open('', '_blank');
            if(!win){ fallback(); return; }
            const css = r.css ? `<style>${r.css}</style>`:'';
            
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
                
                /* Estilos específicos para impresión */
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
                  /* Asegurar que las tablas no se corten */
                  table.quote-table,
                  table.remission-table {
                    page-break-inside: auto !important;
                  }
                  table.quote-table tr,
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
              
              const contentHeight = Math.max(
                body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight
              );
              
              const mediaCartaMaxHeight = 800; // px (más tolerante)
              
              let pageSizeStyle = win.document.getElementById('dynamic-page-size');
              if (!pageSizeStyle) {
                pageSizeStyle = win.document.createElement('style');
                pageSizeStyle.id = 'dynamic-page-size';
                win.document.head.appendChild(pageSizeStyle);
              }
              
              if (contentHeight <= mediaCartaMaxHeight) {
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
                console.log('[exportPDF] ✅ Configurado para MEDIA CARTA (5.5" x 8.5")');
              } else {
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
                console.log('[exportPDF] ✅ Configurado para CARTA COMPLETA (8.5" x 11")');
              }
            };
            
            // Función robusta para ajustar posición del total
            const adjustTotalPosition = () => {
              const table = win.document.querySelector('table.quote-table, table.remission-table');
              const totalLine = win.document.querySelector('.tpl-total-line');
              const totalBox = win.document.querySelector('.tpl-total-box');
              
              if (!table) {
                console.log('[exportPDF] Tabla no encontrada aún, reintentando...');
                return false;
              }
              
              if (!totalLine && !totalBox) {
                console.log('[exportPDF] Total no encontrado aún, reintentando...');
                return false;
              }
              
              detectAndSetPageSize();
              
              const tableRect = table.getBoundingClientRect();
              const scrollTop = win.pageYOffset || win.document.documentElement.scrollTop || win.document.body.scrollTop || 0;
              const scrollLeft = win.pageXOffset || win.document.documentElement.scrollLeft || win.document.body.scrollLeft || 0;
              const tableTop = tableRect.top + scrollTop;
              const tableLeft = tableRect.left + scrollLeft;
              const tableWidth = Math.max(
                table.offsetWidth || 0,
                table.scrollWidth || 0,
                tableRect.width || 0,
                table.clientWidth || 0
              );
              const tableHeight = Math.max(
                table.offsetHeight || 0,
                table.scrollHeight || 0,
                tableRect.height || 0,
                table.clientHeight || 0
              );
              const newTop = tableTop + tableHeight + 10;
              
              const body = win.document.body;
              const html = win.document.documentElement;
              const contentHeight = Math.max(
                body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight
              );
              const mediaCartaMaxHeight = 800;
              const maxTop = contentHeight <= mediaCartaMaxHeight ? 700 : 1100;
              const finalTop = Math.min(newTop, maxTop);
              
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
            win.addEventListener('DOMContentLoaded', () => {
              setTimeout(() => {
                if (!adjustTotalPosition()) {
                  setTimeout(() => {
                    if (!adjustTotalPosition()) {
                      setTimeout(adjustTotalPosition, 500);
                    }
                  }, 300);
                }
              }, 100);
              
              setTimeout(adjustTotalPosition, 500);
              setTimeout(adjustTotalPosition, 1000);
              setTimeout(adjustTotalPosition, 2000);
            });
            
            win.addEventListener('load', () => {
              setTimeout(adjustTotalPosition, 100);
              setTimeout(adjustTotalPosition, 500);
            });
            
            // CRÍTICO: Ajustar justo antes de imprimir
            win.addEventListener('beforeprint', () => {
              console.log('[exportPDF] Evento beforeprint - ajustando total...');
              adjustTotalPosition();
            });
            
            // Detectar tamaño de página y mostrar alerta antes de imprimir
            win.focus();
            
            setTimeout(() => {
              adjustTotalPosition();
              
              setTimeout(() => {
                adjustTotalPosition();
                detectAndSetPageSize();
                
                // Determinar tamaño de página para la alerta
                const body = win.document.body;
                const html = win.document.documentElement;
                const contentHeight = Math.max(
                  body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight
                );
                const mediaCartaMaxHeight = 800;
                const isMediaCarta = contentHeight <= mediaCartaMaxHeight;
                const pageSize = isMediaCarta ? 'MEDIA CARTA (5.5" x 8.5")' : 'CARTA COMPLETA (8.5" x 11")';
                
                // Mostrar alerta con el tamaño de página
                alert(`📄 TAMAÑO DE HOJA REQUERIDO:\n\n${pageSize}\n\nAsegúrate de configurar tu impresora con este tamaño antes de imprimir.`);
                
                setTimeout(() => {
                  adjustTotalPosition();
                  requestAnimationFrame(() => {
                    adjustTotalPosition();
                    // Abrir diálogo de impresión automáticamente
                    win.print();
                  });
                }, 300);
              }, 500);
            }, 1000);
          })
          .catch((err)=>{
            console.error('[exportPDF] Error en preview:', err);
            fallback();
          });
      })
      .catch((err)=>{
        console.error('[exportPDF] Error obteniendo template activo:', err);
        fallback();
      });
    } else {
      fallback();
    }
    
    syncSummaryHeight();
  }

  async function exportPDFFromData(doc){
    const rows = (doc.items || []).map(it => [
      (it.kind === 'SERVICIO') ? 'Servicio' : 'Producto',
      it.description || '',
      it.qty && it.qty > 0 ? it.qty : 1,
      money(it.unitPrice || 0),
      money(it.subtotal || ((it.qty || 1) * (it.unitPrice || 0)))
    ]);
    const subP = (doc.items||[]).filter(i=>i.kind!=='SERVICIO').reduce((a,i)=>a+(i.subtotal||0),0);
    const subS = (doc.items||[]).filter(i=>i.kind==='SERVICIO').reduce((a,i)=>a+(i.subtotal||0),0);
    const subtotal = subP + subS;
    
    // Calcular descuento si existe
    let discountValue = 0;
    if (doc.discount && doc.discount.value > 0) {
      discountValue = doc.discount.value;
    }
    
    const tot = subtotal - discountValue;

  // === DETECCIÓN CORRECTA (UMD) ===
    const jsPDFClass = window.jspdf?.jsPDF;
  if(!jsPDFClass){ alert('No se encontró jsPDF.'); return; }
    const d = new jsPDFClass('p','pt','a4');
  if(typeof d.autoTable!=='function'){ alert('No se encontró AutoTable.'); return; }

  // ====== Márgenes y ancho ======
    const pageW = d.internal.pageSize.getWidth();
    const pageH = d.internal.pageSize.getHeight();
    const left = 60;
    const right = 60;
    const contentW = pageW - left - right;

    // ====== Encabezado (sin recuadro) ======
    const gold = '#d4c389';
    d.setFont('helvetica','bold'); d.setTextColor(gold); d.setFontSize(26);
    d.text('CASA RENAULT H&H', left, 70);

  // Logo Renault (opción B)
    await addPdfLogo(d, pageW, right);

  // Título centrado
    d.setFontSize(18); d.setTextColor('#000'); d.setFont('helvetica','bold');
  d.text('COTIZACIÓN', pageW/2, 140, { align:'center' });

    // ====== Bloque de datos ======
    d.setFont('helvetica','normal'); d.setFontSize(10);
    d.text('CASA RENAULT H&H — Servicio Automotriz', left, 165);
  d.text('Nit: 901717790-7 • Bogotá D.C', left, 179);

    d.text(`Fecha: ${doc.datetime || todayIso()}`, pageW - right, 165, { align:'right' });
  d.text(`Tel: ${doc.customer?.clientPhone || 'XXX XXX XXXX'} • Email: ${doc.customer?.email || 'email.contacto@gmail.com'}`, pageW - right, 179, { align:'right' });

    d.setFont('helvetica','normal');
  d.text(`No. Cotización: ${doc.number || '—'}`, left, 203);
  d.text(`Cliente: ${doc.customer?.name || '—'}`, left, 217);

    const veh = [doc.vehicle?.make, doc.vehicle?.line, doc.vehicle?.modelYear].filter(Boolean).join(' ');
  d.text(`Vehículo: ${veh || '—'}  —  Placa: ${doc.vehicle?.plate || '—'} —`, left, 231);
  d.text(`Cilindraje: ${doc.vehicle?.displacement || '—'} — Kilometraje: ${doc.vehicle?.mileage || '—'}`, left, 245);

    // ====== Marca de agua ======
    const supportsOpacity = !!(d.saveGraphicsState && d.setGState && d.GState);
    if(supportsOpacity){
      d.saveGraphicsState();
      d.setGState(new d.GState({ opacity: 0.06 }));
      d.setFont('helvetica','bold'); d.setFontSize(120); d.setTextColor('#000');
      d.text('RENAULT', pageW/2, 420, { angle:-12, align:'center' });
      d.restoreGraphicsState();
    }else{
      d.setFont('helvetica','bold'); d.setFontSize(110); d.setTextColor(220);
      d.text('RENAULT', pageW/2, 420, { angle:-12, align:'center' });
      d.setTextColor('#000');
    }

    // ====== Tabla ======
    d.autoTable({
      startY: 270,
  head: [['Tipo','Descripción','Cant.','Precio unit.','Subtotal']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 6, lineColor: [180,180,180], lineWidth: 0.25 },
      headStyles: { fillColor: [242,242,242], textColor: 0, lineColor: [150,150,150], lineWidth: 0.4 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: contentW - (90 + 55 + 95 + 95), valign: 'middle' },
        2: { cellWidth: 55, halign:'right' },
        3: { cellWidth: 95, halign:'right' },
        4: { cellWidth: 95, halign:'right' }
      },
      margin: { left, right }
    });

    // ====== Totales y notas ======
    let y = d.lastAutoTable.finalY + 18;
    
    // Notas especiales
    if (doc.specialNotes && doc.specialNotes.length > 0) {
      d.setFont('helvetica','normal'); d.setFontSize(10);
      doc.specialNotes.forEach(note => {
        d.text(`📝 ${note}`, left, y);
        y += 12;
      });
      y += 8;
    }
    
    d.setFont('helvetica','italic'); d.setFontSize(10);
    d.text('Valores con iva excluido', left, y); y += 14;
  if(doc.validity) d.text(`Validez: ${doc.validity} días`, left, y);

    // Mostrar descuento si existe
    let totalY = d.lastAutoTable.finalY + 18;
    if (discountValue > 0) {
      d.setFont('helvetica','normal'); d.setFontSize(10);
      d.text(`Descuento: ${money(discountValue)}`, pageW - right, totalY, { align:'right' });
      totalY += 14;
    }

    d.setFont('helvetica','bold'); d.setFontSize(11);
    d.text(`TOTAL: ${money(tot)}`, pageW - right, totalY, { align:'right' });

    const footY = (doc.validity ? y + 28 : d.lastAutoTable.finalY + 36);
    d.setFont('helvetica','normal'); d.setFontSize(9);
  d.text('Calle 69º No. 87-39 • Cel: 301 205 9320 • Bogotá D.C • Contacto: HUGO MANRIQUE 311 513 1603', left, footY);

    d.save(`cotizacion_${doc.number || 'sin_numero'}.pdf`);
  }

  // ===== WhatsApp =====
  function openWhatsApp(){
    const text=previewWA.textContent||''; if(!text.trim()) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank');
  // No mover correlativo aquí.
    syncSummaryHeight();
  }

  // ===== Backend (crear / actualizar) =====
  function payloadFromUI(){
    const items=readRows().map(r=>{
      const base={
        kind:r.type || 'PRODUCTO', 
        description:r.desc || '',
        qty:r.qty === null || r.qty === undefined || r.qty === '' ? null : Number(r.qty),
        unitPrice:Number(r.price||0)
      };
      // Asegurar que description no sea vacío si hay precio o cantidad
      if(!base.description && (base.unitPrice > 0 || (base.qty && base.qty > 0))) {
        base.description = 'Item sin descripción';
      }
      if(r.source){ base.source=r.source; }
      // Asegurar que refId sea un string válido (no "[object Object]")
      if(r.refId && typeof r.refId === 'string' && !r.refId.includes('[object Object]')){
        base.refId = r.refId.trim();
      }
      if(r.sku){ base.sku=r.sku; }
      return base;
    }).filter(item => {
      // Filtrar solo items completamente vacíos (sin descripción, sin precio, sin cantidad)
      return item.description || item.unitPrice > 0 || (item.qty && item.qty > 0);
    });
    return {
      customer:{ name:iClientName.value||'', phone:iClientPhone.value||'', email:iClientEmail.value||'' },
      vehicle:{ 
        vehicleId: iVehicleId?.value || null,
        plate:iPlate.value||'', 
        make:iBrand.value||'', 
        line:iLine.value||'', 
        modelYear:iYear.value||'', 
        displacement:iCc.value||'', 
        mileage:iMileage.value||'' 
      },
      validity:iValidDays.value||'',
      specialNotes:specialNotes,
      items,
      discount: currentDiscount.type && currentDiscount.value > 0 ? currentDiscount : null
    };
  }

  async function saveToBackend(){
    try{
      const creating = !currentQuoteId;
      const payload = payloadFromUI();
      
      // Log para debugging
      console.log('[saveToBackend] Payload a guardar:', {
        itemsCount: payload.items?.length || 0,
        items: payload.items,
        customer: payload.customer,
        vehicle: payload.vehicle,
        validity: payload.validity,
        specialNotes: payload.specialNotes,
        discount: payload.discount
      });
      
      // Validar que haya al menos un item o datos del cliente
      if (!payload.items || payload.items.length === 0) {
        if (!payload.customer?.name && !payload.vehicle?.plate) {
          alert('⚠️ La cotización está vacía. Agrega al menos un item o datos del cliente/vehículo.');
          return;
        }
      }
      
      let doc;
      if(creating){ doc = await API.quoteCreate(payload); }
      else        { doc = await API.quotePatch(currentQuoteId, payload); }

      // Log para verificar qué se guardó
      console.log('[saveToBackend] Respuesta del backend:', {
        docId: doc?._id,
        itemsCount: doc?.items?.length || 0,
        items: doc?.items,
        customer: doc?.customer,
        vehicle: doc?.vehicle
      });

      if(doc?.number){
        iNumber.value = doc.number;
        iNumberBig.textContent = doc.number;
        if(typeof doc.seq==='number'){ localStorage.setItem(kLast(), String(doc.seq)); }
      }
      currentQuoteId = doc?._id || currentQuoteId;
      toast('Cotización guardada en historial.');
      loadHistory();

      if(creating) resetQuoteForm();
    }catch(e){
      console.error('[saveToBackend] Error:', e);
      alert(e?.message || 'Error guardando la cotización');
    }
  }

  // ===== Historial =====
  function buildQuery(){
    const qs=new URLSearchParams();
    const t=(qhText.value||'').trim(); if(t) qs.set('q',t);
    if(qhFrom.value) qs.set('from',qhFrom.value);
    if(qhTo.value)   qs.set('to',qhTo.value);
    const s=qs.toString(); return s?`?${s}`:'';
  }

  async function loadHistory(){
    try{
      qhList.innerHTML='<div class="p-6 text-center text-slate-400 dark:text-slate-400 theme-light:text-slate-600 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-50 rounded-lg border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">Cargando...</div>';
      const q = buildQuery();
      let attempt = 0; let lastErr;
      let res;
      while(attempt < 2){
        try {
          attempt++;
          console.debug(`[quotes] fetching /api/v1/quotes${q} (attempt ${attempt})`);
          res = await API.quotesListRaw(q);
          break;
        } catch(e){
          lastErr = e; console.warn('[quotes] attempt failed', e?.message || e);
          if(attempt>=2) throw e;
        }
      }
      const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
      try { console.debug('[quotes] raw response:', res); } catch {}
      if(res?.metadata){ console.debug('[quotes] metadata:', res.metadata); }
      if(!rows.length){
        if(res?.metadata && res.metadata.total>0){
          qhList.innerHTML=`<div class="p-6 text-center text-slate-400 dark:text-slate-400 theme-light:text-slate-600 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-50 rounded-lg border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">Sin items en esta página (total ${res.metadata.total}).</div>`;
        } else {
          qhList.innerHTML='<div class="p-6 text-center text-slate-400 dark:text-slate-400 theme-light:text-slate-600 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-50 rounded-lg border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">No hay cotizaciones aún.</div>';
        }
        return;
      }
      renderHistory(rows);
    }catch(e){
      qhList.innerHTML=`<div class="p-6 text-center text-red-400 dark:text-red-400 theme-light:text-red-600 bg-red-900/20 dark:bg-red-900/20 theme-light:bg-red-50 rounded-lg border border-red-800/50 dark:border-red-800/50 theme-light:border-red-300">Error: ${e?.message || 'No se pudo cargar'}</div>`;
      try { console.error('[quotes] loadHistory error', e); } catch {}
    }
  }

  function renderHistory(rows){
    if(!rows.length){ 
      qhList.innerHTML=`<div class="p-6 text-center text-slate-400 dark:text-slate-400 theme-light:text-slate-600 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-50 rounded-lg border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300">Sin resultados.</div>`; 
      return; 
    }
    qhList.innerHTML='';
    qhList.className = 'space-y-3 custom-scrollbar';
    rows.forEach(d=>{
      const el=document.createElement('div');
      el.className='bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-white/90 rounded-xl shadow-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-5 hover:shadow-xl transition-all duration-200';
      const date=d.createdAt?new Date(d.createdAt).toLocaleString():'';
      const vehicleInfo = [d.vehicle?.make,d.vehicle?.line,d.vehicle?.modelYear].filter(Boolean).join(' ')||'—';
      el.innerHTML=`
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div class="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div class="text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Cotización</div>
              <div class="text-lg font-bold text-blue-400 dark:text-blue-400 theme-light:text-blue-600">#${(d.number||'').toString().padStart(5,'0')}</div>
              <div class="text-xs text-slate-500 dark:text-slate-500 theme-light:text-slate-500 mt-1">${date}</div>
            </div>
            <div>
              <div class="text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Cliente</div>
              <div class="text-sm font-semibold text-white dark:text-white theme-light:text-slate-900">${d.customer?.name||'—'}</div>
              <div class="text-xs text-slate-500 dark:text-slate-500 theme-light:text-slate-500 mt-1">${vehicleInfo}</div>
            </div>
            <div>
              <div class="text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Placa</div>
              <div class="text-sm font-medium text-white dark:text-white theme-light:text-slate-900">${d.vehicle?.plate||'—'}</div>
            </div>
            <div>
              <div class="text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Total</div>
              <div class="text-lg font-bold text-green-400 dark:text-green-400 theme-light:text-green-600">${money(d.total||0)}</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 md:flex-col md:items-end">
            <button data-act="edit" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 text-sm whitespace-nowrap">Ver/Editar</button>
            <button data-act="wa" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900 text-sm whitespace-nowrap">WhatsApp</button>
            <button data-act="pdf" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-medium rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900 text-sm whitespace-nowrap">🖨️ Imprimir</button>
            <button data-act="del" class="px-4 py-2 bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300 text-sm whitespace-nowrap">Eliminar</button>
          </div>
        </div>`;
      el.querySelector('[data-act="edit"]')?.addEventListener('click',()=>openQuoteModal(d));
      el.querySelector('[data-act="wa"]')?.addEventListener('click',()=>openWAFromDoc(d));
      el.querySelector('[data-act="pdf"]')?.addEventListener('click',()=>exportPDFFromDoc(d));
      el.querySelector('[data-act="del"]')?.addEventListener('click',async ()=>{
        if(!confirm('¿Eliminar cotización?')) return;
        try{ await API.quoteDelete(d._id); loadHistory(); }catch(e){ alert(e?.message||'Error al eliminar'); }
      });
      qhList.appendChild(el);
    });
  }

  // ===== Editor en modal (aislado) =====
  function openQuoteModal(doc){
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-slate-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 p-6 mb-6">
        <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">Ver/Editar cotización</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">N.º cotización</label>
            <input id="m-number" disabled class="w-full px-3 py-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm cursor-not-allowed" />
          </div>
          <div>
            <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Fecha y hora</label>
            <input id="m-datetime" disabled class="w-full px-3 py-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm cursor-not-allowed" />
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Cliente</label>
          <input id="m-client-name" placeholder="Nombre del cliente" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input id="m-client-phone" placeholder="Teléfono (opcional)" class="px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input id="m-client-email" placeholder="Correo (opcional)" class="px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div class="mb-4">
          <input id="m-client-id" placeholder="Identificación (opcional)" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Placa</label>
          <input id="m-plate" placeholder="ABC123" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div class="relative mb-4">
          <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1 font-medium">Vehículo (opcional)</label>
          <input id="m-vehicle-search" placeholder="Buscar vehículo (marca, línea, cilindraje)..." class="w-full px-3 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div id="m-vehicle-dropdown" class="hidden absolute z-[1000] bg-slate-800 dark:bg-slate-800 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg max-h-[200px] overflow-y-auto mt-1 shadow-lg w-full"></div>
          <input type="hidden" id="m-vehicle-id" />
          <div id="m-vehicle-selected" class="mt-1 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600"></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input id="m-brand" placeholder="Marca" readonly class="px-3 py-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm cursor-not-allowed" />
          <input id="m-line" placeholder="Línea/Modelo" readonly class="px-3 py-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm cursor-not-allowed" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input id="m-year" placeholder="Año" class="px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input id="m-cc" placeholder="Cilindraje" readonly class="px-3 py-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm cursor-not-allowed" />
        </div>
        <div id="m-year-warning" class="hidden text-xs text-red-500 dark:text-red-400 theme-light:text-red-600 mt-1 mb-4"></div>
        <div class="mb-4">
          <input id="m-mileage" placeholder="Kilometraje" type="number" min="0" step="1" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div class="mb-4">
          <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Validez (días, opcional)</label>
          <input id="m-valid-days" type="number" min="0" step="1" placeholder="p. ej. 8" class="w-full px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-slate-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 p-6">
        <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">Ítems</h3>
        <div id="m-rows" class="q-grid-2cols mb-4">
          <div class="tr q-row-card hidden" id="m-row-template" data-template>
            <div>
              <label class="sr-only">Tipo</label>
              <select class="w-full px-2 py-1.5 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="PRODUCTO">Producto</option>
                <option value="SERVICIO">Servicio</option>
              </select>
            </div>
            <div>
              <label class="sr-only">Descripción</label>
              <input placeholder="Descripción" class="w-full px-2 py-1.5 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div class="small">
              <label class="sr-only">Cant.</label>
              <input type="number" min="0" step="1" placeholder="Cant." class="w-full px-2 py-1.5 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div class="small">
              <label class="sr-only">Precio</label>
              <input type="number" min="0" step="0.01" placeholder="Precio" class="w-full px-2 py-1.5 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div class="small">
              <label class="sr-only">Subtotal</label>
              <input disabled placeholder="$0" class="w-full px-2 py-1.5 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded text-white dark:text-white theme-light:text-slate-900 text-xs cursor-not-allowed" />
            </div>
            <div class="small">
              <button class="w-full px-3 py-1.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300">Quitar</button>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-3 mb-4">
          <button id="m-add-unified" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">➕ Agregar</button>
          <button id="m-addRow" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-slate-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-700 font-semibold rounded-lg transition-colors duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">+ Agregar línea manual</button>
        </div>
        <div class="bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-slate-50 rounded-lg p-4 mb-4 space-y-2">
          <div class="flex justify-between text-sm text-white dark:text-white theme-light:text-slate-900">
            <span>Subtotal Productos:</span>
            <strong id="m-subP">$0</strong>
          </div>
          <div class="flex justify-between text-sm text-white dark:text-white theme-light:text-slate-900">
            <span>Subtotal Servicios:</span>
            <strong id="m-subS">$0</strong>
          </div>
          <div id="m-discount-section" class="hidden flex justify-between text-sm text-red-400 dark:text-red-400 theme-light:text-red-600">
            <span>Descuento:</span>
            <strong id="m-discount-amount">$0</strong>
          </div>
          <div class="flex justify-between text-base font-bold text-white dark:text-white theme-light:text-slate-900 border-t border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 pt-2 mt-2">
            <span>Total:</span>
            <strong id="m-total">$0</strong>
          </div>
        </div>
        
        <!-- Botones de descuento -->
        <div class="flex flex-wrap gap-2 mb-4">
          <button id="m-discount-percent" class="px-3 py-1.5 text-xs bg-green-600 dark:bg-green-600 theme-light:bg-green-500 hover:bg-green-700 dark:hover:bg-green-700 theme-light:hover:bg-green-600 text-white font-semibold rounded-lg transition-all duration-200">Descuento %</button>
          <button id="m-discount-fixed" class="px-3 py-1.5 text-xs bg-blue-600 dark:bg-blue-600 theme-light:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-700 theme-light:hover:bg-blue-600 text-white font-semibold rounded-lg transition-all duration-200">Descuento $</button>
          <button id="m-discount-clear" class="hidden px-3 py-1.5 text-xs bg-red-600 dark:bg-red-600 theme-light:bg-red-500 hover:bg-red-700 dark:hover:bg-red-700 theme-light:hover:bg-red-600 text-white font-semibold rounded-lg transition-all duration-200">Quitar descuento</button>
        </div>
        <div class="flex flex-wrap gap-3 mb-4">
          <button id="m-save" class="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 dark:from-green-600 dark:to-green-700 theme-light:from-green-500 theme-light:to-green-600 hover:from-green-700 hover:to-green-800 dark:hover:from-green-700 dark:hover:to-green-800 theme-light:hover:from-green-600 theme-light:hover:to-green-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar cambios</button>
          <button id="m-wa" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-slate-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-700 font-semibold rounded-lg transition-colors duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">WhatsApp</button>
          <button id="m-pdf" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-slate-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-700 font-semibold rounded-lg transition-colors duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">🖨️ Imprimir PDF</button>
          <button id="m-close" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:bg-slate-200 theme-light:hover:bg-slate-300 text-white dark:text-white theme-light:text-slate-700 font-semibold rounded-lg transition-colors duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">Cerrar</button>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Vista previa WhatsApp</label>
          <pre id="m-wa-prev" class="w-full min-h-[160px] p-3 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-xs whitespace-pre-wrap font-mono overflow-auto"></pre>
        </div>
        
        <!-- Sección de notas especiales -->
        <div id="m-special-notes-section" class="mt-4">
          <label class="block text-sm font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Notas especiales</label>
          <div id="m-special-notes-list" class="mb-2"></div>
          <button id="m-add-special-note" class="px-3 py-1.5 text-xs bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">+ Agregar nota especial</button>
        </div>
      </div>
    `;

    // ---- refs ----
    const q = (s)=>root.querySelector(s);
    const iNumber   = q('#m-number');
    const iDatetime = q('#m-datetime');
    const iName  = q('#m-client-name');
    const iPhone = q('#m-client-phone');
    const iEmail = q('#m-client-email');
    const iClientId = q('#m-client-id');
    const iPlate = q('#m-plate');
    const iBrand = q('#m-brand');
    const iLine  = q('#m-line');
    const iYear  = q('#m-year');
    const iCc    = q('#m-cc');
    const iValid = q('#m-valid-days');
    const rowsBox = q('#m-rows');
    const rowTpl  = q('#m-row-template');
    const btnAdd  = q('#m-addRow');
    const lblP    = q('#m-subP');
    const lblS    = q('#m-subS');
    const lblT    = q('#m-total');
    const prevWA  = q('#m-wa-prev');
    
    // Notas especiales en modal
    const mSpecialNotesList = q('#m-special-notes-list');
    const mAddSpecialNote = q('#m-add-special-note');
    let modalSpecialNotes = [];
    
    // Función para agregar nota especial en modal
    function addModalSpecialNote() {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/60 dark:bg-black/60 theme-light:bg-black/40 backdrop-blur-sm';
      modal.innerHTML = `
        <div class="relative bg-slate-800 dark:bg-slate-800 theme-light:bg-white rounded-2xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 max-w-lg w-full overflow-hidden">
          <div class="p-6">
            <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Agregar Nota Especial</h3>
            <textarea id="modal-special-note-input" placeholder="Escribe tu nota especial aquí..." class="w-full h-24 p-3 mb-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"></textarea>
            <div class="flex justify-end gap-2">
              <button id="modal-note-cancel" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
              <button id="modal-note-add" class="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 dark:from-green-600 dark:to-green-700 theme-light:from-green-500 theme-light:to-green-600 hover:from-green-700 hover:to-green-800 dark:hover:from-green-700 dark:hover:to-green-800 theme-light:hover:from-green-600 theme-light:hover:to-green-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Agregar</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const input = modal.querySelector('#modal-special-note-input');
      const addBtn = modal.querySelector('#modal-note-add');
      const cancelBtn = modal.querySelector('#modal-note-cancel');
      
      input.focus();
      
      const closeModal = () => {
        modal.remove();
      };
      
      const handleBackdropClick = (e) => {
        if (e.target === modal) closeModal();
      };
      
      addBtn.onclick = () => {
        const note = input.value.trim();
        if (note) {
          modalSpecialNotes.push(note);
          renderModalSpecialNotes();
          recalc();
          closeModal();
        }
      };
      
      cancelBtn.onclick = closeModal;
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          addBtn.click();
        } else if (e.key === 'Escape') {
          closeModal();
        }
      });
      
      modal.addEventListener('click', handleBackdropClick);
    }
    
    // Función para eliminar nota especial en modal
    function removeModalSpecialNote(index) {
      if (confirm('¿Eliminar esta nota especial?')) {
        modalSpecialNotes.splice(index, 1);
        renderModalSpecialNotes();
        recalc();
      }
    }
    
    // Función para renderizar notas especiales en modal
    function renderModalSpecialNotes() {
      if (!mSpecialNotesList) return;
      mSpecialNotesList.innerHTML = '';
      modalSpecialNotes.forEach((note, index) => {
        const noteDiv = document.createElement('div');
        noteDiv.className = 'p-3 my-2 bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-slate-100 rounded-lg flex justify-between items-center gap-3';
        noteDiv.innerHTML = `
          <div class="flex-1 break-words text-white dark:text-white theme-light:text-slate-900">${note}</div>
          <button type="button" onclick="window.removeModalSpecialNote(${index})" class="text-xs px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white border-0 cursor-pointer transition-colors duration-200 whitespace-nowrap">Eliminar</button>
        `;
        mSpecialNotesList.appendChild(noteDiv);
      });
    }
    
    // Exponer función globalmente para los botones onclick
    window.removeModalSpecialNote = removeModalSpecialNote;
    
    // Selector de vehículo en modal
    const mVehicleSearch = q('#m-vehicle-search');
    const mVehicleId = q('#m-vehicle-id');
    const mVehicleDropdown = q('#m-vehicle-dropdown');
    const mVehicleSelected = q('#m-vehicle-selected');
    const mYearWarning = q('#m-year-warning');
    let selectedModalVehicle = null;
    let modalVehicleSearchTimeout = null;
    
    // Elementos de descuento
    const discountSection = q('#m-discount-section');
    const discountAmount = q('#m-discount-amount');
    const btnDiscountPercent = q('#m-discount-percent');
    const btnDiscountFixed = q('#m-discount-fixed');
    const btnDiscountClear = q('#m-discount-clear');
    
    // Variable para almacenar el descuento
    let currentDiscount = { type: null, value: 0 };
    
    // Función para mostrar mensaje de éxito elegante
    function showSuccessMessage(message) {
      const notification = document.createElement('div');
      notification.className = 'fixed top-5 right-5 bg-gradient-to-br from-green-500 to-green-600 text-white px-6 py-4 rounded-xl shadow-lg z-[10001] font-semibold text-sm flex items-center gap-3 animate-[slideInRight_0.3s_ease-out] max-w-[300px]';
      notification.innerHTML = `
        <div class="text-xl">✅</div>
        <div>${message}</div>
      `;
      
      // Agregar animación CSS
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
      
      document.body.appendChild(notification);
      
      // Remover después de 3 segundos
      setTimeout(() => {
        notification.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => {
          notification.remove();
          style.remove();
        }, 300);
      }, 3000);
    }
    
    // Función para abrir modal de descuento elegante
    function openDiscountModal(type) {
      const isPercent = type === 'percent';
      const title = isPercent ? 'Descuento por Porcentaje' : 'Descuento por Monto Fijo';
      const placeholder = isPercent ? 'Ej: 15 para 15%' : 'Ej: 50000';
      const currentValue = currentDiscount.type === type ? currentDiscount.value : '';
      
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/60 dark:bg-black/60 theme-light:bg-black/40 backdrop-blur-sm';
      modal.innerHTML = `
        <div class="relative bg-slate-800 dark:bg-slate-800 theme-light:bg-white rounded-2xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 max-w-md w-full overflow-hidden text-center">
          <div class="p-6">
            <h3 class="m-0 mb-4 text-lg font-semibold text-white dark:text-white theme-light:text-slate-900">${title}</h3>
            <p class="m-0 mb-4 text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-600">
              ${isPercent ? 'Ingrese el porcentaje de descuento' : 'Ingrese el monto de descuento'}
            </p>
            <input 
              id="discount-input" 
              type="number" 
              placeholder="${placeholder}"
              value="${currentValue}"
              class="w-full mb-4 text-center text-base p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              ${isPercent ? 'max="100"' : ''}
              step="${isPercent ? '0.01' : '1'}"
            />
            <div class="flex justify-center gap-3">
              <button id="discount-cancel" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white border-0 rounded-lg transition-colors duration-200 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">
                Cancelar
              </button>
              <button id="discount-apply" class="px-4 py-2 ${isPercent ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800' : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'} text-white border-0 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-semibold theme-light:from-blue-500 theme-light:to-blue-600 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700">
                Aplicar Descuento
              </button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const input = modal.querySelector('#discount-input');
      const applyBtn = modal.querySelector('#discount-apply');
      const cancelBtn = modal.querySelector('#discount-cancel');
      
      input.focus();
      input.select();
      
      const closeModal = () => {
        modal.remove();
      };
      
      const handleBackdropClick = (e) => {
        if (e.target === modal) closeModal();
      };
      
      const applyDiscount = () => {
        const value = parseFloat(input.value);
        if (!isNaN(value) && value > 0) {
          if (isPercent && value > 100) {
            alert('El porcentaje no puede ser mayor a 100%');
            return;
          }
          currentDiscount = { type, value };
          recalc();
          closeModal();
        } else {
          alert('Por favor ingrese un valor válido');
        }
      };
      
      applyBtn.onclick = applyDiscount;
      cancelBtn.onclick = closeModal;
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyDiscount();
        } else if (e.key === 'Escape') {
          closeModal();
        }
      });
      
      modal.addEventListener('click', handleBackdropClick);
    }

    function cloneRow(){
      const n = rowTpl.cloneNode(true);
      n.classList.remove('hidden'); n.removeAttribute('id'); n.removeAttribute('data-template');
      n.querySelectorAll('input,select').forEach(el=>{
        el.addEventListener('input',()=>{ updateRowSubtotal(n); recalc(); });
      });
      // Botón de quitar - más específico para evitar conflictos
      const removeBtn = n.querySelector('button');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          n.remove(); 
          recalc();
        });
      }
      return n;
    }
    function addRow(){ rowsBox.appendChild(cloneRow()); }
    function addRowFromData(r){
      const row = cloneRow();
      row.querySelector('select').value = r.type || (String(r.kind||'PRODUCTO').toUpperCase()==='SERVICIO'?'SERVICIO':'PRODUCTO');
      row.querySelectorAll('input')[0].value = r.desc  ?? r.description ?? '';
      row.querySelectorAll('input')[1].value = r.qty   ?? '';
      row.querySelectorAll('input')[2].value = r.price ?? r.unitPrice ?? '';
      if(r.source) row.dataset.source = r.source;
      if(r.refId)  row.dataset.refId = r.refId;
      if(r.sku)    row.dataset.sku = r.sku;
      updateRowSubtotal(row); rowsBox.appendChild(row);
    }
    function readRows(){
      const rows=[]; 
      if (!rowsBox) {
        console.warn('[readRows modal] rowsBox no encontrado');
        return rows;
      }
      rowsBox.querySelectorAll('.tr:not([data-template]), .q-row-card:not([data-template])').forEach(r=>{
        const type=r.querySelector('select')?.value || 'PRODUCTO';
        const descInput = r.querySelectorAll('input')[0];
        const qtyInput = r.querySelectorAll('input')[1];
        const priceInput = r.querySelectorAll('input')[2];
        const desc = descInput ? descInput.value.trim() : '';
        const qtyRaw = qtyInput ? qtyInput.value : '';
        const qty = qtyRaw === '' || qtyRaw === null || qtyRaw === undefined ? null : Number(qtyRaw);
        const price = priceInput ? Number(priceInput.value||0) : 0;
        // Solo filtrar si realmente está vacío (sin descripción Y sin precio Y sin cantidad)
        if(!desc && !price && (!qty || qty === 0)) return;
        rows.push({
          type,desc,qty,price,
          source:r.dataset.source||undefined,
          refId:r.dataset.refId||undefined,
          sku:r.dataset.sku||undefined,
          comboParent:r.dataset.comboParent||undefined
        });
      }); 
      return rows;
    }
    function updateRowSubtotal(r){
      const qty=Number(r.querySelectorAll('input')[1].value||0);
      const price=Number(r.querySelectorAll('input')[2].value||0);
      const subtotal=(qty>0?qty:1)*(price||0);
      r.querySelectorAll('input')[3].value = money(subtotal);
    }
    function buildWAText(){
      const rows = readRows(); let subP=0, subS=0;
      rows.forEach(({type,qty,price})=>{
        const q=qty>0?qty:1; const st=q*(price||0);
        if((type||'PRODUCTO')==='PRODUCTO') subP+=st; else subS+=st;
      });
      const subtotal=subP+subS;
      
      // Calcular descuento
      let discountValue = 0;
      if (currentDiscount.type === 'percent' && currentDiscount.value > 0) {
        discountValue = (subtotal * currentDiscount.value) / 100;
      } else if (currentDiscount.type === 'fixed' && currentDiscount.value > 0) {
        discountValue = currentDiscount.value;
      }
      
      const total = subtotal - discountValue;
      const lines=[];
      const veh = `${iBrand.value||''} ${iLine.value||''} ${iYear.value||''}`.trim();
  const val = iValid.value ? `\nValidez: ${iValid.value} días` : '';
  lines.push(`*Cotización ${iNumber.value || '—'}*`);
  lines.push(`Cliente: ${iName.value||'—'}`);
      lines.push(`Vehículo: ${veh} — Placa: ${iPlate.value||'—'} — Cilindraje: ${iCc.value||'—'} — Kilometraje: ${iMileage.value||'—'}`);
      lines.push('');
      
      // Agrupar items por combos (igual que en la función principal)
      const comboMap = new Map();
      const regularRows = [];
      
      // Primera pasada: identificar items de combos (con comboParent)
      rows.forEach(row => {
        if (row.comboParent) {
          const parentId = String(row.comboParent).trim();
          if (!comboMap.has(parentId)) {
            comboMap.set(parentId, { main: null, items: [] });
          }
          comboMap.get(parentId).items.push(row);
        }
      });
      
      // Segunda pasada: identificar combos principales (que tienen items asociados)
      rows.forEach(row => {
        if (!row.comboParent && row.source === 'price' && row.refId) {
          const refId = String(row.refId).trim();
          if (comboMap.has(refId)) {
            comboMap.get(refId).main = row;
          } else {
            regularRows.push(row);
          }
        } else if (!row.comboParent) {
          regularRows.push(row);
        }
      });
      
      // Procesar combos primero
      comboMap.forEach((combo, refId) => {
        if (combo.main && combo.items.length > 0) {
          const {type,desc,qty,price} = combo.main;
          const q=qty>0?qty:1; const st=q*(price||0);
          const cantSuffix=(qty&&Number(qty)>0)?` x${q}`:'';
          lines.push(`*${desc||'Combo'}${cantSuffix}*`);
          if (st > 0) {
            lines.push(`${money(st)}`);
          }
          
          // Agregar items del combo anidados
          combo.items.forEach(item => {
            const itemQ = item.qty>0?item.qty:1;
            const itemSt = itemQ*(item.price||0);
            const itemCantSuffix = (item.qty&&Number(item.qty)>0)?` x${item.qty}`:'';
            lines.push(`     *${item.desc||'Item'}${itemCantSuffix}*`);
            if (itemSt > 0) {
              lines.push(`     ${money(itemSt)}`);
            }
          });
        } else {
          if (combo.main) regularRows.push(combo.main);
          if (combo.items.length > 0) regularRows.push(...combo.items);
        }
      });
      
      // Procesar items regulares
      regularRows.forEach(({type,desc,qty,price})=>{
        const q=qty>0?qty:1; const st=q*(price||0);
        const tipo=(type==='SERVICIO')?'Servicio':'Producto';
        const cantSuffix=(qty&&Number(qty)>0)?` x${q}`:'';
  lines.push(`• ${desc||tipo}${cantSuffix}`);
        lines.push(`${money(st)}`);
      });
      
      // Agregar notas especiales si existen
      if (modalSpecialNotes.length > 0) {
        lines.push('');
        modalSpecialNotes.forEach(note => {
          lines.push(`📌 ${note}`);
        });
      }
      
      lines.push('');
      lines.push(`Subtotal Productos: ${money(subP)}`);
      lines.push(`Subtotal Servicios: ${money(subS)}`);
      if (discountValue > 0) {
        lines.push(`Descuento: ${money(discountValue)}`);
      }
      lines.push(`*TOTAL: ${money(total)}*`);
      lines.push(`Valores con iva excluido`);
      lines.push(val.trim());
      return lines.join('\n').replace(/\n{3,}/g,'\n\n');
    }
    function recalc(){
      const rows=readRows(); 
      console.log('[recalc modal] Rows leídos:', rows.length, rows);
      let subP=0, subS=0;
      rows.forEach(({type,qty,price})=>{
        const q=qty>0?qty:1; const st=q*(price||0);
        if((type||'PRODUCTO')==='PRODUCTO') subP+=st; else subS+=st;
      });
      const subtotal=subP+subS;
      
      // Calcular descuento
      let discountValue = 0;
      if (currentDiscount.type === 'percent' && currentDiscount.value > 0) {
        discountValue = (subtotal * currentDiscount.value) / 100;
      } else if (currentDiscount.type === 'fixed' && currentDiscount.value > 0) {
        discountValue = currentDiscount.value;
      }
      
      const total = subtotal - discountValue;
      
      if (lblP) lblP.textContent=money(subP);
      if (lblS) lblS.textContent=money(subS);
      
      // Mostrar/ocultar sección de descuento
      if (discountSection) {
        if (discountValue > 0) {
          discountSection.style.display = 'block';
          if (discountAmount) discountAmount.textContent = money(discountValue);
          if (btnDiscountClear) btnDiscountClear.style.display = 'inline-block';
        } else {
          discountSection.style.display = 'none';
          if (btnDiscountClear) btnDiscountClear.style.display = 'none';
        }
      }
      
      if (lblT) lblT.textContent=money(total);
      if (prevWA) prevWA.textContent = buildWAText();
    }

    // ---- cargar datos ----
    iNumber.value = (doc?.number || '').toString().padStart(5,'0');
    iDatetime.value = doc?.createdAt ? new Date(doc.createdAt).toLocaleString() : todayIso();
    iName.value  = doc?.customer?.name  || '';
    iPhone.value = doc?.customer?.phone || '';
    iEmail.value = doc?.customer?.email || '';
    if (iClientId) iClientId.value = doc?.customer?.idNumber || '';
    iPlate.value = doc?.vehicle?.plate || '';
    iBrand.value = doc?.vehicle?.make || '';
    iLine.value  = doc?.vehicle?.line || '';
    iYear.value  = doc?.vehicle?.modelYear || '';
    iCc.value    = doc?.vehicle?.displacement || '';
    iMileage.value = doc?.vehicle?.mileage || '';
    iValid.value = doc?.validity || '';
    
    // Cargar vehículo si existe vehicleId en el modal
    if (doc?.vehicle?.vehicleId && mVehicleId) {
      mVehicleId.value = doc.vehicle.vehicleId;
      API.vehicles.get(doc.vehicle.vehicleId).then(vehicle => {
        if (vehicle) {
          selectedModalVehicle = vehicle;
          if (mVehicleSearch) mVehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
          if (mVehicleSelected) {
            mVehicleSelected.innerHTML = `
              <span class="text-green-500 dark:text-green-400 theme-light:text-green-600">✓</span> 
              <strong class="text-white dark:text-white theme-light:text-slate-900">${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
            `;
          }
          if (iBrand) iBrand.value = vehicle.make || '';
          if (iLine) iLine.value = vehicle.line || '';
          if (iCc) iCc.value = vehicle.displacement || '';
        }
      }).catch(() => {});
    } else if (doc?.vehicle?.make && doc?.vehicle?.line && doc?.vehicle?.displacement) {
      // Si no tiene vehicleId pero tiene datos, buscar
      API.vehicles.search({ 
        q: `${doc.vehicle.make} ${doc.vehicle.line} ${doc.vehicle.displacement}`, 
        limit: 1 
      }).then(result => {
        if (result?.items?.length > 0) {
          const vehicle = result.items[0];
          selectedModalVehicle = vehicle;
          if (mVehicleId) mVehicleId.value = vehicle._id;
          if (mVehicleSearch) mVehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
          if (mVehicleSelected) {
            mVehicleSelected.innerHTML = `
              <span class="text-green-500 dark:text-green-400 theme-light:text-green-600">✓</span> 
              <strong class="text-white dark:text-white theme-light:text-slate-900">${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
            `;
          }
        }
      }).catch(() => {});
    }
    
    // Búsqueda de vehículos para modal
    async function searchVehiclesForModal(query) {
      if (!query || query.trim().length < 1) {
        if (mVehicleDropdown) mVehicleDropdown.style.display = 'none';
        return;
      }
      try {
        const r = await API.vehicles.search({ q: query.trim(), limit: 30 });
        const vehicles = Array.isArray(r?.items) ? r.items : [];
        if (!mVehicleDropdown) return;
        if (vehicles.length === 0) {
          mVehicleDropdown.innerHTML = '<div class="p-3 text-center text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No se encontraron vehículos</div>';
          mVehicleDropdown.style.display = 'block';
          return;
        }
        mVehicleDropdown.replaceChildren(...vehicles.map(v => {
          const div = document.createElement('div');
          div.className = 'p-2 px-3 cursor-pointer border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-50 transition-colors';
          div.innerHTML = `
            <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${v.make} ${v.line}</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}</div>
          `;
          div.addEventListener('click', () => {
            selectedModalVehicle = v;
            if (mVehicleId) mVehicleId.value = v._id;
            if (mVehicleSearch) mVehicleSearch.value = `${v.make} ${v.line} ${v.displacement}`;
            if (mVehicleSelected) {
              mVehicleSelected.innerHTML = `
                <span class="text-green-500 dark:text-green-400 theme-light:text-green-600">✓</span> 
                <strong class="text-white dark:text-white theme-light:text-slate-900">${v.make} ${v.line}</strong> - Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}
              `;
            }
            if (mVehicleDropdown) mVehicleDropdown.style.display = 'none';
            if (iBrand) iBrand.value = v.make || '';
            if (iLine) iLine.value = v.line || '';
            if (iCc) iCc.value = v.displacement || '';
            // Validar año si ya está ingresado
            if (iYear && iYear.value) {
              validateModalYear();
            }
          });
          div.addEventListener('mouseenter', () => {
            div.classList.add('bg-slate-700/20', 'dark:bg-slate-700/20', 'theme-light:bg-slate-50');
          });
          div.addEventListener('mouseleave', () => {
            div.classList.remove('bg-slate-700/20', 'dark:bg-slate-700/20', 'theme-light:bg-slate-50');
          });
          return div;
        }));
        mVehicleDropdown.style.display = 'block';
      } catch (err) {
        console.error('Error al buscar vehículos:', err);
      }
    }
    
    // Validar año contra rango del vehículo en modal
    async function validateModalYear() {
      if (!selectedModalVehicle || !iYear || !iYear.value) {
        if (mYearWarning) mYearWarning.style.display = 'none';
        return;
      }
      const yearNum = Number(iYear.value);
      if (!Number.isFinite(yearNum)) {
        if (mYearWarning) mYearWarning.style.display = 'none';
        return;
      }
      try {
        const validation = await API.vehicles.validateYear(selectedModalVehicle._id, yearNum);
        if (!validation.valid) {
          if (mYearWarning) {
            mYearWarning.textContent = validation.message || 'Año fuera de rango';
            mYearWarning.style.display = 'block';
          }
        } else {
          if (mYearWarning) mYearWarning.style.display = 'none';
        }
      } catch (err) {
        console.error('Error al validar año:', err);
      }
    }
    
    // Event listeners para selector de vehículo en modal
    if (mVehicleSearch) {
      mVehicleSearch.addEventListener('input', (e) => {
        clearTimeout(modalVehicleSearchTimeout);
        const query = e.target.value.trim();
        if (query.length >= 1) {
          modalVehicleSearchTimeout = setTimeout(() => {
            searchVehiclesForModal(query);
          }, 150);
        } else {
          if (mVehicleDropdown) mVehicleDropdown.style.display = 'none';
        }
      });
      mVehicleSearch.addEventListener('focus', () => {
        if (mVehicleSearch.value.trim().length >= 1) {
          searchVehiclesForModal(mVehicleSearch.value.trim());
        }
      });
    }
    
    if (iYear) {
      iYear.addEventListener('input', () => {
        if (selectedModalVehicle) {
          validateModalYear();
        }
      });
    }
    
    // Cerrar dropdown al hacer click fuera
    const modalClickHandler = (e) => {
      if (mVehicleSearch && !mVehicleSearch.contains(e.target) && mVehicleDropdown && !mVehicleDropdown.contains(e.target)) {
        if (mVehicleDropdown) mVehicleDropdown.style.display = 'none';
      }
    };
    document.addEventListener('click', modalClickHandler);
    
    // Limpiar listener al cerrar modal
    q('#m-close')?.addEventListener('click', () => {
      document.removeEventListener('click', modalClickHandler);
    });
    
    // Cargar descuento si existe
    if (doc?.discount && doc.discount.value > 0) {
      currentDiscount = {
        type: doc.discount.type,
        value: doc.discount.value
      };
    } else {
      currentDiscount = { type: null, value: 0 };
    }
    
    // Cargar notas especiales
    modalSpecialNotes = doc?.specialNotes ? [...doc.specialNotes] : [];
    renderModalSpecialNotes();
    
    rowsBox.innerHTML='';
    (doc?.items||[]).forEach(it=>{
      addRowFromData({ type:(String(it.kind||'PRODUCTO').toUpperCase()==='SERVICIO'?'SERVICIO':'PRODUCTO'), desc:it.description||'', qty:it.qty??'', price:it.unitPrice||0, source:it.source, refId:it.refId, sku:it.sku });
    });
    if(!(doc?.items||[]).length) addRow();
    recalc();

    // ---- acciones ----
    btnAdd?.addEventListener('click',()=>{ addRow(); recalc(); });
    
    // Botón agregar unificado (QR/Manual)
    const btnAddUnified = q('#m-add-unified');
    if (btnAddUnified) {
      btnAddUnified.addEventListener('click', () => {
        // Cerrar modal actual temporalmente
        const currentModal = document.getElementById('modal');
        const wasVisible = !currentModal.classList.contains('hidden');
        if (wasVisible) currentModal.classList.add('hidden');
        
        // Abrir modal de agregar unificado (usar función existente)
        // Guardar referencias del modal actual para usar en la función
        window._modalQuoteContext = {
          rowsBox,
          cloneRow,
          updateRowSubtotal,
          recalc,
          vehicleId: mVehicleId?.value || null
        };
        openAddUnifiedForQuote();
        
        // Si el modal de agregar se cierra, volver a mostrar el modal de edición
        const checkModal = () => {
          const addModal = document.getElementById('modal');
          if (!addModal || addModal.classList.contains('hidden')) {
            if (wasVisible && currentModal) {
              currentModal.classList.remove('hidden');
            }
            // Limpiar contexto después de un breve delay
            setTimeout(() => {
              if (window._modalQuoteContext) {
                delete window._modalQuoteContext;
              }
            }, 100);
            return true;
          }
          return false;
        };
        const intervalId = setInterval(() => {
          if (checkModal()) {
            clearInterval(intervalId);
          }
        }, 100);
        
        // También limpiar cuando se cierra manualmente
        const originalClose = window.closeModal;
        window.closeModal = function() {
          if (originalClose) originalClose();
          if (wasVisible && currentModal) {
            currentModal.classList.remove('hidden');
          }
          setTimeout(() => {
            if (window._modalQuoteContext) {
              delete window._modalQuoteContext;
            }
          }, 100);
        };
      });
    }
    
    // Notas especiales
    if (mAddSpecialNote) {
      mAddSpecialNote.addEventListener('click', addModalSpecialNote);
    }
    
    q('#m-close')?.addEventListener('click',()=> {
      // Limpiar contexto del modal
      if (window._modalQuoteContext) {
        delete window._modalQuoteContext;
      }
      closeModal();
    });
    
    // Event listeners para descuentos
    btnDiscountPercent?.addEventListener('click', () => {
      openDiscountModal('percent');
    });
    
    btnDiscountFixed?.addEventListener('click', () => {
      openDiscountModal('fixed');
    });
    
    btnDiscountClear?.addEventListener('click', () => {
      currentDiscount = { type: null, value: 0 };
      recalc();
    });
    q('#m-wa')?.addEventListener('click',()=>{
      const text = buildWAText(); if(!text.trim()) return; window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank');
    });
    q('#m-pdf')?.addEventListener('click',()=>{
      // Usar exportPDF que ya maneja templates correctamente
      exportPDF().catch(e=>alert(e?.message||'Error generando PDF'));
    });
    q('#m-save')?.addEventListener('click', async ()=>{
      try{
        const rows=readRows();
        
        // Calcular descuento para guardar
        let discountValue = 0;
        const subtotal = rows.reduce((sum, r) => sum + ((r.qty>0?r.qty:1)*(r.price||0)), 0);
        if (currentDiscount.type === 'percent' && currentDiscount.value > 0) {
          discountValue = (subtotal * currentDiscount.value) / 100;
        } else if (currentDiscount.type === 'fixed' && currentDiscount.value > 0) {
          discountValue = currentDiscount.value;
        }
        
        const payload = {
          customer:{ 
            name:iName.value||'', 
            phone:iPhone.value||'', 
            email:iEmail.value||'',
            idNumber: iClientId?.value || ''
          },
          vehicle:{ 
        vehicleId: mVehicleId?.value || null,
        plate:iPlate.value||'', 
        make:iBrand.value||'', 
        line:iLine.value||'',
        modelYear:iYear.value||'', 
        displacement:iCc.value||'', 
        mileage:iMileage.value||'' 
      },
          validity:iValid.value||'',
          specialNotes: modalSpecialNotes,
          discount: discountValue > 0 ? { 
            type: currentDiscount.type, 
            value: currentDiscount.value, 
            amount: discountValue 
          } : null,
          items: rows.map(r=>{
            const base={ 
              kind:r.type || 'PRODUCTO', 
              description:r.desc || '', 
              qty:r.qty === null || r.qty === undefined || r.qty === '' ? null : Number(r.qty),
              unitPrice:Number(r.price||0) 
            };
            // Asegurar que description no sea vacío si hay precio o cantidad
            if(!base.description && (base.unitPrice > 0 || (base.qty && base.qty > 0))) {
              base.description = 'Item sin descripción';
            }
            if(r.source) base.source=r.source;
            // Asegurar que refId sea un string válido (no "[object Object]")
            if(r.refId && typeof r.refId === 'string' && !r.refId.includes('[object Object]')){
              base.refId = r.refId.trim();
            }
            if(r.sku) base.sku=r.sku;
            return base;
          }).filter(item => {
            // Filtrar solo items completamente vacíos
            return item.description || item.unitPrice > 0 || (item.qty && item.qty > 0);
          })
        };
        await API.quotePatch(doc._id, payload);
        
        // Mostrar mensaje de confirmación elegante
        showSuccessMessage('Cotización actualizada correctamente');
        
        // Cerrar modal después de un breve delay
        setTimeout(() => {
          closeModal();
          loadHistory();
        }, 1500);
      }catch(e){ 
        alert(e?.message||'No se pudo guardar'); 
      }
    });

    // Aplicar clase CSS para modal más ancho
    const modal = document.getElementById('modal');
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.classList.add('quote-edit-modal');
    }
    
    openModal(root);
  }

  function setUIFromQuote(d){
    currentQuoteId = d?._id || null;
    iNumber.value = d?.number || nextNumber();
    iNumberBig.textContent = iNumber.value;
    // Usar formato ISO para compatibilidad con exportPDF
    if (d?.createdAt) {
      const date = new Date(d.createdAt);
      iDatetime.value = date.toISOString().slice(0, 16);
    } else {
      iDatetime.value = todayIso();
    }

    iClientName.value  = d?.customer?.name  || '';
    iClientPhone.value = d?.customer?.phone || '';
    iClientEmail.value = d?.customer?.email || '';

    iPlate.value = d?.vehicle?.plate || '';
    iBrand.value = d?.vehicle?.make || '';
    iLine.value  = d?.vehicle?.line || '';
    iYear.value  = d?.vehicle?.modelYear || '';
    iCc.value    = d?.vehicle?.displacement || '';
    iMileage.value = d?.vehicle?.mileage || '';

    iValidDays.value = d?.validity || '';
    
    // Cargar notas especiales
    specialNotes = d?.specialNotes || [];
    renderSpecialNotes();
    
    // Cargar descuento
    currentDiscount = d?.discount || { type: null, value: 0 };

    clearRows();
    (d?.items||[]).forEach(it=>{
      const k=String(it.kind||'Producto').trim().toUpperCase();
  // Heurística legacy: si es PRODUCTO y tiene refId o sku de item y no trae source, asumir inventory
      let source = it.source;
      if(!source && k==='PRODUCTO' && (it.refId || it.sku)) source='inventory';
      addRowFromData({
        type:(k==='SERVICIO'?'SERVICIO':'PRODUCTO'),
        desc:it.description||'',
        qty:it.qty??'',
        price:it.unitPrice||0,
        source, refId:it.refId, sku:it.sku
      });
    });
    recalcAll();
    window.scrollTo({ top: tab.offsetTop, behavior:'smooth' });
  }

  async function exportPDFFromDoc(d){
    try {
      // Log para debugging
      console.log('[exportPDFFromDoc] Documento recibido:', {
        docId: d._id,
        itemsCount: d.items?.length || 0,
        items: d.items
      });
      
      // Establecer el ID de la cotización actual
      currentQuoteId = d._id;
      
      // Cargar datos del documento en la UI usando la función existente
      setUIFromQuote(d);
      
      // Esperar un momento para que la UI se actualice
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Usar exportPDF que ya maneja templates correctamente
      await exportPDF();
    } catch(e) {
      console.error('[exportPDFFromDoc] Error:', e);
      alert(e?.message || 'Error generando PDF');
    }
  }

  function openWAFromDoc(d){
    // Log para debugging
    console.log('[openWAFromDoc] Documento recibido:', {
      docId: d._id,
      itemsCount: d.items?.length || 0,
      items: d.items
    });
    
    const subP=(d.items||[]).filter(i=>i.kind!=='SERVICIO' && i.kind!=='Servicio').reduce((a,i)=>a+((i.qty||1)*(i.unitPrice||0)),0);
    const subS=(d.items||[]).filter(i=>i.kind==='SERVICIO' || i.kind==='Servicio').reduce((a,i)=>a+((i.qty||1)*(i.unitPrice||0)),0);
    const total=subP+subS;

    const prev = (()=>{
      const rows=(d.items||[]).map(it=>({
        type:(it.kind==='SERVICIO' || it.kind==='Servicio')?'SERVICIO':'PRODUCTO',
        desc:it.description || '', qty:it.qty, price:it.unitPrice || 0,
        source: it.source || undefined,
        refId: it.refId || undefined,
        comboParent: it.comboParent || undefined
      })).filter(row => row.desc || row.price > 0 || (row.qty && row.qty > 0));
      const bak={ n:iNumber.value, c:iClientName.value, b:iBrand.value, l:iLine.value, y:iYear.value, p:iPlate.value, cc:iCc.value, m:iMileage.value, v:iValidDays.value, sn:specialNotes };
      iNumber.value=d.number||iNumber.value;
      iClientName.value=d.customer?.name||'';
      iBrand.value=d.vehicle?.make||''; iLine.value=d.vehicle?.line||''; iYear.value=d.vehicle?.modelYear||''; iPlate.value=d.vehicle?.plate||''; iCc.value=d.vehicle?.displacement||''; iMileage.value=d.vehicle?.mileage||''; iValidDays.value=d.validity||'';
      specialNotes=d.specialNotes||[];
      const text=buildWhatsAppText(rows,subP,subS,total);
      iNumber.value=bak.n; iClientName.value=bak.c; iBrand.value=bak.b; iLine.value=bak.l; iYear.value=bak.y; iPlate.value=bak.p; iCc.value=bak.cc; iMileage.value=bak.m; iValidDays.value=bak.v; specialNotes=bak.sn;
      return text;
    })();

    window.open(`https://wa.me/?text=${encodeURIComponent(prev)}`,'_blank');
  }

  // ===== Reset de formulario (post-crear) =====
  function resetQuoteForm(){
    [iClientName,iClientPhone,iClientEmail,iPlate,iBrand,iLine,iYear,iCc,iMileage,iValidDays].forEach(i=>{ if(i) i.value=''; });
    specialNotes = [];
    renderSpecialNotes();
    clearRows(); addRow();
    lblSubtotalProducts.textContent='$0';
    lblSubtotalServices.textContent='$0';
    lblTotal.textContent='$0';
    previewWA.textContent='';
    iDatetime.value=todayIso();
    iNumber.value=nextNumber(); iNumberBig.textContent=iNumber.value;
    currentQuoteId=null; clearDraft(); syncSummaryHeight();
    try{ window.scrollTo({ top:qData?.offsetTop||0, behavior:'smooth' }); }catch{}
  }

  // ===== UI Bindings =====
  function bindUI(){
    btnAddUnified?.addEventListener('click', openAddUnifiedForQuote);
    iSaveDraft?.addEventListener('click',saveDraft);
    btnWA?.addEventListener('click',openWhatsApp);
    btnPDF?.addEventListener('click',()=>{ exportPDF().catch(err=>alert(err?.message||err)); });
    btnSaveBackend?.addEventListener('click', async () => {
      // Asegurar que recalcAll se ejecute antes de guardar para tener los datos más actualizados
      recalcAll();
      await saveToBackend();
    });
    
    // Notas especiales
    iAddSpecialNote?.addEventListener('click', addSpecialNote);
    
    // Descuentos
    btnDiscountPercent?.addEventListener('click', () => {
      openDiscountModal('percent');
    });
    
    btnDiscountFixed?.addEventListener('click', () => {
      openDiscountModal('fixed');
    });
    
    btnDiscountClear?.addEventListener('click', () => {
      currentDiscount = { type: null, value: 0 };
      recalcAll();
    });
    
    // Kilometraje
    iMileage?.addEventListener('input', recalcAll);
    
    btnClear?.addEventListener('click',()=>{
  if(!confirm('¿Borrar todo el contenido de la cotización actual?')) return;
      [iClientName,iClientPhone,iClientEmail,iPlate,iBrand,iLine,iYear,iCc,iMileage,iValidDays].forEach(i=>i.value='');
      specialNotes = [];
      renderSpecialNotes();
      currentDiscount = { type: null, value: 0 };
      clearRows(); addRow(); recalcAll(); clearDraft(); currentQuoteId=null;
    });

    [iClientName,iClientPhone,iClientEmail,iPlate,iBrand,iLine,iYear,iCc,iValidDays].forEach(el=>el?.addEventListener('input',recalcAll));
  // Marcar dirty (excepto placa y validez)
  iClientName?.addEventListener('input',()=>markDirty('clientName'));
  iClientPhone?.addEventListener('input',()=>markDirty('clientPhone'));
  iClientEmail?.addEventListener('input',()=>markDirty('clientEmail'));
  iBrand?.addEventListener('input',()=>markDirty('brand'));
  iLine?.addEventListener('input',()=>markDirty('line'));
  iYear?.addEventListener('input',()=>markDirty('year'));
  iCc?.addEventListener('input',()=>markDirty('cc'));

  // setupPlateAutofill is called after ensureInit

    qhApply?.addEventListener('click',loadHistory);
    qhClear?.addEventListener('click',()=>{ qhText.value=''; qhFrom.value=''; qhTo.value=''; loadHistory(); });
  }

  // ===== Función para abrir modal de descuento en formulario principal =====
  function openDiscountModal(type) {
    const isPercent = type === 'percent';
    const title = isPercent ? 'Descuento por Porcentaje' : 'Descuento por Monto Fijo';
    const placeholder = isPercent ? 'Ej: 15 para 15%' : 'Ej: 50000';
    const currentValue = currentDiscount.type === type ? currentDiscount.value : '';
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/60 dark:bg-black/60 theme-light:bg-black/40 backdrop-blur-sm';
    modal.innerHTML = `
      <div class="relative bg-slate-800 dark:bg-slate-800 theme-light:bg-white rounded-2xl shadow-2xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 max-w-md w-full overflow-hidden text-center">
        <div class="p-6">
          <h3 class="m-0 mb-4 text-lg font-semibold text-white dark:text-white theme-light:text-slate-900">${title}</h3>
          <p class="m-0 mb-4 text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-600">
            ${isPercent ? 'Ingrese el porcentaje de descuento' : 'Ingrese el monto de descuento'}
          </p>
          <input 
            id="discount-input" 
            type="number" 
            placeholder="${placeholder}"
            value="${currentValue}"
            class="w-full mb-4 text-center text-base p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="0"
            ${isPercent ? 'max="100"' : ''}
            step="${isPercent ? '0.01' : '1'}"
          />
          <div class="flex justify-center gap-3">
            <button id="discount-cancel" class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white border-0 rounded-lg transition-colors duration-200 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">
              Cancelar
            </button>
            <button id="discount-apply" class="px-4 py-2 ${isPercent ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800' : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'} text-white border-0 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 font-semibold theme-light:from-blue-500 theme-light:to-blue-600 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700">
              Aplicar Descuento
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = modal.querySelector('#discount-input');
    const applyBtn = modal.querySelector('#discount-apply');
    const cancelBtn = modal.querySelector('#discount-cancel');
    
    input.focus();
    input.select();
    
    const closeModal = () => {
      modal.remove();
    };
    
    const handleBackdropClick = (e) => {
      if (e.target === modal) closeModal();
    };
    
    const applyDiscount = () => {
      const value = parseFloat(input.value);
      if (!isNaN(value) && value > 0) {
        if (isPercent && value > 100) {
          alert('El porcentaje no puede ser mayor a 100%');
          return;
        }
        currentDiscount = { type, value };
        recalcAll();
        closeModal();
      } else {
        alert('Por favor ingrese un valor válido');
      }
    };
    
    applyBtn.onclick = applyDiscount;
    cancelBtn.onclick = closeModal;
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyDiscount();
      } else if (e.key === 'Escape') {
        closeModal();
      }
    });
    
    modal.addEventListener('click', handleBackdropClick);
  }

  // ====== Pickers para agregar ítems con metadata ======
  async function openPickerInventoryForQuote(){
    // (deprecated) ya no expuesto en UI
    const node=document.createElement('div'); node.className='card';
    node.innerHTML=`<h3>Inventario</h3>
      <div class="row">
        <input id="qi-sku" placeholder="SKU" />
        <input id="qi-name" placeholder="Nombre" />
        <button id="qi-search" class="secondary">Buscar</button>
      </div>
      <div class="table-wrap" style="max-height:320px;overflow:auto;margin-top:8px;">
        <table class="table compact"><thead><tr><th>SKU</th><th>Nombre</th><th class="t-right">Precio</th><th></th></tr></thead><tbody id="qi-body"></tbody></table>
      </div>`;
    openModal(node);
    const body=node.querySelector('#qi-body');
    async function load(){
      const sku=node.querySelector('#qi-sku').value.trim();
      const name=node.querySelector('#qi-name').value.trim();
      body.innerHTML='<tr><td colspan="4">Cargando...</td></tr>';
      try{
        const items=await API.inventory.itemsList({ sku,name,limit:25 });
        body.innerHTML='';
        items.forEach(it=>{
          const tr=document.createElement('tr');
            tr.innerHTML=`<td>${it.sku||''}</td><td>${it.name||''}</td><td class="t-right">${money(it.salePrice||0)}</td><td class="t-right"><button class="secondary add">Agregar</button></td>`;
          tr.querySelector('button.add').onclick=()=>{
            const row=cloneRow();
            row.querySelector('select').value='PRODUCTO';
            row.querySelectorAll('input')[0].value=it.name||it.sku||'';
            row.querySelectorAll('input')[1].value=1;
            row.querySelectorAll('input')[2].value=Math.round(it.salePrice||0);
            row.dataset.source='inventory'; if(it._id) row.dataset.refId=it._id; if(it.sku) row.dataset.sku=it.sku;
            updateRowSubtotal(row); rowsBox.appendChild(row); recalcAll(); saveDraft();
          };
          body.appendChild(tr);
        });
        if(!items.length) body.innerHTML='<tr><td colspan="4">Sin resultados</td></tr>';
      }catch(e){ body.innerHTML=`<tr><td colspan="4">Error: ${e.message}</td></tr>`; }
    }
    node.querySelector('#qi-search').onclick=load; load();
  }

  async function openPickerPricesForQuote(){
    // (deprecated) ya no expuesto en UI
    const node=document.createElement('div'); node.className='card';
    node.innerHTML=`<h3>Lista de precios</h3>
      <div class="table-wrap" style="max-height:320px;overflow:auto;margin-top:8px;">
  <table class="table compact"><thead><tr><th>Vehículo</th><th class="t-right">Precio</th><th></th></tr></thead><tbody id="qp-body"></tbody></table>
      </div>`;
    openModal(node);
    const body=node.querySelector('#qp-body');
    
    // Obtener vehicleId de la cotización actual si existe
    const currentVehicleId = iVehicleId?.value || null;
    
    async function load(){
      body.innerHTML='<tr><td colspan="3">Cargando...</td></tr>';
      try{
        const params = { limit:25 };
        // Filtrar por vehículo de la cotización si existe
        if (currentVehicleId) {
          params.vehicleId = currentVehicleId;
        }
        const rows=await API.pricesList(params);
        body.innerHTML='';
        rows.forEach(pe=>{
          const price=Number(pe.total||pe.price||0);
          const tr=document.createElement('tr');
          const vehicleCell = document.createElement('td');
          if (pe.vehicleId && pe.vehicleId.make) {
            vehicleCell.innerHTML = `
              <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${pe.vehicleId.make} ${pe.vehicleId.line}</div>
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cilindraje: ${pe.vehicleId.displacement}${pe.vehicleId.modelYear ? ` | Modelo: ${pe.vehicleId.modelYear}` : ''}</div>
            `;
          } else {
            vehicleCell.innerHTML = `
              <div>${pe.brand || ''} ${pe.line || ''}</div>
              <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${pe.engine || ''} ${pe.year || ''}</div>
            `;
          }
          tr.appendChild(vehicleCell);
          const priceCell = document.createElement('td');
          priceCell.className = 't-right';
          priceCell.textContent = money(price);
          tr.appendChild(priceCell);
          const actionCell = document.createElement('td');
          actionCell.className = 't-right';
          const btn = document.createElement('button');
          btn.className = 'secondary add';
          btn.textContent = 'Agregar';
          btn.onclick=()=>{
            const row=cloneRow();
            row.querySelector('select').value='SERVICIO';
            const desc = pe.vehicleId && pe.vehicleId.make 
              ? `${pe.vehicleId.make} ${pe.vehicleId.line} ${pe.vehicleId.displacement}`.trim()
              : `${pe.brand||''} ${pe.line||''} ${pe.engine||''} ${pe.year||''}`.trim();
            row.querySelectorAll('input')[0].value = desc;
            row.querySelectorAll('input')[1].value=1;
            row.querySelectorAll('input')[2].value=Math.round(price||0);
            row.dataset.source='price'; if(pe._id) row.dataset.refId=pe._id;
            updateRowSubtotal(row); rowsBox.appendChild(row); recalcAll(); saveDraft();
          };
          actionCell.appendChild(btn);
          tr.appendChild(actionCell);
          body.appendChild(tr);
        });
        if(!rows.length) body.innerHTML='<tr><td colspan="3">Sin resultados</td></tr>';
      }catch(e){ body.innerHTML=`<tr><td colspan="3">Error: ${e.message}</td></tr>`; }
    }
    load();
  }

  // ===== Agregar unificado (QR + Manual) para cotizaciones =====
  function openAddUnifiedForQuote(){
    // Modal inicial: elegir entre QR y Manual
    const node = document.createElement('div');
    node.className = 'max-w-[600px] mx-auto';
    node.innerHTML = `
      <h3 class="mt-0 mb-6 text-xl font-semibold text-white dark:text-white theme-light:text-slate-900 text-center">Agregar items</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <button id="add-qr-btn" class="px-6 py-6 rounded-xl text-base font-semibold flex flex-col items-center gap-2 border-none cursor-pointer transition-all duration-200 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white shadow-lg hover:shadow-xl hover:scale-105">
          <span class="text-5xl">📷</span>
          <span>Agregar QR</span>
        </button>
        <button id="add-manual-btn" class="px-6 py-6 rounded-xl text-base font-semibold flex flex-col items-center gap-2 border-none cursor-pointer transition-all duration-200 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white shadow-lg hover:shadow-xl hover:scale-105 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">
          <span class="text-5xl">✏️</span>
          <span>Agregar manual</span>
        </button>
      </div>
      <div class="text-center">
        <button id="add-cancel-btn" class="px-6 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
      </div>
    `;
    
    openModal(node);
    
    // Estilos hover para los botones
    const qrBtn = node.querySelector('#add-qr-btn');
    const manualBtn = node.querySelector('#add-manual-btn');
    const cancelBtn = node.querySelector('#add-cancel-btn');
    
    qrBtn.addEventListener('mouseenter', () => {
      qrBtn.classList.add('scale-105');
      qrBtn.classList.add('shadow-xl');
    });
    qrBtn.addEventListener('mouseleave', () => {
      qrBtn.classList.remove('scale-105');
      qrBtn.classList.remove('shadow-xl');
    });
    
    manualBtn.addEventListener('mouseenter', () => {
      manualBtn.classList.add('scale-105');
      manualBtn.classList.add('shadow-xl');
    });
    manualBtn.addEventListener('mouseleave', () => {
      manualBtn.classList.remove('scale-105');
      manualBtn.classList.remove('shadow-xl');
    });
    
    // Si selecciona QR, abrir el modal de QR (usar la función existente pero mejorada)
    qrBtn.onclick = () => {
      closeModal();
      openQRModalForQuote();
    };
    
    // Si selecciona Manual, mostrar navegación entre Lista de precios e Inventario
    manualBtn.onclick = () => {
      showManualViewForQuote(node);
    };
    
    cancelBtn.onclick = () => {
      closeModal();
    };
  }

  // Vista de agregar manual para cotizaciones
  function showManualViewForQuote(parentNode) {
    // Detectar si estamos en el modal de edición
    const isModal = !!window._modalQuoteContext;
    const currentVehicleId = isModal 
      ? (window._modalQuoteContext.vehicleId || null)
      : (iVehicleId?.value || null);
    let currentView = currentVehicleId ? 'prices' : 'inventory';
    
    function renderView() {
      parentNode.innerHTML = `
        <div class="mb-4">
          <h3 class="mt-0 mb-4 text-lg font-semibold text-white dark:text-white theme-light:text-slate-900">Agregar manual</h3>
          <div class="flex gap-2 border-b-2 border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 pb-2">
            <button id="nav-prices" class="flex-1 px-3 py-3 rounded-t-lg border-none font-semibold cursor-pointer transition-all duration-200 ${currentView === 'prices' ? 'bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 text-white' : 'bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900'}">
              💰 Lista de precios
            </button>
            <button id="nav-inventory" class="flex-1 px-3 py-3 rounded-t-lg border-none font-semibold cursor-pointer transition-all duration-200 ${currentView === 'inventory' ? 'bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 text-white' : 'bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900'}">
              📦 Inventario
            </button>
          </div>
        </div>
        <div id="manual-content" class="min-h-[400px] max-h-[70vh] overflow-y-auto custom-scrollbar"></div>
        <div class="mt-4 text-center">
          <button id="manual-back-btn" class="px-6 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">← Volver</button>
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
        openAddUnifiedForQuote();
      };
      
      // Renderizar contenido según la vista actual
      if (currentView === 'prices') {
        renderPricesViewForQuote(content, currentVehicleId, isModal);
      } else {
        renderInventoryViewForQuote(content, isModal);
      }
    }
    
    renderView();
  }

  // Vista de Lista de precios para cotizaciones
  async function renderPricesViewForQuote(container, vehicleId, isModal = false) {
    // Obtener contexto correcto (modal o principal)
    const ctx = isModal && window._modalQuoteContext ? window._modalQuoteContext : {
      rowsBox,
      cloneRow,
      updateRowSubtotal,
      recalc: recalcAll,
      vehicleId: iVehicleId?.value || null
    };
    container.innerHTML = '<div class="text-center py-6 px-6 text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cargando...</div>';
    
    if (!vehicleId) {
      container.innerHTML = `
        <div class="text-center py-12 px-12">
          <div class="text-5xl mb-4">🚗</div>
          <h4 class="mb-2 text-lg font-semibold text-white dark:text-white theme-light:text-slate-900">No hay vehículo vinculado</h4>
          <p class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-4">Vincula un vehículo a la cotización para ver los precios disponibles.</p>
        </div>
      `;
      return;
    }
    
    try {
      const vehicle = await API.vehicles.get(vehicleId);
      
      // Variables de estado para filtros y paginación
      let currentPage = 1;
      const pageSize = 10;
      let filterType = '';
      let filterName = '';
      let totalPrices = 0;
      
      async function loadPrices() {
        try {
          const pricesParams = { 
            vehicleId, 
            page: currentPage, 
            limit: pageSize 
          };
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
          container.querySelector('#prices-list').innerHTML = '<div class="text-center py-6 px-6 text-red-500 dark:text-red-400 theme-light:text-red-600">Error al cargar precios</div>';
        }
      }
      
      function renderPricesList(prices) {
      const pricesList = container.querySelector('#prices-list');
        if (!pricesList) return;
      
      if (prices.length === 0) {
          pricesList.innerHTML = '<div class="text-center py-6 px-6 text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay precios que coincidan con los filtros.</div>';
          return;
        }
        
        pricesList.innerHTML = '';
        prices.forEach(pe => {
          const card = document.createElement('div');
          card.className = 'p-3 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg flex justify-between items-center';
          
          let typeBadge = '';
          if (pe.type === 'combo') {
            typeBadge = '<span class="bg-purple-600 text-white px-2 py-0.5 rounded text-xs font-semibold mr-2">COMBO</span>';
          } else if (pe.type === 'product') {
            typeBadge = '<span class="bg-blue-600 text-white px-2 py-0.5 rounded text-xs font-semibold mr-2">PRODUCTO</span>';
          } else {
            typeBadge = '<span class="bg-green-600 text-white px-2 py-0.5 rounded text-xs font-semibold mr-2">SERVICIO</span>';
          }
          
          card.innerHTML = `
            <div class="flex-1">
              ${typeBadge}
              <span class="font-semibold text-white dark:text-white theme-light:text-slate-900">${pe.name || 'Sin nombre'}</span>
            </div>
            <div class="mx-4 font-semibold text-blue-500 dark:text-blue-400 theme-light:text-blue-600">${money(pe.total || pe.price || 0)}</div>
            <button class="add-price-btn px-4 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white transition-all duration-200" data-price-id="${pe._id}">Agregar</button>
          `;
          
          card.querySelector('.add-price-btn').onclick = () => {
            if (pe.type === 'combo' && pe.comboProducts && pe.comboProducts.length > 0) {
              // Agregar el combo principal
              const comboRow = ctx.cloneRow();
              comboRow.querySelector('select').value = 'PRODUCTO';
              comboRow.querySelectorAll('input')[0].value = pe.name || '';
              comboRow.querySelectorAll('input')[1].value = 1;
              comboRow.querySelectorAll('input')[2].value = Math.round(pe.total || pe.price || 0);
              comboRow.dataset.source = 'price';
              if (pe._id) comboRow.dataset.refId = String(pe._id);
              ctx.updateRowSubtotal(comboRow);
              ctx.rowsBox.appendChild(comboRow);
              
              // Agregar cada producto del combo
              pe.comboProducts.forEach(cp => {
                const row = ctx.cloneRow();
                row.querySelector('select').value = 'PRODUCTO';
                // Para slots abiertos, solo mostrar el nombre (sin indicadores)
                row.querySelectorAll('input')[0].value = cp.name || '';
                row.querySelectorAll('input')[1].value = cp.qty || 1;
                row.querySelectorAll('input')[2].value = Math.round(cp.unitPrice || 0);
                row.dataset.source = cp.itemId ? 'inventory' : 'price';
                // Asegurar que refId sea un string (puede venir como objeto con _id)
                if (cp.itemId) {
                  const refIdValue = typeof cp.itemId === 'object' && cp.itemId._id 
                    ? String(cp.itemId._id) 
                    : String(cp.itemId || '');
                  if (refIdValue) row.dataset.refId = refIdValue;
                }
                if (cp.itemId) {
                  const skuValue = typeof cp.itemId === 'object' && cp.itemId.sku 
                    ? cp.itemId.sku 
                    : (cp.sku || '');
                  if (skuValue) row.dataset.sku = skuValue;
                }
                // Marcar como item del combo
                if (pe._id) row.dataset.comboParent = String(pe._id);
                ctx.updateRowSubtotal(row);
                ctx.rowsBox.appendChild(row);
              });
            } else {
              // Item normal (servicio o producto)
              const row = ctx.cloneRow();
              row.querySelector('select').value = pe.type === 'product' ? 'PRODUCTO' : 'SERVICIO';
              row.querySelectorAll('input')[0].value = pe.name || '';
              row.querySelectorAll('input')[1].value = 1;
              row.querySelectorAll('input')[2].value = Math.round(pe.total || pe.price || 0);
              row.dataset.source = 'price';
              if (pe._id) row.dataset.refId = String(pe._id);
              ctx.updateRowSubtotal(row);
              
              console.log('[renderPricesViewForQuote] Agregando fila desde lista de precios:', {
                name: pe.name,
                type: pe.type === 'product' ? 'PRODUCTO' : 'SERVICIO',
                price: Math.round(pe.total || pe.price || 0),
                refId: pe._id,
                className: row.className,
                hasDataTemplate: row.hasAttribute('data-template')
              });
              
              ctx.rowsBox.appendChild(row);
              
              console.log('[renderPricesViewForQuote] Fila agregada. Total de filas en rowsBox:', ctx.rowsBox.querySelectorAll('.q-row-card:not([data-template])').length);
            }
            ctx.recalc();
            if (!isModal) {
              saveDraft();
            }
            closeModal();
          };
          
          pricesList.appendChild(card);
        });
      }
      
      function updatePagination() {
        const pageInfo = container.querySelector('#page-info-quote');
        const btnPrev = container.querySelector('#btn-prev-prices-quote');
        const btnNext = container.querySelector('#btn-next-prices-quote');
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
        <div class="mb-4 p-3 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-100 rounded-lg">
          <div class="font-semibold mb-1 text-white dark:text-white theme-light:text-slate-900">${vehicle?.make || ''} ${vehicle?.line || ''}</div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cilindraje: ${vehicle?.displacement || ''}${vehicle?.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}</div>
        </div>
        <div class="mb-3 flex gap-2 flex-wrap">
          <button id="create-service-btn" class="flex-1 min-w-[120px] px-2.5 py-2.5 rounded-lg font-semibold bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">
            ➕ Crear servicio
          </button>
          <button id="create-product-btn" class="flex-1 min-w-[120px] px-2.5 py-2.5 rounded-lg font-semibold bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">
            ➕ Crear producto
          </button>
          <button id="create-combo-btn" class="flex-1 min-w-[120px] px-2.5 py-2.5 rounded-lg font-semibold bg-purple-600 dark:bg-purple-600 theme-light:bg-purple-500 hover:bg-purple-700 dark:hover:bg-purple-700 theme-light:hover:bg-purple-600 text-white transition-all duration-200 border-none">
            🎁 Crear combo
          </button>
        </div>
        <div class="mb-3">
          <div class="flex gap-2 mb-2 flex-wrap">
            <select id="filter-type-prices-quote" class="flex-1 min-w-[120px] px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los tipos</option>
              <option value="service">Servicios</option>
              <option value="product">Productos</option>
              <option value="combo">Combos</option>
            </select>
            <input type="text" id="filter-name-prices-quote" placeholder="Buscar por nombre..." class="flex-2 min-w-[150px] px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button id="btn-apply-filters-prices-quote" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold">Buscar</button>
          </div>
          <h4 class="mb-2 text-base font-semibold text-white dark:text-white theme-light:text-slate-900">Precios disponibles</h4>
          <div id="prices-list" class="grid gap-2"></div>
          <div class="flex justify-between items-center mt-3 pt-3 border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
              Mostrando <span id="page-info-quote">0-0</span>
            </div>
            <div class="flex gap-2">
              <button id="btn-prev-prices-quote" class="px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed" disabled>← Anterior</button>
              <button id="btn-next-prices-quote" class="px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed">Siguiente →</button>
            </div>
          </div>
        </div>
      `;
      
      // Event listeners para filtros
      container.querySelector('#btn-apply-filters-prices-quote')?.addEventListener('click', () => {
        filterType = container.querySelector('#filter-type-prices-quote')?.value || '';
        filterName = container.querySelector('#filter-name-prices-quote')?.value.trim() || '';
        currentPage = 1;
        loadPrices();
      });
      
      container.querySelector('#filter-name-prices-quote')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          filterType = container.querySelector('#filter-type-prices-quote')?.value || '';
          filterName = container.querySelector('#filter-name-prices-quote')?.value.trim() || '';
          currentPage = 1;
          loadPrices();
        }
      });
      
      // Event listeners para paginación
      container.querySelector('#btn-prev-prices-quote')?.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          loadPrices();
        }
      });
      
      container.querySelector('#btn-next-prices-quote')?.addEventListener('click', () => {
        currentPage++;
        loadPrices();
      });
      
      // Botones de crear
      container.querySelector('#create-service-btn').onclick = () => {
        closeModal();
        createPriceFromQuote('service', vehicleId, vehicle);
      };
      
      container.querySelector('#create-product-btn').onclick = () => {
        closeModal();
        createPriceFromQuote('product', vehicleId, vehicle);
      };
      
      container.querySelector('#create-combo-btn').onclick = () => {
        closeModal();
        createPriceFromQuote('combo', vehicleId, vehicle);
      };
      
      // Cargar precios iniciales
      await loadPrices();
      
    } catch (err) {
      console.error('Error al cargar precios:', err);
      container.innerHTML = `
        <div class="text-center py-6 px-6 text-red-500 dark:text-red-400 theme-light:text-red-600">
          <div class="text-5xl mb-4">❌</div>
          <p class="text-white dark:text-white theme-light:text-slate-900">Error al cargar precios: ${err?.message || 'Error desconocido'}</p>
        </div>
      `;
    }
  }

  // Vista de Inventario para cotizaciones
  async function renderInventoryViewForQuote(container, isModal = false) {
    // Obtener contexto correcto (modal o principal)
    const ctx = isModal && window._modalQuoteContext ? window._modalQuoteContext : {
      rowsBox,
      cloneRow,
      updateRowSubtotal,
      recalc: recalcAll,
      vehicleId: iVehicleId?.value || null
    };
    
    container.innerHTML = '<div class="text-center py-6 px-6 text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cargando...</div>';
    
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
          listContainer.innerHTML = '<div class="text-center py-6 px-6 text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No se encontraron items.</div>';
          return;
        }
        
        items.forEach(item => {
          const card = document.createElement('div');
          card.className = 'p-3 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg flex justify-between items-center mb-2';
          
          card.innerHTML = `
            <div class="flex-1">
              <div class="font-semibold mb-1 text-white dark:text-white theme-light:text-slate-900">${item.name || 'Sin nombre'}</div>
              <div class="text-sm text-white dark:text-white theme-light:text-slate-900"><strong class="font-bold">SKU:</strong> <strong class="font-bold">${item.sku || 'N/A'}</strong> | Stock: ${item.stock || 0} | ${money(item.salePrice || 0)}</div>
            </div>
            <button class="add-inventory-btn ml-3 px-4 py-1.5 rounded-md border-none cursor-pointer font-semibold bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white transition-all duration-200" data-item-id="${item._id}">Agregar</button>
          `;
          
          card.querySelector('.add-inventory-btn').onclick = () => {
            const row = ctx.cloneRow();
            row.querySelector('select').value = 'PRODUCTO';
            row.querySelectorAll('input')[0].value = item.name || item.sku || '';
            row.querySelectorAll('input')[1].value = 1;
            row.querySelectorAll('input')[2].value = Math.round(item.salePrice || 0);
            row.dataset.source = 'inventory';
            if (item._id) row.dataset.refId = String(item._id);
            if (item.sku) row.dataset.sku = item.sku;
            ctx.updateRowSubtotal(row);
            ctx.rowsBox.appendChild(row);
            ctx.recalc();
            if (!isModal) {
              saveDraft();
            }
            closeModal();
          };
          
          listContainer.appendChild(card);
        });
        
        const loadMoreBtn = container.querySelector('#load-more-inventory');
        if (loadMoreBtn) {
          loadMoreBtn.style.display = items.length >= limit ? 'block' : 'none';
        }
        
      } catch (err) {
        console.error('Error al cargar inventario:', err);
        container.querySelector('#inventory-list').innerHTML = `
          <div class="text-center py-6 px-6 text-red-500 dark:text-red-400 theme-light:text-red-600">
            <p class="text-white dark:text-white theme-light:text-slate-900">Error al cargar inventario: ${err?.message || 'Error desconocido'}</p>
          </div>
        `;
      }
    }
    
    container.innerHTML = `
      <div class="mb-4">
        <h4 class="mb-3 text-base font-semibold text-white dark:text-white theme-light:text-slate-900">Filtrar inventario</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <input id="inventory-filter-sku" type="text" placeholder="Buscar por SKU..." class="px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input id="inventory-filter-name" type="text" placeholder="Buscar por nombre..." class="px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button id="inventory-search-btn" class="w-full px-2.5 py-2.5 rounded-md border-none font-semibold cursor-pointer bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white transition-all duration-200">🔍 Buscar</button>
      </div>
      <div id="inventory-list" class="max-h-[50vh] overflow-y-auto custom-scrollbar"></div>
      <div class="text-center mt-3">
        <button id="load-more-inventory" class="hidden px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cargar más</button>
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
    
    loadItems(true);
  }

  // Crear precio desde cotización (similar a createPriceFromSale)
  async function createPriceFromQuote(type, vehicleId, vehicle) {
    // Detectar si estamos en el modal de edición
    const isModal = !!window._modalQuoteContext;
    const quoteCtx = isModal && window._modalQuoteContext ? window._modalQuoteContext : {
      rowsBox,
      cloneRow,
      updateRowSubtotal,
      recalc: recalcAll,
      vehicleId: iVehicleId?.value || null
    };
    
    const node = document.createElement('div');
    node.className = 'card max-w-[600px] mx-auto';
    
    const isCombo = type === 'combo';
    const isProduct = type === 'product';
    const isService = type === 'service';
    
    node.innerHTML = `
      <h3 class="mt-0 mb-4 text-xl font-bold text-white dark:text-white theme-light:text-slate-900">Crear ${type === 'combo' ? 'Combo' : (type === 'service' ? 'Servicio' : 'Producto')}</h3>
      <p class="mb-4 text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">
        Vehículo: <strong class="text-white dark:text-white theme-light:text-slate-900">${vehicle?.make || ''} ${vehicle?.line || ''}</strong>
      </p>
      <div class="mb-4">
        <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1 font-medium">Nombre</label>
        <input id="price-name" placeholder="${type === 'combo' ? 'Ej: Combo mantenimiento completo' : (type === 'service' ? 'Ej: Cambio de aceite' : 'Ej: Filtro de aire')}" class="w-full px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      ${isProduct ? `
      <div class="mb-4">
        <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1 font-medium">Vincular con item del inventario (opcional)</label>
        <div class="flex gap-2 mb-2">
          <input id="price-item-search" placeholder="Buscar por SKU o nombre..." class="flex-1 px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button id="price-item-qr" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">📷 QR</button>
        </div>
        <div id="price-item-selected" class="mt-2 p-2 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-100 rounded-md text-xs hidden"></div>
        <input type="hidden" id="price-item-id" />
      </div>
      ` : ''}
      ${isCombo ? `
      <div class="mb-4">
        <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1 font-medium">Productos del combo</label>
        <div id="price-combo-products" class="mb-2"></div>
        <button id="price-add-combo-product" class="w-full px-2 py-2 mb-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">➕ Agregar producto</button>
      </div>
      ` : ''}
      ${!isCombo ? `
      <div class="mb-4">
        <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1 font-medium">Precio</label>
        <input id="price-total" type="number" step="0.01" placeholder="0" class="w-full px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      ` : `
      <div class="mb-4">
        <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1 font-medium">Precio total del combo</label>
        <input id="price-total" type="number" step="0.01" placeholder="0 (se calcula automáticamente)" class="w-full px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <p class="mt-1 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">El precio se calcula automáticamente desde los productos, o puedes establecerlo manualmente.</p>
      </div>
      `}
      <div class="mb-4 p-3 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
        <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2 font-medium">Rango de años (opcional)</label>
        <p class="mb-2 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Solo aplicar este precio si el año del vehículo está en el rango especificado. Déjalo vacío para aplicar a todos los años.</p>
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Desde</label>
            <input id="price-year-from" type="number" min="1900" max="2100" placeholder="Ej: 2018" class="w-full px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div class="flex-1">
            <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Hasta</label>
            <input id="price-year-to" type="number" min="1900" max="2100" placeholder="Ej: 2022" class="w-full px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>
      ${isCombo || isProduct || isService ? `
      <div class="mb-4 p-3 bg-blue-900/20 dark:bg-blue-900/20 theme-light:bg-blue-50 rounded-lg border border-blue-700/30 dark:border-blue-700/30 theme-light:border-blue-300">
        <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2 font-medium">Mano de obra (opcional)</label>
        <p class="mb-2 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Estos valores se usarán automáticamente al cerrar la venta para agregar participación técnica.</p>
        <div class="flex gap-2">
          <div class="flex-1">
            <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Valor de mano de obra</label>
            <input id="price-labor-value" type="number" min="0" step="1" placeholder="0" class="w-full px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div class="flex-1">
            <label class="block text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Tipo de mano de obra</label>
            <select id="price-labor-kind" class="w-full px-2 py-2 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Seleccione tipo --</option>
            </select>
          </div>
        </div>
      </div>
      ` : ''}
      <div id="price-msg" class="mb-4 text-sm"></div>
      <div class="flex gap-2">
        <button id="price-save" class="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">💾 Guardar</button>
        <button id="price-cancel" class="flex-1 px-4 py-2.5 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
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
    
    // Funcionalidad de búsqueda de items (solo para productos) - similar a sales.js
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
          if (items && items.length > 0) {
            const item = items[0];
            selectedItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
            itemIdInput.value = item._id;
            itemSearch.value = `${item.sku} - ${item.name}`;
            itemSelected.innerHTML = `
              <div class="flex justify-between items-center">
                <div>
                <strong class="text-white dark:text-white theme-light:text-slate-900">${item.name}</strong><br>
                <span class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600"><strong class="font-bold">SKU:</strong> <strong class="font-bold">${item.sku}</strong> | Stock: ${item.stock || 0}</span>
                </div>
                <button id="price-item-remove" class="px-2 py-1 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300">✕</button>
              </div>
            `;
            itemSelected.classList.remove('hidden');
            itemSelected.classList.add('block');
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
                  <div class="flex justify-between items-center">
                    <div>
                <strong class="text-white dark:text-white theme-light:text-slate-900">${item.name}</strong><br>
                <span class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600"><strong class="font-bold">SKU:</strong> <strong class="font-bold">${item.sku}</strong> | Stock: ${item.stock || 0}</span>
                    </div>
                    <button id="price-item-remove" class="px-2 py-1 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300">✕</button>
                  </div>
                `;
                itemSelected.classList.remove('hidden');
                itemSelected.classList.add('block');
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
              <div class="flex justify-between items-center">
                <div>
                <strong class="text-white dark:text-white theme-light:text-slate-900">${item.name}</strong><br>
                <span class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600"><strong class="font-bold">SKU:</strong> <strong class="font-bold">${item.sku}</strong> | Stock: ${item.stock || 0}</span>
                </div>
                <button id="price-item-remove" class="px-2 py-1 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300">✕</button>
              </div>
            `;
            itemSelected.classList.remove('hidden');
            itemSelected.classList.add('block');
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
          itemSelected.classList.add('hidden');
          itemSelected.classList.remove('block');
      };
    }
  }
  
  // Funcionalidad para combos (similar a createPriceFromSale)
  if (isCombo) {
    const comboProductsContainer = node.querySelector('#price-combo-products');
    const addComboProductBtn = node.querySelector('#price-add-combo-product');
    
    function addComboProductRow(productData = {}) {
      const isOpenSlot = Boolean(productData.isOpenSlot);
      const row = document.createElement('div');
      row.className = `combo-product-item p-3 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-100 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md mb-2 ${isOpenSlot ? 'border-l-4 border-yellow-500 dark:border-yellow-500 theme-light:border-yellow-400' : ''}`;
      row.innerHTML = `
        <div class="flex gap-2 mb-2">
          <input type="text" class="combo-product-name flex-[2] px-1.5 py-1.5 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nombre del producto" value="${productData.name || ''}" />
          <input type="number" class="combo-product-qty w-20 px-1.5 py-1.5 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Cant." value="${productData.qty || 1}" min="1" />
          <input type="number" class="combo-product-price w-30 px-1.5 py-1.5 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Precio" step="0.01" value="${productData.unitPrice || 0}" />
          <button class="combo-product-remove px-3 py-1.5 bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300">✕</button>
        </div>
        <div class="flex gap-2 mb-2 items-center">
          <label class="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" class="combo-product-open-slot w-4 h-4 cursor-pointer" ${isOpenSlot ? 'checked' : ''} />
            <span class="text-white dark:text-white theme-light:text-slate-900">Slot abierto (se completa con QR al crear venta)</span>
          </label>
        </div>
        <div class="combo-product-item-section ${isOpenSlot ? 'hidden' : ''}">
          <div class="flex gap-2">
            <input type="text" class="combo-product-item-search flex-1 px-1.5 py-1.5 border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Buscar item del inventario (opcional)..." />
            <button class="combo-product-item-qr px-3 py-1.5 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">📷 QR</button>
          </div>
          <div class="combo-product-item-selected mt-2 p-1.5 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-slate-100 rounded text-xs hidden"></div>
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
          itemSection.classList.add('hidden');
          itemSection.classList.remove('block');
          const itemIdInput = row.querySelector('.combo-product-item-id');
          const itemSearch = row.querySelector('.combo-product-item-search');
          const itemSelected = row.querySelector('.combo-product-item-selected');
          itemIdInput.value = '';
          itemSearch.value = '';
          itemSelected.classList.add('hidden');
          itemSelected.classList.remove('block');
          row.classList.add('border-l-4', 'border-yellow-500', 'dark:border-yellow-500', 'theme-light:border-yellow-400');
        } else {
          itemSection.classList.remove('hidden');
          itemSection.classList.add('block');
          row.classList.remove('border-l-4', 'border-yellow-500', 'dark:border-yellow-500', 'theme-light:border-yellow-400');
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
          <div class="flex justify-between items-center">
            <div><strong class="text-white dark:text-white theme-light:text-slate-900">${productData.itemId.name || productData.itemId.sku}</strong> <span class="text-xs ml-2 text-slate-400 dark:text-slate-400 theme-light:text-slate-600"><strong class="font-bold">SKU:</strong> <strong class="font-bold">${productData.itemId.sku}</strong> | Stock: ${productData.itemId.stock || 0}</span></div>
            <button class="combo-product-item-remove-btn px-1.5 py-0.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300">✕</button>
          </div>
        `;
        itemSelected.classList.remove('hidden');
        itemSelected.classList.add('block');
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
          dropdown.className = 'absolute z-[1000] bg-slate-800/90 dark:bg-slate-800/90 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-md max-h-[200px] overflow-y-auto shadow-lg w-full mt-1';
          dropdown.replaceChildren(...items.map(item => {
            const div = document.createElement('div');
            div.className = 'p-2 cursor-pointer border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 hover:bg-slate-700/30 dark:hover:bg-slate-700/30 theme-light:hover:bg-slate-100 transition-colors';
            div.innerHTML = `
              <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${item.name || item.sku}</div>
              <div class="text-xs mt-1 text-slate-400 dark:text-slate-400 theme-light:text-slate-600"><strong class="text-sm font-bold">SKU:</strong> <strong class="text-sm font-bold">${item.sku}</strong> | Stock: ${item.stock || 0}</div>
            `;
            div.addEventListener('click', () => {
              selectedComboItem = { _id: item._id, sku: item.sku, name: item.name, stock: item.stock, salePrice: item.salePrice };
              itemIdInput.value = item._id;
              itemSearch.value = `${item.sku} - ${item.name}`;
              itemSelected.innerHTML = `
                <div class="flex justify-between items-center">
                  <div><strong class="text-white dark:text-white theme-light:text-slate-900">${item.name}</strong> <span class="text-xs ml-2 text-slate-400 dark:text-slate-400 theme-light:text-slate-600"><strong class="font-bold">SKU:</strong> <strong class="font-bold">${item.sku}</strong> | Stock: ${item.stock || 0}</span></div>
                  <button class="combo-product-item-remove-btn px-1.5 py-0.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300">✕</button>
                </div>
              `;
              itemSelected.classList.remove('hidden');
              itemSelected.classList.add('block');
              const removeBtn2 = itemSelected.querySelector('.combo-product-item-remove-btn');
              if (removeBtn2) {
                removeBtn2.onclick = () => {
                  selectedComboItem = null;
                  itemIdInput.value = '';
                  itemSearch.value = '';
                  itemSelected.classList.add('hidden');
                  itemSelected.classList.remove('block');
                };
              }
              dropdown.remove();
              const priceInput = row.querySelector('.combo-product-price');
              if (!priceInput.value || priceInput.value === '0') {
                priceInput.value = item.salePrice || 0;
              }
              updateComboTotal();
            });
            return div;
          }));
          
          const searchContainer = itemSearch.parentElement;
          searchContainer.classList.add('relative');
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
                  <div class="flex justify-between items-center">
                    <div><strong class="text-white dark:text-white theme-light:text-slate-900">${item.name}</strong> <span class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">SKU: ${item.sku} | Stock: ${item.stock || 0}</span></div>
                    <button class="combo-product-item-remove-btn px-1.5 py-0.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300">✕</button>
                  </div>
                `;
                itemSelected.classList.remove('hidden');
                itemSelected.classList.add('block');
                const removeBtn2 = itemSelected.querySelector('.combo-product-item-remove-btn');
                if (removeBtn2) {
                  removeBtn2.onclick = () => {
                    selectedComboItem = null;
                    itemIdInput.value = '';
                    itemSearch.value = '';
                    itemSelected.classList.add('hidden');
                    itemSelected.classList.remove('block');
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
        msgEl.className = 'mb-4 text-sm text-red-500 dark:text-red-400 theme-light:text-red-600';
        return;
      }
      
      if (total < 0) {
        msgEl.textContent = 'El precio debe ser mayor o igual a 0';
        msgEl.className = 'mb-4 text-sm text-red-500 dark:text-red-400 theme-light:text-red-600';
        return;
      }
      
      // Validar combo
      if (isCombo) {
        const comboProductsContainer = node.querySelector('#price-combo-products');
        const products = Array.from(comboProductsContainer.querySelectorAll('.combo-product-item'));
        if (products.length === 0) {
          msgEl.textContent = 'Un combo debe incluir al menos un producto';
          msgEl.className = 'mb-4 text-sm text-red-500 dark:text-red-400 theme-light:text-red-600';
          return;
        }
        
        for (const prod of products) {
          const prodName = prod.querySelector('.combo-product-name')?.value.trim();
          if (!prodName) {
            msgEl.textContent = 'Todos los productos del combo deben tener nombre';
            msgEl.className = 'mb-4 text-sm text-red-500 dark:text-red-400 theme-light:text-red-600';
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
        
        await API.priceCreate(payload);
        
        // Agregar el precio recién creado a la cotización
        const prices = await API.pricesList({ vehicleId, name, limit: 1 });
        if (prices && prices.length > 0) {
          const newPrice = prices[0];
          const row = quoteCtx.cloneRow();
          row.querySelector('select').value = newPrice.type === 'product' ? 'PRODUCTO' : 'SERVICIO';
          row.querySelectorAll('input')[0].value = newPrice.name || '';
          row.querySelectorAll('input')[1].value = 1;
          row.querySelectorAll('input')[2].value = Math.round(newPrice.total || newPrice.price || 0);
          row.dataset.source = 'price';
          if (newPrice._id) row.dataset.refId = String(newPrice._id);
          quoteCtx.updateRowSubtotal(row);
          quoteCtx.rowsBox.appendChild(row);
          quoteCtx.recalc();
          if (!isModal) {
            saveDraft();
          }
        }
        
        closeModal();
      } catch(e) {
        msgEl.textContent = 'Error: ' + (e?.message || 'Error desconocido');
        msgEl.className = 'mb-4 text-sm text-red-500 dark:text-red-400 theme-light:text-red-600';
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Guardar';
      }
    };
    
    cancelBtn.onclick = () => {
      closeModal();
    };
  }

  // ===== Agregar por QR (con cámara, igual que ventas) =====
  function openQRModalForQuote(){
    // Detectar si estamos en el modal de edición
    const isModal = !!window._modalQuoteContext;
    const quoteCtx = isModal && window._modalQuoteContext ? window._modalQuoteContext : {
      rowsBox,
      cloneRow,
      updateRowSubtotal,
      recalc: recalcAll,
      vehicleId: iVehicleId?.value || null
    };
    
    const tpl = document.getElementById('tpl-qr-scanner-quote');
    if (!tpl) {
      // Fallback si no existe el template
      alert('Template de QR no encontrado');
      return;
    }
    const node = tpl.content.firstElementChild.cloneNode(true);
    openModal(node);

    const video = node.querySelector('#qr-video-quote');
    const canvas = node.querySelector('#qr-canvas-quote');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sel = node.querySelector('#qr-cam-quote');
    const msg = node.querySelector('#qr-msg-quote');
    const list = node.querySelector('#qr-history-quote');
    const singleModeBtn = node.querySelector('#qr-single-mode-quote');
    const multiModeBtn = node.querySelector('#qr-multi-mode-quote');
    const finishMultiBtn = node.querySelector('#qr-finish-multi-quote');
    const manualInput = node.querySelector('#qr-manual-quote');
    const manualBtn = node.querySelector('#qr-add-manual-quote');

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
        const cs = { video: videoConstraints, audio: false };
        msg.textContent = 'Solicitando acceso a la cámara...';
        msg.className = 'text-sm text-white dark:text-white theme-light:text-slate-900';
        stream = await navigator.mediaDevices.getUserMedia(cs);
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('x5-playsinline', 'true');
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
          }, 10000);
        });
        running = true;
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
          errorMsg = '❌ Permisos de cámara denegados.';
        } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
          errorMsg = '❌ No se encontró ninguna cámara.';
        } else if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
          errorMsg = '❌ La cámara está siendo usada por otra aplicación.';
        } else {
          errorMsg = '❌ Error: ' + (e?.message||'Error desconocido');
        }
        msg.textContent = errorMsg;
        msg.className = 'text-sm text-red-500 dark:text-red-400 theme-light:text-red-600';
        running = false;
      }
    }

    function accept(value){
      if (cameraDisabled) return false;
      const normalized = String(value || '').trim().toUpperCase();
      const t = Date.now();
      if (lastCode === normalized && t - lastTs < 2000) return false;
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

    function playConfirmSound(){
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
    }

    function showItemAddedPopup(){
      const popup = document.createElement('div');
      popup.textContent = '✓ Item agregado!';
      popup.className = 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-green-500/95 text-white px-10 py-5 rounded-xl text-lg font-semibold z-[10000] shadow-lg pointer-events-none animate-[fadeInOut_1.5s_ease-in-out]';
      if (!document.getElementById('qr-popup-style')) {
        const style = document.createElement('style');
        style.id = 'qr-popup-style';
        style.textContent = `
          @keyframes fadeInOut {
            0%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
            50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          }
        `;
        document.head.appendChild(style);
      }
      document.body.appendChild(popup);
      setTimeout(() => {
        popup.remove();
      }, 1500);
    }

    async function handleCode(raw, fromManual = false){
      const text = String(raw || '').trim();
      if (!text) return;
      if (!fromManual && !accept(text)) return;
      
      cameraDisabled = true;
      const li=document.createElement('li'); li.textContent=text; list.prepend(li);
      const parsed = parseInventoryCode(text);
      try{
        let it = null;
        if (parsed.itemId){
          const items = await API.inventory.itemsList({});
          it = items.find(i => String(i._id) === parsed.itemId);
        } else {
          const candidate = (parsed.sku || text).toUpperCase();
          const items = await API.inventory.itemsList({ sku: candidate, limit: 1 });
          it = items[0];
        }
        if (!it) {
          msg.textContent = 'Item no encontrado en inventario.';
          msg.className = 'text-sm text-red-500 dark:text-red-400 theme-light:text-red-600';
          setTimeout(() => {
            cameraDisabled = false;
          }, 2000);
          return;
        }
        const row=quoteCtx.cloneRow();
        row.querySelector('select').value='PRODUCTO';
        row.querySelectorAll('input')[0].value=it.name||it.sku||text;
        row.querySelectorAll('input')[1].value=1;
        row.querySelectorAll('input')[2].value=Math.round(it.salePrice||0);
        row.dataset.source='inventory'; 
        if(it._id) row.dataset.refId=String(it._id); 
        if(it.sku) row.dataset.sku=it.sku;
        quoteCtx.updateRowSubtotal(row); 
        quoteCtx.rowsBox.appendChild(row); 
        quoteCtx.recalc(); 
        if (!isModal) {
          saveDraft();
        }
        playConfirmSound();
        showItemAddedPopup();
        if (!multiMode && !fromManual){ 
          setTimeout(() => {
            stop(); 
            closeModal();
          }, 1500);
        }
        setTimeout(() => {
          cameraDisabled = false;
        }, 2000);
        msg.textContent = '';
      }catch(e){ 
        msg.textContent = e?.message || 'No se pudo agregar';
        msg.className = 'text-sm text-red-500 dark:text-red-400 theme-light:text-red-600';
        setTimeout(() => {
          cameraDisabled = false;
        }, 2000);
      }
    }

    function onCode(code){
      handleCode(code);
    }

    async function tickNative(){ 
      if(!running || cameraDisabled) return;
      try {
        const codes = await detector.detect(video);
        if (codes?.[0]?.rawValue) onCode(codes[0].rawValue);
      } catch (e) {}
      requestAnimationFrame(tickNative);
    }

    function tickCanvas(){
      if(!running || cameraDisabled) return;
      try {
        const w = video.videoWidth | 0, h = video.videoHeight | 0;
        if (!w || !h) {
          requestAnimationFrame(tickCanvas);
          return;
        }
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const img = ctx.getImageData(0, 0, w, h);
        if (window.jsQR) {
          const qr = window.jsQR(img.data, w, h);
          if (qr && qr.data) onCode(qr.data);
        }
      } catch (e) {}
      requestAnimationFrame(tickCanvas);
    }

    singleModeBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      multiMode = false;
      singleModeBtn.style.display = 'none';
      multiModeBtn.style.display = 'none';
      if (finishMultiBtn) finishMultiBtn.style.display = 'none';
      msg.textContent = 'Modo un solo item. Escanea un item y se cerrará automáticamente.';
      await fillCams();
      await start();
    });

    multiModeBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      multiMode = true;
      singleModeBtn.style.display = 'none';
      multiModeBtn.style.display = 'none';
      if (finishMultiBtn) finishMultiBtn.style.display = 'inline-block';
      msg.textContent = 'Modo múltiples items activado. Escanea varios items seguidos.';
      await fillCams();
      await start();
    });

    finishMultiBtn?.addEventListener('click', () => {
      multiMode = false;
      singleModeBtn.style.display = 'inline-block';
      multiModeBtn.style.display = 'inline-block';
      if (finishMultiBtn) finishMultiBtn.style.display = 'none';
      msg.textContent = 'Modo múltiples items desactivado.';
      stop();
      closeModal();
    });

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

    fillCams();
  }

  // ===== Altura panel derecho =====
  function syncSummaryHeight(){
    if(!qData || !qSummary) return;
    const h=qData.offsetHeight; if(h){ qSummary.style.maxHeight=h+'px'; qSummary.style.overflowY='auto'; }
  }

  // ====== Auto-completar por placa ======
  function setupPlateAutofill(){
    if(!iPlate) return;
    let lastPlateFetched='';
    let timer=null;
    function normPlate(p){ return (p||'').trim().toUpperCase(); }
    async function fetchProfile(plate){
  if(!plate || plate.length<4) return; // mínimo 4 caracteres
      if(plate===lastPlateFetched) return;
      lastPlateFetched=plate;
      try {
        let prof = await API.sales.profileByPlate(plate);
  if(!prof) { // intento fuzzy si no encontró exacto
          prof = await API.sales.profileByPlate(plate, { fuzzy:true });
        }
        if(!prof) return; // nada que completar
        applyProfile(prof);
      } catch(e){
        console.warn('[quotes] profile lookup error', e?.message||e);
      }
    }
    async function applyProfile(prof){
      try {
        // Campos de cliente
        if(prof.customer){
          if(!dirty.clientName && !iClientName.value) iClientName.value = prof.customer.name || iClientName.value;
          if(!dirty.clientPhone && !iClientPhone.value) iClientPhone.value = prof.customer.phone || iClientPhone.value;
          if(!dirty.clientEmail && !iClientEmail.value) iClientEmail.value = prof.customer.email || iClientEmail.value;
          const idEl = document.getElementById('q-client-id');
          if (idEl && !idEl.value && prof.customer.idNumber) idEl.value = prof.customer.idNumber;
        }
        // Campos de vehículo
        if(prof.vehicle){
          if(!dirty.brand && !iBrand.value) iBrand.value = prof.vehicle.brand || iBrand.value;
          if(!dirty.line && !iLine.value) iLine.value = prof.vehicle.line || iLine.value;
          if(!dirty.year && !iYear.value && prof.vehicle.year) iYear.value = prof.vehicle.year;
          if(!dirty.cc && !iCc.value && prof.vehicle.engine) iCc.value = prof.vehicle.engine; // engine -> cc
          
          // Si el perfil tiene vehicleId, cargar y seleccionar el vehículo
          if(prof.vehicle.vehicleId && iVehicleId) {
            try {
              const vehicle = await API.vehicles.get(prof.vehicle.vehicleId);
              if (vehicle) {
                selectedQuoteVehicle = vehicle;
                iVehicleId.value = vehicle._id;
                if (iVehicleSearch) iVehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
                if (iVehicleSelected) {
                  iVehicleSelected.innerHTML = `
                    <span class="text-green-500 dark:text-green-400 theme-light:text-green-600">✓</span> 
                    <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
                  `;
                }
                if (!dirty.brand && !iBrand.value) iBrand.value = vehicle.make || '';
                if (!dirty.line && !iLine.value) iLine.value = vehicle.line || '';
                if (!dirty.cc && !iCc.value) iCc.value = vehicle.displacement || '';
              }
            } catch (err) {
              console.warn('[quotes] No se pudo cargar vehículo del perfil:', err);
            }
          } else if (prof.vehicle.brand && prof.vehicle.line && prof.vehicle.engine) {
            // Si no tiene vehicleId pero tiene marca/línea/cilindraje, buscar en la BD
            try {
              const searchResult = await API.vehicles.search({ 
                q: `${prof.vehicle.brand} ${prof.vehicle.line} ${prof.vehicle.engine}`, 
                limit: 1 
              });
              if (searchResult?.items?.length > 0) {
                const vehicle = searchResult.items[0];
                selectedQuoteVehicle = vehicle;
                iVehicleId.value = vehicle._id;
                if (iVehicleSearch) iVehicleSearch.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
                if (iVehicleSelected) {
                  iVehicleSelected.innerHTML = `
                    <span class="text-green-500 dark:text-green-400 theme-light:text-green-600">✓</span> 
                    <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
                  `;
                }
              }
            } catch (err) {
              console.warn('[quotes] No se pudo buscar vehículo:', err);
            }
          }
        }
        recalcAll();
      } catch(err){ console.warn('[quotes] applyProfile error', err); }
    }
    function schedule(){
      clearTimeout(timer);
      timer=setTimeout(()=>fetchProfile(normPlate(iPlate.value)), 450);
    }
    iPlate.addEventListener('input', ()=>schedule());
    iPlate.addEventListener('blur', ()=>fetchProfile(normPlate(iPlate.value)));
    iPlate.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); fetchProfile(normPlate(iPlate.value)); }});
  }
  // ====== Auto-completar por identificación ======
  function setupIdAutofill(){
    const iId = document.getElementById('q-client-id') || null;
    if (!iId) return;
    let lastId = '';
    let timer = null;
    function schedule(){
      clearTimeout(timer);
      timer = setTimeout(fetchProfileById, 450);
    }
    async function fetchProfileById(){
      const id = String(iId.value || '').trim();
      if (!id || id === lastId) return;
      lastId = id;
      try{
        const prof = await API.profiles.byId(id);
        if (!prof) return;
        if (prof.customer){
          if(!dirty.clientName && !iClientName.value) iClientName.value = prof.customer.name || iClientName.value;
          if(!dirty.clientPhone && !iClientPhone.value) iClientPhone.value = prof.customer.phone || iClientPhone.value;
          if(!dirty.clientEmail && !iClientEmail.value) iClientEmail.value = prof.customer.email || iClientEmail.value;
        }
        if (prof.vehicle){
          if(!dirty.brand && !iBrand.value) iBrand.value = prof.vehicle.brand || iBrand.value;
          if(!dirty.line && !iLine.value) iLine.value = prof.vehicle.line || iLine.value;
          if(!dirty.year && !iYear.value && prof.vehicle.year) iYear.value = prof.vehicle.year;
          if(!dirty.cc && !iCc.value && prof.vehicle.engine) iCc.value = prof.vehicle.engine;
        }
        recalcAll();
      }catch(e){ console.warn('[quotes] lookup by ID failed', e?.message||e); }
    }
    iId.addEventListener('input', schedule);
    iId.addEventListener('blur', fetchProfileById);
    iId.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); fetchProfileById(); }});
  }

    // Inicialización de la página
  ensureInit();
  setupPlateAutofill();
  setupIdAutofill();
}



