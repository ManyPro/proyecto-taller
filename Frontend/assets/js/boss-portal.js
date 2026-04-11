import BossAPI from './boss-api.js';

const THEME_KEY = 'app:theme';

function applyTheme(theme) {
  if (window.MMTheme?.setTheme) {
    window.MMTheme.setTheme(theme);
  } else if (document.body) {
    if (theme === 'light') document.body.classList.add('theme-light');
    else document.body.classList.remove('theme-light');
  }
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  document.querySelectorAll('[data-boss-theme-toggle]').forEach((button) => {
    button.textContent = theme === 'light' ? '🌙' : '🌞';
    button.title = theme === 'light' ? 'Cambiar a oscuro' : 'Cambiar a claro';
  });
}

function detectTheme() {
  if (window.MMTheme?.detectTheme) {
    return window.MMTheme.detectTheme();
  }
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'dark';
}

function bindThemeToggles() {
  document.querySelectorAll('[data-boss-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextTheme = document.body.classList.contains('theme-light') ? 'dark' : 'light';
      applyTheme(nextTheme);
    });
  });
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value || '—';
  });
}

function redirectToLogin() {
  window.location.href = 'boss-login.html';
}

function redirectToHome() {
  window.location.href = 'boss-home.html';
}

async function ensureBossSession() {
  if (!BossAPI.isAuthenticated()) {
    redirectToLogin();
    return null;
  }
  try {
    const me = await BossAPI.me();
    setText('[data-boss-company-name]', me?.company?.name || '');
    setText('[data-boss-company-email]', me?.company?.email || '');
    setText('[data-boss-username]', me?.boss?.username || '');
    return me;
  } catch (_err) {
    await BossAPI.logout();
    redirectToLogin();
    return null;
  }
}

function bindLogout() {
  document.querySelectorAll('[data-boss-logout]').forEach((button) => {
    button.addEventListener('click', async () => {
      await BossAPI.logout();
      redirectToLogin();
    });
  });
}

function bindSalesSubtabs() {
  const buttons = Array.from(document.querySelectorAll('[data-boss-sales-tab]'));
  if (!buttons.length) return;
  const panels = Array.from(document.querySelectorAll('[data-boss-sales-panel]'));
  const activate = (tabId) => {
    buttons.forEach((button) => button.classList.toggle('active', button.dataset.bossSalesTab === tabId));
    panels.forEach((panel) => panel.classList.toggle('hidden', panel.dataset.bossSalesPanel !== tabId));
  };
  buttons.forEach((button) => {
    button.addEventListener('click', () => activate(button.dataset.bossSalesTab || 'open'));
  });
  activate(buttons[0].dataset.bossSalesTab || 'open');
}

const bossCashflowState = { page: 1, pages: 1, limit: 25 };

function money(value) {
  return '$' + Math.round(Number(value || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  return new Date(value || Date.now()).toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getBossMovementClass(entry) {
  const metaType = String(entry?.meta?.type || '').toLowerCase();
  if (metaType === 'employee_loan') return 'boss-movement-row boss-movement-loan';
  if (entry?.source === 'TRANSFER') return 'boss-movement-row boss-movement-transfer';
  if (entry?.kind === 'IN') return 'boss-movement-row boss-movement-in';
  return 'boss-movement-row boss-movement-out';
}

async function loadBossCashflowAccounts() {
  const body = document.getElementById('bossCfAccountsBody');
  const total = document.getElementById('bossCfAccountsTotal');
  const accountSelect = document.getElementById('bossCfAccount');
  if (!body || !total || !accountSelect) return;

  try {
    const response = await BossAPI.cashflow.balances();
    const balances = Array.isArray(response?.balances) ? response.balances : [];
    body.innerHTML = balances.length
      ? balances.map((account) => `
        <tr>
          <td>${escapeHtml(account.name)}</td>
          <td>${escapeHtml(account.type)}</td>
          <td class="align-right strong">${money(account.balance)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="3">Sin cuentas disponibles</td></tr>';

    total.textContent = `Total: ${money(response?.total || 0)}`;

    const selected = accountSelect.value;
    accountSelect.innerHTML = '<option value="">Todas las cuentas</option>' + balances.map((account) => (
      `<option value="${escapeHtml(account.accountId || account._id || '')}">${escapeHtml(account.name)}</option>`
    )).join('');
    if (selected) accountSelect.value = selected;
  } catch (err) {
    body.innerHTML = `<tr><td colspan="3">${escapeHtml(err?.message || 'Error cargando cuentas')}</td></tr>`;
    total.textContent = 'Total: —';
  }
}

async function loadBossCashflowEntries(reset = false) {
  if (reset) bossCashflowState.page = 1;
  const rows = document.getElementById('bossCfRows');
  const summary = document.getElementById('bossCashflowSummary');
  const pageInfo = document.getElementById('bossCfPageInfo');
  const prev = document.getElementById('bossCfPrev');
  const next = document.getElementById('bossCfNext');
  if (!rows || !summary || !pageInfo || !prev || !next) return;

  const params = {
    page: bossCashflowState.page,
    limit: bossCashflowState.limit,
    accountId: document.getElementById('bossCfAccount')?.value || '',
    from: document.getElementById('bossCfFrom')?.value || '',
    to: document.getElementById('bossCfTo')?.value || '',
    kind: document.getElementById('bossCfKind')?.value || '',
    source: document.getElementById('bossCfSource')?.value || ''
  };

  rows.innerHTML = '<tr><td colspan="6">Cargando movimientos…</td></tr>';
  try {
    const response = await BossAPI.cashflow.entries(params);
    const items = Array.isArray(response?.items) ? response.items : [];
    rows.innerHTML = items.length ? items.map((entry) => {
      let desc = escapeHtml(entry.description || '');
      if (entry.source === 'SALE' && entry.sourceRef) {
        const saleInfo = [];
        if (entry.meta?.saleNumber) saleInfo.push(`Venta #${String(entry.meta.saleNumber).padStart(5, '0')}`);
        if (entry.meta?.salePlate) saleInfo.push(`Placa: ${String(entry.meta.salePlate).toUpperCase()}`);
        if (saleInfo.length) desc = `${desc} · ${saleInfo.join(' · ')}`;
      }
      return `
        <tr class="${getBossMovementClass(entry)}">
          <td>${formatDate(entry.date || entry.createdAt)}</td>
          <td>${escapeHtml(entry.accountId?.name || entry.accountName || '')}</td>
          <td>${desc}</td>
          <td class="align-right ${entry.kind === 'IN' ? 'boss-amount-in strong' : ''}">${entry.kind === 'IN' ? money(entry.amount) : ''}</td>
          <td class="align-right ${entry.kind === 'OUT' ? 'boss-amount-out strong' : ''}">${entry.kind === 'OUT' ? money(entry.amount) : ''}</td>
          <td class="align-right strong">${money(entry.balanceAfter || 0)}</td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="6">Sin movimientos para los filtros actuales</td></tr>';

    const totalIn = Number(response?.totals?.in || 0);
    const totalOut = Number(response?.totals?.out || 0);
    summary.innerHTML = `
      <div class="boss-summary-chip in">Entradas: ${money(totalIn)}</div>
      <div class="boss-summary-chip out">Salidas: ${money(totalOut)}</div>
      <div class="boss-summary-chip net">Neto: ${money(totalIn - totalOut)}</div>
    `;

    bossCashflowState.page = Number(response?.page || 1);
    bossCashflowState.pages = Math.max(1, Math.ceil(Number(response?.total || 0) / bossCashflowState.limit));
    pageInfo.textContent = `Página ${bossCashflowState.page} de ${bossCashflowState.pages}`;
    prev.disabled = bossCashflowState.page <= 1;
    next.disabled = bossCashflowState.page >= bossCashflowState.pages;
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="6">${escapeHtml(err?.message || 'Error cargando movimientos')}</td></tr>`;
    summary.innerHTML = `
      <div class="boss-summary-chip in">Entradas: —</div>
      <div class="boss-summary-chip out">Salidas: —</div>
      <div class="boss-summary-chip net">Neto: —</div>
    `;
    pageInfo.textContent = 'Página —';
  }
}

function bindBossCashflow() {
  document.getElementById('bossCfApply')?.addEventListener('click', () => loadBossCashflowEntries(true));
  document.getElementById('bossCfPrev')?.addEventListener('click', () => {
    if (bossCashflowState.page > 1) {
      bossCashflowState.page -= 1;
      loadBossCashflowEntries();
    }
  });
  document.getElementById('bossCfNext')?.addEventListener('click', () => {
    if (bossCashflowState.page < bossCashflowState.pages) {
      bossCashflowState.page += 1;
      loadBossCashflowEntries();
    }
  });
}

function bindBossLogin() {
  const form = document.getElementById('bossLoginForm');
  const feedback = document.getElementById('bossLoginFeedback');
  const loginButton = document.getElementById('bossLoginButton');
  if (!form || !feedback || !loginButton) return;

  if (BossAPI.isAuthenticated()) {
    BossAPI.me().then(() => redirectToHome()).catch(() => BossAPI.logout());
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.classList.remove('error');
    feedback.textContent = 'Validando acceso…';
    loginButton.disabled = true;
    try {
      const payload = {
        email: document.getElementById('bossEmail')?.value || '',
        username: document.getElementById('bossUsername')?.value || '',
        password: document.getElementById('bossPassword')?.value || ''
      };
      await BossAPI.login(payload);
      feedback.textContent = 'Acceso concedido. Redirigiendo…';
      redirectToHome();
    } catch (err) {
      feedback.classList.add('error');
      feedback.textContent = err?.message || 'No se pudo iniciar sesiÃ³n';
    } finally {
      loginButton.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.MMModal?.init) window.MMModal.init();
  applyTheme(detectTheme());
  bindThemeToggles();

  const page = document.body?.dataset?.page || '';
  if (page === 'boss-login') {
    bindBossLogin();
    return;
  }

  bindLogout();
  const session = await ensureBossSession();
  if (!session) return;
  if (page === 'boss-sales') bindSalesSubtabs();
  if (page === 'boss-cashflow') {
    bindBossCashflow();
    await loadBossCashflowAccounts();
    await loadBossCashflowEntries(true);
  }
});
