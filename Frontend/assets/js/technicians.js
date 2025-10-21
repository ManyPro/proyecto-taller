import { API } from './api.esm.js';

let cfg = { laborKinds: [], technicians: [] };

const $ = (selector, root = document) => root.querySelector(selector);

function renderKinds() {
  const container = $('#tk-kinds');
  if (!container) return;

  container.innerHTML = '';
  (cfg.laborKinds || []).forEach(kind => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = kind;
    chip.style.cursor = 'pointer';
    chip.title = 'Click para eliminar';
    chip.onclick = () => {
      if (!confirm(`Eliminar tipo ${kind}?`)) return;
      cfg.laborKinds = (cfg.laborKinds || []).filter(k => k !== kind);
      (cfg.technicians || []).forEach(t => {
        t.rates = (t.rates || []).filter(r => r.kind !== kind);
      });
      renderKinds();
      renderTechList();
    };
    container.appendChild(chip);
  });
}

function renderTechList() {
  const list = $('#tk-list');
  if (!list) return;

  list.innerHTML = '';
  (cfg.technicians || []).forEach(tech => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginTop = '8px';
    card.style.borderLeft = `4px solid ${tech.color || '#2563EB'}`;

    card.innerHTML = `
      <div class="row between" style="align-items:center;">
        <div class="row" style="gap:10px;align-items:center;">
          <strong>${tech.name}</strong>
          <label class="row" style="gap:4px;align-items:center;">
            <input type="checkbox" data-role="active" ${tech.active ? 'checked' : ''}/> Activo
          </label>
          <label class="row" style="gap:4px;align-items:center;">
            Color <input type="color" data-role="color" value="${tech.color || '#2563EB'}" />
          </label>
        </div>
        <button class="secondary" data-role="add-rate">+ Tasa</button>
      </div>
      <table class="table small" style="width:100%;margin-top:6px;">
        <thead><tr><th>Tipo</th><th class="t-right">% Tec</th><th></th></tr></thead>
        <tbody data-role="rates"></tbody>
      </table>
    `;

    const ratesBody = card.querySelector('[data-role=rates]');
    const activeChk = card.querySelector('[data-role=active]');
    const colorInput = card.querySelector('[data-role=color]');

    activeChk.addEventListener('change', () => {
      tech.active = activeChk.checked;
    });

    colorInput.addEventListener('input', () => {
      tech.color = colorInput.value || '#2563EB';
      card.style.borderLeft = `4px solid ${tech.color}`;
    });

    function renderRates() {
      ratesBody.innerHTML = '';
      (tech.rates || []).forEach((rate, idx) => {
        const row = document.createElement('tr');
        const options = ['']
          .concat(cfg.laborKinds || [])
          .map(kind => `<option value="${kind}" ${kind === rate.kind ? 'selected' : ''}>${kind}</option>`)
          .join('');

        row.innerHTML = `
          <td><select data-role="kind">${options}</select></td>
          <td class="t-right"><input data-role="percent" type="number" min="0" max="100" step="1" value="${Number(rate.percent || 0) || 0}" style="width:80px;"></td>
          <td class="t-center"><button data-role="delete" class="small danger">-</button></td>
        `;

        const kindSelect = row.querySelector('[data-role=kind]');
        const percentInput = row.querySelector('[data-role=percent]');
        const deleteBtn = row.querySelector('[data-role=delete]');

        kindSelect.addEventListener('change', () => {
          rate.kind = kindSelect.value;
        });
        percentInput.addEventListener('input', () => {
          rate.percent = Number(percentInput.value || 0) || 0;
        });
        deleteBtn.addEventListener('click', () => {
          tech.rates.splice(idx, 1);
          renderRates();
        });

        ratesBody.appendChild(row);
      });
    }

    renderRates();

    card.querySelector('[data-role=add-rate]').addEventListener('click', () => {
      tech.rates = tech.rates || [];
      tech.rates.push({ kind: '', percent: 0 });
      renderRates();
    });

    list.appendChild(card);
  });
}

async function init() {
  try {
    cfg = await API.company.getTechConfig();
  } catch {
    cfg = { laborKinds: [], technicians: [] };
  }

  renderKinds();
  renderTechList();

  $('#tk-add-kind').onclick = () => {
    const value = String($('#tk-new-kind').value || '').trim().toUpperCase();
    if (!value) return;
    if (!(cfg.laborKinds || []).includes(value)) {
      cfg.laborKinds.push(value);
      renderKinds();
      renderTechList();
    }
    $('#tk-new-kind').value = '';
  };

  $('#tk-add-tech').onclick = () => {
    const value = String($('#tk-new-name').value || '').trim().toUpperCase();
    if (!value) return;
    if (!(cfg.technicians || []).some(t => t.name === value)) {
      cfg.technicians = cfg.technicians || [];
      cfg.technicians.push({ name: value, active: true, color: '#2563EB', rates: [] });
      renderTechList();
    }
    $('#tk-new-name').value = '';
  };

  $('#tk-save').onclick = async () => {
    const msg = $('#tk-msg');
    if (msg) msg.textContent = 'Guardando...';
    try {
      const saved = await API.company.setTechConfig(cfg);
      cfg = saved || cfg;
      renderKinds();
      renderTechList();
      if (msg) msg.textContent = 'Cambios guardados';
    } catch (err) {
      if (msg) msg.textContent = err?.message || 'Error';
    }
  };
}

document.addEventListener('DOMContentLoaded', init);
