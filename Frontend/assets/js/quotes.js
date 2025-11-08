/* assets/js/quotes.js
  Cotizaciones:
  - Numeración local por empresa (para UI)
  - Borrador local
  - Ítems dinámicos (2 columnas)
  - Vista previa WhatsApp
  - WhatsApp / PDF
  - Historial (listar/buscar/ver/editar/eliminar; re-enviar WA; re-generar PDF)
*/
import { API } from "./api.esm.js";
import { normalizeText, matchesSearch } from "./search-utils.js";

export function initQuotes({ getCompanyEmail }) {
  // ====== Helpers DOM ======
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ====== Estado ======
  let inited = false;
  let emailScope = '';       // para scoping del localStorage
  let currentQuoteId = null; // si estamos editando una del historial
  let currentDiscount = { type: null, value: 0 }; // descuento actual
  // Dirty flags para evitar sobre-escritura al autocompletar por placa
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

  // ====== Nodos ======
  const tab = $('#tab-cotizaciones');
  if(!tab) return;

  // Cabecera
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
  
  // Selector de vehículo
  const iVehicleSearch = $('#q-vehicle-search');
  const iVehicleId = $('#q-vehicle-id');
  const iVehicleDropdown = $('#q-vehicle-dropdown');
  const iVehicleSelected = $('#q-vehicle-selected');
  const iYearWarning = $('#q-year-warning');
  let selectedQuoteVehicle = null;
  let quoteVehicleSearchTimeout = null;

  const iValidDays = $('#q-valid-days');

  // Notas especiales
  const iSpecialNotesList = $('#q-special-notes-list');
  const iAddSpecialNote = $('#q-add-special-note');

  // Botones cabecera/acciones
  const iSaveDraft = $('#q-saveDraft');
  const btnClear   = $('#q-clearAll');
  const btnWA      = $('#q-sendWhatsApp');
  const btnPDF     = $('#q-exportPdf');
  const btnSaveBackend = $('#q-saveBackend');

  // Ítems
  const rowsBox = $('#q-rows');
  const rowTemplate = $('#q-row-template');
  const btnAddUnified = $('#q-add-unified');
  const lblSubtotalProducts = $('#q-subtotal-products');
  const lblSubtotalServices = $('#q-subtotal-services');
  const lblTotal = $('#q-total');
  
  // Elementos de descuento
  const discountSection = $('#q-discount-section');
  const discountAmount = $('#q-discount-amount');
  const btnDiscountPercent = $('#q-discount-percent');
  const btnDiscountFixed = $('#q-discount-fixed');
  const btnDiscountClear = $('#q-discount-clear');

  // Resumen
  const previewWA = $('#q-whatsappPreview');
  const qData = $('#q-data');
  const qSummary = $('#q-summary');

  // Historial
  const qhText = $('#qh-text');
  const qhFrom = $('#qh-from');
  const qhTo   = $('#qh-to');
  const qhApply= $('#qh-apply');
  const qhClear= $('#qh-clear');
  const qhList = $('#q-history-list');

  // ====== Utils ======
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

  // keys por empresa
  const kLast  = ()=>`${KEYS.lastNumber}:${emailScope}`;
  const kDraft = ()=>`${KEYS.draft}:${emailScope}`;

  // Búsqueda de vehículos para cotizaciones
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
        iVehicleDropdown.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px;">No se encontraron vehículos</div>';
        iVehicleDropdown.style.display = 'block';
        return;
      }
      iVehicleDropdown.replaceChildren(...vehicles.map(v => {
        const div = document.createElement('div');
        div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);';
        div.innerHTML = `
          <div style="font-weight:600;">${v.make} ${v.line}</div>
          <div style="font-size:12px;color:var(--muted);">Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}</div>
        `;
        div.addEventListener('click', () => {
          selectedQuoteVehicle = v;
          if (iVehicleId) iVehicleId.value = v._id;
          if (iVehicleSearch) iVehicleSearch.value = `${v.make} ${v.line} ${v.displacement}`;
          if (iVehicleSelected) {
            iVehicleSelected.innerHTML = `
              <span style="color:var(--success, #10b981);">✓</span> 
              <strong>${v.make} ${v.line}</strong> - Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}
            `;
          }
          if (iVehicleDropdown) iVehicleDropdown.style.display = 'none';
          if (iBrand) iBrand.value = v.make || '';
          if (iLine) iLine.value = v.line || '';
          if (iCc) iCc.value = v.displacement || '';
          // Validar año si ya está ingresado
          if (iYear && iYear.value) {
            validateQuoteYear();
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
      iVehicleDropdown.style.display = 'block';
    } catch (err) {
      console.error('Error al buscar vehículos:', err);
    }
  }
  
  // Validar año contra rango del vehículo en cotizaciones
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

  // ====== Init ======
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
    
    // Event listeners para selector de vehículo
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
    
    // Cerrar dropdown al hacer click fuera
    document.addEventListener('click', (e) => {
      if (iVehicleSearch && !iVehicleSearch.contains(e.target) && iVehicleDropdown && !iVehicleDropdown.contains(e.target)) {
        if (iVehicleDropdown) iVehicleDropdown.style.display = 'none';
      }
    });
  }

  // ===== Modal helpers (local a cotizaciones) =====
  function openModal(node){
    const modal = document.getElementById('modal');
    const slot  = document.getElementById('modalBody');
    const x     = document.getElementById('modalClose');
    if(!modal||!slot||!x) return;
    slot.replaceChildren(node);
    modal.classList.remove('hidden');
    x.onclick = ()=> modal.classList.add('hidden');
  }
  function closeModal(){ const m=document.getElementById('modal'); if(m) m.classList.add('hidden'); }

  // ====== Numeración local ======
  function nextNumber(){
    const raw = localStorage.getItem(kLast());
    let n = Number(raw||0); n = isNaN(n)?0:n;
    return pad5(n+1);
  }
  function advanceNumber(){
    const shown = Number(iNumber.value||'1');
    localStorage.setItem(kLast(), String(shown));
  }

  // ====== Borrador local ======
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
    }catch{}
  }
  function clearDraft(){ localStorage.removeItem(kDraft()); }

  // ====== Notas Especiales ======
  let specialNotes = [];
  
  function addSpecialNote() {
    // Crear modal bonito para agregar nota
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="card">
          <h3>Agregar Nota Especial</h3>
          <textarea id="special-note-input" placeholder="Escribe tu nota especial aquí..." style="width: 100%; height: 100px; margin: 16px 0; padding: 12px; border: 1px solid #ddd; border-radius: 4px; resize: vertical;"></textarea>
          <div class="row" style="justify-content: flex-end; gap: 8px;">
            <button id="cancel-note" class="secondary">Cancelar</button>
            <button id="save-note" class="primary">Agregar Nota</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    modal.classList.remove('hidden');
    
    const input = modal.querySelector('#special-note-input');
    const saveBtn = modal.querySelector('#save-note');
    const cancelBtn = modal.querySelector('#cancel-note');
    
    input.focus();
    
    const closeModal = () => {
      modal.remove();
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
    
    // Cerrar con ESC
    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);
  }
  
  function removeSpecialNote(index) {
    if (confirm('¿Eliminar esta nota especial?')) {
      specialNotes.splice(index, 1);
      renderSpecialNotes();
      recalcAll();
    }
  }
  
  // Hacer la función global para que funcione desde el HTML
  window.removeSpecialNote = removeSpecialNote;
  
  function renderSpecialNotes() {
    if (!iSpecialNotesList) return;
    iSpecialNotesList.innerHTML = '';
    specialNotes.forEach((note, index) => {
      const noteDiv = document.createElement('div');
      noteDiv.className = 'special-note-item';
      noteDiv.style.cssText = `
        display: flex; 
        align-items: center; 
        gap: 12px; 
        margin-bottom: 12px; 
        padding: 12px; 
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); 
        border-radius: 8px; 
        border-left: 4px solid #007bff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transition: all 0.2s ease;
      `;
      noteDiv.innerHTML = `
        <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">📝</span>
          <span style="flex: 1; line-height: 1.4;">${note}</span>
        </div>
        <button type="button" class="secondary" onclick="removeSpecialNote(${index})" style="font-size: 12px; padding: 6px 12px; border-radius: 4px; background: #dc3545; color: white; border: none; cursor: pointer; transition: background 0.2s ease;" onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'">Eliminar</button>
      `;
      iSpecialNotesList.appendChild(noteDiv);
    });
  }

  // ====== Filas ======
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
    // Botón de quitar - más específico
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
    const rows=[]; rowsBox.querySelectorAll('.tr:not([data-template])').forEach(r=>{
      const type=r.querySelector('select').value;
      const desc=r.querySelectorAll('input')[0].value;
      const qty =Number(r.querySelectorAll('input')[1].value||0);
      const price=Number(r.querySelectorAll('input')[2].value||0);
      if(!desc && !price && !qty) return;
      rows.push({
        type,desc,qty,price,
        source: r.dataset.source || undefined,
        refId: r.dataset.refId || undefined,
        sku: r.dataset.sku || undefined,
        comboParent: r.dataset.comboParent || undefined
      });
    }); return rows;
  }
  function updateRowSubtotal(r){
    const qty=Number(r.querySelectorAll('input')[1].value||0);
    const price=Number(r.querySelectorAll('input')[2].value||0);
    const subtotal=(qty>0?qty:1)*(price||0);
    r.querySelectorAll('input')[3].value = money(subtotal);
  }

  // ====== Totales & Preview ======
  function recalcAll(){
    const rows=readRows(); let subP=0, subS=0;
    rows.forEach(({type,qty,price})=>{
      const q=qty>0?qty:1; const st=q*(price||0);
      if((type||'PRODUCTO')==='PRODUCTO') subP+=st; else subS+=st;
    });
    const subtotal=subP+subS;
    
    // Calcular descuento
    let discountValue = 0;
    if (currentDiscount.type && currentDiscount.value > 0) {
      if (currentDiscount.type === 'percent') {
        discountValue = (subtotal * currentDiscount.value) / 100;
      } else {
        discountValue = currentDiscount.value;
      }
    }
    
    const total = subtotal - discountValue;
    
    lblSubtotalProducts.textContent=money(subP);
    lblSubtotalServices.textContent=money(subS);
    
    // Mostrar/ocultar sección de descuento
    if (discountValue > 0) {
      discountSection.style.display = 'block';
      discountAmount.textContent = money(discountValue);
      btnDiscountClear.style.display = 'inline-block';
    } else {
      discountSection.style.display = 'none';
      btnDiscountClear.style.display = 'none';
    }
    
    lblTotal.textContent=money(total);
    previewWA.textContent=buildWhatsAppText(rows,subP,subS,total);
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
    
    // Primera pasada: identificar combos principales y sus items
    rows.forEach(row => {
      if (row.comboParent) {
        // Es un item de un combo
        if (!comboMap.has(row.comboParent)) {
          comboMap.set(row.comboParent, { main: null, items: [] });
        }
        comboMap.get(row.comboParent).items.push(row);
      } else if (row.source === 'price' && row.refId) {
        // Puede ser un combo principal, verificar si tiene items asociados
        if (!comboMap.has(row.refId)) {
          comboMap.set(row.refId, { main: row, items: [] });
        } else {
          comboMap.get(row.refId).main = row;
        }
      } else {
        // Es un item regular
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
      } else if (combo.main && combo.items.length === 0) {
        // Es un precio normal, no un combo, agregarlo a regularRows
        regularRows.push(combo.main);
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
    // Intentar usar plantilla activa (quote) -> abrir ventana/imprimir
    try {
      const tpl = await API.templates.active('quote');
      if (tpl && tpl.contentHtml) {
        const contentHtml = tpl.contentHtml;
        const contentCss = tpl.contentCss || '';
  // Construir doc de contexto básico desde UI para previsualizar (similar a buildContext server pero local)
        const docContext = {
          quote: {
            number: iNumber.value,
            date: iDatetime.value||todayIso(),
            customerName: iClientName.value,
            customerPhone: iClientPhone.value,
            customerEmail: iClientEmail.value,
            plate: iPlate.value,
            items: readRows().map(r=>({ description:r.desc, qty:r.qty, unitPrice:r.price, total:(r.qty>0?r.qty:1)*(r.price||0), type:r.type })),
            totals: {
              subP: parseMoney(lblSubtotalProducts.textContent),
              subS: parseMoney(lblSubtotalServices.textContent),
              total: parseMoney(lblTotal.textContent)
            }
          }
        };
        // Enviar a endpoint preview para tener helpers (money/date) y sample context real (servidor complementa)
        const pv = await API.templates.preview({ type:'quote', contentHtml, contentCss });
        const w = window.open('', 'quoteTpl');
        if (w) {
          w.document.write(`<html><head><title>Cotización</title><style>${pv.css||contentCss}</style></head><body>${pv.rendered || contentHtml}</body></html>`);
          w.document.close();
        }
        return; // no continuar a PDF jsPDF
      }
    } catch(e){ console.warn('Fallo plantilla quote, usando fallback PDF', e); }
    await exportPDFFromData({
      number:iNumber.value,
      datetime:iDatetime.value||todayIso(),
      customer:{ name:iClientName.value,clientPhone:iClientPhone.value, email:iClientEmail.value },
      vehicle:{ 
        vehicleId: iVehicleId?.value || null,
        make:iBrand.value, 
        line:iLine.value, 
        modelYear:iYear.value, 
        plate:iPlate.value, 
        displacement:iCc.value, 
        mileage:iMileage.value 
      },
      validity:iValidDays.value,
      specialNotes:specialNotes,
      items:readRows().map(r=>({
        kind:r.type, description:r.desc, qty:r.qty, unitPrice:r.price,
        subtotal:(r.qty>0?r.qty:1)*(r.price||0)
      })),
      totals:{
        subP:parseMoney(lblSubtotalProducts.textContent),
        subS:parseMoney(lblSubtotalServices.textContent),
        total:parseMoney(lblTotal.textContent)
      }
    });
  // No mover correlativo aquí.
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
        kind:r.type, description:r.desc,
        qty:r.qty?Number(r.qty):null,
        unitPrice:Number(r.price||0)
      };
      if(r.source){ base.source=r.source; }
      if(r.refId){ base.refId=r.refId; }
      if(r.sku){ base.sku=r.sku; }
      return base;
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
      let doc;
      if(creating){ doc = await API.quoteCreate(payloadFromUI()); }
      else        { doc = await API.quotePatch(currentQuoteId, payloadFromUI()); }

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
      qhList.innerHTML='<small class="meta">Cargando...</small>';
      // Llamada "raw" para poder inspeccionar metadata si existe
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
          qhList.innerHTML=`<small class="meta">Sin items en esta página (total ${res.metadata.total}).</small>`;
        } else {
          qhList.innerHTML='<small class="meta">No hay cotizaciones aún.</small>';
        }
        return;
      }
      renderHistory(rows);
    }catch(e){
      qhList.innerHTML=`<small class="meta">Error: ${e?.message || 'No se pudo cargar'}</small>`;
      try { console.error('[quotes] loadHistory error', e); } catch {}
    }
  }

  function renderHistory(rows){
    if(!rows.length){ qhList.innerHTML=`<small class="meta">Sin resultados.</small>`; return; }
    qhList.innerHTML='';
    rows.forEach(d=>{
      const el=document.createElement('div'); el.className='qh-item';
      const date=d.createdAt?new Date(d.createdAt).toLocaleString():'';
      el.innerHTML=`
        <div><strong>#${(d.number||'').toString().padStart(5,'0')}</strong><div class="meta">${date}</div></div>
  <div><div><strong>${d.customer?.name||'—'}</strong></div><div class="meta">${[d.vehicle?.make,d.vehicle?.line,d.vehicle?.modelYear].filter(Boolean).join(' ')||'—'}</div></div>
  <div><div>Placa</div><div class="meta">${d.vehicle?.plate||'—'}</div></div>
        <div><div>Total</div><div class="meta">${money(d.total||0)}</div></div>
        <div class="actions">
          <button data-act="edit">Ver/Editar</button>
          <button class="secondary" data-act="wa">WhatsApp</button>
          <button class="secondary" data-act="pdf">PDF</button>
          <button class="danger" data-act="del">Eliminar</button>
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
      <div class="card">
  <h3>Ver/Editar cotización</h3>
        <div class="row">
          <div class="field">
            <label>N.º cotización</label>
            <input id="m-number" disabled />
          </div>
          <div class="field">
            <label>Fecha y hora</label>
            <input id="m-datetime" disabled />
          </div>
        </div>
        <label>Cliente</label>
        <input id="m-client-name" placeholder="Nombre del cliente" />
        <div class="row">
          <input id="m-client-phone" placeholder="Teléfono (opcional)" />
          <input id="m-client-email" placeholder="Correo (opcional)" />
        </div>
        <label>Placa</label>
        <input id="m-plate" placeholder="ABC123" />
        <div style="position:relative;margin-top:8px;">
          <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:500;">Vehículo (opcional)</label>
          <input id="m-vehicle-search" placeholder="Buscar vehículo (marca, línea, cilindraje)..." style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);" />
          <div id="m-vehicle-dropdown" style="display:none;position:absolute;z-index:1000;background:var(--card);border:1px solid var(--border);border-radius:6px;max-height:200px;overflow-y:auto;margin-top:4px;box-shadow:0 4px 12px rgba(0,0,0,0.15);width:100%;"></div>
          <input type="hidden" id="m-vehicle-id" />
          <div id="m-vehicle-selected" style="margin-top:4px;font-size:12px;color:var(--muted);"></div>
        </div>
        <div class="row">
          <input id="m-brand" placeholder="Marca" readonly style="background:var(--bg-secondary);" />
          <input id="m-line" placeholder="Línea/Modelo" readonly style="background:var(--bg-secondary);" />
        </div>
        <div class="row">
          <input id="m-year" placeholder="Año" />
          <input id="m-cc" placeholder="Cilindraje" readonly style="background:var(--bg-secondary);" />
        </div>
        <div id="m-year-warning" style="display:none;font-size:11px;color:var(--danger,#ef4444);margin-top:4px;"></div>
        <div class="row">
          <input id="m-mileage" placeholder="Kilometraje" type="number" min="0" step="1" />
        </div>
  <label>Validez (días, opcional)</label>
        <input id="m-valid-days" type="number" min="0" step="1" placeholder="p. ej. 8" />
      </div>

      <div class="card">
  <h3>Ítems</h3>
        <div id="m-rows" class="q-grid-2cols">
          <div class="tr q-row-card hidden" id="m-row-template" data-template>
            <div>
              <label class="sr-only">Tipo</label>
              <select>
                <option value="PRODUCTO">Producto</option>
                <option value="SERVICIO">Servicio</option>
              </select>
            </div>
            <div>
              <label class="sr-only">Descripción</label>
              <input placeholder="Descripción" />
            </div>
            <div class="small">
              <label class="sr-only">Cant.</label>
              <input type="number" min="0" step="1" placeholder="Cant." />
            </div>
            <div class="small">
              <label class="sr-only">Precio</label>
              <input type="number" min="0" step="0.01" placeholder="Precio" />
            </div>
            <div class="small">
              <label class="sr-only">Subtotal</label>
              <input disabled placeholder="$0" />
            </div>
            <div class="small">
              <button class="secondary" style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; transition: background 0.2s ease; width: 100%;">Quitar</button>
            </div>
          </div>
        </div>
        <div class="row">
          <button id="m-addRow">+ Agregar línea</button>
        </div>
        <div class="totals">
          <div>Subtotal Productos: <strong id="m-subP">$0</strong></div>
          <div>Subtotal Servicios: <strong id="m-subS">$0</strong></div>
          <div id="m-discount-section" style="display: none;">
            <div>Descuento: <strong id="m-discount-amount">$0</strong></div>
          </div>
          <div>Total: <strong id="m-total">$0</strong></div>
        </div>
        
        <!-- Botones de descuento -->
        <div class="row" style="margin-top: 12px; gap: 8px;">
          <button id="m-discount-percent" class="secondary" style="background: #10b981; color: white; border: none;">Descuento %</button>
          <button id="m-discount-fixed" class="secondary" style="background: #3b82f6; color: white; border: none;">Descuento $</button>
          <button id="m-discount-clear" class="secondary" style="background: #ef4444; color: white; border: none; display: none;">Quitar descuento</button>
        </div>
        <div class="row">
          <button id="m-save">Guardar cambios</button>
          <button id="m-wa" class="secondary">WhatsApp</button>
          <button id="m-pdf" class="secondary">PDF</button>
          <button id="m-close" class="secondary">Cerrar</button>
        </div>
        <label>Vista previa WhatsApp</label>
        <pre id="m-wa-prev" style="min-height:160px;white-space:pre-wrap;"></pre>
      </div>
    `;

    // ---- refs ----
    const q = (s)=>root.querySelector(s);
    const iNumber   = q('#m-number');
    const iDatetime = q('#m-datetime');
    const iName  = q('#m-client-name');
    const iPhone = q('#m-client-phone');
    const iEmail = q('#m-client-email');
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
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(16, 185, 129, 0.3);
        z-index: 10001;
        font-weight: 600;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
      `;
      
      notification.innerHTML = `
        <div style="font-size: 20px;">✅</div>
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
      modal.className = 'modal discount-modal';
      modal.style.cssText = 'position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 10001;';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center;">
          <div class="card">
            <h3 style="margin: 0 0 16px 0; color: var(--text);">${title}</h3>
            <p style="margin: 0 0 16px 0; color: var(--muted); font-size: 14px;">
              ${isPercent ? 'Ingrese el porcentaje de descuento' : 'Ingrese el monto de descuento'}
            </p>
            <input 
              id="discount-input" 
              type="number" 
              placeholder="${placeholder}"
              value="${currentValue}"
              style="width: 100%; margin-bottom: 16px; text-align: center; font-size: 16px;"
              min="0"
              ${isPercent ? 'max="100"' : ''}
              step="${isPercent ? '0.01' : '1'}"
            />
            <div class="row" style="justify-content: center; gap: 12px;">
              <button id="discount-cancel" class="secondary" style="background: #6b7280; color: white; border: none;">
                Cancelar
              </button>
              <button id="discount-apply" style="background: ${isPercent ? '#10b981' : '#3b82f6'}; color: white; border: none;">
                Aplicar Descuento
              </button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      modal.classList.remove('hidden');
      
      const input = modal.querySelector('#discount-input');
      const applyBtn = modal.querySelector('#discount-apply');
      const cancelBtn = modal.querySelector('#discount-cancel');
      
      input.focus();
      input.select();
      
      const closeModal = () => {
        modal.remove();
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
      const rows=[]; rowsBox.querySelectorAll('.tr:not([data-template])').forEach(r=>{
        const type=r.querySelector('select').value;
        const desc=r.querySelectorAll('input')[0].value;
        const qty =Number(r.querySelectorAll('input')[1].value||0);
        const price=Number(r.querySelectorAll('input')[2].value||0);
        if(!desc && !price && !qty) return;
        rows.push({
          type,desc,qty,price,
          source:r.dataset.source||undefined,
          refId:r.dataset.refId||undefined,
          sku:r.dataset.sku||undefined
        });
      }); return rows;
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
      rows.forEach(({type,desc,qty,price})=>{
        const q=qty>0?qty:1; const st=q*(price||0);
        const tipo=(type==='SERVICIO')?'Servicio':'Producto';
        const cantSuffix=(qty&&Number(qty)>0)?` x${q}`:'';
  lines.push(`• ${desc||tipo}${cantSuffix}`);
        lines.push(`${money(st)}`);
      });
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
      const rows=readRows(); let subP=0, subS=0;
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
      
      lblP.textContent=money(subP);
      lblS.textContent=money(subS);
      
      // Mostrar/ocultar sección de descuento
      if (discountValue > 0) {
        discountSection.style.display = 'block';
        discountAmount.textContent = money(discountValue);
        btnDiscountClear.style.display = 'inline-block';
      } else {
        discountSection.style.display = 'none';
        btnDiscountClear.style.display = 'none';
      }
      
      lblT.textContent=money(total);
      prevWA.textContent = buildWAText();
    }

    // ---- cargar datos ----
    iNumber.value = (doc?.number || '').toString().padStart(5,'0');
    iDatetime.value = doc?.createdAt ? new Date(doc.createdAt).toLocaleString() : todayIso();
    iName.value  = doc?.customer?.name  || '';
    iPhone.value = doc?.customer?.phone || '';
    iEmail.value = doc?.customer?.email || '';
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
              <span style="color:var(--success, #10b981);">✓</span> 
              <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
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
              <span style="color:var(--success, #10b981);">✓</span> 
              <strong>${vehicle.make} ${vehicle.line}</strong> - Cilindraje: ${vehicle.displacement}${vehicle.modelYear ? ` | Modelo: ${vehicle.modelYear}` : ''}
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
          mVehicleDropdown.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px;">No se encontraron vehículos</div>';
          mVehicleDropdown.style.display = 'block';
          return;
        }
        mVehicleDropdown.replaceChildren(...vehicles.map(v => {
          const div = document.createElement('div');
          div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);';
          div.innerHTML = `
            <div style="font-weight:600;">${v.make} ${v.line}</div>
            <div style="font-size:12px;color:var(--muted);">Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}</div>
          `;
          div.addEventListener('click', () => {
            selectedModalVehicle = v;
            if (mVehicleId) mVehicleId.value = v._id;
            if (mVehicleSearch) mVehicleSearch.value = `${v.make} ${v.line} ${v.displacement}`;
            if (mVehicleSelected) {
              mVehicleSelected.innerHTML = `
                <span style="color:var(--success, #10b981);">✓</span> 
                <strong>${v.make} ${v.line}</strong> - Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}
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
            div.style.background = 'var(--hover, rgba(0,0,0,0.05))';
          });
          div.addEventListener('mouseleave', () => {
            div.style.background = '';
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
    
    rowsBox.innerHTML='';
    (doc?.items||[]).forEach(it=>{
      addRowFromData({ type:(String(it.kind||'PRODUCTO').toUpperCase()==='SERVICIO'?'SERVICIO':'PRODUCTO'), desc:it.description||'', qty:it.qty??'', price:it.unitPrice||0, source:it.source, refId:it.refId, sku:it.sku });
    });
    if(!(doc?.items||[]).length) addRow();
    recalc();

    // ---- acciones ----
    btnAdd?.addEventListener('click',()=>{ addRow(); recalc(); });
    q('#m-close')?.addEventListener('click',()=> closeModal());
    
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
      const rows=readRows();
      const items = rows.map(r=>({ kind:r.type, description:r.desc, qty:r.qty, unitPrice:r.price, subtotal:(r.qty>0?r.qty:1)*(r.price||0) }));
      
      // Calcular descuento para PDF
      let discountValue = 0;
      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      if (currentDiscount.type === 'percent' && currentDiscount.value > 0) {
        discountValue = (subtotal * currentDiscount.value) / 100;
      } else if (currentDiscount.type === 'fixed' && currentDiscount.value > 0) {
        discountValue = currentDiscount.value;
      }
      
      exportPDFFromData({
        number: iNumber.value,
        datetime: iDatetime.value,
        customer: { name:iName.value, clientPhone:iPhone.value, email:iEmail.value },
        vehicle: { 
          vehicleId: mVehicleId?.value || null,
          make:iBrand.value, 
          line:iLine.value, 
          modelYear:iYear.value, 
          plate:iPlate.value, 
          displacement:iCc.value, 
          mileage:iMileage.value 
        },
        validity: iValid.value,
        specialNotes: [],
        items,
        discount: discountValue > 0 ? { value: discountValue, type: currentDiscount.type } : null
      }).catch(e=>alert(e?.message||'Error generando PDF'));
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
          customer:{ name:iName.value||'', phone:iPhone.value||'', email:iEmail.value||'' },
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
          specialNotes:[],
          discount: discountValue > 0 ? { 
            type: currentDiscount.type, 
            value: currentDiscount.value, 
            amount: discountValue 
          } : null,
          items: rows.map(r=>{
            const base={ kind:r.type, description:r.desc, qty:r.qty?Number(r.qty):null, unitPrice:Number(r.price||0) };
            if(r.source) base.source=r.source;
            if(r.refId) base.refId=r.refId;
            if(r.sku) base.sku=r.sku;
            return base;
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
    iDatetime.value = d?.createdAt ? new Date(d.createdAt).toLocaleString() : todayIso();

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

  function exportPDFFromDoc(d){
    exportPDFFromData({
      number:d.number,
      datetime:d.createdAt?new Date(d.createdAt).toLocaleString():todayIso(),
      customer:d.customer||{},
      vehicle:d.vehicle||{},
      validity:d.validity||'',
      specialNotes:d.specialNotes||[],
      items:(d.items||[]).map(it=>({
        ...it,
        subtotal:(it.qty && it.qty>0 ? it.qty : 1) * (it.unitPrice || 0)
      }))
    });
  }

  function openWAFromDoc(d){
    const subP=(d.items||[]).filter(i=>i.kind!=='SERVICIO').reduce((a,i)=>a+((i.qty||1)*(i.unitPrice||0)),0);
    const subS=(d.items||[]).filter(i=>i.kind==='SERVICIO').reduce((a,i)=>a+((i.qty||1)*(i.unitPrice||0)),0);
    const total=subP+subS;

    const prev = (()=>{
      const rows=(d.items||[]).map(it=>({
        type:it.kind==='SERVICIO'?'SERVICIO':'PRODUCTO',
        desc:it.description, qty:it.qty, price:it.unitPrice
      }));
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
    btnSaveBackend?.addEventListener('click',saveToBackend);
    
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
    modal.className = 'modal discount-modal';
    modal.style.cssText = 'position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 10001;';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 400px; text-align: center;">
        <div class="card">
          <h3 style="margin: 0 0 16px 0; color: var(--text);">${title}</h3>
          <p style="margin: 0 0 16px 0; color: var(--muted); font-size: 14px;">
            ${isPercent ? 'Ingrese el porcentaje de descuento' : 'Ingrese el monto de descuento'}
          </p>
          <input 
            id="discount-input" 
            type="number" 
            placeholder="${placeholder}"
            value="${currentValue}"
            style="width: 100%; margin-bottom: 16px; text-align: center; font-size: 16px;"
            min="0"
            ${isPercent ? 'max="100"' : ''}
            step="${isPercent ? '0.01' : '1'}"
          />
          <div class="row" style="justify-content: center; gap: 12px;">
            <button id="discount-cancel" class="secondary" style="background: #6b7280; color: white; border: none;">
              Cancelar
            </button>
            <button id="discount-apply" style="background: ${isPercent ? '#10b981' : '#3b82f6'}; color: white; border: none;">
              Aplicar Descuento
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    modal.classList.remove('hidden');
    
    const input = modal.querySelector('#discount-input');
    const applyBtn = modal.querySelector('#discount-apply');
    const cancelBtn = modal.querySelector('#discount-cancel');
    
    input.focus();
    input.select();
    
    const closeModal = () => {
      modal.remove();
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
              <div style="font-weight:600;">${pe.vehicleId.make} ${pe.vehicleId.line}</div>
              <div style="font-size:12px;color:var(--muted);">Cilindraje: ${pe.vehicleId.displacement}${pe.vehicleId.modelYear ? ` | Modelo: ${pe.vehicleId.modelYear}` : ''}</div>
            `;
          } else {
            vehicleCell.innerHTML = `
              <div>${pe.brand || ''} ${pe.line || ''}</div>
              <div style="font-size:12px;color:var(--muted);">${pe.engine || ''} ${pe.year || ''}</div>
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
    node.className = 'card';
    node.style.cssText = 'max-width:600px;margin:0 auto;';
    node.innerHTML = `
      <h3 style="margin-top:0;margin-bottom:24px;text-align:center;">Agregar items</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
        <button id="add-qr-btn" class="primary" style="padding:24px;border-radius:12px;font-size:16px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:8px;border:none;cursor:pointer;transition:all 0.2s;">
          <span style="font-size:48px;">📷</span>
          <span>Agregar QR</span>
        </button>
        <button id="add-manual-btn" class="secondary" style="padding:24px;border-radius:12px;font-size:16px;font-weight:600;display:flex;flex-direction:column;align-items:center;gap:8px;border:none;cursor:pointer;transition:all 0.2s;">
          <span style="font-size:48px;">✏️</span>
          <span>Agregar manual</span>
        </button>
      </div>
      <div style="text-align:center;">
        <button id="add-cancel-btn" class="secondary" style="padding:8px 24px;">Cancelar</button>
      </div>
    `;
    
    openModal(node);
    
    // Estilos hover para los botones
    const qrBtn = node.querySelector('#add-qr-btn');
    const manualBtn = node.querySelector('#add-manual-btn');
    const cancelBtn = node.querySelector('#add-cancel-btn');
    
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
    const currentVehicleId = iVehicleId?.value || null;
    let currentView = currentVehicleId ? 'prices' : 'inventory';
    
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
        openAddUnifiedForQuote();
      };
      
      // Renderizar contenido según la vista actual
      if (currentView === 'prices') {
        renderPricesViewForQuote(content, currentVehicleId);
      } else {
        renderInventoryViewForQuote(content);
      }
    }
    
    renderView();
  }

  // Vista de Lista de precios para cotizaciones
  async function renderPricesViewForQuote(container, vehicleId) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">Cargando...</div>';
    
    if (!vehicleId) {
      container.innerHTML = `
        <div style="text-align:center;padding:48px;">
          <div style="font-size:48px;margin-bottom:16px;">🚗</div>
          <h4 style="margin-bottom:8px;">No hay vehículo vinculado</h4>
          <p style="color:var(--muted);margin-bottom:16px;">Vincula un vehículo a la cotización para ver los precios disponibles.</p>
        </div>
      `;
      return;
    }
    
    try {
      const vehicle = await API.vehicles.get(vehicleId);
      const pricesData = await API.pricesList({ vehicleId, page: 1, limit: 10 });
      const prices = Array.isArray(pricesData?.items) ? pricesData.items : (Array.isArray(pricesData) ? pricesData : []);
      
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
          <h4 style="margin-bottom:8px;">Precios disponibles (${prices.length})</h4>
          <div id="prices-list" style="display:grid;gap:8px;"></div>
        </div>
      `;
      
      const pricesList = container.querySelector('#prices-list');
      
      if (prices.length === 0) {
        pricesList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);">No hay precios registrados para este vehículo.</div>';
      } else {
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
          
          card.querySelector('.add-price-btn').onclick = () => {
            if (pe.type === 'combo' && pe.comboProducts && pe.comboProducts.length > 0) {
              // Agregar el combo principal
              const comboRow = cloneRow();
              comboRow.querySelector('select').value = 'PRODUCTO';
              comboRow.querySelectorAll('input')[0].value = pe.name || '';
              comboRow.querySelectorAll('input')[1].value = 1;
              comboRow.querySelectorAll('input')[2].value = Math.round(pe.total || pe.price || 0);
              comboRow.dataset.source = 'price';
              if (pe._id) comboRow.dataset.refId = pe._id;
              updateRowSubtotal(comboRow);
              rowsBox.appendChild(comboRow);
              
              // Agregar cada producto del combo
              pe.comboProducts.forEach(cp => {
                const row = cloneRow();
                row.querySelector('select').value = 'PRODUCTO';
                // Para slots abiertos, solo mostrar el nombre (sin indicadores)
                row.querySelectorAll('input')[0].value = cp.name || '';
                row.querySelectorAll('input')[1].value = cp.qty || 1;
                row.querySelectorAll('input')[2].value = Math.round(cp.unitPrice || 0);
                row.dataset.source = cp.itemId ? 'inventory' : 'price';
                if (cp.itemId) row.dataset.refId = cp.itemId;
                if (cp.itemId && cp.sku) row.dataset.sku = cp.sku;
                // Marcar como item del combo
                if (pe._id) row.dataset.comboParent = pe._id;
                updateRowSubtotal(row);
                rowsBox.appendChild(row);
              });
            } else {
              // Item normal (servicio o producto)
              const row = cloneRow();
              row.querySelector('select').value = pe.type === 'product' ? 'PRODUCTO' : 'SERVICIO';
              row.querySelectorAll('input')[0].value = pe.name || '';
              row.querySelectorAll('input')[1].value = 1;
              row.querySelectorAll('input')[2].value = Math.round(pe.total || pe.price || 0);
              row.dataset.source = 'price';
              if (pe._id) row.dataset.refId = pe._id;
              updateRowSubtotal(row);
              rowsBox.appendChild(row);
            }
            recalcAll();
            saveDraft();
            closeModal();
          };
          
          pricesList.appendChild(card);
        });
      }
      
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

  // Vista de Inventario para cotizaciones
  async function renderInventoryViewForQuote(container) {
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
          
          card.querySelector('.add-inventory-btn').onclick = () => {
            const row = cloneRow();
            row.querySelector('select').value = 'PRODUCTO';
            row.querySelectorAll('input')[0].value = item.name || item.sku || '';
            row.querySelectorAll('input')[1].value = 1;
            row.querySelectorAll('input')[2].value = Math.round(item.salePrice || 0);
            row.dataset.source = 'inventory';
            if (item._id) row.dataset.refId = item._id;
            if (item.sku) row.dataset.sku = item.sku;
            updateRowSubtotal(row);
            rowsBox.appendChild(row);
            recalcAll();
            saveDraft();
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
    
    loadItems(true);
  }

  // Crear precio desde cotización (similar a createPriceFromSale)
  async function createPriceFromQuote(type, vehicleId, vehicle) {
    const node = document.createElement('div');
    node.className = 'card';
    node.style.cssText = 'max-width:600px;margin:0 auto;';
    
    const isCombo = type === 'combo';
    const isProduct = type === 'product';
    
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
                <span style="font-size:12px;"><strong style="font-weight:700;">SKU:</strong> <strong style="font-weight:700;">${item.sku}</strong> | Stock: ${item.stock || 0}</span>
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
  
  // Funcionalidad para combos (similar a createPriceFromSale)
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
        
        await API.priceCreate(payload);
        
        // Agregar el precio recién creado a la cotización
        const prices = await API.pricesList({ vehicleId, name, limit: 1 });
        if (prices && prices.length > 0) {
          const newPrice = prices[0];
          const row = cloneRow();
          row.querySelector('select').value = newPrice.type === 'product' ? 'PRODUCTO' : 'SERVICIO';
          row.querySelectorAll('input')[0].value = newPrice.name || '';
          row.querySelectorAll('input')[1].value = 1;
          row.querySelectorAll('input')[2].value = Math.round(newPrice.total || newPrice.price || 0);
          row.dataset.source = 'price';
          if (newPrice._id) row.dataset.refId = newPrice._id;
          updateRowSubtotal(row);
          rowsBox.appendChild(row);
          recalcAll();
          saveDraft();
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

  // ===== Agregar por QR (con cámara, igual que ventas) =====
  function openQRModalForQuote(){
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
        msg.style.color = 'var(--text)';
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
        msg.style.color = 'var(--danger, #ef4444)';
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
          msg.style.color = 'var(--danger, #ef4444)';
          setTimeout(() => {
            cameraDisabled = false;
          }, 2000);
          return;
        }
        const row=cloneRow();
        row.querySelector('select').value='PRODUCTO';
        row.querySelectorAll('input')[0].value=it.name||it.sku||text;
        row.querySelectorAll('input')[1].value=1;
        row.querySelectorAll('input')[2].value=Math.round(it.salePrice||0);
        row.dataset.source='inventory'; 
        if(it._id) row.dataset.refId=it._id; 
        if(it.sku) row.dataset.sku=it.sku;
        updateRowSubtotal(row); 
        rowsBox.appendChild(row); 
        recalcAll(); 
        saveDraft();
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
        msg.style.color = 'var(--danger, #ef4444)';
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
                    <span style="color:var(--success, #10b981);">✓</span> 
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
                    <span style="color:var(--success, #10b981);">✓</span> 
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



