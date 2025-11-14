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
  
  // Actualizar mes/año
  const monthYearEl = document.getElementById('calendar-month-year');
  if (monthYearEl) {
    monthYearEl.textContent = `${monthNames[month]} ${year}`;
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
  dayEl.className = `min-h-[80px] p-1 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg ${
    isOtherMonth ? 'bg-slate-900/20 dark:bg-slate-900/20 theme-light:bg-slate-100/50' : 'bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white'
  } ${
    isToday ? 'ring-2 ring-blue-500' : ''
  }`;
  
  const dayNumber = document.createElement('div');
  dayNumber.className = `text-xs font-semibold mb-1 ${
    isOtherMonth ? 'text-slate-600 dark:text-slate-600 theme-light:text-slate-400' : 
    isToday ? 'text-blue-400 dark:text-blue-400 theme-light:text-blue-600' : 
    'text-white dark:text-white theme-light:text-slate-900'
  }`;
  dayNumber.textContent = day;
  dayEl.appendChild(dayNumber);
  
  // Mostrar eventos del día
  if (!isOtherMonth && dayEvents.length > 0) {
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'space-y-0.5';
    
    dayEvents.slice(0, 3).forEach(event => {
      const eventEl = document.createElement('div');
      eventEl.className = `text-xs px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity`;
      eventEl.style.backgroundColor = event.color || '#3b82f6';
      eventEl.style.color = 'white';
      eventEl.title = `${event.title}${event.description ? ': ' + event.description : ''}`;
      eventEl.textContent = event.title;
      eventEl.onclick = () => openEventModal(event);
      eventsContainer.appendChild(eventEl);
    });
    
    if (dayEvents.length > 3) {
      const moreEl = document.createElement('div');
      moreEl.className = 'text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 px-1';
      moreEl.textContent = `+${dayEvents.length - 3} más`;
      moreEl.onclick = () => openDayEventsModal(date, dayEvents);
      moreEl.style.cursor = 'pointer';
      eventsContainer.appendChild(moreEl);
    }
    
    dayEl.appendChild(eventsContainer);
  }
  
  // Permitir hacer clic en el día para crear evento
  if (!isOtherMonth && date) {
    dayEl.style.cursor = 'pointer';
    dayEl.onclick = (e) => {
      if (e.target === dayEl || e.target === dayNumber) {
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
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Nuevo Evento</h3>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Título</label>
        <input id="event-title" type="text" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Título del evento" />
      </div>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Descripción</label>
        <textarea id="event-description" rows="3" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" placeholder="Descripción (opcional)"></textarea>
      </div>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Fecha y hora de inicio</label>
        <input id="event-start" type="datetime-local" value="${defaultDateTime}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Fecha y hora de fin (opcional)</label>
        <input id="event-end" type="datetime-local" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Color</label>
        <select id="event-color" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
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
        <label for="event-notification" class="text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Activar notificación</label>
      </div>
      
      <div id="event-notification-time" class="hidden">
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Fecha y hora de notificación</label>
        <input id="event-notification-at" type="datetime-local" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      
      <div class="flex gap-2 mt-4">
        <button id="event-save" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar</button>
        <button id="event-cancel" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
      </div>
    </div>
  `;
  
  modal.classList.remove("hidden");
  
  const titleEl = document.getElementById('event-title');
  const descriptionEl = document.getElementById('event-description');
  const startEl = document.getElementById('event-start');
  const endEl = document.getElementById('event-end');
  const colorEl = document.getElementById('event-color');
  const notificationEl = document.getElementById('event-notification');
  const notificationTimeEl = document.getElementById('event-notification-time');
  const notificationAtEl = document.getElementById('event-notification-at');
  const saveEl = document.getElementById('event-save');
  const cancelEl = document.getElementById('event-cancel');
  
  notificationEl.addEventListener('change', () => {
    notificationTimeEl.classList.toggle('hidden', !notificationEl.checked);
    if (notificationEl.checked && !notificationAtEl.value) {
      notificationAtEl.value = startEl.value;
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
      
      const payload = {
        title: titleEl.value.trim(),
        description: descriptionEl.value.trim(),
        startDate: startEl.value,
        endDate: endEl.value || undefined,
        color: colorEl.value,
        hasNotification: notificationEl.checked,
        notificationAt: notificationEl.checked && notificationAtEl.value ? notificationAtEl.value : undefined
      };
      
      await API.calendar.create(payload);
      modal.classList.add("hidden");
      body.innerHTML = "";
      await loadEvents();
      renderCalendar();
    } catch (e) {
      alert("Error: " + e.message);
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
  
  body.innerHTML = `
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">${htmlEscape(event.title)}</h3>
      
      ${event.description ? `<div class="text-sm text-slate-300 dark:text-slate-300 theme-light:text-slate-700">${htmlEscape(event.description)}</div>` : ''}
      
      <div class="text-sm">
        <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Fecha de inicio:</div>
        <div class="text-white dark:text-white theme-light:text-slate-900">${startDate.toLocaleString('es-CO')}</div>
      </div>
      
      ${endDate ? `
        <div class="text-sm">
          <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Fecha de fin:</div>
          <div class="text-white dark:text-white theme-light:text-slate-900">${endDate.toLocaleString('es-CO')}</div>
        </div>
      ` : ''}
      
      ${event.hasNotification && notificationAt ? `
        <div class="text-sm">
          <div class="text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Notificación:</div>
          <div class="text-yellow-400 dark:text-yellow-400 theme-light:text-yellow-600">⏰ ${notificationAt.toLocaleString('es-CO')}</div>
        </div>
      ` : ''}
      
      ${event.eventType === 'reminder' ? `
        <div class="text-xs text-yellow-400 dark:text-yellow-400 theme-light:text-yellow-600 bg-yellow-500/20 dark:bg-yellow-500/20 theme-light:bg-yellow-50 p-2 rounded border border-yellow-500/30 dark:border-yellow-500/30 theme-light:border-yellow-200">
          Este evento proviene de un recordatorio de nota
        </div>
      ` : ''}
      
      <div class="flex gap-2 mt-4">
        ${event.eventType !== 'reminder' ? `
          <button id="event-edit" class="px-4 py-2 bg-blue-600/20 dark:bg-blue-600/20 hover:bg-blue-600/40 dark:hover:bg-blue-600/40 text-blue-400 dark:text-blue-400 hover:text-blue-300 dark:hover:text-blue-300 font-medium rounded-lg transition-all duration-200 border border-blue-600/30 dark:border-blue-600/30">Editar</button>
          <button id="event-delete" class="px-4 py-2 bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30">Eliminar</button>
        ` : ''}
        <button id="event-close" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900 ml-auto">Cerrar</button>
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
    const editEl = document.getElementById('event-edit');
    const deleteEl = document.getElementById('event-delete');
    
    editEl.onclick = () => {
      modal.classList.add("hidden");
      body.innerHTML = "";
      openEditEventModal(event);
    };
    
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
}

function openEditEventModal(event) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  if (!modal || !body) return;
  
  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const notificationAt = event.notificationAt ? new Date(event.notificationAt) : null;
  
  body.innerHTML = `
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Editar Evento</h3>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Título</label>
        <input id="event-edit-title" type="text" value="${htmlEscape(event.title)}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Descripción</label>
        <textarea id="event-edit-description" rows="3" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y">${htmlEscape(event.description || '')}</textarea>
      </div>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Fecha y hora de inicio</label>
        <input id="event-edit-start" type="datetime-local" value="${formatDateTime(startDate)}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Fecha y hora de fin (opcional)</label>
        <input id="event-edit-end" type="datetime-local" value="${endDate ? formatDateTime(endDate) : ''}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      
      <div>
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Color</label>
        <select id="event-edit-color" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
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
        <label for="event-edit-notification" class="text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700">Activar notificación</label>
      </div>
      
      <div id="event-edit-notification-time" class="${event.hasNotification ? '' : 'hidden'}">
        <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Fecha y hora de notificación</label>
        <input id="event-edit-notification-at" type="datetime-local" value="${notificationAt ? formatDateTime(notificationAt) : ''}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      
      <div class="flex gap-2 mt-4">
        <button id="event-edit-save" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar cambios</button>
        <button id="event-edit-cancel" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
      </div>
    </div>
  `;
  
  modal.classList.remove("hidden");
  
  const titleEl = document.getElementById('event-edit-title');
  const descriptionEl = document.getElementById('event-edit-description');
  const startEl = document.getElementById('event-edit-start');
  const endEl = document.getElementById('event-edit-end');
  const colorEl = document.getElementById('event-edit-color');
  const notificationEl = document.getElementById('event-edit-notification');
  const notificationTimeEl = document.getElementById('event-edit-notification-time');
  const notificationAtEl = document.getElementById('event-edit-notification-at');
  const saveEl = document.getElementById('event-edit-save');
  const cancelEl = document.getElementById('event-edit-cancel');
  
  notificationEl.addEventListener('change', () => {
    notificationTimeEl.classList.toggle('hidden', !notificationEl.checked);
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
      
      const payload = {
        title: titleEl.value.trim(),
        description: descriptionEl.value.trim(),
        startDate: startEl.value,
        endDate: endEl.value || null,
        color: colorEl.value,
        hasNotification: notificationEl.checked,
        notificationAt: notificationEl.checked && notificationAtEl.value ? notificationAtEl.value : null
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
    return `
      <div id="${eventId}" class="p-3 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white cursor-pointer hover:bg-slate-800/50 dark:hover:bg-slate-800/50 theme-light:hover:bg-slate-50 transition-all">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-3 h-3 rounded-full" style="background-color: ${event.color || '#3b82f6'}"></div>
          <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${htmlEscape(event.title)}</div>
        </div>
        ${event.description ? `<div class="text-sm text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">${htmlEscape(event.description)}</div>` : ''}
        <div class="text-xs text-slate-500 dark:text-slate-500 theme-light:text-slate-400">${startDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    `;
  }).join('');
  
  body.innerHTML = `
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Eventos del ${dateStr}</h3>
      <div class="space-y-2">
        ${eventsHtml}
      </div>
      <button id="day-events-close" class="w-full px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cerrar</button>
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
  const notification = document.createElement("div");
  notification.className = "fixed top-5 right-5 z-[3000] bg-blue-500 dark:bg-blue-500 theme-light:bg-blue-400 text-white dark:text-white theme-light:text-blue-900 px-5 py-3 rounded-lg text-sm font-semibold shadow-lg max-w-[400px] animate-[slideInFromRight_0.3s_ease-out]";
  notification.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="text-xl flex-shrink-0">📅</div>
      <div class="flex-1">
        <div class="font-bold mb-1">${htmlEscape(event.title)}</div>
        ${event.description ? `<div class="text-xs opacity-90 mb-1">${htmlEscape(event.description).substring(0, 100)}${event.description.length > 100 ? "..." : ""}</div>` : ''}
        <div class="text-xs opacity-90">${new Date(event.startDate).toLocaleString('es-CO')}</div>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" class="text-white hover:text-gray-200 text-lg font-bold flex-shrink-0">×</button>
    </div>
  `;
  document.body.appendChild(notification);
  
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
  
  // Cargar eventos y renderizar calendario
  loadEvents().then(() => {
    renderCalendar();
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

