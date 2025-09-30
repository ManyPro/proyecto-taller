/* assets/js/quotes.js
   Cotizaciones:
   - Numeración local por empresa (para UI)
   - Borrador local
   - Ítems dinámicos (2 columnas)
   - Vista previa WhatsApp
   - WhatsApp / PDF
   - Historial (listar/buscar/ver/editar/eliminar; re-enviar WA; re-generar PDF)
*/
import { API } from "./api.js";

export function initQuotes({ getCompanyEmail }) {
  // ====== Helpers DOM ======
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ====== Estado ======
  let inited = false;
  let emailScope = '';       // para scoping del localStorage
  let currentQuoteId = null; // si estamos editando una del historial

  const KEYS = (window.QUOTES_KEYS || {
    lastNumber: 'quotes:lastNumber',
    draft: 'quotes:current',
  });

  // ====== Nodos ======
  const tab = $('#tab-cotizaciones');

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

  const iValidDays = $('#q-valid-days');

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
  // Botones adicionales (se crean dinámicamente)
  let btnAddFromInv = null;
  let btnAddFromPrice = null;
  const lblSubtotalProducts = $('#q-subtotal-products');
  const lblSubtotalServices = $('#q-subtotal-services');
  const lblTotal = $('#q-total');

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

    emailScope = (getCompanyEmail?.()||'').trim().toLowerCase();

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
      plate:iPlate.value, brand:iBrand.value, line:iLine.value, year:iYear.value, cc:iCc.value,
      validDays:iValidDays.value, rows:readRows()
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
      iYear.value  = d.year  || ''; iCc.value   = d.cc   || '';
      iValidDays.value = d.validDays || '';
      clearRows(); (d.rows||[]).forEach(addRowFromData);
    }catch{}
  }
  function clearDraft(){ localStorage.removeItem(kDraft()); }

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
    n.querySelector('button')?.addEventListener('click',()=>{ n.remove(); recalcAll(); });
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
    const total=subP+subS;
    lblSubtotalProducts.textContent=money(subP);
    lblSubtotalServices.textContent=money(subS);
    lblTotal.textContent=money(total);
    previewWA.textContent=buildWhatsAppText(rows,subP,subS,total);
    syncSummaryHeight();
  }

  function buildWhatsAppText(rows,subP,subS,total){
    const num=iNumber.value;
    const cliente=iClientName.value||'—';
    const veh=`${iBrand.value||''} ${iLine.value||''} ${iYear.value||''}`.trim();
    const placa=iPlate.value||'—'; const cc=iCc.value||'—';
    const val=iValidDays.value?`\nValidez: ${iValidDays.value} días`:'';
    const lines=[];
    lines.push(`*Cotización ${num}*`);
    lines.push(`Cliente: ${cliente}`);
    lines.push(`Vehículo: ${veh} — Placa: ${placa} — Cilindraje: ${cc}`);
    lines.push('');
    rows.forEach(({type,desc,qty,price})=>{
      const q=qty>0?qty:1; const st=q*(price||0);
      const tipo=(type==='SERVICIO')?'Servicio':'Producto';
      const cantSuffix=(qty&&Number(qty)>0)?` x${q}`:'';
      lines.push(`● ${desc||tipo}${cantSuffix}`);
      lines.push(`${money(st)}`);
    });
    lines.push('');
    lines.push(`Subtotal Productos: ${money(subP)}`);
    lines.push(`Subtotal Servicios: ${money(subS)}`);
    lines.push(`*TOTAL: ${money(total)}*`);
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
    await exportPDFFromData({
      number:iNumber.value,
      datetime:iDatetime.value||todayIso(),
      customer:{ name:iClientName.value,clientPhone:iClientPhone.value, email:iClientEmail.value },
      vehicle:{ make:iBrand.value, line:iLine.value, modelYear:iYear.value, plate:iPlate.value, displacement:iCc.value },
      validity:iValidDays.value,
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
    const tot  = subP + subS;

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
    d.text(`Cilindraje: ${doc.vehicle?.displacement || '—'}`, left, 245);

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
    d.setFont('helvetica','italic'); d.setFontSize(10);
    d.text('Valores SIN IVA', left, y); y += 14;
    if(doc.validity) d.text(`Validez: ${doc.validity} días`, left, y);

    d.setFont('helvetica','bold'); d.setFontSize(11);
    d.text(`TOTAL: ${money(tot)}`, pageW - right, d.lastAutoTable.finalY + 18, { align:'right' });

    const footY = (doc.validity ? y + 28 : d.lastAutoTable.finalY + 36);
    d.setFont('helvetica','normal'); d.setFontSize(9);
    d.text('Calle 69° No. 87-39 • Cel: 301 205 9320 • Bogotá D.C • Contacto: HUGO MANRIQUE 311 513 1603', left, footY);

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
      vehicle:{ plate:iPlate.value||'', make:iBrand.value||'', line:iLine.value||'', modelYear:iYear.value||'', displacement:iCc.value||'' },
      validity:iValidDays.value||'',
      items
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
              <button class="secondary">Quitar</button>
            </div>
          </div>
        </div>
        <div class="row">
          <button id="m-addRow">+ Agregar línea</button>
        </div>
        <div class="totals">
          <div>Subtotal Productos: <strong id="m-subP">$0</strong></div>
          <div>Subtotal Servicios: <strong id="m-subS">$0</strong></div>
          <div>Total: <strong id="m-total">$0</strong></div>
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

    function cloneRow(){
      const n = rowTpl.cloneNode(true);
      n.classList.remove('hidden'); n.removeAttribute('id'); n.removeAttribute('data-template');
      n.querySelectorAll('input,select').forEach(el=>{
        el.addEventListener('input',()=>{ updateRowSubtotal(n); recalc(); });
      });
      n.querySelector('button')?.addEventListener('click',()=>{ n.remove(); recalc(); });
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
      const total=subP+subS;
      const lines=[];
      const veh = `${iBrand.value||''} ${iLine.value||''} ${iYear.value||''}`.trim();
      const val = iValid.value ? `\nValidez: ${iValid.value} días` : '';
      lines.push(`*Cotización ${iNumber.value || '—'}*`);
      lines.push(`Cliente: ${iName.value||'—'}`);
      lines.push(`Vehículo: ${veh} — Placa: ${iPlate.value||'—'} — Cilindraje: ${iCc.value||'—'}`);
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
      const total=subP+subS;
      lblP.textContent=money(subP);
      lblS.textContent=money(subS);
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
    iValid.value = doc?.validity || '';
    rowsBox.innerHTML='';
    (doc?.items||[]).forEach(it=>{
      addRowFromData({ type:(String(it.kind||'PRODUCTO').toUpperCase()==='SERVICIO'?'SERVICIO':'PRODUCTO'), desc:it.description||'', qty:it.qty??'', price:it.unitPrice||0, source:it.source, refId:it.refId, sku:it.sku });
    });
    if(!(doc?.items||[]).length) addRow();
    recalc();

    // ---- acciones ----
    btnAdd?.addEventListener('click',()=>{ addRow(); recalc(); });
    q('#m-close')?.addEventListener('click',()=> closeModal());
    q('#m-wa')?.addEventListener('click',()=>{
      const text = buildWAText(); if(!text.trim()) return; window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank');
    });
    q('#m-pdf')?.addEventListener('click',()=>{
      const rows=readRows();
      const items = rows.map(r=>({ kind:r.type, description:r.desc, qty:r.qty, unitPrice:r.price, subtotal:(r.qty>0?r.qty:1)*(r.price||0) }));
      exportPDFFromData({
        number: iNumber.value,
        datetime: iDatetime.value,
        customer: { name:iName.value, clientPhone:iPhone.value, email:iEmail.value },
        vehicle: { make:iBrand.value, line:iLine.value, modelYear:iYear.value, plate:iPlate.value, displacement:iCc.value },
        validity: iValid.value,
        items
      }).catch(e=>alert(e?.message||'Error generando PDF'));
    });
    q('#m-save')?.addEventListener('click', async ()=>{
      try{
        const rows=readRows();
        const payload = {
          customer:{ name:iName.value||'', phone:iPhone.value||'', email:iEmail.value||'' },
          vehicle:{ plate:iPlate.value||'', make:iBrand.value||'', line:iLine.value||'', modelYear:iYear.value||'', displacement:iCc.value||'' },
          validity:iValid.value||'',
          items: rows.map(r=>{
            const base={ kind:r.type, description:r.desc, qty:r.qty?Number(r.qty):null, unitPrice:Number(r.price||0) };
            if(r.source) base.source=r.source;
            if(r.refId) base.refId=r.refId;
            if(r.sku) base.sku=r.sku;
            return base;
          })
        };
        await API.quotePatch(doc._id, payload);
        toast('Cotización actualizada.');
        loadHistory();
      }catch(e){ alert(e?.message||'No se pudo guardar'); }
    });

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

    iValidDays.value = d?.validity || '';

    clearRows();
    (d?.items||[]).forEach(it=>{
      const k=String(it.kind||'Producto').trim().toUpperCase();
      addRowFromData({
        type:(k==='SERVICIO'?'SERVICIO':'PRODUCTO'),
        desc:it.description||'',
        qty:it.qty??'',
        price:it.unitPrice||0
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
      const bak={ n:iNumber.value, c:iClientName.value, b:iBrand.value, l:iLine.value, y:iYear.value, p:iPlate.value, cc:iCc.value, v:iValidDays.value };
      iNumber.value=d.number||iNumber.value;
      iClientName.value=d.customer?.name||'';
      iBrand.value=d.vehicle?.make||''; iLine.value=d.vehicle?.line||''; iYear.value=d.vehicle?.modelYear||''; iPlate.value=d.vehicle?.plate||''; iCc.value=d.vehicle?.displacement||''; iValidDays.value=d.validity||'';
      const text=buildWhatsAppText(rows,subP,subS,total);
      iNumber.value=bak.n; iClientName.value=bak.c; iBrand.value=bak.b; iLine.value=bak.l; iYear.value=bak.y; iPlate.value=bak.p; iCc.value=bak.cc; iValidDays.value=bak.v;
      return text;
    })();

    window.open(`https://wa.me/?text=${encodeURIComponent(prev)}`,'_blank');
  }

  // ===== Reset de formulario (post-crear) =====
  function resetQuoteForm(){
    [iClientName,iClientPhone,iClientEmail,iPlate,iBrand,iLine,iYear,iCc,iValidDays].forEach(i=>{ if(i) i.value=''; });
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
    // Crear botones de selección desde inventario y lista de precios (solo una vez)
    if(btnAddRow && !btnAddRow.dataset.enhanced){
      btnAddRow.dataset.enhanced='1';
      btnAddFromInv = document.createElement('button');
      btnAddFromInv.type='button'; btnAddFromInv.className='secondary'; btnAddFromInv.textContent='Desde inventario';
      btnAddFromPrice = document.createElement('button');
      btnAddFromPrice.type='button'; btnAddFromPrice.className='secondary'; btnAddFromPrice.textContent='Desde lista de precios';
      const container = btnAddRow.parentElement || rowsBox.parentElement;
      if(container){
        container.appendChild(btnAddFromInv);
        container.appendChild(btnAddFromPrice);
      }
      btnAddFromInv.addEventListener('click', openPickerInventoryForQuote);
      btnAddFromPrice.addEventListener('click', openPickerPricesForQuote);
    }
    iSaveDraft?.addEventListener('click',saveDraft);
    btnWA?.addEventListener('click',openWhatsApp);
    btnPDF?.addEventListener('click',()=>{ exportPDF().catch(err=>alert(err?.message||err)); });
    btnSaveBackend?.addEventListener('click',saveToBackend);
    btnClear?.addEventListener('click',()=>{
      if(!confirm('¿Borrar todo el contenido de la cotización actual?')) return;
      [iClientName,iClientPhone,iClientEmail,iPlate,iBrand,iLine,iYear,iCc,iValidDays].forEach(i=>i.value='');
      clearRows(); addRow(); recalcAll(); clearDraft(); currentQuoteId=null;
    });

    [iClientName,iClientPhone,iClientEmail,iPlate,iBrand,iLine,iYear,iCc,iValidDays].forEach(el=>el?.addEventListener('input',recalcAll));

    qhApply?.addEventListener('click',loadHistory);
    qhClear?.addEventListener('click',()=>{ qhText.value=''; qhFrom.value=''; qhTo.value=''; loadHistory(); });
  }

  // ====== Pickers para agregar ítems con metadata ======
  async function openPickerInventoryForQuote(){
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

  // ===== Altura panel derecho =====
  function syncSummaryHeight(){
    if(!qData || !qSummary) return;
    const h=qData.offsetHeight; if(h){ qSummary.style.maxHeight=h+'px'; qSummary.style.overflowY='auto'; }
  }

  // Hook: tab activada
  function onTabActivated(){ ensureInit(); }
  document.addEventListener('click',(ev)=>{
    const btn=ev.target.closest('button[data-tab]'); if(!btn) return;
    if(btn.dataset.tab==='cotizaciones') onTabActivated();
  });
  if(tab && document.querySelector('.tabs button[data-tab="cotizaciones"]')?.classList.contains('active')) onTabActivated();
  // Observa cambios de clase en el botón para recargar historial al re-entrar a la pestaña
  try {
    const btnQuotes = document.querySelector('.tabs button[data-tab="cotizaciones"]');
    if(btnQuotes && window.MutationObserver){
      const obs = new MutationObserver(()=>{
        if(btnQuotes.classList.contains('active')) {
          console.debug('[quotes] tab activated -> refreshing history');
          ensureInit();
          loadHistory();
        }
      });
      obs.observe(btnQuotes, { attributes:true, attributeFilter:['class'] });
    }
  } catch {}
}
