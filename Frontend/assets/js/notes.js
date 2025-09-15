import { API } from "./api.js";
import { plateColor, fmt, upper } from "./utils.js";

const notesState = { page: 1, limit: 50, lastFilters: {} };

export function initNotes() {
  // Inputs
  const nPlate = document.getElementById("n-plate"); upper(nPlate);
  const nType = document.getElementById("n-type");
  const nContent = document.getElementById("n-content");
  const nFiles = document.getElementById("n-files");
  const nSave = document.getElementById("n-save");

  // NUEVO: refs de fecha/hora y pago
  const nWhen = document.getElementById("n-when");
  const payBox = document.getElementById("pay-box");
  const nPayAmount = document.getElementById("n-pay-amount");
  const nPayMethod = document.getElementById("n-pay-method");

  // Fecha/hora auto (solo visual)
  const tick = () => { if (nWhen) nWhen.value = new Date().toLocaleString(); };
  tick(); setInterval(tick, 1000);

  // Mostrar/ocultar caja de pago según tipo
  const togglePay = () => {
    if (!payBox) return;
    payBox.classList.toggle("hidden", nType.value !== "PAGO");
  };
  nType.addEventListener("change", togglePay);
  togglePay();


  const fPlate = document.getElementById("f-plate"); upper(fPlate);
  const fFrom = document.getElementById("f-from");
  const fTo = document.getElementById("f-to");
  const fApply = document.getElementById("f-apply");

  const list = document.getElementById("notesList");

  async function refresh(params = {}) {
    notesState.lastFilters = params;
    const { data } = await API.listNotes(params);
    list.innerHTML = "";
    data.forEach(row => {
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
      if (row.type === "PAGO" && typeof row.paymentAmount === "number" && row.paymentMethod) {
        header += ` — Pago: $${row.paymentAmount.toFixed(2)} — ${row.paymentMethod}`;
      }
      content.innerHTML = `<div>${header}</div><div>${row.content}</div>`;


      // media thumbnails
      if (row.media?.length) {
        const wrap = document.createElement("div");
        wrap.style.display = "flex"; wrap.style.gap = "8px"; wrap.style.flexWrap = "wrap"; wrap.style.marginTop = "6px";
        row.media.forEach(m => {
          const url = API.mediaUrl(m.fileId);
          if ((m.mimetype || "").startsWith("image/")) {
            const img = document.createElement("img");
            img.src = url; img.style.width = "80px"; img.style.height = "80px"; img.style.objectFit = "cover"; img.style.cursor = "pointer"; img.title = m.filename;
            img.onclick = () => openModal(`<img src="${url}" style="max-width:100%;height:auto" />`);
            wrap.appendChild(img);
          } else if ((m.mimetype || "").startsWith("video/")) {
            const vid = document.createElement("video");
            vid.src = url; vid.style.width = "120px"; vid.controls = true; vid.title = m.filename;
            wrap.appendChild(vid);
          }
        });
        content.appendChild(wrap);
      }

      const actions = document.createElement("div");
      actions.className = "actions";
      const editBtn = document.createElement("button"); editBtn.className = "secondary"; editBtn.textContent = "Editar";
      const delBtn = document.createElement("button"); delBtn.className = "danger"; delBtn.textContent = "Eliminar";

      editBtn.onclick = async () => {
        const nuevo = prompt("Editar contenido de la nota:", row.content);
        if (nuevo == null) return;
        await API.updateNote(row._id, { content: nuevo });
        refresh(notesState.lastFilters);
      };
      delBtn.onclick = async () => {
        if (!confirm("¿Eliminar nota?")) return;
        await API.deleteNote(row._id);
        refresh(notesState.lastFilters);
      };

      div.appendChild(plate);
      div.appendChild(content);
      div.appendChild(actions);
      list.appendChild(div);
    });
  }

  nSave.onclick = async () => {
    try {
      let media = [];
      if (nFiles.files.length) {
        const up = await API.upload(nFiles.files);
        media = up.files;
      }
      const payload = {
        plate: nPlate.value.trim(),
        type: nType.value,
        content: nContent.value.trim(),
        media
      };
      if (!payload.plate || !payload.content) return alert("Placa y contenido son obligatorios");
      if (payload.type === "PAGO") {
        const amt = parseFloat(nPayAmount.value);
        const method = nPayMethod.value;
        if (!method || isNaN(amt)) {
          return alert("Completa monto y método de pago");
        }
        payload.paymentAmount = amt;
        payload.paymentMethod = method;
      }

      await API.createNote(payload);
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

  // función centralizada para cerrar
  const hardHideModal = () => {
    if (!modal) return;
    modalBody.innerHTML = "";
    modal.classList.add("hidden");
  };

  // botón X
  modalClose.onclick = hardHideModal;

  // clic fuera del contenido
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hardHideModal();
  });

  // tecla ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hardHideModal();
  });

  // asegúrate que arranca cerrado
  hardHideModal();

  // abrir (se usa al hacer click en miniaturas de imágenes)
  window.openModal = (html) => {
    modalBody.innerHTML = html;
    modal.classList.remove("hidden");
  };

  // init
  const todayISO = new Date().toISOString().slice(0, 10);
  document.getElementById("vi-date").value = todayISO;
  refresh({});
}
