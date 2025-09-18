// Frontend/assets/js/inventory.js
import { API } from "./api.js";
import { upper } from "./utils.js";

const state = { intakes: [], lastItemsParams: {} };

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
function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") qs.set(k, v);
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const invAPI = {
  listVehicleIntakes: async () => {
    const r = await request("/api/v1/inventory/vehicle-intakes");
    const data = Array.isArray(r) ? r : (r.items || r.data || []);
    return { data };
  },
  saveVehicleIntake: (body) =>
    request("/api/v1/inventory/vehicle-intakes", { method: "POST", json: body }),
  updateVehicleIntake: (id, body) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}`, { method: "PUT", json: body }),
  deleteVehicleIntake: (id) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}`, { method: "DELETE" }),
  recalcVehicleIntake: (id) =>
    request(`/api/v1/inventory/vehicle-intakes/${id}/recalc`, { method: "POST" }),

  listItems: async (params = {}) => {
    const r = await request(`/api/v1/inventory/items${toQuery(params)}`);
    const data = Array.isArray(r) ? r : (r.items || r.data || []);
    return { data };
  },
  saveItem: (body) =>
    request("/api/v1/inventory/items", { method: "POST", json: body }),
  updateItem: (id, body) =>
    request(`/api/v1/inventory/items/${id}`, { method: "PUT", json: body }),
  deleteItem: (id) =>
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

// ========= NUEVO: helpers para QR (con fetch + Bearer) =========
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

    // Reservamos un hueco para el QR como otra miniatura (se cargará con fetch)
    const qrCell = `<img id="qr-${it._id}" class="item-thumb qr-thumb" alt="QR ${it.sku || it._id}" loading="lazy" />`;

    return `<div class="item-media">${cells}${qrCell}</div>`;
  }

  async function refreshItems(params = {}) {
    state.lastItemsParams = params;
    const { data } = await invAPI.listItems(params);
    itemsList.innerHTML = "";
    (data || []).forEach((it) => {
      const div = document.createElement("div");
      div.className = "note";

      const unit = it.entryPrice ?? 0;
      const total = unit * Math.max(0, it.stock || 0);
      const entradaTxt = `${fmtMoney(total)}${it.entryPriceIsAuto ? " (prorrateado)" : ""} - unit: ${fmtMoney(unit)}`;

      const thumbs = buildThumbGrid(it);

      const companyId = API.companyId?.get?.() || "";

      div.innerHTML = `
        <div>
          <div><b>${it.sku}</b></div>
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

      // Cargar QR en la miniatura reservada
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
          refreshItems(state.lastItemsParams);
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

    await refreshItems({});
  };

  // ====== Búsqueda / Init (UNIFICADO) ======
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

      <label>SKU</label>
      <input id="e-it-sku" value="${it.sku || ""}" />

      <label>Nombre</label>
      <input id="e-it-name" value="${it.name || ""}" />

      <label>Entrada de vehículo</label>
      <select id="e-it-intake">${optionsIntakes}</select>

      <label>Vehículo destino</label>
      <input id="e-it-target" value="${it.vehicleTarget || ""}" />

      <label>Precio entrada (opcional)</label>
      <input id="e-it-entry" type="number" step="0.01" placeholder="vacío = AUTO si hay entrada" value="${it.entryPrice ?? ""}" />

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

  // ====== Init ======
  refreshIntakes();
  refreshItems({});
}
