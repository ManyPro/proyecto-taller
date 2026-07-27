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

async function generatePdf() {
  const report = reportState.report;
  if (!report) {
    showError('Primero debe cargarse el reporte antes de generar el PDF.');
    return;
  }

  const button = document.getElementById('report-pdf');
  const reportDate = getRequestedDate();
  const token = API?.token?.get?.();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    hideError();
    if (button) {
      button.disabled = true;
      button.textContent = 'Generando...';
      button.classList.add('opacity-70', 'cursor-wait');
    }

    const response = await fetch(`${getApiBase()}/api/v1/cashflow/session/report/pdf?date=${encodeURIComponent(reportDate)}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      credentials: 'omit'
    });

    if (!response.ok) {
      const text = await response.text();
      let message = `HTTP ${response.status}`;
      try {
        const body = JSON.parse(text);
        message = body?.message || body?.error || message;
      } catch {
        message = text || message;
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-caja-${reportDate}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
  } catch (error) {
    console.error('[Cashflow PDF] Error descargando PDF:', error);
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
