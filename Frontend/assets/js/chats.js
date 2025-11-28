// Frontend/assets/js/chats.js
import { API } from "./api.esm.js";
import { initQuotes } from "./quotes.js";
import { initNotes } from "./notes.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let currentChatId = null;
let chatsList = [];
let liveConnection = null;
let technicians = [];
let vehicles = [];

// Inicialización
export function initChats() {
  const tab = $('#tab-chats');
  if (!tab) return;

  setupEventListeners();
  loadTechnicians();
  loadVehicles();
  loadChats();
  connectLive();
}

// Event listeners
function setupEventListeners() {
  $('#btnCreateChat')?.addEventListener('click', openCreateChatModal);
  $('#toggleInventoryPanel')?.addEventListener('click', () => {
    togglePanel('inventory');
    if (!$('#inventoryPanel').classList.contains('hidden')) {
      $('#inventorySearch').focus();
    }
  });
  $('#toggleQuotesPanel')?.addEventListener('click', () => {
    togglePanel('quotes');
    if (!$('#quotesPanel').classList.contains('hidden')) {
      initQuotesPanel();
    }
  });
  $('#toggleAgendaPanel')?.addEventListener('click', () => {
    togglePanel('agenda');
    if (!$('#agendaPanel').classList.contains('hidden')) {
      initAgendaPanel();
    }
  });
  
  const inventorySearch = $('#inventorySearch');
  if (inventorySearch) {
    let searchTimeout = null;
    inventorySearch.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => searchInventory(e.target.value), 300);
    });
  }
}

// Toggle paneles desplegables
function togglePanel(panelName) {
  const panel = $(`#${panelName}Panel`);
  const icon = $(`#${panelName}PanelIcon`);
  if (!panel || !icon) return;
  
  const isHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  icon.textContent = isHidden ? '▲' : '▼';
}

// Cargar técnicos
async function loadTechnicians() {
  try {
    technicians = await API.company.getTechnicians();
  } catch (err) {
    console.error('Error cargando técnicos:', err);
    technicians = [];
  }
}

// Cargar vehículos
async function loadVehicles() {
  try {
    const result = await API.vehicles.list({ active: true });
    vehicles = result?.items || result || [];
  } catch (err) {
    console.error('Error cargando vehículos:', err);
    vehicles = [];
  }
}

// Cargar chats
async function loadChats() {
  try {
    const result = await API.chats.list({ active: true });
    chatsList = result?.items || result || [];
    renderChatsList();
    renderChatsCards();
  } catch (err) {
    console.error('Error cargando chats:', err);
    chatsList = [];
  }
}

// Renderizar lista de chats
function renderChatsList() {
  const container = $('#chatsList');
  if (!container) return;

  if (chatsList.length === 0) {
    container.innerHTML = '<p class="text-slate-400 text-center py-8">No hay chats activos</p>';
    return;
  }

  container.innerHTML = chatsList.map(chat => `
    <div class="chat-item p-3 mb-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg cursor-pointer hover:bg-slate-700/50 dark:hover:bg-slate-700/50 theme-light:hover:bg-slate-200 transition-colors ${currentChatId === chat._id ? 'ring-2 ring-blue-500' : ''}" data-chat-id="${chat._id}">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${escapeHtml(chat.customer.name)}</div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${escapeHtml(chat.customer.phone)}</div>
          ${chat.vehicle?.vehicleId ? `<div class="text-xs text-slate-500 dark:text-slate-500 theme-light:text-slate-500 mt-1">${getVehicleDisplay(chat.vehicle.vehicleId)}</div>` : ''}
        </div>
        <div class="text-xs text-slate-400">${getPlatformIcon(chat.platform)}</div>
      </div>
    </div>
  `).join('');

  // Event listeners para seleccionar chat
  container.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', () => {
      const chatId = item.dataset.chatId;
      selectChat(chatId);
    });
  });
}

// Renderizar tarjetas de chats activos en barra superior
function renderChatsCards() {
  const container = $('#chatsCardsBar');
  if (!container) return;

  if (chatsList.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = chatsList.map(chat => `
    <div class="chat-card flex-shrink-0 px-3 py-2 bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-slate-200 rounded-lg cursor-pointer hover:bg-slate-700 dark:hover:bg-slate-700 theme-light:hover:bg-slate-300 transition-colors ${currentChatId === chat._id ? 'ring-2 ring-blue-500' : ''}" data-chat-id="${chat._id}">
      <div class="text-sm font-medium text-white dark:text-white theme-light:text-slate-900">${escapeHtml(chat.customer.name)}</div>
      <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${getPlatformIcon(chat.platform)}</div>
    </div>
  `).join('');

  // Event listeners
  container.querySelectorAll('.chat-card').forEach(card => {
    card.addEventListener('click', () => {
      const chatId = card.dataset.chatId;
      selectChat(chatId);
    });
  });
}

// Seleccionar chat
async function selectChat(chatId) {
  currentChatId = chatId;
  renderChatsList();
  renderChatsCards();
  
  try {
    const chat = await API.chats.get(chatId);
    renderChatDetails(chat.item || chat);
    
    // Actualizar paneles si están abiertos
    if (!$('#quotesPanel').classList.contains('hidden')) {
      loadQuotesForChat();
    }
    if (!$('#agendaPanel').classList.contains('hidden')) {
      loadAgendaForChat();
    }
  } catch (err) {
    console.error('Error cargando chat:', err);
    alert('Error al cargar el chat');
  }
}

// Renderizar detalles del chat
function renderChatDetails(chat) {
  const container = $('#chatDetailsContent');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900">${escapeHtml(chat.customer.name)}</h3>
        <button id="btnEscalateChat" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors ${chat.escalatedToAdmin ? 'opacity-50 cursor-not-allowed' : ''}" ${chat.escalatedToAdmin ? 'disabled' : ''}>
          ${chat.escalatedToAdmin ? 'Escalado' : 'Escalar a ADMIN'}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Nombre</label>
          <input type="text" id="chatCustomerName" value="${escapeHtml(chat.customer.name)}" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Teléfono</label>
          <input type="text" id="chatCustomerPhone" value="${escapeHtml(chat.customer.phone)}" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900" />
        </div>
        <div class="relative">
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Vehículo</label>
          <input type="text" id="chatVehicleSearch" placeholder="Buscar vehículo (marca, línea, cilindraje)..." value="${chat.vehicle?.vehicleId ? getVehicleDisplay(chat.vehicle.vehicleId) : ''}" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900" />
          <input type="hidden" id="chatVehicleId" value="${chat.vehicle?.vehicleId || ''}" />
          <div id="chatVehicleDropdown" class="hidden absolute z-50 w-full mt-1 bg-slate-800 dark:bg-slate-800 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto" style="top: 100%;"></div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Año</label>
          <input type="text" id="chatVehicleYear" value="${escapeHtml(chat.vehicle?.year || '')}" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Técnico</label>
          <select id="chatTechnician" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900">
            <option value="">Sin asignar</option>
            ${technicians.map(t => `<option value="${t}" ${chat.technician === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Plataforma</label>
          <select id="chatPlatform" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900">
            <option value="WhatsApp" ${chat.platform === 'WhatsApp' ? 'selected' : ''}>WhatsApp</option>
            <option value="Messenger" ${chat.platform === 'Messenger' ? 'selected' : ''}>Messenger</option>
            <option value="TikTok" ${chat.platform === 'TikTok' ? 'selected' : ''}>TikTok</option>
            <option value="Instagram" ${chat.platform === 'Instagram' ? 'selected' : ''}>Instagram</option>
          </select>
        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Contexto</label>
        <textarea id="chatContext" rows="3" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900">${escapeHtml(chat.context || '')}</textarea>
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Precio de cotización</label>
        <input type="number" id="chatQuotePrice" value="${chat.quotePrice || ''}" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900" />
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">Historial de items consultados</label>
        <div id="chatInventoryHistory" class="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
          ${renderInventoryHistory(chat.inventoryHistory || [])}
        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">Comentarios</label>
        <div id="chatComments" class="space-y-2 mb-3 max-h-64 overflow-y-auto custom-scrollbar">
          ${renderComments(chat.comments || [])}
        </div>
        <div class="flex gap-2">
          <input type="text" id="newComment" placeholder="Escribe un comentario..." class="flex-1 px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900" />
          <button id="btnAddComment" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">Agregar</button>
        </div>
      </div>

      <div class="flex gap-2">
        <button id="btnSaveChat" class="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors">Guardar cambios</button>
        <button id="btnDeleteChat" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors">Eliminar</button>
      </div>
    </div>
  `;

  // Event listeners
  $('#btnSaveChat')?.addEventListener('click', saveChat);
  $('#btnDeleteChat')?.addEventListener('click', deleteChat);
  $('#btnEscalateChat')?.addEventListener('click', escalateChat);
  $('#btnAddComment')?.addEventListener('click', addComment);
  $('#newComment')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addComment();
    }
  });
  
  // Inicializar búsqueda de vehículos en detalles
  initVehicleSearch('chatVehicleSearch', 'chatVehicleDropdown', 'chatVehicleId');
}

// Renderizar historial de inventario
function renderInventoryHistory(history) {
  if (!history || history.length === 0) {
    return '<p class="text-slate-400 text-sm">No hay items consultados</p>';
  }

  return history.map(item => `
    <div class="p-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-white dark:text-white theme-light:text-slate-900">${escapeHtml(item.name || item.sku || 'Sin nombre')}</div>
          ${item.sku ? `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">SKU: ${escapeHtml(item.sku)}</div>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

// Renderizar comentarios
function renderComments(comments) {
  if (!comments || comments.length === 0) {
    return '<p class="text-slate-400 text-sm">No hay comentarios</p>';
  }

  return comments.map(comment => `
    <div class="p-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg">
      <div class="text-sm text-white dark:text-white theme-light:text-slate-900">${escapeHtml(comment.text)}</div>
      <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">${formatDate(comment.createdAt)}</div>
    </div>
  `).join('');
}

// Guardar chat
async function saveChat() {
  if (!currentChatId) return;

  try {
    const update = {
      customer: {
        name: $('#chatCustomerName')?.value || '',
        phone: $('#chatCustomerPhone')?.value || ''
      },
      vehicle: {
        vehicleId: $('#chatVehicleId')?.value || null,
        year: $('#chatVehicleYear')?.value || ''
      },
      technician: $('#chatTechnician')?.value || '',
      context: $('#chatContext')?.value || '',
      platform: $('#chatPlatform')?.value || 'WhatsApp',
      quotePrice: $('#chatQuotePrice')?.value ? Number($('#chatQuotePrice').value) : null
    };

    await API.chats.update(currentChatId, update);
    await loadChats();
    await selectChat(currentChatId);
    alert('Chat actualizado correctamente');
  } catch (err) {
    console.error('Error guardando chat:', err);
    alert('Error al guardar el chat: ' + (err.message || err));
  }
}

// Eliminar chat
async function deleteChat() {
  if (!currentChatId) return;
  if (!confirm('¿Estás seguro de eliminar este chat?')) return;

  try {
    await API.chats.delete(currentChatId);
    currentChatId = null;
    await loadChats();
    $('#chatDetailsContent').innerHTML = '<p class="text-slate-400 text-center py-8">Selecciona un chat para ver los detalles</p>';
    alert('Chat eliminado correctamente');
  } catch (err) {
    console.error('Error eliminando chat:', err);
    alert('Error al eliminar el chat: ' + (err.message || err));
  }
}

// Escalar a ADMIN
async function escalateChat() {
  if (!currentChatId) return;

  try {
    await API.chats.update(currentChatId, { escalatedToAdmin: true });
    await selectChat(currentChatId);
    alert('Chat escalado a ADMIN');
  } catch (err) {
    console.error('Error escalando chat:', err);
    alert('Error al escalar el chat: ' + (err.message || err));
  }
}

// Agregar comentario
async function addComment() {
  if (!currentChatId) return;

  const text = $('#newComment')?.value?.trim();
  if (!text) return;

  try {
    await API.chats.addComment(currentChatId, text);
    $('#newComment').value = '';
    await selectChat(currentChatId);
  } catch (err) {
    console.error('Error agregando comentario:', err);
    alert('Error al agregar comentario: ' + (err.message || err));
  }
}

// Abrir modal crear chat
function openCreateChatModal() {
  const modal = $('#modal');
  const modalBody = $('#modalBody');
  if (!modal || !modalBody) return;

  modalBody.innerHTML = `
    <div class="space-y-4">
      <h3 class="text-xl font-bold text-white dark:text-white theme-light:text-slate-900 mb-4">Crear nuevo chat</h3>
      
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Nombre del cliente *</label>
          <input type="text" id="newChatName" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900" required />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Teléfono *</label>
          <input type="text" id="newChatPhone" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900" required />
        </div>
        <div class="relative">
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Vehículo</label>
          <input type="text" id="newChatVehicleSearch" placeholder="Buscar vehículo (marca, línea, cilindraje)..." class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900" />
          <input type="hidden" id="newChatVehicleId" value="" />
          <div id="newChatVehicleDropdown" class="hidden absolute z-50 w-full mt-1 bg-slate-800 dark:bg-slate-800 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto" style="top: 100%;"></div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Año</label>
          <input type="text" id="newChatYear" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900" />
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Técnico</label>
          <select id="newChatTechnician" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900">
            <option value="">Sin asignar</option>
            ${technicians.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Plataforma</label>
          <select id="newChatPlatform" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900">
            <option value="WhatsApp">WhatsApp</option>
            <option value="Messenger">Messenger</option>
            <option value="TikTok">TikTok</option>
            <option value="Instagram">Instagram</option>
          </select>
        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Contexto</label>
        <textarea id="newChatContext" rows="3" class="w-full px-3 py-2 bg-slate-900/50 dark:bg-slate-900/50 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg text-white dark:text-white theme-light:text-slate-900"></textarea>
      </div>

      <div class="flex gap-2 justify-end">
        <button id="btnCancelCreateChat" class="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors">Cancelar</button>
        <button id="btnConfirmCreateChat" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">Crear</button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  $('#btnCancelCreateChat')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  $('#btnConfirmCreateChat')?.addEventListener('click', createChat);
  
  // Inicializar búsqueda de vehículos en modal de creación
  initVehicleSearch('newChatVehicleSearch', 'newChatVehicleDropdown', 'newChatVehicleId');
}

// Crear chat
async function createChat() {
  const name = $('#newChatName')?.value?.trim();
  const phone = $('#newChatPhone')?.value?.trim();

  if (!name || !phone) {
    alert('Nombre y teléfono son requeridos');
    return;
  }

  try {
    const chat = {
      customer: { name, phone },
      vehicle: {
        vehicleId: $('#newChatVehicleId')?.value || null,
        year: $('#newChatYear')?.value || ''
      },
      technician: $('#newChatTechnician')?.value || '',
      context: $('#newChatContext')?.value || '',
      platform: $('#newChatPlatform')?.value || 'WhatsApp'
    };

    const result = await API.chats.create(chat);
    $('#modal').classList.add('hidden');
    await loadChats();
    if (result?.item?._id) {
      await selectChat(result.item._id);
    }
    alert('Chat creado correctamente');
  } catch (err) {
    console.error('Error creando chat:', err);
    alert('Error al crear el chat: ' + (err.message || err));
  }
}

// Buscar inventario
let inventorySearchResults = [];
async function searchInventory(query) {
  if (!query || query.trim().length < 2) {
    $('#inventoryResults').innerHTML = '';
    return;
  }

  try {
    const items = await API.inventory.itemsList({ name: query.trim(), limit: 10 });
    inventorySearchResults = items || [];
    renderInventoryResults();
  } catch (err) {
    console.error('Error buscando inventario:', err);
    inventorySearchResults = [];
    renderInventoryResults();
  }
}

// Renderizar resultados de búsqueda de inventario
function renderInventoryResults() {
  const container = $('#inventoryResults');
  if (!container) return;

  if (inventorySearchResults.length === 0) {
    container.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">No se encontraron items</p>';
    return;
  }

  container.innerHTML = inventorySearchResults.map(item => `
    <div class="inventory-item p-2 mb-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <div class="text-sm font-medium text-white dark:text-white theme-light:text-slate-900">${escapeHtml(item.name || 'Sin nombre')}</div>
          ${item.sku ? `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">SKU: ${escapeHtml(item.sku)}</div>` : ''}
          ${item.salePrice ? `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Precio: $${formatNumber(item.salePrice)}</div>` : ''}
        </div>
        <button class="btnAddToHistory ml-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded transition-colors" data-item-id="${item._id}">
          Agregar
        </button>
      </div>
    </div>
  `).join('');

  // Event listeners para agregar al historial
  container.querySelectorAll('.btnAddToHistory').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.itemId;
      if (!currentChatId) {
        alert('Selecciona un chat primero');
        return;
      }
      try {
        await API.chats.addInventoryItem(currentChatId, itemId);
        await selectChat(currentChatId);
        alert('Item agregado al historial');
      } catch (err) {
        console.error('Error agregando item:', err);
        alert('Error al agregar item: ' + (err.message || err));
      }
    });
  });
}

// Inicializar panel de cotizaciones
function initQuotesPanel() {
  const container = $('#quotesPanelContent');
  if (!container) return;

  container.innerHTML = `
    <button id="btnCreateQuoteFromChat" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors mb-3">Crear cotización</button>
    <div id="quotesList" class="space-y-2 max-h-64 overflow-y-auto custom-scrollbar"></div>
  `;

  $('#btnCreateQuoteFromChat')?.addEventListener('click', openCreateQuoteFromChat);
  loadQuotesForChat();
}

// Cargar cotizaciones relacionadas con el chat actual
async function loadQuotesForChat() {
  const container = $('#quotesList');
  if (!container || !currentChatId) {
    if (container) container.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Selecciona un chat para ver cotizaciones</p>';
    return;
  }

  try {
    const chat = await API.chats.get(currentChatId);
    const chatData = chat.item || chat;
    const phone = chatData.customer?.phone || '';
    
    if (!phone) {
      container.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">No hay teléfono para buscar cotizaciones</p>';
      return;
    }

    // Buscar cotizaciones por teléfono del cliente
    const quotes = await API.quotesList(`?customer.phone=${encodeURIComponent(phone)}`);
    const quotesArray = Array.isArray(quotes) ? quotes : (quotes?.items || []);

    if (quotesArray.length === 0) {
      container.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">No hay cotizaciones para este cliente</p>';
      return;
    }

    container.innerHTML = quotesArray.slice(0, 5).map(quote => `
      <div class="p-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg">
        <div class="text-sm font-medium text-white dark:text-white theme-light:text-slate-900">Cotización #${quote.number || quote.seq || ''}</div>
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Total: $${formatNumber(quote.total || 0)}</div>
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${formatDate(quote.createdAt)}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error cargando cotizaciones:', err);
    container.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Error al cargar cotizaciones</p>';
  }
}

// Abrir modal para crear cotización desde chat
async function openCreateQuoteFromChat() {
  if (!currentChatId) {
    alert('Selecciona un chat primero');
    return;
  }

  try {
    const chat = await API.chats.get(currentChatId);
    const chatData = chat.item || chat;
    
    // Redirigir a cotizaciones.html con los datos del chat prellenados
    const params = new URLSearchParams();
    if (chatData.customer?.name) params.set('customerName', chatData.customer.name);
    if (chatData.customer?.phone) params.set('customerPhone', chatData.customer.phone);
    if (chatData.vehicle?.vehicleId) params.set('vehicleId', chatData.vehicle.vehicleId);
    if (chatData.vehicle?.year) params.set('year', chatData.vehicle.year);
    if (chatData.context) params.set('context', chatData.context);
    
    window.location.href = `cotizaciones.html?${params.toString()}`;
  } catch (err) {
    console.error('Error abriendo cotización:', err);
    alert('Error al abrir cotización: ' + (err.message || err));
  }
}

// Inicializar panel de agenda
function initAgendaPanel() {
  const container = $('#agendaPanelContent');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-3">
      <button id="btnCreateEventFromChat" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors mb-3">Crear evento</button>
      <div id="agendaEventsList" class="space-y-2 max-h-64 overflow-y-auto custom-scrollbar"></div>
    </div>
  `;

  $('#btnCreateEventFromChat')?.addEventListener('click', openCreateEventFromChat);
  loadAgendaForChat();
}

// Cargar eventos de agenda relacionados con el chat actual
async function loadAgendaForChat() {
  const container = $('#agendaEventsList');
  if (!container || !currentChatId) {
    if (container) container.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Selecciona un chat para ver eventos</p>';
    return;
  }

  try {
    const chat = await API.chats.get(currentChatId);
    const chatData = chat.item || chat;
    const phone = chatData.customer?.phone || '';
    
    if (!phone) {
      container.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">No hay teléfono para buscar eventos</p>';
      return;
    }

    // Buscar eventos por teléfono del cliente
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    const events = await API.calendar.list({
      from: firstDay.toISOString(),
      to: lastDay.toISOString()
    });
    
    const eventsArray = events?.items || [];
    const filteredEvents = eventsArray.filter(e => 
      e.customer?.phone === phone || e.plate === chatData.vehicle?.plate
    );

    if (filteredEvents.length === 0) {
      container.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">No hay eventos para este cliente</p>';
      return;
    }

    container.innerHTML = filteredEvents.slice(0, 5).map(event => `
      <div class="p-2 bg-slate-700/30 dark:bg-slate-700/30 theme-light:bg-slate-100 rounded-lg">
        <div class="text-sm font-medium text-white dark:text-white theme-light:text-slate-900">${escapeHtml(event.title || 'Sin título')}</div>
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${formatDate(event.startDate)}</div>
        ${event.description ? `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">${escapeHtml(event.description.substring(0, 50))}${event.description.length > 50 ? '...' : ''}</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('Error cargando eventos:', err);
    container.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">Error al cargar eventos</p>';
  }
}

// Abrir modal para crear evento desde chat
async function openCreateEventFromChat() {
  if (!currentChatId) {
    alert('Selecciona un chat primero');
    return;
  }

  try {
    const chat = await API.chats.get(currentChatId);
    const chatData = chat.item || chat;
    
    // Redirigir a notas.html con los datos del chat prellenados
    const params = new URLSearchParams();
    if (chatData.customer?.name) params.set('customerName', chatData.customer.name);
    if (chatData.customer?.phone) params.set('customerPhone', chatData.customer.phone);
    if (chatData.vehicle?.vehicleId) params.set('vehicleId', chatData.vehicle.vehicleId);
    if (chatData.context) params.set('context', chatData.context);
    
    window.location.href = `notas.html?${params.toString()}`;
  } catch (err) {
    console.error('Error abriendo evento:', err);
    alert('Error al abrir evento: ' + (err.message || err));
  }
}

// Conectar actualizaciones en vivo
function connectLive() {
  if (!window.API?.live?.connect) return;

  try {
    liveConnection = window.API.live.connect((event, data) => {
      if (event === 'chat:created' || event === 'chat:updated') {
        loadChats();
        if (currentChatId && data?.id === currentChatId) {
          selectChat(currentChatId);
        }
      } else if (event === 'chat:deleted') {
        if (currentChatId && data?.id === currentChatId) {
          currentChatId = null;
          $('#chatDetailsContent').innerHTML = '<p class="text-slate-400 text-center py-8">Selecciona un chat para ver los detalles</p>';
        }
        loadChats();
      }
    });
  } catch (e) {
    console.warn('SSE no disponible para chats:', e?.message || e);
  }
}

// Helpers
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatDate(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleString('es-ES');
  } catch {
    return String(date);
  }
}

function formatNumber(num) {
  if (!num) return '0';
  return Number(num).toLocaleString('es-ES');
}

function getPlatformIcon(platform) {
  const icons = {
    'WhatsApp': '💬',
    'Messenger': '💭',
    'TikTok': '🎵',
    'Instagram': '📷'
  };
  return icons[platform] || '💬';
}

function getVehicleDisplay(vehicleId) {
  if (!vehicleId) return '';
  const vehicle = vehicles.find(v => String(v._id) === String(vehicleId));
  if (!vehicle) return '';
  return `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
}

// Inicializar búsqueda de vehículos con autocompletado
function initVehicleSearch(searchInputId, dropdownId, hiddenInputId) {
  const searchInput = $(`#${searchInputId}`);
  const dropdown = $(`#${dropdownId}`);
  const hiddenInput = $(`#${hiddenInputId}`);
  
  if (!searchInput || !dropdown || !hiddenInput) return;
  
  let searchTimeout = null;
  let selectedVehicle = null;
  
  // Si hay un vehicleId pero el input de búsqueda está vacío, cargar el vehículo
  if (hiddenInput.value && !searchInput.value.trim()) {
    const vehicleId = hiddenInput.value;
    const vehicle = vehicles.find(v => String(v._id) === String(vehicleId));
    if (vehicle) {
      searchInput.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
      selectedVehicle = vehicle;
    }
    // Si no está en el array local, el valor ya debería estar en el input desde renderChatDetails
  }
  
  // Función para buscar vehículos
  async function searchVehicles(query) {
    if (!query || query.trim().length < 1) {
      dropdown.classList.add('hidden');
      return;
    }
    
    try {
      const result = await API.vehicles.search({ q: query.trim(), limit: 30 });
      const vehiclesList = Array.isArray(result?.items) ? result.items : [];
      
      if (vehiclesList.length === 0) {
        dropdown.innerHTML = '<div class="p-3 text-center text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No se encontraron vehículos</div>';
        dropdown.classList.remove('hidden');
        return;
      }
      
      dropdown.innerHTML = '';
      vehiclesList.forEach(v => {
        const div = document.createElement('div');
        div.className = 'p-3 cursor-pointer hover:bg-slate-700/50 dark:hover:bg-slate-700/50 theme-light:hover:bg-sky-100 border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300';
        div.innerHTML = `
          <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${escapeHtml(v.make)} ${escapeHtml(v.line)}</div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cilindraje: ${escapeHtml(v.displacement)}${v.modelYear ? ` | Modelo: ${escapeHtml(v.modelYear)}` : ''}</div>
        `;
        div.addEventListener('click', () => {
          selectedVehicle = v;
          hiddenInput.value = v._id;
          searchInput.value = `${v.make} ${v.line} ${v.displacement}`;
          dropdown.classList.add('hidden');
        });
        dropdown.appendChild(div);
      });
      
      dropdown.classList.remove('hidden');
    } catch (err) {
      console.error('Error al buscar vehículos:', err);
      dropdown.innerHTML = '<div class="p-3 text-center text-sm text-red-400">Error al buscar vehículos</div>';
      dropdown.classList.remove('hidden');
    }
  }
  
  // Event listener para input
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length >= 1) {
      searchTimeout = setTimeout(() => {
        searchVehicles(query);
      }, 300);
    } else {
      dropdown.classList.add('hidden');
      hiddenInput.value = '';
      selectedVehicle = null;
    }
  });
  
  // Event listener para focus
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length >= 1) {
      searchVehicles(searchInput.value.trim());
    }
  });
  
  // Cerrar dropdown al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initChats, 100);
  });
} else {
  setTimeout(initChats, 100);
}

