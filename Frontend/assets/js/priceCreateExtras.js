import { API } from './api.esm.js';

function typeLabel(type) {
  if (type === 'combo') return 'combo';
  if (type === 'service') return 'servicio';
  if (type === 'product') return 'producto';
  return 'ítem';
}

function money(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n || 0));
}

function normalizePriceList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export function normalizeComboProduct(cp = {}) {
  const raw = cp.itemId;
  let item = null;
  if (raw && typeof raw === 'object') item = raw;
  else if (raw) item = { _id: raw };
  return {
    name: cp.name || '',
    qty: cp.qty || 1,
    unitPrice: cp.unitPrice || 0,
    isOpenSlot: Boolean(cp.isOpenSlot),
    itemId: item
  };
}

export function oneTimeSaveToggleHtml() {
  return `
      <div class="rounded-2xl border border-amber-500/40 dark:border-amber-500/40 theme-light:border-amber-300 bg-amber-950/20 dark:bg-amber-950/20 theme-light:bg-amber-50 p-4">
        <button type="button" data-save-to-list aria-pressed="false" id="price-save-to-list" class="w-full px-4 py-2.5 rounded-xl bg-slate-700/50 hover:bg-slate-700/70 dark:bg-slate-700/50 theme-light:bg-white text-white dark:text-white theme-light:text-slate-900 font-extrabold border border-amber-500/40 theme-light:border-amber-300 transition-all">
          📌 Guardar en lista de precios
        </button>
        <p data-save-to-list-hint class="mt-2 mb-0 text-xs text-amber-200 dark:text-amber-200 theme-light:text-amber-800">
          Apagado = de un solo uso. No queda en la lista de precios. Enciéndelo solo si quieres reutilizarlo después.
        </p>
      </div>
  `;
}

export function priceTemplatePickerHtml({ type, prefix = 'price' } = {}) {
  const label = typeLabel(type);
  return `
      <div class="rounded-2xl border border-slate-700/40 dark:border-slate-700/40 theme-light:border-slate-200 bg-slate-900/20 dark:bg-slate-900/20 theme-light:bg-sky-50 p-4">
        <label class="block text-xs font-semibold text-slate-300 dark:text-slate-300 theme-light:text-slate-700 mb-1">Usar ${label} de la lista como plantilla</label>
        <p class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600 mb-2">Trae nombre, precios e ítems. Puedes editarlos antes de guardar. No modifica el original.</p>
        <input id="${prefix}-template-search" placeholder="Buscar ${label} guardado..." class="w-full px-4 py-2.5 rounded-xl border border-slate-700/40 dark:border-slate-700/40 theme-light:border-slate-200 bg-slate-900/30 dark:bg-slate-900/30 theme-light:bg-white text-slate-100 dark:text-slate-100 theme-light:text-slate-900 placeholder-slate-500 theme-light:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50" autocomplete="off" />
        <div id="${prefix}-template-dropdown" class="hidden relative max-h-48 overflow-y-auto border border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-300 rounded-lg bg-slate-800/95 dark:bg-slate-800/95 theme-light:bg-white mt-1 custom-scrollbar"></div>
        <div id="${prefix}-template-selected" class="hidden mt-2 p-2 rounded-xl border border-emerald-600/30 bg-emerald-950/20 dark:bg-emerald-950/20 theme-light:bg-emerald-50 text-xs text-emerald-100 dark:text-emerald-100 theme-light:text-emerald-800"></div>
      </div>
  `;
}

export function isSaveToListEnabled(node) {
  const btn = node?.querySelector('[data-save-to-list]');
  return btn?.getAttribute('aria-pressed') === 'true';
}

export function bindSaveToListToggle(node) {
  const btn = node?.querySelector('[data-save-to-list]');
  const hint = node?.querySelector('[data-save-to-list-hint]');
  if (!btn) return;
  const sync = () => {
    const on = btn.getAttribute('aria-pressed') === 'true';
    btn.textContent = on ? '✅ Se guardará en la lista de precios' : '📌 Guardar en lista de precios';
    btn.classList.toggle('from-emerald-600', on);
    if (hint) {
      hint.textContent = on
        ? 'Encendido: este ítem quedará en la lista de precios para reutilizarlo.'
        : 'Apagado = de un solo uso. No queda en la lista de precios. Enciéndelo solo si quieres reutilizarlo después.';
    }
  };
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    sync();
  });
  sync();
}

export function fillStandardPriceFields(node, tpl, selectors = {}) {
  if (!node || !tpl) return;
  const setVal = (sel, val) => {
    if (!sel) return;
    const el = node.querySelector(sel);
    if (el) el.value = val ?? '';
  };
  setVal(selectors.nameSelector, tpl.name || '');
  setVal(selectors.totalSelector, tpl.total ?? 0);
  setVal(selectors.yearFromSelector, tpl.yearFrom ?? '');
  setVal(selectors.yearToSelector, tpl.yearTo ?? '');
  setVal(selectors.laborValueSelector, tpl.laborValue || '');
  setVal(selectors.investmentSelector, tpl.investmentValue || '');
  if (selectors.laborKindSelector) {
    const el = node.querySelector(selectors.laborKindSelector);
    if (el && tpl.laborKind) el.value = tpl.laborKind;
  }
}

export function applyLinkedProductUI(node, item, { searchSelector, selectedSelector, hiddenSelector, onSelected } = {}) {
  if (!node || !item || !item._id) return;
  onSelected?.(item);
  const search = searchSelector ? node.querySelector(searchSelector) : null;
  const selected = selectedSelector ? node.querySelector(selectedSelector) : null;
  const hidden = hiddenSelector ? node.querySelector(hiddenSelector) : null;
  if (hidden) hidden.value = item._id;
  if (search) search.value = `${item.sku || ''} - ${item.name || ''}`;
  if (!selected) return;
  selected.innerHTML = `
    <div class="flex justify-between items-center gap-2">
      <div>
        <strong>${item.name || item.sku || ''}</strong><br>
        <span class="text-xs"><strong>SKU:</strong> ${item.sku || ''} | Stock: ${item.stock || 0}</span>
      </div>
      <button type="button" data-clear-linked-item class="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded">✕</button>
    </div>
  `;
  selected.classList.remove('hidden');
  selected.classList.add('block');
  selected.style.display = 'block';
  const removeBtn = selected.querySelector('[data-clear-linked-item]');
  if (removeBtn) {
    removeBtn.onclick = () => {
      onSelected?.(null);
      if (hidden) hidden.value = '';
      if (search) search.value = '';
      selected.innerHTML = '';
      selected.classList.add('hidden');
      selected.classList.remove('block');
      selected.style.display = 'none';
    };
  }
}

export function bindPriceTemplatePicker({ node, type, prefix = 'price', onSelect }) {
  if (!node || !onSelect) return;
  const search = node.querySelector(`#${prefix}-template-search`);
  const dropdown = node.querySelector(`#${prefix}-template-dropdown`);
  const selected = node.querySelector(`#${prefix}-template-selected`);
  if (!search || !dropdown) return;

  let timer = null;

  const hideDropdown = () => {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
  };

  const markSelected = (tpl) => {
    if (!selected) return;
    selected.classList.remove('hidden');
    selected.innerHTML = `Plantilla: <strong>${tpl.name || ''}</strong> · ${money(tpl.total)} <span class="opacity-70">(copia editable)</span>`;
  };

  const pick = async (row) => {
    hideDropdown();
    search.value = row.name || '';
    let full = row;
    try {
      if (row?._id) {
        const fetched = await API.prices.get(row._id);
        if (fetched) full = fetched;
      }
    } catch (err) {
      console.error('Error cargando plantilla:', err);
    }
    markSelected(full);
    onSelect(full);
  };

  async function searchTemplates(query) {
    try {
      const params = { type, limit: 20, isGeneral: true };
      if (query && query.trim().length >= 1) params.name = query.trim();
      const data = await API.pricesList(params);
      const items = normalizePriceList(data).filter((p) => p && p.type === type);
      if (!items.length) {
        dropdown.innerHTML = `<div class="px-3 py-2 text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">No hay ${typeLabel(type)}s guardados</div>`;
        dropdown.classList.remove('hidden');
        return;
      }
      dropdown.replaceChildren(...items.map((p) => {
        const div = document.createElement('div');
        div.className = 'px-3 py-2 cursor-pointer border-b border-slate-700/50 dark:border-slate-700/50 theme-light:border-slate-200 hover:bg-slate-700/40 dark:hover:bg-slate-700/40 theme-light:hover:bg-slate-100';
        div.innerHTML = `
          <div class="font-semibold text-white dark:text-white theme-light:text-slate-900">${p.name || ''}</div>
          <div class="text-xs text-slate-400 dark:text-slate-400 theme-light:text-slate-600">${money(p.total)}${p.comboProducts?.length ? ` · ${p.comboProducts.length} ítems` : ''}</div>
        `;
        div.addEventListener('click', () => pick(p));
        return div;
      }));
      dropdown.classList.remove('hidden');
    } catch (err) {
      console.error('Error buscando plantillas:', err);
      hideDropdown();
    }
  }

  search.addEventListener('focus', () => {
    searchTemplates(search.value);
  });
  search.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => searchTemplates(e.target.value), 250);
  });
  document.addEventListener('click', (e) => {
    if (!node.contains(e.target)) hideDropdown();
  });
}
