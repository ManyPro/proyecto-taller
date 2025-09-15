import { API } from "./api.js";
import { upper } from "./utils.js";

// Estado simple para reusar las entradas en el front
const state = {
  intakes: [], // se llena en refreshIntakes()
};

// Construye la etiqueta (destino) a partir de una entrada
function makeIntakeLabel(v) {
  return `${(v?.brand || "").trim()} ${(v?.model || "").trim()} ${(v?.engine || "").trim()}`
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function initInventory() {
  // ----- Entradas de vehículo -----
  const viBrand = document.getElementById("vi-brand"); upper(viBrand);
  const viModel = document.getElementById("vi-model"); upper(viModel);
  const viEngine = document.getElementById("vi-engine"); upper(viEngine);
  const viDate = document.getElementById("vi-date");
  const viPrice = document.getElementById("vi-price");
  const viSave = document.getElementById("vi-save");

  // ----- Nuevo ítem -----
  const itSku = document.getElementById("it-sku"); upper(itSku);
  const itName = document.getElementById("it-name"); upper(itName);
  const itVehicleTarget = document.getElementById("it-vehicleTarget"); upper(itVehicleTarget);
  const itVehicleIntakeId = document.getElementById("it-vehicleIntakeId");
  const itEntryPrice = document.getElementById("it-entryPrice");
  const itSalePrice = document.getElementById("it-salePrice");
  const itOriginal = document.getElementById("it-original");
  const itStock = document.getElementById("it-stock");
  const itSave = document.getElementById("it-save");

  // ----- Listado / búsqueda -----
  const itemsList = document.getElementById("itemsList");
  const qName = document.getElementById("q-name");
  const qApply = document.getElementById("q-apply");

  // -----------------------------
  // Cargar entradas (y llenar el <select>)
  // -----------------------------
  async function refreshIntakes() {
    const { data } = await API.listVehicleIntakes();
    state.intakes = data || [];
    itVehicleIntakeId.innerHTML =
      `<option value="">(opcional)</option>` +
      state.intakes
        .map(
          (v) =>
            `<option value="${v._id}">${v.brand} ${v.model} ${v.engine} - ${new Date(
              v.intakeDate
            ).toLocaleDateString()}</option>`
        )
        .join("");

    // Disparar un cambio para que se actualice el destino según la selección actual
    itVehicleIntakeId.dispatchEvent(new Event("change"));
  }

  // -----------------------------
  // Listar ítems
  // -----------------------------
  async function refreshItems(params = {}) {
    const { data } = await API.listItems(params);
    itemsList.innerHTML = "";
    (data || []).forEach((it) => {
      const div = document.createElement("div");
      div.className = "note"; // reutilizo el estilo

      const entradaTxt =
        (it.entryPrice ?? 0) +
        (it.entryPriceIsAuto ? " (prorrateado)" : "");

      div.innerHTML = `
        <div>
          <div><b>${it.sku}</b></div>
          <div>${it.name}</div>
        </div>
        <div class="content">
          <div>Vehículo: ${it.vehicleTarget}${it.vehicleIntakeId ? " (entrada)" : ""}</div>
          <div>Entrada: ${entradaTxt} | Venta: ${it.salePrice}</div>
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
          await API.request("/api/v1/inventory/items/" + it._id, {
            method: "DELETE",
          });
          refreshItems(params);
        } catch (e) {
          alert("Error: " + e.message);
        }
      };

      itemsList.appendChild(div);
    });
  }

  // -----------------------------
  // Guardar entrada de vehículo
  // -----------------------------
  viSave.onclick = async () => {
    const body = {
      brand: viBrand.value.trim(),
      model: viModel.value.trim(),
      engine: viEngine.value.trim(),
      intakeDate: viDate.value
        ? new Date(viDate.value).toISOString()
        : undefined,
      entryPrice: parseFloat(viPrice.value || "0"),
    };
    if (!body.brand || !body.model || !body.engine || !body.entryPrice)
      return alert(
        "Completa marca, modelo, cilindraje y precio de entrada"
      );
    await API.saveVehicleIntake(body);
    await refreshIntakes();
    alert("Entrada de vehículo creada");
  };

  // -----------------------------
  // Auto-relleno de Vehículo destino cuando se elige una entrada
  // -----------------------------
  itVehicleIntakeId.addEventListener("change", () => {
    const id = itVehicleIntakeId.value;
    if (!id) {
      // Sin entrada → VITRINAS y editable
      itVehicleTarget.value = "VITRINAS";
      itVehicleTarget.readOnly = false;
      return;
    }
    const vi = state.intakes.find((v) => v._id === id);
    if (vi) {
      itVehicleTarget.value = makeIntakeLabel(vi);
      itVehicleTarget.readOnly = true; // bloquear mientras tenga entrada
    } else {
      // seguridad por si no se encontró
      itVehicleTarget.readOnly = false;
    }
  });

  // -----------------------------
  // Guardar ítem (si entryPrice vacío y hay entrada → prorratea en backend)
  // -----------------------------
  itSave.onclick = async () => {
    // Calcular el destino final antes de enviar
    let vehicleTargetValue = (itVehicleTarget.value || "").trim();
    const selectedIntakeId = itVehicleIntakeId.value || undefined;

    if (selectedIntakeId && (!vehicleTargetValue || vehicleTargetValue === "VITRINAS")) {
      const vi = state.intakes.find((v) => v._id === selectedIntakeId);
      if (vi) vehicleTargetValue = makeIntakeLabel(vi);
    }
    if (!vehicleTargetValue) vehicleTargetValue = "VITRINAS";

    const body = {
      sku: itSku.value.trim(),
      name: itName.value.trim(),
      vehicleTarget: vehicleTargetValue,
      vehicleIntakeId: selectedIntakeId,
      // Si el usuario deja vacío 'Precio entrada (opcional)' enviamos undefined
      // para que el backend prorratee entre los ítems de esa entrada.
      entryPrice: itEntryPrice.value ? parseFloat(itEntryPrice.value) : undefined,
      salePrice: parseFloat(itSalePrice.value || "0"),
      original: itOriginal.value === "true",
      stock: parseInt(itStock.value || "0", 10),
    };

    if (!body.sku || !body.name || !body.salePrice)
      return alert("Completa SKU, nombre y precio de venta");

    await API.saveItem(body);

    // Reset de formulario
    itSku.value = "";
    itName.value = "";
    itVehicleTarget.value = "";
    itVehicleIntakeId.value = "";
    itEntryPrice.value = "";
    itSalePrice.value = "";
    itOriginal.value = "false";
    itStock.value = "";
    itVehicleTarget.readOnly = false;

    await refreshItems({});
  };

  // -----------------------------
  // Búsqueda
  // -----------------------------
  qApply.onclick = () => refreshItems({ name: qName.value.trim() });

  // Init
  refreshIntakes();
  refreshItems({});
}
