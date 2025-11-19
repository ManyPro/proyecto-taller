import { API } from "./api.esm.js";
import { plateColor, fmt, upper } from "./utils.js";
import { initCalendar } from "./calendar.js";
import { datetimeLocalToISO, formatDateTimeForInput } from "./dateTime.js";

const notesState = { page: 1, limit: 50, lastFilters: {} };

// Helpers optimizados
const htmlEscape = (text) => {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
};

const niceName = (s) => {
  const m = String(s || '').toLowerCase();
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : '';
};

// Función consolidada para sincronizar recordatorios
async function syncRemindersWithCalendar() {
  if (typeof API !== 'undefined' && API.calendar && API.calendar.syncNoteReminders) {
    try {
      await API.calendar.syncNoteReminders();
      if (typeof window !== 'undefined' && window.calendarReload) {
        window.calendarReload();
      }
    } catch (e) {
      console.error("Error syncing reminders:", e);
    }
  }
}

// Gestión de modal optimizada
let modalHandlers = null;
function initModalHandlers() {
  if (modalHandlers) return modalHandlers;
  
  const modal = document.getElementById("modal");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");
  
  if (!modal || !modalBody || !modalClose) return null;
  
  const closeModal = () => {
    modalBody.innerHTML = "";
    modal.classList.add("hidden");
  };
  
  const escHandler = (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal();
    }
  };
  
  const backdropHandler = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };
  
  modalClose.onclick = closeModal;
  modal.addEventListener("click", backdropHandler);
  document.addEventListener("keydown", escHandler);
  
  modalHandlers = { modal, modalBody, closeModal };
  return modalHandlers;
}

function openModal(innerHTML) {
  const handlers = initModalHandlers();
  if (!handlers) return;
  handlers.modalBody.innerHTML = innerHTML;
  handlers.modal.classList.remove("hidden");
}

function closeModal() {
  const handlers = initModalHandlers();
  if (handlers) handlers.closeModal();
}

export function initNotes() {
  const nPlate = document.getElementById("n-plate"); 
  upper(nPlate);
  const nType = document.getElementById("n-type");
  const nResponsible = document.getElementById("n-responsible");
  const nContent = document.getElementById("n-content");
  const nFiles = document.getElementById("n-files");
  const nSave = document.getElementById("n-save");
  const nWhen = document.getElementById("n-when");
  const nReminder = document.getElementById("n-reminder");
  
  // Optimizar tick con throttling
  let lastTick = 0;
  const tick = () => {
    if (nWhen) {
      const now = Date.now();
      if (now - lastTick >= 1000) {
        nWhen.value = new Date().toLocaleString();
        lastTick = now;
      }
    }
  };
  tick();
  setInterval(tick, 1000);
  
  const payBox = document.getElementById("pay-box");
  const nPayAmount = document.getElementById("n-pay-amount");
  const nPayMethod = document.getElementById("n-pay-method");
  const togglePay = () => {
    if (payBox) payBox.classList.toggle("hidden", nType.value !== "PAGO");
  };
  nType.addEventListener("change", togglePay);
  togglePay();
  
  const fPlate = document.getElementById("f-plate"); 
  upper(fPlate);
  const fFrom = document.getElementById("f-from");
  const fTo = document.getElementById("f-to");
  const fApply = document.getElementById("f-apply");
  const list = document.getElementById("notesList");

  function toQuery(params = {}) {
    const qs = new URLSearchParams();
    if (params.plate) qs.set("plate", params.plate);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.limit) qs.set("limit", params.limit);
    const s = qs.toString();
    return s ? `?${s}` : "";
  }

  async function refresh(params = {}) {
    notesState.lastFilters = params;
    const res = await API.notesList(toQuery(params));
    const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
    list.innerHTML = "";

    if (rows.length === 0) {
      list.innerHTML = `<div class="text-center py-6 px-4 border border-dashed border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-300 rounded-lg text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay notas en el historial.</div>`;
      return;
    }

    rows.forEach(row => {
      const el = document.createElement("div");
      el.className = "p-4 border border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200 rounded-lg bg-slate-800/30 dark:bg-slate-800/30 theme-light:bg-white hover:bg-slate-800/50 dark:hover:bg-slate-800/50 theme-light:hover:bg-slate-50 transition-all duration-200 mb-3";

      const date = fmt(row.createdAt);
      const color = plateColor(row.plate);
      const hasReminder = row.reminderAt && new Date(row.reminderAt) > new Date();

      let headerHtml = `<div class="flex items-center justify-between flex-wrap gap-2 mb-2">`;
      headerHtml += `<div class="flex items-center gap-2 flex-wrap">`;
      headerHtml += `<span class="px-2.5 py-1 rounded-md text-xs font-semibold uppercase cursor-pointer hover:opacity-80 transition-opacity" style="background-color: ${color}; color: white;" onclick="document.getElementById('f-plate').value='${htmlEscape(row.plate)}'; document.getElementById('f-apply').click();">${htmlEscape(row.plate)}</span>`;
      headerHtml += `<span class="px-2 py-0.5 rounded text-xs font-medium ${row.type === 'PAGO' ? 'bg-green-500/20 dark:bg-green-500/20 theme-light:bg-green-50 text-green-400 dark:text-green-400 theme-light:text-green-700 border border-green-500/30 dark:border-green-500/30 theme-light:border-green-200' : 'bg-blue-500/20 dark:bg-blue-500/20 theme-light:bg-blue-50 text-blue-400 dark:text-blue-400 theme-light:text-blue-700 border border-blue-500/30 dark:border-blue-500/30 theme-light:border-blue-200'}">${htmlEscape(row.type)}</span>`;
      if (hasReminder) {
        const reminderDate = new Date(row.reminderAt).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        headerHtml += `<span class="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 dark:bg-yellow-500/20 theme-light:bg-yellow-50 text-yellow-400 dark:text-yellow-400 theme-light:text-yellow-700 border border-yellow-500/30 dark:border-yellow-500/30 theme-light:border-yellow-200" title="Recordatorio: ${reminderDate}">⏰ ${reminderDate}</span>`;
      }
      headerHtml += `</div>`;
      headerHtml += `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${htmlEscape(date)}</div>`;
      headerHtml += `</div>`;

      let contentHtml = `<div class="mb-2">`;
      if (row.responsible) {
        contentHtml += `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Encargado: <strong class="text-white dark:text-white theme-light:text-slate-900">${htmlEscape(niceName(row.responsible))}</strong></div>`;
      }
      if (row.type === "PAGO" && typeof row.amount === "number" && row.amount > 0) {
        contentHtml += `<div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-1">Pago: <strong class="text-green-400 dark:text-green-400 theme-light:text-green-600">$${row.amount.toLocaleString()}</strong></div>`;
      }
      contentHtml += `<div class="text-sm text-white dark:text-white theme-light:text-slate-900 mt-2">${htmlEscape(row.text || "")}</div>`;
      contentHtml += `</div>`;

      if (row.media?.length) {
        const wrap = document.createElement("div");
        wrap.className = "flex gap-2 flex-wrap mt-3";

        row.media.forEach((m) => {
          const url = m.url;
          if (!url) return;

          if ((m.mimetype || "").startsWith("image/")) {
            const img = document.createElement("img");
            img.src = url;
            img.className = "w-20 h-20 object-cover rounded-lg cursor-pointer border-2 border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-300 hover:opacity-80 transition-opacity";
            img.title = m.filename || "";
            img.onclick = () => openModal(`<div class="flex items-center justify-center p-4"><img src="${htmlEscape(url)}" class="max-w-full h-auto rounded-lg border-2 border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-300" /></div>`);
            wrap.appendChild(img);
          } else if ((m.mimetype || "").startsWith("video/")) {
            const vid = document.createElement("video");
            vid.src = url;
            vid.className = "w-32 h-auto rounded-lg border-2 border-slate-600/30 dark:border-slate-600/30 theme-light:border-slate-300";
            vid.controls = true;
            vid.title = m.filename || "";
            wrap.appendChild(vid);
          }
        });

        contentHtml += wrap.outerHTML;
      }

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/30 dark:border-slate-700/30 theme-light:border-slate-200";

      const editBtn = document.createElement("button");
      editBtn.className = "px-3 py-1.5 text-xs bg-blue-600/20 dark:bg-blue-600/20 hover:bg-blue-600/40 dark:hover:bg-blue-600/40 text-blue-400 dark:text-blue-400 hover:text-blue-300 dark:hover:text-blue-300 font-medium rounded-lg transition-all duration-200 border border-blue-600/30 dark:border-blue-600/30 theme-light:bg-blue-50 theme-light:text-blue-600 theme-light:hover:bg-blue-100 theme-light:border-blue-300";
      editBtn.textContent = "Editar";
      editBtn.onclick = () => openEditNote(row);

      const delBtn = document.createElement("button");
      delBtn.className = "px-3 py-1.5 text-xs bg-red-600/20 dark:bg-red-600/20 hover:bg-red-600/40 dark:hover:bg-red-600/40 text-red-400 dark:text-red-400 hover:text-red-300 dark:hover:text-red-300 font-medium rounded-lg transition-all duration-200 border border-red-600/30 dark:border-red-600/30 theme-light:bg-red-50 theme-light:text-red-600 theme-light:hover:bg-red-100 theme-light:border-red-300";
      delBtn.textContent = "Eliminar";
      delBtn.onclick = async () => {
        if (!confirm("¿Eliminar esta nota?")) return;
        try {
          // Usar API directamente en lugar de http helper
          const res = await fetch(`${API.base || ''}/api/v1/notes/${row._id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${API.token?.get?.() || ''}`
            }
          });
          if (!res.ok) throw new Error('Error al eliminar');
          refresh(notesState.lastFilters);
        } catch (e) {
          alert("Error: " + (e.message || 'Error desconocido'));
        }
      };

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(delBtn);

      el.innerHTML = headerHtml + contentHtml;
      el.appendChild(actionsDiv);
      list.appendChild(el);
    });
  }

  function openEditNote(row) {
    const isPago = row.type === "PAGO";
    const respOptions = ["DAVID", "VALENTIN", "SEBASTIAN", "GIOVANNY", "SANDRA", "CEDIEL"];
    const methodOptions = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "DEPOSITO", "CHEQUE", "OTRO"];
    const match = /\[PAGO:\s*([^\]]+)\]/i.exec(row.text || "");
    let currentMethod = (match && match[1] && match[1].toUpperCase().trim()) || "EFECTIVO";
    if (!methodOptions.includes(currentMethod)) currentMethod = "EFECTIVO";

    openModal(`
      <div class="space-y-4">
        <h3 class="text-lg font-semibold text-white dark:text-white theme-light:text-slate-900 mb-4">Editar nota</h3>

        <div>
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Tipo</label>
          <select id="e-type" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="GENERICA" ${!isPago ? "selected" : ""}>GENERICA</option>
            <option value="PAGO" ${isPago ? "selected" : ""}>PAGO</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Persona encargada</label>
          <select id="e-resp" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Selecciona...</option>
            ${respOptions.map(n => `<option value="${n}" ${String(row.responsible || "").toUpperCase() === n ? "selected" : ""}>${n.charAt(0)}${n.slice(1).toLowerCase()}</option>`).join("")}
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Contenido</label>
          <textarea id="e-text" rows="4" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y">${htmlEscape(row.text || "")}</textarea>
        </div>

        <div id="e-paybox" ${isPago ? "" : 'class="hidden"'} class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Monto del pago</label>
            <input id="e-amount" type="number" min="0" step="0.01" value="${Number(row.amount || 0)}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">Método de pago</label>
            <select id="e-method" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
              ${methodOptions.map(m => `<option value="${m}" ${currentMethod === m ? "selected" : ""}>${m.charAt(0)}${m.slice(1).toLowerCase()}</option>`).join("")}
            </select>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-2">⏰ Recordatorio (opcional)</label>
          <input id="e-reminder" type="datetime-local" value="${row.reminderAt ? formatDateTimeForInput(new Date(row.reminderAt)) : ""}" class="w-full p-3 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 rounded-lg bg-slate-700/50 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p class="text-xs text-slate-500 dark:text-slate-500 theme-light:text-slate-400 mt-1">Se te notificará cuando llegue la fecha y hora del recordatorio</p>
        </div>

        <div class="flex gap-2 mt-4">
          <button id="e-save" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 theme-light:from-blue-500 theme-light:to-blue-600 hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 theme-light:hover:from-blue-600 theme-light:hover:to-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200">Guardar cambios</button>
          <button id="e-cancel" class="px-4 py-2 bg-slate-700/50 dark:bg-slate-700/50 hover:bg-slate-700 dark:hover:bg-slate-700 text-white dark:text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50 dark:border-slate-600/50 theme-light:border-slate-300 theme-light:bg-slate-200 theme-light:text-slate-700 theme-light:hover:bg-slate-300 theme-light:hover:text-slate-900">Cancelar</button>
        </div>
      </div>
    `);

    const eType = document.getElementById("e-type");
    const eResp = document.getElementById("e-resp");
    const eText = document.getElementById("e-text");
    const ePay = document.getElementById("e-paybox");
    const eAmount = document.getElementById("e-amount");
    const eMethod = document.getElementById("e-method");
    const eReminder = document.getElementById("e-reminder");
    const eSave = document.getElementById("e-save");
    const eCancel = document.getElementById("e-cancel");

    const syncPayBox = () => ePay.classList.toggle("hidden", eType.value !== "PAGO");
    eType.addEventListener("change", syncPayBox);
    syncPayBox();

    eCancel.onclick = closeModal;

    eSave.onclick = async () => {
      try {
        let newText = eText.value.trim();
        newText = newText.replace(/\s*\[PAGO:[^\]]+\]/ig, "").trim();

        const body = {
          type: eType.value,
          text: newText,
          responsible: (eResp.value || "").toUpperCase() || undefined
        };
        if (eType.value === "PAGO") {
          body.amount = Number(eAmount?.value || 0);
          const m = (eMethod?.value || "EFECTIVO").toUpperCase();
          body.text = `${body.text} [PAGO: ${m}]`;
        } else {
          body.amount = 0;
        }
        if (!body.responsible) return alert("Selecciona la persona encargada");

        if (eReminder?.value) {
          // Convertir datetime-local a ISO en UTC
          body.reminderAt = datetimeLocalToISO(eReminder.value);
        } else {
          body.reminderAt = null;
        }

        // Usar API directamente
        const res = await fetch(`${API.base || ''}/api/v1/notes/${row._id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API.token?.get?.() || ''}`
          },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(error.error || 'Error al actualizar');
        }
        
        closeModal();
        await refresh(notesState.lastFilters);
        await syncRemindersWithCalendar();
      } catch (e) {
        alert("Error: " + e.message);
      }
    };
  }

  nSave.onclick = async () => {
    try {
      let media = [];
      if (nFiles.files.length) {
        const up = await API.mediaUpload(nFiles.files);
        media = up.files || [];
      }

      const payload = {
        plate: nPlate.value.trim(),
        type: nType.value,
        responsible: (nResponsible?.value || "").toUpperCase(),
        text: nContent.value.trim(),
        media
      };
      if (!payload.plate || !payload.text) {
        return alert("Placa y contenido son obligatorios");
      }
      if (!payload.responsible) {
        return alert("Selecciona la persona encargada");
      }
      if (payload.type === "PAGO") {
        const amt = parseFloat(nPayAmount?.value ?? "");
        if (isNaN(amt)) return alert("Completa el monto del pago");
        payload.amount = amt;
        if (nPayMethod?.value) payload.text += ` [PAGO: ${nPayMethod.value}]`;
      }
      if (nReminder?.value) {
        // Convertir datetime-local a ISO en UTC
        payload.reminderAt = datetimeLocalToISO(nReminder.value);
      }

      await API.notesCreate(payload);
      if (nPayAmount) nPayAmount.value = "";
      if (nPayMethod) nPayMethod.value = "EFECTIVO";
      if (nReminder) nReminder.value = "";
      nContent.value = ""; 
      nFiles.value = "";
      refresh(notesState.lastFilters);
      
      if (payload.reminderAt) {
        await syncRemindersWithCalendar();
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  };

  fApply.onclick = () => {
    const p = {};
    if (fPlate.value.trim()) p.plate = fPlate.value.trim();
    if (fFrom.value) p.from = fFrom.value;
    if (fTo.value) p.to = fTo.value;
    refresh(p);
  };

  // Inicializar modal handlers
  initModalHandlers();
  
  // Exponer openModal globalmente para compatibilidad
  window.openModal = (html) => {
    const handlers = initModalHandlers();
    if (handlers) {
      handlers.modalBody.innerHTML = html;
      handlers.modal.classList.remove("hidden");
    }
  };

  function showReminderNotification(note) {
    const notification = document.createElement("div");
    notification.className = "fixed top-5 right-5 z-[3000] bg-yellow-500 dark:bg-yellow-500 theme-light:bg-yellow-400 text-white dark:text-white theme-light:text-yellow-900 px-5 py-3 rounded-lg text-sm font-semibold shadow-lg max-w-[400px] animate-[slideInFromRight_0.3s_ease-out]";
    notification.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="text-xl flex-shrink-0">⏰</div>
        <div class="flex-1">
          <div class="font-bold mb-1">Recordatorio</div>
          <div class="text-xs opacity-90 mb-1">Placa: <strong>${htmlEscape(note.plate)}</strong></div>
          <div class="text-xs opacity-90">${htmlEscape(note.text || "").substring(0, 100)}${note.text && note.text.length > 100 ? "..." : ""}</div>
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

  // Optimizar checkReminders: solo ejecutar cuando la pestaña está visible
  let lastReminderCheck = 0;
  async function checkReminders() {
    // Solo verificar si la pestaña está visible y han pasado al menos 30 segundos desde la última verificación
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastReminderCheck < 30000) return;
    lastReminderCheck = now;
    
    try {
      const res = await API.notesList("?limit=200");
      const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
      const nowDate = new Date();
      const notifiedIds = JSON.parse(localStorage.getItem("notesRemindersNotified") || "[]");

      rows.forEach(note => {
        if (!note.reminderAt) return;
        const reminderDate = new Date(note.reminderAt);
        const timeDiff = reminderDate.getTime() - nowDate.getTime();
        const noteId = String(note._id);

        if (timeDiff <= 60000 && timeDiff >= -300000 && !notifiedIds.includes(noteId)) {
          showReminderNotification(note);
          notifiedIds.push(noteId);
          localStorage.setItem("notesRemindersNotified", JSON.stringify(notifiedIds));
        }
      });

      const oneDayAgo = nowDate.getTime() - 24 * 60 * 60 * 1000;
      const filteredIds = notifiedIds.filter(id => {
        const note = rows.find(n => String(n._id) === id);
        if (!note || !note.reminderAt) return false;
        return new Date(note.reminderAt).getTime() > oneDayAgo;
      });
      localStorage.setItem("notesRemindersNotified", JSON.stringify(filteredIds));
    } catch (e) {
      console.error("Error checking reminders:", e);
    }
  }

  // Verificar recordatorios cada minuto, pero solo si la pestaña está visible
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      checkReminders();
    }
  }, 60000);
  
  // Verificar cuando la pestaña se vuelve visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkReminders();
    }
  });
  
  checkReminders();

  refresh({});
  
  // Inicializar calendario
  setTimeout(() => {
    initCalendar();
  }, 500);
}
