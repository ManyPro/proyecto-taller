// Frontend/assets/js/inventory.js
import { API } from "./api.js";
import { upper } from "./utils.js";

/* =================== HTTP helper =================== */
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
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(body?.error || (typeof body === "string" ? body : res.statusText));
  return body;
}

const qs = (obj = {}) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};

/* =================== API =================== */
const invAPI = {
  listVehicleIntakes: async () => {
    const r = await request("/api/v1/inventory/vehicle-intakes");
    return r?.data || [];
  },
  listItems: async (params = {}) => {
    const r = await request(`/api/v1/inventory/items${qs(params)}`);
    return r?.data || [];
  },
  saveItem: (body) => request("/api/v1/inventory/items", { method: "POST", json: body }),
  updateItem: (id, body) => request(`/api/v1/inventory/items/${id}`, { method: "PUT", json: body }),
  deleteItem: (id) => request(`/api/v1/inventory/items/${id}`, { method: "DELETE" })
};

/* =================== Estado/UI refs =================== */
const state = {
  intakes: [],
  items: [],
  lastParams: {},
  selected: new Set()
};

const $ = (id) => document.getElementById(id);

const makeIntakeLabel = (v) =>
  `${(v?.brand || "").trim()} ${(v?.model || "").trim()} ${(v?.engine || "").trim()}`
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  try { return v.toLocaleString(); } catch { return String(v); }
};

/* =================== Inicializador =================== */
export async function initInventory() {
  // Campos del formulario "Nuevo Ítem"
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

  // Filtros del listado
  const qName = $("q-name");
  const qSku = $("q-sku");
  const qIntake = $("q-intakeId");
  const qApply = $("q-apply");
  const qClear = $("q-clear");

  // contenedores
  const itemsList = $("itemsList");
  const stickerBar = $("stickerBar");

  /* ---- cargar entradas ---- */
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

  /* ---- guardar nuevo ítem ---- */
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

  /* ---- filtros ---- */
  qApply.onclick = () => refreshItems({
    name: qName.value.trim(),     // back buscará en name e internalName
    sku: qSku.value.trim(),
    vehicleIntakeId: qIntake.value || undefined
  });
  qClear.onclick = () => {
    qName.value = "";
    qSku.value = "";
    qIntake.value = "";
    refreshItems({});
  };

  // primera carga
  await refreshItems({});
  renderStickerToolbar(); // crea barra (botón de PDF, select todo, contador)
}

/* =================== Listado / selección =================== */
async function refreshItems(params = {}) {
  state.lastParams = params;
  state.selected.clear();
  const list = $("itemsList");
  list.innerHTML = `<div class="muted">Cargando...</div>`;

  const items = await invAPI.listItems(params);
  state.items = items;

  list.innerHTML = items.map(renderItemCard).join("") || `<div class="muted">Sin resultados</div>`;

  // binds
  list.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => openEditItem(state.items.find(x => x._id === btn.dataset.edit));
  });
  list.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("¿Eliminar ítem?")) return;
      await invAPI.deleteItem(btn.dataset.del);
      await refreshItems(state.lastParams);
    };
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
  const loc = it.storageLocation ? `<div class="muted" style="margin-top:4px;">Almacén: ${it.storageLocation}</div>` : "";
  return `
  <div class="list-item">
    <div class="li-left">
      <input type="checkbox" data-id="${it._id}" ${state.selected.has(it._id) ? "checked" : ""} />
    </div>
    <div class="li-main">
      <div><b>${it.sku}</b> — ${it.name}</div>
      ${loc}
      <div class="muted">${it.vehicleTarget || "VITRINAS"}</div>
    </div>
    <div class="li-right">
      <div class="price">$${money(it.salePrice)}</div>
      <button data-edit="${it._id}">Editar</button>
      <button class="secondary" data-del="${it._id}">Eliminar</button>
    </div>
  </div>`;
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
    document.querySelectorAll("#itemsList input[type=checkbox][data-id]").forEach(cb => cb.checked = true);
    updateStickerToolbarCount();
  };
  $("stc-none").onclick = () => {
    state.selected.clear();
    document.querySelectorAll("#itemsList input[type=checkbox][data-id]").forEach(cb => cb.checked = false);
    updateStickerToolbarCount();
  };
  $("stc-pdf").onclick = () => buildStickersPdf();
}

function updateStickerToolbarCount() {
  const el = $("stc-count");
  if (el) el.textContent = `${state.selected.size} seleccionados`;
}

/* =================== Modal editar =================== */
function openEditItem(it) {
  const optionsIntakes = [
    `<option value="">(sin entrada)</option>`,
    ...(state.intakes || []).map(
      v => `<option value="${v._id}" ${String(it.vehicleIntakeId || "") === String(v._id) ? "selected" : ""}>
        ${makeIntakeLabel(v)} - ${new Date(v.intakeDate || v.createdAt).toLocaleDateString()}
      </option>`
    )
  ].join("");

  const html = `
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
  </div>`;

  const modal = $("modal");
  const body = $("modalBody");
  body.innerHTML = html;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");

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

function closeModal() {
  const modal = $("modal");
  const body = $("modalBody");
  body.innerHTML = "";
  modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

/* =================== PDF de stickers (CARTA 3×6) =================== */
async function buildStickersPdf() {
  if (state.selected.size === 0) {
    alert("Selecciona al menos un ítem para generar stickers.");
    return;
  }

  // Preparar imágenes de QR
  const ids = Array.from(state.selected);
  const sizePx = 260; // tamaño del PNG de QR pedido al backend
  const dataUrls = await Promise.all(ids.map(id => fetchQrPngAsDataUrl(id, sizePx)));

  // Crear documento en pulgadas (letter)
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "in", format: "letter", compress: true });

  // Márgenes y grilla
  const pageW = 8.5, pageH = 11;
  const margin = 0.5; // 0.5" por lado
  const gridW = pageW - margin * 2;
  const gridH = pageH - margin * 2;
  const cols = 3, rows = 6;
  const cellW = gridW / cols;      // ≈ 2.5"
  const cellH = gridH / rows;      // ≈ 1.666"

  let pageIndex = 0;
  let i = 0;

  while (i < ids.length) {
    if (pageIndex > 0) doc.addPage();

    for (let r = 0; r < rows && i < ids.length; r++) {
      for (let c = 0; c < cols && i < ids.length; c++, i++) {
        const x = margin + c * cellW;
        const y = margin + r * cellH;
        const it = state.items.find(o => o._id === ids[i]) || {};
        const dataUrl = dataUrls[i];

        // Layout: QR a la izquierda, SKU con caja oscura a la derecha
        const pad = 0.1;
        const qrSize = Math.min(cellH - pad * 2, 1.45); // ~1.45" para caber cómodo
        const qrX = x + pad;
        const qrY = y + (cellH - qrSize) / 2;

        if (dataUrl) doc.addImage(dataUrl, "PNG", qrX, qrY, qrSize, qrSize);

        // caja oscura detrás del SKU
        const skuBoxX = qrX + qrSize + 0.1;
        const skuBoxY = y + 0.25;
        const skuBoxW = x + cellW - skuBoxX - pad;
        const skuBoxH = cellH - 0.5;

        // fondo oscuro
        doc.setFillColor(17, 24, 39); // gris muy oscuro
        doc.rect(skuBoxX, skuBoxY, skuBoxW, skuBoxH, "F");

        // SKU en blanco centrado
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        const skuText = String(it?.sku || "").toUpperCase();
        doc.text(skuText, skuBoxX + skuBoxW / 2, skuBoxY + skuBoxH / 2, { align: "center", baseline: "middle" });

        // línea inferior (opcional: nombre)
        if (it?.name) {
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          const nameText = String(it.name).slice(0, 32);
          doc.text(nameText, skuBoxX + skuBoxW / 2, skuBoxY + skuBoxH - 0.15, { align: "center", baseline: "bottom" });
        }
      }
    }

    pageIndex++;
  }

  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  doc.save(`stickers_${ts}.pdf`);
}

async function fetchQrPngAsDataUrl(itemId, size) {
  try {
    const res = await fetch(`${apiBase}/api/v1/inventory/items/${itemId}/qr.png?size=${size}`, { headers: authHeader() });
    const blob = await res.blob();
    return await blobToDataURL(blob);
  } catch {
    return "";
  }
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

/* =================== Auto init =================== */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("item-form");
  if (form) initInventory();
});
