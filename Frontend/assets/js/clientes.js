// Frontend/assets/js/clientes.js
// Gestión de clientes: planillas y tiers
// Versión: 2026-01-06-v3
// IMPORTANTE: Este archivo NO usa import/export - se carga como script normal

(function() {
  'use strict';
  
  console.log('[clientes.js] Iniciando carga del script...');
  
  // Cargar API desde window (api.js lo expone globalmente)
  // NO usar import/export - este archivo se carga como script normal
  const API_BASE = (typeof window !== 'undefined' && window.BACKEND_URL) ? window.BACKEND_URL : 
                  (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';

// Obtener API desde window
function getAPI() {
  if (typeof window !== 'undefined' && window.API) {
    return window.API;
  }
  // Si no está disponible, lanzar error
  throw new Error('API no está disponible. Asegúrate de que api.js se cargue antes que clientes.js');
}

// Estado
const state = {
  companyId: null,
  currentTab: 'planilla',
  customers: [],
  filteredCustomers: [],
  currentSchedule: null
};

// Obtener companyId del token
async function getCompanyId() {
  try {
    const API = getAPI();
    // companyMe está directamente en API, no en API.auth
    if (!API || typeof API.companyMe !== 'function') {
      console.error('API.companyMe no está disponible');
      // Intentar obtener companyId desde localStorage como fallback
      const companyId = API?.companyId?.get?.() || null;
      if (companyId) {
        console.log('Usando companyId desde localStorage:', companyId);
        return companyId;
      }
      return null;
    }
    const me = await API.companyMe();
    return me?.company?.id || me?.id || me?._id || null;
  } catch (error) {
    console.error('Error obteniendo companyId:', error);
    // Intentar obtener companyId desde localStorage como fallback
    try {
      const API = getAPI();
      const companyId = API?.companyId?.get?.() || null;
      if (companyId) {
        console.log('Usando companyId desde localStorage (fallback):', companyId);
        return companyId;
      }
    } catch (e) {
      console.error('Error obteniendo companyId desde localStorage:', e);
    }
    return null;
  }
}

// Inicialización
async function init() {
  // Obtener companyId
  state.companyId = await getCompanyId();
  if (!state.companyId) {
    showError('tiersError', 'No se pudo obtener la información de la empresa. Por favor, inicia sesión nuevamente.');
    return;
  }

  // Configurar tabs
  setupTabs();

  // Configurar eventos
  setupEvents();

  // Cargar clientes para la pestaña Tiers (solo primeros 100, sin búsqueda)
  await loadCustomers('');
}

// Configurar tabs
function setupTabs() {
  const tabPlanilla = document.getElementById('tabPlanilla');
  const tabTiers = document.getElementById('tabTiers');
  const planillaTab = document.getElementById('planillaTab');
  const tiersTab = document.getElementById('tiersTab');

  if (!tabPlanilla || !tabTiers || !planillaTab || !tiersTab) {
    console.error('No se encontraron los elementos de tabs necesarios');
    return;
  }

  function switchTab(tab) {
    // Actualizar botones
    [tabPlanilla, tabTiers].forEach(btn => {
      if (btn) {
        btn.classList.remove('text-slate-300', 'bg-blue-600');
        btn.classList.add('text-slate-400', 'hover:text-slate-300');
      }
    });

    if (tab === 'planilla') {
      if (tabPlanilla) {
        tabPlanilla.classList.remove('text-slate-400', 'hover:text-slate-300');
        tabPlanilla.classList.add('text-slate-300', 'bg-blue-600');
      }
      if (planillaTab) planillaTab.classList.remove('hidden');
      if (tiersTab) tiersTab.classList.add('hidden');
      state.currentTab = 'planilla';
    } else if (tab === 'tiers') {
      if (tabTiers) {
        tabTiers.classList.remove('text-slate-400', 'hover:text-slate-300');
        tabTiers.classList.add('text-slate-300', 'bg-blue-600');
      }
      if (planillaTab) planillaTab.classList.add('hidden');
      if (tiersTab) tiersTab.classList.remove('hidden');
      state.currentTab = 'tiers';
    }
  }

  // Agregar event listeners
  tabPlanilla.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('planilla');
  });
  
  tabTiers.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('tiers');
  });
}

// Configurar eventos
function setupEvents() {
  // Búsqueda de planilla
  const searchPlateBtn = document.getElementById('searchPlateBtn');
  const searchPlate = document.getElementById('searchPlate');
  
  if (searchPlateBtn) {
    searchPlateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleSearchPlate();
    });
  } else {
    console.warn('No se encontró el botón de búsqueda de planilla');
  }
  
  if (searchPlate) {
    searchPlate.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearchPlate();
      }
    });
  } else {
    console.warn('No se encontró el input de búsqueda de planilla');
  }

  // Búsqueda de clientes
  const searchCustomerTier = document.getElementById('searchCustomerTier');
  const refreshCustomersBtn = document.getElementById('refreshCustomersBtn');
  
  if (searchCustomerTier) {
    // Usar input para búsqueda en tiempo real con debounce (ya implementado en filterCustomers)
    searchCustomerTier.addEventListener('input', () => {
      filterCustomers();
    });
    // También permitir búsqueda inmediata con Enter
    searchCustomerTier.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (searchTimeout) {
          clearTimeout(searchTimeout);
        }
        filterCustomers();
      }
    });
  }
  
  if (refreshCustomersBtn) {
    refreshCustomersBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const searchInput = document.getElementById('searchCustomerTier');
      const searchTerm = searchInput?.value?.trim() || '';
      loadCustomers(searchTerm);
    });
  }
}

// Buscar planilla por placa
async function handleSearchPlate() {
  const searchPlate = document.getElementById('searchPlate');
  const plate = searchPlate?.value?.trim().toUpperCase() || '';

  if (!plate) {
    showError('planillaError', 'Por favor ingresa una placa');
    return;
  }

  hideError('planillaError');

  try {
    const API = getAPI();
    const data = await API.customers.getSchedule(state.companyId, plate);
    
    // Mostrar información del vehículo
    renderVehicleInfo(data.vehicle);
    
    // Mostrar planilla
    renderSchedule(data.schedule);
  } catch (error) {
    console.error('Error buscando planilla:', error);
    showError('planillaError', error.message || 'Error al buscar planilla');
    hideVehicleInfo();
    hideSchedule();
  }
}

// Renderizar información del vehículo
function renderVehicleInfo(vehicle) {
  const vehicleInfoCard = document.getElementById('vehicleInfoCard');
  const vehicleInfoContent = document.getElementById('vehicleInfoContent');

  if (!vehicle || !vehicleInfoCard || !vehicleInfoContent) return;

  vehicleInfoContent.innerHTML = `
    <div class="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
      <p class="text-xs text-slate-400 mb-1">Placa</p>
      <p class="text-lg font-bold text-white">${escapeHtml(vehicle.plate || '-')}</p>
    </div>
    <div class="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
      <p class="text-xs text-slate-400 mb-1">Marca</p>
      <p class="text-lg font-bold text-white">${escapeHtml(vehicle.brand || '-')}</p>
    </div>
    <div class="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
      <p class="text-xs text-slate-400 mb-1">Línea</p>
      <p class="text-lg font-bold text-white">${escapeHtml(vehicle.line || '-')}</p>
    </div>
    <div class="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
      <p class="text-xs text-slate-400 mb-1">Motor</p>
      <p class="text-lg font-bold text-white">${escapeHtml(vehicle.engine || '-')}</p>
    </div>
  `;

  vehicleInfoCard.classList.remove('hidden');
}

function hideVehicleInfo() {
  const vehicleInfoCard = document.getElementById('vehicleInfoCard');
  if (vehicleInfoCard) vehicleInfoCard.classList.add('hidden');
}

// Renderizar planilla
function renderSchedule(schedule) {
  const scheduleCard = document.getElementById('scheduleCard');
  const scheduleList = document.getElementById('scheduleList');
  const noSchedule = document.getElementById('noSchedule');
  const scheduleCurrentMileage = document.getElementById('scheduleCurrentMileage');
  const scheduleUpdatedAt = document.getElementById('scheduleUpdatedAt');

  if (!scheduleCard) return;

  if (!schedule || !schedule.services || schedule.services.length === 0) {
    if (scheduleList) scheduleList.innerHTML = '';
    if (noSchedule) noSchedule.classList.remove('hidden');
    scheduleCard.classList.remove('hidden');
    return;
  }

  if (noSchedule) noSchedule.classList.add('hidden');

  // Actualizar kilometraje
  if (scheduleCurrentMileage) {
    scheduleCurrentMileage.textContent = schedule.currentMileage 
      ? `${schedule.currentMileage.toLocaleString()} km` 
      : '-';
  }
  if (scheduleUpdatedAt) {
    scheduleUpdatedAt.textContent = schedule.mileageUpdatedAt
      ? new Date(schedule.mileageUpdatedAt).toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
      : '-';
  }

  // Renderizar servicios
  if (scheduleList) {
    scheduleList.innerHTML = schedule.services.map((service, index) => {
      const status = service.status || 'pending';
      const statusColors = {
        pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
        due: 'bg-red-500/20 text-red-400 border-red-500/50',
        completed: 'bg-green-500/20 text-green-400 border-green-500/50',
        upcoming: 'bg-blue-500/20 text-blue-400 border-blue-500/50'
      };
      const statusText = {
        pending: 'Pendiente',
        due: 'Vencido',
        completed: 'Completado',
        upcoming: 'Próximo'
      };

      return `
        <div class="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600/50 transition-all">
          <div class="flex items-start justify-between mb-2">
            <div class="flex-1">
              <h4 class="text-lg font-bold text-white mb-1">${escapeHtml(service.serviceName || 'Servicio')}</h4>
              <p class="text-sm text-slate-400">${escapeHtml(service.system || 'General')}</p>
            </div>
            <span class="px-3 py-1 rounded-full text-xs font-semibold border ${statusColors[status] || statusColors.pending}">
              ${statusText[status] || 'Pendiente'}
            </span>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
            <div>
              <p class="text-slate-400 text-xs">Intervalo</p>
              <p class="text-white font-medium">${service.mileageInterval ? `${service.mileageInterval.toLocaleString()} km` : '-'}</p>
            </div>
            <div>
              <p class="text-slate-400 text-xs">Último realizado</p>
              <p class="text-white font-medium">${service.lastPerformedMileage ? `${service.lastPerformedMileage.toLocaleString()} km` : 'Nunca'}</p>
            </div>
            <div>
              <p class="text-slate-400 text-xs">Próximo</p>
              <p class="text-white font-medium">${service.nextDueMileage ? `${service.nextDueMileage.toLocaleString()} km` : '-'}</p>
            </div>
            <div>
              <p class="text-slate-400 text-xs">Fecha último</p>
              <p class="text-white font-medium">${service.lastPerformedDate ? new Date(service.lastPerformedDate).toLocaleDateString('es-ES') : '-'}</p>
            </div>
          </div>
          ${service.notes ? `<p class="text-xs text-slate-500 mt-2 italic">${escapeHtml(service.notes)}</p>` : ''}
        </div>
      `;
    }).join('');
  }

  scheduleCard.classList.remove('hidden');
}

function hideSchedule() {
  const scheduleCard = document.getElementById('scheduleCard');
  if (scheduleCard) scheduleCard.classList.add('hidden');
}

// Cargar clientes (solo los necesarios según búsqueda)
async function loadCustomers(searchTerm = '') {
  try {
    const API = getAPI();
    const search = searchTerm.trim();
    
    // Si hay búsqueda, solo cargar esa página de resultados
    if (search) {
      const data = await API.customers.list(state.companyId, search, 100, 1);
      state.customers = data.customers || [];
      console.log(`Cargados ${state.customers.length} clientes (búsqueda: "${search}")`);
      renderCustomers();
      return;
    }
    
    // Si no hay búsqueda, cargar solo la primera página (100 clientes)
    // El usuario puede buscar si necesita más
    const data = await API.customers.list(state.companyId, '', 100, 1);
    state.customers = data.customers || [];
    const total = data.pagination?.total || 0;
    
    if (total > 100) {
      console.log(`Cargados ${state.customers.length} de ${total} clientes. Usa la búsqueda para encontrar más.`);
    } else {
      console.log(`Cargados ${state.customers.length} clientes`);
    }
    
    renderCustomers();
  } catch (error) {
    console.error('Error cargando clientes:', error);
    showError('tiersError', error.message || 'Error al cargar clientes');
  }
}

// Variable para debounce de búsqueda
let searchTimeout = null;

// Filtrar clientes (búsqueda en el servidor para no sobrecargar)
async function filterCustomers() {
  const searchCustomerTier = document.getElementById('searchCustomerTier');
  const searchTerm = (searchCustomerTier?.value || '').trim();

  // Limpiar timeout anterior
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // Si no hay búsqueda, usar los clientes ya cargados
  if (!searchTerm) {
    state.filteredCustomers = state.customers;
    renderCustomers();
    return;
  }

  // Debounce: esperar 500ms después de que el usuario deje de escribir
  searchTimeout = setTimeout(async () => {
    try {
      const API = getAPI();
      // Buscar en el servidor (solo trae los resultados de la búsqueda)
      const data = await API.customers.list(state.companyId, searchTerm, 100, 1);
      state.filteredCustomers = data.customers || [];
      console.log(`Búsqueda: "${searchTerm}" - ${state.filteredCustomers.length} resultados`);
      renderCustomers();
    } catch (error) {
      console.error('Error buscando clientes:', error);
      // En caso de error, filtrar localmente como fallback
      state.filteredCustomers = state.customers.filter(c => {
        const plate = (c.plate || '').toLowerCase();
        const name = (c.customer?.name || '').toLowerCase();
        const phone = (c.customer?.phone || '').toLowerCase();
        const term = searchTerm.toLowerCase();
        return plate.includes(term) || name.includes(term) || phone.includes(term);
      });
      renderCustomers();
    }
  }, 500); // Esperar 500ms después de que el usuario deje de escribir
}

// Renderizar clientes
function renderCustomers() {
  const customersList = document.getElementById('customersList');
  const noCustomers = document.getElementById('noCustomers');

  if (!customersList) return;

  if (state.filteredCustomers.length === 0) {
    customersList.innerHTML = '';
    if (noCustomers) noCustomers.classList.remove('hidden');
    return;
  }

  if (noCustomers) noCustomers.classList.add('hidden');

  customersList.innerHTML = state.filteredCustomers.map(customer => {
    const tier = customer.tier || 'General';
    const isGold = tier === 'GOLD';
    
    return `
      <div class="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600/50 transition-all">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h4 class="text-lg font-bold text-white">${escapeHtml(customer.plate || 'Sin placa')}</h4>
              <span class="px-2 py-1 rounded-full text-xs font-semibold ${
                isGold 
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' 
                  : 'bg-slate-500/20 text-slate-400 border border-slate-500/50'
              }">
                ${tier}
              </span>
            </div>
            <div class="text-sm text-slate-400 space-y-1">
              <p><span class="font-medium">Cliente:</span> ${escapeHtml(customer.customer?.name || 'Sin nombre')}</p>
              <p><span class="font-medium">Teléfono:</span> ${escapeHtml(customer.customer?.phone || '-')}</p>
              <p><span class="font-medium">Vehículo:</span> ${escapeHtml(customer.vehicle?.brand || '')} ${escapeHtml(customer.vehicle?.line || '')} ${escapeHtml(customer.vehicle?.engine || '')}</p>
            </div>
          </div>
          <div class="ml-4 flex flex-col gap-2">
            <button
              onclick="updateCustomerTier('${escapeHtml(customer.plate)}', 'General')"
              class="px-4 py-2 rounded-lg transition-all text-sm font-semibold ${
                tier === 'General'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }"
            >
              General
            </button>
            <button
              onclick="updateCustomerTier('${escapeHtml(customer.plate)}', 'GOLD')"
              class="px-4 py-2 rounded-lg transition-all text-sm font-semibold ${
                tier === 'GOLD'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }"
            >
              GOLD
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Actualizar tier de cliente
async function updateCustomerTier(plate, tier) {
  if (!plate || !tier) return;

  try {
    const API = getAPI();
    await API.customers.updateTier(state.companyId, plate, tier);
    
    // Actualizar en el estado
    const customer = state.customers.find(c => c.plate === plate);
    if (customer) {
      customer.tier = tier;
    }
    
    // Re-renderizar
    filterCustomers();
    
    // Mostrar mensaje de éxito
    showSuccess('Tier actualizado correctamente');
  } catch (error) {
    console.error('Error actualizando tier:', error);
    showError('tiersError', error.message || 'Error al actualizar tier');
  }
}

// Exponer función globalmente
window.updateCustomerTier = updateCustomerTier;

// Utilidades
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(elementId, message) {
  const errorEl = document.getElementById(elementId);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}

function hideError(elementId) {
  const errorEl = document.getElementById(elementId);
  if (errorEl) {
    errorEl.classList.add('hidden');
  }
}

function showSuccess(message) {
  // Crear notificación temporal
  const notification = document.createElement('div');
  notification.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 fade-in';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('opacity-0');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Extender API con métodos de clientes
function extendAPI() {
  try {
    const API = getAPI();
    if (!API.customers) {
      API.customers = {};
    }
    
    API.customers = {
      search: async (companyId, plate) => {
        const token = API.token?.get?.();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE}/api/v1/customers/search?plate=${encodeURIComponent(plate)}`, {
          headers,
          credentials: 'omit'
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || body.message || `HTTP ${res.status}`);
        }
        return res.json();
      },
      getSchedule: async (companyId, plate) => {
        const token = API.token?.get?.();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE}/api/v1/customers/${encodeURIComponent(plate)}/schedule`, {
          headers,
          credentials: 'omit'
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || body.message || `HTTP ${res.status}`);
        }
        return res.json();
      },
      list: async (companyId, search = '', limit = 100, page = 1) => {
        const token = API.token?.get?.();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
        const limitParam = limit ? `&limit=${limit}` : '';
        const pageParam = page ? `&page=${page}` : '';
        const res = await fetch(`${API_BASE}/api/v1/customers/list?${searchParam}${limitParam}${pageParam}`, {
          headers,
          credentials: 'omit'
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || body.message || `HTTP ${res.status}`);
        }
        return res.json();
      },
      getTier: async (companyId, plate) => {
        const token = API.token?.get?.();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE}/api/v1/customers/${encodeURIComponent(plate)}/tier`, {
          headers,
          credentials: 'omit'
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || body.message || `HTTP ${res.status}`);
        }
        return res.json();
      },
      updateTier: async (companyId, plate, tier) => {
        const token = API.token?.get?.();
        const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
        const res = await fetch(`${API_BASE}/api/v1/customers/${encodeURIComponent(plate)}/tier`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ tier }),
          credentials: 'omit'
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || body.message || `HTTP ${res.status}`);
        }
        return res.json();
      }
    };
  } catch (error) {
    console.error('Error extendiendo API:', error);
  }
}

// Función para esperar a que API esté disponible y extenderla
function waitForAPIAndExtend() {
  if (typeof window !== 'undefined' && window.API) {
    try {
      extendAPI();
      console.log('API extendida correctamente');
    } catch (error) {
      console.error('Error extendiendo API:', error);
    }
  } else {
    // Esperar a que api.js cargue (máximo 5 segundos)
    let attempts = 0;
    const maxAttempts = 50; // 50 * 100ms = 5 segundos
    const checkInterval = setInterval(() => {
      attempts++;
      if (typeof window !== 'undefined' && window.API) {
        clearInterval(checkInterval);
        try {
          extendAPI();
          console.log('API extendida correctamente');
        } catch (error) {
          console.error('Error extendiendo API:', error);
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.error('API no disponible después de 5 segundos');
        alert('Error: No se pudo cargar la API. Por favor, recarga la página.');
      }
    }, 100);
  }
}

// Inicializar cuando el DOM esté listo y API esté disponible
function waitForAPIAndInit() {
  if (typeof window !== 'undefined' && window.API && window.API.customers) {
    try {
      init().catch(error => {
        console.error('Error en init:', error);
      });
    } catch (error) {
      console.error('Error llamando init:', error);
    }
  } else {
    // Esperar a que api.js cargue y se extienda (máximo 5 segundos)
    let attempts = 0;
    const maxAttempts = 50; // 50 * 100ms = 5 segundos
    const checkInterval = setInterval(() => {
      attempts++;
      if (typeof window !== 'undefined' && window.API && window.API.customers) {
        clearInterval(checkInterval);
        try {
          init().catch(error => {
            console.error('Error en init:', error);
          });
        } catch (error) {
          console.error('Error llamando init:', error);
        }
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.error('API.customers no disponible después de 5 segundos');
        alert('Error: No se pudo inicializar la aplicación. Por favor, recarga la página.');
      }
    }, 100);
  }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    waitForAPIAndExtend();
    waitForAPIAndInit();
  });
} else {
  waitForAPIAndExtend();
  waitForAPIAndInit();
}

})(); // Cerrar IIFE - NO usar import/export

