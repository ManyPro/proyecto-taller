import { api } from './api.esm.js';

function el(id){ return document.getElementById(id); }
function htmlEscape(s){ return (s||'').replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

async function loadConcepts(){
  const list = await api.get('/api/v1/payroll/concepts');
  // poblar selector de conceptos
  const sel = document.getElementById('pa-conceptSel');
  if (sel) {
    sel.innerHTML = '<option value="">Seleccione concepto…</option>' + list.map(c => `<option value="${c._id}">${htmlEscape(c.code)} · ${htmlEscape(c.name)}</option>`).join('');
  }
  const rows = list.map(c => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--muted-border)">
    <div class="row" style="gap:8px;align-items:center;">
      <span class="tag">${htmlEscape(c.type)}</span>
      <strong>${htmlEscape(c.code)}</strong> ${htmlEscape(c.name)}
      <em class="muted">(${htmlEscape(c.amountType)}: ${c.defaultValue})</em>
    </div>
    <div class="row" style="gap:6px;">
      <button data-id="${c._id}" class="secondary x-del">Eliminar</button>
    </div>
  </div>`);
  el('pc-list').innerHTML = rows.join('') || '<div class="muted">Sin conceptos</div>';
  el('pc-list').querySelectorAll('.x-del').forEach(btn => btn.addEventListener('click', async () => {
    await api.del(`/api/v1/payroll/concepts/${btn.getAttribute('data-id')}`);
    await loadConcepts();
  }));
}

async function addConcept(){
  const payload = {
    type: el('pc-type').value,
    amountType: el('pc-amountType').value,
    code: el('pc-code').value.trim(),
    name: el('pc-name').value.trim(),
    defaultValue: parseFloat(el('pc-value').value || '0'),
    isActive: true
  };
  if(!payload.code || !payload.name) return alert('Completa código y nombre');
  await api.post('/api/v1/payroll/concepts', payload);
  el('pc-code').value = '';
  el('pc-name').value = '';
  el('pc-value').value = '';
  await loadConcepts();
}

async function loadTechnicians(){
  const r = await api.get('/api/v1/company/technicians');
  const names = r.technicians || [];
  const opts = names.map(n => `<option value="${htmlEscape(n)}">${htmlEscape(n)}</option>`).join('');
  const techSel = document.getElementById('pl-technicianSel');
  if (techSel) techSel.innerHTML = '<option value="">Seleccione técnico…</option>' + opts;
  const techSel2 = document.getElementById('pa-technicianSel');
  if (techSel2) techSel2.innerHTML = '<option value="">Seleccione técnico…</option>' + opts;
}

async function loadOpenPeriods(){
  const list = await api.get('/api/v1/payroll/periods/open');
  const sel = document.getElementById('pl-periodSel');
  if (sel) sel.innerHTML = '<option value="">Seleccione período…</option>' + list.map(p => `<option value="${p._id}">${new Date(p.startDate).toLocaleDateString()} → ${new Date(p.endDate).toLocaleDateString()}</option>`).join('');
}

async function loadAssignments(){
  const techName = document.getElementById('pa-technicianSel').value;
  if (!techName) return (el('pa-list').innerHTML = 'Selecciona técnico');
  const list = await api.get('/api/v1/payroll/assignments', { technicianName: techName });
  el('pa-list').innerHTML = list.map(a => `${a.conceptId} = ${a.valueOverride ?? '—'}`).join('<br/>') || 'Sin asignaciones';
}

async function saveAssignment(){
  const payload = {
    technicianName: document.getElementById('pa-technicianSel').value,
    conceptId: document.getElementById('pa-conceptSel').value,
    valueOverride: el('pa-value').value ? parseFloat(el('pa-value').value) : null,
    isActive: true
  };
  if(!payload.technicianName || !payload.conceptId) return alert('Selecciona técnico y concepto');
  await api.post('/api/v1/payroll/assignments', payload);
  await loadAssignments();
}

async function preview(){
  const payload = {
    periodId: document.getElementById('pl-periodSel').value,
    technicianId: '',
    technicianName: document.getElementById('pl-technicianSel').value,
    baseSalary: parseFloat(el('pl-base').value || '0')
  };
  const r = await api.post('/api/v1/payroll/settlements/preview', payload);
  el('pl-result').innerHTML = `
    <div class="row between"><strong>Ingresos y descuentos</strong><span>Total neto: ${r.netTotal}</span></div>
    ${r.items.map(i => `<div class="row between" style="padding:4px 0;">
      <div class="row" style="gap:6px;align-items:center;">
        <span class="tag">${htmlEscape(i.type)}</span>
        ${htmlEscape(i.name)}
      </div>
      <div>${i.value}</div>
    </div>`).join('')}
  `;
}

async function approve(){
  const payload = {
    periodId: document.getElementById('pl-periodSel').value,
    technicianId: '',
    technicianName: document.getElementById('pl-technicianSel').value,
    baseSalary: parseFloat(el('pl-base').value || '0')
  };
  const r = await api.post('/api/v1/payroll/settlements/approve', payload);
  el('pl-result').innerHTML = `<div class="success">Liquidación aprobada. Neto: ${r.netTotal}. ID: ${r._id}</div>`;
  await loadSettlements();
}

async function pay(){
  const payload = {
    settlementId: el('pp-settlementId').value.trim(),
    accountId: el('pp-accountId').value.trim()
  };
  const r = await api.post('/api/v1/payroll/settlements/pay', payload);
  el('pp-result').innerHTML = `<div class="success">Pago registrado en flujo de caja. CashFlow: ${r.cashflow._id}</div>`;
  await loadSettlements();
}

async function loadSettlements(){
  const periodId = (document.getElementById('pl-periodSel')||{}).value || '';
  const q = periodId ? { periodId } : {};
  const r = await api.get('/api/v1/payroll/settlements', q);
  const items = r.items || [];
  const summary = r.summary || { grossTotal:0, deductionsTotal:0, netTotal:0 };
  const rows = items.map(s => `<div class="row between" style="padding:4px 0;border-bottom:1px solid var(--muted-border)">
    <div class="row" style="gap:8px;align-items:center;">
      <span class="tag">${s.status}</span>
      <span class="muted">${new Date(s.createdAt).toLocaleString()}</span>
      <span class="muted">Técnico: ${htmlEscape(s.technicianName||'')}</span>
    </div>
    <div class="row" style="gap:16px;">
      <span>Bruto: <strong>${s.grossTotal}</strong></span>
      <span>Desc: <strong>${s.deductionsTotal}</strong></span>
      <span>Neto: <strong>${s.netTotal}</strong></span>
      <a class="secondary" href="${window.API_BASE}/api/v1/payroll/settlements/${s._id}/print" target="_blank">Imprimir</a>
      <a class="secondary" href="${window.API_BASE}/api/v1/payroll/settlements/${s._id}/pdf" target="_blank">PDF</a>
    </div>
  </div>`).join('');
  const containerId = 'pl-result';
  const base = document.getElementById(containerId).innerHTML;
  document.getElementById(containerId).innerHTML = `${base}
    <div style="margin-top:12px">
      <h4>Liquidaciones del período</h4>
      <div>${rows || '<div class="muted">Sin liquidaciones aún</div>'}</div>
      <div class="row right" style="gap:16px;margin-top:6px;">
        <span>Total Bruto: <strong>${summary.grossTotal}</strong></span>
        <span>Total Desc: <strong>${summary.deductionsTotal}</strong></span>
        <span>Total Neto: <strong>${summary.netTotal}</strong></span>
      </div>
    </div>`;
}

async function createPeriod(){
  const start = document.getElementById('ppd-start').value;
  const end = document.getElementById('ppd-end').value;
  const type = document.getElementById('ppd-type').value || 'monthly';
  if(!start || !end) return alert('Selecciona fechas de inicio y fin');
  const r = await api.post('/api/v1/payroll/periods', { startDate: start, endDate: end, periodType: type });
  document.getElementById('ppd-msg').innerText = `Período creado: ${new Date(r.startDate).toLocaleDateString()} → ${new Date(r.endDate).toLocaleDateString()}`;
  await loadOpenPeriods();
}

function init(){
  el('pc-add').addEventListener('click', addConcept);
  el('pa-save').addEventListener('click', saveAssignment);
  const tSel = document.getElementById('pa-technicianSel');
  if (tSel) tSel.addEventListener('change', loadAssignments);
  el('pl-preview').addEventListener('click', preview);
  el('pl-approve').addEventListener('click', approve);
  el('pp-pay').addEventListener('click', pay);
  const btnCreate = document.getElementById('ppd-create');
  if (btnCreate) btnCreate.addEventListener('click', createPeriod);
  loadConcepts();
  loadTechnicians();
  loadOpenPeriods();
  // Cargar listados al inicio
  setTimeout(loadSettlements, 0);
}

document.addEventListener('DOMContentLoaded', init);


