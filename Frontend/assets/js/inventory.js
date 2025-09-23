// Frontend/assets/js/inventory.js
import { API } from "./api.js";
import { upper } from "./utils.js";

/* =================== helpers HTTP =================== */
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
const toQuery = (obj = {}) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};

/* =================== API =================== */
const invAPI = {
  // Entradas de vehículo
  listVehicleIntakes: async () => {
    const r = await request("/api/v1/inventory/vehicle-intakes");
    return Array.isArray(r) ? r : (r.data || r.items || []);
  },
  saveVehicleIntake: (body) =>
    request("/api/v1/inventory/vehicle-intakes", { method: "POST", json: body }),
  updateVehicleIntake: (id, body) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}`, { method: "PUT", json: body }),
  deleteVehicleIntake: (id) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}`, { method: "DELETE" }),
  recalcVehicleIntake: (id) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}/recalc`, { method: "POST" }),

  // Ítems
  listItems: async (params = {}) => {
    const r = await request(`/api/v1/inventory/items${toQuery(params)}`);
    return Array.isArray(r) ? r : (r.data || r.items || []);
  },
  saveItem: (body) =>
    request("/api/v1/inventory/items", { method: "POST", json: body }),
  updateItem: (id, body) =>
    request(`/api/v1/inventory/items/${id}`, { method: "PUT", json: body }),
  deleteItem: (id) =>
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

    // -------- primera carga --------
    await refreshItems({});
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

        const pad = 0.1;
        const qrSize = Math.min(cellH - pad * 2, 1.45);
        const qrX = x + pad;
        const qrY = y + (cellH - qrSize) / 2;

        if (dataUrl) doc.addImage(dataUrl, "PNG", qrX, qrY, qrSize, qrSize);

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
      }
    }

    pageIndex++;
  }

  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  doc.save(`stickers_${ts}.pdf`);
}
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
