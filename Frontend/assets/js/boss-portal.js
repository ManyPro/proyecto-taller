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
    button.textContent = '🌗';
    button.title = theme === 'light' ? 'Cambiar a oscuro' : 'Cambiar a claro';
    button.setAttribute('aria-label', button.title);
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

function bindHeaderMenu() {
  const toggle = document.querySelector('[data-boss-menu-toggle]');
  const menu = document.querySelector('[data-boss-mobile-menu]');
  if (!toggle || !menu) return;

  const closeMenu = () => {
    menu.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const shouldOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !shouldOpen);
    toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  });

  document.querySelectorAll('[data-boss-mobile-link], [data-boss-logout]').forEach((node) => {
    node.addEventListener('click', closeMenu);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) closeMenu();
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
    minute: '2-digit'
  });
}

function formatCount(value) {
  return Math.round(Number(value || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getBossMovementClass(entry) {
  const metaType = String(entry?.meta?.type || '').toLowerCase();
  if (metaType === 'employee_loan') return 'boss-movement-row boss-movement-loan';
  if (entry?.source === 'TRANSFER') return 'boss-movement-row boss-movement-transfer';
  if (entry?.kind === 'IN') return 'boss-movement-row boss-movement-in';
  return 'boss-movement-row boss-movement-out';
}

async function loadBossHomeSummary() {
  const container = document.getElementById('bossHomeSummary');
  if (!container) return;

  const [balancesResult, openSalesResult, inventoryResult] = await Promise.allSettled([
    BossAPI.cashflow.balances(),
    BossAPI.sales.list({ status: 'draft', page: 1, limit: 1 }),
    BossAPI.inventory.items({ page: 1, limit: 100 })
  ]);

  const balances = balancesResult.status === 'fulfilled' ? balancesResult.value : null;
  const openSales = openSalesResult.status === 'fulfilled' ? openSalesResult.value : null;
  const inventory = inventoryResult.status === 'fulfilled' ? inventoryResult.value : null;
  const balanceItems = Array.isArray(balances?.balances) ? balances.balances : [];
  const inventoryItems = Array.isArray(inventory?.items) ? inventory.items : [];
  const lowStockCount = inventoryItems.filter((item) => {
    const stock = Number(item?.stock || 0);
    const minStock = Number(item?.minStock || 0);
    return minStock > 0 && stock <= minStock;
  }).length;

  const cashBreakdown = balanceItems.length
    ? balanceItems
      .filter((account) => Number(account?.balance || 0) !== 0)
      .slice(0, 4)
      .map((account) => `
        <div class="boss-home-account-pill">
          <span class="boss-home-account-name">${escapeHtml(account.name || 'Cuenta')}</span>
          <span class="boss-home-account-value">${escapeHtml(money(account.balance || 0))}</span>
        </div>
      `).join('')
    : '<div class="boss-home-account-empty">Sin cuentas con saldo</div>';

  container.innerHTML = `
    <article class="boss-home-stat boss-home-stat-primary boss-home-stat-cash">
      <div class="boss-home-stat-label">Caja actual</div>
      <div class="boss-home-stat-value">${escapeHtml(balances ? money(balances?.total || 0) : 'No disponible')}</div>
      <div class="boss-home-account-list">${cashBreakdown}</div>
    </article>
    <article class="boss-home-stat boss-home-stat-sales">
      <div class="boss-home-stat-label">Ventas abiertas</div>
      <div class="boss-home-stat-value">${escapeHtml(openSales ? formatCount(openSales?.total || 0) : 'No disponible')}</div>
      <div class="boss-home-stat-note">órdenes abiertas</div>
    </article>
    <article class="boss-home-stat boss-home-stat-stock">
      <div class="boss-home-stat-label">Alertas de stock</div>
      <div class="boss-home-stat-value">${escapeHtml(inventory ? formatCount(lowStockCount) : 'No disponible')}</div>
      <div class="boss-home-stat-note">ítems en mínimo o por debajo</div>
    </article>
  `;
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
          <td data-label="Cuenta">${escapeHtml(account.name)}</td>
          <td data-label="Tipo">${escapeHtml(account.type)}</td>
          <td data-label="Saldo" class="align-right strong">${money(account.balance)}</td>
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
          <td data-label="Fecha">${formatDate(entry.date || entry.createdAt)}</td>
          <td data-label="Cuenta">${escapeHtml(entry.accountId?.name || entry.accountName || '')}</td>
          <td data-label="Descripción">${desc}</td>
          <td data-label="Entrada" class="align-right ${entry.kind === 'IN' ? 'boss-amount-in strong' : ''}">${entry.kind === 'IN' ? money(entry.amount) : '—'}</td>
          <td data-label="Salida" class="align-right ${entry.kind === 'OUT' ? 'boss-amount-out strong' : ''}">${entry.kind === 'OUT' ? money(entry.amount) : '—'}</td>
          <td data-label="Saldo" class="align-right strong">${money(entry.balanceAfter || 0)}</td>
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
  const toggle = document.getElementById('bossCfToggleFilters');
  const panel = document.getElementById('bossCfFiltersPanel');
  const todayButton = document.getElementById('bossCfToday');

  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      const willOpen = panel.classList.contains('hidden');
      panel.classList.toggle('hidden', !willOpen);
      toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      toggle.textContent = willOpen ? '✖ Ocultar filtros' : '🔎 Mostrar filtros';
    });
  }

  if (todayButton) {
    todayButton.addEventListener('click', () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const isoDate = `${yyyy}-${mm}-${dd}`;
      const fromInput = document.getElementById('bossCfFrom');
      const toInput = document.getElementById('bossCfTo');
      if (fromInput) fromInput.value = isoDate;
      if (toInput) toInput.value = isoDate;
      loadBossCashflowEntries(true);
    });
  }

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

const bossSalesHistoryState = { page: 1, pages: 1, limit: 12 };
const bossInventoryState = { page: 1, pages: 1, limit: 25 };

function padSaleNumber(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return String(numeric).padStart(5, '0');
  return String(value || '—');
}

function formatVehicle(sale) {
  const plate = String(sale?.vehicle?.plate || '').toUpperCase();
  const brand = String(sale?.vehicle?.brand || '').trim();
  const line = String(sale?.vehicle?.line || '').trim();
  return [plate, [brand, line].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Sin vehículo';
}

function formatCustomer(sale) {
  return String(sale?.customer?.name || '').trim() || 'Sin cliente';
}

function getPaidAmount(sale) {
  const paymentMethods = Array.isArray(sale?.paymentMethods)
    ? sale.paymentMethods.reduce((sum, item) => sum + Number(item?.amount || 0), 0)
    : 0;
  const advances = Array.isArray(sale?.advancePayments)
    ? sale.advancePayments.reduce((sum, item) => sum + Number(item?.amount || 0), 0)
    : 0;
  return paymentMethods + advances;
}

function renderBossSaleDetail(detailNode, sale) {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  const paymentMethods = Array.isArray(sale?.paymentMethods) ? sale.paymentMethods : [];
  const advances = Array.isArray(sale?.advancePayments) ? sale.advancePayments : [];

  detailNode.innerHTML = `
    <div class="boss-detail-grid">
      <div class="boss-detail-box">
        <div class="boss-detail-title">Cliente</div>
        <div>${escapeHtml(formatCustomer(sale))}</div>
        <div class="boss-item-meta">${escapeHtml(sale?.customer?.phone || 'Sin teléfono')}</div>
        <div class="boss-item-meta">${escapeHtml(sale?.customer?.idNumber || 'Sin identificación')}</div>
      </div>
      <div class="boss-detail-box">
        <div class="boss-detail-title">Vehículo</div>
        <div>${escapeHtml(formatVehicle(sale))}</div>
        <div class="boss-item-meta">${escapeHtml(sale?.vehicle?.engine || 'Sin motor')}</div>
        <div class="boss-item-meta">${sale?.vehicle?.mileage ? `${Math.round(Number(sale.vehicle.mileage || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} km` : 'Sin kilometraje'}</div>
      </div>
      <div class="boss-detail-box">
        <div class="boss-detail-title">Pago</div>
        <div>${paymentMethods.length ? paymentMethods.map((method) => `${escapeHtml(method.method || 'Método')}: ${money(method.amount)}`).join('<br>') : 'Sin métodos registrados'}</div>
        <div class="boss-item-meta" style="margin-top:8px;">Abonos: ${advances.length ? money(advances.reduce((sum, item) => sum + Number(item?.amount || 0), 0)) : '$0'}</div>
      </div>
    </div>
    <div class="boss-detail-box" style="margin-bottom: 14px;">
      <div class="boss-detail-title">Ítems de la orden</div>
      <div class="boss-detail-list">
        ${items.length ? items.map((item) => `
          <div class="boss-item-row">
            <div>
              <div class="boss-item-name">${escapeHtml(item.name || item.sku || 'Ítem')}</div>
              <div class="boss-item-meta">${escapeHtml(item.sku || item.source || '')}</div>
            </div>
            <div style="text-align:right;">
              <div class="boss-item-name">${money(item.total || (Number(item.qty || 0) * Number(item.unitPrice || 0)))}</div>
              <div class="boss-item-meta">Cant. ${escapeHtml(item.qty || 0)} · Unitario ${money(item.unitPrice || 0)}</div>
            </div>
          </div>
        `).join('') : '<div class="boss-item-meta">Sin ítems registrados.</div>'}
      </div>
    </div>
    ${sale?.notes ? `<div class="boss-detail-box"><div class="boss-detail-title">Notas</div><div>${escapeHtml(sale.notes)}</div></div>` : ''}
  `;
}

function createBossSaleCard(sale, mode = 'open') {
  const paidAmount = getPaidAmount(sale);
  const totalValue = Number(sale?.total || 0);
  const createdAt = sale?.closedAt || sale?.createdAt;
  const statusClass = mode === 'history' ? 'green' : 'amber';
  const statusText = mode === 'history' ? 'Cerrada' : 'Abierta';
  const wrapper = document.createElement('article');
  wrapper.className = 'boss-sale-card';
  wrapper.innerHTML = `
    <div class="boss-sale-head">
      <div>
        <h3 class="boss-card-title">Venta #${escapeHtml(padSaleNumber(sale?.number || sale?._id || '—'))}</h3>
        <div class="boss-muted">${escapeHtml(formatCustomer(sale))}</div>
        <div class="boss-sale-meta">
          <span class="boss-chip ${statusClass}">${statusText}</span>
          <span class="boss-chip blue">${escapeHtml(formatVehicle(sale))}</span>
          <span class="boss-chip">${escapeHtml(String(sale?.technician || sale?.closingTechnician || sale?.initialTechnician || 'Sin técnico'))}</span>
        </div>
      </div>
      <div style="min-width: 210px;">
        <div class="boss-sale-stat">
          <div class="boss-sale-stat-label">Fecha</div>
          <div class="boss-sale-stat-value">${escapeHtml(formatDate(createdAt))}</div>
        </div>
      </div>
    </div>
    <div class="boss-sale-grid">
      <div class="boss-sale-stat">
        <div class="boss-sale-stat-label">Cliente</div>
        <div class="boss-sale-stat-value">${escapeHtml(formatCustomer(sale))}</div>
      </div>
      <div class="boss-sale-stat">
        <div class="boss-sale-stat-label">Vehículo</div>
        <div class="boss-sale-stat-value">${escapeHtml(String(sale?.vehicle?.plate || 'Sin placa').toUpperCase())}</div>
      </div>
      <div class="boss-sale-stat">
        <div class="boss-sale-stat-label">Valor orden</div>
        <div class="boss-sale-stat-value">${money(totalValue)}</div>
      </div>
      <div class="boss-sale-stat">
        <div class="boss-sale-stat-label">${mode === 'history' ? 'Valor pagado' : 'Abonos registrados'}</div>
        <div class="boss-sale-stat-value">${money(paidAmount)}</div>
      </div>
    </div>
    <div class="boss-sale-actions">
      <button type="button" class="boss-btn boss-btn-secondary" data-boss-sale-toggle="${escapeHtml(sale?._id || '')}">Ver detalle</button>
    </div>
    <div class="boss-sale-detail hidden" id="boss-sale-detail-${escapeHtml(sale?._id || '')}"></div>
  `;

  const button = wrapper.querySelector('[data-boss-sale-toggle]');
  const detail = wrapper.querySelector('.boss-sale-detail');
  if (button && detail) {
    button.addEventListener('click', async () => {
      const isHidden = detail.classList.contains('hidden');
      if (!isHidden) {
        detail.classList.add('hidden');
        button.textContent = 'Ver detalle';
        return;
      }
      button.disabled = true;
      button.textContent = 'Cargando…';
      try {
        const saleDetail = await BossAPI.sales.get(sale._id);
        renderBossSaleDetail(detail, saleDetail);
        detail.classList.remove('hidden');
        button.textContent = 'Ocultar detalle';
      } catch (err) {
        detail.innerHTML = `<div class="boss-item-meta">${escapeHtml(err?.message || 'No se pudo cargar el detalle')}</div>`;
        detail.classList.remove('hidden');
        button.textContent = 'Ocultar detalle';
      } finally {
        button.disabled = false;
      }
    });
  }
  return wrapper;
}

async function loadBossOpenSales() {
  const list = document.getElementById('bossSalesOpenList');
  const summary = document.getElementById('bossSalesOpenSummary');
  if (!list || !summary) return;
  list.innerHTML = '<div class="boss-empty-state"><h3 class="boss-card-title">Ventas abiertas</h3><p class="boss-empty-copy">Cargando ventas abiertas…</p></div>';
  try {
    const response = await BossAPI.sales.list({ status: 'draft', limit: 100 });
    const items = Array.isArray(response?.items) ? response.items : [];
    const totalAmount = items.reduce((sum, sale) => sum + Number(sale?.total || 0), 0);
    summary.innerHTML = `
      <div class="boss-summary-chip in">Abiertas: ${items.length}</div>
      <div class="boss-summary-chip net">Valor total: ${money(totalAmount)}</div>
    `;
    if (!items.length) {
      list.innerHTML = '<div class="boss-empty-state"><h3 class="boss-card-title">Sin ventas abiertas</h3><p class="boss-empty-copy">No hay órdenes abiertas en este momento.</p></div>';
      return;
    }
    list.innerHTML = '';
    items.forEach((sale) => list.appendChild(createBossSaleCard(sale, 'open')));
  } catch (err) {
    list.innerHTML = `<div class="boss-empty-state"><h3 class="boss-card-title">Error</h3><p class="boss-empty-copy">${escapeHtml(err?.message || 'No se pudo cargar ventas abiertas')}</p></div>`;
  }
}

async function loadBossHistorySales(reset = false) {
  if (reset) bossSalesHistoryState.page = 1;
  const list = document.getElementById('bossSalesHistoryList');
  const summary = document.getElementById('bossSalesHistorySummary');
  const pageInfo = document.getElementById('bossSalesHistoryPageInfo');
  const prev = document.getElementById('bossSalesHistoryPrev');
  const next = document.getElementById('bossSalesHistoryNext');
  if (!list || !summary || !pageInfo || !prev || !next) return;

  const params = {
    status: 'closed',
    page: bossSalesHistoryState.page,
    limit: bossSalesHistoryState.limit,
    from: document.getElementById('bossSalesHistoryFrom')?.value || '',
    to: document.getElementById('bossSalesHistoryTo')?.value || '',
    plate: document.getElementById('bossSalesHistoryPlate')?.value || '',
    number: document.getElementById('bossSalesHistoryNumber')?.value || ''
  };

  list.innerHTML = '<div class="boss-empty-state"><h3 class="boss-card-title">Historial</h3><p class="boss-empty-copy">Cargando historial…</p></div>';
  try {
    const response = await BossAPI.sales.list(params);
    const items = Array.isArray(response?.items) ? response.items : [];
    const totalAmount = items.reduce((sum, sale) => sum + Number(sale?.total || 0), 0);
    summary.innerHTML = `
      <div class="boss-summary-chip in">Con pago: ${response?.total || items.length}</div>
      <div class="boss-summary-chip net">Total facturado: ${money(totalAmount)}</div>
    `;
    if (!items.length) {
      list.innerHTML = '<div class="boss-empty-state"><h3 class="boss-card-title">Sin resultados</h3><p class="boss-empty-copy">No se encontraron ventas con los filtros actuales.</p></div>';
    } else {
      list.innerHTML = '';
      items.forEach((sale) => list.appendChild(createBossSaleCard(sale, 'history')));
    }
    bossSalesHistoryState.page = Number(response?.page || 1);
    bossSalesHistoryState.pages = Math.max(1, Number(response?.pages || 1));
    pageInfo.textContent = `Página ${bossSalesHistoryState.page} de ${bossSalesHistoryState.pages}`;
    prev.disabled = bossSalesHistoryState.page <= 1;
    next.disabled = bossSalesHistoryState.page >= bossSalesHistoryState.pages;
  } catch (err) {
    list.innerHTML = `<div class="boss-empty-state"><h3 class="boss-card-title">Error</h3><p class="boss-empty-copy">${escapeHtml(err?.message || 'No se pudo cargar historial')}</p></div>`;
    pageInfo.textContent = 'Página —';
  }
}

function bindBossSales() {
  document.getElementById('bossSalesHistoryApply')?.addEventListener('click', () => loadBossHistorySales(true));
  document.getElementById('bossSalesHistoryPrev')?.addEventListener('click', () => {
    if (bossSalesHistoryState.page > 1) {
      bossSalesHistoryState.page -= 1;
      loadBossHistorySales();
    }
  });
  document.getElementById('bossSalesHistoryNext')?.addEventListener('click', () => {
    if (bossSalesHistoryState.page < bossSalesHistoryState.pages) {
      bossSalesHistoryState.page += 1;
      loadBossHistorySales();
    }
  });
}

async function loadBossInventorySuppliers() {
  const select = document.getElementById('bossInventorySupplier');
  if (!select) return;
  try {
    const response = await BossAPI.inventory.suppliers();
    const items = Array.isArray(response?.items) ? response.items : [];
    const current = select.value;
    select.innerHTML = '<option value="">Todos los proveedores permitidos</option>' + items.map((supplier) => (
      `<option value="${escapeHtml(supplier._id || '')}">${escapeHtml(supplier.name || 'Proveedor')}</option>`
    )).join('');
    if (current) select.value = current;
  } catch (err) {
    select.innerHTML = '<option value="">Sin proveedores permitidos</option>';
    console.warn('No se pudieron cargar proveedores del jefe:', err);
  }
}

function getInventoryStatus(item) {
  const stock = Number(item?.stock || 0);
  const minStock = Number(item?.minStock || 0);
  if (minStock > 0 && stock <= minStock) {
    const diff = stock - minStock;
    return {
      label: diff < 0 ? `Debajo por ${Math.abs(diff)}` : 'En mínimo',
      rowClass: 'boss-low-stock-row'
    };
  }
  if (minStock > 0) {
    return { label: `A ${stock - minStock} del mínimo`, rowClass: '' };
  }
  return { label: 'Sin mínimo', rowClass: '' };
}

async function loadBossInventory(reset = false) {
  if (reset) bossInventoryState.page = 1;
  const rows = document.getElementById('bossInventoryRows');
  const summary = document.getElementById('bossInventorySummary');
  const pageInfo = document.getElementById('bossInventoryPageInfo');
  const prev = document.getElementById('bossInventoryPrev');
  const next = document.getElementById('bossInventoryNext');
  if (!rows || !summary || !pageInfo || !prev || !next) return;

  const params = {
    page: bossInventoryState.page,
    limit: bossInventoryState.limit,
    supplierId: document.getElementById('bossInventorySupplier')?.value || '',
    name: document.getElementById('bossInventorySearch')?.value || ''
  };

  rows.innerHTML = '<tr><td colspan="5">Cargando inventario…</td></tr>';
  try {
    const response = await BossAPI.inventory.items(params);
    const items = Array.isArray(response?.items) ? response.items : [];
    const lowStockCount = items.filter((item) => Number(item?.minStock || 0) > 0 && Number(item?.stock || 0) <= Number(item?.minStock || 0)).length;
    summary.innerHTML = `
      <div class="boss-stock-pill ok">Ítems en lista: ${items.length}</div>
      <div class="boss-stock-pill low">Stock mínimo cercano: ${lowStockCount}</div>
    `;

    rows.innerHTML = items.length ? items.map((item) => {
      const status = getInventoryStatus(item);
      return `
        <tr class="${status.rowClass}">
          <td data-label="Ítem" class="strong">${escapeHtml(item.name || 'Ítem')}</td>
          <td data-label="SKU">${escapeHtml(item.sku || '')}</td>
          <td data-label="Unidades" class="align-right strong">${escapeHtml(item.stock ?? 0)}</td>
          <td data-label="Stock mínimo" class="align-right">${Number(item?.minStock || 0) > 0 ? escapeHtml(item.minStock) : '—'}</td>
          <td data-label="Estado" class="align-right">${escapeHtml(status.label)}</td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="5">No hay ítems para los filtros actuales</td></tr>';

    bossInventoryState.page = Number(response?.page || 1);
    bossInventoryState.pages = Math.max(1, Number(response?.pages || 1));
    pageInfo.textContent = `Página ${bossInventoryState.page} de ${bossInventoryState.pages}`;
    prev.disabled = bossInventoryState.page <= 1;
    next.disabled = bossInventoryState.page >= bossInventoryState.pages;
  } catch (err) {
    rows.innerHTML = `<tr><td colspan="5">${escapeHtml(err?.message || 'No se pudo cargar inventario')}</td></tr>`;
    summary.innerHTML = `
      <div class="boss-stock-pill ok">Ítems en lista: —</div>
      <div class="boss-stock-pill low">Stock mínimo cercano: —</div>
    `;
    pageInfo.textContent = 'Página —';
  }
}

function bindBossInventory() {
  document.getElementById('bossInventoryApply')?.addEventListener('click', () => loadBossInventory(true));
  document.getElementById('bossInventoryPrev')?.addEventListener('click', () => {
    if (bossInventoryState.page > 1) {
      bossInventoryState.page -= 1;
      loadBossInventory();
    }
  });
  document.getElementById('bossInventoryNext')?.addEventListener('click', () => {
    if (bossInventoryState.page < bossInventoryState.pages) {
      bossInventoryState.page += 1;
      loadBossInventory();
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
      feedback.textContent = err?.message || 'No se pudo iniciar sesión';
    } finally {
      loginButton.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.MMModal?.init) window.MMModal.init();
  applyTheme(detectTheme());
  bindThemeToggles();
  bindHeaderMenu();

  const page = document.body?.dataset?.page || '';
  if (page === 'boss-login') {
    bindBossLogin();
    return;
  }

  bindLogout();
  const session = await ensureBossSession();
  if (!session) return;
  if (page === 'boss-sales') {
    bindSalesSubtabs();
    bindBossSales();
    await loadBossOpenSales();
    await loadBossHistorySales(true);
  }
  if (page === 'boss-home') {
    await loadBossHomeSummary();
  }
  if (page === 'boss-cashflow') {
    bindBossCashflow();
    await loadBossCashflowAccounts();
    await loadBossCashflowEntries(true);
  }
  if (page === 'boss-inventory') {
    bindBossInventory();
    await loadBossInventorySuppliers();
    await loadBossInventory(true);
  }
});
