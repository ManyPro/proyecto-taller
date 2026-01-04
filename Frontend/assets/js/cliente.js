// Frontend/assets/js/cliente.js
// Página de consulta de servicios para clientes

const API_BASE = (typeof window !== 'undefined' && window.BACKEND_URL) ? window.BACKEND_URL : 
                (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

// Estado de la aplicación
const state = {
  companyId: null,
  plate: null,
  phonePassword: null,
  customer: null,
  servicesHistory: [],
  schedule: null,
  companies: [],
  filteredCompanies: []
};

// Clave para localStorage del taller favorito
const FAVORITE_COMPANY_KEY = 'cliente_favorite_company';

// Obtener taller favorito de localStorage
function getFavoriteCompany() {
  try {
    const favorite = localStorage.getItem(FAVORITE_COMPANY_KEY);
    return favorite ? JSON.parse(favorite) : null;
  } catch {
    return null;
  }
}

// Guardar taller favorito en localStorage
function saveFavoriteCompany(company) {
  try {
    localStorage.setItem(FAVORITE_COMPANY_KEY, JSON.stringify(company));
  } catch (err) {
    console.error('Error guardando taller favorito:', err);
  }
}

// Eliminar taller favorito
function removeFavoriteCompany() {
  try {
    localStorage.removeItem(FAVORITE_COMPANY_KEY);
  } catch (err) {
    console.error('Error eliminando taller favorito:', err);
  }
}

// Obtener companyId de la URL, favorito o input
function getCompanyId() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlCompanyId = urlParams.get('companyId');
  
  if (urlCompanyId) return urlCompanyId;
  
  const favorite = getFavoriteCompany();
  if (favorite) return favorite.id;
  
  const input = document.getElementById('companyId');
  return input?.value?.trim() || null;
}

// Formatear fecha
function formatDate(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

// Formatear moneda
function formatCurrency(amount) {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount || 0);
  } catch {
    return `$${amount || 0}`;
  }
}

// Formatear número con separadores de miles
function formatNumber(num) {
  return new Intl.NumberFormat('es-CO').format(num || 0);
}

// Escapar HTML para prevenir XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Mostrar error
function showError(message) {
  const errorDiv = document.getElementById('loginError');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
  }
}

// Ocultar error
function hideError() {
  const errorDiv = document.getElementById('loginError');
  if (errorDiv) {
    errorDiv.classList.add('hidden');
  }
}

// Autenticar cliente
async function authenticateCustomer(companyId, plate, phonePassword) {
  try {
    const response = await fetch(`${API_BASE}/api/v1/public/customer/${companyId}/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ plate, phonePassword })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al autenticar');
    }

    return data;
  } catch (error) {
    throw error;
  }
}

// Obtener servicios del vehículo
async function getVehicleServices(companyId, plate, phonePassword) {
  try {
    const response = await fetch(
      `${API_BASE}/api/v1/public/customer/${companyId}/services?plate=${encodeURIComponent(plate)}`,
      {
        headers: {
          'X-Phone-Password': phonePassword
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al obtener servicios');
    }

    return data;
  } catch (error) {
    throw error;
  }
}

// Obtener planilla de servicios
async function getVehicleSchedule(companyId, plate, phonePassword) {
  try {
    const response = await fetch(
      `${API_BASE}/api/v1/public/customer/${companyId}/schedule?plate=${encodeURIComponent(plate)}`,
      {
        headers: {
          'X-Phone-Password': phonePassword
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al obtener planilla');
    }

    return data;
  } catch (error) {
    throw error;
  }
}

// Renderizar información del vehículo
function renderVehicleInfo(vehicle) {
  const container = document.getElementById('vehicleInfo');
  if (!container) return;

  const infoCards = [
    {
      icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`,
      label: 'Placa',
      value: vehicle.plate || '-',
      color: 'blue'
    },
    {
      icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>`,
      label: 'Marca',
      value: vehicle.brand || '-',
      color: 'purple'
    },
    {
      icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
      label: 'Línea',
      value: vehicle.line || '-',
      color: 'green'
    },
    {
      icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`,
      label: 'Kilometraje',
      value: vehicle.currentMileage ? formatNumber(vehicle.currentMileage) + ' km' : '-',
      color: 'yellow'
    }
  ];

  container.innerHTML = infoCards.map(card => `
    <div class="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600 transition-all service-card">
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-${card.color}-600/20 rounded-lg">
          ${card.icon}
        </div>
        <p class="text-xs text-slate-400 uppercase tracking-wide">${card.label}</p>
      </div>
      <p class="text-xl font-bold text-white">${card.value}</p>
    </div>
  `).join('');
}

// Renderizar historial de servicios
function renderServicesHistory(servicesHistory) {
  const container = document.getElementById('servicesList');
  const noServices = document.getElementById('noServices');
  
  if (!container) return;

  if (!servicesHistory || servicesHistory.length === 0) {
    container.innerHTML = '';
    if (noServices) noServices.classList.remove('hidden');
    return;
  }

  if (noServices) noServices.classList.add('hidden');

  container.innerHTML = servicesHistory.map(sale => {
    const servicesList = sale.services.map(service => 
      `<li class="flex justify-between items-center py-2.5 px-3 bg-slate-900/30 rounded-lg hover:bg-slate-900/50 transition-colors">
        <span class="text-white font-medium flex items-center gap-2">
          <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          ${escapeHtml(service.name)}
        </span>
        <span class="text-blue-400 font-semibold">${formatCurrency(service.total)}</span>
      </li>`
    ).join('');

    return `
      <div class="bg-gradient-to-br from-slate-900/70 to-slate-800/70 rounded-xl p-5 border border-slate-700/50 hover:border-slate-600 transition-all service-card">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2">
              <div class="p-1.5 bg-blue-600/20 rounded-lg">
                <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
              </div>
              <h4 class="text-lg font-bold text-white">Remisión #${escapeHtml(String(sale.saleNumber || 'N/A'))}</h4>
            </div>
            <div class="flex items-center gap-2 text-sm text-slate-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
              ${formatDate(sale.date)}
            </div>
            ${sale.technician ? `
              <div class="flex items-center gap-2 text-sm text-slate-400 mt-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                Técnico: ${escapeHtml(sale.technician)}
              </div>
            ` : ''}
          </div>
          <div class="text-right sm:text-left sm:ml-auto">
            <p class="text-xs text-slate-400 mb-1">Total</p>
            <p class="text-2xl font-bold text-white">${formatCurrency(sale.total)}</p>
            ${sale.mileage ? `
              <div class="flex items-center justify-end gap-1 mt-2 text-sm text-slate-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
                ${formatNumber(sale.mileage)} km
              </div>
            ` : ''}
          </div>
        </div>
        <div class="border-t border-slate-700/50 pt-4">
          <p class="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wide">Servicios Realizados</p>
          <ul class="space-y-2">
            ${servicesList}
          </ul>
        </div>
      </div>
    `;
  }).join('');
}

// Renderizar planilla de servicios
function renderSchedule(schedule) {
  const container = document.getElementById('scheduleList');
  const noSchedule = document.getElementById('noSchedule');
  const currentMileageEl = document.getElementById('currentMileage');
  const mileageUpdatedAtEl = document.getElementById('mileageUpdatedAt');

  if (currentMileageEl && schedule) {
    currentMileageEl.textContent = schedule.currentMileage ? formatNumber(schedule.currentMileage) + ' km' : '-';
  }

  if (mileageUpdatedAtEl && schedule && schedule.mileageUpdatedAt) {
    mileageUpdatedAtEl.textContent = formatDate(schedule.mileageUpdatedAt);
  }

  if (!container) return;

  if (!schedule || !schedule.services || schedule.services.length === 0) {
    container.innerHTML = '';
    if (noSchedule) noSchedule.classList.remove('hidden');
    return;
  }

  if (noSchedule) noSchedule.classList.add('hidden');

  // Separar servicios por estado para mejor organización
  const completed = schedule.services.filter(s => s.status === 'completed');
  const overdue = schedule.services.filter(s => s.status === 'overdue');
  const due = schedule.services.filter(s => s.status === 'due');
  const pending = schedule.services.filter(s => s.status === 'pending');

  const renderServiceCard = (service) => {
    const statusColors = {
      'pending': 'bg-slate-600',
      'due': 'bg-yellow-600',
      'overdue': 'bg-red-600',
      'completed': 'bg-green-600'
    };

    const statusLabels = {
      'pending': 'Pendiente',
      'due': 'Próximo',
      'overdue': 'Vencido',
      'completed': 'Completado'
    };

    const statusColor = statusColors[service.status] || 'bg-slate-600';
    const statusLabel = statusLabels[service.status] || service.status;

    // Calcular progreso si hay último servicio y próximo
    let progressHTML = '';
    if (service.lastPerformedMileage && service.nextDueMileage && schedule.currentMileage) {
      const totalInterval = service.mileageInterval;
      const currentProgress = schedule.currentMileage - service.lastPerformedMileage;
      const progressPercent = Math.min(100, Math.max(0, (currentProgress / totalInterval) * 100));
      const isOverdue = schedule.currentMileage >= service.nextDueMileage;
      
      progressHTML = `
        <div class="mt-3">
          <div class="flex justify-between text-xs mb-1">
            <span class="text-slate-400">Progreso</span>
            <span class="text-slate-300">${Math.round(progressPercent)}%</span>
          </div>
          <div class="w-full bg-slate-700 rounded-full h-2">
            <div 
              class="h-2 rounded-full ${isOverdue ? 'bg-red-500' : progressPercent >= 80 ? 'bg-yellow-500' : 'bg-blue-500'}" 
              style="width: ${progressPercent}%"
            ></div>
          </div>
          <div class="flex justify-between text-xs mt-1 text-slate-400">
            <span>${formatNumber(service.lastPerformedMileage)} km</span>
            <span>${formatNumber(service.nextDueMileage)} km</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="bg-gradient-to-br from-slate-900/70 to-slate-800/70 rounded-xl p-5 border border-slate-700/50 hover:border-slate-600 transition-all service-card">
        <div class="flex justify-between items-start mb-4">
          <h4 class="text-lg font-bold text-white flex-1">${escapeHtml(service.serviceName)}</h4>
          <span class="px-3 py-1.5 rounded-full text-xs font-bold text-white ${statusColor} shadow-lg ml-3">
            ${statusLabel}
          </span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div class="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
            <div class="flex items-center gap-2 mb-2">
              <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
              </svg>
              <p class="text-xs text-slate-400 uppercase tracking-wide">Intervalo</p>
            </div>
            <p class="text-white font-bold text-lg">${formatNumber(service.mileageInterval)} km</p>
          </div>
          ${service.lastPerformedMileage ? `
            <div class="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-xs text-slate-400 uppercase tracking-wide">Último</p>
              </div>
              <p class="text-white font-bold text-lg">${formatNumber(service.lastPerformedMileage)} km</p>
              <p class="text-xs text-slate-500 mt-1">${formatDate(service.lastPerformedDate)}</p>
            </div>
          ` : `
            <div class="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-xs text-slate-400 uppercase tracking-wide">Último</p>
              </div>
              <p class="text-slate-500 italic text-sm">Nunca realizado</p>
            </div>
          `}
          ${service.nextDueMileage ? `
            <div class="bg-slate-800/60 rounded-lg p-3 border ${service.status === 'overdue' ? 'border-red-500/50 border-l-4' : service.status === 'due' ? 'border-yellow-500/50 border-l-4' : 'border-slate-700/50'}">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 ${service.status === 'overdue' ? 'text-red-400' : service.status === 'due' ? 'text-yellow-400' : 'text-blue-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-xs text-slate-400 uppercase tracking-wide">Próximo</p>
              </div>
              <p class="text-white font-bold text-lg">${formatNumber(service.nextDueMileage)} km</p>
              ${schedule.currentMileage ? `
                <p class="text-xs mt-1 font-medium ${service.status === 'overdue' ? 'text-red-400' : service.status === 'due' ? 'text-yellow-400' : 'text-slate-400'}">
                  ${service.status === 'overdue' 
                    ? `⚠️ Vencido por ${formatNumber(schedule.currentMileage - service.nextDueMileage)} km`
                    : service.status === 'due'
                    ? `⏰ Próximo en ${formatNumber(service.nextDueMileage - schedule.currentMileage)} km`
                    : `Faltan ${formatNumber(service.nextDueMileage - schedule.currentMileage)} km`
                  }
                </p>
              ` : ''}
            </div>
          ` : ''}
        </div>
        ${progressHTML}
      </div>
    `;
  };

  let html = '';

  // Servicios vencidos (prioridad alta)
  if (overdue.length > 0) {
    html += `
      <div class="mb-8">
        <div class="flex items-center gap-3 mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div class="p-2 bg-red-500/20 rounded-lg">
            <svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-bold text-red-400">Servicios Vencidos</h3>
            <p class="text-sm text-red-300/70">${overdue.length} servicio${overdue.length !== 1 ? 's' : ''} requieren atención inmediata</p>
          </div>
        </div>
        <div class="space-y-4">
          ${overdue.map(renderServiceCard).join('')}
        </div>
      </div>
    `;
  }

  // Servicios próximos
  if (due.length > 0) {
    html += `
      <div class="mb-8">
        <div class="flex items-center gap-3 mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div class="p-2 bg-yellow-500/20 rounded-lg">
            <svg class="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-bold text-yellow-400">Próximos Servicios</h3>
            <p class="text-sm text-yellow-300/70">${due.length} servicio${due.length !== 1 ? 's' : ''} próximos a realizar</p>
          </div>
        </div>
        <div class="space-y-4">
          ${due.map(renderServiceCard).join('')}
        </div>
      </div>
    `;
  }

  // Servicios pendientes
  if (pending.length > 0) {
    html += `
      <div class="mb-8">
        <div class="flex items-center gap-3 mb-4 p-3 bg-slate-700/30 border border-slate-600/50 rounded-lg">
          <div class="p-2 bg-slate-600/20 rounded-lg">
            <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-bold text-slate-300">Servicios Pendientes</h3>
            <p class="text-sm text-slate-400">${pending.length} servicio${pending.length !== 1 ? 's' : ''} programado${pending.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div class="space-y-4">
          ${pending.map(renderServiceCard).join('')}
        </div>
      </div>
    `;
  }

  // Servicios completados (al final)
  if (completed.length > 0) {
    html += `
      <div class="mb-8">
        <div class="flex items-center gap-3 mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div class="p-2 bg-green-500/20 rounded-lg">
            <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-bold text-green-400">Servicios Completados</h3>
            <p class="text-sm text-green-300/70">${completed.length} servicio${completed.length !== 1 ? 's' : ''} realizado${completed.length !== 1 ? 's' : ''} correctamente</p>
          </div>
        </div>
        <div class="space-y-4">
          ${completed.map(renderServiceCard).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// Manejar login
async function handleLogin(e) {
  e.preventDefault();
  hideError();

  const plateInput = document.getElementById('plate');
  const phonePasswordInput = document.getElementById('phonePassword');
  const companyIdInput = document.getElementById('companyId');

  const plate = plateInput?.value?.trim().toUpperCase() || '';
  const phonePassword = phonePasswordInput?.value?.trim() || '';
  let companyId = companyIdInput?.value?.trim() || getCompanyId();

  if (!plate || !phonePassword) {
    showError('Por favor completa todos los campos');
    return;
  }

  if (!companyId) {
    showError('Por favor ingresa el ID del taller o configúralo en la URL como ?companyId=...');
    return;
  }

  try {
    // Autenticar
    const authResult = await authenticateCustomer(companyId, plate, phonePassword);
    
    state.companyId = companyId;
    state.plate = plate;
    state.phonePassword = phonePassword;
    state.customer = authResult.customer;

    // Ocultar formulario de login
    const loginSection = document.getElementById('loginSection');
    const contentSection = document.getElementById('contentSection');
    
    if (loginSection) loginSection.classList.add('hidden');
    if (contentSection) contentSection.classList.remove('hidden');

    // Renderizar información del vehículo
    renderVehicleInfo(state.customer.vehicle);

    // Cargar servicios
    await loadServices();
    await loadSchedule();
  } catch (error) {
    showError(error.message || 'Error al autenticar. Verifica tus datos.');
  }
}

// Cargar servicios
async function loadServices() {
  try {
    const data = await getVehicleServices(state.companyId, state.plate, state.phonePassword);
    state.servicesHistory = data.servicesHistory || [];
    renderServicesHistory(state.servicesHistory);
  } catch (error) {
    console.error('Error loading services:', error);
    const container = document.getElementById('servicesList');
    const noServices = document.getElementById('noServices');
    if (container) {
      container.innerHTML = `
        <div class="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-center">
          <svg class="w-12 h-12 mx-auto mb-3 text-red-400 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-red-400 font-medium">Error al cargar servicios</p>
          <p class="text-red-300 text-sm mt-1">${escapeHtml(error.message || 'Error desconocido')}</p>
        </div>
      `;
    }
    if (noServices) noServices.classList.add('hidden');
  }
}

// Cargar planilla
async function loadSchedule() {
  try {
    const data = await getVehicleSchedule(state.companyId, state.plate, state.phonePassword);
    state.schedule = data.schedule || null;
    renderSchedule(state.schedule);
  } catch (error) {
    console.error('Error loading schedule:', error);
    const container = document.getElementById('scheduleList');
    const noSchedule = document.getElementById('noSchedule');
    if (container) {
      container.innerHTML = `
        <div class="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-center">
          <svg class="w-12 h-12 mx-auto mb-3 text-red-400 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-red-400 font-medium">Error al cargar planilla</p>
          <p class="text-red-300 text-sm mt-1">${escapeHtml(error.message || 'Error desconocido')}</p>
        </div>
      `;
    }
    if (noSchedule) noSchedule.classList.add('hidden');
  }
}

// Manejar cambio de tabs
function setupTabs() {
  const tabServices = document.getElementById('tabServices');
  const tabSchedule = document.getElementById('tabSchedule');
  const servicesTab = document.getElementById('servicesTab');
  const scheduleTab = document.getElementById('scheduleTab');

  function switchTab(tab) {
    // Actualizar botones
    [tabServices, tabSchedule].forEach(btn => {
      if (btn) {
        btn.classList.remove('text-slate-300', 'border-blue-500');
        btn.classList.add('text-slate-400', 'border-transparent');
      }
    });
    
    if (tab === 'services') {
      if (tabServices) {
        tabServices.classList.remove('text-slate-400', 'border-transparent');
        tabServices.classList.add('text-slate-300', 'border-blue-500');
      }
      if (servicesTab) servicesTab.classList.remove('hidden');
      if (scheduleTab) scheduleTab.classList.add('hidden');
    } else {
      if (tabSchedule) {
        tabSchedule.classList.remove('text-slate-400', 'border-transparent');
        tabSchedule.classList.add('text-slate-300', 'border-blue-500');
      }
      if (servicesTab) servicesTab.classList.add('hidden');
      if (scheduleTab) scheduleTab.classList.remove('hidden');
    }
  }

  if (tabServices) {
    tabServices.addEventListener('click', () => switchTab('services'));
  }
  
  if (tabSchedule) {
    tabSchedule.addEventListener('click', () => switchTab('schedule'));
  }
}

// Manejar logout
function handleLogout() {
  state.companyId = null;
  state.plate = null;
  state.phonePassword = null;
  state.customer = null;
  state.servicesHistory = [];
  state.schedule = null;

  const loginSection = document.getElementById('loginSection');
  const contentSection = document.getElementById('contentSection');
  
  if (loginSection) loginSection.classList.remove('hidden');
  if (contentSection) contentSection.classList.add('hidden');

  // Limpiar formulario
  const form = document.getElementById('loginForm');
  if (form) form.reset();
}

// Cargar lista de talleres
async function loadCompanies() {
  try {
    const response = await fetch(`${API_BASE}/api/v1/public/customer/companies`);
    const data = await response.json();
    state.companies = data.companies || [];
    state.filteredCompanies = state.companies;
    return state.companies;
  } catch (error) {
    console.error('Error cargando talleres:', error);
    return [];
  }
}

// Renderizar lista de talleres en el dropdown
function renderCompanyDropdown(companies) {
  const dropdown = document.getElementById('companyDropdown');
  if (!dropdown) return;
  
  if (companies.length === 0) {
    dropdown.innerHTML = `
      <div class="p-4 text-center text-slate-400 text-sm">
        No se encontraron talleres
      </div>
    `;
    dropdown.classList.remove('hidden');
    return;
  }
  
  dropdown.innerHTML = companies.map(company => `
    <button
      type="button"
      class="w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors border-b border-slate-700/50 last:border-0 flex items-center justify-between group"
      data-company-id="${company.id}"
      data-company-name="${escapeHtml(company.name)}"
    >
      <div class="flex-1 min-w-0">
        <div class="font-medium text-white truncate">${escapeHtml(company.name)}</div>
        <div class="text-xs text-slate-400 truncate">${escapeHtml(company.email)}</div>
      </div>
      <svg class="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
      </svg>
    </button>
  `).join('');
  
  // Event listeners para seleccionar taller
  dropdown.querySelectorAll('button[data-company-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const companyId = btn.dataset.companyId;
      const companyName = btn.dataset.companyName;
      selectCompany(companyId, companyName);
    });
  });
  
  dropdown.classList.remove('hidden');
}

// Seleccionar un taller
function selectCompany(companyId, companyName) {
  const companyIdInput = document.getElementById('companyId');
  const searchInput = document.getElementById('companySearch');
  const dropdown = document.getElementById('companyDropdown');
  const selectedDiv = document.getElementById('selectedCompany');
  const selectedName = document.getElementById('selectedCompanyName');
  
  if (companyIdInput) companyIdInput.value = companyId;
  if (searchInput) searchInput.value = '';
  if (dropdown) dropdown.classList.add('hidden');
  if (selectedDiv) {
    selectedDiv.classList.remove('hidden');
    if (selectedName) selectedName.textContent = companyName;
  }
  
  // Guardar como favorito automáticamente
  saveFavoriteCompany({ id: companyId, name: companyName });
  showFavoriteIndicator();
}

// Mostrar indicador de favorito
function showFavoriteIndicator() {
  const favoriteDiv = document.getElementById('favoriteCompany');
  if (favoriteDiv) favoriteDiv.classList.remove('hidden');
}

// Ocultar indicador de favorito
function hideFavoriteIndicator() {
  const favoriteDiv = document.getElementById('favoriteCompany');
  if (favoriteDiv) favoriteDiv.classList.add('hidden');
}

// Filtrar talleres por búsqueda
function filterCompanies(searchTerm) {
  if (!searchTerm) {
    state.filteredCompanies = state.companies;
  } else {
    const term = searchTerm.toLowerCase();
    state.filteredCompanies = state.companies.filter(c => 
      c.name.toLowerCase().includes(term) || 
      c.email.toLowerCase().includes(term)
    );
  }
  renderCompanyDropdown(state.filteredCompanies);
}

// Inicializar
document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const logoutBtn = document.getElementById('logoutBtn');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  setupTabs();

  // Cargar lista de talleres
  await loadCompanies();
  
  // Verificar si hay taller favorito
  const favorite = getFavoriteCompany();
  if (favorite) {
    selectCompany(favorite.id, favorite.name);
    showFavoriteIndicator();
  }
  
  // Verificar si hay companyId en la URL
  const urlParams = new URLSearchParams(window.location.search);
  const urlCompanyId = urlParams.get('companyId');
  if (urlCompanyId) {
    // Buscar el nombre del taller
    const company = state.companies.find(c => c.id === urlCompanyId);
    if (company) {
      selectCompany(company.id, company.name);
    } else {
      // Si no está en la lista, solo establecer el ID
      const companyIdInput = document.getElementById('companyId');
      if (companyIdInput) companyIdInput.value = urlCompanyId;
    }
  }

  // Event listeners para búsqueda
  const companySearch = document.getElementById('companySearch');
  if (companySearch) {
    companySearch.addEventListener('input', (e) => {
      const term = e.target.value.trim();
      if (term) {
        filterCompanies(term);
      } else {
        const dropdown = document.getElementById('companyDropdown');
        if (dropdown) dropdown.classList.add('hidden');
      }
    });
    
    companySearch.addEventListener('focus', () => {
      if (companySearch.value.trim()) {
        filterCompanies(companySearch.value.trim());
      } else {
        renderCompanyDropdown(state.companies);
      }
    });
  }
  
  // Click fuera del dropdown para cerrarlo
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('companyDropdown');
    const searchInput = document.getElementById('companySearch');
    if (dropdown && !dropdown.contains(e.target) && e.target !== searchInput) {
      dropdown.classList.add('hidden');
    }
  });
  
  // Botón para limpiar selección
  const clearCompanyBtn = document.getElementById('clearCompany');
  if (clearCompanyBtn) {
    clearCompanyBtn.addEventListener('click', () => {
      const companyIdInput = document.getElementById('companyId');
      const searchInput = document.getElementById('companySearch');
      const selectedDiv = document.getElementById('selectedCompany');
      
      if (companyIdInput) companyIdInput.value = '';
      if (searchInput) searchInput.value = '';
      if (selectedDiv) selectedDiv.classList.add('hidden');
    });
  }
  
  // Botón para eliminar favorito
  const removeFavoriteBtn = document.getElementById('removeFavorite');
  if (removeFavoriteBtn) {
    removeFavoriteBtn.addEventListener('click', () => {
      removeFavoriteCompany();
      hideFavoriteIndicator();
    });
  }
});

