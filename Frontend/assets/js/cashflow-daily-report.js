import { API } from './api.esm.js';
import { formatDate as formatUtcDate } from './dateTime.js';

const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const reportState = {
  report: null,
  companyName: '',
  session: null
};

function getRequestedDate() {
  const params = new URLSearchParams(window.location.search);
  return params.get('date') || formatUtcDate(Date.now(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split('/').reverse().join('-');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateLabel(value) {
  return formatUtcDate(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function formatDateTimeLabel(value) {
  return formatUtcDate(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function showError(message) {
  const errorEl = document.getElementById('report-error');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideError() {
  const errorEl = document.getElementById('report-error');
  if (!errorEl) return;
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
}

function renderSummary(report, companyName) {
  const subtitle = document.getElementById('report-subtitle');
  const initialEl = document.getElementById('summary-initial');
  const currentEl = document.getElementById('summary-current');
  const incomeEl = document.getElementById('summary-income');
  const expenseEl = document.getElementById('summary-expense');

  if (subtitle) {
    const parts = [
      companyName || 'Empresa',
      `Fecha: ${formatDateLabel(report.businessDate)}`,
      `Apertura: ${formatDateTimeLabel(report.openedAt)}`
    ];
    if (report.closedAt) parts.push(`Cierre: ${formatDateTimeLabel(report.closedAt)}`);
    subtitle.textContent = parts.join(' · ');
  }

  if (initialEl) initialEl.textContent = money(report.totals?.initialBalance || 0);
  if (currentEl) currentEl.textContent = money(report.totals?.currentBalance || 0);
  if (incomeEl) incomeEl.textContent = money(report.totals?.income || 0);
  if (expenseEl) expenseEl.textContent = money(report.totals?.expense || 0);
}

function renderAccounts(report) {
  const listEl = document.getElementById('report-accounts');
  const countEl = document.getElementById('accounts-count');
  if (!listEl) return;

  const rows = Array.isArray(report?.rows) ? report.rows : [];
  if (countEl) countEl.textContent = `${rows.length} cuenta${rows.length === 1 ? '' : 's'}`;

  if (!rows.length) {
    listEl.innerHTML = '<div class="rounded-2xl border border-slate-700/50 theme-light:border-slate-200 bg-slate-900/70 theme-light:bg-white px-5 py-6 text-sm text-slate-400 theme-light:text-slate-500">No hay datos disponibles para este cierre.</div>';
    return;
  }

  listEl.innerHTML = rows.map((row) => `
    <article class="rounded-2xl border border-slate-700/50 theme-light:border-slate-200 bg-slate-900/70 theme-light:bg-white p-5 shadow-lg">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 class="text-lg font-bold text-white theme-light:text-slate-900">${escapeHtml(row.name)}</h3>
          <p class="text-xs uppercase tracking-wide text-slate-400 theme-light:text-slate-500">${escapeHtml(row.type || 'Cuenta')}</p>
        </div>
        <div class="text-right">
          <div class="text-xs uppercase tracking-wide text-slate-400 theme-light:text-slate-500">Saldo actual</div>
          <div class="text-2xl font-extrabold text-white theme-light:text-slate-900">${money(row.currentBalance || 0)}</div>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="rounded-xl border border-slate-700/50 theme-light:border-slate-200 bg-slate-950/50 theme-light:bg-slate-50 px-4 py-4">
          <div class="text-xs uppercase tracking-wide text-slate-400 theme-light:text-slate-500 font-semibold">Saldo inicial</div>
          <div class="mt-2 text-xl font-bold text-white theme-light:text-slate-900">${money(row.openingBalance || 0)}</div>
        </div>
        <div class="rounded-xl border border-emerald-500/20 theme-light:border-emerald-200 bg-emerald-500/10 theme-light:bg-emerald-50 px-4 py-4">
          <div class="text-xs uppercase tracking-wide text-emerald-300 theme-light:text-emerald-700 font-semibold">Ingresos</div>
          <div class="mt-2 text-xl font-bold text-emerald-300 theme-light:text-emerald-700">${money(row.income || 0)}</div>
        </div>
        <div class="rounded-xl border border-rose-500/20 theme-light:border-rose-200 bg-rose-500/10 theme-light:bg-rose-50 px-4 py-4">
          <div class="text-xs uppercase tracking-wide text-rose-300 theme-light:text-rose-700 font-semibold">Salidas (egresos)</div>
          <div class="mt-2 text-xl font-bold text-rose-300 theme-light:text-rose-700">${money(row.expense || 0)}</div>
        </div>
        <div class="rounded-xl border border-sky-500/20 theme-light:border-sky-200 bg-sky-500/10 theme-light:bg-sky-50 px-4 py-4">
          <div class="text-xs uppercase tracking-wide text-sky-300 theme-light:text-sky-700 font-semibold">Saldo final</div>
          <div class="mt-2 text-xl font-bold text-sky-300 theme-light:text-sky-700">${money(row.currentBalance || 0)}</div>
        </div>
      </div>
    </article>
  `).join('');
}

async function loadReport() {
  hideError();
  const reportDate = getRequestedDate();

  try {
    const [report, sessionData, me] = await Promise.all([
      API.cashflow.session.report({ date: reportDate }),
      API.cashflow.session.get({ date: reportDate }),
      API.companyMe().catch(() => null)
    ]);

    const session = sessionData?.session || null;
    if (!session) {
      showError('No existe una sesión de caja para la fecha solicitada.');
      return;
    }

    const companyName = me?.company?.name || me?.name || '';
    reportState.report = report;
    reportState.companyName = companyName;
    reportState.session = session;
    renderSummary(report, companyName);
    renderAccounts(report);
  } catch (error) {
    showError(error?.message || 'No se pudo cargar el reporte diario de caja.');
  }
}

function drawMetricBox(doc, x, y, w, h, label, value, valueColor = [15, 23, 42], fillColor = [255, 255, 255]) {
  doc.setFillColor(...fillColor);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x, y, w, h, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(String(label || '').toUpperCase(), x + 4, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...valueColor);
  doc.text(String(value || '$0'), x + 4, y + 14);
}

function drawFallbackTable(doc, startY, margin, contentWidth, rows, totals) {
  const columns = [
    { key: 'name', label: 'Cuenta', width: 44 },
    { key: 'openingBalance', label: 'Saldo inicial', width: 34 },
    { key: 'income', label: 'Ingresos', width: 34 },
    { key: 'expense', label: 'Salidas (egresos)', width: 38 },
    { key: 'currentBalance', label: 'Saldo actual', width: 36 }
  ];

  let cursorY = startY;
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, cursorY, contentWidth, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);

  let cursorX = margin + 2;
  for (const column of columns) {
    doc.text(column.label, cursorX, cursorY + 5);
    cursorX += column.width;
  }

  cursorY += 10;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  rows.forEach((row, index) => {
    if (index % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, cursorY - 2.5, contentWidth, 8, 'F');
    }

    let rowX = margin + 2;
    doc.text(String(row.name || ''), rowX, cursorY + 2);
    rowX += columns[0].width;
    doc.text(money(row.openingBalance || 0), rowX, cursorY + 2);
    rowX += columns[1].width;
    doc.text(money(row.income || 0), rowX, cursorY + 2);
    rowX += columns[2].width;
    doc.text(money(row.expense || 0), rowX, cursorY + 2);
    rowX += columns[3].width;
    doc.text(money(row.currentBalance || 0), rowX, cursorY + 2);

    cursorY += 8;
  });

  doc.setFillColor(226, 232, 240);
  doc.rect(margin, cursorY - 2.5, contentWidth, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', margin + 2, cursorY + 2);
  doc.text(money(totals?.initialBalance || 0), margin + 46, cursorY + 2);
  doc.text(money(totals?.income || 0), margin + 80, cursorY + 2);
  doc.text(money(totals?.expense || 0), margin + 114, cursorY + 2);
  doc.text(money(totals?.currentBalance || 0), margin + 152, cursorY + 2);
}

function generatePdf() {
  const report = reportState.report;
  if (!report) {
    showError('Primero debe cargarse el reporte antes de generar el PDF.');
    return;
  }

  const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
  if (!jsPDFCtor) {
    showError('No se pudo cargar la librería de PDF.');
    return;
  }

  try {
    hideError();
    const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 12;
    const contentWidth = pageWidth - (margin * 2);

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, 12, contentWidth, 28, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(96, 165, 250);
    doc.text('REPORTE DIARIO', margin + 5, 20);
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('Cierre de Caja', margin + 5, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    const headerDetail = [
      reportState.companyName || 'Empresa',
      `Fecha: ${formatDateLabel(report.businessDate)}`,
      `Apertura: ${formatDateTimeLabel(report.openedAt)}`,
      report.closedAt ? `Cierre: ${formatDateTimeLabel(report.closedAt)}` : null
    ].filter(Boolean).join('  |  ');
    doc.text(headerDetail, margin + 5, 36);

    const boxGap = 4;
    const boxWidth = (contentWidth - boxGap) / 2;
    drawMetricBox(doc, margin, 48, boxWidth, 20, 'Saldo inicial', money(report.totals?.initialBalance || 0));
    drawMetricBox(doc, margin + boxWidth + boxGap, 48, boxWidth, 20, 'Saldo actual', money(report.totals?.currentBalance || 0));
    drawMetricBox(doc, margin, 72, boxWidth, 20, 'Ingresos', money(report.totals?.income || 0), [4, 120, 87], [236, 253, 245]);
    drawMetricBox(doc, margin + boxWidth + boxGap, 72, boxWidth, 20, 'Salidas (egresos)', money(report.totals?.expense || 0), [190, 24, 93], [255, 241, 242]);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Detalle por cuenta', margin, 102);

    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        startY: 106,
        margin: { left: margin, right: margin },
        tableWidth: contentWidth,
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 2.5,
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
          textColor: [15, 23, 42]
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        body: (report.rows || []).map((row) => ([
          row.name || '',
          money(row.openingBalance || 0),
          money(row.income || 0),
          money(row.expense || 0),
          money(row.currentBalance || 0)
        ])),
        foot: [[
          'TOTAL',
          money(report.totals?.initialBalance || 0),
          money(report.totals?.income || 0),
          money(report.totals?.expense || 0),
          money(report.totals?.currentBalance || 0)
        ]],
        footStyles: {
          fillColor: [226, 232, 240],
          textColor: [15, 23, 42],
          fontStyle: 'bold'
        },
        head: [[
          'Cuenta',
          'Saldo inicial',
          'Ingresos',
          'Salidas (egresos)',
          'Saldo actual'
        ]]
      });
    } else {
      drawFallbackTable(doc, 106, margin, contentWidth, report.rows || [], report.totals || {});
    }

    doc.save(`reporte-caja-${getRequestedDate()}.pdf`);
  } catch (error) {
    console.error('[Cashflow PDF] Error generando PDF:', error);
    showError(error?.message || 'No se pudo generar el PDF del cierre.');
  }
}

function bindActions() {
  document.getElementById('report-pdf')?.addEventListener('click', generatePdf);
  document.getElementById('report-close')?.addEventListener('click', () => window.close());
}

document.addEventListener('DOMContentLoaded', () => {
  window.generateCashflowPdf = generatePdf;
  window.closeCashflowReportTab = () => window.close();
  bindActions();
  loadReport();
});
