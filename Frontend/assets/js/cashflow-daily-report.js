import { API } from './api.esm.js';
import { formatDate as formatUtcDate } from './dateTime.js';

const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const reportState = {
  report: null,
  companyName: '',
  session: null
};

function getApiBase() {
  return window.BACKEND_URL || window.API_BASE || '';
}

function buildPdfUrl(reportDate) {
  const token = API?.token?.get?.();
  if (!token) return '';
  const params = new URLSearchParams({
    date: reportDate,
    token
  });
  return `${getApiBase()}/api/v1/cashflow/session/report/pdf?${params.toString()}`;
}

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
  const countHeroEl = document.getElementById('accounts-count-hero');
  if (!listEl) return;

  const rows = Array.isArray(report?.rows) ? report.rows : [];
  if (countEl) countEl.textContent = `${rows.length} reporte${rows.length === 1 ? '' : 's'} individual${rows.length === 1 ? '' : 'es'}`;
  if (countHeroEl) countHeroEl.textContent = String(rows.length || 0);

  if (!rows.length) {
    listEl.innerHTML = '<div class="report-page rounded-2xl border border-slate-200 bg-white px-6 py-8 text-sm text-slate-500 shadow-sm">No hay datos disponibles para este cierre.</div>';
    return;
  }

  const companyName = escapeHtml(reportState.companyName || 'Empresa');
  const reportDate = formatDateLabel(report.businessDate);
  const openedAt = formatDateTimeLabel(report.openedAt);
  const closedAt = report.closedAt ? formatDateTimeLabel(report.closedAt) : 'Pendiente';

  listEl.innerHTML = rows.map((row) => `
    <article class="account-report-page rounded-2xl border border-sky-100 p-6 md:p-8 shadow-2xl overflow-hidden">
      <div class="flex flex-col gap-8 flex-1">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.22em] text-sky-700 font-semibold mb-2">Reporte por cuenta</p>
            <h3 class="text-4xl md:text-5xl font-extrabold text-slate-900">${escapeHtml(row.name)}</h3>
            <p class="mt-3 text-base uppercase tracking-wide text-slate-500">${escapeHtml(row.type || 'Cuenta')}</p>
          </div>
          <div class="rounded-2xl border border-sky-100 bg-white/90 px-6 py-6 shadow-sm">
            <div class="text-sm uppercase tracking-wide text-slate-500 font-semibold">Saldo actual</div>
            <div class="mt-3 text-4xl md:text-5xl font-extrabold text-slate-900">${money(row.currentBalance || 0)}</div>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white/90 px-6 py-5 shadow-sm">
          <div class="space-y-1 text-slate-600">
            <p class="account-meta-line"><span class="font-semibold text-slate-800">${companyName}</span></p>
            <p class="account-meta-line"><span class="font-semibold text-slate-800">Fecha:</span> ${reportDate}</p>
            <p class="account-meta-line"><span class="font-semibold text-slate-800">Apertura:</span> ${openedAt}</p>
            <p class="account-meta-line"><span class="font-semibold text-slate-800">Cierre:</span> ${closedAt}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-5 flex-1 content-start">
          <div class="account-metric-card rounded-2xl border border-slate-200 bg-white px-6 py-7 shadow-sm flex flex-col justify-center">
            <div class="text-sm uppercase tracking-wide text-slate-500 font-semibold">Saldo inicial</div>
            <div class="mt-4 text-4xl md:text-5xl font-extrabold text-slate-900">${money(row.openingBalance || 0)}</div>
          </div>
          <div class="account-metric-card rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-7 shadow-sm flex flex-col justify-center">
            <div class="text-sm uppercase tracking-wide text-emerald-700 font-semibold">Ingresos</div>
            <div class="mt-4 text-4xl md:text-5xl font-extrabold text-emerald-700">${money(row.income || 0)}</div>
          </div>
          <div class="account-metric-card rounded-2xl border border-rose-200 bg-rose-50 px-6 py-7 shadow-sm flex flex-col justify-center">
            <div class="text-sm uppercase tracking-wide text-rose-700 font-semibold">Salidas (egresos)</div>
            <div class="mt-4 text-4xl md:text-5xl font-extrabold text-rose-700">${money(row.expense || 0)}</div>
          </div>
          <div class="account-metric-card rounded-2xl border border-sky-200 bg-sky-50 px-6 py-7 shadow-sm flex flex-col justify-center">
            <div class="text-sm uppercase tracking-wide text-sky-700 font-semibold">Saldo final</div>
            <div class="mt-4 text-4xl md:text-5xl font-extrabold text-sky-700">${money(row.currentBalance || 0)}</div>
          </div>
        </div>

        <div class="mt-auto rounded-2xl border border-slate-200 bg-white/90 px-6 py-5 shadow-sm">
          <p class="text-base leading-7 text-slate-600">
            Este reporte individual resume el comportamiento de la cuenta <span class="font-semibold text-slate-800">${escapeHtml(row.name)}</span> durante el cierre del día, con el mismo criterio de apertura, ingresos, egresos y saldo final del reporte general.
          </p>
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

async function generatePdf() {
  const report = reportState.report;
  if (!report) {
    showError('Primero debe cargarse el reporte antes de generar el PDF.');
    return;
  }

  const button = document.getElementById('report-pdf');
  const reportDate = getRequestedDate();
  const pdfUrl = buildPdfUrl(reportDate);

  try {
    hideError();
    if (button) {
      button.disabled = true;
      button.textContent = 'Generando...';
      button.classList.add('opacity-70', 'cursor-wait');
    }

    if (!pdfUrl) {
      throw new Error('No se encontró la sesión activa para autenticar la descarga del PDF.');
    }

    const openedWindow = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    if (!openedWindow) {
      window.location.assign(pdfUrl);
    }
  } catch (error) {
    console.error('[Cashflow PDF] Error abriendo PDF:', error);
    showError(error?.message || 'No se pudo generar el PDF del cierre.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Generar PDF';
      button.classList.remove('opacity-70', 'cursor-wait');
    }
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
