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

// Clave base para localStorage del taller favorito (por placa)
const FAVORITE_COMPANY_KEY_PREFIX = 'cliente_favorite_company_';
// Clave base para localStorage del kilometraje (por placa)
const MILEAGE_KEY_PREFIX = 'cliente_mileage_';

// Obtener clave de favorito para una placa específica
function getFavoriteKey(plate) {
  if (!plate) return null;
  return `${FAVORITE_COMPANY_KEY_PREFIX}${String(plate).trim().toUpperCase()}`;
}

// Obtener clave de kilometraje para una placa específica
function getMileageKey(plate) {
  if (!plate) return null;
  return `${MILEAGE_KEY_PREFIX}${String(plate).trim().toUpperCase()}`;
}

// Guardar kilometraje en localStorage por placa
function saveMileage(plate, mileage) {
  try {
    const key = getMileageKey(plate);
    if (!key) return;
    localStorage.setItem(key, String(mileage));
  } catch (err) {
    console.error('Error guardando kilometraje:', err);
  }
}

// Obtener kilometraje guardado por placa
function getSavedMileage(plate) {
  try {
    const key = getMileageKey(plate);
    if (!key) return null;
    const mileage = localStorage.getItem(key);
    return mileage ? Number(mileage) : null;
  } catch {
    return null;
  }
}

// Obtener taller favorito de localStorage por placa
function getFavoriteCompany(plate) {
  try {
    const key = getFavoriteKey(plate);
    if (!key) return null;
    const favorite = localStorage.getItem(key);
    return favorite ? JSON.parse(favorite) : null;
  } catch {
    return null;
  }
}

// Guardar taller favorito en localStorage por placa
function saveFavoriteCompany(company, plate) {
  try {
    const key = getFavoriteKey(plate);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(company));
  } catch (err) {
    console.error('Error guardando taller favorito:', err);
  }
}

// Eliminar taller favorito por placa
function removeFavoriteCompany(plate) {
  try {
    const key = getFavoriteKey(plate);
    if (!key) return;
    localStorage.removeItem(key);
  } catch (err) {
    console.error('Error eliminando taller favorito:', err);
  }
}

// Obtener companyId de la URL, favorito (por placa) o input
function getCompanyId(plate = null) {
  const urlParams = new URLSearchParams(window.location.search);
  const urlCompanyId = urlParams.get('companyId');
  
  if (urlCompanyId) return urlCompanyId;
  
  // Si hay placa, buscar favorito por placa
  if (plate) {
    const favorite = getFavoriteCompany(plate);
    if (favorite) return favorite.id;
  }
  
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

// Mostrar modal para ingresar kilometraje del servicio
function showMileageInputModal(serviceName) {
  return new Promise((resolve) => {
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    overlay.style.zIndex = '9999';
    
    // Crear modal
    const modal = document.createElement('div');
    modal.className = 'bg-slate-800 rounded-xl shadow-2xl border border-slate-700/50 w-full max-w-md transform transition-all';
    
    modal.innerHTML = `
      <div class="p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="p-2 bg-blue-600/20 rounded-lg">
            <svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </div>
          <h3 class="text-xl font-bold text-white">Kilometraje del Servicio</h3>
        </div>
        
        <p class="text-slate-300 mb-4">
          Ingresa el kilometraje en el que se realizó el servicio:
        </p>
        
        <p class="text-blue-400 font-semibold mb-6 text-lg">
          "${escapeHtml(serviceName)}"
        </p>
        
        <div class="mb-6">
          <label class="block text-sm font-medium text-slate-400 mb-2">
            Kilometraje (km)
          </label>
          <input
            type="number"
            id="serviceMileageInput"
            placeholder="Ej: 150000"
            class="w-full px-4 py-3 bg-slate-900/70 border-2 border-slate-600 rounded-lg text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            min="0"
            step="1"
            autofocus
          />
        </div>
        
        <div class="flex gap-3">
          <button
            id="cancelMileageBtn"
            class="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            id="confirmMileageBtn"
            class="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            Confirmar
          </button>
        </div>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const input = modal.querySelector('#serviceMileageInput');
    const confirmBtn = modal.querySelector('#confirmMileageBtn');
    const cancelBtn = modal.querySelector('#cancelMileageBtn');
    
    // Función para cerrar y resolver
    const close = (value) => {
      overlay.remove();
      resolve(value);
    };
    
    // Event listeners
    confirmBtn.addEventListener('click', () => {
      const value = input.value.trim();
      if (value) {
        close(value);
      } else {
        input.focus();
        input.classList.add('border-red-500');
        setTimeout(() => input.classList.remove('border-red-500'), 2000);
      }
    });
    
    cancelBtn.addEventListener('click', () => close(null));
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close(null);
      }
    });
    
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmBtn.click();
      } else if (e.key === 'Escape') {
        cancelBtn.click();
      }
    });
    
    // Focus en el input
    setTimeout(() => input.focus(), 100);
  });
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
function renderVehicleInfo(vehicle, plate) {
  const container = document.getElementById('vehicleInfo');
  if (!container) return;

  // Asegurar que la placa se muestre correctamente
  const plateValue = plate || state.plate || vehicle?.plate || '-';
  
  // Obtener kilometraje con prioridad: schedule > vehicle > guardado
  const savedMileage = getSavedMileage(plateValue !== '-' ? plateValue : state.plate);
  const currentMileage = state.schedule?.currentMileage || vehicle?.currentMileage || savedMileage || null;

  const infoCards = [
    {
      icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`,
      label: 'Placa',
      value: plateValue,
      color: 'blue',
      editable: false,
      bgColorClass: 'bg-blue-600/20',
      textColorClass: 'text-blue-400'
    },
    {
      icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>`,
      label: 'Marca',
      value: vehicle?.brand || '-',
      color: 'purple',
      editable: false,
      bgColorClass: 'bg-purple-600/20',
      textColorClass: 'text-purple-400'
    },
    {
      icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
      label: 'Línea',
      value: vehicle?.line || '-',
      color: 'green',
      editable: false,
      bgColorClass: 'bg-green-600/20',
      textColorClass: 'text-green-400'
    },
    {
      icon: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`,
      label: 'Kilometraje',
      value: currentMileage,
      color: 'yellow',
      editable: true,
      bgColorClass: 'bg-yellow-600/20',
      textColorClass: 'text-yellow-400',
      borderColorClass: 'border-yellow-500/50',
      borderFocusClass: 'focus:border-yellow-500',
      buttonBgClass: 'bg-yellow-600',
      buttonHoverClass: 'hover:bg-yellow-700'
    }
  ];

  container.innerHTML = infoCards.map(card => `
    <div class="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600 transition-all service-card">
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 ${card.bgColorClass} rounded-lg">
          ${card.icon}
        </div>
        <p class="text-xs text-slate-400 uppercase tracking-wide">${card.label}</p>
      </div>
      ${card.editable ? `
        <div class="flex items-center gap-3">
          <div class="flex-1 relative">
            <input
              type="number"
              id="currentMileageInput"
              value="${card.value || ''}"
              placeholder="Ingresar km"
              class="w-full text-2xl font-bold text-white bg-slate-800/50 border-2 ${card.borderColorClass} ${card.borderFocusClass} focus:outline-none focus:ring-2 focus:ring-yellow-500/50 rounded-lg px-4 py-3 transition-all"
              min="0"
              step="1"
            />
          </div>
          <span class="text-xl font-bold text-white whitespace-nowrap">km</span>
          <button
            id="updateMileageBtn"
            class="px-4 py-3 ${card.buttonBgClass} ${card.buttonHoverClass} text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center min-w-[48px]"
            title="Actualizar kilometraje"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </button>
        </div>
        <p class="text-xs text-slate-400 mt-2 flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Actualiza para calcular servicios próximos
        </p>
      ` : `
        <p class="text-xl font-bold text-white">${escapeHtml(String(card.value))}</p>
      `}
    </div>
  `).join('');

  // Event listener para actualizar kilometraje
  const updateBtn = document.getElementById('updateMileageBtn');
  const mileageInput = document.getElementById('currentMileageInput');
  
  if (updateBtn && mileageInput) {
    updateBtn.addEventListener('click', async () => {
      const newMileage = Number(mileageInput.value);
      if (!newMileage || newMileage < 0) {
        showError('Por favor ingresa un kilometraje válido');
        return;
      }
      await updateMileage(newMileage);
    });
    
    mileageInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const newMileage = Number(mileageInput.value);
        if (newMileage && newMileage >= 0) {
          await updateMileage(newMileage);
        }
      }
    });
  }
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

  // Si no hay schedule o servicios, mostrar mensaje apropiado
  if (!schedule) {
    container.innerHTML = '';
    if (noSchedule) noSchedule.classList.remove('hidden');
    return;
  }

  if (!schedule.services || schedule.services.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-8 text-center">
        <svg class="w-16 h-16 mx-auto mb-4 text-slate-500 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
        </svg>
        <p class="text-slate-300 font-medium text-lg mb-2">No hay servicios programados</p>
        <p class="text-slate-500 text-sm">Los servicios se configurarán cuando se realicen mantenimientos en el taller.</p>
        ${schedule.currentMileage ? `
          <p class="text-slate-400 text-xs mt-4">Kilometraje actual: ${formatNumber(schedule.currentMileage)} km</p>
        ` : ''}
      </div>
    `;
    if (noSchedule) noSchedule.classList.add('hidden');
    return;
  }

  if (noSchedule) noSchedule.classList.add('hidden');

  // Separar servicios por estado para mejor organización
  // ORDENAR: Completados primero, luego los demás por prioridad
  const completed = schedule.services.filter(s => s.status === 'completed');
  const overdue = schedule.services.filter(s => s.status === 'overdue');
  const due = schedule.services.filter(s => s.status === 'due');
  const pending = schedule.services.filter(s => s.status === 'pending');
  
  // Ordenar completados por fecha de último servicio (más reciente primero)
  completed.sort((a, b) => {
    if (a.lastPerformedDate && b.lastPerformedDate) {
      return new Date(b.lastPerformedDate) - new Date(a.lastPerformedDate);
    }
    if (a.lastPerformedDate) return -1;
    if (b.lastPerformedDate) return 1;
    return 0;
  });

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

    // Botones de acción solo si no está completado
    const actionButtons = service.status !== 'completed' ? `
      <div class="flex gap-2 mt-4 pt-4 border-t border-slate-700/50">
        <button
          type="button"
          class="service-action-btn flex-1 px-4 py-2 bg-green-600/20 hover:bg-green-600/30 border border-green-500/50 text-green-400 font-semibold rounded-lg transition-all text-sm"
          data-service-id="${service.id}"
          data-action="completed"
          title="Marcar como realizado"
        >
          <span class="flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            Ya realizado
          </span>
        </button>
        <button
          type="button"
          class="service-action-btn flex-1 px-4 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/50 text-yellow-400 font-semibold rounded-lg transition-all text-sm"
          data-service-id="${service.id}"
          data-action="skipped"
          title="Saltar este servicio"
        >
          <span class="flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
            Saltar
          </span>
        </button>
      </div>
    ` : `
      <div class="mt-4 pt-4 border-t border-slate-700/50">
        <p class="text-xs text-green-400 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Servicio completado
        </p>
      </div>
    `;

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
            <p class="text-white font-bold text-lg">
              ${service.mileageIntervalMax && service.mileageIntervalMax !== service.mileageInterval
                ? `${formatNumber(service.mileageInterval)} - ${formatNumber(service.mileageIntervalMax)} km`
                : `${formatNumber(service.mileageInterval)} km`
              }
            </p>
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
        ${actionButtons}
      </div>
    `;
  };

  let html = '';

  // SERVICIOS COMPLETADOS PRIMERO (como solicitó el usuario)
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
            <p class="text-sm text-green-300/70">${completed.length} servicio${completed.length !== 1 ? 's' : ''} completado${completed.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div class="space-y-4">
          ${completed.map(renderServiceCard).join('')}
        </div>
      </div>
    `;
  }

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


  container.innerHTML = html;
  
  // Event listeners para botones de acción
  container.querySelectorAll('.service-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const serviceId = btn.dataset.serviceId;
      const action = btn.dataset.action;
      
      if (!serviceId || !action) return;
      
      // Si es "completed", pedir el kilometraje con modal personalizado
      if (action === 'completed') {
        const service = schedule.services.find(s => s.id === serviceId);
        const mileage = await showMileageInputModal(service?.serviceName || 'este servicio');
        if (mileage === null) return; // Usuario canceló
        
        const mileageNum = Number(mileage.replace(/[^0-9]/g, ''));
        if (!mileageNum || mileageNum < 0) {
          showError('Por favor ingresa un kilometraje válido');
          return;
        }
        
        await updateServiceStatus(serviceId, action, mileageNum);
      } else {
        await updateServiceStatus(serviceId, action);
      }
    });
  });
}

// Actualizar kilometraje
async function updateMileage(newMileage) {
  try {
    const response = await fetch(
      `${API_BASE}/api/v1/public/customer/${state.companyId}/schedule?plate=${encodeURIComponent(state.plate)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Phone-Password': state.phonePassword
        },
        body: JSON.stringify({ mileage: newMileage })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al actualizar kilometraje');
    }

    // Actualizar estado local
    if (data.schedule) {
      state.schedule = data.schedule;
    }
    
    // Actualizar kilometraje en la información del vehículo
    const mileageInput = document.getElementById('currentMileageInput');
    if (mileageInput) mileageInput.value = newMileage;
    
    // Guardar kilometraje en localStorage para autocompletar después
    saveMileage(state.plate, newMileage);
    
    // Recargar planilla para recalcular estados
    await loadSchedule();
    
    // Mostrar mensaje de éxito
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
      errorDiv.textContent = 'Kilometraje actualizado correctamente';
      errorDiv.classList.remove('hidden', 'text-red-400');
      errorDiv.classList.add('text-green-400');
      setTimeout(() => {
        errorDiv.classList.add('hidden');
      }, 3000);
    }
  } catch (error) {
    console.error('Error actualizando kilometraje:', error);
    showError(error.message || 'Error al actualizar kilometraje');
  }
}

// Actualizar estado de un servicio
async function updateServiceStatus(serviceId, action, mileage = null) {
  try {
    const services = [{
      serviceId,
      action,
      mileage: mileage || state.schedule?.currentMileage || null
    }];

    const response = await fetch(
      `${API_BASE}/api/v1/public/customer/${state.companyId}/schedule?plate=${encodeURIComponent(state.plate)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Phone-Password': state.phonePassword
        },
        body: JSON.stringify({ services })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al actualizar servicio');
    }

    // Actualizar estado local
    if (data.schedule) {
      state.schedule = data.schedule;
    }
    
    // Recargar planilla
    await loadSchedule();
    
    // Mostrar mensaje de éxito
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
      const actionText = action === 'completed' ? 'completado' : 'saltado';
      errorDiv.textContent = `Servicio ${actionText} correctamente`;
      errorDiv.classList.remove('hidden', 'text-red-400');
      errorDiv.classList.add('text-green-400');
      setTimeout(() => {
        errorDiv.classList.add('hidden');
      }, 3000);
    }
  } catch (error) {
    console.error('Error actualizando servicio:', error);
    showError(error.message || 'Error al actualizar servicio');
  }
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
  
  // Obtener companyId: primero del input oculto, luego de favorito por placa, luego de URL
  let companyId = companyIdInput?.value?.trim() || null;
  
  if (!companyId && plate) {
    // Intentar obtener desde favorito por placa
    const favorite = getFavoriteCompany(plate);
    if (favorite) {
      companyId = favorite.id;
    }
  }
  
  if (!companyId) {
    // Intentar desde URL
    companyId = getCompanyId(plate);
  }

  if (!plate || !phonePassword) {
    showError('Por favor completa todos los campos');
    return;
  }

  if (!companyId) {
    showError('Por favor selecciona un taller de la lista');
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

    // Renderizar información del vehículo (incluyendo placa)
    renderVehicleInfo(state.customer.vehicle, state.plate);

    // Configurar visibilidad de pestañas según tier
    const tier = state.customer.tier || 'General';
    const tabSchedule = document.getElementById('tabSchedule');
    const scheduleTab = document.getElementById('scheduleTab');
    
    if (tier === 'General') {
      // Cliente General: ocultar pestaña de planilla
      if (tabSchedule) {
        tabSchedule.classList.add('hidden');
      }
      if (scheduleTab) {
        scheduleTab.classList.add('hidden');
      }
    } else if (tier === 'GOLD') {
      // Cliente GOLD: mostrar ambas pestañas
      if (tabSchedule) {
        tabSchedule.classList.remove('hidden');
      }
      // Cargar planilla solo si es GOLD
      await loadSchedule();
    }

    // Cargar servicios (siempre disponible)
    await loadServices();
    
    // Asegurar que la pestaña de servicios esté activa después de cargar
    const tabServices = document.getElementById('tabServices');
    const servicesTab = document.getElementById('servicesTab');
    if (tabServices && servicesTab) {
      tabServices.classList.remove('text-slate-400', 'hover:text-slate-300');
      tabServices.classList.add('text-slate-300', 'bg-blue-600');
      if (tabSchedule && !tabSchedule.classList.contains('hidden')) {
        tabSchedule.classList.remove('text-slate-300', 'bg-blue-600');
        tabSchedule.classList.add('text-slate-400', 'hover:text-slate-300');
      }
      servicesTab.classList.remove('hidden');
      if (scheduleTab) scheduleTab.classList.add('hidden');
    }
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
    
    // Actualizar kilometraje en la información del vehículo si cambió
    const mileageInput = document.getElementById('currentMileageInput');
    if (mileageInput) {
      // Prioridad: 1) schedule actual, 2) kilometraje guardado, 3) vacío
      if (state.schedule?.currentMileage) {
        mileageInput.value = state.schedule.currentMileage;
        // Guardar en localStorage para autocompletar después
        saveMileage(state.plate, state.schedule.currentMileage);
      } else {
        // Intentar cargar desde localStorage
        const savedMileage = getSavedMileage(state.plate);
        if (savedMileage) {
          mileageInput.value = savedMileage;
        } else {
          // Si no hay nada, dejar vacío para que el usuario pueda ingresar
          mileageInput.value = '';
        }
      }
    }
    
    // Si no hay input pero hay kilometraje, actualizar la vista del vehículo
    if (!mileageInput && state.schedule?.currentMileage) {
      renderVehicleInfo(state.customer?.vehicle || {}, state.plate);
    }
    
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
    const allCompanies = data.companies || [];
    
    // Filtrar solo "Casa Renault" y "Servitecha Shelby"
    const allowedCompanyNames = ['Casa Renault', 'Servitecha Shelby'];
    state.companies = allCompanies.filter(company => {
      const name = (company.name || '').trim();
      return allowedCompanyNames.some(allowed => 
        name.toLowerCase().includes(allowed.toLowerCase()) ||
        allowed.toLowerCase().includes(name.toLowerCase())
      );
    });
    
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
      const plate = document.getElementById('plate')?.value?.trim().toUpperCase() || null;
      selectCompany(companyId, companyName, plate);
    });
  });
  
  dropdown.classList.remove('hidden');
}

// Seleccionar un taller
function selectCompany(companyId, companyName, plate = null) {
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
  
  // Guardar como favorito automáticamente (asociado a la placa si está disponible)
  const plateToUse = plate || document.getElementById('plate')?.value?.trim().toUpperCase() || null;
  if (plateToUse) {
    saveFavoriteCompany({ id: companyId, name: companyName }, plateToUse);
    showFavoriteIndicator();
  }
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
  
  // Verificar si hay companyId en la URL
  const urlParams = new URLSearchParams(window.location.search);
  const urlCompanyId = urlParams.get('companyId');
  if (urlCompanyId) {
    // Buscar el nombre del taller
    const company = state.companies.find(c => c.id === urlCompanyId);
    if (company) {
      const plate = document.getElementById('plate')?.value?.trim().toUpperCase() || null;
      selectCompany(company.id, company.name, plate);
    } else {
      // Si no está en la lista, solo establecer el ID
      const companyIdInput = document.getElementById('companyId');
      if (companyIdInput) companyIdInput.value = urlCompanyId;
    }
  }
  
  // Listener para autocompletar taller y kilometraje cuando se ingresa la placa
  const plateInput = document.getElementById('plate');
  if (plateInput) {
    // Función para verificar y autocompletar taller y kilometraje por placa
    const checkAndAutocomplete = (plate) => {
      const plateUpper = plate.trim().toUpperCase();
      if (plateUpper && plateUpper.length >= 3) {
        // Buscar favorito para esta placa
        const favorite = getFavoriteCompany(plateUpper);
        if (favorite) {
          // Autocompletar el taller
          selectCompany(favorite.id, favorite.name, plateUpper);
        } else {
          // Si no hay favorito, ocultar el indicador
          hideFavoriteIndicator();
          // Limpiar selección si no hay favorito (solo si no hay companyId en URL)
          if (!urlCompanyId) {
            const selectedDiv = document.getElementById('selectedCompany');
            if (selectedDiv) selectedDiv.classList.add('hidden');
            const companyIdInput = document.getElementById('companyId');
            if (companyIdInput) companyIdInput.value = '';
          }
        }
        
        // Autocompletar kilometraje guardado
        const savedMileage = getSavedMileage(plateUpper);
        if (savedMileage) {
          // No autocompletamos el kilometraje en el login, solo lo guardamos para después
          // Se autocompletará cuando se cargue la información del vehículo
        }
      } else {
        // Si la placa es muy corta, ocultar indicador
        hideFavoriteIndicator();
        // Limpiar selección si la placa es muy corta (solo si no hay companyId en URL)
        if (!urlCompanyId && plateUpper.length === 0) {
          const selectedDiv = document.getElementById('selectedCompany');
          if (selectedDiv) selectedDiv.classList.add('hidden');
          const companyIdInput = document.getElementById('companyId');
          if (companyIdInput) companyIdInput.value = '';
        }
      }
    };
    
    // Verificar al escribir
    plateInput.addEventListener('input', (e) => {
      checkAndAutocomplete(e.target.value);
    });
    
    // También verificar al hacer focus si ya hay placa
    plateInput.addEventListener('focus', () => {
      checkAndAutocomplete(plateInput.value);
    });
    
    // Verificar al cargar la página si ya hay una placa (por ejemplo, desde URL)
    if (plateInput.value) {
      checkAndAutocomplete(plateInput.value);
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
      const plate = document.getElementById('plate')?.value?.trim().toUpperCase();
      if (plate) {
        removeFavoriteCompany(plate);
        hideFavoriteIndicator();
        // Limpiar selección
        const selectedDiv = document.getElementById('selectedCompany');
        if (selectedDiv) selectedDiv.classList.add('hidden');
        const companyIdInput = document.getElementById('companyId');
        if (companyIdInput) companyIdInput.value = '';
      }
    });
  }
});

