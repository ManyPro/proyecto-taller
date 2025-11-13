// ========== GESTIÓN DE VEHÍCULOS PENDIENTES ==========

let currentPage = 1;
let pageSize = 25;
let currentStatus = 'pending';
let vehicles = [];
let stats = { pending: 0, approved: 0, rejected: 0, deleted: 0, total: 0 };

function getAPI() {
  if (window.API) return window.API;
  return new Proxy({}, {
    get: () => () => Promise.reject(new Error('API no disponible'))
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(date) {
  if (!date) return 'N/A';
  try {
    return dayjs(date).format('DD/MM/YYYY HH:mm');
  } catch {
    return String(date);
  }
}

function showError(message) {
  alert('Error: ' + message);
}

function showSuccess(message) {
  alert('Éxito: ' + message);
}

// Inicialización
function initPendientes() {
  const checkAPI = setInterval(() => {
    if (window.API && window.API.profiles && window.API.profiles.unassignedVehicles) {
      clearInterval(checkAPI);
      loadStats();
      loadVehicles();
      setupEventListeners();
    }
  }, 100);
  
  setTimeout(() => {
    clearInterval(checkAPI);
    if (window.API && window.API.profiles && window.API.profiles.unassignedVehicles) {
      loadStats();
      loadVehicles();
      setupEventListeners();
    }
  }, 5000);
}

function setupEventListeners() {
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    loadStats();
    loadVehicles();
  });
  
  document.getElementById('btn-apply-filters')?.addEventListener('click', () => {
    currentPage = 1;
    loadVehicles();
  });
  
  document.getElementById('filter-status')?.addEventListener('change', (e) => {
    currentStatus = e.target.value;
    currentPage = 1;
    loadVehicles();
  });
  
  document.getElementById('btn-prev')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadVehicles();
    }
  });
  
  document.getElementById('btn-next')?.addEventListener('click', () => {
    currentPage++;
    loadVehicles();
  });
  
  // Modal close
  document.getElementById('modalClose')?.addEventListener('click', () => {
    document.getElementById('modal')?.classList.add('hidden');
  });
  
  document.getElementById('modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal') {
      document.getElementById('modal')?.classList.add('hidden');
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('modal')?.classList.add('hidden');
    }
  });
}

async function loadStats() {
  try {
    const api = getAPI();
    const res = await api.profiles?.unassignedVehicles?.stats();
    if (res) {
      stats = res;
      updateStats();
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

function updateStats() {
  const pendingEl = document.getElementById('stats-pending');
  const approvedEl = document.getElementById('stats-approved');
  const rejectedEl = document.getElementById('stats-rejected');
  const totalEl = document.getElementById('stats-total');
  
  if (pendingEl) pendingEl.textContent = stats.pending || 0;
  if (approvedEl) approvedEl.textContent = stats.approved || 0;
  if (rejectedEl) rejectedEl.textContent = stats.rejected || 0;
  if (totalEl) totalEl.textContent = stats.total || 0;
}

async function loadVehicles() {
  try {
    const api = getAPI();
    const plate = document.getElementById('filter-plate')?.value.trim().toUpperCase() || '';
    const name = document.getElementById('filter-name')?.value.trim() || '';
    
    const params = {
      status: currentStatus,
      page: currentPage,
      pageSize: pageSize
    };
    
    const res = await api.profiles?.unassignedVehicles?.list(params);
    if (res && res.items) {
      vehicles = res.items;
      
      // Filtrar por placa y nombre si hay búsqueda
      let filtered = vehicles;
      if (plate) {
        filtered = filtered.filter(v => 
          (v.vehicleData?.plate || '').includes(plate) ||
          (v.profileId?.plate || '').includes(plate)
        );
      }
      if (name) {
        filtered = filtered.filter(v => 
          (v.customer?.name || '').toLowerCase().includes(name.toLowerCase())
        );
      }
      
      renderVehicles(filtered);
      updatePagination(res.total || 0);
    }
  } catch (err) {
    console.error('Error loading vehicles:', err);
    showError('Error al cargar vehículos pendientes');
    document.getElementById('vehicles-list').innerHTML = '<div class="text-center text-red-400 py-8">Error al cargar datos</div>';
  }
}

function renderVehicles(items) {
  const container = document.getElementById('vehicles-list');
  if (!container) return;
  
  if (items.length === 0) {
    container.innerHTML = '<div class="text-center text-slate-400 py-8">No hay vehículos pendientes</div>';
    return;
  }
  
  container.innerHTML = items.map(v => {
    const vehicleData = v.vehicleData || {};
    const customer = v.customer || {};
    const suggested = v.suggestedVehicle || {};
    
    return `
      <div class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 p-4">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2">
              <span class="font-mono font-bold text-lg text-white dark:text-white theme-light:text-slate-900">${escapeHtml(vehicleData.plate || 'Sin placa')}</span>
              <span class="px-2 py-1 rounded text-xs ${v.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : v.status === 'approved' ? 'bg-green-500/20 text-green-400' : v.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'}">${v.status === 'pending' ? 'Pendiente' : v.status === 'approved' ? 'Aprobado' : v.status === 'rejected' ? 'Rechazado' : 'Eliminado'}</span>
            </div>
            <div class="text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">
              <strong>Cliente:</strong> ${escapeHtml(customer.name || 'Sin nombre')}
            </div>
            ${customer.idNumber ? `<div class="text-xs text-slate-400 mb-1">ID: ${escapeHtml(customer.idNumber)}</div>` : ''}
            ${customer.phone ? `<div class="text-xs text-slate-400 mb-2">Tel: ${escapeHtml(customer.phone)}</div>` : ''}
            <div class="text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">
              <strong>Vehículo Legacy:</strong> ${escapeHtml(vehicleData.brand || '')} ${escapeHtml(vehicleData.line || '')} ${escapeHtml(vehicleData.engine || '')}
            </div>
            ${suggested.vehicleId ? `
              <div class="text-sm text-green-400 dark:text-green-400 theme-light:text-green-600 mt-2">
                <strong>Vehículo Sugerido:</strong> ${escapeHtml(suggested.make || '')} ${escapeHtml(suggested.line || '')} ${escapeHtml(suggested.displacement || '')}
                ${suggested.matchType ? `<span class="text-xs ml-2">(${suggested.matchType === 'exact' ? 'Coincidencia exacta' : 'Similitud de cilindraje'})</span>` : ''}
              </div>
            ` : '<div class="text-sm text-yellow-400 mt-2">No se encontró vehículo sugerido</div>'}
            ${v.notes ? `<div class="text-xs text-slate-400 mt-2">Notas: ${escapeHtml(v.notes)}</div>` : ''}
            <div class="text-xs text-slate-400 mt-2">Creado: ${formatDate(v.createdAt)}</div>
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            ${v.status === 'pending' ? `
              <button onclick="approveVehicle('${v._id}')" class="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors whitespace-nowrap">✓ Aprobar</button>
              <button onclick="rejectVehicle('${v._id}')" class="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors whitespace-nowrap">✗ Rechazar</button>
              <button onclick="showVehicleDetail('${v._id}')" class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors whitespace-nowrap">Ver Detalles</button>
            ` : ''}
            <button onclick="deleteVehicle('${v._id}')" class="px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm rounded transition-colors whitespace-nowrap">Eliminar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updatePagination(total) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);
  
  const pageInfo = document.getElementById('page-info');
  const totalInfo = document.getElementById('total-info');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  
  if (pageInfo) pageInfo.textContent = `${start}-${end}`;
  if (totalInfo) totalInfo.textContent = total || 0;
  if (btnPrev) btnPrev.disabled = currentPage <= 1;
  if (btnNext) btnNext.disabled = end >= total;
}

// Funciones globales para onclick
window.approveVehicle = async function(id) {
  if (!confirm('¿Aprobar la asignación de este vehículo al cliente?')) return;
  
  try {
    const api = getAPI();
    await api.profiles?.unassignedVehicles?.approve(id);
    showSuccess('Vehículo aprobado correctamente');
    loadStats();
    loadVehicles();
  } catch (err) {
    console.error('Error approving vehicle:', err);
    showError(err?.message || 'Error al aprobar vehículo');
  }
};

window.rejectVehicle = async function(id) {
  if (!confirm('¿Rechazar la asignación? El cliente permanecerá sin vehículo asignado.')) return;
  
  try {
    const api = getAPI();
    await api.profiles?.unassignedVehicles?.reject(id);
    showSuccess('Asignación rechazada');
    loadStats();
    loadVehicles();
  } catch (err) {
    console.error('Error rejecting vehicle:', err);
    showError(err?.message || 'Error al rechazar asignación');
  }
};

window.deleteVehicle = async function(id) {
  const deleteProfile = confirm('¿Eliminar también el perfil del cliente?');
  if (!confirm(`¿Eliminar este registro${deleteProfile ? ' y el perfil del cliente' : ''}?`)) return;
  
  try {
    const api = getAPI();
    await api.profiles?.unassignedVehicles?.delete(id, deleteProfile);
    showSuccess('Registro eliminado');
    loadStats();
    loadVehicles();
  } catch (err) {
    console.error('Error deleting vehicle:', err);
    showError(err?.message || 'Error al eliminar registro');
  }
};

window.showVehicleDetail = async function(id) {
  try {
    const api = getAPI();
    const res = await api.profiles?.unassignedVehicles?.get(id);
    if (!res || !res.item) {
      showError('No se encontró el vehículo');
      return;
    }
    
    const v = res.item;
    const vehicleData = v.vehicleData || {};
    const customer = v.customer || {};
    const suggested = v.suggestedVehicle || {};
    
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;
    
    modalBody.innerHTML = `
      <h2 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">Detalles del Vehículo Pendiente</h2>
      <div class="space-y-4">
        <div>
          <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Información del Cliente</h3>
          <div class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-100 rounded-lg p-4 space-y-2">
            <div><strong>Nombre:</strong> ${escapeHtml(customer.name || 'Sin nombre')}</div>
            ${customer.idNumber ? `<div><strong>ID:</strong> ${escapeHtml(customer.idNumber)}</div>` : ''}
            ${customer.phone ? `<div><strong>Teléfono:</strong> ${escapeHtml(customer.phone)}</div>` : ''}
            ${customer.email ? `<div><strong>Email:</strong> ${escapeHtml(customer.email)}</div>` : ''}
            ${customer.address ? `<div><strong>Dirección:</strong> ${escapeHtml(customer.address)}</div>` : ''}
          </div>
        </div>
        <div>
          <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Información del Vehículo (Legacy)</h3>
          <div class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-100 rounded-lg p-4 space-y-2">
            <div><strong>Placa:</strong> <span class="font-mono">${escapeHtml(vehicleData.plate || 'Sin placa')}</span></div>
            <div><strong>Marca:</strong> ${escapeHtml(vehicleData.brand || 'N/A')}</div>
            <div><strong>Línea:</strong> ${escapeHtml(vehicleData.line || 'N/A')}</div>
            <div><strong>Cilindraje:</strong> ${escapeHtml(vehicleData.engine || 'N/A')}</div>
            ${vehicleData.year ? `<div><strong>Año:</strong> ${vehicleData.year}</div>` : ''}
          </div>
        </div>
        ${suggested.vehicleId ? `
          <div>
            <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Vehículo Sugerido</h3>
            <div class="bg-green-900/20 dark:bg-green-900/20 theme-light:bg-green-50 rounded-lg p-4 space-y-2">
              <div><strong>Marca:</strong> ${escapeHtml(suggested.make || 'N/A')}</div>
              <div><strong>Línea:</strong> ${escapeHtml(suggested.line || 'N/A')}</div>
              <div><strong>Cilindraje:</strong> ${escapeHtml(suggested.displacement || 'N/A')}</div>
              ${suggested.matchType ? `<div><strong>Tipo de coincidencia:</strong> ${suggested.matchType === 'exact' ? 'Coincidencia exacta' : 'Similitud de cilindraje'}</div>` : ''}
              ${suggested.confidence ? `<div><strong>Confianza:</strong> ${escapeHtml(suggested.confidence)}</div>` : ''}
            </div>
          </div>
        ` : ''}
        <div>
          <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Estado y Metadatos</h3>
          <div class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-100 rounded-lg p-4 space-y-2">
            <div><strong>Estado:</strong> <span class="px-2 py-1 rounded text-xs ${v.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : v.status === 'approved' ? 'bg-green-500/20 text-green-400' : v.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'}">${v.status === 'pending' ? 'Pendiente' : v.status === 'approved' ? 'Aprobado' : v.status === 'rejected' ? 'Rechazado' : 'Eliminado'}</span></div>
            <div><strong>Creado:</strong> ${formatDate(v.createdAt)}</div>
            <div><strong>Actualizado:</strong> ${formatDate(v.updatedAt)}</div>
            ${v.notes ? `<div><strong>Notas:</strong> ${escapeHtml(v.notes)}</div>` : ''}
          </div>
        </div>
        ${v.status === 'pending' ? `
          <div class="flex gap-2 pt-4">
            <button onclick="approveVehicle('${v._id}'); document.getElementById('modal').classList.add('hidden');" class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors">Aprobar</button>
            <button onclick="rejectVehicle('${v._id}'); document.getElementById('modal').classList.add('hidden');" class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors">Rechazar</button>
          </div>
        ` : ''}
      </div>
    `;
    
    document.getElementById('modal')?.classList.remove('hidden');
  } catch (err) {
    console.error('Error loading vehicle detail:', err);
    showError('Error al cargar detalles del vehículo');
  }
};

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPendientes);
} else {
  initPendientes();
}

