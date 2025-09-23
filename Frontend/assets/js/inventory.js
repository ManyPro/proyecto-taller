// Frontend/assets/js/inventory.js
import { API } from "./api.js";
import { upper } from "./utils.js";

<<<<<<< HEAD
/* =================== helpers HTTP =================== */
=======
const state = { intakes: [], lastItemsParams: {}, items: [], selected: new Set() };

function makeIntakeLabel(v) {
  return `${(v?.brand || "").trim()} ${(v?.model || "").trim()} ${(v?.engine || "").trim()}`
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const fmtMoney = (n) => {
  const v = Math.round((n || 0) * 100) / 100;
  try { return v.toLocaleString(); } catch { return String(v); }
};

// --------- HTTP local ----------
>>>>>>> parent of 3e8e131 (inventory)
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
    body: json !== undefined ? JSON.stringify(json) : undefined
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(body?.error || (typeof body === "string" ? body : res.statusText));
  return body;
}
<<<<<<< HEAD
const toQuery = (obj = {}) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") p.set(k, v);
=======
function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.set(k, v);
>>>>>>> parent of 3e8e131 (inventory)
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const invAPI = {
  // Entradas de vehículo
  listVehicleIntakes: async () => {
    const r = await request("/api/v1/inventory/vehicle-intakes");
<<<<<<< HEAD
    return Array.isArray(r) ? r : (r.data || r.items || []);
=======
    const data = Array.isArray(r) ? r : (r.items || r.data || []);
    return { data };
>>>>>>> parent of 3e8e131 (inventory)
  },
  saveVehicleIntake: (body) =>
    request("/api/v1/inventory/vehicle-intakes", { method: "POST", json: body }),
  updateVehicleIntake: (id, body) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}`, { method: "PUT", json: body }),
  deleteVehicleIntake: (id) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}`, { method: "DELETE" }),
  recalcVehicleIntake: (id) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}/recalc`, { method: "POST" }),

<<<<<<< HEAD
  // Ítems
  listItems: async (params = {}) => {
    const r = await request(`/api/v1/inventory/items${toQuery(params)}`);
    return Array.isArray(r) ? r : (r.data || r.items || []);
=======
  listItems: async (params = {}) => {
    const r = await request(`/api/v1/inventory/items${toQuery(params)}`);
    const data = Array.isArray(r) ? r : (r.items || r.data || []);
    return { data };
>>>>>>> parent of 3e8e131 (inventory)
  },
  saveItem: (body) =>
    request("/api/v1/inventory/items", { method: "POST", json: body }),
  updateItem: (id, body) =>
    request(`/api/v1/inventory/items/${id}`, { method: "PUT", json: body }),
  deleteItem: (id) =>
<<<<<<< HEAD
    request(`/api/v1/inventory/items/${id}`, { method: "DELETE" }),

  // Imagen PNG del QR (backend ya expone este endpoint)
  qrPngUrl: (id, size = 220) =>
    `${apiBase}/api/v1/inventory/items/${id}/qr.png?size=${size}`
};

/* =================== Estado/UI =================== */
const state = {
  intakes: [],
  items: [],
  lastParams: {},
  selected: new Set()
};
const $ = (id) => document.getElementById(id);
const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  try { return v.toLocaleString(); } catch { return String(v); }
};
const makeIntakeLabel = (v) =>
  `${(v?.brand || "").trim()} ${(v?.model || "").trim()} ${(v?.engine || "").trim()}`
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/* =================== Modal helpers =================== */
function openModal(html) {
  const modal = $("modal");
  const body = $("modalBody");
  body.innerHTML = html;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  const closeBtn = $("modalClose");
  if (closeBtn) closeBtn.onclick = closeModal;
}
function closeModal() {
  const modal = $("modal");
  const body = $("modalBody");
  body.innerHTML = "";
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

/* =================== Carga Inicial =================== */
export async function initInventory() {
  // -------- form: Nuevo ítem --------
  if (!API.token.get()) {
    return;
  }

  try {
    const itSku = $("it-sku"); upper(itSku);
    const itName = $("it-name"); upper(itName);
    const itInternalName = $("it-internalName"); if (itInternalName) upper(itInternalName);
    const itStorageLocation = $("it-storageLocation"); if (itStorageLocation) upper(itStorageLocation);
    const itVehicleTarget = $("it-vehicleTarget"); upper(itVehicleTarget);
    const itVehicleIntakeId = $("it-vehicleIntakeId");
    const itEntryPrice = $("it-entryPrice");
    const itSalePrice = $("it-salePrice");
    const itOriginal = $("it-original");
    const itStock = $("it-stock");
    const itFiles = $("it-files");
    const itSave = $("it-save");

    // -------- filtros --------
    const qName = $("q-name");
    const qSku = $("q-sku");
    const qIntake = $("q-intakeId");
    const qApply = $("q-apply");
    const qClear = $("q-clear");

    // -------- stickers toolbar --------
    renderStickerToolbar();

    // -------- cargar entradas --------
    state.intakes = await invAPI.listVehicleIntakes();
    if (qIntake) {
      qIntake.innerHTML = `<option value="">Todas las entradas</option>` +
        state.intakes.map(v =>
          `<option value="${v._id}">${makeIntakeLabel(v)} - ${new Date(v.intakeDate || v.createdAt).toLocaleDateString()}</option>`
        ).join("");
    }
    if (itVehicleIntakeId) {
      itVehicleIntakeId.innerHTML = `<option value="">(sin entrada)</option>` +
        state.intakes.map(v =>
          `<option value="${v._id}">${makeIntakeLabel(v)} - ${new Date(v.intakeDate || v.createdAt).toLocaleDateString()}</option>`
        ).join("");
    }

    // -------- guardar nuevo ítem --------
    itSave.onclick = async () => {
      let vehicleTargetValue = (itVehicleTarget.value || "").trim();
      const selectedIntakeId = itVehicleIntakeId.value || undefined;

      if (selectedIntakeId && (!vehicleTargetValue || vehicleTargetValue === "VITRINAS")) {
        const vi = state.intakes.find(v => v._id === selectedIntakeId);
        if (vi) vehicleTargetValue = makeIntakeLabel(vi);
      }
      if (!vehicleTargetValue) vehicleTargetValue = "VITRINAS";

      let images = [];
      if (itFiles && itFiles.files && itFiles.files.length > 0 && API.mediaUpload) {
        try {
          const up = await API.mediaUpload(itFiles.files);
          images = Array.isArray(up?.files) ? up.files : [];
        } catch { images = []; }
      }

      const body = {
        sku: itSku.value.trim(),
        name: itName.value.trim(),
        internalName: itInternalName?.value ? itInternalName.value.trim() : undefined,
        storageLocation: itStorageLocation?.value ? itStorageLocation.value.trim() : undefined,
        vehicleTarget: vehicleTargetValue,
        vehicleIntakeId: selectedIntakeId,
        entryPrice: itEntryPrice.value ? parseFloat(itEntryPrice.value) : undefined,
        salePrice: parseFloat(itSalePrice.value || "0"),
        original: itOriginal.value === "true",
        stock: parseInt(itStock.value || "0", 10),
        images
      };

      if (!body.sku || !body.name || !Number.isFinite(body.salePrice)) {
        alert("Completa SKU, Nombre y Precio de venta.");
        return;
      }

      await invAPI.saveItem(body);

      // limpiar
      itSku.value = "";
      itName.value = "";
      if (itInternalName) itInternalName.value = "";
      if (itStorageLocation) itStorageLocation.value = "";
      itVehicleTarget.value = "";
      itVehicleIntakeId.value = "";
      itEntryPrice.value = "";
      itSalePrice.value = "";
      itOriginal.value = "false";
      itStock.value = "";
      if (itFiles) itFiles.value = "";

      await refreshItems({});
    };

    // -------- filtros: buscar / limpiar --------
    const doSearch = () => refreshItems({
      name: qName.value.trim(),        // backend matchea name + internalName
      sku: qSku.value.trim(),
      vehicleIntakeId: qIntake.value || undefined
    });
    qApply.onclick = doSearch;
    qClear.onclick = () => { qName.value = ""; qSku.value = ""; qIntake.value = ""; refreshItems({}); };
    [qName, qSku].forEach(el => el.addEventListener("keydown", (e) => e.key === "Enter" && doSearch()));
    qIntake.addEventListener("change", doSearch);
=======
    request(`/api/v1/inventory/items/${id}`, { method: "DELETE" })
};

// --------------------------- modal utils --------------------------------
function invOpenModal(innerHTML) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  const close = document.getElementById("modalClose");
  if (!modal || !body || !close) return alert("No se encontró el modal en el DOM.");
  body.innerHTML = innerHTML;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");

  const closeAll = () => invCloseModal();
  close.onclick = closeAll;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeAll();
  }, { once: true });

  function escListener(e) { if (e.key === "Escape") closeAll(); }
  document.addEventListener("keydown", escListener, { once: true });
}
function invCloseModal() {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  if (body) body.innerHTML = "";
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function openLightbox(media) {
  const isVideo = (media.mimetype || "").startsWith("video/");
  invOpenModal(`
    <h3>Vista previa</h3>
    <div class="viewer">
      ${isVideo
      ? `<video controls src="${media.url}"></video>`
      : `<img src="${media.url}" alt="media" />`
    }
    </div>
    <div class="row">
      <button class="secondary" id="lb-close">Cerrar</button>
    </div>
  `);
  document.getElementById("lb-close").onclick = invCloseModal;
}

// ========= helpers QR =========
function buildQrPath(itemId, size = 256) {
  return `/api/v1/inventory/items/${itemId}/qr.png?size=${size}`;
}
async function fetchQrBlob(itemId, size = 256) {
  const res = await fetch(`${apiBase}${buildQrPath(itemId, size)}`, {
    headers: { ...authHeader() }
  });
  if (!res.ok) throw new Error("No se pudo generar el QR");
  return await res.blob();
}
async function setImgWithQrBlob(imgEl, itemId, size = 256) {
  try {
    const blob = await fetchQrBlob(itemId, size);
    const url = URL.createObjectURL(blob);
    imgEl.src = url;
    imgEl.dataset.blobUrl = url;
  } catch (e) {
    imgEl.alt = "Error al cargar QR";
  }
}
async function downloadQrPng(itemId, size = 720, filename = "qr.png") {
  const blob = await fetchQrBlob(itemId, size);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function buildQrPayload(companyId, item) {
  return `IT:${companyId}:${item._id}:${(item.sku || "").toUpperCase()}`;
}
function openQrModal(item, companyId) {
  invOpenModal(`
    <h3>QR del ítem</h3>
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:8px;">
      <img id="qr-big" alt="QR ${item.sku || item._id}" style="width:300px;height:300px;background:#fff;padding:8px;border-radius:10px;border:1px solid #1f2937" />
      <div class="row" style="gap:8px;">
        <button class="secondary" id="qr-download">Descargar PNG</button>
        <button class="secondary" id="qr-copy">Copiar payload</button>
      </div>
      <code style="font-size:12px;opacity:.8;word-break:break-all;" id="qr-payload"></code>
    </div>
  `);

  const img = document.getElementById("qr-big");
  setImgWithQrBlob(img, item._id, 300);

  const payload = buildQrPayload(companyId || (API.companyId?.get?.() || ""), item);
  document.getElementById("qr-payload").textContent = payload;

  const btnCopy = document.getElementById("qr-copy");
  btnCopy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      btnCopy.textContent = "¡Copiado!";
      setTimeout(() => (btnCopy.textContent = "Copiar payload"), 1200);
    } catch {
      alert("No se pudo copiar");
    }
  };

  document.getElementById("qr-download").onclick = () =>
    downloadQrPng(item._id, 720, `QR_${item.sku || item._id}.png`);
}

// ====== jsPDF para Stickers ======
function ensureJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf?.jsPDF) return resolve(window.jspdf.jsPDF);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    s.onload = () => resolve(window.jspdf?.jsPDF);
    s.onerror = () => reject(new Error("No se pudo cargar jsPDF"));
    document.head.appendChild(s);
  });
}
function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

// =================================================================================

export function initInventory() {
  // ---- Entradas: crear ----
  const viBrand = document.getElementById("vi-brand"); upper(viBrand);
  const viModel = document.getElementById("vi-model"); upper(viModel);
  const viEngine = document.getElementById("vi-engine"); upper(viEngine);
  const viDate = document.getElementById("vi-date");
  const viPrice = document.getElementById("vi-price");
  const viSave = document.getElementById("vi-save");

  // ---- Entradas: lista ----
  const viList = document.getElementById("vi-list");

  // ---- Nuevo ítem ----
  const itSku = document.getElementById("it-sku"); upper(itSku);
  const itName = document.getElementById("it-name"); upper(itName);
  const itVehicleTarget = document.getElementById("it-vehicleTarget"); upper(itVehicleTarget);
  const itVehicleIntakeId = document.getElementById("it-vehicleIntakeId");
  const itEntryPrice = document.getElementById("it-entryPrice");
  const itSalePrice = document.getElementById("it-salePrice");
  const itOriginal = document.getElementById("it-original");
  const itStock = document.getElementById("it-stock");
  const itFiles = document.getElementById("it-files");
  const itSave = document.getElementById("it-save");

  // ---- Listado de ítems ----
  const itemsList = document.getElementById("itemsList");
  const qName = document.getElementById("q-name");
  const qApply = document.getElementById("q-apply");

  const qSku = document.getElementById("q-sku");
  const qIntake = document.getElementById("q-intakeId");
  const qClear = document.getElementById("q-clear");

  // ---- Barra de selección (se inyecta sobre la lista) ----
  const selectionBar = document.createElement("div");
  selectionBar.id = "stickersBar";
  selectionBar.style.cssText = "display:none;gap:8px;align-items:center;margin:10px 0;flex-wrap:wrap";
  itemsList.parentNode.insertBefore(selectionBar, itemsList);

  function updateSelectionBar() {
    const n = state.selected.size;
    if (!n) {
      selectionBar.style.display = "none";
      selectionBar.innerHTML = "";
      return;
    }
    selectionBar.style.display = "flex";
    selectionBar.innerHTML = `
      <div class="muted" style="font-weight:600;">Seleccionados: ${n}</div>
      <button class="secondary" id="sel-clear">Limpiar selección</button>
      <button class="secondary" id="sel-page">Seleccionar todos (página)</button>
      <button id="sel-stickers">Generar PDF stickers</button>
    `;
    selectionBar.querySelector("#sel-clear").onclick = () => {
      state.selected.clear();
      Array.from(itemsList.querySelectorAll('input[type="checkbox"][data-id]')).forEach(ch => ch.checked = false);
      updateSelectionBar();
    };
    selectionBar.querySelector("#sel-page").onclick = () => {
      Array.from(itemsList.querySelectorAll('input[type="checkbox"][data-id]')).forEach(ch => {
        ch.checked = true;
        state.selected.add(ch.dataset.id);
      });
      updateSelectionBar();
    };
    selectionBar.querySelector("#sel-stickers").onclick = generateStickersFromSelection;
  }

  function toggleSelected(id, checked) {
    if (checked) state.selected.add(id);
    else state.selected.delete(id);
    updateSelectionBar();
  }

  // ====== Entradas: fetch y render ======
  async function refreshIntakes() {
    const { data } = await invAPI.listVehicleIntakes();
    state.intakes = data || [];

    itVehicleIntakeId.innerHTML =
      `<option value="">(opcional)</option>` +
      state.intakes
        .map(v => `<option value="${v._id}">${v.brand} ${v.model} ${v.engine} - ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
        .join("");

    if (qIntake) {
      qIntake.innerHTML =
        `<option value="">Todas las entradas</option>` +
        state.intakes
          .map(v => `<option value="${v._id}">${v.brand} ${v.model} ${v.engine} - ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
          .join("");
    }

    renderIntakesList();
    itVehicleIntakeId.dispatchEvent(new Event("change"));
  }

  function renderIntakesList() {
    if (!viList) return;
    if (!state.intakes.length) {
      viList.innerHTML = `<div class="muted">No hay ingresos aún.</div>`;
      return;
    }

    viList.innerHTML = "";
    state.intakes.forEach((vi) => {
      const row = document.createElement("div");
      row.className = "note";
      row.innerHTML = `
        <div>
          <div><b>${vi.brand} ${vi.model}</b></div>
          <div>${vi.engine}</div>
        </div>
        <div class="content">
          <div>Fecha: ${new Date(vi.intakeDate).toLocaleDateString()}</div>
          <div>Precio entrada (vehículo): <b>${fmtMoney(vi.entryPrice)}</b></div>
        </div>
        <div class="actions">
          <button class="secondary" data-edit="${vi._id}">Editar</button>
          <button class="secondary" data-recalc="${vi._id}">Recalcular</button>
          <button class="danger" data-del="${vi._id}">Eliminar</button>
        </div>
      `;
      row.querySelector("[data-edit]").onclick = () => openEditVehicleIntake(vi);
      row.querySelector("[data-del]").onclick = async () => {
        if (!confirm("¿Eliminar esta entrada de vehículo? (debe no tener ítems vinculados)")) return;
        try {
          await invAPI.deleteVehicleIntake(vi._id);
          await refreshIntakes();
          await refreshItems({});
        } catch (e) { alert("No se pudo eliminar: " + e.message); }
      };
      row.querySelector("[data-recalc]").onclick = async () => {
        await invAPI.recalcVehicleIntake(vi._id);
        await refreshItems({});
        alert("Prorrateo recalculado.");
      };
      viList.appendChild(row);
    });
  }

  // ====== Ítems: thumbs ======
  function buildThumbGrid(it) {
    const media = Array.isArray(it.images) ? it.images : [];
    const cells = media.map((m, i) => {
      const isVid = (m.mimetype || "").startsWith("video/");
      const type = isVid ? "video" : "image";
      const src = m.url;

      return isVid
        ? `<video class="item-thumb" data-full="${src}" data-type="${type}" src="${src}" muted playsinline></video>`
        : `<img class="item-thumb" data-full="${src}" data-type="${type}" src="${src}" alt="${(it.name || "imagen") + " " + (i + 1)}" loading="lazy">`;
    }).join("");

    // QR como otra miniatura (se carga por fetch)
    const qrCell = `<img id="qr-${it._id}" class="item-thumb qr-thumb" alt="QR ${it.sku || it._id}" loading="lazy" />`;

    return `<div class="item-media">${cells}${qrCell}</div>`;
  }

  async function refreshItems(params = {}) {
    state.lastItemsParams = params;
    const { data } = await invAPI.listItems(params);
    state.items = data || [];
    itemsList.innerHTML = "";

    (state.items).forEach((it) => {
      const div = document.createElement("div");
      div.className = "note";

      const unit = it.entryPrice ?? 0;
      const total = unit * Math.max(0, it.stock || 0);
      const entradaTxt = `${fmtMoney(total)}${it.entryPriceIsAuto ? " (prorrateado)" : ""} - unit: ${fmtMoney(unit)}`;

      const thumbs = buildThumbGrid(it);

      const companyId = API.companyId?.get?.() || "";

      div.innerHTML = `
        <div>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" data-id="${it._id}" ${state.selected.has(it._id) ? "checked" : ""} />
            <div><b>${it.sku}</b></div>
          </div>
          <div>${it.name}</div>
          ${thumbs}
        </div>
        <div class="content">
          <div>Vehículo: ${it.vehicleTarget}${it.vehicleIntakeId ? " (entrada)" : ""}</div>
          <div>Entrada: ${entradaTxt} | Venta: ${fmtMoney(it.salePrice)}</div>
          <div>Stock: <b>${it.stock}</b> | Original: ${it.original ? "Sí" : "No"}</div>
        </div>
        <div class="actions">
          <button class="secondary" data-edit="${it._id}">Editar</button>
          <button class="danger" data-del="${it._id}">Eliminar</button>
          <button class="secondary" data-qr-dl="${it._id}">Descargar QR</button>
          <button class="secondary" data-qr="${it._id}">Expandir código QR</button>
        </div>`;

      // selección
      div.querySelector(`input[type="checkbox"][data-id]`).onchange = (e) =>
        toggleSelected(it._id, e.target.checked);

      // Cargar QR en miniatura
      const imgQr = div.querySelector(`#qr-${it._id}`);
      if (imgQr) setImgWithQrBlob(imgQr, it._id, 180);

      const edit = div.querySelector("[data-edit]");
      const del = div.querySelector("[data-del]");
      const btnQr = div.querySelector("[data-qr]");
      const btnQrDl = div.querySelector("[data-qr-dl]");

      edit.onclick = () => openEditItem(it);

      del.onclick = async () => {
        if (!confirm("¿Eliminar ítem? (stock debe ser 0)")) return;
        try {
          await invAPI.deleteItem(it._id);
          state.selected.delete(it._id);
          refreshItems(state.lastItemsParams);
          updateSelectionBar();
        } catch (e) { alert("Error: " + e.message); }
      };

      btnQr.onclick = () => openQrModal(it, companyId);
      btnQrDl.onclick = () => downloadQrPng(it._id, 720, `QR_${it.sku || it._id}.png`);

      // lightbox para miniaturas
      div.addEventListener("click", (e) => {
        const el = e.target.closest(".item-thumb");
        if (!el || el.id === `qr-${it._id}`) return; // el QR no abre lightbox (se expande con el botón)
        const url = el.dataset.full || el.currentSrc || el.src;
        const type = el.dataset.type || "image";
        openLightbox({ url, mimetype: type === "video" ? "video/*" : "image/*" });
      });

      itemsList.appendChild(div);
    });

    updateSelectionBar();
  }

  // ====== Guardar entrada de vehículo ======
  viSave.onclick = async () => {
    const body = {
      brand: viBrand.value.trim(),
      model: viModel.value.trim(),
      engine: viEngine.value.trim(),
      intakeDate: viDate.value ? new Date(viDate.value).toISOString() : undefined,
      entryPrice: parseFloat(viPrice.value || "0"),
    };
    if (!body.brand || !body.model || !body.engine || !body.entryPrice)
      return alert("Completa marca, modelo, cilindraje y precio de entrada");
    await invAPI.saveVehicleIntake(body);
    await refreshIntakes();
    alert("Entrada de vehículo creada");
  };

  // ====== Auto-relleno de destino ======
  itVehicleIntakeId.addEventListener("change", () => {
    const id = itVehicleIntakeId.value;
    if (!id) {
      itVehicleTarget.value = "VITRINAS";
      itVehicleTarget.readOnly = false;
      return;
    }
    const vi = state.intakes.find((v) => v._id === id);
    if (vi) {
      itVehicleTarget.value = makeIntakeLabel(vi);
      itVehicleTarget.readOnly = true;
    } else {
      itVehicleTarget.readOnly = false;
    }
  });

  // ====== Guardar ítem (con imágenes) ======
  itSave.onclick = async () => {
    let vehicleTargetValue = (itVehicleTarget.value || "").trim();
    const selectedIntakeId = itVehicleIntakeId.value || undefined;

    if (selectedIntakeId && (!vehicleTargetValue || vehicleTargetValue === "VITRINAS")) {
      const vi = state.intakes.find((v) => v._id === selectedIntakeId);
      if (vi) vehicleTargetValue = makeIntakeLabel(vi);
    }
    if (!vehicleTargetValue) vehicleTargetValue = "VITRINAS";

    let images = [];
    if (itFiles && itFiles.files && itFiles.files.length > 0) {
      const up = await API.mediaUpload(itFiles.files);
      images = (up && up.files) ? up.files : [];
    }

    const body = {
      sku: itSku.value.trim(),
      name: itName.value.trim(),
      vehicleTarget: vehicleTargetValue,
      vehicleIntakeId: selectedIntakeId,
      entryPrice: itEntryPrice.value ? parseFloat(itEntryPrice.value) : undefined,
      salePrice: parseFloat(itSalePrice.value || "0"),
      original: itOriginal.value === "true",
      stock: parseInt(itStock.value || "0", 10),
      images
    };

    if (!body.sku || !body.name || !body.salePrice)
      return alert("Completa SKU, nombre y precio de venta");

    await invAPI.saveItem(body);

    itSku.value = "";
    itName.value = "";
    itVehicleTarget.value = "";
    itVehicleIntakeId.value = "";
    itEntryPrice.value = "";
    itSalePrice.value = "";
    itOriginal.value = "false";
    itStock.value = "";
    if (itFiles) itFiles.value = "";
    itVehicleTarget.readOnly = false;
>>>>>>> parent of 3e8e131 (inventory)

    // -------- primera carga --------
    await refreshItems({});
<<<<<<< HEAD
  } catch (e) {
    console.error('[inventory] init error', e);
  }
}

/* =================== Listado / selección =================== */
async function refreshItems(params = {}) {
  state.lastParams = params;
  state.selected.clear();

  const list = $("itemsList");
  if (!list) return;
  list.innerHTML = `<div class="muted">Cargando...</div>`;
=======
  };

  // ====== Búsqueda / Init ======
  function doSearch() {
    const params = {
      name: qName.value.trim(),
      sku: qSku.value.trim(),
      vehicleIntakeId: qIntake.value || undefined,
    };
    refreshItems(params);
  }
  qApply.onclick = doSearch;
  qClear.onclick = () => {
    qName.value = "";
    qSku.value = "";
    qIntake.value = "";
    refreshItems({});
  };
  [qName, qSku].forEach((el) =>
    el.addEventListener("keydown", (e) => e.key === "Enter" && doSearch())
  );
  qIntake.addEventListener("change", doSearch);

  // ====== Editar: ENTRADA ======
  function openEditVehicleIntake(vi) {
    const d = new Date(vi.intakeDate);
    const ymd = isFinite(d) ? d.toISOString().slice(0, 10) : "";

    invOpenModal(`
      <h3>Editar entrada de vehículo</h3>
>>>>>>> parent of 3e8e131 (inventory)

      <label>Marca</label>
      <input id="e-vi-brand" value="${(vi.brand || "").toUpperCase()}" />

      <label>Modelo</label>
      <input id="e-vi-model" value="${(vi.model || "").toUpperCase()}" />

      <label>Cilindraje</label>
      <input id="e-vi-engine" value="${(vi.engine || "").toUpperCase()}" />

      <label>Fecha</label>
      <input id="e-vi-date" type="date" value="${ymd}" />

      <label>Precio de entrada (vehículo)</label>
      <input id="e-vi-price" type="number" step="0.01" min="0" value="${Number(vi.entryPrice || 0)}" />

      <div style="margin-top:10px; display:flex; gap:8px;">
        <button id="e-vi-save">Guardar cambios</button>
        <button id="e-vi-cancel" class="secondary">Cancelar</button>
      </div>
    `);

    const b = document.getElementById("e-vi-brand");
    const m = document.getElementById("e-vi-model");
    const e = document.getElementById("e-vi-engine");
    const dt = document.getElementById("e-vi-date");
    const pr = document.getElementById("e-vi-price");
    const save = document.getElementById("e-vi-save");
    const cancel = document.getElementById("e-vi-cancel");

    cancel.onclick = invCloseModal;
    save.onclick = async () => {
      try {
        await invAPI.updateVehicleIntake(vi._id, {
          brand: (b.value || "").toUpperCase().trim(),
          model: (m.value || "").toUpperCase().trim(),
          engine: (e.value || "").toUpperCase().trim(),
          intakeDate: dt.value || undefined,
          entryPrice: parseFloat(pr.value || "0"),
        });
        invCloseModal();
        await refreshIntakes();
        await refreshItems(state.lastItemsParams);
      } catch (err) {
        alert("Error: " + err.message);
      }
    };
<<<<<<< HEAD
  });
  list.querySelectorAll("[data-qr-btn]").forEach(btn => {
    btn.onclick = () => {
      const it = state.items.find(x => x._id === btn.dataset.qrBtn);
      if (it) openQrModal(it);
    };
  });
  list.querySelectorAll("img[data-qr-img]").forEach(img => {
    setImgWithQrBlob(img, img.dataset.qrImg, 160);
  });
  list.querySelectorAll("img[data-thumb]").forEach(img => {
    const it = state.items.find(x => x._id === img.dataset.thumb);
    setThumbImage(img, it);
  });
  list.querySelectorAll("input[type=checkbox][data-id]").forEach(cb => {
    cb.onchange = () => {
      const id = cb.dataset.id;
      if (cb.checked) state.selected.add(id); else state.selected.delete(id);
      updateStickerToolbarCount();
    };
  });

  updateStickerToolbarCount();
}

function renderItemCard(it) {
  // primer media que sea imagen
  const hasImage = Array.isArray(it.images) && it.images.find(m => /^image\//i.test(m?.mimetype || ""));
  const thumb = hasImage ? `<img class="item-thumb" data-thumb="${it._id}" alt="thumb ${it.sku || ""}" />` :
    `<div class="item-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px;color:#94a3b8;">📦</div>`;

  const loc = it.storageLocation ? `<div class="it-line"><span>Almacén: ${it.storageLocation}</span></div>` : "";
  const vt = it.vehicleTarget ? `<div class="it-line"><span>${it.vehicleTarget}</span></div>` : "";

  return `
  <div class="list-item">
    <!-- Columna 1: galería y selección -->
    <div>
      <label class="sticker-check">
        <input type="checkbox" data-id="${it._id}" ${state.selected.has(it._id) ? "checked" : ""}/>
        Sticker
      </label>
      <div class="it-gallery" style="margin-top:8px;">
        ${thumb}
      </div>
    </div>

    <!-- Columna 2: texto -->
    <div class="it-text">
      <div class="it-title"><b>${it.sku}</b> — ${it.name}</div>
      ${vt}
      ${loc}
    </div>

    <!-- Columna 3: QR + precio + acciones -->
    <div class="it-qr">
      <img data-qr-img="${it._id}" alt="QR ${it.sku || it._id}" />
      <div class="it-qr-actions">
        <button class="secondary" data-qr-btn="${it._id}">QR</button>
        <button data-edit="${it._id}">Editar</button>
        <button class="secondary" data-del="${it._id}">Eliminar</button>
      </div>
      <div class="price" style="margin-top:6px;">$${money(it.salePrice)}</div>
    </div>
  </div>`;
}

/* =================== Mini helpers de imagen/QR =================== */
function setThumbImage(imgEl, item) {
  if (!imgEl || !item) return;
  try {
    const media = (item.images || []).find(m => /^image\//i.test(m?.mimetype || ""));
    if (media?.url) {
      imgEl.src = media.url;
    } else {
      imgEl.remove(); // no hay imagen válida
    }
  } catch {
    imgEl.remove();
  }
}

async function setImgWithQrBlob(imgEl, itemId, size = 220) {
  if (!imgEl || !itemId) return;
  try {
    const res = await fetch(invAPI.qrPngUrl(itemId, size), { headers: authHeader() });
    if (!res.ok) throw new Error("QR fetch error");
    const blob = await res.blob();
    const dataUrl = await blobToDataURL(blob);
    imgEl.src = dataUrl;
  } catch {
    // coloca un cuadro placeholder si falla
    imgEl.alt = "QR no disponible";
    imgEl.style.background = "#fff";
  }
}
function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

/* =================== Modal de QR grande =================== */
function buildQrPayload(companyId, item) {
  const payload = { t: "ITEM", c: String(companyId || ""), i: String(item?._id || ""), s: item?.sku || null };
  return JSON.stringify(payload);
}
function openQrModal(item) {
  openModal(`
    <h3>QR del ítem</h3>
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:8px;">
      <img id="qr-big" alt="QR ${item.sku || item._id}" style="width:300px;height:300px;image-rendering:pixelated;background:#fff;padding:8px;border-radius:10px;border:1px solid #1f2937" />
      <div class="row" style="gap:8px;">
        <button class="secondary" id="qr-download">Descargar PNG</button>
        <button class="secondary" id="qr-copy">Copiar payload</button>
      </div>
      <code style="font-size:12px;opacity:.8;word-break:break-all;" id="qr-payload"></code>
    </div>
  `);

  const img = $("qr-big");
  setImgWithQrBlob(img, item._id, 300);

  const payload = buildQrPayload(API.companyId?.get?.() || "", item);
  $("qr-payload").textContent = payload;

  const btnCopy = $("qr-copy");
  btnCopy.onclick = async () => {
    try { await navigator.clipboard.writeText(payload); btnCopy.textContent = "¡Copiado!"; setTimeout(() => (btnCopy.textContent = "Copiar payload"), 1200); }
    catch { alert("No se pudo copiar"); }
  };

  const btnDl = $("qr-download");
  btnDl.onclick = async () => {
    try {
      const url = invAPI.qrPngUrl(item._id, 600);
      const res = await fetch(url, { headers: authHeader() });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `QR_${item.sku || item._id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch { alert("No se pudo descargar"); }
  };
}

/* =================== Toolbar de stickers =================== */
function renderStickerToolbar() {
  const bar = $("stickerBar");
  if (!bar) return;
  bar.innerHTML = `
    <button id="stc-all" class="secondary">Seleccionar todo</button>
    <button id="stc-none" class="secondary">Limpiar</button>
    <span id="stc-count" class="muted" style="margin-left:8px;">0 seleccionados</span>
    <span style="flex:1 1 auto;"></span>
    <button id="stc-pdf">Generar stickers (CARTA 3×6)</button>
  `;
  $("stc-all").onclick = () => {
    state.items.forEach(it => state.selected.add(it._id));
    document.querySelectorAll("#itemsList input[type=checkbox][data-id]").forEach(cb => (cb.checked = true));
    updateStickerToolbarCount();
  };
  $("stc-none").onclick = () => {
    state.selected.clear();
    document.querySelectorAll("#itemsList input[type=checkbox][data-id]").forEach(cb => (cb.checked = false));
    updateStickerToolbarCount();
  };
  $("stc-pdf").onclick = () => buildStickersPdf();
}
function updateStickerToolbarCount() {
  const el = $("stc-count");
  if (el) el.textContent = `${state.selected.size} seleccionados`;
}

/* =================== Editar ítem (modal) =================== */
function openEditItem(it) {
  const optionsIntakes = [
    `<option value="">(sin entrada)</option>`,
    ...(state.intakes || []).map(
      v => `<option value="${v._id}" ${String(it.vehicleIntakeId || "") === String(v._id) ? "selected" : ""}>
        ${makeIntakeLabel(v)} - ${new Date(v.intakeDate || v.createdAt).toLocaleDateString()}
      </option>`
    )
  ].join("");

  openModal(`
  <div class="card">
    <h3>Editar Ítem</h3>

    <label>SKU</label>
    <input id="e-sku" value="${it.sku || ""}" />

    <label>Nombre</label>
    <input id="e-name" value="${it.name || ""}" />

    <label>Nombre interno (opcional)</label>
    <input id="e-internalName" value="${it.internalName || ""}" />

    <label>Lugar en el almacén (opcional)</label>
    <input id="e-storageLocation" value="${it.storageLocation || ""}" />

    <label>Vehículo destino</label>
    <input id="e-vehicleTarget" value="${it.vehicleTarget || "VITRINAS"}" />

    <label>Entrada de vehículo</label>
    <select id="e-intake">${optionsIntakes}</select>

    <label>Precio entrada (opcional)</label>
    <input id="e-entryPrice" type="number" min="0" step="0.01" value="${it.entryPrice ?? ""}" />

    <label>Precio venta</label>
    <input id="e-salePrice" type="number" min="0" step="0.01" value="${it.salePrice ?? 0}" />

    <label>Original</label>
    <select id="e-original">
      <option value="false" ${!it.original ? "selected" : ""}>No</option>
      <option value="true" ${it.original ? "selected" : ""}>Sí</option>
    </select>

    <label>Stock</label>
    <input id="e-stock" type="number" min="0" step="1" value="${it.stock ?? 0}" />

    <div class="row" style="margin-top:10px;">
      <button id="e-save">Guardar</button>
      <button class="secondary" id="e-cancel">Cancelar</button>
    </div>
  </div>`);

  const sku = $("e-sku"); upper(sku);
  const name = $("e-name"); upper(name);
  const internalName = $("e-internalName"); if (internalName) upper(internalName);
  const storageLocation = $("e-storageLocation"); if (storageLocation) upper(storageLocation);
  const vehicleTarget = $("e-vehicleTarget"); upper(vehicleTarget);
  const intake = $("e-intake");
  const entryPrice = $("e-entryPrice");
  const sale = $("e-salePrice");
  const original = $("e-original");
  const stock = $("e-stock");
  const save = $("e-save");
  const cancel = $("e-cancel");

  save.onclick = async () => {
    const body = {
      sku: sku.value.trim(),
      name: name.value.trim(),
      internalName: internalName?.value ? internalName.value.trim() : undefined,
      storageLocation: storageLocation?.value ? storageLocation.value.trim() : undefined,
      vehicleTarget: vehicleTarget.value.trim(),
      vehicleIntakeId: intake.value || undefined,
      entryPrice: entryPrice.value ? parseFloat(entryPrice.value) : undefined,
      salePrice: parseFloat(sale.value || "0"),
      original: original.value === "true",
      stock: parseInt(stock.value || "0", 10)
    };
    await invAPI.updateItem(it._id, body);
    closeModal();
    await refreshItems(state.lastParams);
  };

  cancel.onclick = () => closeModal();
}

/* =================== PDF de stickers (CARTA 3×6) =================== */
async function buildStickersPdf() {
  if (state.selected.size === 0) {
    alert("Selecciona al menos un ítem para generar stickers.");
    return;
  }

  const ids = Array.from(state.selected);
  const sizePx = 260;
  const dataUrls = await Promise.all(ids.map(id => fetchQrPngAsDataUrl(id, sizePx)));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "in", format: "letter", compress: true });

  const pageW = 8.5, pageH = 11;
  const margin = 0.5;
  const gridW = pageW - margin * 2;
  const gridH = pageH - margin * 2;
  const cols = 3, rows = 6;
  const cellW = gridW / cols;
  const cellH = gridH / rows;
=======
  }

  // ====== Editar: ÍTEM ======
  function openEditItem(it) {
    const optionsIntakes = [
      `<option value="">(sin entrada)</option>`,
      ...state.intakes.map(v =>
        `<option value="${v._id}" ${String(it.vehicleIntakeId || "") === String(v._id) ? "selected" : ""}>
          ${v.brand} ${v.model} ${v.engine} - ${new Date(v.intakeDate).toLocaleDateString()}
        </option>`
      )
    ].join("");

    const images = Array.isArray(it.images) ? [...it.images] : [];

    invOpenModal(`
      <h3>Editar ítem</h3>
>>>>>>> parent of 3e8e131 (inventory)

      <label>SKU</label>
      <input id="e-it-sku" value="${it.sku || ""}" />

      <label>Nombre</label>
      <input id="e-it-name" value="${it.name || ""}" />

      <label>Entrada de vehículo</label>
      <select id="e-it-intake">${optionsIntakes}</select>

<<<<<<< HEAD
        const pad = 0.1;
        const qrSize = Math.min(cellH - pad * 2, 1.45);
        const qrX = x + pad;
        const qrY = y + (cellH - qrSize) / 2;
=======
      <label>Vehículo destino</label>
      <input id="e-it-target" value="${it.vehicleTarget || ""}" />
>>>>>>> parent of 3e8e131 (inventory)

      <label>Precio entrada (opcional)</label>
      <input id="e-it-entry" type="number" step="0.01" placeholder="vacío = AUTO si hay entrada" value="${it.entryPrice ?? ""}" />

<<<<<<< HEAD
        const skuBoxX = qrX + qrSize + 0.1;
        const skuBoxY = y + 0.25;
        const skuBoxW = x + cellW - skuBoxX - pad;
        const skuBoxH = cellH - 0.5;

        doc.setFillColor(17, 24, 39);
        doc.rect(skuBoxX, skuBoxY, skuBoxW, skuBoxH, "F");

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        const skuText = String(it?.sku || "").toUpperCase();
        doc.text(skuText, skuBoxX + skuBoxW / 2, skuBoxY + skuBoxH / 2, { align: "center", baseline: "middle" });

        if (it?.name) {
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          const nameText = String(it.name).slice(0, 32);
          doc.text(nameText, skuBoxX + skuBoxW / 2, skuBoxY + skuBoxH - 0.15, { align: "center", baseline: "bottom" });
        }
=======
      <label>Precio venta</label>
      <input id="e-it-sale" type="number" step="0.01" min="0" value="${Number(it.salePrice || 0)}" />

      <label>Original</label>
      <select id="e-it-original">
        <option value="false" ${!it.original ? "selected" : ""}>No</option>
        <option value="true"  ${it.original ? "selected" : ""}>Sí</option>
      </select>

      <label>Stock</label>
      <input id="e-it-stock" type="number" step="1" min="0" value="${parseInt(it.stock || 0, 10)}" />

      <label>Imágenes/Videos</label>
      <div id="e-it-thumbs" class="thumbs"></div>
      <input id="e-it-files" type="file" multiple />

      <div class="viewer" id="e-it-viewer" style="display:none"></div>

      <div style="margin-top:10px; display:flex; gap:8px;">
        <button id="e-it-save">Guardar cambios</button>
        <button id="e-it-cancel" class="secondary">Cancelar</button>
      </div>
    `);

    const sku = document.getElementById("e-it-sku");
    const name = document.getElementById("e-it-name");
    const intake = document.getElementById("e-it-intake");
    const target = document.getElementById("e-it-target");
    const entry = document.getElementById("e-it-entry");
    const sale = document.getElementById("e-it-sale");
    const original = document.getElementById("e-it-original");
    const stock = document.getElementById("e-it-stock");
    const files = document.getElementById("e-it-files");
    const thumbs = document.getElementById("e-it-thumbs");
    const viewer = document.getElementById("e-it-viewer");
    const save = document.getElementById("e-it-save");
    const cancel = document.getElementById("e-it-cancel");

    function renderThumbs() {
      thumbs.innerHTML = "";
      images.forEach((m, idx) => {
        const d = document.createElement("div");
        d.className = "thumb";
        d.innerHTML = `
          ${m.mimetype?.startsWith("video/")
            ? `<video src="${m.url}" muted></video>`
            : `<img src="${m.url}" alt="thumb" />`}
          <button class="del" title="Quitar" data-del="${idx}">×</button>
        `;
        d.onclick = (ev) => {
          const btn = ev.target.closest("button.del");
          if (btn) return;
          viewer.style.display = "block";
          viewer.innerHTML = m.mimetype?.startsWith("video/")
            ? `<video controls src="${m.url}"></video>`
            : `<img src="${m.url}" alt="media" />`;
        };
        d.querySelector("button.del").onclick = () => {
          images.splice(idx, 1);
          renderThumbs();
          if (viewer.style.display !== "none") viewer.innerHTML = "";
        };
        thumbs.appendChild(d);
      });
    }
    renderThumbs();

    intake.addEventListener("change", () => {
      const id = intake.value;
      if (!id) { target.readOnly = false; return; }
      const vi = state.intakes.find(v => v._id === id);
      if (vi) {
        target.value = makeIntakeLabel(vi);
        target.readOnly = true;
      } else {
        target.readOnly = false;
>>>>>>> parent of 3e8e131 (inventory)
      }
    });

    files.addEventListener("change", async () => {
      if (!files.files?.length) return;
      try {
        const up = await API.mediaUpload(files.files);
        const list = (up && up.files) ? up.files : [];
        images.push(...list);
        files.value = "";
        renderThumbs();
      } catch (e) {
        alert("No se pudieron subir los archivos: " + e.message);
      }
    });

    cancel.onclick = invCloseModal;
    save.onclick = async () => {
      try {
        const body = {
          sku: (sku.value || "").trim().toUpperCase(),
          name: (name.value || "").trim().toUpperCase(),
          vehicleIntakeId: intake.value || null,
          vehicleTarget: (target.value || "VITRINAS").trim().toUpperCase(),
          entryPrice: entry.value === "" ? "" : parseFloat(entry.value),
          salePrice: parseFloat(sale.value || "0"),
          original: original.value === "true",
          stock: parseInt(stock.value || "0", 10),
          images
        };
        await invAPI.updateItem(it._id, body);
        invCloseModal();
        await refreshIntakes();
        await refreshItems(state.lastItemsParams);
      } catch (err) {
        alert("Error: " + err.message);
      }
    };
  }

  // ====== PDF de stickers (Carta, 6×4 cm, 18 por página) ======
  async function generateStickersFromSelection() {
    if (!state.selected.size) return;
    const ids = Array.from(state.selected);
    const items = ids
      .map(id => state.items.find(it => String(it._id) === String(id)))
      .filter(Boolean);

    if (!items.length) return;

    const jsPDF = await ensureJsPDF();
    const doc = new jsPDF({ unit: "cm", format: "letter" });

    // Parámetros de layout
    const margin = 0.5;         // cm
    const w = 6, h = 4;         // sticker 6 x 4 cm
    const gapX = 1.0;           // cm
    const gapY = 0.5;           // cm
    const cols = 3, rows = 6;   // 3 x 6 = 18 por página
    const perPage = cols * rows;

    // Pre-descarga de QRs como dataURL para mayor nitidez en PDF
    const payloads = await Promise.all(items.map(async it => {
      const blob = await fetchQrBlob(it._id, 600); // alta resolución
      const dataUrl = await blobToDataURL(blob);
      return { it, dataUrl };
    }));

    for (let i = 0; i < Math.max(items.length, 1); i++) {
      const pageIndex = Math.floor(i / perPage);
      const idxInPage = i % perPage;
      if (i > 0 && idxInPage === 0) doc.addPage();

      const col = idxInPage % cols;
      const row = Math.floor(idxInPage / cols);

      const x = margin + col * (w + gapX);
      const y = margin + row * (h + gapY);

      // Marco del sticker (opcional, muy sutil)
      doc.setDrawColor(230);
      doc.roundedRect(x, y, w, h, 0.15, 0.15);

      const { it, dataUrl } = payloads[i] || { it: {}, dataUrl: "" };

      // Layout interno: QR a la izquierda, SKU centrado a la derecha
      const pad = 0.25;           // acolchado interno
      const qrSize = 3.1;         // tamaño del QR
      const qrX = x + pad;
      const qrY = y + (h - qrSize) / 2;

      if (dataUrl) doc.addImage(dataUrl, "PNG", qrX, qrY, qrSize, qrSize);

      // Texto SKU (blanco, sólido sobre fondo oscuro)
      doc.setTextColor(255, 255, 255);
      // para asegurar legibilidad, dibujamos un rectángulo oscuro detrás del texto
      const skuBoxX = qrX + qrSize + 0.25;
      const skuBoxY = y + 0.5;
      const skuBoxW = x + w - skuBoxX - pad;
      const skuBoxH = h - 1.0;
      doc.setFillColor(19, 27, 41);
      doc.roundedRect(skuBoxX, skuBoxY, skuBoxW, skuBoxH, 0.1, 0.1, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text((it?.sku || "").toUpperCase(), skuBoxX + skuBoxW / 2, skuBoxY + skuBoxH / 2, {
        align: "center", baseline: "middle"
      });
    }

    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    doc.save(`stickers_${ts}.pdf`);
  }

  // ====== Init ======
  refreshIntakes();
  refreshItems({});
}
<<<<<<< HEAD
async function fetchQrPngAsDataUrl(itemId, size) {
  try {
    const res = await fetch(invAPI.qrPngUrl(itemId, size), { headers: authHeader() });
    const blob = await res.blob();
    return await blobToDataURL(blob);
  } catch { return ""; }
}

/* =================== Auto init =================== */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("item-form");
  if (form) initInventory();
});
=======
>>>>>>> parent of 3e8e131 (inventory)
