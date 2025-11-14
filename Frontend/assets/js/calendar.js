import { API } from "./api.esm.js";

let currentDate = new Date();
let events = [];

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function htmlEscape(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function formatDateTime(date) {
  const d = new Date(date);
  return d.toISOString().slice(0, 16);
}

function getEventsForDate(date) {
  const dateStr = formatDate(date);
  return events.filter(event => {
    const eventStart = new Date(event.startDate);
    const eventStartStr = formatDate(eventStart);
    return eventStartStr === dateStr;
  });
}

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  // Actualizar mes/año - formato más corto en móvil
  const monthYearEl = document.getElementById('calendar-month-year');
  if (monthYearEl) {
    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      // Formato corto para móvil: "Ene 2024"
      const shortMonth = monthNames[month].substring(0, 3);
      monthYearEl.textContent = `${shortMonth} ${year}`;
    } else {
      monthYearEl.textContent = `${monthNames[month]} ${year}`;
    }
  }
  
  // Obtener primer día del mes y cuántos días tiene
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  
  const daysContainer = document.getElementById('calendar-days');
  if (!daysContainer) return;
  
  daysContainer.innerHTML = '';
  
  // Días del mes anterior (para completar la primera semana)
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    const dayEl = createDayElement(day, true, null);
    daysContainer.appendChild(dayEl);
  }
  
  // Días del mes actual
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = date.toDateString() === today.toDateString();
    const dayEvents = getEventsForDate(date);
    const dayEl = createDayElement(day, false, date, isToday, dayEvents);
    daysContainer.appendChild(dayEl);
  }
  
  // Días del mes siguiente (para completar la última semana)
  const totalCells = daysContainer.children.length;
  const remainingCells = 42 - totalCells; // 6 semanas * 7 días
  for (let day = 1; day <= remainingCells; day++) {
    const dayEl = createDayElement(day, true, null);
    daysContainer.appendChild(dayEl);
  }
}

function createDayElement(day, isOtherMonth, date, isToday = false, dayEvents = []) {
  const dayEl = document.createElement('div');
  // Responsive: altura mínima más pequeña en móvil
  dayEl.className = `min-h-[50px] sm:min-h-[80px] p-0.5 sm:p-1 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded ${
    isOtherMonth ? 'bg-slate-900/20 dark:bg-slate-900/20 theme-light:bg-sky-100/50' : 'bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-sky-50'
  } ${
    isToday ? 'ring-1 sm:ring-2 ring-blue-500' : ''
  }`;
  
  const dayNumber = document.createElement('div');
  dayNumber.className = `text-[10px] sm:text-xs font-semibold mb-0.5 sm:mb-1 ${
    isOtherMonth ? 'text-slate-600 dark:text-slate-600 theme-light:text-slate-400' : 
    isToday ? 'text-blue-400 dark:text-blue-400 theme-light:text-blue-600' : 
    'text-white dark:text-white theme-light:text-slate-900'
  }`;
  dayNumber.textContent = day;
  dayEl.appendChild(dayNumber);
  
  // Mostrar eventos del día
  if (!isOtherMonth && dayEvents.length > 0) {
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'space-y-0.5 sm:space-y-0.5';
    
    // En móvil mostrar solo 1 evento, en desktop hasta 3
    const maxEvents = window.innerWidth < 640 ? 1 : 3;
    dayEvents.slice(0, maxEvents).forEach(event => {
      const eventEl = document.createElement('div');
      eventEl.className = `text-[9px] sm:text-xs px-0.5 sm:px-1 py-0 sm:py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity`;
      eventEl.style.backgroundColor = event.color || '#3b82f6';
      eventEl.style.color = 'white';
      eventEl.title = `${event.title}${event.description ? ': ' + event.description : ''}`;
      // En móvil mostrar solo un punto de color si hay eventos, en desktop el título
      if (window.innerWidth < 640) {
        eventEl.textContent = '●';
        eventEl.className = `text-[8px] sm:text-xs px-0.5 sm:px-1 py-0 sm:py-0.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity w-2 h-2 sm:w-auto sm:h-auto`;
      } else {
        eventEl.textContent = event.title;
      }
      eventEl.onclick = (e) => {
        e.stopPropagation();
        openEventModal(event);
      };
      eventsContainer.appendChild(eventEl);
    });
    
    if (dayEvents.length > maxEvents) {
      const moreEl = document.createElement('div');
      moreEl.className = 'text-[9px] sm:text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 px-0.5 sm:px-1';
      moreEl.textContent = window.innerWidth < 640 ? `+${dayEvents.length}` : `+${dayEvents.length - maxEvents} más`;
      moreEl.onclick = (e) => {
        e.stopPropagation();
        openDayEventsModal(date, dayEvents);
      };
      moreEl.style.cursor = 'pointer';
      eventsContainer.appendChild(moreEl);
    }
    
    dayEl.appendChild(eventsContainer);
  }
  
  // Permitir hacer clic en el día para mostrar eventos o crear uno nuevo
  if (!isOtherMonth && date) {
    dayEl.style.cursor = 'pointer';
    dayEl.onclick = (e) => {
      // Si se hizo clic en un evento específico o en el contenedor de eventos, no hacer nada (ya tiene su propio handler)
      if (e.target.closest('[style*="background-color"]') || e.target.closest('.space-y-0\\.5')) {
        return;
      }
      
      // Si hay eventos en este día, mostrar el modal con todos los eventos
      if (dayEvents.length > 0) {
        openDayEventsModal(date, dayEvents);
      } else {
        // Si no hay eventos, crear uno nuevo
        openNewEventModal(date);
      }
    };
  }
  
  return dayEl;
}

function openNewEventModal(date = null) {
  const defaultDate = date || currentDate;
  const defaultDateTime = formatDateTime(defaultDate);
  
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  const close = document.getElementById("modalClose");
  if (!modal || !body || !close) return;
  
  body.innerHTML = `
    <div class="space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar pr-2">
      <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Nueva Cita/Evento</h3>
      
      <!-- Información del Cliente y Vehículo -->
      <div class="border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 pt-4">
        <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-3">Información del Cliente y Vehículo</h4>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Placa <span class="text-red-400">*</span></label>
          <input id="event-plate" type="text" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" placeholder="ABC123" maxlength="6" />
          <div id="event-plate-loading" class="hidden text-xs text-blue-400 mt-1">Buscando...</div>
        </div>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Nombre del Cliente <span class="text-red-400">*</span></label>
          <input id="event-customer-name" type="text" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nombre completo" />
        </div>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Teléfono <span class="text-red-400">*</span></label>
          <input id="event-customer-phone" type="tel" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="3001234567" />
        </div>
        
        <div class="mb-3 relative">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Vehículo (de la base de datos)</label>
          <input id="event-vehicle-search" type="text" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Buscar vehículo (marca, línea, cilindraje)" />
          <input type="hidden" id="event-vehicle-id" />
          <div id="event-vehicle-dropdown" class="hidden absolute z-50 w-full mt-1 bg-slate-800 dark:bg-slate-800 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"></div>
          <div id="event-vehicle-selected" class="mt-2 text-sm text-green-400 dark:text-green-400 theme-light:text-green-600 hidden"></div>
        </div>
      </div>
      
      <!-- Fecha y Hora (Función más importante) -->
      <div class="border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 pt-4">
        <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-3">Fecha y Hora de la Cita</h4>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Fecha <span class="text-red-400">*</span></label>
            <input id="event-start-date" type="date" value="${formatDate(defaultDate)}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Hora <span class="text-red-400">*</span></label>
            <input id="event-start-time" type="time" value="${defaultDate.toTimeString().slice(0, 5)}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Fecha y hora de fin (opcional)</label>
          <input id="event-end" type="datetime-local" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-sky-100/50 p-2 rounded">
          <strong>Vista previa:</strong> <span id="event-datetime-preview" class="font-semibold">${new Date(defaultDate).toLocaleString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
      
      <!-- Cotización (Opcional) -->
      <div class="border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 pt-4">
        <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-3">Cotización (Opcional)</h4>
        <select id="event-quote" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Sin cotización</option>
        </select>
      </div>
      
      <!-- Información adicional -->
      <div class="border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 pt-4">
        <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-3">Información Adicional</h4>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Título</label>
          <input id="event-title" type="text" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Título del evento" />
        </div>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Descripción</label>
          <textarea id="event-description" rows="3" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" placeholder="Descripción (opcional)"></textarea>
        </div>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Color</label>
          <select id="event-color" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="#3b82f6">Azul</option>
            <option value="#10b981">Verde</option>
            <option value="#f59e0b">Amarillo</option>
            <option value="#ef4444">Rojo</option>
            <option value="#8b5cf6">Morado</option>
            <option value="#ec4899">Rosa</option>
          </select>
        </div>
        
        <div class="flex items-center gap-2">
          <input id="event-notification" type="checkbox" class="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500" />
          <label for="event-notification" class="text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800">Activar notificación</label>
        </div>
        
        <div id="event-notification-time" class="hidden mt-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Fecha y hora de notificación</label>
          <input id="event-notification-at" type="datetime-local" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      
      <div class="flex gap-2 mt-6 pt-4 border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
        <button id="event-save" class="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar</button>
        <button id="event-cancel" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-sky-200 theme-light:text-slate-800 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
      </div>
    </div>
  `;
  
  modal.classList.remove("hidden");
  
  // Referencias a elementos
  const plateEl = document.getElementById('event-plate');
  const customerNameEl = document.getElementById('event-customer-name');
  const customerPhoneEl = document.getElementById('event-customer-phone');
  const vehicleSearchEl = document.getElementById('event-vehicle-search');
  const vehicleIdEl = document.getElementById('event-vehicle-id');
  const vehicleDropdownEl = document.getElementById('event-vehicle-dropdown');
  const vehicleSelectedEl = document.getElementById('event-vehicle-selected');
  const quoteEl = document.getElementById('event-quote');
  const titleEl = document.getElementById('event-title');
  const descriptionEl = document.getElementById('event-description');
  const startDateEl = document.getElementById('event-start-date');
  const startTimeEl = document.getElementById('event-start-time');
  const endEl = document.getElementById('event-end');
  const colorEl = document.getElementById('event-color');
  const notificationEl = document.getElementById('event-notification');
  const notificationTimeEl = document.getElementById('event-notification-time');
  const notificationAtEl = document.getElementById('event-notification-at');
  const saveEl = document.getElementById('event-save');
  const cancelEl = document.getElementById('event-cancel');
  const datetimePreviewEl = document.getElementById('event-datetime-preview');
  const plateLoadingEl = document.getElementById('event-plate-loading');
  
  let selectedVehicle = null;
  let vehicleSearchTimeout = null;
  let quotesCache = [];
  
  // Autocompletar título con nombre del cliente
  customerNameEl.addEventListener('input', () => {
    if (!titleEl.value.trim() && customerNameEl.value.trim()) {
      titleEl.value = `Cita: ${customerNameEl.value.trim()}`;
    }
  });
  
  // Actualizar vista previa de fecha/hora
  function updateDateTimePreview() {
    const date = startDateEl.value;
    const time = startTimeEl.value;
    if (date && time) {
      const dateTime = new Date(`${date}T${time}`);
      datetimePreviewEl.textContent = dateTime.toLocaleString('es-CO', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      // Actualizar campo datetime-local oculto si existe
      const startEl = document.getElementById('event-start');
      if (startEl) {
        startEl.value = formatDateTime(dateTime);
      }
    }
  }
  
  startDateEl.addEventListener('change', updateDateTimePreview);
  startTimeEl.addEventListener('input', updateDateTimePreview);
  updateDateTimePreview();
  
  // Buscar por placa
  plateEl.addEventListener('input', async () => {
    const plate = plateEl.value.trim().toUpperCase();
    if (plate.length < 3) {
      plateLoadingEl.classList.add('hidden');
      return;
    }
    
    plateLoadingEl.classList.remove('hidden');
    
    try {
      const result = await API.calendar.searchByPlate(plate);
      
      if (result.found && result.profile) {
        // Autocompletar datos
        customerNameEl.value = result.profile.customer.name || '';
        customerPhoneEl.value = result.profile.customer.phone || '';
        
        if (result.profile.vehicle.vehicleId) {
          vehicleIdEl.value = result.profile.vehicle.vehicleId;
          selectedVehicle = result.vehicle;
          if (result.vehicle) {
            vehicleSearchEl.value = `${result.vehicle.make} ${result.vehicle.line} ${result.vehicle.displacement}`;
            vehicleSelectedEl.innerHTML = `
              <span class="text-green-400 dark:text-green-400 theme-light:text-green-600">✓</span> 
              <strong>${result.vehicle.make} ${result.vehicle.line}</strong> - Cilindraje: ${result.vehicle.displacement}${result.vehicle.modelYear ? ` | Modelo: ${result.vehicle.modelYear}` : ''}
            `;
            vehicleSelectedEl.classList.remove('hidden');
          }
        }
        
        // Cargar cotizaciones
        await loadQuotesForPlate(plate);
      } else {
        // Limpiar si no se encuentra
        customerNameEl.value = '';
        customerPhoneEl.value = '';
        vehicleIdEl.value = '';
        vehicleSearchEl.value = '';
        vehicleSelectedEl.classList.add('hidden');
        quoteEl.innerHTML = '<option value="">Sin cotización</option>';
        quotesCache = [];
      }
    } catch (err) {
      console.error('Error searching by plate:', err);
    } finally {
      plateLoadingEl.classList.add('hidden');
    }
  });
  
  // Buscar vehículos
  vehicleSearchEl.addEventListener('input', () => {
    clearTimeout(vehicleSearchTimeout);
    const query = vehicleSearchEl.value.trim();
    
    if (query.length < 2) {
      vehicleDropdownEl.classList.add('hidden');
      return;
    }
    
    vehicleSearchTimeout = setTimeout(async () => {
      try {
        const result = await API.vehicles.search({ q: query, limit: 20 });
        const vehicles = Array.isArray(result?.items) ? result.items : [];
        
        if (vehicles.length === 0) {
          vehicleDropdownEl.innerHTML = '<div class="p-3 text-center text-sm text-slate-400">No se encontraron vehículos</div>';
          vehicleDropdownEl.classList.remove('hidden');
          return;
        }
        
        vehicleDropdownEl.innerHTML = '';
        vehicles.forEach(v => {
          const div = document.createElement('div');
          div.className = 'p-3 cursor-pointer hover:bg-slate-700/50 dark:hover:bg-slate-700/50 theme-light:hover:bg-sky-100 border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300';
          div.innerHTML = `
            <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${v.make} ${v.line}</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}</div>
          `;
          div.addEventListener('click', () => {
            selectedVehicle = v;
            vehicleIdEl.value = v._id;
            vehicleSearchEl.value = `${v.make} ${v.line} ${v.displacement}`;
            vehicleSelectedEl.innerHTML = `
              <span class="text-green-400 dark:text-green-400 theme-light:text-green-600">✓</span> 
              <strong>${v.make} ${v.line}</strong> - Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}
            `;
            vehicleSelectedEl.classList.remove('hidden');
            vehicleDropdownEl.classList.add('hidden');
          });
          vehicleDropdownEl.appendChild(div);
        });
        
        vehicleDropdownEl.classList.remove('hidden');
      } catch (err) {
        console.error('Error searching vehicles:', err);
      }
    }, 300);
  });
  
  // Cerrar dropdown al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!vehicleSearchEl.contains(e.target) && !vehicleDropdownEl.contains(e.target)) {
      vehicleDropdownEl.classList.add('hidden');
    }
  });
  
  // Cargar cotizaciones por placa
  async function loadQuotesForPlate(plate) {
    try {
      const result = await API.calendar.getQuotesByPlate(plate);
      quotesCache = Array.isArray(result?.items) ? result.items : [];
      
      quoteEl.innerHTML = '<option value="">Sin cotización</option>';
      quotesCache.forEach(q => {
        const option = document.createElement('option');
        option.value = q._id;
        option.textContent = `Cotización #${q.number} - ${new Date(q.createdAt).toLocaleDateString('es-CO')} - $${new Intl.NumberFormat('es-CO').format(q.total || 0)}`;
        quoteEl.appendChild(option);
      });
    } catch (err) {
      console.error('Error loading quotes:', err);
    }
  }
  
  // Notificación
  notificationEl.addEventListener('change', () => {
    notificationTimeEl.classList.toggle('hidden', !notificationEl.checked);
    if (notificationEl.checked && !notificationAtEl.value) {
      const date = startDateEl.value;
      const time = startTimeEl.value;
      if (date && time) {
        notificationAtEl.value = `${date}T${time}`;
      }
    }
  });
  
  // Cancelar
  cancelEl.onclick = () => {
    modal.classList.add("hidden");
    body.innerHTML = "";
  };
  
  // Guardar
  saveEl.onclick = async () => {
    try {
      const plate = plateEl.value.trim().toUpperCase();
      const customerName = customerNameEl.value.trim();
      const customerPhone = customerPhoneEl.value.trim();
      const startDate = startDateEl.value;
      const startTime = startTimeEl.value;
      
      // Validaciones
      if (!plate) {
        return alert("La placa es obligatoria");
      }
      if (!customerName) {
        return alert("El nombre del cliente es obligatorio");
      }
      if (!customerPhone) {
        return alert("El teléfono es obligatorio");
      }
      if (!startDate || !startTime) {
        return alert("La fecha y hora son obligatorias");
      }
      
      const startDateTime = new Date(`${startDate}T${startTime}`);
      const endDateTime = endEl.value ? new Date(endEl.value) : null;
      
      const payload = {
        title: titleEl.value.trim() || `Cita: ${customerName}`,
        description: descriptionEl.value.trim(),
        startDate: startDateTime.toISOString(),
        endDate: endDateTime ? endDateTime.toISOString() : undefined,
        color: colorEl.value,
        hasNotification: notificationEl.checked,
        notificationAt: notificationEl.checked && notificationAtEl.value ? new Date(notificationAtEl.value).toISOString() : undefined,
        plate,
        customer: {
          name: customerName,
          phone: customerPhone
        },
        vehicleId: vehicleIdEl.value || null,
        quoteId: quoteEl.value || null
      };
      
      await API.calendar.create(payload);
      modal.classList.add("hidden");
      body.innerHTML = "";
      await loadEvents();
      renderCalendar();
    } catch (e) {
      alert("Error: " + (e.message || 'Error al crear el evento'));
    }
  };
}

function openEventModal(event) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  const close = document.getElementById("modalClose");
  if (!modal || !body || !close) return;
  
  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const notificationAt = event.notificationAt ? new Date(event.notificationAt) : null;
  const hasCustomerData = event.plate && event.customer?.name && event.customer?.phone;
  
  body.innerHTML = `
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">${htmlEscape(event.title)}</h3>
      
      ${event.description ? `<div class="text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-3">${htmlEscape(event.description)}</div>` : ''}
      
      ${hasCustomerData ? `
        <div class="border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 pt-4">
          <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-3">Información del Cliente</h4>
          <div class="space-y-2 text-sm">
            <div>
              <span class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Placa:</span>
              <span class="text-white dark:text-white theme-light:text-slate-900 font-semibold ml-2">${htmlEscape(event.plate)}</span>
            </div>
            <div>
              <span class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cliente:</span>
              <span class="text-white dark:text-white theme-light:text-slate-900 font-semibold ml-2">${htmlEscape(event.customer.name)}</span>
            </div>
            <div>
              <span class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Teléfono:</span>
              <span class="text-white dark:text-white theme-light:text-slate-900 font-semibold ml-2">${htmlEscape(event.customer.phone)}</span>
            </div>
          </div>
        </div>
      ` : ''}
      
      <div class="text-sm">
        <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Fecha y hora de inicio:</div>
        <div class="text-white dark:text-white theme-light:text-slate-900 font-semibold">${startDate.toLocaleString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      
      ${endDate ? `
        <div class="text-sm">
          <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Fecha y hora de fin:</div>
          <div class="text-white dark:text-white theme-light:text-slate-900 font-semibold">${endDate.toLocaleString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      ` : ''}
      
      ${event.hasNotification && notificationAt ? `
        <div class="text-sm">
          <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Notificación:</div>
          <div class="text-yellow-400 dark:text-yellow-400 theme-light:text-yellow-600">⏰ ${notificationAt.toLocaleString('es-CO')}</div>
        </div>
      ` : ''}
      
      ${event.quoteId ? `
        <div class="text-sm">
          <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Cotización vinculada:</div>
          <div class="text-blue-400 dark:text-blue-400 theme-light:text-blue-600">📄 Cotización #${event.quoteId}</div>
        </div>
      ` : ''}
      
      ${event.saleId ? `
        <div class="text-sm">
          <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Venta creada:</div>
          <div class="text-green-400 dark:text-green-400 theme-light:text-green-600">✓ Venta #${event.saleId}</div>
        </div>
      ` : ''}
      
      ${event.eventType === 'reminder' ? `
        <div class="text-xs text-yellow-400 dark:text-yellow-400 theme-light:text-yellow-600 bg-yellow-500/20 dark:bg-yellow-500/20 theme-light:bg-yellow-50 p-2 rounded border border-yellow-500/30 dark:border-yellow-500/30 theme-light:border-yellow-200">
          Este evento proviene de un recordatorio de nota
        </div>
      ` : ''}
      
      <div class="flex flex-wrap gap-2 mt-4">
        ${event.eventType !== 'reminder' ? `
          ${hasCustomerData && !event.saleId ? `
            <button id="event-create-sale" class="px-3 sm:px-4 py-2 text-sm sm:text-base bg-green-600/20 dark:bg-green-600/20 hover:bg-green-600/40 dark:hover:bg-green-600/40 text-green-400 dark:text-green-400 hover:text-green-300 dark:hover:text-green-300 font-medium rounded-lg transition-all duration-200 border border-green-600/30 dark:border-green-600/30">💰 Crear Venta</button>
          ` : ''}
          ${hasCustomerData && event.saleId ? `
            <button id="event-send-whatsapp" class="px-3 sm:px-4 py-2 text-sm sm:text-base bg-green-600/20 dark:bg-green-600/20 hover:bg-green-600/40 dark:hover:bg-green-600/40 text-green-400 dark:text-green-400 hover:text-green-300 dark:hover:text-green-300 font-medium rounded-lg transition-all duration-200 border border-green-600/30 dark:border-green-600/30 w-full sm:w-auto">📱 Enviar confirmación por WhatsApp</button>
          ` : ''}
          <button id="event-edit" class="px-3 sm:px-4 py-2 text-sm sm:text-base bg-blue-600/20 dark:bg-blue-600/20 hover:bg-blue-600/40 dark:hover:bg-blue-600/40 text-blue-400 dark:text-blue-400 hover:text-blue-300 dark:hover:text-blue-300 font-medium rounded-lg transition-all duration-200 border border-blue-600/30 dark:border-blue-600/30">Editar</button>
          <button id="event-delete" class="px-3 sm:px-4 py-2 text-sm sm:text-base bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30">Eliminar</button>
        ` : ''}
        <button id="event-close" class="px-3 sm:px-4 py-2 text-sm sm:text-base bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-sky-200 theme-light:text-slate-800 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900 ml-auto w-full sm:w-auto">Cerrar</button>
      </div>
    </div>
  `;
  
  modal.classList.remove("hidden");
  
  const closeEl = document.getElementById('event-close');
  closeEl.onclick = () => {
    modal.classList.add("hidden");
    body.innerHTML = "";
  };
  
  if (event.eventType !== 'reminder') {
    // Botón de WhatsApp si hay venta creada
    const whatsappEl = document.getElementById('event-send-whatsapp');
    if (whatsappEl && hasCustomerData && event.saleId) {
      whatsappEl.onclick = async () => {
        try {
          await sendWhatsAppConfirmationFromEvent(event);
        } catch (err) {
          alert('Error al enviar confirmación por WhatsApp: ' + (err.message || 'Error desconocido'));
        }
      };
    }
    
    const editEl = document.getElementById('event-edit');
    const deleteEl = document.getElementById('event-delete');
    const createSaleEl = document.getElementById('event-create-sale');
    
    if (editEl) {
      editEl.onclick = () => {
        modal.classList.add("hidden");
        body.innerHTML = "";
        openEditEventModal(event);
      };
    }
    
    if (deleteEl) {
      deleteEl.onclick = async () => {
        if (!confirm("¿Eliminar este evento?")) return;
        try {
          await API.calendar.delete(event._id);
          modal.classList.add("hidden");
          body.innerHTML = "";
          await loadEvents();
          renderCalendar();
        } catch (e) {
          alert("Error: " + e.message);
        }
      };
    }
    
    if (createSaleEl) {
      createSaleEl.onclick = async () => {
        try {
          await createSaleFromEvent(event);
          modal.classList.add("hidden");
          body.innerHTML = "";
        } catch (e) {
          alert("Error: " + (e.message || 'Error al crear la venta'));
        }
      };
    }
  }
}

// Crear venta desde evento del calendario
async function createSaleFromEvent(event) {
  try {
    // Crear venta nueva
    const sale = await API.sales.start();
    
    // Obtener datos del vehículo si hay vehicleId
    let vehicleData = {
      plate: event.plate || '',
      vehicleId: event.vehicleId || null,
      brand: '',
      line: '',
      engine: '',
      year: null,
      mileage: null
    };
    
    if (event.vehicleId) {
      try {
        const vehicle = await API.vehicles.get(event.vehicleId);
        if (vehicle) {
          vehicleData.brand = vehicle.make || '';
          vehicleData.line = vehicle.line || '';
          vehicleData.engine = vehicle.displacement || '';
        }
      } catch (err) {
        console.error('Error getting vehicle:', err);
      }
    }
    
    // Prellenar cliente y vehículo
    await API.sales.setCustomerVehicle(sale._id, {
      customer: {
        name: event.customer?.name || '',
        phone: event.customer?.phone || '',
        email: '',
        address: ''
      },
      vehicle: vehicleData
    });
    
    // Si hay cotización vinculada, cargarla
    if (event.quoteId) {
      try {
        const quote = await API.quoteGet(event.quoteId);
        if (quote) {
          // Guardar referencia a la cotización en localStorage para que sales.js la detecte
          localStorage.setItem('sales:lastQuoteId', event.quoteId);
          localStorage.setItem('sales:fromCalendarEvent', event._id);
        }
      } catch (err) {
        console.error('Error loading quote:', err);
      }
    }
    
    // Guardar referencia al evento en localStorage
    localStorage.setItem('sales:fromCalendarEvent', event._id);
    
    // Actualizar evento con saleId
    try {
      await API.calendar.update(event._id, { saleId: sale._id });
    } catch (err) {
      console.error('Error updating event with saleId:', err);
    }
    
    // Navegar a ventas si estamos en la misma página
    const ventasTab = document.getElementById('tab-ventas');
    if (ventasTab) {
      ventasTab.click();
      // Esperar un momento para que se cargue la página de ventas
      setTimeout(() => {
        // Disparar evento personalizado para que sales.js detecte y cargue la venta
        window.dispatchEvent(new CustomEvent('calendar:saleCreated', { 
          detail: { saleId: sale._id, eventId: event._id, quoteId: event.quoteId } 
        }));
      }, 500);
    } else {
      // Si no estamos en la misma página, redirigir
      window.location.href = 'ventas.html?fromCalendar=' + event._id + '&saleId=' + sale._id;
    }
  } catch (err) {
    console.error('Error creating sale from event:', err);
    throw err;
  }
}

function openEditEventModal(event) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  if (!modal || !body) return;
  
  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const notificationAt = event.notificationAt ? new Date(event.notificationAt) : null;
  
  // Preparar valores para los campos nuevos
  const eventStartDate = formatDate(startDate);
  const eventStartTime = startDate.toTimeString().slice(0, 5);
  
  body.innerHTML = `
    <div class="space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar pr-2">
      <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Editar Cita/Evento</h3>
      
      <!-- Información del Cliente y Vehículo -->
      <div class="border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 pt-4">
        <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-3">Información del Cliente y Vehículo</h4>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Placa</label>
          <input id="event-edit-plate" type="text" value="${htmlEscape(event.plate || '')}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" placeholder="ABC123" maxlength="6" />
        </div>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Nombre del Cliente</label>
          <input id="event-edit-customer-name" type="text" value="${htmlEscape(event.customer?.name || '')}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nombre completo" />
        </div>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Teléfono</label>
          <input id="event-edit-customer-phone" type="tel" value="${htmlEscape(event.customer?.phone || '')}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="3001234567" />
        </div>
        
        <div class="mb-3 relative">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Vehículo (de la base de datos)</label>
          <input id="event-edit-vehicle-search" type="text" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Buscar vehículo (marca, línea, cilindraje)" />
          <input type="hidden" id="event-edit-vehicle-id" value="${event.vehicleId || ''}" />
          <div id="event-edit-vehicle-dropdown" class="hidden absolute z-50 w-full mt-1 bg-slate-800 dark:bg-slate-800 theme-light:bg-white border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"></div>
        </div>
      </div>
      
      <!-- Fecha y Hora -->
      <div class="border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 pt-4">
        <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-3">Fecha y Hora de la Cita</h4>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Fecha</label>
            <input id="event-edit-start-date" type="date" value="${eventStartDate}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Hora</label>
            <input id="event-edit-start-time" type="time" value="${eventStartTime}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Fecha y hora de fin (opcional)</label>
          <input id="event-edit-end" type="datetime-local" value="${endDate ? formatDateTime(endDate) : ''}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      
      <!-- Cotización (Opcional) -->
      <div class="border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 pt-4">
        <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-3">Cotización (Opcional)</h4>
        <select id="event-edit-quote" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Sin cotización</option>
        </select>
      </div>
      
      <!-- Información adicional -->
      <div class="border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 pt-4">
        <h4 class="text-sm font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-3">Información Adicional</h4>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Título</label>
          <input id="event-edit-title" type="text" value="${htmlEscape(event.title)}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Descripción</label>
          <textarea id="event-edit-description" rows="3" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y">${htmlEscape(event.description || '')}</textarea>
        </div>
        
        <div class="mb-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Color</label>
          <select id="event-edit-color" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="#3b82f6" ${event.color === '#3b82f6' ? 'selected' : ''}>Azul</option>
            <option value="#10b981" ${event.color === '#10b981' ? 'selected' : ''}>Verde</option>
            <option value="#f59e0b" ${event.color === '#f59e0b' ? 'selected' : ''}>Amarillo</option>
            <option value="#ef4444" ${event.color === '#ef4444' ? 'selected' : ''}>Rojo</option>
            <option value="#8b5cf6" ${event.color === '#8b5cf6' ? 'selected' : ''}>Morado</option>
            <option value="#ec4899" ${event.color === '#ec4899' ? 'selected' : ''}>Rosa</option>
          </select>
        </div>
        
        <div class="flex items-center gap-2">
          <input id="event-edit-notification" type="checkbox" ${event.hasNotification ? 'checked' : ''} class="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500" />
          <label for="event-edit-notification" class="text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800">Activar notificación</label>
        </div>
        
        <div id="event-edit-notification-time" class="${event.hasNotification ? '' : 'hidden'} mt-3">
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Fecha y hora de notificación</label>
          <input id="event-edit-notification-at" type="datetime-local" value="${notificationAt ? formatDateTime(notificationAt) : ''}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      
      <div class="flex gap-2 mt-6 pt-4 border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
        <button id="event-edit-save" class="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar cambios</button>
        <button id="event-edit-cancel" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-sky-200 theme-light:text-slate-800 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
      </div>
    </div>
  `;
  
  modal.classList.remove("hidden");
  
  const titleEl = document.getElementById('event-edit-title');
  const descriptionEl = document.getElementById('event-edit-description');
  const startDateEl = document.getElementById('event-edit-start-date');
  const startTimeEl = document.getElementById('event-edit-start-time');
  const endEl = document.getElementById('event-edit-end');
  const colorEl = document.getElementById('event-edit-color');
  const notificationEl = document.getElementById('event-edit-notification');
  const notificationTimeEl = document.getElementById('event-edit-notification-time');
  const notificationAtEl = document.getElementById('event-edit-notification-at');
  const saveEl = document.getElementById('event-edit-save');
  const cancelEl = document.getElementById('event-edit-cancel');
  const plateEl = document.getElementById('event-edit-plate');
  const customerNameEl = document.getElementById('event-edit-customer-name');
  const customerPhoneEl = document.getElementById('event-edit-customer-phone');
  const vehicleSearchEl = document.getElementById('event-edit-vehicle-search');
  const vehicleIdEl = document.getElementById('event-edit-vehicle-id');
  const vehicleDropdownEl = document.getElementById('event-edit-vehicle-dropdown');
  const quoteEl = document.getElementById('event-edit-quote');
  
  let selectedVehicle = null;
  let vehicleSearchTimeout = null;
  
  // Cargar vehículo si existe
  if (event.vehicleId) {
    (async () => {
      try {
        const vehicle = await API.vehicles.get(event.vehicleId);
        if (vehicle) {
          vehicleSearchEl.value = `${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
          selectedVehicle = vehicle;
        }
      } catch (err) {
        console.error('Error loading vehicle:', err);
      }
    })();
  }
  
  // Cargar cotizaciones si hay placa
  if (event.plate) {
    (async () => {
      try {
        const result = await API.calendar.getQuotesByPlate(event.plate);
        const quotes = Array.isArray(result?.items) ? result.items : [];
        quoteEl.innerHTML = '<option value="">Sin cotización</option>';
        quotes.forEach(q => {
          const option = document.createElement('option');
          option.value = q._id;
          option.textContent = `Cotización #${q.number} - ${new Date(q.createdAt).toLocaleDateString('es-CO')} - $${new Intl.NumberFormat('es-CO').format(q.total || 0)}`;
          if (q._id === event.quoteId) option.selected = true;
          quoteEl.appendChild(option);
        });
      } catch (err) {
        console.error('Error loading quotes:', err);
      }
    })();
  }
  
  // Buscar vehículos
  vehicleSearchEl.addEventListener('input', () => {
    clearTimeout(vehicleSearchTimeout);
    const query = vehicleSearchEl.value.trim();
    
    if (query.length < 2) {
      vehicleDropdownEl.classList.add('hidden');
      return;
    }
    
    vehicleSearchTimeout = setTimeout(async () => {
      try {
        const result = await API.vehicles.search({ q: query, limit: 20 });
        const vehicles = Array.isArray(result?.items) ? result.items : [];
        
        if (vehicles.length === 0) {
          vehicleDropdownEl.innerHTML = '<div class="p-3 text-center text-sm text-slate-400">No se encontraron vehículos</div>';
          vehicleDropdownEl.classList.remove('hidden');
          return;
        }
        
        vehicleDropdownEl.innerHTML = '';
        vehicles.forEach(v => {
          const div = document.createElement('div');
          div.className = 'p-3 cursor-pointer hover:bg-slate-700/50 dark:hover:bg-slate-700/50 theme-light:hover:bg-sky-100 border-b border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300';
          div.innerHTML = `
            <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${v.make} ${v.line}</div>
            <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">Cilindraje: ${v.displacement}${v.modelYear ? ` | Modelo: ${v.modelYear}` : ''}</div>
          `;
          div.addEventListener('click', () => {
            selectedVehicle = v;
            vehicleIdEl.value = v._id;
            vehicleSearchEl.value = `${v.make} ${v.line} ${v.displacement}`;
            vehicleDropdownEl.classList.add('hidden');
          });
          vehicleDropdownEl.appendChild(div);
        });
        
        vehicleDropdownEl.classList.remove('hidden');
      } catch (err) {
        console.error('Error searching vehicles:', err);
      }
    }, 300);
  });
  
  // Cerrar dropdown al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!vehicleSearchEl.contains(e.target) && !vehicleDropdownEl.contains(e.target)) {
      vehicleDropdownEl.classList.add('hidden');
    }
  });
  
  notificationEl.addEventListener('change', () => {
    notificationTimeEl.classList.toggle('hidden', !notificationEl.checked);
    if (notificationEl.checked && !notificationAtEl.value) {
      const date = startDateEl.value;
      const time = startTimeEl.value;
      if (date && time) {
        notificationAtEl.value = `${date}T${time}`;
      }
    }
  });
  
  cancelEl.onclick = () => {
    modal.classList.add("hidden");
    body.innerHTML = "";
  };
  
  saveEl.onclick = async () => {
    try {
      if (!titleEl.value.trim()) {
        return alert("El título es obligatorio");
      }
      
      // Obtener valores de los nuevos campos si existen
      const plateEl = document.getElementById('event-edit-plate');
      const customerNameEl = document.getElementById('event-edit-customer-name');
      const customerPhoneEl = document.getElementById('event-edit-customer-phone');
      const vehicleIdEl = document.getElementById('event-edit-vehicle-id');
      const quoteEl = document.getElementById('event-edit-quote');
      
      const startDate = startDateEl.value;
      const startTime = startTimeEl.value;
      const startDateTime = new Date(`${startDate}T${startTime}`);
      
      const payload = {
        title: titleEl.value.trim(),
        description: descriptionEl.value.trim(),
        startDate: startDateTime.toISOString(),
        endDate: endEl.value ? new Date(endEl.value).toISOString() : null,
        color: colorEl.value,
        hasNotification: notificationEl.checked,
        notificationAt: notificationEl.checked && notificationAtEl.value ? new Date(notificationAtEl.value).toISOString() : null,
        plate: plateEl.value.trim().toUpperCase() || '',
        customer: {
          name: customerNameEl.value.trim() || '',
          phone: customerPhoneEl.value.trim() || ''
        },
        vehicleId: vehicleIdEl.value || null,
        quoteId: quoteEl.value || null
      };
      
      await API.calendar.update(event._id, payload);
      modal.classList.add("hidden");
      body.innerHTML = "";
      await loadEvents();
      renderCalendar();
    } catch (e) {
      alert("Error: " + e.message);
    }
  };
}

function openDayEventsModal(date, dayEvents) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  if (!modal || !body) return;
  
  const dateStr = date.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  const eventsHtml = dayEvents.map((event, index) => {
    const startDate = new Date(event.startDate);
    const eventId = `event-${index}`;
    const hasCustomerData = event.plate && event.customer?.name && event.customer?.phone;
    return `
      <div id="${eventId}" class="p-3 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-sky-50 cursor-pointer hover:bg-slate-800/50 dark:hover:bg-slate-800/50 theme-light:hover:bg-slate-50 transition-all">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${event.color || '#3b82f6'}"></div>
          <div class="font-semibold text-white dark:text-white theme-light:text-slate-900 flex-1">${htmlEscape(event.title)}</div>
        </div>
        ${event.description ? `<div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">${htmlEscape(event.description)}</div>` : ''}
        ${hasCustomerData ? `
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">
            ${htmlEscape(event.customer.name)} • ${htmlEscape(event.plate)}
          </div>
        ` : ''}
        <div class="text-xs text-slate-500 dark:text-slate-500 theme-light:text-slate-400">${startDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    `;
  }).join('');
  
  body.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 class="text-lg sm:text-xl font-semibold text-white dark:text-white theme-light:text-slate-900">Eventos del ${dateStr}</h3>
        <button id="day-events-new" class="px-3 sm:px-4 py-2 text-sm sm:text-base bg-green-600/20 dark:bg-green-600/20 hover:bg-green-600/40 dark:hover:bg-green-600/40 text-green-400 dark:text-green-400 hover:text-green-300 dark:hover:text-green-300 font-medium rounded-lg transition-all duration-200 border border-green-600/30 dark:border-green-600/30">➕ Nueva Cita</button>
      </div>
      <div class="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
        ${eventsHtml}
      </div>
      <button id="day-events-close" class="w-full px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-sky-200 theme-light:text-slate-800 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cerrar</button>
    </div>
  `;
  
  // Agregar event listeners a cada evento
  dayEvents.forEach((event, index) => {
    const eventEl = document.getElementById(`event-${index}`);
    if (eventEl) {
      eventEl.onclick = () => {
        modal.classList.add("hidden");
        body.innerHTML = "";
        openEventModal(event);
      };
    }
  });
  
  // Botón para crear nueva cita
  const newEventBtn = document.getElementById('day-events-new');
  if (newEventBtn) {
    newEventBtn.onclick = () => {
      modal.classList.add("hidden");
      body.innerHTML = "";
      openNewEventModal(date);
    };
  }
  
  modal.classList.remove("hidden");
  
  const closeEl = document.getElementById('day-events-close');
  closeEl.onclick = () => {
    modal.classList.add("hidden");
    body.innerHTML = "";
  };
}

async function loadEvents() {
  try {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const res = await API.calendar.list({
      from: firstDay.toISOString(),
      to: lastDay.toISOString()
    });
    
    events = res.items || [];
  } catch (e) {
    console.error("Error loading events:", e);
    events = [];
  }
}

async function syncReminders() {
  try {
    await API.calendar.syncNoteReminders();
    await loadEvents();
    renderCalendar();
    alert("Recordatorios sincronizados correctamente");
  } catch (e) {
    alert("Error al sincronizar recordatorios: " + e.message);
  }
}

function checkEventNotifications() {
  const now = new Date();
  const notifiedIds = JSON.parse(localStorage.getItem("calendarNotificationsNotified") || "[]");
  
  events.forEach(event => {
    if (!event.hasNotification || !event.notificationAt) return;
    
    const notificationDate = new Date(event.notificationAt);
    const timeDiff = notificationDate.getTime() - now.getTime();
    const eventId = String(event._id);
    
    // Notificar si está entre 1 minuto antes y 5 minutos después
    if (timeDiff <= 60000 && timeDiff >= -300000 && !notifiedIds.includes(eventId)) {
      showEventNotification(event);
      notifiedIds.push(eventId);
      localStorage.setItem("calendarNotificationsNotified", JSON.stringify(notifiedIds));
    }
  });
  
  // Limpiar notificaciones antiguas (más de 1 día)
  const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const filteredIds = notifiedIds.filter(id => {
    const event = events.find(e => String(e._id) === id);
    if (!event || !event.notificationAt) return false;
    return new Date(event.notificationAt).getTime() > oneDayAgo;
  });
  localStorage.setItem("calendarNotificationsNotified", JSON.stringify(filteredIds));
}

function showEventNotification(event) {
  // Reproducir sonido de notificación
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Frecuencia de la nota (440Hz = La)
    oscillator.frequency.value = 440;
    oscillator.type = 'sine';
    
    // Volumen (0 a 1)
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    // Duración del sonido
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (err) {
    console.warn('No se pudo reproducir sonido de notificación:', err);
    // Fallback: usar beep del sistema si está disponible
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        // Intentar usar síntesis de voz como alternativa
        const utterance = new SpeechSynthesisUtterance('');
        utterance.volume = 0;
        window.speechSynthesis.speak(utterance);
      }
    } catch {}
  }
  
  // Crear notificación visual
  const notification = document.createElement("div");
  notification.className = "fixed top-5 right-5 z-[3000] bg-blue-500 dark:bg-blue-500 theme-light:bg-blue-400 text-white dark:text-white theme-light:text-blue-900 px-5 py-3 rounded-lg text-sm font-semibold shadow-lg max-w-[400px] animate-[slideInFromRight_0.3s_ease-out]";
  notification.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="text-xl flex-shrink-0">📅</div>
      <div class="flex-1">
        <div class="font-bold mb-1">${htmlEscape(event.title)}</div>
        ${event.description ? `<div class="text-xs opacity-90 mb-1">${htmlEscape(event.description).substring(0, 100)}${event.description.length > 100 ? "..." : ""}</div>` : ''}
        <div class="text-xs opacity-90">${new Date(event.startDate).toLocaleString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        ${event.plate ? `<div class="text-xs opacity-90 mt-1">Placa: <strong>${htmlEscape(event.plate)}</strong></div>` : ''}
      </div>
      <button onclick="this.parentElement.parentElement.remove()" class="text-white hover:text-gray-200 text-lg font-bold flex-shrink-0">×</button>
    </div>
  `;
  document.body.appendChild(notification);
  
  // Solicitar permiso para notificaciones del navegador si está disponible
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(event.title, {
        body: `${event.description ? event.description.substring(0, 100) + ' - ' : ''}${new Date(event.startDate).toLocaleString('es-CO')}`,
        icon: '/favicon.ico',
        tag: `calendar-event-${event._id}`
      });
    } catch (err) {
      console.warn('Error showing browser notification:', err);
    }
  } else if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        try {
          new Notification(event.title, {
            body: `${event.description ? event.description.substring(0, 100) + ' - ' : ''}${new Date(event.startDate).toLocaleString('es-CO')}`,
            icon: '/favicon.ico',
            tag: `calendar-event-${event._id}`
          });
        } catch (err) {
          console.warn('Error showing browser notification:', err);
        }
      }
    });
  }
  
  setTimeout(() => {
    notification.style.animation = "slideOutToRight 0.3s ease-in";
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, 10000);
}

// Exponer función globalmente para usar en HTML
window.openEventModal = openEventModal;

// Exponer función para recargar calendario desde otros módulos
window.calendarReload = async () => {
  await loadEvents();
  renderCalendar();
};

// Función para enviar confirmación por WhatsApp desde evento del calendario
async function sendWhatsAppConfirmationFromEvent(event) {
  try {
    // Obtener configuración del calendario
    const settings = await API.calendar.getSettings();
    
    // Obtener fecha y hora del evento
    const eventDateObj = new Date(event.startDate);
    const eventDate = eventDateObj.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const eventTime = eventDateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    
    const customerName = event.customer?.name || 'Cliente';
    const companyName = settings.companyName || 'Nuestra empresa';
    const address = settings.address || '';
    const mapsLink = settings.mapsLink || '';
    
    // Formatear mensaje según especificación
    let message = `Estimado ${customerName}, su cita en ${companyName}, está confirmada para el día ${eventDate} y hora ${eventTime}.\n\n`;
    
    if (address) {
      message += `Te esperamos en esta dirección: ${address}\n`;
    }
    
    if (mapsLink) {
      message += `${mapsLink}\n`;
    }
    
    message += '\nTe esperamos!';
    
    // Codificar mensaje para URL
    const encodedMessage = encodeURIComponent(message);
    
    // Número de teléfono del cliente (limpiar formato)
    const phone = (event.customer?.phone || '').replace(/\D/g, '');
    if (!phone) {
      return alert('No se encontró número de teléfono del cliente');
    }
    
    // Abrir WhatsApp Web/App
    const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  } catch (err) {
    console.error('Error sending WhatsApp confirmation:', err);
    throw err;
  }
}

// Abrir modal de configuración del calendario
function openCalendarSettings() {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  const close = document.getElementById("modalClose");
  if (!modal || !body || !close) return;
  
  body.innerHTML = `
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Configuración del Calendario</h3>
      
      <div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-4">
        Configura la dirección y el enlace de Google Maps que se incluirán en los mensajes de confirmación por WhatsApp.
      </div>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Dirección</label>
        <input id="calendar-settings-address" type="text" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ej: Calle 123 #45-67, Bogotá" />
      </div>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-800 mb-2">Enlace de Google Maps</label>
        <input id="calendar-settings-maps-link" type="url" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-sky-50 text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="https://maps.google.com/..." />
        <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mt-1">
          Puedes obtener el enlace desde Google Maps: Compartir → Copiar enlace
        </div>
      </div>
      
      <div class="flex gap-2 mt-6 pt-4 border-t border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300">
        <button id="calendar-settings-save" class="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar</button>
        <button id="calendar-settings-cancel" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-sky-200 theme-light:text-slate-800 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
      </div>
    </div>
  `;
  
  modal.classList.remove("hidden");
  
  // Cargar configuración actual
  (async () => {
    try {
      const settings = await API.calendar.getSettings();
      document.getElementById('calendar-settings-address').value = settings.address || '';
      document.getElementById('calendar-settings-maps-link').value = settings.mapsLink || '';
    } catch (err) {
      console.error('Error loading calendar settings:', err);
    }
  })();
  
  // Guardar configuración
  document.getElementById('calendar-settings-save').onclick = async () => {
    try {
      const address = document.getElementById('calendar-settings-address').value.trim();
      const mapsLink = document.getElementById('calendar-settings-maps-link').value.trim();
      
      await API.calendar.updateSettings({ address, mapsLink });
      modal.classList.add("hidden");
      body.innerHTML = "";
      alert('Configuración guardada exitosamente');
    } catch (err) {
      alert('Error: ' + (err.message || 'No se pudo guardar la configuración'));
    }
  };
  
  // Cancelar
  document.getElementById('calendar-settings-cancel').onclick = () => {
    modal.classList.add("hidden");
    body.innerHTML = "";
  };
  
  close.onclick = () => {
    modal.classList.add("hidden");
    body.innerHTML = "";
  };
}

export function initCalendar() {
  const prevBtn = document.getElementById('calendar-prev-month');
  const nextBtn = document.getElementById('calendar-next-month');
  const todayBtn = document.getElementById('calendar-today');
  const newEventBtn = document.getElementById('calendar-new-event');
  const syncRemindersBtn = document.getElementById('calendar-sync-reminders');
  
  if (prevBtn) {
    prevBtn.onclick = () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      loadEvents().then(() => renderCalendar());
    };
  }
  
  if (nextBtn) {
    nextBtn.onclick = () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      loadEvents().then(() => renderCalendar());
    };
  }
  
  if (todayBtn) {
    todayBtn.onclick = () => {
      currentDate = new Date();
      loadEvents().then(() => renderCalendar());
    };
  }
  
  if (newEventBtn) {
    newEventBtn.onclick = () => openNewEventModal();
  }
  
  if (syncRemindersBtn) {
    syncRemindersBtn.onclick = syncReminders;
  }
  
  const settingsBtn = document.getElementById('calendar-settings');
  if (settingsBtn) {
    settingsBtn.onclick = () => openCalendarSettings();
  }
  
  // Cargar eventos y renderizar calendario
  loadEvents().then(() => {
    renderCalendar();
  });
  
  // Redimensionar calendario cuando cambia el tamaño de la ventana
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      renderCalendar();
    }, 250);
  });
  
  // Verificar notificaciones cada minuto
  setInterval(() => {
    checkEventNotifications();
  }, 60000);
  
  // Verificar notificaciones al cargar
  setTimeout(() => {
    checkEventNotifications();
  }, 2000);
}

