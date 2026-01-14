import { API } from './api.esm.js';

const money = (n) => '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
let invBound = false;
let selectedInvestorId = null;

export function initInvestments() {
  const tab = document.getElementById('tab-inversiones');
  if (!tab) return;
  if (!invBound) {
    bind();
    invBound = true;
  }
  loadInvestors();
}

function bind() {
  document.getElementById('inv-refresh')?.addEventListener('click', () => {
    loadInvestors();
    if (selectedInvestorId) {
      loadInvestorDetail(selectedInvestorId);
    }
  });
  document.getElementById('inv-close-detail')?.addEventListener('click', () => {
    document.getElementById('inv-detail-section')?.classList.add('hidden');
    selectedInvestorId = null;
  });
  document.getElementById('inv-pay-selected')?.addEventListener('click', () => {
    paySelectedItems();
  });
  document.getElementById('inv-select-all-sold')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('#inv-sold-items input[type="checkbox"][data-inv-item-id]').forEach(cb => {
      cb.checked = checked;
    });
    updatePayButton();
  });
}

async function loadInvestors() {
  try {
    const data = await API.investments.listInvestors();
    const investors = data.investors || [];
    const container = document.getElementById('inv-investors-list');
    if (!container) return;

    if (investors.length === 0) {
      container.innerHTML = '<p class="text-slate-400 theme-light:text-slate-600">No hay inversores registrados</p>';
      return;
    }

    container.innerHTML = investors.map(inv => {
      const totalInv = money(inv.totalInvestment || 0);
      const availableVal = money(inv.availableValue || 0);
      const soldVal = money(inv.soldValue || 0);
      const paidVal = money(inv.paidValue || 0);
      
      return `
        <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 cursor-pointer hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-100 transition-colors" data-investor-id="${inv.investorId || inv._id}">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900">${escapeHtml(inv.investorName || 'Sin nombre')}</h4>
              <p class="text-sm text-slate-400 theme-light:text-slate-600">Total Inversión: ${totalInv}</p>
            </div>
            <div class="text-right">
              <p class="text-sm text-green-400 theme-light:text-green-600">Disponible: ${availableVal}</p>
              <p class="text-sm text-yellow-400 theme-light:text-yellow-600">Vendido: ${soldVal}</p>
              <p class="text-sm text-blue-400 theme-light:text-blue-600">Pagado: ${paidVal}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Agregar event listeners
    container.querySelectorAll('[data-investor-id]').forEach(el => {
      el.addEventListener('click', () => {
        const investorId = el.getAttribute('data-investor-id');
        loadInvestorDetail(investorId);
      });
    });
  } catch (err) {
    console.error('Error cargando inversores:', err);
    const container = document.getElementById('inv-investors-list');
    if (container) {
      container.innerHTML = `<p class="text-red-400">Error: ${err.message || 'Error desconocido'}</p>`;
    }
  }
}

async function loadInvestorDetail(investorId) {
  try {
    selectedInvestorId = investorId;
    const data = await API.investments.getInvestorInvestments(investorId);
    
    // Mostrar sección de detalle
    const detailSection = document.getElementById('inv-detail-section');
    if (detailSection) {
      detailSection.classList.remove('hidden');
    }

    // Actualizar título
    const title = document.getElementById('inv-detail-title');
    if (title) {
      title.textContent = `Inversión: ${data.investorName || 'Sin nombre'}`;
    }

    // Resumen
    const summary = document.getElementById('inv-summary');
    if (summary) {
      summary.innerHTML = `
        <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
          <p class="text-xs text-slate-400 theme-light:text-slate-600">Total Inversión</p>
          <p class="text-lg font-bold text-white theme-light:text-slate-900">${money(data.totalInvestment || 0)}</p>
        </div>
        <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
          <p class="text-xs text-slate-400 theme-light:text-slate-600">Disponible</p>
          <p class="text-lg font-bold text-green-400 theme-light:text-green-600">${money(data.availableValue || 0)}</p>
        </div>
        <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
          <p class="text-xs text-slate-400 theme-light:text-slate-600">Vendido</p>
          <p class="text-lg font-bold text-yellow-400 theme-light:text-yellow-600">${money(data.soldValue || 0)}</p>
        </div>
        <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
          <p class="text-xs text-slate-400 theme-light:text-slate-600">Pagado</p>
          <p class="text-lg font-bold text-blue-400 theme-light:text-blue-600">${money(data.paidValue || 0)}</p>
        </div>
        <div class="bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white rounded-lg p-4 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300">
          <p class="text-xs text-slate-400 theme-light:text-slate-600">Pendiente</p>
          <p class="text-lg font-bold text-orange-400 theme-light:text-orange-600">${money((data.soldValue || 0) - (data.paidValue || 0))}</p>
        </div>
      `;
    }

    // Items disponibles
    renderAvailableItems(data.available || []);
    
    // Items vendidos
    renderSoldItems(data.sold || []);
    
    // Items pagados
    renderPaidItems(data.paid || []);

  } catch (err) {
    console.error('Error cargando detalle de inversor:', err);
    alert('Error: ' + (err.message || 'Error desconocido'));
  }
}

function renderAvailableItems(items) {
  const tbody = document.getElementById('inv-available-items');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-400 theme-light:text-slate-600 py-4">No hay items disponibles</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const itemName = item.itemId?.name || item.itemId?.sku || 'N/A';
    const total = (item.purchasePrice || 0) * (item.qty || 0);
    return `
      <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
        <td class="px-4 py-3">${escapeHtml(itemName)}</td>
        <td class="px-4 py-3 text-right">${item.qty || 0}</td>
        <td class="px-4 py-3 text-right">${money(item.purchasePrice || 0)}</td>
        <td class="px-4 py-3 text-right">${money(total)}</td>
      </tr>
    `;
  }).join('');
}

function renderSoldItems(items) {
  const tbody = document.getElementById('inv-sold-items');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-slate-400 theme-light:text-slate-600 py-4">No hay items vendidos</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const itemName = item.itemId?.name || item.itemId?.sku || 'N/A';
    const total = (item.purchasePrice || 0) * (item.qty || 0);
    const saleNumber = item.saleId?.number || 'N/A';
    const saleStatus = item.saleId?.status || 'unknown';
    const canPay = saleStatus === 'closed' && item.status === 'sold';
    const invItemId = item._id || item.id;
    
    return `
      <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
        <td class="px-4 py-3">
          ${canPay ? `<input type="checkbox" data-inv-item-id="${invItemId}" data-total="${total}" class="inv-item-checkbox w-4 h-4" />` : ''}
        </td>
        <td class="px-4 py-3">${escapeHtml(itemName)}</td>
        <td class="px-4 py-3 text-right">${item.qty || 0}</td>
        <td class="px-4 py-3 text-right">${money(item.purchasePrice || 0)}</td>
        <td class="px-4 py-3 text-right">${money(total)}</td>
        <td class="px-4 py-3">${escapeHtml(saleNumber)}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-1 rounded text-xs ${saleStatus === 'closed' ? 'bg-green-600' : 'bg-yellow-600'} text-white">${saleStatus === 'closed' ? 'Cerrada' : saleStatus}</span>
        </td>
      </tr>
    `;
  }).join('');

  // Agregar event listeners a checkboxes
  tbody.querySelectorAll('.inv-item-checkbox').forEach(cb => {
    cb.addEventListener('change', updatePayButton);
  });
}

function renderPaidItems(items) {
  const tbody = document.getElementById('inv-paid-items');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-400 theme-light:text-slate-600 py-4">No hay items pagados</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const itemName = item.itemId?.name || item.itemId?.sku || 'N/A';
    const total = (item.purchasePrice || 0) * (item.qty || 0);
    const saleNumber = item.saleId?.number || 'N/A';
    const paidAt = item.paidAt ? new Date(item.paidAt).toLocaleDateString() : 'N/A';
    
    return `
      <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
        <td class="px-4 py-3">${escapeHtml(itemName)}</td>
        <td class="px-4 py-3 text-right">${item.qty || 0}</td>
        <td class="px-4 py-3 text-right">${money(item.purchasePrice || 0)}</td>
        <td class="px-4 py-3 text-right">${money(total)}</td>
        <td class="px-4 py-3">${escapeHtml(saleNumber)}</td>
        <td class="px-4 py-3">${paidAt}</td>
      </tr>
    `;
  }).join('');
}

function updatePayButton() {
  const checked = document.querySelectorAll('#inv-sold-items input[type="checkbox"]:checked');
  const btn = document.getElementById('inv-pay-selected');
  if (btn) {
    if (checked.length > 0) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  }
}

async function paySelectedItems() {
  const checked = Array.from(document.querySelectorAll('#inv-sold-items input[type="checkbox"]:checked'));
  if (checked.length === 0) {
    alert('Selecciona al menos un item para cobrar');
    return;
  }

  const items = checked.map(cb => ({
    investmentItemId: cb.getAttribute('data-inv-item-id'),
    amount: parseFloat(cb.getAttribute('data-total') || 0)
  }));

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  // Cargar cuentas para seleccionar
  try {
    const accountsData = await API.accounts.balances();
    const accounts = accountsData.balances || [];
    
    if (accounts.length === 0) {
      alert('No hay cuentas disponibles. Crea una cuenta primero.');
      return;
    }

    const accountOptions = accounts.map(acc => 
      `<option value="${acc.accountId || acc._id}">${escapeHtml(acc.name || 'Sin nombre')} - ${money(acc.balance || 0)}</option>`
    ).join('');

    const modalContent = `
      <div class="p-6">
        <h3 class="text-xl font-semibold text-white theme-light:text-slate-900 mb-4">Cobrar Items</h3>
        <p class="text-slate-300 theme-light:text-slate-700 mb-4">Total a cobrar: <strong>${money(total)}</strong></p>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Cuenta</label>
            <select id="pay-account-id" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500">
              ${accountOptions}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 theme-light:text-slate-700 mb-2">Nota (opcional)</label>
            <input id="pay-note" placeholder="ej: Pago de inversión" class="w-full px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 theme-light:bg-white theme-light:text-slate-900 theme-light:border-slate-300 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button id="pay-confirm" class="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors">Confirmar</button>
          <button id="pay-cancel" class="px-6 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-600/50 transition-colors theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:border-slate-300 theme-light:hover:bg-slate-300">Cancelar</button>
        </div>
      </div>
    `;

    // Usar el modal global si existe
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    if (modal && modalBody) {
      modalBody.innerHTML = modalContent;
      modal.classList.remove('hidden');

      document.getElementById('pay-confirm')?.addEventListener('click', async () => {
        const accountId = document.getElementById('pay-account-id')?.value;
        const note = document.getElementById('pay-note')?.value || '';

        if (!accountId) {
          alert('Selecciona una cuenta');
          return;
        }

        try {
          await API.investments.payInvestment(selectedInvestorId, {
            items: items.map(item => item.investmentItemId),
            accountId,
            note
          });

          alert('Pago registrado exitosamente');
          modal.classList.add('hidden');
          loadInvestorDetail(selectedInvestorId);
        } catch (err) {
          alert('Error: ' + (err.message || 'Error desconocido'));
        }
      });

      document.getElementById('pay-cancel')?.addEventListener('click', () => {
        modal.classList.add('hidden');
      });

      document.getElementById('modalClose')?.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    } else {
      alert('Modal no disponible');
    }
  } catch (err) {
    alert('Error cargando cuentas: ' + (err.message || 'Error desconocido'));
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
