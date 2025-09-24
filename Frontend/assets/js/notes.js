import { API } from "./api.js";
import { plateColor, fmt, upper } from "./utils.js";

const notesState = { page: 1, limit: 50, lastFilters: {} };

// -------- helpers HTTP locales (no dependen de API.updateNote) --------
const apiBase = API.base || "";
const authHeader = () => {
  const t = API.token?.get?.();
  return t ? { Authorization: `Bearer ${t}` } : {};
};
async function request(path, { method = "GET", json } = {}) {
  const headers = { ...authHeader() };
  if (json !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  const raw = await res.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  if (!res.ok) {
    throw new Error(body?.error || (typeof body === "string" ? body : res.statusText));
  }
  return body;
}
const http = {
  updateNote: (id, body) => request(`/api/v1/notes/${id}`, { method: "PUT", json: body }),
  deleteNote: (id) => request(`/api/v1/notes/${id}`, { method: "DELETE" }),
};

// -------- modal util --------
function openModal(innerHTML) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  const close = document.getElementById("modalClose");
  body.innerHTML = innerHTML;
  modal.classList.remove("hidden");
  close.onclick = () => modal.classList.add("hidden");
}
function invCloseModal() {
    const modal = document.getElementById("modal");
    const body = document.getElementById("modalBody");
    if (body) body.innerHTML = "";
    if (modal) modal.classList.add("hidden");
}


export function initNotes() {
  // Inputs
  const nPlate = document.getElementById("n-plate"); upper(nPlate);
  const nType = document.getElementById("n-type");
  const nResponsible = document.getElementById("n-responsible");
  const nContent = document.getElementById("n-content");
  const nFiles = document.getElementById("n-files");
  const nSave = document.getElementById("n-save");

  // Fecha/hora auto (solo visual)
  const nWhen = document.getElementById("n-when");
  const tick = () => { if (nWhen) nWhen.value = new Date().toLocaleString(); };
  tick(); setInterval(tick, 1000);

  // Pago (UI)
  const payBox = document.getElementById("pay-box");
  const nPayAmount = document.getElementById("n-pay-amount");
  const nPayMethod = document.getElementById("n-pay-method"); // se conserva en texto
  const togglePay = () => {
    if (!payBox) return;
    payBox.classList.toggle("hidden", nType.value !== "PAGO");
  };
  nType.addEventListener("change", togglePay);
  togglePay();

  // Filtros
  const fPlate = document.getElementById("f-plate"); upper(fPlate);
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

  const niceName = (s) => {
    const m = String(s || '').toLowerCase();
    return m ? m.charAt(0).toUpperCase() + m.slice(1) : '';
  };

  async function refresh(params = {}) {
    notesState.lastFilters = params;
    const res = await API.notesList(toQuery(params));
    const rows = Array.isArray(res) ? res : (res?.items || res?.data || []);
    list.innerHTML = "";

    rows.forEach(row => {
      const div = document.createElement("div");
      div.className = "note";

      const plate = document.createElement("div");
      plate.className = "plate";
      plate.textContent = row.plate;
      // === antes poníamos background → causaba barra completa
      // ahora pasamos el color como variable y usamos borde
      const color = plateColor(row.plate);
      plate.style.setProperty('--plate-color', color);
      plate.style.cursor = "pointer";
      plate.onclick = () => {
        fPlate.value = row.plate;
        fApply.click();
      };

      const content = document.createElement("div");
      content.className = "content";
      let header = `<b>${row.type}</b> — ${fmt(row.createdAt)}`;
      if (row.responsible) {
        header += ` — Encargado: ${niceName(row.responsible)}`;
      }
      if (row.type === "PAGO" && typeof row.amount === "number" && row.amount > 0) {
        header += ` — Pago: $${row.amount.toLocaleString()}`;
      }
      const text = row.text || "";
      content.innerHTML = `<div>${header}</div><div>${text}</div>`;

      // media thumbnails
      if (row.media?.length) {
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.gap = "8px";
        wrap.style.flexWrap = "wrap";
        wrap.style.marginTop = "6px";

        row.media.forEach((m) => {
          const url = m.url;
          if (!url) return;

          if ((m.mimetype || "").startsWith("image/")) {
            const img = document.createElement("img");
            img.src = url;
            img.style.width = "80px";
            img.style.height = "80px";
            img.style.objectFit = "cover";
            img.style.cursor = "pointer";
            img.title = m.filename || "";
            img.onclick = () => openModal(`<img src="${url}" style="max-width:100%;height:auto" />`);
            wrap.appendChild(img);
          } else if ((m.mimetype || "").startsWith("video/")) {
            const vid = document.createElement("video");
            vid.src = url;
            vid.style.width = "120px";
            vid.controls = true;
            vid.title = m.filename || "";
            wrap.appendChild(vid);
          }
        });

        content.appendChild(wrap);
      }

      // Acciones: Editar / Eliminar
      const actions = document.createElement("div");
      actions.className = "actions";

      const editBtn = document.createElement("button");
      editBtn.className = "secondary";
      editBtn.textContent = "Editar";
      editBtn.onclick = () => openEditNote(row);

      const delBtn = document.createElement("button");
      delBtn.className = "danger";
      delBtn.textContent = "Eliminar";
      delBtn.style.marginLeft = "6px";
      delBtn.onclick = async () => {
        if (!confirm("¿Eliminar esta nota?")) return;
        try {
          await http.deleteNote(row._id);
          refresh(notesState.lastFilters);
        } catch (e) {
          alert("Error: " + e.message);
        }
      };

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      div.appendChild(plate);
      div.appendChild(content);
      div.appendChild(actions);
      list.appendChild(div);
    });
  }

  // ------- Modal de edición -------
  function openEditNote(row) {
    const isPago = row.type === "PAGO";
    const respOptions = ["DAVID", "VALENTIN", "SEBASTIAN", "GIOVANNY", "SANDRA", "CEDIEL"];

    // Detectar método de pago actual desde el texto: [PAGO: XXX]
    const methodOptions = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "DEPOSITO", "CHEQUE", "OTRO"];
    const match = /\[PAGO:\s*([^\]]+)\]/i.exec(row.text || "");
    let currentMethod = (match && match[1] && match[1].toUpperCase().trim()) || "EFECTIVO";
    if (!methodOptions.includes(currentMethod)) currentMethod = "EFECTIVO";

    openModal(`
      <h3>Editar nota</h3>

      <label>Tipo</label>
      <select id="e-type">
        <option value="GENERICA" ${!isPago ? "selected" : ""}>GENERICA</option>
        <option value="PAGO" ${isPago ? "selected" : ""}>PAGO</option>
      </select>

      <label>Persona encargada</label>
      <select id="e-resp">
        <option value="">Selecciona...</option>
        ${respOptions.map(n => `<option value="${n}" ${String(row.responsible || "").toUpperCase() === n ? "selected" : ""}>${n.charAt(0)}${n.slice(1).toLowerCase()}</option>`).join("")}
      </select>

      <label>Contenido</label>
      <textarea id="e-text" rows="4">${row.text || ""}</textarea>

      <div id="e-paybox" ${isPago ? "" : 'class="hidden"'}>
        <label>Monto del pago</label>
        <input id="e-amount" type="number" min="0" step="0.01" value="${Number(row.amount || 0)}" />

        <label>Método de pago</label>
        <select id="e-method">
          ${methodOptions.map(m => `<option value="${m}" ${currentMethod === m ? "selected" : ""}>${m.charAt(0)}${m.slice(1).toLowerCase()}</option>`).join("")}
        </select>
      </div>

      <div style="margin-top:10px; display:flex; gap:8px;">
        <button id="e-save">Guardar cambios</button>
        <button id="e-cancel" class="secondary">Cancelar</button>
      </div>
    `);

    const eType = document.getElementById("e-type");
    const eResp = document.getElementById("e-resp");
    const eText = document.getElementById("e-text");
    const ePay = document.getElementById("e-paybox");
    const eAmount = document.getElementById("e-amount");
    const eMethod = document.getElementById("e-method");
    const eSave = document.getElementById("e-save");
    const eCancel = document.getElementById("e-cancel");

    const syncPayBox = () => ePay.classList.toggle("hidden", eType.value !== "PAGO");
    eType.addEventListener("change", syncPayBox);
    syncPayBox();

    eCancel.onclick = hardHideModal;

    eSave.onclick = async () => {
      try {
        // limpiar tag [PAGO: ...] previo y reescribir con el método seleccionado
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

        await http.updateNote(row._id, body);
        hardHideModal();
        await refresh(notesState.lastFilters);
      } catch (e) {
        alert("Error: " + e.message);
      }
    };
  }

  // ------- Crear nota -------
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

      await API.notesCreate(payload);
      if (nPayAmount) nPayAmount.value = "";
      if (nPayMethod) nPayMethod.value = "EFECTIVO";
      nContent.value = ""; nFiles.value = "";
      refresh(notesState.lastFilters);
    } catch (e) {
      alert("Error: " + e.message);
    }
  };

  // ------- Filtros -------
  fApply.onclick = () => {
    const p = {};
    if (fPlate.value.trim()) p.plate = fPlate.value.trim();
    if (fFrom.value) p.from = fFrom.value;
    if (fTo.value) p.to = fTo.value;
    refresh(p);
  };

  // ------- Modal base (close, esc, click afuera) -------
  const modal = document.getElementById("modal");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");

  const hardHideModal = () => {
    if (!modal) return;
    modalBody.innerHTML = "";
    modal.classList.add("hidden");
  };
  modalClose.onclick = hardHideModal;
  modal.addEventListener("click", (e) => { if (e.target === modal) hardHideModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hardHideModal(); });
  hardHideModal();

  // (para ver imágenes en grande reutilizamos openModal)
  window.openModal = (html) => {
    modalBody.innerHTML = html;
    modal.classList.remove("hidden");
  };

  // init
  refresh({});
}
