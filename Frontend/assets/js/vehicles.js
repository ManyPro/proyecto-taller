/* Gestión de vehículos (integrado en lista de precios) */
import { API } from './api.esm.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const money = (n) => new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
}).format(Number(n || 0));

let editingVehicleId = null;
let allVehicles = [];
let allMakes = [];

export function initVehicles() {
  const vehiclesSection = $('[data-subsection="vehicles"]');
  if (!vehiclesSection) return;

  // Elementos del formulario
  const makeInput = $('#v-make');
  const lineInput = $('#v-line');
  const displacementInput = $('#v-displacement');
  const modelYearInput = $('#v-modelyear');
  const saveBtn = $('#v-save');
  const msgDiv = $('#v-msg');

  // Elementos de filtros
  const searchInput = $('#v-search');
  const makeFilter = $('#v-filter-make');
  const filterBtn = $('#v-filter-btn');
  const clearBtn = $('#v-clear-btn');

  // Lista
  const listDiv = $('#v-list');
  const countSpan = $('#v-count');

  // Función para limpiar formulario
  function clearForm() {
    editingVehicleId = null;
    makeInput.value = '';
    lineInput.value = '';
    displacementInput.value = '';
    modelYearInput.value = '';
    msgDiv.textContent = '';
    msgDiv.style.color = '';
    if (saveBtn) {
      saveBtn.textContent = '💾 Guardar';
      saveBtn.className = 'secondary';
    }
  }

  // Función para renderizar vehículo como card
  function renderVehicleCard(vehicle) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'padding:12px;border:1px solid var(--border);border-radius:8px;';
    
    const modelYearDisplay = vehicle.modelYear 
      ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">Modelo: ${vehicle.modelYear}</div>`
      : '<div style="font-size:11px;color:var(--muted);margin-top:4px;">Sin restricción de modelo</div>';
    
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:14px;color:var(--text);">${vehicle.make} ${vehicle.line}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">Cilindraje: ${vehicle.displacement}</div>
          ${modelYearDisplay}
        </div>
        <div style="display:flex;gap:6px;">
          <button class="secondary" data-edit-id="${vehicle._id}" style="padding:6px 10px;font-size:12px;">✏️ Editar</button>
          <button class="danger" data-delete-id="${vehicle._id}" style="padding:6px 10px;font-size:12px;">🗑️ Eliminar</button>
        </div>
      </div>
    `;

    // Event listeners
    card.querySelector(`[data-edit-id="${vehicle._id}"]`)?.addEventListener('click', () => {
      editVehicle(vehicle);
    });

    card.querySelector(`[data-delete-id="${vehicle._id}"]`)?.addEventListener('click', () => {
      deleteVehicle(vehicle._id);
    });

    return card;
  }

  // Función para cargar lista de vehículos
  async function loadVehicles(filters = {}) {
    try {
      const r = await API.vehicles.list(filters);
      allVehicles = Array.isArray(r?.items) ? r.items : [];
      
      if (countSpan) {
        countSpan.textContent = allVehicles.length;
      }

      if (listDiv) {
        if (allVehicles.length === 0) {
          listDiv.innerHTML = `
            <div class="muted" style="grid-column:1/-1;text-align:center;font-size:12px;padding:16px;border:1px dashed var(--border);border-radius:8px;">
              No hay vehículos registrados. Crea el primero usando el formulario arriba.
            </div>
          `;
        } else {
          listDiv.replaceChildren(...allVehicles.map(renderVehicleCard));
        }
      }
    } catch (err) {
      console.error('Error al cargar vehículos:', err);
      if (listDiv) {
        listDiv.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;font-size:12px;padding:16px;border:1px solid var(--danger,#ef4444);border-radius:8px;color:var(--danger,#ef4444);">
            ❌ Error al cargar vehículos: ${err.message || 'Error desconocido'}
          </div>
        `;
      }
    }
  }

  // Función para cargar marcas
  async function loadMakes() {
    try {
      const r = await API.vehicles.getMakes();
      allMakes = Array.isArray(r?.makes) ? r.makes : [];
      
      if (makeFilter) {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Todas';
        makeFilter.replaceChildren(
          defaultOpt,
          ...allMakes.map(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            return opt;
          })
        );
      }
    } catch (err) {
      console.error('Error al cargar marcas:', err);
    }
  }

  // Función para editar vehículo
  function editVehicle(vehicle) {
    editingVehicleId = vehicle._id;
    makeInput.value = vehicle.make || '';
    lineInput.value = vehicle.line || '';
    displacementInput.value = vehicle.displacement || '';
    modelYearInput.value = vehicle.modelYear || '';
    
    if (saveBtn) {
      saveBtn.textContent = '💾 Actualizar';
      saveBtn.className = 'secondary';
    }
    
    msgDiv.textContent = `Editando: ${vehicle.make} ${vehicle.line} ${vehicle.displacement}`;
    msgDiv.style.color = 'var(--primary, #3b82f6)';
    
    // Scroll al formulario
    makeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    makeInput.focus();
  }

  // Función para guardar vehículo
  async function saveVehicle() {
    const make = makeInput.value.trim().toUpperCase();
    const line = lineInput.value.trim().toUpperCase();
    const displacement = displacementInput.value.trim().toUpperCase();
    const modelYear = modelYearInput.value.trim() || null;

    if (!make || !line || !displacement) {
      msgDiv.textContent = '❌ Marca, línea y cilindraje son requeridos';
      msgDiv.style.color = 'var(--danger, #ef4444)';
      return;
    }

    // Validar formato de modelYear
    if (modelYear) {
      if (!/^\d{4}$/.test(modelYear) && !/^\d{4}-\d{4}$/.test(modelYear)) {
        msgDiv.textContent = '❌ El modelo debe ser un año (2020) o un rango (2018-2022)';
        msgDiv.style.color = 'var(--danger, #ef4444)';
        return;
      }
    }

    try {
      const payload = { make, line, displacement, modelYear };
      
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
      }

      if (editingVehicleId) {
        await API.vehicles.update(editingVehicleId, payload);
        msgDiv.textContent = '✓ Vehículo actualizado exitosamente';
      } else {
        await API.vehicles.create(payload);
        msgDiv.textContent = '✓ Vehículo creado exitosamente';
      }
      
      msgDiv.style.color = 'var(--success, #10b981)';
      clearForm();
      await loadVehicles();
      await loadMakes();
    } catch (err) {
      const errorMsg = err.message || 'Error desconocido';
      msgDiv.textContent = `❌ Error: ${errorMsg}`;
      msgDiv.style.color = 'var(--danger, #ef4444)';
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = editingVehicleId ? '💾 Actualizar' : '💾 Guardar';
      }
    }
  }

  // Función para eliminar vehículo
  async function deleteVehicle(id) {
    const vehicle = allVehicles.find(v => v._id === id);
    if (!vehicle) return;

    const confirmMsg = `¿Eliminar vehículo ${vehicle.make} ${vehicle.line} ${vehicle.displacement}${vehicle.modelYear ? ` (${vehicle.modelYear})` : ''}?`;
    if (!confirm(confirmMsg)) return;

    try {
      await API.vehicles.delete(id);
      await loadVehicles();
      await loadMakes();
      
      if (msgDiv) {
        msgDiv.textContent = '✓ Vehículo eliminado exitosamente';
        msgDiv.style.color = 'var(--success, #10b981)';
        setTimeout(() => {
          msgDiv.textContent = '';
        }, 3000);
      }
    } catch (err) {
      alert('❌ Error al eliminar: ' + (err.message || 'Error desconocido'));
    }
  }

  // Función para aplicar filtros
  async function applyFilters() {
    const filters = {};
    
    if (searchInput.value.trim()) {
      filters.search = searchInput.value.trim();
    }
    
    if (makeFilter.value) {
      filters.make = makeFilter.value;
    }
    
    await loadVehicles(filters);
  }

  // Función para limpiar filtros
  function clearFilters() {
    searchInput.value = '';
    makeFilter.value = '';
    loadVehicles();
  }

  // Event listeners
  if (saveBtn) {
    saveBtn.addEventListener('click', saveVehicle);
  }

  if (filterBtn) {
    filterBtn.addEventListener('click', applyFilters);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearFilters);
  }

  // Búsqueda al presionar Enter
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        applyFilters();
      }
    });
  }

  // Cargar datos iniciales
  loadVehicles();
  loadMakes();
}

