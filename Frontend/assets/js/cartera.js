// ========== CARTERA ==========

let companies = [];
let receivables = [];
let stats = { balance: 0, pending: 0, partial: 0, paid: 0 };

// Función para obtener la API de forma segura
function getAPI() {
  return window.API || {};
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page !== 'cartera') return;
  
  // Esperar a que la API esté disponible
  const checkAPI = setInterval(() => {
    if (window.API) {
      clearInterval(checkAPI);
      initCartera();
    }
  }, 100);
  
  // Timeout de seguridad después de 5 segundos
  setTimeout(() => {
    clearInterval(checkAPI);
    if (document.body.dataset.page === 'cartera') {
      initCartera();
    }
  }, 5000);
});

async function initCartera() {
  try {
    await loadCompanies();
    await loadReceivables();
    await loadStats();
    
    // Navegación por pestañas
    const navCartera = document.getElementById('cartera-nav-cartera');
    const navEmpresas = document.getElementById('cartera-nav-empresas');
    const viewCartera = document.getElementById('cartera-view-cartera');
    const viewEmpresas = document.getElementById('cartera-view-empresas');
    
    if (navCartera && navEmpresas && viewCartera && viewEmpresas) {
      navCartera.addEventListener('click', () => {
        navCartera.classList.add('active');
        navCartera.classList.remove('text-slate-300', 'dark:text-slate-300', 'theme-light:text-slate-700');
        navCartera.classList.add('text-white', 'bg-orange-600', 'dark:bg-orange-600', 'theme-light:bg-orange-500');
        navEmpresas.classList.remove('active', 'text-white', 'bg-orange-600', 'dark:bg-orange-600', 'theme-light:bg-orange-500');
        navEmpresas.classList.add('text-slate-300', 'dark:text-slate-300', 'theme-light:text-slate-700');
        viewCartera.classList.remove('hidden');
        viewEmpresas.classList.add('hidden');
      });
      
      navEmpresas.addEventListener('click', () => {
        navEmpresas.classList.add('active');
        navEmpresas.classList.remove('text-slate-300', 'dark:text-slate-300', 'theme-light:text-slate-700');
        navEmpresas.classList.add('text-white', 'bg-orange-600', 'dark:bg-orange-600', 'theme-light:bg-orange-500');
        navCartera.classList.remove('active', 'text-white', 'bg-orange-600', 'dark:bg-orange-600', 'theme-light:bg-orange-500');
        navCartera.classList.add('text-slate-300', 'dark:text-slate-300', 'theme-light:text-slate-700');
        viewEmpresas.classList.remove('hidden');
        viewCartera.classList.add('hidden');
      });
    }
    
    // Event listeners
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        await loadCompanies();
        await loadReceivables();
        await loadStats();
      });
    }
    
    const btnAddCompany = document.getElementById('btn-add-company');
    if (btnAddCompany) {
      btnAddCompany.addEventListener('click', () => {
        showCompanyModal();
      });
    }
    
    const btnApplyFilters = document.getElementById('btn-apply-filters');
    if (btnApplyFilters) {
      btnApplyFilters.addEventListener('click', async () => {
        await loadReceivables();
      });
    }
    
    // Modal close
    const modalClose = document.getElementById('modalClose');
    if (modalClose) {
      modalClose.addEventListener('click', () => {
        const modal = document.getElementById('modal');
        if (modal) modal.classList.add('hidden');
      });
    }
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('modal');
        if (modal) modal.classList.add('hidden');
      }
    });
  } catch (err) {
    console.error('Error inicializando cartera:', err);
  }
}

// ========== EMPRESAS ==========

async function loadCompanies() {
  try {
    const api = getAPI();
    const res = await api.receivables?.companies?.list() || [];
    companies = res || [];
    renderCompanies();
    updateCompanyFilter();
  } catch (err) {
    console.error('Error loading companies:', err);
    showError('Error al cargar empresas');
  }
}

function renderCompanies() {
  const tbody = document.getElementById('companies-body');
  if (!tbody) return;
  
  if (companies.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="px-4 py-8 text-center">
          <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">No hay empresas registradas</div>
          <button onclick="showCompanyModal()" class="px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold rounded-lg transition-all duration-200 text-sm">
            + Crear primera empresa
          </button>
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = companies.map(company => {
    const typeLabel = company.type === 'particular' ? 'Particular' : 'Recurrente';
    const typeColor = company.type === 'particular' 
      ? 'bg-purple-500/20 text-purple-400 dark:text-purple-400 theme-light:text-purple-700 border-purple-500/30'
      : 'bg-green-500/20 text-green-400 dark:text-green-400 theme-light:text-green-700 border-green-500/30';
    const statusColor = company.active 
      ? 'bg-green-500/20 text-green-400 dark:text-green-400 theme-light:text-green-700'
      : 'bg-red-500/20 text-red-400 dark:text-red-400 theme-light:text-red-700';
    const statusLabel = company.active ? 'Activa' : 'Inactiva';
    
    return `
    <tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300/30 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-100/50 transition-colors">
      <td class="px-2 sm:px-4 py-3" data-label="Nombre">
        <div class="font-semibold text-sm sm:text-base text-white dark:text-white theme-light:text-slate-900">${escapeHtml(company.name)}</div>
        ${company.description ? `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">${escapeHtml(company.description)}</div>` : ''}
      </td>
      <td class="px-2 sm:px-4 py-3" data-label="Tipo">
        <span class="px-2 py-1 rounded text-xs font-semibold border ${typeColor}">${typeLabel}</span>
      </td>
      <td class="px-2 sm:px-4 py-3" data-label="Contacto">
        ${company.contact?.name ? `<div class="text-xs sm:text-sm text-white dark:text-white theme-light:text-slate-900 font-medium">${escapeHtml(company.contact.name)}</div>` : ''}
        ${company.contact?.phone ? `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-0.5">📞 ${escapeHtml(company.contact.phone)}</div>` : ''}
        ${company.contact?.email ? `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-0.5">✉️ ${escapeHtml(company.contact.email)}</div>` : ''}
      </td>
      <td class="px-2 sm:px-4 py-3" data-label="Placas">
        ${company.type === 'recurrente' && company.plates && company.plates.length > 0 
          ? `<div class="flex flex-wrap gap-1 mb-1">${company.plates.slice(0, 3).map(p => `<span class="inline-block px-2 py-1 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-200 rounded text-xs font-mono text-white dark:text-white theme-light:text-slate-900">${escapeHtml(p)}</span>`).join('')}</div>${company.plates.length > 3 ? `<div class="text-xs text-slate-400">+${company.plates.length - 3} más</div>` : `<div class="text-xs text-slate-400">${company.plates.length} placa${company.plates.length !== 1 ? 's' : ''}</div>`}`
          : company.type === 'recurrente' 
            ? '<span class="text-slate-400 text-xs">Sin placas</span>'
            : '<span class="text-slate-400 text-xs">-</span>'}
      </td>
      <td class="px-2 sm:px-4 py-3" data-label="Estado">
        <span class="px-2 py-1 rounded text-xs font-semibold ${statusColor}">${statusLabel}</span>
      </td>
      <td class="px-2 sm:px-4 py-3" data-label="Acciones">
        <div class="flex flex-col sm:flex-row gap-1 sm:gap-2">
          <button onclick="viewCompanyHistory('${company._id}')" class="px-2 sm:px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded transition-colors whitespace-nowrap" title="Ver historial">📊 Historial</button>
          <button onclick="editCompany('${company._id}')" class="px-2 sm:px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors whitespace-nowrap">✏️ Editar</button>
          <button onclick="deleteCompany('${company._id}')" class="px-2 sm:px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors whitespace-nowrap">🗑️ Eliminar</button>
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

function updateCompanyFilter() {
  const select = document.getElementById('filter-company');
  if (!select) return;
  
  select.innerHTML = '<option value="">Todas las empresas</option>' +
    companies.map(c => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');
}

function showCompanyModal(companyId = null) {
  const company = companyId ? companies.find(c => c._id === companyId) : null;
  const modalBody = document.getElementById('modalBody');
  if (!modalBody) return;
  
  modalBody.innerHTML = `
    <h2 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">
      ${company ? 'Editar Empresa' : 'Nueva Empresa'}
    </h2>
    <form id="company-form" class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Nombre *</label>
        <input type="text" id="company-name" required value="${company?.name || ''}" 
          class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500" />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Tipo de Empresa *</label>
        <select id="company-type" required
          class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500">
          <option value="recurrente" ${company?.type === 'recurrente' || !company ? 'selected' : ''}>Recurrente</option>
          <option value="particular" ${company?.type === 'particular' ? 'selected' : ''}>Particular</option>
        </select>
        <p class="text-xs text-slate-400 mt-1">
          <strong>Recurrente:</strong> Los vehículos pertenecen a la empresa. Se pueden agregar placas manualmente.<br>
          <strong>Particular:</strong> La empresa recibe vehículos particulares que no le pertenecen. Los links son temporales.
        </p>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Descripción</label>
        <textarea id="company-description" rows="2"
          class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500">${company?.description || ''}</textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Contacto</label>
        <div class="grid grid-cols-2 gap-2">
          <input type="text" id="company-contact-name" placeholder="Nombre" value="${company?.contact?.name || ''}"
            class="px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500" />
          <input type="text" id="company-contact-phone" placeholder="Teléfono" value="${company?.contact?.phone || ''}"
            class="px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500" />
        </div>
        <input type="email" id="company-contact-email" placeholder="Email" value="${company?.contact?.email || ''}" 
          class="w-full mt-2 px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500" />
        <textarea id="company-contact-address" placeholder="Dirección" rows="2" 
          class="w-full mt-2 px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500">${company?.contact?.address || ''}</textarea>
      </div>
      <div id="company-plates-section" style="display: ${company?.type === 'recurrente' || !company ? 'block' : 'none'};">
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Placas (solo para empresas recurrentes)</label>
        <div class="flex gap-2 mb-2">
          <input type="text" id="new-plate-input" placeholder="Ej: ABC123" 
            class="flex-1 px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 uppercase"
            onkeypress="if(event.key==='Enter'){event.preventDefault();addPlateToCompany();}" />
          <button type="button" onclick="addPlateToCompany()" 
            class="px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Agregar</button>
        </div>
        <div id="plates-list" class="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar mb-2">
          ${(company?.type === 'recurrente' && company?.plates) ? company.plates.map(plate => `
            <div class="plate-item flex items-center justify-between p-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300" data-plate="${escapeHtml(plate)}">
              <div class="flex-1">
                <div class="font-mono font-semibold text-white dark:text-white theme-light:text-slate-900">${escapeHtml(plate)}</div>
                <div class="plate-vehicle-info text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Buscando información...</div>
              </div>
              <button type="button" onclick="removePlateFromCompany('${escapeHtml(plate)}')" 
                class="ml-2 px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300 rounded text-xs transition-colors">Eliminar</button>
            </div>
          `).join('') : '<p class="text-xs text-slate-400 text-center py-2">No hay placas agregadas</p>'}
        </div>
        <p class="text-xs text-slate-400 mt-1">Agrega las placas de los vehículos que pertenecen a esta empresa. Cuando una de estas placas quede debiendo, se asociará automáticamente a esta empresa.</p>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Notas</label>
        <textarea id="company-notes" rows="2"
          class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500">${company?.notes || ''}</textarea>
      </div>
      <div class="flex gap-2 justify-end pt-4">
        <button type="button" onclick="document.getElementById('modal').classList.add('hidden')" 
          class="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors">Cancelar</button>
        <button type="submit" 
          class="px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar</button>
      </div>
    </form>
  `;
  
  document.getElementById('modal')?.classList.remove('hidden');
  
  // Inicializar lista de placas
  window.currentCompanyPlates = (company?.type === 'recurrente' && company?.plates) ? [...company.plates] : [];
  
  // Manejar cambio de tipo de empresa
  const typeSelect = document.getElementById('company-type');
  const platesSection = document.getElementById('company-plates-section');
  if (typeSelect && platesSection) {
    typeSelect.addEventListener('change', (e) => {
      if (e.target.value === 'recurrente') {
        platesSection.classList.add('js-show');
        platesSection.classList.remove('js-hide');
      } else {
        platesSection.classList.add('js-hide');
        platesSection.classList.remove('js-show');
        window.currentCompanyPlates = [];
        const platesList = document.getElementById('plates-list');
        if (platesList) {
          platesList.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">No hay placas agregadas</p>';
        }
      }
    });
  }
  
  // Cargar información de vehículos para las placas existentes
  if (company?.type === 'recurrente' && company?.plates && company.plates.length > 0) {
    company.plates.forEach(plate => {
      loadVehicleInfo(plate);
    });
  }
  
  document.getElementById('company-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCompany(companyId);
  });
}

// Funciones globales para manejar placas
window.addPlateToCompany = async function() {
  const input = document.getElementById('new-plate-input');
  if (!input) return;
  
  const plate = input.value.trim().toUpperCase();
  if (!plate) {
    showError('Ingresa una placa');
    return;
  }
  
  // Validar formato básico de placa (al menos 3 caracteres)
  if (plate.length < 3) {
    showError('La placa debe tener al menos 3 caracteres');
    return;
  }
  
  // Verificar que no esté duplicada
  if (window.currentCompanyPlates.includes(plate)) {
    showError('Esta placa ya está agregada');
    return;
  }
  
  // Agregar a la lista
  window.currentCompanyPlates.push(plate);
  
  // Agregar al DOM
  const platesList = document.getElementById('plates-list');
  if (platesList) {
    if (platesList.querySelector('p')) {
      platesList.innerHTML = '';
    }
    
    const plateDiv = document.createElement('div');
    plateDiv.className = 'plate-item flex items-center justify-between p-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-100 rounded-lg border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300';
    plateDiv.setAttribute('data-plate', plate);
    plateDiv.innerHTML = `
      <div class="flex-1">
        <div class="font-mono font-semibold text-white dark:text-white theme-light:text-slate-900">${escapeHtml(plate)}</div>
        <div class="plate-vehicle-info text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Buscando información...</div>
      </div>
      <button type="button" onclick="removePlateFromCompany('${escapeHtml(plate)}')" 
        class="ml-2 px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300 rounded text-xs transition-colors">Eliminar</button>
    `;
    platesList.appendChild(plateDiv);
    
    // Cargar información del vehículo
    await loadVehicleInfo(plate);
  }
  
  // Limpiar input
  input.value = '';
};

window.removePlateFromCompany = function(plate) {
  if (!confirm(`¿Eliminar la placa ${plate}?`)) return;
  
  window.currentCompanyPlates = window.currentCompanyPlates.filter(p => p !== plate);
  
  const plateItem = document.querySelector(`.plate-item[data-plate="${plate}"]`);
  if (plateItem) {
    plateItem.remove();
  }
  
  const platesList = document.getElementById('plates-list');
  if (platesList && platesList.children.length === 0) {
    platesList.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">No hay placas agregadas</p>';
  }
};

async function loadVehicleInfo(plate) {
  try {
    const api = getAPI();
    // Usar el endpoint de sales para obtener información del perfil por placa
    const profile = await api.sales?.profileByPlate?.(plate) || null;
    
    const plateItem = document.querySelector(`.plate-item[data-plate="${plate}"]`);
    if (!plateItem) return;
    
    const infoEl = plateItem.querySelector('.plate-vehicle-info');
    if (!infoEl) return;
    
    if (profile && profile.vehicle) {
      const vehicle = profile.vehicle;
      const parts = [];
      if (vehicle.brand) parts.push(vehicle.brand);
      if (vehicle.line) parts.push(vehicle.line);
      if (vehicle.engine) parts.push(vehicle.engine);
      if (vehicle.year) parts.push(`Año: ${vehicle.year}`);
      
      if (parts.length > 0) {
        infoEl.textContent = parts.join(' - ');
        infoEl.classList.remove('text-slate-400');
        infoEl.classList.add('text-green-400', 'dark:text-green-400', 'theme-light:text-green-600');
      } else {
        infoEl.textContent = 'Sin información de vehículo';
        infoEl.classList.add('text-yellow-400', 'dark:text-yellow-400', 'theme-light:text-yellow-600');
      }
    } else {
      infoEl.textContent = 'Placa no registrada en el sistema';
      infoEl.classList.add('text-yellow-400', 'dark:text-yellow-400', 'theme-light:text-yellow-600');
    }
  } catch (err) {
    console.error('Error loading vehicle info:', err);
    const plateItem = document.querySelector(`.plate-item[data-plate="${plate}"]`);
    if (plateItem) {
      const infoEl = plateItem.querySelector('.plate-vehicle-info');
      if (infoEl) {
        infoEl.textContent = 'Error al buscar información';
        infoEl.classList.add('text-red-400', 'dark:text-red-400', 'theme-light:text-red-600');
      }
    }
  }
}

async function saveCompany(companyId) {
  try {
    const api = getAPI();
    const name = document.getElementById('company-name')?.value.trim();
    if (!name) {
      showError('El nombre es requerido');
      return;
    }
    
    const type = document.getElementById('company-type')?.value || 'recurrente';
    // Obtener placas de la lista actual (solo para empresas recurrentes)
    const plates = type === 'recurrente' ? (window.currentCompanyPlates || []) : [];
    
    const data = {
      name,
      type,
      description: document.getElementById('company-description')?.value.trim() || '',
      contact: {
        name: document.getElementById('company-contact-name')?.value.trim() || '',
        phone: document.getElementById('company-contact-phone')?.value.trim() || '',
        email: document.getElementById('company-contact-email')?.value.trim() || '',
        address: document.getElementById('company-contact-address')?.value.trim() || ''
      },
      plates,
      notes: document.getElementById('company-notes')?.value.trim() || ''
    };
    
    if (companyId) {
      await api.receivables?.companies?.update(companyId, data);
    } else {
      await api.receivables?.companies?.create(data);
    }
    
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
    await loadCompanies();
    showSuccess(companyId ? 'Empresa actualizada' : 'Empresa creada');
  } catch (err) {
    console.error('Error saving company:', err);
    showError(err?.response?.data?.error || 'Error al guardar empresa');
  }
}

// Funciones globales para onclick
window.editCompany = async function(companyId) {
  showCompanyModal(companyId);
};

window.deleteCompany = async function(companyId) {
  if (!confirm('¿Estás seguro de eliminar esta empresa?')) return;
  
  try {
    const api = getAPI();
    await api.receivables?.companies?.delete(companyId);
    await loadCompanies();
    showSuccess('Empresa eliminada');
  } catch (err) {
    console.error('Error deleting company:', err);
    showError(err?.response?.data?.error || 'Error al eliminar empresa');
  }
};

window.viewCompanyHistory = async function(companyId) {
  try {
    const api = getAPI();
    const company = companies.find(c => c._id === companyId);
    if (!company) {
      showError('Empresa no encontrada');
      return;
    }
    
    // Obtener ventas y cuentas por cobrar de esta empresa
    const [sales, receivablesData] = await Promise.all([
      api.sales?.list({ companyAccountId: companyId, status: 'closed', limit: 1000 }) || { items: [] },
      api.receivables?.list({ companyAccountId: companyId, limit: 1000 }) || []
    ]);
    
    const salesList = sales.items || sales || [];
    const receivablesList = Array.isArray(receivablesData) ? receivablesData : (receivablesData.items || []);
    
    // Calcular estadísticas
    const totalSales = salesList.length;
    const totalSalesAmount = salesList.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const totalReceivables = receivablesList.length;
    const totalReceivablesAmount = receivablesList.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
    const totalPaid = receivablesList.reduce((sum, r) => sum + (Number(r.paidAmount) || 0), 0);
    const totalBalance = receivablesList.reduce((sum, r) => sum + (Number(r.balance) || 0), 0);
    
    // Obtener links activos
    const links = await api.receivables?.links?.list({ companyAccountId: companyId, active: true }) || [];
    
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;
    
    modalBody.innerHTML = `
      <div class="bg-slate-800/50 dark:bg-slate-800/50 theme-light:bg-sky-50/90 rounded-xl shadow-xl border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300/50 p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h3 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-1">Historial: ${escapeHtml(company.name)}</h3>
            <span class="px-2 py-1 rounded text-xs font-semibold ${
              company.type === 'recurrente'
                ? 'bg-green-500/20 text-green-400 dark:text-green-400 theme-light:text-green-700'
                : 'bg-purple-500/20 text-purple-400 dark:text-purple-400 theme-light:text-purple-700'
            }">${company.type === 'recurrente' ? 'Recurrente' : 'Particular'}</span>
          </div>
          <button onclick="document.getElementById('modal').classList.add('hidden')" class="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors">✕ Cerrar</button>
        </div>
        
        <!-- Estadísticas -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white rounded-lg p-4 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Total Ventas</div>
            <div class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900">${totalSales}</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">${formatMoney(totalSalesAmount)}</div>
          </div>
          <div class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white rounded-lg p-4 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Cuentas por Cobrar</div>
            <div class="text-2xl font-bold text-orange-400 dark:text-orange-400 theme-light:text-orange-600">${totalReceivables}</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">${formatMoney(totalReceivablesAmount)}</div>
          </div>
          <div class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white rounded-lg p-4 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Pagado</div>
            <div class="text-2xl font-bold text-green-400 dark:text-green-400 theme-light:text-green-600">${formatMoney(totalPaid)}</div>
          </div>
          <div class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white rounded-lg p-4 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Saldo Pendiente</div>
            <div class="text-2xl font-bold text-yellow-400 dark:text-yellow-400 theme-light:text-yellow-600">${formatMoney(totalBalance)}</div>
          </div>
        </div>
        
        <!-- Links activos (solo para empresas recurrentes) -->
        ${company.type === 'recurrente' && links.length > 0 ? `
          <div class="mb-6">
            <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-3">Vehículos Vinculados (${links.length})</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              ${links.map(link => `
                <div class="p-3 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white rounded-lg border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200">
                  <div class="font-mono font-semibold text-white dark:text-white theme-light:text-slate-900">${escapeHtml(link.plate)}</div>
                  ${link.customerName ? `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">${escapeHtml(link.customerName)}</div>` : ''}
                  <div class="text-xs text-slate-500 dark:text-slate-500 theme-light:text-slate-500 mt-1">Vinculado: ${formatDate(link.linkedAt)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        <!-- Ventas recientes -->
        <div class="mb-6">
          <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-3">Ventas Recientes</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100">
                <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
                  <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Remisión</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Fecha</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Placa</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Total</th>
                </tr>
              </thead>
              <tbody class="text-white dark:text-white theme-light:text-slate-900">
                ${salesList.slice(0, 20).map(sale => `
                  <tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300/30 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-100/50">
                    <td class="px-3 py-2 font-mono">${String(sale.number || '').padStart(5, '0')}</td>
                    <td class="px-3 py-2">${formatDate(sale.closedAt || sale.createdAt)}</td>
                    <td class="px-3 py-2 font-mono">${escapeHtml(sale.vehicle?.plate || '—')}</td>
                    <td class="px-3 py-2 text-right font-semibold">${formatMoney(sale.total || 0)}</td>
                  </tr>
                `).join('')}
                ${salesList.length === 0 ? '<tr><td colspan="4" class="px-3 py-4 text-center text-slate-400">No hay ventas registradas</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
        
        <!-- Cuentas por cobrar -->
        <div>
          <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-3">Cuentas por Cobrar</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-sky-100">
                <tr class="border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
                  <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Remisión</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Placa</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Total</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Pagado</th>
                  <th class="px-3 py-2 text-right text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Saldo</th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Estado</th>
                </tr>
              </thead>
              <tbody class="text-white dark:text-white theme-light:text-slate-900">
                ${receivablesList.map(rec => {
                  const statusColor = rec.status === 'paid' 
                    ? 'bg-green-500/20 text-green-400'
                    : rec.status === 'partial'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-yellow-500/20 text-yellow-400';
                  return `
                    <tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300/30 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-100/50">
                      <td class="px-3 py-2 font-mono">${escapeHtml(rec.saleNumber || '—')}</td>
                      <td class="px-3 py-2 font-mono">${escapeHtml(rec.vehicle?.plate || '—')}</td>
                      <td class="px-3 py-2 text-right">${formatMoney(rec.totalAmount || 0)}</td>
                      <td class="px-3 py-2 text-right text-green-400">${formatMoney(rec.paidAmount || 0)}</td>
                      <td class="px-3 py-2 text-right font-semibold text-orange-400">${formatMoney(rec.balance || 0)}</td>
                      <td class="px-3 py-2">
                        <span class="px-2 py-1 rounded text-xs font-semibold ${statusColor}">
                          ${rec.status === 'paid' ? 'Pagada' : rec.status === 'partial' ? 'Parcial' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  `;
                }).join('')}
                ${receivablesList.length === 0 ? '<tr><td colspan="6" class="px-3 py-4 text-center text-slate-400">No hay cuentas por cobrar</td></tr>' : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    document.getElementById('modal')?.classList.remove('hidden');
  } catch (err) {
    console.error('Error loading company history:', err);
    showError('Error al cargar historial de empresa');
  }
};

function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ========== CUENTAS POR COBRAR ==========

async function loadReceivables() {
  try {
    const api = getAPI();
    const status = document.getElementById('filter-status')?.value || '';
    const companyId = document.getElementById('filter-company')?.value || '';
    const plate = document.getElementById('filter-plate')?.value.trim() || '';
    const from = document.getElementById('filter-from')?.value || '';
    const to = document.getElementById('filter-to')?.value || '';
    
    const params = {};
    if (status) params.status = status;
    if (companyId) params.companyAccountId = companyId;
    if (plate) params.plate = plate;
    if (from) params.from = from;
    if (to) params.to = to;
    
    const res = await api.receivables?.list(params) || [];
    receivables = res || [];
    renderReceivables();
  } catch (err) {
    console.error('Error loading receivables:', err);
    showError('Error al cargar cuentas por cobrar');
  }
}

function renderReceivables() {
  const tbody = document.getElementById('receivables-body');
  if (!tbody) return;
  
  if (receivables.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="px-4 py-4 text-center text-slate-400">No hay cuentas por cobrar</td></tr>';
    return;
  }
  
  tbody.innerHTML = receivables.map(r => {
    const statusColors = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      partial: 'bg-blue-500/20 text-blue-400',
      paid: 'bg-green-500/20 text-green-400',
      cancelled: 'bg-red-500/20 text-red-400'
    };
    
    const statusLabels = {
      pending: 'Pendiente',
      partial: 'Parcial',
      paid: 'Pagada',
      cancelled: 'Cancelada'
    };
    
    return `
      <tr class="border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300/30 hover:bg-slate-700/20 dark:hover:bg-slate-700/20 theme-light:hover:bg-slate-100/50">
        <td class="px-2 sm:px-4 py-2" data-label="Fecha">${formatDate(r.createdAt)}</td>
        <td class="px-2 sm:px-4 py-2" data-label="Remisión">#${r.saleNumber || 'N/A'}</td>
        <td class="px-2 sm:px-4 py-2" data-label="Cliente">
          <div class="font-medium text-sm sm:text-base">${escapeHtml(r.customer?.name || 'Sin nombre')}</div>
          ${r.customer?.idNumber ? `<div class="text-xs text-slate-400">${escapeHtml(r.customer.idNumber)}</div>` : ''}
        </td>
        <td class="px-2 sm:px-4 py-2" data-label="Placa">
          <span class="font-mono text-sm">${escapeHtml(r.vehicle?.plate || 'N/A')}</span>
        </td>
        <td class="px-2 sm:px-4 py-2" data-label="Empresa">
          ${r.companyAccountId?.name ? `<span class="text-xs sm:text-sm">${escapeHtml(r.companyAccountId.name)}</span>` : '<span class="text-slate-400 text-xs">-</span>'}
        </td>
        <td class="px-2 sm:px-4 py-2 text-right" data-label="Total"><span class="text-sm sm:text-base">$${formatMoney(r.totalAmount || 0)}</span></td>
        <td class="px-2 sm:px-4 py-2 text-right" data-label="Pagado"><span class="text-sm sm:text-base">$${formatMoney(r.paidAmount || 0)}</span></td>
        <td class="px-2 sm:px-4 py-2 text-right font-bold" data-label="Saldo">
          <span class="text-sm sm:text-base ${r.balance > 0 ? 'text-orange-400' : 'text-green-400'}">$${formatMoney(r.balance || 0)}</span>
        </td>
        <td class="px-2 sm:px-4 py-2" data-label="Estado">
          <span class="px-2 py-1 rounded text-xs ${statusColors[r.status] || ''}">${statusLabels[r.status] || r.status}</span>
        </td>
        <td class="px-2 sm:px-4 py-2" data-label="Acciones">
          <div class="flex flex-col sm:flex-row gap-1 sm:gap-2">
            ${r.status !== 'paid' && r.status !== 'cancelled' ? `
              <button onclick="showPaymentModal('${r._id}')" class="px-2 sm:px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors whitespace-nowrap">Pago</button>
            ` : ''}
            <button onclick="showReceivableDetail('${r._id}')" class="px-2 sm:px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors whitespace-nowrap">Ver</button>
            ${r.status !== 'paid' && r.status !== 'cancelled' ? `
              <button onclick="cancelReceivable('${r._id}')" class="px-2 sm:px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors whitespace-nowrap">Cancelar</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadStats() {
  try {
    const api = getAPI();
    const res = await api.receivables?.stats() || {};
    stats = res || {};
    
    const balanceEl = document.getElementById('stats-balance');
    const pendingEl = document.getElementById('stats-pending');
    const partialEl = document.getElementById('stats-partial');
    const paidEl = document.getElementById('stats-paid');
    
    if (balanceEl) balanceEl.textContent = '$' + formatMoney(stats.balance || 0);
    if (pendingEl) pendingEl.textContent = stats.pending || 0;
    if (partialEl) partialEl.textContent = stats.partial || 0;
    if (paidEl) paidEl.textContent = stats.paid || 0;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

window.showPaymentModal = async function(receivableId) {
  const receivable = receivables.find(r => r._id === receivableId);
  if (!receivable) return;
  
  const modalBody = document.getElementById('modalBody');
  if (!modalBody) return;
  
  // Cargar cuentas para el selector
  let accounts = [];
  try {
    const api = getAPI();
    const accountsData = await api.accounts?.balances();
    accounts = accountsData?.balances || [];
  } catch (e) {
    console.warn('Error cargando cuentas:', e);
  }
  
  modalBody.innerHTML = `
    <h2 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">Registrar Pago</h2>
    <div class="mb-4 p-4 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-100 rounded-lg">
      <div class="text-sm text-slate-400 mb-2">Cliente: <span class="text-white theme-light:text-slate-900 font-medium">${escapeHtml(receivable.customer?.name || 'Sin nombre')}</span></div>
      <div class="text-sm text-slate-400 mb-2">Remisión: <span class="text-white theme-light:text-slate-900 font-medium">#${receivable.saleNumber || 'N/A'}</span></div>
      <div class="text-sm text-slate-400 mb-2">Total: <span class="text-white theme-light:text-slate-900 font-medium">$${formatMoney(receivable.totalAmount || 0)}</span></div>
      <div class="text-sm text-slate-400 mb-2">Pagado: <span class="text-white theme-light:text-slate-900 font-medium">$${formatMoney(receivable.paidAmount || 0)}</span></div>
      <div class="text-sm text-slate-400">Saldo pendiente: <span class="text-orange-400 font-bold">$${formatMoney(receivable.balance || 0)}</span></div>
    </div>
    <form id="payment-form" class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Monto *</label>
        <input type="number" id="payment-amount" required min="0.01" max="${receivable.balance}" step="0.01"
          class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500" />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Método de Pago</label>
        <select id="payment-method"
          class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500">
          <option value="Efectivo">Efectivo</option>
          <option value="Transferencia">Transferencia</option>
          <option value="Cheque">Cheque</option>
          <option value="Tarjeta">Tarjeta</option>
          <option value="Otro">Otro</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Cuenta *</label>
        <select id="payment-account" required
          class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500">
          <option value="">Seleccionar cuenta</option>
          ${accounts.map(acc => `<option value="${acc.accountId || acc._id || acc.id}">${escapeHtml(acc.name || 'Sin nombre')}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Notas</label>
        <textarea id="payment-notes" rows="2"
          class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"></textarea>
      </div>
      <div class="flex gap-2 justify-end pt-4">
        <button type="button" onclick="document.getElementById('modal').classList.add('hidden')" 
          class="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors">Cancelar</button>
        <button type="submit" 
          class="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Registrar Pago</button>
      </div>
    </form>
  `;
  
  document.getElementById('modal')?.classList.remove('hidden');
  
  document.getElementById('payment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addPayment(receivableId);
  });
};

async function addPayment(receivableId) {
  try {
    const api = getAPI();
    const amount = parseFloat(document.getElementById('payment-amount')?.value || 0);
    const paymentMethod = document.getElementById('payment-method')?.value || '';
    const accountId = document.getElementById('payment-account')?.value || '';
    const notes = document.getElementById('payment-notes')?.value.trim() || '';
    
    if (amount <= 0) {
      showError('El monto debe ser mayor a 0');
      return;
    }
    
    if (!accountId) {
      showError('Debe seleccionar una cuenta');
      return;
    }
    
    await api.receivables?.addPayment(receivableId, {
      amount,
      paymentMethod,
      accountId,
      notes
    });
    
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
    await loadReceivables();
    await loadStats();
    showSuccess('Pago registrado');
  } catch (err) {
    console.error('Error adding payment:', err);
    showError(err?.response?.data?.error || 'Error al registrar pago');
  }
}

window.showReceivableDetail = async function(receivableId) {
  try {
    const api = getAPI();
    const receivable = await api.receivables?.get(receivableId);
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;
    
    modalBody.innerHTML = `
      <h2 class="text-2xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">Detalle de Cuenta por Cobrar</h2>
      <div class="space-y-4">
        <div class="p-4 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-100 rounded-lg">
          <h3 class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Información General</h3>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div><span class="text-slate-400">Remisión:</span> <span class="text-white theme-light:text-slate-900">#${receivable.saleNumber || 'N/A'}</span></div>
            <div><span class="text-slate-400">Fecha:</span> <span class="text-white theme-light:text-slate-900">${formatDate(receivable.createdAt)}</span></div>
            <div><span class="text-slate-400">Cliente:</span> <span class="text-white theme-light:text-slate-900">${escapeHtml(receivable.customer?.name || 'Sin nombre')}</span></div>
            <div><span class="text-slate-400">Placa:</span> <span class="text-white theme-light:text-slate-900 font-mono">${escapeHtml(receivable.vehicle?.plate || 'N/A')}</span></div>
            <div><span class="text-slate-400">Total:</span> <span class="text-white theme-light:text-slate-900 font-bold">$${formatMoney(receivable.totalAmount || 0)}</span></div>
            <div><span class="text-slate-400">Pagado:</span> <span class="text-white theme-light:text-slate-900">$${formatMoney(receivable.paidAmount || 0)}</span></div>
            <div><span class="text-slate-400">Saldo:</span> <span class="text-orange-400 font-bold">$${formatMoney(receivable.balance || 0)}</span></div>
            <div><span class="text-slate-400">Estado:</span> <span class="text-white theme-light:text-slate-900">${receivable.status || 'N/A'}</span></div>
          </div>
        </div>
        ${receivable.payments && receivable.payments.length > 0 ? `
          <div>
            <h3 class="font-semibold text-white dark:text-white theme-light:text-slate-900 mb-2">Historial de Pagos</h3>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-slate-200">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Fecha</th>
                    <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Monto</th>
                    <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Método</th>
                    <th class="px-3 py-2 text-left text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  ${receivable.payments.map(p => `
                    <tr class="border-b border-slate-700/30">
                      <td class="px-3 py-2 text-white theme-light:text-slate-900">${formatDate(p.paymentDate)}</td>
                      <td class="px-3 py-2 text-white theme-light:text-slate-900 font-medium">$${formatMoney(p.amount || 0)}</td>
                      <td class="px-3 py-2 text-white theme-light:text-slate-900">${escapeHtml(p.paymentMethod || '')}</td>
                      <td class="px-3 py-2 text-white theme-light:text-slate-900">${escapeHtml(p.notes || '')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : '<p class="text-slate-400 text-sm">No hay pagos registrados</p>'}
        <div class="flex gap-2 justify-end pt-4">
          <button onclick="document.getElementById('modal').classList.add('hidden')" 
            class="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors">Cerrar</button>
        </div>
      </div>
    `;
    
    document.getElementById('modal')?.classList.remove('hidden');
  } catch (err) {
    console.error('Error loading receivable detail:', err);
    showError('Error al cargar detalle');
  }
};

window.cancelReceivable = async function(receivableId) {
  if (!confirm('¿Estás seguro de cancelar esta cuenta por cobrar?')) return;
  
  try {
    const api = getAPI();
    await api.receivables?.cancel(receivableId);
    await loadReceivables();
    await loadStats();
    showSuccess('Cuenta cancelada');
  } catch (err) {
    console.error('Error cancelling receivable:', err);
    showError(err?.response?.data?.error || 'Error al cancelar cuenta');
  }
};

// ========== HELPERS ==========

function formatDate(date) {
  if (!date) return 'N/A';
  return dayjs(date).format('DD/MM/YYYY');
}

function formatMoney(amount) {
  return new Intl.NumberFormat('es-CO', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }).format(amount || 0);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  alert(`❌ ${message}`);
}

function showSuccess(message) {
  alert(`✅ ${message}`);
}

