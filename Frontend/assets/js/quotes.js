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
  const btnAddRow = $('#q-addRow');
  // Botón adicional QR
  const btnAddQR = document.getElementById('q-addQR');
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
    
    // Precio mínimo
    if (r.minPrice && r.minPrice > 0) {
      const minPriceInput = row.querySelector('.min-price-input');
      const minPriceBtn = row.querySelector('.min-price-btn');
      if (minPriceInput && minPriceBtn) {
        minPriceInput.value = r.minPrice;
        minPriceInput.style.display = 'block';
        minPriceBtn.style.display = 'none';
        
        // Añadir event listeners al precio mínimo cargado
        minPriceInput.addEventListener('input', () => {
          updateRowSubtotal(row);
          recalcAll();
        });
        
        minPriceInput.addEventListener('blur', () => {
          if (minPriceInput.value.trim() === '') {
            minPriceInput.style.display = 'none';
            minPriceBtn.style.display = 'block';
          }
        });
      }
    }
    
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
    const removeBtn = n.querySelector('button:not(.min-price-btn)');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        n.remove(); 
        recalcAll();
      });
    }
    
    // Funcionalidad del precio mínimo
    const minPriceBtn = n.querySelector('.min-price-btn');
    const minPriceInput = n.querySelector('.min-price-input');
    if (minPriceBtn && minPriceInput) {
      minPriceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (minPriceInput.style.display === 'none' || minPriceInput.style.display === '') {
          minPriceInput.style.display = 'block';
          minPriceBtn.style.display = 'none';
          minPriceInput.focus();
        }
      });
      
      minPriceInput.addEventListener('blur', () => {
        if (minPriceInput.value.trim() === '') {
          minPriceInput.style.display = 'none';
          minPriceBtn.style.display = 'block';
        }
      });
      
      minPriceInput.addEventListener('input', () => {
        updateRowSubtotal(n);
        recalcAll();
      });
      
      // Prevenir que el click en el input elimine la fila
      minPriceInput.addEventListener('click', (e) => {
        e.stopPropagation();
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
      const minPriceInput = r.querySelector('.min-price-input');
      const minPrice = minPriceInput ? Number(minPriceInput.value||0) : undefined;
      if(!desc && !price && !qty) return;
      rows.push({
        type,desc,qty,price,
        minPrice: minPrice || undefined,
        source: r.dataset.source || undefined,
        refId: r.dataset.refId || undefined,
        sku: r.dataset.sku || undefined
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
    
    lines.push(`Valores SIN IVA`);
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
      vehicle:{ make:iBrand.value, line:iLine.value, modelYear:iYear.value, plate:iPlate.value, displacement:iCc.value, mileage:iMileage.value },
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
    d.text('Valores SIN IVA', left, y); y += 14;
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
      if(r.minPrice && r.minPrice > 0){ base.minPrice=Number(r.minPrice); }
      return base;
    });
    return {
      customer:{ name:iClientName.value||'', phone:iClientPhone.value||'', email:iClientEmail.value||'' },
      vehicle:{ plate:iPlate.value||'', make:iBrand.value||'', line:iLine.value||'', modelYear:iYear.value||'', displacement:iCc.value||'', mileage:iMileage.value||'' },
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
        <div class="row">
          <input id="m-brand" placeholder="Marca" />
          <input id="m-line" placeholder="Línea/Modelo" />
        </div>
        <div class="row">
          <input id="m-year" placeholder="Año" />
          <input id="m-cc" placeholder="Cilindraje" />
        </div>
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
              <label class="sr-only">Precio mínimo</label>
              <input type="number" min="0" step="0.01" placeholder="Precio mín." class="min-price-input" style="display: none; width: 100%;" />
              <button type="button" class="secondary min-price-btn" style="font-size: 11px; padding: 6px 10px; width: 100%; border-radius: 4px; background: #6c757d; color: white; border: none; cursor: pointer; transition: background 0.2s ease;">Precio mín.</button>
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
      const removeBtn = n.querySelector('button:not(.min-price-btn)');
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
      lines.push(`Valores SIN IVA`);
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
      addRowFromData({ type:(String(it.kind||'PRODUCTO').toUpperCase()==='SERVICIO'?'SERVICIO':'PRODUCTO'), desc:it.description||'', qty:it.qty??'', price:it.unitPrice||0, minPrice:it.minPrice||0, source:it.source, refId:it.refId, sku:it.sku });
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
        vehicle: { make:iBrand.value, line:iLine.value, modelYear:iYear.value, plate:iPlate.value, displacement:iCc.value, mileage:iMileage.value },
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
          vehicle:{ plate:iPlate.value||'', make:iBrand.value||'', line:iLine.value||'', modelYear:iYear.value||'', displacement:iCc.value||'', mileage:iMileage.value||'' },
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
        minPrice:it.minPrice||0,
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
    btnAddRow?.addEventListener('click',()=>{ addRow(); recalcAll(); });
    // QR
    btnAddQR?.addEventListener('click', openQRModalForQuote);
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
      <div class="row">
        <input id="qp-brand" placeholder="Marca" />
  <input id="qp-line" placeholder="Línea" />
        <button id="qp-search" class="secondary">Buscar</button>
      </div>
      <div class="table-wrap" style="max-height:320px;overflow:auto;margin-top:8px;">
  <table class="table compact"><thead><tr><th>Marca</th><th>Línea</th><th>Motor</th><th>Año</th><th class="t-right">Precio</th><th></th></tr></thead><tbody id="qp-body"></tbody></table>
      </div>`;
    openModal(node);
    const body=node.querySelector('#qp-body');
    async function load(){
      const brand=node.querySelector('#qp-brand').value.trim();
      const line=node.querySelector('#qp-line').value.trim();
      body.innerHTML='<tr><td colspan="6">Cargando...</td></tr>';
      try{
        const rows=await API.pricesList({ brand,line,limit:25 });
        body.innerHTML='';
        rows.forEach(pe=>{
          const price=Number(pe.total||pe.price||0);
          const tr=document.createElement('tr');
          tr.innerHTML=`<td>${pe.brand||''}</td><td>${pe.line||''}</td><td>${pe.engine||''}</td><td>${pe.year||''}</td><td class="t-right">${money(price)}</td><td class="t-right"><button class="secondary add">Agregar</button></td>`;
          tr.querySelector('button.add').onclick=()=>{
            const row=cloneRow();
            row.querySelector('select').value='SERVICIO';
            row.querySelectorAll('input')[0].value=`${pe.brand||''} ${pe.line||''} ${pe.engine||''} ${pe.year||''}`.trim();
            row.querySelectorAll('input')[1].value=1;
            row.querySelectorAll('input')[2].value=Math.round(price||0);
            row.dataset.source='price'; if(pe._id) row.dataset.refId=pe._id;
            updateRowSubtotal(row); rowsBox.appendChild(row); recalcAll(); saveDraft();
          };
          body.appendChild(tr);
        });
        if(!rows.length) body.innerHTML='<tr><td colspan="6">Sin resultados</td></tr>';
      }catch(e){ body.innerHTML=`<tr><td colspan="6">Error: ${e.message}</td></tr>`; }
    }
    node.querySelector('#qp-search').onclick=load; load();
  }

  // ===== Agregar por QR (simple: ingresar código -> tratar como SKU inventario) =====
  function openQRModalForQuote(){
    const node=document.createElement('div'); node.className='card';
    node.innerHTML=`<h3>Agregar por QR</h3>
  <p>Escanea el código QR y pega el texto o ingrésalo manualmente.</p>
  <input id="qr-code" placeholder="Código / SKU" style="width:100%;margin-bottom:8px;" />
      <div class="row">
        <input id="qr-qty" type="number" min="1" step="1" value="1" style="max-width:120px;" />
        <button id="qr-add" class="secondary">Agregar</button>
        <button id="qr-close" class="secondary">Cerrar</button>
      </div>
      <div id="qr-status" class="meta"></div>`;
    openModal(node);
    const inp=node.querySelector('#qr-code');
    const qty=node.querySelector('#qr-qty');
    const status=node.querySelector('#qr-status');
    node.querySelector('#qr-close').onclick=()=>closeModal();
    async function add(){
      const code=(inp.value||'').trim(); if(!code){ inp.focus(); return; }
      status.textContent='Buscando...';
      try{
        // Reutilizamos API.inventory.itemsList filtrando por sku exacto (limit 1)
        const items=await API.inventory.itemsList({ sku:code, limit:1 });
        const it=items[0];
        if(!it){ status.textContent='No encontrado en inventario.'; return; }
        const row=cloneRow();
        row.querySelector('select').value='PRODUCTO';
        row.querySelectorAll('input')[0].value=it.name||it.sku||code;
        row.querySelectorAll('input')[1].value=Number(qty.value||1);
        row.querySelectorAll('input')[2].value=Math.round(it.salePrice||0);
        row.dataset.source='inventory'; if(it._id) row.dataset.refId=it._id; if(it.sku) row.dataset.sku=it.sku;
        updateRowSubtotal(row); rowsBox.appendChild(row); recalcAll(); saveDraft();
        status.textContent='Agregado.';
        inp.value=''; qty.value='1'; inp.focus();
      }catch(e){ status.textContent='Error: '+(e?.message||e); }
    }
    node.querySelector('#qr-add').onclick=add;
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); add(); }});
    setTimeout(()=>inp.focus(),50);
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
    function applyProfile(prof){
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



