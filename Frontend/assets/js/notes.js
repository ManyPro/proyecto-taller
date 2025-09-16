import { API } from "./api.js";
import { plateColor, fmt, upper } from "./utils.js";

const notesState = { page: 1, limit: 50, lastFilters: {} };

export function initNotes() {
  // Inputs
  const nPlate = document.getElementById("n-plate"); upper(nPlate);
  const nType = document.getElementById("n-type");
  const nResponsible = document.getElementById("n-responsible"); // <-- NUEVO
  const nContent = document.getElementById("n-content");
  const nFiles = document.getElementById("n-files");
  const nSave = document.getElementById("n-save");

  // Fecha/hora auto (solo visual)
  const nWhen = document.getElementById("n-when");
  const tick = () => { if (nWhen) nWhen.value = new Date().toLocaleString(); };
  tick(); setInterval(tick, 1000);

  // Pago
  const payBox = document.getElementById("pay-box");
  const nPayAmount = document.getElementById("n-pay-amount");
  const nPayMethod = document.getElementById("n-pay-method"); // hoy no se persiste; opcional

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
    const rows = res?.items || [];
    list.innerHTML = "";

    rows.forEach(row => {
      const div = document.createElement("div");
      div.className = "note";

      const plate = document.createElement("div");
      plate.className = "plate";
      plate.textContent = row.plate;
      plate.style.background = plateColor(row.plate);
      plate.style.cursor = "pointer";
      plate.onclick = () => {
        fPlate.value = row.plate;
        fApply.click();
      };

      const content = document.createElement("div");
      content.className = "content";
      let header = `<b>${row.type}</b> — ${fmt(row.createdAt)}`;
      // Encargado
      if (row.responsible) {
        header += ` — Encargado: ${niceName(row.responsible)}`;
      }
      if (row.type === "PAGO" && typeof row.amount === "number" && row.amount > 0) {
        header += ` — Pago: $${row.amount.toLocaleString()}`;
      }
      const text = row.text || ""; // <-- el campo real en el backend
      content.innerHTML = `<div>${header}</div><div>${text}</div>`;

      // media thumbnails (usa URL directa si viene de Cloudinary)
      if (row.media?.length) {
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.gap = "8px";
        wrap.style.flexWrap = "wrap";
        wrap.style.marginTop = "6px";

        row.media.forEach((m) => {
          const url = m.url; // nuestro backend ya devuelve url
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

      // Acciones (solo si el API las tiene)
      const actions = document.createElement("div");
      actions.className = "actions";
      if (typeof API.updateNote === "function") {
        const editBtn = document.createElement("button");
        editBtn.className = "secondary";
        editBtn.textContent = "Editar";
        editBtn.onclick = async () => {
          const nuevo = prompt("Editar contenido de la nota:", text);
          if (nuevo == null) return;
          await API.updateNote(row._id, { text: nuevo });
          refresh(notesState.lastFilters);
        };
        actions.appendChild(editBtn);
      }
      if (typeof API.deleteNote === "function") {
        const delBtn = document.createElement("button");
        delBtn.className = "danger";
        delBtn.textContent = "Eliminar";
        delBtn.onclick = async () => {
          if (!confirm("¿Eliminar nota?")) return;
          await API.deleteNote(row._id);
          refresh(notesState.lastFilters);
        };
        actions.appendChild(delBtn);
      }

      div.appendChild(plate);
      div.appendChild(content);
      if (actions.childNodes.length) div.appendChild(actions);
      list.appendChild(div);
    });
  }

  nSave.onclick = async () => {
    try {
      let media = [];
      if (nFiles.files.length) {
        const up = await API.mediaUpload(nFiles.files); // <--
        media = up.files || [];
      }

      const payload = {
        plate: nPlate.value.trim(),
        type: nType.value,
        responsible: (nResponsible?.value || "").toUpperCase(), // <-- NUEVO
        text: nContent.value.trim(),          // <-- se guarda en "text"
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
        payload.amount = amt;                 // <-- modelo usa "amount"
        // Si quieres guardar el método de pago, hoy no hay campo; puedes concatenarlo en text:
        if (nPayMethod?.value) payload.text += ` [PAGO: ${nPayMethod.value}]`;
      }

      await API.notesCreate(payload);         // <--
      if (nPayAmount) nPayAmount.value = "";
      if (nPayMethod) nPayMethod.value = "EFECTIVO";
      nContent.value = ""; nFiles.value = ""; // reset
      refresh(notesState.lastFilters);
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

  // modal
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

  // abrir (se usa al hacer click en miniaturas de imágenes)
  window.openModal = (html) => {
    modalBody.innerHTML = html;
    modal.classList.remove("hidden");
  };

  // init
  refresh({});
}
