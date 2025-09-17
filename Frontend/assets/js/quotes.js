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

  const iClientName = $('#q-client-name');
  const iClientPhone = $('#q-client-phone');
  const iClientEmail = $('#q-client-email');

  const iPlate = $('#q-plate');
  const iBrand = $('#q-brand');
  const iLine = $('#q-line');
  const iYear = $('#q-year');
  const iCc = $('#q-cc');

  const iValidDays = $('#q-valid-days');

  // Botones cabecera/acciones
  const iSaveDraft = $('#q-saveDraft');
  const btnClear = $('#q-clearAll');
  const btnWA = $('#q-sendWhatsApp');
  const btnPDF = $('#q-exportPdf');
  const btnSaveBackend = $('#q-saveBackend');

  // Ítems
  const rowsBox = $('#q-rows');
  const rowTemplate = $('#q-row-template');
  const btnAddRow = $('#q-addRow');
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
  const qhTo = $('#qh-to');
  const qhApply = $('#qh-apply');
  const qhClear = $('#qh-clear');
  const qhList = $('#q-history-list');

  // ====== Utils ======
  const pad5 = (n) => String(n).padStart(5, '0');
  const money = (n) => {
    const x = Math.round(Number(n || 0));
    return '$' + x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  const parseMoney = (str) => Number((str || '').replace(/\D+/g, '') || 0);
  const todayIso = () => {
    try {
      return (window.dayjs ? window.dayjs() : new Date()).format
        ? window.dayjs().format('YYYY-MM-DD HH:mm')
        : new Date().toLocaleString();
    } catch { return new Date().toLocaleString(); }
  };
  const toast = (m) => console.log(m);

  // keys por empresa
  const kLast = () => `${KEYS.lastNumber}:${emailScope}`;
  const kDraft = () => `${KEYS.draft}:${emailScope}`;

  // ====== Init ======
  function ensureInit() {
    if (inited) return;
    inited = true;

    emailScope = (getCompanyEmail?.() || '').trim().toLowerCase();

    iNumber.value = nextNumber();
    iNumberBig.textContent = iNumber.value;
    iDatetime.value = todayIso();

    clearRows();
    addRow();
    loadDraft();
    recalcAll();
    bindUI();

    // Altura sincrónica del panel derecho
    syncSummaryHeight();
    window.addEventListener('resize', syncSummaryHeight);

    // Primer fetch de historial
    loadHistory();
  }

  // ====== Numeración local ======
  function nextNumber() {
    const raw = localStorage.getItem(kLast());
    let n = Number(raw || 0);
    n = isNaN(n) ? 0 : n;
    return pad5(n + 1);
  }
  function advanceNumber() {
    const shown = Number(iNumber.value || '1');
    localStorage.setItem(kLast(), String(shown));
  }

  // ====== Borrador local ======
  function getDraftData() {
    return {
      number: iNumber.value, datetime: iDatetime.value,
      clientName: iClientName.value, clientPhone: iClientPhone.value, clientEmail: iClientEmail.value,
      plate: iPlate.value, brand: iBrand.value, line: iLine.value, year: iYear.value, cc: iCc.value,
      validDays: iValidDays.value, rows: readRows()
    };
  }
  function saveDraft() {
    localStorage.setItem(kDraft(), JSON.stringify(getDraftData()));
    toast('Borrador guardado.');
  }
  function loadDraft() {
    const raw = localStorage.getItem(kDraft());
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      iNumber.value = d.number || iNumber.value;
      iNumberBig.textContent = iNumber.value;
      iDatetime.value = d.datetime || iDatetime.value;
      iClientName.value = d.clientName || '';
      iClientPhone.value = d.clientPhone || '';
      iClientEmail.value = d.clientEmail || '';
      iPlate.value = d.plate || '';
      iBrand.value = d.brand || '';
      iLine.value = d.line || '';
      iYear.value = d.year || '';
      iCc.value = d.cc || '';
      iValidDays.value = d.validDays || '';
      clearRows(); (d.rows || []).forEach(addRowFromData);
    } catch { }
  }
  function clearDraft() { localStorage.removeItem(kDraft()); }

  // ====== Filas ======
  function clearRows() { rowsBox.innerHTML = ''; }
  function addRowFromData(r) {
    const row = cloneRow();
    row.querySelector('select').value = r.type || 'PRODUCTO';
    row.querySelectorAll('input')[0].value = r.desc || '';
    row.querySelectorAll('input')[1].value = r.qty || '';
    row.querySelectorAll('input')[2].value = r.price || '';
    updateRowSubtotal(row);
    rowsBox.appendChild(row);
  }
  function addRow() {
    const row = cloneRow();
    rowsBox.appendChild(row);
  }
  function cloneRow() {
    const n = rowTemplate.cloneNode(true);
    n.classList.remove('hidden'); n.removeAttribute('id'); n.removeAttribute('data-template');
    n.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('input', () => { updateRowSubtotal(n); recalcAll(); });
    });
    n.querySelector('button')?.addEventListener('click', () => { n.remove(); recalcAll(); });
    return n;
  }
  function readRows() {
    const rows = [];
    rowsBox.querySelectorAll('.tr:not([data-template])').forEach((r) => {
      const type = r.querySelector('select').value;
      const desc = r.querySelectorAll('input')[0].value;
      const qty = Number(r.querySelectorAll('input')[1].value || 0);
      const price = Number(r.querySelectorAll('input')[2].value || 0);
      if (!desc && !price && !qty) return;
      rows.push({ type, desc, qty, price });
    });
    return rows;
  }
  function updateRowSubtotal(r) {
    const qty = Number(r.querySelectorAll('input')[1].value || 0);
    const price = Number(r.querySelectorAll('input')[2].value || 0);
    const subtotal = (qty > 0 ? qty : 1) * (price || 0);
    r.querySelectorAll('input')[3].value = money(subtotal);
  }

  // ====== Totales & Preview ======
  function recalcAll() {
    const rows = readRows();
    let subP = 0, subS = 0;
    rows.forEach(({ type, qty, price }) => {
      const q = qty > 0 ? qty : 1;
      const st = q * (price || 0);
      if ((type || 'PRODUCTO') === 'PRODUCTO') subP += st; else subS += st;
    });
    const total = subP + subS;
    lblSubtotalProducts.textContent = money(subP);
    lblSubtotalServices.textContent = money(subS);
    lblTotal.textContent = money(total);
    previewWA.textContent = buildWhatsAppText(rows, subP, subS, total);
    syncSummaryHeight();
  }

  function buildWhatsAppText(rows, subP, subS, total) {
    const num = iNumber.value;
    const cliente = iClientName.value || '—';
    const veh = `${iBrand.value || ''} ${iLine.value || ''} ${iYear.value || ''}`.trim();
    const placa = iPlate.value || '—';
    const cc = iCc.value || '—';
    const val = iValidDays.value ? `\nValidez: ${iValidDays.value} días` : '';
    const lines = [];
    lines.push(`*Cotización ${num}*`);
    lines.push(`Cliente: ${cliente}`);
    lines.push(`Vehículo: ${veh} — Placa: ${placa} — Cilindraje: ${cc}`);
    lines.push('');
    rows.forEach(({ type, desc, qty, price }) => {
      const q = qty > 0 ? qty : 1;
      const st = q * (price || 0);
      const tipo = (type === 'SERVICIO') ? 'Servicio' : 'Producto';
      const cantSuffix = (qty && Number(qty) > 0) ? ` x${q}` : '';
      lines.push(`✅ ${desc || tipo}${cantSuffix}`);
      lines.push(`${money(st)}`);
    });
    lines.push('');
    lines.push(`Subtotal Productos: ${money(subP)}`);
    lines.push(`Subtotal Servicios: ${money(subS)}`);
    lines.push(`*TOTAL: ${money(total)}*`);
    lines.push(`Valores SIN IVA`);
    lines.push(val.trim());
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  // ====== PDF (desde UI) ======
  function exportPDF() {
    exportPDFFromData({
      number: iNumber.value,
      datetime: iDatetime.value || todayIso(),
      customer: { name: iClientName.value, email: iClientEmail.value },
      vehicle: { make: iBrand.value, line: iLine.value, modelYear: iYear.value, plate: iPlate.value, displacement: iCc.value },
      validity: iValidDays.value,
      items: readRows().map(r => ({
        kind: r.type, description: r.desc, qty: r.qty, unitPrice: r.price,
        subtotal: (r.qty > 0 ? r.qty : 1) * (r.price || 0)
      })),
      totals: {
        subP: parseMoney(lblSubtotalProducts.textContent),
        subS: parseMoney(lblSubtotalServices.textContent),
        total: parseMoney(lblTotal.textContent)
      }
    });
    // >>> YA NO avanzamos ni tocamos el correlativo aquí.
    // >>> Tampoco borramos el borrador: el usuario puede seguir editando tras exportar.
    syncSummaryHeight();
  }

  function exportPDFFromData(doc) {
    const rows = (doc.items || []).map(it => [
      (it.kind === 'SERVICIO') ? 'Servicio' : 'Producto',
      it.description || '',
      it.qty && it.qty > 0 ? it.qty : 1,
      money(it.unitPrice || 0),
      money(it.subtotal || ((it.qty || 1) * (it.unitPrice || 0)))
    ]);
    const subP = (doc.items || []).filter(i => i.kind !== 'SERVICIO').reduce((a, i) => a + (i.subtotal || 0), 0);
    const subS = (doc.items || []).filter(i => i.kind === 'SERVICIO').reduce((a, i) => a + (i.subtotal || 0), 0);
    const tot = subP + subS;

    // === DETECCIÓN CORRECTA (UMD) ===
    const jsPDFClass = window.jspdf?.jsPDF;
    if (!jsPDFClass) { alert('No se encontró jsPDF.'); return; }
    const d = new jsPDFClass('p', 'pt', 'a4');
    if (typeof d.autoTable !== 'function') { alert('No se encontró AutoTable.'); return; }

    // Encabezado / branding
    const gold = '#d4c389';
    d.setFont('helvetica', 'bold'); d.setTextColor(gold); d.setFontSize(22);
    d.text('CASA RENAULT H&H', 60, 60);

    // Sello amarillo "RENAULT"
    d.setFillColor('#ffcc00'); d.rect(470, 35, 32, 32, 'F');
    d.setFontSize(8); d.setTextColor('#000'); d.text('RENAULT', 486, 55, { angle: 90 });

    d.setFontSize(16); d.setTextColor('#000'); d.text('COTIZACIÓN', 440, 90);

    // Marca de agua (con fallback si no hay GState)
    const supportsOpacity = !!(d.saveGraphicsState && d.setGState && d.GState);
    if (supportsOpacity) {
      d.saveGraphicsState();
      d.setGState(new d.GState({ opacity: 0.06 }));
      d.setFont('helvetica', 'bold'); d.setFontSize(120); d.setTextColor('#000');
      d.text('RENAULT', 140, 360, { angle: -12 });
      d.restoreGraphicsState();
    } else {
      d.setFont('helvetica', 'bold'); d.setFontSize(110); d.setTextColor(220);
      d.text('RENAULT', 140, 360, { angle: -12 });
      d.setTextColor('#000');
    }

    // Bloques de info
    d.setFontSize(10); d.setFont('helvetica', 'normal');
    const leftInfo = [
      'CASA RENAULT H&H — Servicio Automotriz',
      'Nit: 901717790-7 • Bogotá D.C',
      `No. Cotización: ${doc.number || '—'}`,
      `Cliente: ${doc.customer?.name || '—'}`,
      `Vehículo: ${[doc.vehicle?.make, doc.vehicle?.line, doc.vehicle?.modelYear].filter(Boolean).join(' ')} —  Placa: ${doc.vehicle?.plate || '—'}`,
      `Cilindraje: ${doc.vehicle?.displacement || '—'}`
    ];
    const rightInfo = [
      `Fecha: ${doc.datetime || todayIso()}`,
      `Tel: 311 555 0012 • Email: ${doc.customer?.email || 'contacto@ejemplo.com'}`
    ];
    leftInfo.forEach((t, i) => d.text(t, 60, 120 + i * 14));
    rightInfo.forEach((t, i) => d.text(t, 370, 120 + i * 14));

    // Tabla
    d.autoTable({
      startY: 200,
      head: [['Tipo', 'Descripción', 'Cant.', 'Precio unit.', 'Subtotal']],
      body: rows,
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [230, 230, 230], textColor: 0 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 260 },             // descripción amplia y con wrap
        2: { cellWidth: 50, halign: 'right' },
        3: { cellWidth: 90, halign: 'right' },
        4: { cellWidth: 90, halign: 'right' }
      }
    });

    // Totales
    let y = d.lastAutoTable.finalY + 16;
    d.text(`Subtotal Productos: ${money(subP)}`, 60, y); y += 14;
    d.text(`Subtotal Servicios: ${money(subS)}`, 60, y); y += 14;
    d.setFont('helvetica', 'bold'); d.text(`TOTAL: ${money(tot)}`, 60, y); y += 18;
    d.setFont('helvetica', 'normal'); d.text('Valores SIN IVA', 60, y);
    if (doc.validity) d.text(`Validez: ${doc.validity} días`, 180, y);

    // Pie
    y += 28; d.setFontSize(9);
    d.text('Calle 69° No. 87-39 • Cel: 301 205 9320 • Bogotá D.C • Contacto: HUGO MANRIQUE 311 513 1603', 60, y);

    d.save(`cotizacion_${doc.number || 'sin_numero'}.pdf`);
  }

  // ====== WhatsApp (desde UI) ======
  function openWhatsApp() {
    const text = previewWA.textContent || '';
    if (!text.trim()) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    // >>> YA NO avanzamos el correlativo aquí.
    syncSummaryHeight();
  }

  // ====== Backend (crear / actualizar) ======
  function payloadFromUI() {
    const items = readRows().map(r => ({
      kind: r.type,
      description: r.desc,
      qty: r.qty ? Number(r.qty) : null,
      unitPrice: Number(r.price || 0)
    }));
    return {
      customer: { name: iClientName.value || '', phone: iClientPhone.value || '', email: iClientEmail.value || '' },
      vehicle: { plate: iPlate.value || '', make: iBrand.value || '', line: iLine.value || '', modelYear: iYear.value || '', displacement: iCc.value || '' },
      validity: iValidDays.value || '',
      items
    };
  }

  async function saveToBackend() {
    try {
      const creating = !currentQuoteId;
      let doc;
      if (creating) {
        doc = await API.quoteCreate(payloadFromUI());
      } else {
        doc = await API.quotePatch(currentQuoteId, payloadFromUI());
      }
      // Ajusta correlativo UI al real
      if (doc?.number) {
        iNumber.value = doc.number;
        iNumberBig.textContent = doc.number;
        if (typeof doc.seq === 'number') {
          localStorage.setItem(kLast(), String(doc.seq)); // para que nextNumber arranque en seq+1
        }
      }
      currentQuoteId = doc?._id || currentQuoteId;
      toast('Cotización guardada en historial.');
      loadHistory();

      // >>> Limpia para nueva cotización SOLO si era creación
      if (creating) resetQuoteForm();

    } catch (e) {
      alert(e?.message || 'Error guardando la cotización');
    }
  }

  // ====== Historial ======
  function buildQuery() {
    const qs = new URLSearchParams();
    const t = (qhText.value || '').trim();
    if (t) qs.set('q', t);
    if (qhFrom.value) qs.set('from', qhFrom.value);
    if (qhTo.value) qs.set('to', qhTo.value);
    const s = qs.toString();
    return s ? `?${s}` : '';
  }

  async function loadHistory() {
    try {
      qhList.innerHTML = '<small class="meta">Cargando...</small>';
      const list = await API.quotesList(buildQuery());
      renderHistory(Array.isArray(list) ? list : []);
    } catch (e) {
      qhList.innerHTML = `<small class="meta">Error: ${e?.message || 'No se pudo cargar'}</small>`;
    }
  }

  function renderHistory(rows) {
    if (!rows.length) {
      qhList.innerHTML = `<small class="meta">Sin resultados.</small>`;
      return;
    }
    qhList.innerHTML = '';
    rows.forEach(d => {
      const el = document.createElement('div');
      el.className = 'qh-item';
      const date = d.createdAt ? new Date(d.createdAt).toLocaleString() : '';
      el.innerHTML = `
        <div><strong>#${(d.number || '').toString().padStart(5, '0')}</strong><div class="meta">${date}</div></div>
        <div>
          <div><strong>${d.customer?.name || '—'}</strong></div>
          <div class="meta">${[d.vehicle?.make, d.vehicle?.line, d.vehicle?.modelYear].filter(Boolean).join(' ') || '—'}</div>
        </div>
        <div><div>Placa</div><div class="meta">${d.vehicle?.plate || '—'}</div></div>
        <div><div>Total</div><div class="meta">${money(d.total || 0)}</div></div>
        <div class="actions">
          <button data-act="edit">Ver/Editar</button>
          <button class="secondary" data-act="wa">WhatsApp</button>
          <button class="secondary" data-act="pdf">PDF</button>
          <button class="danger" data-act="del">Eliminar</button>
        </div>
      `;
      el.querySelector('[data-act="edit"]')?.addEventListener('click', () => setUIFromQuote(d));
      el.querySelector('[data-act="wa"]')?.addEventListener('click', () => openWAFromDoc(d));
      el.querySelector('[data-act="pdf"]')?.addEventListener('click', () => exportPDFFromDoc(d));
      el.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
        if (!confirm('¿Eliminar cotización?')) return;
        try { await API.quoteDelete(d._id); loadHistory(); } catch (e) { alert(e?.message || 'Error al eliminar'); }
      });
      qhList.appendChild(el);
    });
  }

  function setUIFromQuote(d) {
    currentQuoteId = d?._id || null;
    iNumber.value = d?.number || nextNumber();
    iNumberBig.textContent = iNumber.value;
    iDatetime.value = d?.createdAt ? new Date(d.createdAt).toLocaleString() : todayIso();

    iClientName.value = d?.customer?.name || '';
    iClientPhone.value = d?.customer?.phone || '';
    iClientEmail.value = d?.customer?.email || '';

    iPlate.value = d?.vehicle?.plate || '';
    iBrand.value = d?.vehicle?.make || '';
    iLine.value = d?.vehicle?.line || '';
    iYear.value = d?.vehicle?.modelYear || '';
    iCc.value = d?.vehicle?.displacement || '';

    iValidDays.value = d?.validity || '';

    clearRows();
    (d?.items || []).forEach(it => {
      // Mapea 'Producto'|'Servicio' -> 'PRODUCTO'|'SERVICIO' para el select
      const k = String(it.kind || 'Producto').trim().toUpperCase();
      addRowFromData({
        type: (k === 'SERVICIO' ? 'SERVICIO' : 'PRODUCTO'),
        desc: it.description || '',
        qty: it.qty ?? '',
        price: it.unitPrice || 0
      });
    });
    recalcAll();
    window.scrollTo({ top: tab.offsetTop, behavior: 'smooth' });
  }

  function exportPDFFromDoc(d) {
    exportPDFFromData({
      number: d.number,
      datetime: d.createdAt ? new Date(d.createdAt).toLocaleString() : todayIso(),
      customer: d.customer || {},
      vehicle: d.vehicle || {},
      validity: d.validity || '',
      items: (d.items || []).map(it => ({
        ...it,
        subtotal: (it.qty && it.qty > 0 ? it.qty : 1) * (it.unitPrice || 0)
      }))
    });
  }

  function openWAFromDoc(d) {
    const subP = (d.items || []).filter(i => i.kind !== 'SERVICIO').reduce((a, i) => a + ((i.qty || 1) * (i.unitPrice || 0)), 0);
    const subS = (d.items || []).filter(i => i.kind === 'SERVICIO').reduce((a, i) => a + ((i.qty || 1) * (i.unitPrice || 0)), 0);
    const total = subP + subS;

    // Reutiliza la misma plantilla de texto
    const prev = (() => {
      const rows = (d.items || []).map(it => ({
        type: it.kind === 'SERVICIO' ? 'SERVICIO' : 'PRODUCTO',
        desc: it.description,
        qty: it.qty, price: it.unitPrice
      }));
      // pequeña “inyección” a los inputs temporales
      const bak = { n: iNumber.value, c: iClientName.value, b: iBrand.value, l: iLine.value, y: iYear.value, p: iPlate.value, cc: iCc.value, v: iValidDays.value };
      iNumber.value = d.number || iNumber.value;
      iClientName.value = d.customer?.name || '';
      iBrand.value = d.vehicle?.make || ''; iLine.value = d.vehicle?.line || ''; iYear.value = d.vehicle?.modelYear || ''; iPlate.value = d.vehicle?.plate || ''; iCc.value = d.vehicle?.displacement || ''; iValidDays.value = d.validity || '';
      const text = buildWhatsAppText(rows, subP, subS, total);
      iNumber.value = bak.n; iClientName.value = bak.c; iBrand.value = bak.b; iLine.value = bak.l; iYear.value = bak.y; iPlate.value = bak.p; iCc.value = bak.cc; iValidDays.value = bak.v;
      return text;
    })();

    const url = `https://wa.me/?text=${encodeURIComponent(prev)}`;
    window.open(url, '_blank');
  }

  // ====== Reset de formulario (post-crear) ======
  function resetQuoteForm() {
    // limpia campos
    [iClientName, iClientPhone, iClientEmail, iPlate, iBrand, iLine, iYear, iCc, iValidDays]
      .forEach(i => { if (i) i.value = ''; });

    // nueva línea vacía y totales
    clearRows(); addRow();
    lblSubtotalProducts.textContent = '$0';
    lblSubtotalServices.textContent = '$0';
    lblTotal.textContent = '$0';
    previewWA.textContent = '';

    // fecha actual y siguiente número
    iDatetime.value = todayIso();
    iNumber.value = nextNumber();
    iNumberBig.textContent = iNumber.value;

    // reset estado
    currentQuoteId = null;
    clearDraft();
    syncSummaryHeight();
    try { window.scrollTo({ top: qData?.offsetTop || 0, behavior: 'smooth' }); } catch {}
  }

  // ====== UI Bindings ======
  function bindUI() {
    btnAddRow?.addEventListener('click', () => { addRow(); recalcAll(); });
    iSaveDraft?.addEventListener('click', saveDraft);
    btnWA?.addEventListener('click', openWhatsApp);
    btnPDF?.addEventListener('click', exportPDF);
    btnSaveBackend?.addEventListener('click', saveToBackend);
    btnClear?.addEventListener('click', () => {
      if (!confirm('¿Borrar todo el contenido de la cotización actual?')) return;
      [iClientName, iClientPhone, iClientEmail, iPlate, iBrand, iLine, iYear, iCc, iValidDays].forEach(i => i.value = '');
      clearRows(); addRow(); recalcAll(); clearDraft(); currentQuoteId = null;
    });

    [iClientName, iClientPhone, iClientEmail, iPlate, iBrand, iLine, iYear, iCc, iValidDays]
      .forEach(el => el?.addEventListener('input', recalcAll));

    qhApply?.addEventListener('click', loadHistory);
    qhClear?.addEventListener('click', () => { qhText.value = ''; qhFrom.value = ''; qhTo.value = ''; loadHistory(); });
  }

  // ====== Altura panel derecho ======
  function syncSummaryHeight() {
    if (!qData || !qSummary) return;
    const h = qData.offsetHeight;
    if (h) { qSummary.style.maxHeight = h + 'px'; qSummary.style.overflowY = 'auto'; }
  }

  // Hook: tab activada
  function onTabActivated() { ensureInit(); }
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-tab]'); if (!btn) return;
    if (btn.dataset.tab === 'cotizaciones') onTabActivated();
  });
  if (tab && document.querySelector('.tabs button[data-tab="cotizaciones"]')?.classList.contains('active')) onTabActivated();
}
