/* assets/js/quotes.js
   Inicializador del módulo de Cotizaciones.
   - Numeración por empresa (scoped por email)
   - Borrador local
   - Renglones dinámicos
   - Vista previa WhatsApp
   - Envío WhatsApp
   - Exportar PDF (jsPDF + AutoTable)
*/

export function initQuotes({ getCompanyEmail }) {
  // ====== Helpers de DOM ======
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ====== Estado ======
  let inited = false;
  let emailScope = ''; // para scoping del localStorage
  const KEYS = (window.QUOTES_KEYS || {
    lastNumber: 'quotes:lastNumber',
    draft: 'quotes:current',
  });

  // ====== Nodos ======
  const tab = $('#tab-cotizaciones');
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

  const iSaveDraft = $('#q-saveDraft');

  const rowsBox = $('#q-rows');
  const rowTemplate = $('#q-row-template');
  const btnAddRow = $('#q-addRow');

  const lblSubtotalProducts = $('#q-subtotal-products');
  const lblSubtotalServices = $('#q-subtotal-services');
  const lblTotal = $('#q-total');

  const iValidDays = $('#q-valid-days');
  const previewWA = $('#q-whatsappPreview');
  const btnWA = $('#q-sendWhatsApp');
  const btnPDF = $('#q-exportPdf');
  const btnClear = $('#q-clearAll');

  // ====== Utils ======
  const pad5 = (n) => String(n).padStart(5, '0');
  const money = (n) => {
    const x = Math.round(Number(n || 0));
    return '$' + x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  const todayIso = () => {
    try {
      return (window.dayjs ? window.dayjs() : new Date()).format
        ? window.dayjs().format('YYYY-MM-DD HH:mm')
        : new Date().toLocaleString();
    } catch {
      return new Date().toLocaleString();
    }
  };

  // keys por empresa
  const kLast = () => `${KEYS.lastNumber}:${emailScope}`;
  const kDraft = () => `${KEYS.draft}:${emailScope}`;

  // ====== Carga inicial ======
  function ensureInit() {
    if (inited) return;
    inited = true;

    emailScope = (getCompanyEmail?.() || '').trim().toLowerCase();
    // Número
    iNumber.value = nextNumber();
    iNumberBig.textContent = iNumber.value;

    // Fecha auto
    iDatetime.value = todayIso();

    // Fila inicial
    clearRows();
    addRow();

    // Intentar cargar borrador
    loadDraft();

    // Calcular totales/preview
    recalcAll();

    // Eventos de UI
    bindUI();
  }

  // ====== Numeración por empresa ======
  function nextNumber() {
    const raw = localStorage.getItem(kLast());
    let n = Number(raw || 0);
    n = isNaN(n) ? 0 : n;
    // NO lo incrementamos aquí; incrementamos al exportar/enviar si quieres.
    // Por ahora solo mostramos el próximo correlativo "n+1".
    const cand = n + 1;
    return pad5(cand);
  }
  function advanceNumber() {
    // guarda el último usado
    const shown = Number(iNumber.value || '1');
    localStorage.setItem(kLast(), String(shown));
  }

  // ====== Borrador ======
  function getDraftData() {
    return {
      number: iNumber.value,
      datetime: iDatetime.value,
      clientName: iClientName.value,
      clientPhone: iClientPhone.value,
      clientEmail: iClientEmail.value,
      plate: iPlate.value,
      brand: iBrand.value,
      line: iLine.value,
      year: iYear.value,
      cc: iCc.value,
      validDays: iValidDays.value,
      rows: readRows(),
    };
  }
  function saveDraft() {
    const data = getDraftData();
    localStorage.setItem(kDraft(), JSON.stringify(data));
    toast('Borrador guardado.');
  }
  function loadDraft() {
    const raw = localStorage.getItem(kDraft());
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      // Solo si coincide correlativo mostrado (para no traer otro número viejo)
      iNumber.value = data.number || iNumber.value;
      iNumberBig.textContent = iNumber.value;
      iDatetime.value = data.datetime || iDatetime.value;
      iClientName.value = data.clientName || '';
      iClientPhone.value = data.clientPhone || '';
      iClientEmail.value = data.clientEmail || '';
      iPlate.value = data.plate || '';
      iBrand.value = data.brand || '';
      iLine.value = data.line || '';
      iYear.value = data.year || '';
      iCc.value = data.cc || '';
      iValidDays.value = data.validDays || '';

      clearRows();
      (data.rows || []).forEach(addRowFromData);
    } catch {}
  }
  function clearDraft() {
    localStorage.removeItem(kDraft());
  }

  // ====== Filas ======
  function clearRows() {
    rowsBox.innerHTML = '';
  }
  function addRowFromData(r) {
    const row = cloneRow();
    row.querySelector('select').value = r.type || 'PRODUCTO';
    row.querySelectorAll('input')[0].value = r.desc || '';
    row.querySelectorAll('input')[1].value = r.qty || '';
    row.querySelectorAll('input')[2].value = r.price || '';
    // Subtotal disabled
    updateRowSubtotal(row);
    rowsBox.appendChild(row);
  }
  function addRow() {
    const row = cloneRow();
    rowsBox.appendChild(row);
  }
  function cloneRow() {
    const n = rowTemplate.cloneNode(true);
    n.classList.remove('hidden');
    n.removeAttribute('id');
    n.removeAttribute('data-template');
    const inputs = n.querySelectorAll('input, select');
    inputs.forEach((el) => {
      el.addEventListener('input', () => {
        updateRowSubtotal(n);
        recalcAll();
      });
    });
    const btnQuitar = n.querySelector('button');
    btnQuitar.addEventListener('click', () => {
      n.remove();
      recalcAll();
    });
    return n;
  }
  function readRows() {
    const rows = [];
    rowsBox.querySelectorAll('.tr:not([data-template])').forEach((r) => {
      const type = r.querySelector('select').value;
      const desc = r.querySelectorAll('input')[0].value;
      const qty = Number(r.querySelectorAll('input')[1].value || 0);
      const price = Number(r.querySelectorAll('input')[2].value || 0);
      if (!desc && !price && !qty) return; // ignora vacías
      rows.push({ type, desc, qty, price });
    });
    return rows;
  }
  function updateRowSubtotal(r) {
    const qty = Number(r.querySelectorAll('input')[1].value || 0);
    const price = Number(r.querySelectorAll('input')[2].value || 0);
    const subtotal = (qty > 0 ? qty : 1) * (price || 0);
    const out = r.querySelectorAll('input')[3];
    out.value = money(subtotal);
  }

  // ====== Totales & Preview ======
  function recalcAll() {
    const rows = readRows();
    let subP = 0, subS = 0;
    rows.forEach(({ type, qty, price }) => {
      const q = qty > 0 ? qty : 1;
      const st = q * (price || 0);
      if ((type || 'PRODUCTO') === 'PRODUCTO') subP += st;
      else subS += st;
    });
    const total = subP + subS;

    lblSubtotalProducts.textContent = money(subP);
    lblSubtotalServices.textContent = money(subS);
    lblTotal.textContent = money(total);

    previewWA.textContent = buildWhatsAppText(rows, subP, subS, total);
  }

  function buildWhatsAppText(rows, subP, subS, total) {
    const num = iNumber.value;
    const cliente = iClientName.value || '—';
    const veh = `${iBrand.value || ''} ${iLine.value || ''} ${iYear.value || ''}`.trim();
    const placa = iPlate.value || '—';
    const cc = iCc.value || '—';
    const val = iValidDays.value ? `\nValidez: ${iValidDays.value} días` : '';

    let lines = [];
    lines.push(`*Cotización ${num}*`);
    lines.push(`Cliente: ${cliente}`);
    lines.push(`Vehículo: ${veh} — Placa: ${placa} — Cilindraje: ${cc}`);
    lines.push('');

    rows.forEach(({ type, desc, qty, price }) => {
      const q = qty > 0 ? qty : 1;
      const st = q * (price || 0);
      // Línea de descripción
      const tipo = (type === 'SERVICIO') ? 'Servicio' : 'Producto';
      const cantSuffix = (qty && Number(qty) > 0) ? ` x${q}` : '';
      lines.push(`✅ ${desc || tipo}${cantSuffix}`);
      lines.push(`${money(st)}`);
    });

    lines.push('');
    lines.push(`Subtotal Productos: ${money(subP)}`);
    lines.push(`Subtotal Servicios: ${money(subS)}`);
    lines.push(`*TOTAL: ${money(subP + subS)}*`);
    lines.push(`Valores SIN IVA`);
    lines.push(val.trim());

    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  // ====== Export PDF ======
  function exportPDF() {
    const rows = readRows();
    const subP = parseMoney(lblSubtotalProducts.textContent);
    const subS = parseMoney(lblSubtotalServices.textContent);
    const tot = parseMoney(lblTotal.textContent);

    const { jsPDF } = window.jspdf || {};
    if (!jsPDF || !window.jspdf?.autoTable) {
      alert('No se encontraron librerías jsPDF/AutoTable.');
      return;
    }
    const doc = new jsPDF('p', 'pt', 'a4');

    // Encabezado
    const gold = '#d4c389';
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(gold);
    doc.setFontSize(22);
    doc.text('CASA RENAULT H&H', 60, 60);

    // "logo": rectángulo amarillo con texto RENAULT
    doc.setFillColor('#ffcc00');
    doc.rect(470, 35, 32, 32, 'F');
    doc.setFontSize(8);
    doc.setTextColor('#000000');
    doc.text('RENAULT', 486, 55, { angle: 90 });

    // Título
    doc.setFontSize(16);
    doc.setTextColor('#000000');
    doc.text('COTIZACIÓN', 440, 90);

    // Marca de agua (texto muy tenue)
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.06 }));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(120);
    doc.setTextColor('#000000');
    doc.text('RENAULT', 140, 360, { angle: -12 });
    doc.restoreGraphicsState();

    // Cabecera info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const leftInfo = [
      'CASA RENAULT H&H — Servicio Automotriz',
      'Nit: 901717790-7 • Bogotá D.C',
      `No. Cotización: ${iNumber.value}`,
      `Cliente: ${iClientName.value || '—'}`,
      `Vehículo: ${[iBrand.value, iLine.value, iYear.value].filter(Boolean).join(' ')} —  Placa: ${iPlate.value || '—'}`,
      `Cilindraje: ${iCc.value || '—'}`
    ];
    const rightInfo = [
      `Fecha: ${iDatetime.value || todayIso()}`,
      `Tel: 311 555 0012 • Email: ${iClientEmail.value || 'contacto@ejemplo.com'}`
    ];
    leftInfo.forEach((t, idx) => doc.text(t, 60, 120 + idx * 14));
    rightInfo.forEach((t, idx) => doc.text(t, 370, 120 + idx * 14));

    // Tabla
    const body = rows.map(({ type, desc, qty, price }) => {
      const q = qty > 0 ? qty : 1;
      const st = q * (price || 0);
      return [
        (type === 'SERVICIO') ? 'Servicio' : 'Producto',
        desc || '',
        q,
        money(price || 0),
        money(st)
      ];
    });

    doc.autoTable({
      startY: 200,
      head: [['Tipo', 'Descripción', 'Cant.', 'Precio unit.', 'Subtotal']],
      body,
      styles: { fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [230, 230, 230], textColor: 0 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 260 },
        2: { cellWidth: 50, halign: 'right' },
        3: { cellWidth: 90, halign: 'right' },
        4: { cellWidth: 90, halign: 'right' },
      }
    });

    let y = doc.lastAutoTable.finalY + 16;
    doc.setFont('helvetica', 'normal');
    doc.text(`Subtotal Productos: ${money(subP)}`, 60, y); y += 14;
    doc.text(`Subtotal Servicios: ${money(subS)}`, 60, y); y += 14;
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL: ${money(tot)}`, 60, y); y += 18;
    doc.setFont('helvetica', 'normal');
    doc.text('Valores SIN IVA', 60, y);
    if (iValidDays.value) {
      doc.text(`Validez: ${iValidDays.value} días`, 180, y);
    }

    // Pie de página
    y += 28;
    doc.setFontSize(9);
    doc.text('Calle 69° No. 87-39 • Cel: 301 205 9320 • Bogotá D.C • Contacto: HUGO MANRIQUE 311 513 1603', 60, y);

    const filename = `cotizacion_${iNumber.value}.pdf`;
    doc.save(filename);

    // una vez que se exporta/”usa” la cotización, avanzamos correlativo
    advanceNumber();
    // y dejamos listo el siguiente número en la UI
    iNumber.value = nextNumber();
    iNumberBig.textContent = iNumber.value;
    // limpiamos borrador (opcional)
    clearDraft();
  }

  function parseMoney(str) {
    // "$1.234.567" -> 1234567
    return Number((str || '').replace(/\D+/g, '') || 0);
  }

  // ====== WhatsApp ======
  function openWhatsApp() {
    const text = previewWA.textContent || '';
    if (!text.trim()) return;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');

    // Avanza correlativo al "usar" la cotización.
    advanceNumber();
    iNumber.value = nextNumber();
    iNumberBig.textContent = iNumber.value;
    clearDraft();
  }

  // ====== UI ======
  function bindUI() {
    btnAddRow?.addEventListener('click', () => {
      addRow();
      recalcAll();
    });
    iSaveDraft?.addEventListener('click', saveDraft);
    btnWA?.addEventListener('click', openWhatsApp);
    btnPDF?.addEventListener('click', exportPDF);
    btnClear?.addEventListener('click', () => {
      if (!confirm('¿Borrar todo el contenido de la cotización actual?')) return;
      // resetea campos
      [iClientName, iClientPhone, iClientEmail, iPlate, iBrand, iLine, iYear, iCc, iValidDays].forEach(i => i.value = '');
      clearRows();
      addRow();
      recalcAll();
      clearDraft();
    });

    // Recalcular al cambiar inputs de cabecera
    [iClientName, iClientPhone, iClientEmail, iPlate, iBrand, iLine, iYear, iCc, iValidDays]
      .forEach(el => el?.addEventListener('input', recalcAll));
  }

  // ====== Hook de activación por tab ======
  // Se llama cuando la pestaña Cotizaciones se muestra
  function onTabActivated() {
    ensureInit();
  }

  // Observa los clicks del nav (sin romper tu app)
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-tab]');
    if (!btn) return;
    if (btn.dataset.tab === 'cotizaciones') onTabActivated();
  });

  // Si ya está activa al entrar (por recarga)
  if (tab && !tab.classList.contains('hidden') && tab.classList.contains('tab')) {
    // si tu app deja la tab activa desde el servidor, nos activamos
    if (document.querySelector('.tabs button[data-tab="cotizaciones"]')?.classList.contains('active')) {
      onTabActivated();
    }
  }

  // helper de UX
  function toast(msg) {
    try {
      // usa tu modal global si quieres; por ahora alert
      console.log(msg);
    } catch { /* nop */ }
  }
}
