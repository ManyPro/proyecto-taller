// Frontend/assets/inventory.js
import { API } from "./api.js";
import { upper } from "./utils.js";
import { bindStickersButton, downloadStickersPdf } from './pdf.js';

// ---- State ----
const state = {
  intakes: [],
  lastItemsParams: {},
  items: [],
  selected: new Set(),
  itemCache: new Map(),
};

// ---- Helpers ----
function makeIntakeLabel(v) {
  if (!v) return "GENERAL";
  const kind = (v.intakeKind || "vehicle").toLowerCase();

  if (kind === "purchase") {
    const place = (v.purchasePlace || "").trim();
    const d = v.intakeDate ? new Date(v.intakeDate) : null;
    const ymd = d && isFinite(d) ? d.toISOString().slice(0, 10) : "";
    return `COMPRA: ${place}${ymd ? " " + ymd : ""}`.trim().toUpperCase();
  }

  return `${(v?.brand || "").trim()} ${(v?.model || "").trim()} ${(v?.engine || "").trim()}`
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase() || "GENERAL";
}

const fmtMoney = (n) => {
  const v = Math.round((n || 0) * 100) / 100;
  try {
    return v.toLocaleString();
  } catch {
    return String(v);
  }
};

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

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
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

// ---- API Facade ----
const invAPI = {
  // Vehicle Intakes
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

  // Items
  listItems: async (params = {}) => {
    const r = await request(`/api/v1/inventory/items${toQuery(params)}`);
    const data = Array.isArray(r) ? r : (r.items || r.data || []);
    const meta = r?.meta || {};
    return { data, meta };
  },
  saveItem: (body) => request("/api/v1/inventory/items", { method: "POST", json: body }),
  updateItem: (id, body) => request(`/api/v1/inventory/items/${id}`, { method: "PUT", json: body }),
  deleteItem: (id) => request(`/api/v1/inventory/items/${id}`, { method: "DELETE" }),

  mediaUpload: (files) => API.mediaUpload(files),
};

// ---- Modal helpers ----
function invOpenModal(innerHTML) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");
  const close = document.getElementById("modalClose");
  if (!modal || !body || !close) return alert("No se encontró el modal en el DOM.");

  body.innerHTML = innerHTML;
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");

  // Zoom logic for modal image
  setTimeout(() => {
    const img = document.getElementById("modal-img");
    const zoomIn = document.getElementById("zoom-in");
    const zoomOut = document.getElementById("zoom-out");
    let scale = 2;
    if (img) {
      img.style.transform = `scale(${scale})`;
      if (zoomIn) zoomIn.onclick = () => {
        scale = Math.min(scale + 0.2, 5);
        img.style.transform = `scale(${scale})`;
      };
      if (zoomOut) zoomOut.onclick = () => {
        scale = Math.max(scale - 0.2, 1);
        img.style.transform = `scale(${scale})`;
      };
      img.onwheel = (e) => {
        e.preventDefault();
        if (e.deltaY < 0) {
          scale = Math.min(scale + 0.1, 5);
        } else {
          scale = Math.max(scale - 0.1, 1);
        }
        img.style.transform = `scale(${scale})`;
      };
        // Pinch-to-zoom para móviles
        let lastDist = null;
        img.addEventListener('touchstart', function(e) {
          if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastDist = Math.sqrt(dx*dx + dy*dy);
          }
        }, {passive:false});
        img.addEventListener('touchmove', function(e) {
          if (e.touches.length === 2 && lastDist) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const newDist = Math.sqrt(dx*dx + dy*dy);
            const delta = newDist - lastDist;
            if (Math.abs(delta) > 2) {
              scale += delta > 0 ? 0.04 : -0.04;
              scale = Math.max(1, Math.min(5, scale));
              img.style.transform = `scale(${scale})`;
              lastDist = newDist;
            }
          }
        }, {passive:false});
        img.addEventListener('touchend', function(e) {
          if (e.touches.length < 2) lastDist = null;
        });
    }
    const closeModalBtn = document.getElementById("close-modal");
    if (closeModalBtn) closeModalBtn.onclick = () => invCloseModal();
  }, 50);

  const closeAll = () => invCloseModal();
  close.onclick = closeAll;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeAll();
  }, { once: true });

  function escListener(e) {
    if (e.key === "Escape") closeAll();
  }
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
  invOpenModal(
    `<h3>Vista previa</h3>
     <div class="viewer">
       ${isVideo ? `<video controls src="${media.url}"></video>` : `<img src="${media.url}" alt="media" />`}
     </div>
     <div class="row"><button class="secondary" id="lb-close">Cerrar</button></div>`
  );
  document.getElementById("lb-close").onclick = invCloseModal;
}

// ---- QR helpers ----
function buildQrPath(itemId, size = 256) {
  return `/api/v1/inventory/items/${itemId}/qr.png?size=${size}`;
}

async function fetchQrBlob(itemId, size = 256) {
  const res = await fetch(`${apiBase}${buildQrPath(itemId, size)}`, { headers: { ...authHeader() } });
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
  invOpenModal(
    `<h3>QR del ítem</h3>
     <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:8px;">
       <img id="qr-big" alt="QR ${item.sku || item._id}"
            style="width:300px;height:300px;background:#fff;padding:8px;border-radius:10px;border:1px solid #1f2937"/>
       <div class="row" style="gap:8px;">
         <button class="secondary" id="qr-download">Descargar PNG</button>
         <button class="secondary" id="qr-copy">Copiar payload</button>
       </div>
       <code style="font-size:12px;opacity:.8;word-break:break-all;" id="qr-payload"></code>
     </div>`
  );

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

// Ejemplo: función que recoge items seleccionados en la UI
function getSelectedItems() {
  // Adaptar selector según tu HTML. Ejemplo: checkboxes con data-sku y data-name
  const rows = Array.from(document.querySelectorAll('input[name="select-item"]:checked'));
  return rows.map(ch => {
    const el = ch.closest('.item-row'); // o usar data- atributos directamente
    return {
      sku: ch.dataset.sku || el?.dataset?.sku || ch.getAttribute('data-sku'),
      name: ch.dataset.name || el?.dataset?.name || ch.getAttribute('data-name'),
      companyName: /* opcional: obtener nombre empresa si aplica */ undefined,
      companyLogo: /* opcional: URL/logo si lo tienes */ undefined
    };
  });
}

// Enlazar el botón (id="#btn-stickers"), pasar token si usas auth en el frontend
document.addEventListener('DOMContentLoaded', () => {
  try {
    bindStickersButton('#btn-stickers', getSelectedItems, {
      token: localStorage.getItem('token'), // o null
      filename: 'stickers.pdf',
      credentials: 'same-origin' // ajustar si usas cross-site
    });
  } catch (e) {
    // botón no encontrado => no hacer nada
    console.warn('No se enlazó botón de stickers:', e.message);
  }
});

// ---- Init ----
export function initInventory() {
  // Ingreso
  const viBrand = document.getElementById("vi-brand");  upper(viBrand);
  const viModel = document.getElementById("vi-model");  upper(viModel);
  const viEngine = document.getElementById("vi-engine"); upper(viEngine);
  const viDate = document.getElementById("vi-date");
  const viPrice = document.getElementById("vi-price");
  const viSave = document.getElementById("vi-save");

  const viKindVehicle = document.getElementById("vi-kind-vehicle");
  const viKindPurchase = document.getElementById("vi-kind-purchase");
  const viFormVehicle = document.getElementById("vi-form-vehicle");
  const viFormPurchase = document.getElementById("vi-form-purchase");
  const viPPlace = document.getElementById("vi-p-place"); if (viPPlace) upper(viPPlace);
  const viPDate = document.getElementById("vi-p-date");
  const viPPrice = document.getElementById("vi-p-price");

  function updateIntakeKindUI() {
    const isPurchase = viKindPurchase?.checked;
    viFormPurchase?.classList.toggle("hidden", !isPurchase);
    viFormVehicle?.classList.toggle("hidden", !!isPurchase);
  }
  [viKindVehicle, viKindPurchase].forEach((el) => el && el.addEventListener("change", updateIntakeKindUI));
  updateIntakeKindUI();

  const viList = document.getElementById("vi-list");

  // Item: crear
  const itSku = document.getElementById("it-sku"); upper(itSku);
  const itName = document.getElementById("it-name"); upper(itName);
  const itInternal = document.getElementById("it-internal"); if (itInternal) upper(itInternal);
  const itLocation = document.getElementById("it-location"); if (itLocation) upper(itLocation);
  const itVehicleTarget = document.getElementById("it-vehicleTarget"); upper(itVehicleTarget);
  const itVehicleIntakeId = document.getElementById("it-vehicleIntakeId");
  const itEntryPrice = document.getElementById("it-entryPrice");
  const itSalePrice = document.getElementById("it-salePrice");
  const itOriginal = document.getElementById("it-original");
  const itStock = document.getElementById("it-stock");
  const itFiles = document.getElementById("it-files");
  const itSave = document.getElementById("it-save");

  const itemsList = document.getElementById("itemsList");

  // Filtros
  const qName = document.getElementById("q-name");
  const qApply = document.getElementById("q-apply");
  const qSku = document.getElementById("q-sku");
  const qIntake = document.getElementById("q-intakeId");
  const qClear = document.getElementById("q-clear");

  // Mini-toolbar selección stickers
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
      <button class="chip-button" id="sel-page"><span class="chip-icon">☑</span> Seleccionar todos (página)</button>
      <button id="sel-stickers">Generar PDF stickers</button>
    `;
    selectionBar.querySelector("#sel-clear").onclick = () => {
      state.selected.clear();
      Array.from(itemsList.querySelectorAll('input[type="checkbox"][data-id]')).forEach((ch) => (ch.checked = false));
      updateSelectionBar();
    };
    selectionBar.querySelector("#sel-page").onclick = () => {
      Array.from(itemsList.querySelectorAll('input[type="checkbox"][data-id]')).forEach((ch) => {
        ch.checked = true;
        const id = String(ch.dataset.id);
        state.selected.add(id);
        const item = state.items.find((it) => String(it._id) === id);
        if (item) state.itemCache.set(id, item);
      });
      updateSelectionBar();
    };
    selectionBar.querySelector("#sel-stickers").onclick = generateStickersFromSelection;
  }

  function toggleSelected(itemOrId, checked) {
    const id = typeof itemOrId === 'object' ? itemOrId?._id : itemOrId;
    if (!id) return;
    const key = String(id);
    if (typeof itemOrId === 'object') {
      state.itemCache.set(key, itemOrId);
    }
    if (checked) state.selected.add(key);
    else state.selected.delete(key);
    updateSelectionBar();
  }

  // ---- Intakes ----
  async function refreshIntakes() {
    const { data } = await invAPI.listVehicleIntakes();
    state.intakes = data || [];

    itVehicleIntakeId.innerHTML =
      `<option value="">— Sin procedencia —</option>` +
      state.intakes
        .map((v) => `<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
        .join("");

    if (qIntake) {
      qIntake.innerHTML =
        `<option value="">Todas las entradas</option>` +
        state.intakes
          .map((v) => `<option value="${v._id}">${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}</option>`)
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
          <div><b>${(vi.brand || "") + (vi.model ? " " + vi.model : "")}</b></div>
          <div>${vi.engine || ""}</div>
        </div>
        <div class="content">
          <div>Fecha: ${new Date(vi.intakeDate).toLocaleDateString()}</div>
          <div>Precio entrada: <b>${fmtMoney(vi.entryPrice)}</b></div>
        </div>
        <div class="actions">
          <button class="secondary" data-edit="${vi._id}">Editar</button>
          <button class="secondary" data-recalc="${vi._id}">Recalcular</button>
          <button class="danger" data-del="${vi._id}">Eliminar</button>
        </div>`;

      row.querySelector("[data-edit]").onclick = () => openEditVehicleIntake(vi);
      row.querySelector("[data-del]").onclick = async () => {
        if (!confirm("¿Eliminar esta entrada? (debe no tener ítems vinculados)")) return;
        try {
          await invAPI.deleteVehicleIntake(vi._id);
          await refreshIntakes();
          await refreshItems({});
        } catch (e) {
          alert("No se pudo eliminar: " + e.message);
        }
      };
      row.querySelector("[data-recalc]").onclick = async () => {
        await invAPI.recalcVehicleIntake(vi._id);
        await refreshItems({});
        alert("Prorrateo recalculado.");
      };

      viList.appendChild(row);
    });
  }

  // ---- Items list ----
  function buildThumbGrid(it) {
    const media = Array.isArray(it.images) ? it.images : [];
    const cells = media
      .map((m, i) => {
        const isVid = (m.mimetype || "").startsWith("video/");
        const type = isVid ? "video" : "image";
        const src = m.url;
        return isVid
          ? `<video class="item-thumb" data-full="${src}" data-type="${type}" src="${src}" muted playsinline></video>`
          : `<img class="item-thumb" data-full="${src}" data-type="${type}" src="${src}" alt="${(it.name || "imagen") + " " + (i + 1)}" loading="lazy">`;
      })
      .join("");
    const qrCell = `<img id="qr-${it._id}" class="item-thumb qr-thumb" alt="QR ${it.sku || it._id}" loading="lazy"/>`;
    return `<div class="item-media">${cells}${qrCell}</div>`;
  }

  async function refreshItems(params = {}) {
    state.lastItemsParams = params;
    const { data, meta } = await invAPI.listItems(params);
    state.items = data || [];

    itemsList.innerHTML = "";
    state.items.forEach((it) => {
      const cacheKey = String(it._id);
      state.itemCache.set(cacheKey, it);
      const div = document.createElement("div");
      div.className = "note";

      const unit = it.entryPrice ?? 0;
      const total = unit * Math.max(0, it.stock || 0);
      const entradaTxt = `${fmtMoney(total)}${it.entryPriceIsAuto ? " (prorrateado)" : ""} - unit: ${fmtMoney(unit)}`;

      const thumbs = buildThumbGrid(it);
      const companyId = API.companyId?.get?.() || "";
      const internalLabel = it.internalName ? `Interno: ${it.internalName}` : "Interno: -";
      const locationLabel = it.location ? `Ubicacion: ${it.location}` : "Ubicacion: -";

      div.innerHTML = `
        <div class="inv-item-header">
          <label class="inv-checkbox">
            <input type="checkbox" data-id="${it._id}" ${state.selected.has(cacheKey) ? "checked" : ""} aria-label="Seleccionar item para stickers"/>
          </label>
          <div class="inv-item-info">
            <div class="inv-item-name">${it.name || ""}</div>
            <div class="inv-item-meta muted">
              <span>SKU: ${it.sku || ""}</span>
              <span>${internalLabel}</span>
              <span>${locationLabel}</span>
            </div>
          </div>
        </div>
        ${thumbs}
        <div class="content">
          <div>Destino: ${it.vehicleTarget}${it.vehicleIntakeId ? " (entrada)" : ""}</div>
          <div>Entrada: ${entradaTxt} | Venta: ${fmtMoney(it.salePrice)}</div>
          <div>Stock: <b>${it.stock}</b> | Original: ${it.original ? "SI" : "No"}</div>
        </div>
        <div class="actions">
          <button class="secondary" data-edit="${it._id}">Editar</button>
          <button class="danger" data-del="${it._id}">Eliminar</button>
          <button class="secondary" data-qr-dl="${it._id}">Descargar QR</button>
          <button class="secondary" data-qr="${it._id}">Expandir codigo QR</button>
        </div>`;

      div.querySelector(`input[type="checkbox"][data-id]`).onchange = (e) => toggleSelected(it, e.target.checked);

      const imgQr = div.querySelector(`#qr-${it._id}`);
      if (imgQr) setImgWithQrBlob(imgQr, it._id, 180);

      div.querySelector("[data-edit]").onclick = () => openEditItem(it);
      div.querySelector("[data-del]").onclick = async () => {
        if (!confirm("¿Eliminar ítem? (stock debe ser 0)")) return;
        try {
          await invAPI.deleteItem(it._id);
          state.selected.delete(cacheKey);
          state.itemCache.delete(cacheKey);
          refreshItems(state.lastItemsParams);
          updateSelectionBar();
        } catch (e) {
          alert("Error: " + e.message);
        }
      };
      div.querySelector("[data-qr]").onclick = () => openQrModal(it, companyId);
      div.querySelector("[data-qr-dl]").onclick = () => downloadQrPng(it._id, 720, `QR_${it.sku || it._id}.png`);

      div.addEventListener("click", (e) => {
        const el = e.target.closest(".item-thumb");
        if (!el || el.id === `qr-${it._id}`) return;
        const url = el.dataset.full || el.currentSrc || el.src;
        const type = el.dataset.type || "image";
        openLightbox({ url, mimetype: type === "video" ? "video/*" : "image/*" });
      });

      itemsList.appendChild(div);
    });

    // Mostrar aviso si la lista fue truncada por falta de filtros
    // Crear/actualizar aviso justo encima de itemsList
    const existingNotice = document.getElementById('itemsNotice');
    if (meta?.truncated) {
      const msg = `Mostrando ${meta.limit} ítems de ${meta.total}. Usa los filtros para ver más resultados.`;
      if (existingNotice) {
        existingNotice.textContent = msg;
        existingNotice.style.display = 'block';
      } else {
        const n = document.createElement('div');
        n.id = 'itemsNotice';
        n.className = 'card muted';
        n.style.margin = '6px 0';
        n.textContent = msg;
        itemsList.parentNode.insertBefore(n, itemsList);
      }
    } else if (existingNotice) {
      existingNotice.style.display = 'none';
    }

    updateSelectionBar();
  }

  // ---- Crear entrada ----
  viSave.onclick = async () => {
    const isPurchase = viKindPurchase?.checked;
    const body = { intakeKind: isPurchase ? "purchase" : "vehicle" };

    if (isPurchase) {
      if (!viPPlace.value.trim()) return alert("Indica el lugar de compra");
      body.purchasePlace = viPPlace.value.trim();
      body.intakeDate = viPDate.value || undefined;
      body.entryPrice = viPPrice.value ? parseFloat(viPPrice.value) : undefined;
    } else {
      if (!viBrand.value.trim() || !viModel.value.trim() || !viEngine.value.trim())
        return alert("Completa Marca / Modelo / Cilindraje");

      body.brand = viBrand.value.trim();
      body.model = viModel.value.trim();
      body.engine = viEngine.value.trim();
      body.intakeDate = viDate.value || undefined;
      body.entryPrice = viPrice.value ? parseFloat(viPrice.value) : undefined;
    }

    await invAPI.saveVehicleIntake(body);

    [viBrand, viModel, viEngine, viDate, viPrice, viPPlace, viPDate, viPPrice].forEach((el) => {
      if (el) el.value = "";
    });

    if (viKindVehicle) {
      viKindVehicle.checked = true;
      updateIntakeKindUI();
    }

    await refreshIntakes();
    alert("Ingreso creado");
  };

  // ---- Autorelleno de destino al cambiar procedencia ----
  itVehicleIntakeId.addEventListener("change", () => {
    const id = itVehicleIntakeId.value;
    if (!id) {
      itVehicleTarget.value = "GENERAL";
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

  // ---- Guardar ítem ----
  itSave.onclick = async () => {
    let vehicleTargetValue = (itVehicleTarget.value || "").trim();
    const selectedIntakeId = itVehicleIntakeId.value || undefined;

    if (selectedIntakeId && (!vehicleTargetValue || vehicleTargetValue === "GENERAL")) {
      const vi = state.intakes.find((v) => v._id === selectedIntakeId);
      if (vi) vehicleTargetValue = makeIntakeLabel(vi);
    }
    if (!vehicleTargetValue) vehicleTargetValue = "GENERAL";

    let images = [];
    if (itFiles && itFiles.files && itFiles.files.length > 0) {
      const up = await invAPI.mediaUpload(itFiles.files);
      images = (up && up.files) ? up.files : [];
    }

    const body = {
      sku: itSku.value.trim(),
      name: itName.value.trim(),
      internalName: itInternal ? itInternal.value.trim() : undefined,
      location: itLocation ? itLocation.value.trim() : undefined,
      vehicleTarget: vehicleTargetValue,
      vehicleIntakeId: selectedIntakeId,
      entryPrice: itEntryPrice.value ? parseFloat(itEntryPrice.value) : undefined,
      salePrice: parseFloat(itSalePrice.value || "0"),
      original: itOriginal.value === "true",
      stock: parseInt(itStock.value || "0", 10),
      images,
    };

    if (!body.sku || !body.name || !body.salePrice) return alert("Completa SKU, nombre y precio de venta");

    await invAPI.saveItem(body);

    // Reset form
    itSku.value = "";
    itName.value = "";
    if (itInternal) itInternal.value = "";
    if (itLocation) itLocation.value = "";
    itVehicleTarget.value = "GENERAL";
    itVehicleIntakeId.value = "";
    itEntryPrice.value = "";
    itSalePrice.value = "";
    itOriginal.value = "false";
    itStock.value = "";
    if (itFiles) itFiles.value = "";
    itVehicleTarget.readOnly = false;

    await refreshItems({});
  };

  // ---- Filtros ----
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
  [qName, qSku].forEach((el) => el && el.addEventListener("keydown", (e) => e.key === "Enter" && doSearch()));
  qIntake && qIntake.addEventListener("change", doSearch);

  // ---- Editar Ingreso ----
  function openEditVehicleIntake(vi) {
    const d = new Date(vi.intakeDate);
    const ymd = isFinite(d) ? d.toISOString().slice(0, 10) : "";

    invOpenModal(`
      <h3>Editar entrada</h3>
      <label>Tipo</label>
      <select id="e-vi-kind">
        <option value="vehicle" ${vi.intakeKind === "vehicle" ? "selected" : ""}>Vehículo</option>
        <option value="purchase" ${vi.intakeKind === "purchase" ? "selected" : ""}>Compra</option>
      </select>

      <div id="e-vi-box-vehicle" class="${vi.intakeKind === "purchase" ? "hidden" : ""}">
        <label>Marca</label><input id="e-vi-brand" value="${(vi.brand || "").toUpperCase()}"/>
        <label>Modelo</label><input id="e-vi-model" value="${(vi.model || "").toUpperCase()}"/>
        <label>Cilindraje</label><input id="e-vi-engine" value="${(vi.engine || "").toUpperCase()}"/>
      </div>

      <div id="e-vi-box-purchase" class="${vi.intakeKind === "vehicle" ? "hidden" : ""}">
        <label>Lugar de compra</label><input id="e-vi-place" value="${(vi.purchasePlace || "").toUpperCase()}"/>
      </div>

      <label>Fecha</label><input id="e-vi-date" type="date" value="${ymd}"/>
      <label>Precio de entrada</label><input id="e-vi-price" type="number" step="0.01" min="0" value="${Number(vi.entryPrice || 0)}"/>

      <div style="margin-top:10px;display:flex;gap:8px;">
        <button id="e-vi-save">Guardar cambios</button>
        <button id="e-vi-cancel" class="secondary">Cancelar</button>
      </div>
    `);

    const kind = document.getElementById("e-vi-kind");
    const boxV = document.getElementById("e-vi-box-vehicle");
    const boxP = document.getElementById("e-vi-box-purchase");
    const b = document.getElementById("e-vi-brand");
    const m = document.getElementById("e-vi-model");
    const e = document.getElementById("e-vi-engine");
    const place = document.getElementById("e-vi-place");
    const dt = document.getElementById("e-vi-date");
    const pr = document.getElementById("e-vi-price");
    const save = document.getElementById("e-vi-save");
    const cancel = document.getElementById("e-vi-cancel");

    upper(b); upper(m); upper(e); upper(place);

    kind.onchange = () => {
      const isP = kind.value === "purchase";
      boxP.classList.toggle("hidden", !isP);
      boxV.classList.toggle("hidden", isP);
    };

    cancel.onclick = invCloseModal;

    save.onclick = async () => {
      try {
        const payload = {
          intakeKind: kind.value,
          intakeDate: dt.value || undefined,
          entryPrice: parseFloat(pr.value || "0"),
        };
        if (kind.value === "purchase") {
          payload.purchasePlace = (place.value || "").toUpperCase().trim();
        } else {
          payload.brand = (b.value || "").toUpperCase().trim();
          payload.model = (m.value || "").toUpperCase().trim();
          payload.engine = (e.value || "").toUpperCase().trim();
        }
        await invAPI.updateVehicleIntake(vi._id, payload);
        invCloseModal();
        await refreshIntakes();
        await refreshItems(state.lastItemsParams);
      } catch (err) {
        alert("Error: " + err.message);
      }
    };
  }

  // ---- Editar Ítem ----
  function openEditItem(it) {
    const optionsIntakes = [
      `<option value="">(sin entrada)</option>`,
      ...state.intakes.map(
        (v) =>
          `<option value="${v._id}" ${String(it.vehicleIntakeId || "") === String(v._id) ? "selected" : ""}>
            ${makeIntakeLabel(v)} • ${new Date(v.intakeDate).toLocaleDateString()}
          </option>`
      ),
    ].join("");

    const images = Array.isArray(it.images) ? [...it.images] : [];

    invOpenModal(`
      <h3>Editar ítem</h3>
      <label>SKU</label><input id="e-it-sku" value="${it.sku || ""}"/>
      <label>Nombre</label><input id="e-it-name" value="${it.name || ""}"/>
      <label>Nombre interno</label><input id="e-it-internal" value="${it.internalName || ''}"/>
      <label>Ubicación</label><input id="e-it-location" value="${it.location || ''}"/>
      <label>Entrada</label><select id="e-it-intake">${optionsIntakes}</select>
      <label>Destino</label><input id="e-it-target" value="${it.vehicleTarget || "GENERAL"}"/>
      <label>Precio entrada (opcional)</label><input id="e-it-entry" type="number" step="0.01" placeholder="vacío = AUTO si hay entrada" value="${it.entryPrice ?? ""}"/>
      <label>Precio venta</label><input id="e-it-sale" type="number" step="0.01" min="0" value="${Number(it.salePrice || 0)}"/>
      <label>Original</label>
      <select id="e-it-original">
        <option value="false" ${!it.original ? "selected" : ""}>No</option>
        <option value="true" ${it.original ? "selected" : ""}>Sí</option>
      </select>
      <label>Stock</label><input id="e-it-stock" type="number" step="1" min="0" value="${parseInt(it.stock || 0, 10)}"/>

      <label>Imágenes/Videos</label>
      <div id="e-it-thumbs" class="thumbs"></div>
      <input id="e-it-files" type="file" multiple/>
      <div class="viewer" id="e-it-viewer" style="display:none"></div>

      <div style="margin-top:10px;display:flex;gap:8px;">
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
        const label = document.createElement("span");
        label.className = "thumb-label";
        label.textContent = `Imagen ${idx + 1}`;
        label.style.marginRight = "8px";

        const previewBtn = document.createElement("button");
  previewBtn.className = "preview-btn thumb-icon-btn";
  previewBtn.title = "Vista previa";
  previewBtn.innerHTML = `<svg width='18' height='18' viewBox='0 0 20 20' fill='none'><path d='M1 10C3.5 5.5 8 3 12 5.5C16 8 18.5 13 17 15C15.5 17 10.5 17 7 15C3.5 13 1 10 1 10Z' stroke='#2563eb' stroke-width='2' fill='none'/><circle cx='10' cy='10' r='3' fill='#2563eb'/></svg>`;
        previewBtn.onclick = (ev) => {
          // Mostrar a la mitad del tamaño anterior (antes: 90vw x 80vh)
          invOpenModal(
            `<div class='viewer-modal'>` +
            (m.mimetype?.startsWith("video/")
              ? `<video controls src='${m.url}' style='max-width:45vw;max-height:40vh;object-fit:contain;'></video>`
              : `<img src='${m.url}' alt='media' style='max-width:45vw;max-height:40vh;object-fit:contain;'/>`)
            + `</div>`
          );
        };

        const delBtn = document.createElement("button");
        delBtn.className = "del thumb-icon-btn";
        delBtn.title = "Quitar";
        delBtn.innerHTML = `<svg width='18' height='18' viewBox='0 0 20 20' fill='none'><circle cx='10' cy='10' r='9' stroke='#ef4444' stroke-width='2'/><line x1='6' y1='6' x2='14' y2='14' stroke='#ef4444' stroke-width='2'/><line x1='14' y1='6' x2='6' y2='14' stroke='#ef4444' stroke-width='2'/></svg>`;
        delBtn.setAttribute("data-del", idx);
        delBtn.onclick = () => {
          images.splice(idx, 1);
          renderThumbs();
          if (viewer.style.display !== "none") viewer.innerHTML = "";
        };

        const btnWrap = document.createElement("div");
        btnWrap.className = "thumb-btn-wrap";
        btnWrap.style.display = "flex";
  btnWrap.style.alignItems = "baseline";
        btnWrap.style.gap = "6px";
        btnWrap.style.margin = "10px 0";
        btnWrap.appendChild(label);
        btnWrap.appendChild(previewBtn);
        btnWrap.appendChild(delBtn);
        thumbs.appendChild(btnWrap);
      });
    }
    renderThumbs();

    intake.addEventListener("change", () => {
      const id = intake.value;
      if (!id) {
        target.readOnly = false;
        return;
      }
      const vi = state.intakes.find((v) => v._id === id);
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
        const up = await invAPI.mediaUpload(files.files);
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
          internalName: (document.getElementById('e-it-internal')?.value||'').trim().toUpperCase(),
          location: (document.getElementById('e-it-location')?.value||'').trim().toUpperCase(),
          vehicleIntakeId: intake.value || null,
          vehicleTarget: (target.value || "GENERAL").trim().toUpperCase(),
          entryPrice: entry.value === "" ? "" : parseFloat(entry.value),
          salePrice: parseFloat(sale.value || "0"),
          original: original.value === "true",
          stock: parseInt(stock.value || "0", 10),
          images,
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

  // ---- Stickers ----
  async function generateStickersFromSelection() {
    if (!state.selected.size) return;
    const ids = Array.from(state.selected);
    const items = ids
      .map((id) => state.itemCache.get(String(id)))
      .filter(Boolean);
    if (!items.length) {
      alert("No se encontraron datos para los items seleccionados. Vuelve a mostrarlos en la lista antes de generar los stickers.");
      return;
    }
    if (items.length !== ids.length) {
      alert("Algunos items seleccionados no se pudieron cargar. Verificalos en la lista antes de generar los stickers.");
    }

    invOpenModal(
      `<h3>Generar stickers</h3>
       <p class="muted">Ajusta cuántos stickers imprimir por ítem (por defecto = stock actual).</p>
       <div class="table-wrap small">
         <table class="table">
           <thead>
             <tr><th>SKU</th><th>Nombre</th><th class="t-center">Stock</th><th class="t-center">Imprimir</th></tr>
           </thead>
           <tbody id="stk-rows"></tbody>
         </table>
       </div>
       <div class="row right" style="gap:8px;">
         <button class="secondary" id="stk-fill-stock">Usar stock</button>
         <button class="secondary" id="stk-clear">Poner 0</button>
         <button id="stk-generate">Generar PDF</button>
       </div>`
    );

    const rows = document.getElementById("stk-rows");
    rows.innerHTML = items
      .map(
        (it) => `
        <tr data-id="${it._id}">
          <td>${it.sku || ""}</td>
          <td>${it.name || ""}</td>
          <td class="t-center">${it.stock ?? 0}</td>
          <td class="t-center"><input type="number" min="0" step="1" value="${parseInt(it.stock || 0, 10)}" class="qty" style="width:90px"/></td>
        </tr>`
      )
      .join("");

    document.getElementById("stk-fill-stock").onclick = () => {
      rows.querySelectorAll("tr").forEach((tr) => {
        const id = tr.dataset.id;
        const it = items.find((x) => String(x._id) === String(id));
        tr.querySelector(".qty").value = parseInt(it?.stock || 0, 10);
      });
    };

    document.getElementById("stk-clear").onclick = () => {
      rows.querySelectorAll(".qty").forEach((inp) => (inp.value = 0));
    };

    document.getElementById("stk-generate").onclick = async () => {
      const list = [];
      rows.querySelectorAll("tr").forEach((tr) => {
        const id = tr.dataset.id;
        const count = parseInt(tr.querySelector(".qty").value || "0", 10);
        const it = items.find((x) => String(x._id) === String(id));
        if (it && count > 0) list.push({ it, count });
      });
      if (!list.length) {
        alert("Coloca al menos 1 sticker.");
        return;
      }
      const flatItems = list.flatMap(({ it, count }) => Array.from({ length: count }, () => it));
      // Intentar plantilla 'sticker' activa (abre ventana imprimible) antes de backend PDF
      try {
        const tpl = await API.templates.active('sticker');
        if(tpl && tpl.contentHtml){
          const pv = await API.templates.preview({ type:'sticker', contentHtml: tpl.contentHtml, contentCss: tpl.contentCss });
          const win = window.open('', '_blank');
          if(win){
            const css = pv.css? `<style>${pv.css}</style>`:'';
            // Generar bloques repetidos por cada sticker solicitado
            const repeatHtml = flatItems.map(it=>`<div class="sticker-item">${pv.rendered}</div>`).join('');
            win.document.write(`<!doctype html><html><head><meta charset='utf-8'>${css}<style>.sticker-item{page-break-inside:avoid; margin:4px;}</style></head><body>${repeatHtml}</body></html>`);
            win.document.close(); win.focus();
            setTimeout(()=>{ try{ win.print(); }catch{} }, 200);
          }
          return; // no continuar al backend PDF
        }
      } catch(e){ console.warn('Sticker template fallback to backend PDF', e); }
      // Aplanar la lista: una entrada por sticker (backend genera 2 stickers por cada item enviado)
      const payload = [];
      list.forEach(({ it, count }) => {
        for (let i = 0; i < count; i++) {
          payload.push({
            sku: it.sku,
            name: it.name,
            // dejar companyName/companyLogo indefinidos para que el backend use req.company
          });
        }
      });
      try {
        await downloadStickersPdf(payload, `stickers.pdf`, { headers: authHeader(), credentials: 'same-origin' });
        invCloseModal();
      } catch (err) {
        alert('Error creando stickers: ' + (err.message || err));
      }
    };
  }

  // ---- Boot ----
  refreshIntakes();
  refreshItems({});
}
