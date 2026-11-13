import { API } from './api.esm.js';

const WHEN = [
  ['frio', 'Frío'],
  ['caliente', 'Caliente'],
  ['ralenti', 'Ralentí'],
  ['aceleracion', 'Aceleración'],
  ['carga', 'Carga'],
  ['arranque', 'Arranque'],
  ['intermitente', 'Intermitente']
];
const STATUS_LABEL = {
  abierto: 'Abierto',
  esperando_medicion: 'Esperando medición',
  pausado: 'Pausado',
  pendiente_verificacion: 'Pendiente de verificación',
  cerrado: 'Cerrado'
};
const STATUS_CLASS = {
  abierto: 'dx-badge-open',
  esperando_medicion: 'dx-badge-wait',
  pausado: 'dx-badge-pause',
  pendiente_verificacion: 'dx-badge-verify',
  cerrado: 'dx-badge-closed'
};
const LEVEL_LABEL = {
  posible: 'posible',
  respaldada_por_estas_pruebas: 'respaldada por estas pruebas',
  confirmada_por_el_tecnico: 'confirmada por el técnico'
};

const state = {
  meta: null,
  cases: [],
  current: null,
  view: 'list',
  busy: false,
  started: false
};

function $(id) { return document.getElementById(id); }
function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function flash(msg, kind = 'warn') {
  const box = $('dx-flash');
  if (!box) return;
  box.className = `mb-3 dx-alert dx-alert-${kind === 'ok' ? 'ok' : kind === 'error' ? 'error' : 'warn'}`;
  box.textContent = msg;
  box.classList.remove('hidden');
}
function clearFlash() {
  const box = $('dx-flash');
  if (box) { box.classList.add('hidden'); box.textContent = ''; }
}

function showView(name) {
  state.view = name;
  ['list', 'form', 'case', 'docs', 'usage'].forEach((v) => {
    const node = $(`view-${v}`);
    if (node) node.classList.toggle('hidden', v !== name);
  });
  document.querySelectorAll('[data-dx-view]').forEach((btn) => {
    if (btn.tagName === 'BUTTON' && btn.closest('.dx-tabs')) {
      btn.classList.toggle('active', btn.getAttribute('data-dx-view') === name);
    }
  });
}

function badge(status) {
  return `<span class="dx-badge ${STATUS_CLASS[status] || ''}">${esc(STATUS_LABEL[status] || status)}</span>`;
}

function addParamRow(row = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="dx-input" data-p="name" value="${esc(row.name || '')}" placeholder="MAP / TPS" /></td>
    <td><input class="dx-input" data-p="value" value="${esc(row.value || '')}" /></td>
    <td><input class="dx-input" data-p="unit" value="${esc(row.unit || '')}" placeholder="kPa, V, %" /></td>
    <td><input class="dx-input" data-p="condition" value="${esc(row.condition || '')}" placeholder="ralenti, 90 °C" /></td>`;
  $('dx-param-body').appendChild(tr);
}
function addDtcRow(row = {}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="dx-input" data-d="code" value="${esc(row.code || '')}" placeholder="P0106" /></td>
    <td><input class="dx-input" data-d="description" value="${esc(row.description || '')}" placeholder="Descripción AUTEL" /></td>
    <td><input class="dx-input" data-d="status" value="${esc(row.status || '')}" placeholder="stored / current" /></td>`;
  $('dx-dtc-body').appendChild(tr);
}

function collectRows(tbodyId, keys, attr) {
  return Array.from($(tbodyId)?.querySelectorAll('tr') || []).map((tr) => {
    const o = {};
    keys.forEach((k) => { o[k] = tr.querySelector(`[${attr}="${k}"]`)?.value?.trim() || ''; });
    return o;
  }).filter((o) => Object.values(o).some(Boolean));
}

function fillEngines() {
  const sel = $('dx-engine');
  if (!sel) return;
  const engines = state.meta?.engines || [];
  sel.innerHTML = engines.map((e) => `<option value="${esc(e.code)}">${esc(e.label)}</option>`).join('');
  sel.value = 'UNKNOWN';
}

function fillWhen() {
  const wrap = $('dx-when');
  if (!wrap) return;
  wrap.innerHTML = WHEN.map(([v, l]) => `<label class="flex items-center gap-1"><input type="checkbox" name="when" value="${v}" /> ${l}</label>`).join('');
}

async function loadMeta() {
  const meta = await API.diagnosis.meta();
  state.meta = meta;
  const pill = $('dx-status-pill');
  if (pill) {
    const ai = meta.openai?.configured ? `IA lista · ${meta.openai.model}` : 'IA pendiente: falta OPENAI_API_KEY en el backend';
    pill.textContent = `${ai} · ${meta.knowledge?.label || ''}`;
  }
  fillEngines();
  fillWhen();
  if (!meta.openai?.configured) {
    flash('El asistente está listo en código, pero falta OPENAI_API_KEY en el servidor. El caso se puede crear; la primera orientación fallará hasta configurar la clave. Ver DIAGNOSTICO_RENAULT_IA.md', 'warn');
  }
}

async function loadCases() {
  const q = $('dx-search')?.value?.trim() || '';
  const status = $('dx-status-filter')?.value || '';
  const res = await API.diagnosis.list({ q, status });
  state.cases = res.items || [];
  const box = $('dx-case-list');
  if (!state.cases.length) {
    box.innerHTML = `<div class="dx-panel dx-muted">No hay casos. Crea uno para recibir la primera comprobación.</div>`;
    return;
  }
  box.innerHTML = state.cases.map((c) => `
    <button type="button" class="dx-card w-full text-left p-3 dx-case-open" data-id="${esc(c.id)}">
      <div class="flex justify-between gap-2 items-start">
        <div>
          <div class="font-semibold dx-text">#${esc(c.caseNumber)} · ${esc(c.title || c.vehicle?.model || 'Caso')}</div>
          <div class="text-xs dx-muted mt-1">${esc(c.vehicle?.engineLabel || c.vehicle?.engineCode || '')} · ${esc(c.symptom?.main || '')}</div>
          <div class="text-xs dx-muted">${esc(c.pendingTestTitle || '')}</div>
        </div>
        ${badge(c.status)}
      </div>
    </button>`).join('');
  box.querySelectorAll('.dx-case-open').forEach((btn) => {
    btn.addEventListener('click', () => openCase(btn.getAttribute('data-id')));
  });
}

async function openCase(id) {
  clearFlash();
  const res = await API.diagnosis.get(id);
  state.current = res.item;
  renderCase();
  showView('case');
}

function originLabel(p) {
  const map = {
    fabricante: 'especificación de fabricante',
    orientativa_general: 'referencia general orientativa',
    vehiculo_sano: 'medición de vehículo sano',
    pendiente: 'especificación pendiente'
  };
  return map[p] || p;
}

function renderNow(out) {
  const box = $('dx-now');
  if (!out?.proximaPrueba) {
    box.innerHTML = `<p class="dx-muted text-sm">Aún no hay una comprobación activa.</p>`;
    return;
  }
  const t = out.proximaPrueba;
  const params = (t.parametros || []).map((p) => `
    <li class="mb-1">
      <strong>${esc(p.nombreOriginal)}</strong>
      ${p.nombresAlternativos?.length ? ` <span class="dx-muted">(${esc(p.nombresAlternativos.join(' / '))})</span>` : ''}
      · unidad ${esc(p.unidadEsperada || 'no indicada')}
      · ${esc(originLabel(p.procedenciaReferencia))}${p.referencia ? `: ${esc(p.referencia)}` : ''}
    </li>`).join('');
  box.innerHTML = `
    <p class="text-xs font-bold tracking-wide dx-muted">QUÉ REVISAR AHORA</p>
    <h2 class="text-lg font-bold dx-text mt-1">${esc(t.titulo)}</h2>
    <p class="text-sm dx-text mt-2">${esc(out.interpretacion || '')}</p>
    <p class="text-sm mt-2"><strong>Cómo:</strong> ${esc(t.comoRealizarla)}</p>
    <p class="text-sm"><strong>Condiciones:</strong> ${esc(t.condiciones)}</p>
    ${params ? `<ul class="text-sm mt-2 list-disc pl-4">${params}</ul>` : ''}
    <p class="text-sm mt-2"><strong>Qué puede significar:</strong> ${esc(t.quePuedeSignificar)}</p>
    <p class="text-sm"><strong>Qué responder:</strong> ${esc(t.queResponder)}</p>
    ${out.limitaciones ? `<p class="text-xs dx-muted mt-2">${esc(out.limitaciones)}</p>` : ''}
  `;
}

function renderReplyForm(out) {
  const box = $('dx-reply');
  const closed = state.current?.status === 'cerrado' || state.current?.status === 'pausado';
  if (closed) {
    box.innerHTML = `<p class="text-sm dx-muted">El caso está ${esc(STATUS_LABEL[state.current.status])}. ${state.current.status === 'pausado' ? 'Reábrelo para continuar.' : ''}</p>`;
    return;
  }
  const params = out?.proximaPrueba?.parametros || [];
  const fields = params.map((p, i) => {
    const id = `m-${i}`;
    if (p.tipoEntrada === 'si_no') {
      return `<div><label class="dx-label block mb-1">${esc(p.nombreOriginal)} (${esc(p.unidadEsperada || 'sí/no')})</label>
        <select class="dx-select" data-m="${i}" data-name="${esc(p.nombreOriginal)}" data-unit="${esc(p.unidadEsperada || '')}">
          <option value="">—</option><option value="si">Sí</option><option value="no">No</option>
        </select></div>`;
    }
    if (p.tipoEntrada === 'numero') {
      return `<div><label class="dx-label block mb-1">${esc(p.nombreOriginal)} (${esc(p.unidadEsperada || 'número')})</label>
        <input class="dx-input" data-m="${i}" data-name="${esc(p.nombreOriginal)}" data-unit="${esc(p.unidadEsperada || '')}" inputmode="decimal" placeholder="${esc(p.unidadEsperada || '')}" /></div>`;
    }
    return `<div><label class="dx-label block mb-1">${esc(p.nombreOriginal)}</label>
      <input class="dx-input" data-m="${i}" data-name="${esc(p.nombreOriginal)}" data-unit="${esc(p.unidadEsperada || '')}" /></div>`;
  }).join('');
  box.innerHTML = `
    <h3 class="font-semibold dx-text mb-2">Lo observado</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">${fields}</div>
    <label class="dx-label block mb-1">Notas / unidad / condición</label>
    <textarea id="dx-note" rows="2" class="dx-area" placeholder="Ej: MAP 28 kPa, ralenti, 90 °C, A/C off. Si falta unidad, indícalo."></textarea>
    <div class="flex flex-wrap gap-2 mt-3">
      <button type="button" id="dx-send" class="dx-btn dx-btn-primary">Enviar al asistente</button>
      <button type="button" class="dx-btn dx-btn-secondary" data-skip="no_encuentro_parametro">No encuentro ese parámetro</button>
      <button type="button" class="dx-btn dx-btn-secondary" data-skip="no_tengo_herramienta">No tengo esa herramienta</button>
      <button type="button" class="dx-btn dx-btn-warn" data-skip="no_puedo_realizar_prueba">No puedo realizar esta prueba</button>
    </div>
  `;
  $('dx-send')?.addEventListener('click', () => sendTurn());
  box.querySelectorAll('[data-skip]').forEach((btn) => {
    btn.addEventListener('click', () => sendTurn({ skip: btn.getAttribute('data-skip') }));
  });
}

function renderThread() {
  const box = $('dx-thread');
  const msgs = state.current?.messages || [];
  box.innerHTML = `<h3 class="font-semibold dx-text mb-2">Conversación</h3>` + (msgs.map((m) => {
    const klass = m.role === 'user' ? 'dx-msg-user' : 'dx-msg-assistant';
    const who = m.role === 'user' ? 'Técnico' : 'Asistente';
    const extra = m.structured?.proximaPrueba?.titulo ? `<div class="text-xs mt-1 dx-muted">Siguiente: ${esc(m.structured.proximaPrueba.titulo)}</div>` : '';
    return `<div class="rounded-lg p-2 ${klass}"><div class="text-xs dx-muted">${esc(who)} · ${esc(m.createdAt ? new Date(m.createdAt).toLocaleString() : '')}</div><div class="text-sm dx-text whitespace-pre-wrap">${esc(m.content)}</div>${extra}</div>`;
  }).join('') || `<p class="dx-muted text-sm">Sin mensajes.</p>`);
  box.scrollTop = box.scrollHeight;
}

function renderSide() {
  const hyps = state.current?.hypotheses || [];
  $('dx-hyps').innerHTML = `<h3 class="font-semibold dx-text mb-2">Hipótesis y evidencias</h3>` +
    (hyps.length ? hyps.map((h) => `<div class="mb-2"><div class="font-medium dx-text">${esc(h.titulo)}</div><div class="text-xs dx-muted">${esc(LEVEL_LABEL[h.nivel] || h.nivel)}</div><div class="text-sm">${esc(h.justificacion)}</div></div>`).join('') : `<p class="text-sm dx-muted">Aún no hay hipótesis con evidencia suficiente.</p>`) +
    `<div class="mt-2 text-xs dx-muted">${(state.current?.evidence || []).map((e) => esc(e.descripcion)).join(' · ')}</div>` +
    `<div class="mt-2 text-xs">${(state.current?.retrievedSources || []).map((s) => `${esc(s.title)} — ${esc(s.source)} ${esc(s.section || '')}`).join('<br>') || 'Fuentes: Base técnica pendiente de cargar'}</div>`;

  const meas = state.current?.measurements || [];
  $('dx-meas').innerHTML = `<h3 class="font-semibold dx-text mb-2">Historial de mediciones</h3>` +
    (meas.length ? `<table class="dx-table"><thead><tr><th>Fecha</th><th>Parámetro</th><th>Valor</th><th>Condición</th></tr></thead><tbody>${meas.slice().reverse().map((m) => `<tr><td>${esc(m.at ? new Date(m.at).toLocaleString() : '')}</td><td>${esc(m.name)}</td><td>${esc(m.value)} ${esc(m.unit)}</td><td>${esc(m.condition || m.note || '')}</td></tr>`).join('')}</tbody></table>` : `<p class="text-sm dx-muted">Sin mediciones aún.</p>`);

  const c = state.current;
  $('dx-closebox').innerHTML = `
    <h3 class="font-semibold dx-text mb-2">Reparación y cierre</h3>
    <p class="text-xs dx-muted mb-2">La IA puede sugerir; el técnico confirma.</p>
    <label class="dx-label block mb-1">Reparación aplicada</label>
    <textarea id="dx-repair" rows="2" class="dx-area">${esc(c.repair?.applied || '')}</textarea>
    <button type="button" id="dx-save-repair" class="dx-btn dx-btn-secondary mt-2">Registrar reparación</button>
    <label class="dx-label block mb-1 mt-3">Verificación posterior</label>
    <textarea id="dx-verify" rows="2" class="dx-area">${esc(c.verification?.result || '')}</textarea>
    <button type="button" id="dx-save-verify" class="dx-btn dx-btn-secondary mt-2">Registrar verificación</button>
    <label class="flex items-center gap-2 text-sm dx-text mt-3"><input type="checkbox" id="dx-reviewed" ${c.reviewedByWorkshop ? 'checked' : ''}/> Caso revisado por el taller (antecedente)</label>
    <button type="button" id="dx-close" class="dx-btn dx-btn-green mt-3 w-full">Cerrar caso</button>
  `;
  $('dx-save-repair')?.addEventListener('click', async () => {
    try {
      const res = await API.diagnosis.repair(c.id, { applied: $('dx-repair').value });
      state.current = res.item; renderCase(); flash('Reparación registrada', 'ok');
    } catch (e) { flash(e.message, 'error'); }
  });
  $('dx-save-verify')?.addEventListener('click', async () => {
    try {
      const res = await API.diagnosis.verify(c.id, { result: $('dx-verify').value });
      state.current = res.item; renderCase(); flash('Verificación registrada', 'ok');
    } catch (e) { flash(e.message, 'error'); }
  });
  $('dx-close')?.addEventListener('click', async () => {
    try {
      const res = await API.diagnosis.close(c.id, { reviewedByWorkshop: $('dx-reviewed').checked });
      state.current = res.item; renderCase(); flash('Caso cerrado por el técnico', 'ok');
    } catch (e) { flash(e.message, 'error'); }
  });
}

function renderHead() {
  const c = state.current;
  $('dx-case-head').innerHTML = `
    <div class="flex justify-between gap-2 flex-wrap">
      <div>
        <div class="font-bold dx-text">#${esc(c.caseNumber)} · ${esc(c.title)}</div>
        <div class="text-sm dx-muted">${esc(c.vehicle?.model)} ${esc(c.vehicle?.year || '')} · ${esc(c.vehicle?.engineLabel || c.vehicle?.engineCode)} · ${esc(c.conditions?.city || 'Bogotá')}</div>
        <div class="text-sm">${esc(c.symptom?.main)} · DTC: ${esc(c.symptom?.dtcStatus)}</div>
      </div>
      ${badge(c.status)}
    </div>
    ${c.lastError ? `<p class="dx-alert dx-alert-error mt-2">${esc(c.lastError)}</p>` : ''}
  `;
}

function renderCase() {
  if (!state.current) return;
  renderHead();
  renderNow(state.current.lastAssistantOutput);
  renderReplyForm(state.current.lastAssistantOutput);
  renderThread();
  renderSide();
  renderPrint();
}

function renderPrint() {
  const c = state.current;
  if (!c) return;
  const out = c.lastAssistantOutput || {};
  $('print-root').innerHTML = `
    <h1>Resumen de diagnóstico #${esc(c.caseNumber)}</h1>
    <p>${esc(c.title)} · ${esc(STATUS_LABEL[c.status])}</p>
    <p>${esc(c.vehicle?.model)} ${esc(c.vehicle?.year || '')} ${esc(c.vehicle?.engineLabel || '')} · ${esc(c.conditions?.city)}</p>
    <h2>Síntoma</h2><p>${esc(c.symptom?.main)} — ${esc(c.symptom?.description || '')}</p>
    <h2>Interpretación</h2><p>${esc(out.interpretacion || '')}</p>
    <h2>Hipótesis</h2>
    <ul>${(c.hypotheses || []).map((h) => `<li>${esc(h.titulo)} (${esc(LEVEL_LABEL[h.nivel] || h.nivel)}): ${esc(h.justificacion)}</li>`).join('')}</ul>
    <h2>Mediciones</h2>
    <ul>${(c.measurements || []).map((m) => `<li>${esc(m.at)} ${esc(m.name)} = ${esc(m.value)} ${esc(m.unit)} (${esc(m.condition)})</li>`).join('')}</ul>
    <h2>Reparación</h2><p>${esc(c.repair?.applied || 'Pendiente')}</p>
    <h2>Verificación</h2><p>${esc(c.verification?.result || 'Pendiente')}</p>
    <h2>Fuentes usadas</h2>
    <ul>${(c.retrievedSources || []).map((s) => `<li>${esc(s.title)} — ${esc(s.source)} ${esc(s.versionOrDate)} ${esc(s.section)}</li>`).join('') || '<li>Base técnica pendiente de cargar</li>'}</ul>
    <p>Prompt ${esc(c.promptVersion || '')}. El técnico confirma el cierre. No es un diagnóstico automático de pieza.</p>
  `;
}

function gatherMeasurements() {
  return Array.from(document.querySelectorAll('[data-m]')).map((input) => ({
    name: input.getAttribute('data-name'),
    value: input.value,
    unit: input.getAttribute('data-unit') || '',
    condition: ''
  })).filter((m) => String(m.value || '').trim() !== '');
}

async function sendTurn({ skip } = {}) {
  if (!state.current || state.busy) return;
  const measurements = gatherMeasurements();
  const note = $('dx-note')?.value?.trim() || '';
  let payload;
  if (skip) {
    payload = { kind: 'omitir', skipReason: skip, text: note || skip, clientRequestId: crypto.randomUUID() };
  } else if (measurements.length) {
    payload = { kind: measurements.length > 1 ? 'grupo' : 'medicion', measurements, note, text: note, clientRequestId: crypto.randomUUID() };
  } else if (note) {
    payload = { kind: 'texto', text: note, clientRequestId: crypto.randomUUID() };
  } else {
    flash('Escribe lo observado o una medición', 'warn');
    return;
  }
  state.busy = true;
  try {
    const res = await API.diagnosis.turn(state.current.id, payload);
    state.current = res.item;
    renderCase();
    clearFlash();
    if (res.deduplicated) flash('Se reutilizó la última respuesta (sin duplicar la consulta).', 'ok');
  } catch (e) {
    flash(e.message || 'Error al consultar el asistente', 'error');
    if (e.message) {
      try {
        const fresh = await API.diagnosis.get(state.current.id);
        state.current = fresh.item;
        renderCase();
      } catch { /* keep current */ }
    }
  } finally {
    state.busy = false;
  }
}

function formPayload(form) {
  const fd = new FormData(form);
  const when = Array.from(form.querySelectorAll('input[name="when"]:checked')).map((i) => i.value);
  return {
    model: fd.get('model'),
    year: fd.get('year'),
    engineCode: fd.get('engineCode'),
    engineNotes: fd.get('engineNotes'),
    mileageKm: fd.get('mileageKm'),
    plate: fd.get('plate'),
    transmission: fd.get('transmission'),
    fuel: fd.get('fuel'),
    cngConversion: form.querySelector('[name="cngConversion"]').checked,
    mainSymptom: fd.get('mainSymptom'),
    description: fd.get('description'),
    when,
    dtcStatus: fd.get('dtcStatus'),
    dtcs: collectRows('dx-dtc-body', ['code', 'description', 'status'], 'data-d'),
    engineRunning: fd.get('engineRunning'),
    coolantTemp: fd.get('coolantTemp'),
    rpm: fd.get('rpm'),
    ac: fd.get('ac'),
    city: fd.get('city') || 'Bogotá',
    recentRepairs: fd.get('recentRepairs'),
    testsDone: fd.get('testsDone'),
    ecuIdentification: fd.get('ecuIdentification'),
    ecuSoftware: fd.get('ecuSoftware'),
    freezeFrame: fd.get('freezeFrame'),
    parameters: collectRows('dx-param-body', ['name', 'value', 'unit', 'condition'], 'data-p'),
    includeReviewedCases: form.querySelector('[name="includeReviewedCases"]').checked
  };
}

async function loadDocs() {
  const res = await API.diagnosis.documents.list();
  $('dx-docs-label').textContent = res.label || '';
  const box = $('dx-docs-list');
  if (!res.items?.length) {
    box.innerHTML = `<div class="dx-panel dx-muted">Base técnica pendiente de cargar. No se rellenan valores inventados.</div>`;
    return;
  }
  box.innerHTML = res.items.map((d) => `
    <div class="dx-card p-3">
      <div class="font-semibold dx-text">${esc(d.title)}</div>
      <div class="text-xs dx-muted">${esc(d.source)} · ${esc(d.versionOrDate || '')} · ${esc(d.application || '')} · ${esc(d.section || '')} · motor ${esc(d.engineCode || '—')}</div>
      <div class="text-xs mt-1">${d.reviewed ? 'Revisada' : 'Pendiente de revisión'} ${d.active ? '' : '· inactiva'}</div>
      <div class="flex gap-2 mt-2">
        ${d.reviewed ? '' : `<button type="button" class="dx-btn dx-btn-primary" data-review="${esc(d._id)}">Marcar revisada</button>`}
        <button type="button" class="dx-btn dx-btn-danger" data-del="${esc(d._id)}">Eliminar</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('[data-review]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await API.diagnosis.documents.update(btn.getAttribute('data-review'), { reviewed: true });
      loadDocs();
    });
  });
  box.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await API.diagnosis.documents.delete(btn.getAttribute('data-del'));
      loadDocs();
    });
  });
}

async function loadUsage() {
  const res = await API.diagnosis.usage();
  $('dx-usage').innerHTML = `
    <p class="dx-text"><strong>Modelo:</strong> ${esc(res.openai?.model || '')} · configurado: ${res.openai?.configured ? 'sí' : 'no'}</p>
    <p class="text-sm dx-muted mt-1">Límites: ${esc(res.limits?.maxTurnsPerCase)} turnos/caso · ${esc(res.limits?.maxTokensPerCase)} tokens/caso · ${esc(res.limits?.maxTurnsPerCompanyDay)} turnos/día empresa</p>
    <table class="dx-table mt-3"><thead><tr><th>Caso</th><th>Turnos</th><th>Tokens</th><th>Último modelo</th></tr></thead>
    <tbody>${(res.items || []).map((i) => `<tr><td>#${esc(i.caseNumber)} ${esc(i.title)}</td><td>${esc(i.usage?.turns || 0)}</td><td>${esc(i.usage?.totalTokens || 0)}</td><td>${esc(i.usage?.lastModel || '')}</td></tr>`).join('')}</tbody></table>
  `;
}

function bind() {
  document.querySelectorAll('[data-dx-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-dx-view');
      if (v === 'list') loadCases();
      if (v === 'docs') loadDocs();
      if (v === 'usage') loadUsage();
      showView(v);
    });
  });
  $('dx-search-btn')?.addEventListener('click', loadCases);
  $('dx-search')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadCases(); });
  $('dx-status-filter')?.addEventListener('change', loadCases);
  $('dx-new-btn')?.addEventListener('click', () => showView('form'));
  $('dx-add-param')?.addEventListener('click', () => addParamRow());
  $('dx-add-dtc')?.addEventListener('click', () => addDtcRow());
  $('dx-dtc-status')?.addEventListener('change', (e) => {
    $('dx-dtc-wrap').classList.toggle('hidden', e.target.value !== 'con_codigos');
    if (e.target.value === 'con_codigos' && !$('dx-dtc-body').children.length) addDtcRow();
  });
  $('dx-new-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = formPayload(e.target);
    $('dx-create').disabled = true;
    try {
      const res = await API.diagnosis.create(payload);
      state.current = res.item;
      if (res.warning) flash(res.warning, 'warn');
      else clearFlash();
      renderCase();
      showView('case');
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      $('dx-create').disabled = false;
    }
  });
  $('dx-pause')?.addEventListener('click', async () => {
    if (!state.current) return;
    const res = await API.diagnosis.pause(state.current.id);
    state.current = res.item; renderCase();
  });
  $('dx-reopen')?.addEventListener('click', async () => {
    if (!state.current) return;
    const res = await API.diagnosis.reopen(state.current.id);
    state.current = res.item; renderCase();
  });
  $('dx-print')?.addEventListener('click', () => {
    renderPrint();
    window.print();
  });
  $('dx-doc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    await API.diagnosis.documents.create(payload);
    e.target.reset();
    loadDocs();
  });
}

async function init() {
  if (state.started) return;
  if (!API.token?.get?.()) return;
  state.started = true;
  addParamRow();
  bind();
  try {
    await loadMeta();
    await loadCases();
    const params = new URLSearchParams(location.search);
    if (params.get('id')) await openCase(params.get('id'));
  } catch (e) {
    flash(e.message || 'No se pudo cargar Diagnóstico Renault IA', 'error');
  }
}

function boot() {
  init();
  const app = document.getElementById('appSection');
  if (!app) return;
  const obs = new MutationObserver(() => {
    if (!app.classList.contains('hidden')) init();
  });
  obs.observe(app, { attributes: true, attributeFilter: ['class'] });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
