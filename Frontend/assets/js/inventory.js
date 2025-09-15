import { API } from "./api.js";
import { upper } from "./utils.js";

const state = {
  intakes: [], // entradas de vehículo
};

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
  const itImage = document.getElementById("it-image"); // <--- NUEVO
  const itSave = document.getElementById("it-save");

  // ---- Listado de ítems ----
  const itemsList = document.getElementById("itemsList");
  const qName = document.getElementById("q-name");
  const qApply = document.getElementById("q-apply");

  // ====== Entradas: fetch y render ======
  async function refreshIntakes() {
    const { data } = await API.listVehicleIntakes();
    state.intakes = data || [];

    // llenar select del formulario de ítems
    itVehicleIntakeId.innerHTML =
      `<option value="">(opcional)</option>` +
      state.intakes
        .map(
          (v) =>
            `<option value="${v._id}">
              ${v.brand} ${v.model} ${v.engine} - ${new Date(v.intakeDate).toLocaleDateString()}
            </option>`
        )
        .join("");

    renderIntakesList();

    // disparar cambio para autocompletar destino si hay selección
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

      row.querySelector("[data-edit]").onclick = async () => {
        const brand = prompt("Marca", vi.brand);
        if (brand == null) return;
        const model = prompt("Modelo", vi.model);
        if (model == null) return;
        const engine = prompt("Cilindraje", vi.engine);
        if (engine == null) return;
        const dateStr = prompt("Fecha (YYYY-MM-DD)", new Date(vi.intakeDate).toISOString().slice(0, 10));
        if (dateStr == null) return;
        const priceStr = prompt("Precio de entrada del vehículo", vi.entryPrice);
        if (priceStr == null) return;

        await API.request(`/api/v1/inventory/vehicle-intakes/${vi._id}`, {
          method: "PUT",
          json: {
            brand, model, engine,
            intakeDate: dateStr,
            entryPrice: parseFloat(priceStr || "0"),
          },
        });
        await refreshIntakes();
        await refreshItems({});
        alert("Entrada actualizada.");
      };

      row.querySelector("[data-del]").onclick = async () => {
        if (!confirm("¿Eliminar esta entrada de vehículo? (debe no tener ítems vinculados)")) return;
        try {
          await API.request(`/api/v1/inventory/vehicle-intakes/${vi._id}`, { method: "DELETE" });
          await refreshIntakes();
          await refreshItems({});
        } catch (e) {
          alert("No se pudo eliminar: " + e.message);
        }
      };

      row.querySelector("[data-recalc]").onclick = async () => {
        await API.request(`/api/v1/inventory/vehicle-intakes/${vi._id}/recalc`, { method: "POST" });
        await refreshItems({});
        alert("Prorrateo recalculado.");
      };

      viList.appendChild(row);
    });
  }

  // ====== Ítems: list ======
  async function refreshItems(params = {}) {
    const { data } = await API.listItems(params);
    itemsList.innerHTML = "";
    (data || []).forEach((it) => {
      const div = document.createElement("div");
      div.className = "note";

      // Entrada TOTAL = unitario * stock; mostrar también unitario
      const unit = it.entryPrice ?? 0;
      const total = unit * Math.max(0, it.stock || 0);
      const entradaTxt =
        `${fmtMoney(total)}${it.entryPriceIsAuto ? " (prorrateado)" : ""} - unit: ${fmtMoney(unit)}`;

      div.innerHTML = `
        <div>
          <div><b>${it.sku}</b></div>
          <div>${it.name}</div>
        </div>
        <div class="content">
          <div>Vehículo: ${it.vehicleTarget}${it.vehicleIntakeId ? " (entrada)" : ""}</div>
          <div>Entrada: ${entradaTxt} | Venta: ${fmtMoney(it.salePrice)}</div>
          <div>Stock: <b>${it.stock}</b> | Original: ${it.original ? "Sí" : "No"}</div>
        </div>
        <div class="actions">
          <button class="secondary" data-edit="${it._id}">Editar</button>
          <button class="danger" data-del="${it._id}">Eliminar</button>
        </div>`;

      const edit = div.querySelector("[data-edit]");
      const del = div.querySelector("[data-del]");

      edit.onclick = async () => {
        const nv = prompt("Nuevo precio de venta:", it.salePrice);
        if (nv == null) return;
        await API.request("/api/v1/inventory/items/" + it._id, {
          method: "PUT",
          json: { salePrice: +nv },
        });
        refreshItems(params);
      };

      del.onclick = async () => {
        if (!confirm("¿Eliminar ítem? (stock debe ser 0)")) return;
        try {
          await API.request("/api/v1/inventory/items/" + it._id, { method: "DELETE" });
          refreshItems(params);
        } catch (e) {
          alert("Error: " + e.message);
        }
      };

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
    await API.saveVehicleIntake(body);
    await refreshIntakes();
    alert("Entrada de vehículo creada");
  };

  // ====== Auto-relleno de destino cuando se elige una entrada ======
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

  // ====== Guardar ítem (con imagen opcional) ======
  itSave.onclick = async () => {
    let vehicleTargetValue = (itVehicleTarget.value || "").trim();
    const selectedIntakeId = itVehicleIntakeId.value || undefined;

    if (selectedIntakeId && (!vehicleTargetValue || vehicleTargetValue === "VITRINAS")) {
      const vi = state.intakes.find((v) => v._id === selectedIntakeId);
      if (vi) vehicleTargetValue = makeIntakeLabel(vi);
    }
    if (!vehicleTargetValue) vehicleTargetValue = "VITRINAS";

    // construimos FormData
    const fd = new FormData();
    fd.append("sku", itSku.value.trim());
    fd.append("name", itName.value.trim());
    fd.append("vehicleTarget", vehicleTargetValue);
    if (selectedIntakeId) fd.append("vehicleIntakeId", selectedIntakeId);
    if (itEntryPrice.value) fd.append("entryPrice", parseFloat(itEntryPrice.value));
    fd.append("salePrice", parseFloat(itSalePrice.value || "0"));
    fd.append("original", itOriginal.value === "true" ? "true" : "false");
    fd.append("stock", parseInt(itStock.value || "0", 10).toString());
    if (itImage && itImage.files && itImage.files[0]) {
      fd.append("image", itImage.files[0]); // <--- nombre de campo que espera el backend
    }

    if (!fd.get("sku") || !fd.get("name") || !fd.get("salePrice"))
      return alert("Completa SKU, nombre y precio de venta");

    await API.request("/api/v1/inventory/items", { method: "POST", formData: fd });

    // reset
    itSku.value = "";
    itName.value = "";
    itVehicleTarget.value = "";
    itVehicleIntakeId.value = "";
    itEntryPrice.value = "";
    itSalePrice.value = "";
    itOriginal.value = "false";
    itStock.value = "";
    if (itImage) itImage.value = "";
    itVehicleTarget.readOnly = false;

    await refreshItems({});
  };

  // ====== Búsqueda ======
  qApply.onclick = () => refreshItems({ name: qName.value.trim() });

  // ====== Init ======
  refreshIntakes();
  refreshItems({});
}
