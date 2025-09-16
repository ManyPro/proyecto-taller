// Frontend/assets/js/quotes.js
import { API } from './api.js';

export function initQuotes() {
  // Elementos (deberás crear estos IDs en index.html)
  const root = document.getElementById('tab-cotizaciones');
  if (!root) return; // por si aún no has agregado la pestaña

  const form = {
    plate: root.querySelector('#q-plate'),
    owner: root.querySelector('#q-owner'),
    make:  root.querySelector('#q-make'),
    line:  root.querySelector('#q-line'),
    year:  root.querySelector('#q-year'),
    cc:    root.querySelector('#q-cc'),
    validity: root.querySelector('#q-validity'),
    addRowBtn: root.querySelector('#q-add-row'),
    saveBtn:   root.querySelector('#q-save'),
    waBtn:     root.querySelector('#q-wa'),
    pdfBtn:    root.querySelector('#q-pdf'),
    tbody:     root.querySelector('#q-items-body'),
    total:     root.querySelector('#q-total'),
  };

  const listBox = root.querySelector('#quotesList');

  // Estado simple de filas
  let rows = [];

  function addRow(data = {}) {
    const row = {
      kind: data.kind || 'Producto',
      description: data.description || '',
      qty: data.qty ?? '',
      unitPrice: data.unitPrice ?? ''
    };
    rows.push(row);
    renderRows();
  }

  function removeRow(idx) {
    rows.splice(idx, 1);
    renderRows();
  }

  function renderRows() {
    const frag = document.createDocumentFragment();
    let total = 0;
    rows.forEach((r, idx) => {
      const tr = document.createElement('tr');

      // Tipo
      const tdKind = document.createElement('td');
      tdKind.innerHTML = `
        <select data-k="kind">
          <option value="Producto"${r.kind==='Producto'?' selected':''}>Producto</option>
          <option value="Servicio"${r.kind==='Servicio'?' selected':''}>Servicio</option>
        </select>`;
      // Desc
      const tdDesc = document.createElement('td');
      tdDesc.innerHTML = `<input data-k="description" placeholder="Descripción" value="${r.description||''}">`;
      // Cant
      const tdQty = document.createElement('td');
      tdQty.innerHTML = `<input data-k="qty" type="number" min="0" step="1" value="${r.qty ?? ''}">`;
      // Unit
      const tdUnit = document.createElement('td');
      tdUnit.innerHTML = `<input data-k="unitPrice" type="number" min="0" step="1" value="${r.unitPrice ?? ''}">`;
      // Subtotal
      const tdSub = document.createElement('td');
      const qtyN = r.qty === '' || r.qty == null ? 1 : Number(r.qty);
      const unitN = Number(r.unitPrice || 0);
      const subtotal = (qtyN * unitN) || 0;
      total += subtotal;
      tdSub.textContent = currency(subtotal);
      // Acciones
      const tdAct = document.createElement('td');
      tdAct.innerHTML = `<button class="secondary" data-act="del">Eliminar</button>`;

      tr.append(tdKind, tdDesc, tdQty, tdUnit, tdSub, tdAct);
      tr.dataset.idx = idx;

      // listeners de inputs
      tr.addEventListener('input', (e) => {
        const k = e.target.getAttribute('data-k');
        if (!k) return;
        const v = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
        rows[idx][k] = v;
        renderRows();
      });
      tr.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act="del"]');
        if (btn) removeRow(idx);
      });

      frag.appendChild(tr);
    });
    form.tbody.innerHTML = '';
    form.tbody.appendChild(frag);
    form.total.textContent = currency(total);
  }

  function currency(n) {
    return '$' + (Math.round(Number(n)||0)).toLocaleString('es-CO');
  }

  async function saveQuote() {
    try {
      const payload = {
        customer: { name: form.owner.value || '' },
        vehicle: {
          plate: form.plate.value || '',
          make:  form.make.value  || '',
          line:  form.line.value  || '',
          modelYear: form.year.value || '',
          displacement: form.cc.value || '',
        },
        validity: form.validity.value || '',
        items: rows.map(r => ({
          kind: r.kind,
          description: r.description,
          qty: r.qty === '' ? null : Number(r.qty),
          unitPrice: Number(r.unitPrice || 0)
        }))
      };
      const doc = await API.post('/api/v1/quotes', payload);
      alert(`Cotización creada: ${doc.number}`);
      rows = [];
      addRow(); // deja una fila vacía para seguir
      await loadList();
    } catch (e) {
      alert('Error al guardar: ' + e.message);
    }
  }

  async function loadList() {
    try {
      const list = await API.get('/api/v1/quotes');
      const frag = document.createDocumentFragment();
      for (const q of list) {
        const div = document.createElement('div');
        div.className = 'note';
        div.innerHTML = `
          <div>
            <div class="plate">#${q.number}</div>
            <div class="content">${q.vehicle?.make||''} ${q.vehicle?.line||''} ${q.vehicle?.modelYear||''} — ${q.vehicle?.plate||''}</div>
          </div>
          <div class="content">${new Date(q.createdAt).toLocaleString()}</div>
          <div class="actions">
            <button class="secondary" data-id="${q._id}" data-act="whatsapp">WhatsApp</button>
            <button class="secondary" data-id="${q._id}" data-act="pdf">PDF</button>
            <button class="danger" data-id="${q._id}" data-act="del">Eliminar</button>
          </div>
        `;
        frag.appendChild(div);
      }
      listBox.innerHTML = '';
      listBox.appendChild(frag);
    } catch (e) {
      console.error(e);
    }
  }

  function composeWhatsAppText() {
    const v = {
      plate: form.plate.value || '',
      make:  form.make.value || '',
      line:  form.line.value || '',
      year:  form.year.value || '',
      owner: form.owner.value || '',
      validity: form.validity.value || '',
    };

    let total = 0;
    const lines = [];
    lines.push(`Te cotizó CASA RENAULT H&H para ${v.make} ${v.line} ${v.year}, placas ${v.plate}`);
    if (v.owner) lines.push(`Cliente: ${v.owner}`);

    rows.forEach(r => {
      const qty = (r.qty === '' || r.qty == null) ? null : Number(r.qty);
      const unit = Number(r.unitPrice || 0);
      const subtotal = (qty ? qty : 1) * unit;
      total += subtotal;

      lines.push(``);
      lines.push(`✅ ${r.description || r.kind}`);
      if (qty) {
        lines.push(`${currency(subtotal)} ( ${qty} × ${currency(unit)} )`);
      } else {
        lines.push(`${currency(subtotal)}`);
      }
    });

    lines.push(``);
    lines.push(`TOTAL: ${currency(total)}`);
    lines.push(`(Valores SIN IVA)`);
    if (v.validity) lines.push(`(Validez: ${v.validity})`);

    return lines.join('\n');
  }

  function goWhatsApp() {
    const text = composeWhatsAppText();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  // eventos
  form.addRowBtn.addEventListener('click', () => addRow());
  form.saveBtn.addEventListener('click', saveQuote);
  form.waBtn.addEventListener('click', goWhatsApp);
  form.pdfBtn.addEventListener('click', () => alert('PDF se generará en la siguiente iteración (mismo formato aprobado).'));

  // arranque
  addRow();
  loadList();
}
