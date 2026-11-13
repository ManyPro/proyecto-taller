import crypto from 'node:crypto';
import mongoose from 'mongoose';
import DiagnosisCase from '../models/DiagnosisCase.js';
import DiagnosisDocument from '../models/DiagnosisDocument.js';
import Counter from '../models/Counter.js';
import Company from '../models/Company.js';
import { logger } from '../lib/logger.js';
import { DIAGNOSIS_PROMPT_VERSION } from '../lib/diagnosis/prompt.js';
import { RENAULT_ENGINES, findEngine, WHEN_OPTIONS, CASE_STATUS_OPTIONS, SKIP_REASONS } from '../lib/diagnosis/engines.js';
import { sanitizeText, omitPii } from '../lib/diagnosis/sanitize.js';
import { buildTurnInput, buildUserTurnMessage, serializeCase, publicCaseSummary } from '../lib/diagnosis/payload.js';
import { retrieveDocuments, retrieveReviewedAntecedents, knowledgeStatusFromDocs } from '../lib/diagnosis/knowledge.js';
import { requestDiagnosisTurn, openaiConfigStatus, DiagnosisProviderError } from '../lib/diagnosis/openaiClient.js';
import { assertUsageAllowed, applyUsage, DiagnosisLimitError, usageLimitsFromEnv } from '../lib/diagnosis/usage.js';

const PENDING_TTL_MS = 90_000;

function companyObjectId(req) {
  return new mongoose.Types.ObjectId(req.companyId);
}

function userObjectId(req) {
  return req.userId ? new mongoose.Types.ObjectId(req.userId) : null;
}

async function nextCaseNumber(companyId) {
  const doc = await Counter.findOneAndUpdate(
    { companyId },
    { $inc: { diagnosisSeq: 1 } },
    { upsert: true, new: true }
  );
  return doc.diagnosisSeq;
}

async function loadOwnedCase(req, res) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'ID de caso inválido' });
    return null;
  }
  const item = await DiagnosisCase.findOne({ _id: id, companyId: companyObjectId(req) });
  if (!item) {
    res.status(404).json({ error: 'Caso no encontrado' });
    return null;
  }
  return item;
}

function parseVehicle(body = {}) {
  const engine = findEngine(body.engineCode) || findEngine('UNKNOWN');
  const year = body.year == null || body.year === '' ? null : Number(body.year);
  const mileage = body.mileageKm == null || body.mileageKm === '' ? null : Number(body.mileageKm);
  return {
    plate: sanitizeText(body.plate || '', 12).toUpperCase(),
    model: sanitizeText(body.model || '', 80),
    year: Number.isFinite(year) ? year : null,
    engineCode: engine.code,
    engineLabel: engine.label,
    engineNotes: sanitizeText(body.engineNotes || '', 400),
    mileageKm: Number.isFinite(mileage) ? mileage : null,
    transmission: body.transmission || 'no_se',
    fuel: body.fuel || 'gasolina',
    cngConversion: body.cngConversion === true
  };
}

function parseSymptom(body = {}) {
  const when = Array.isArray(body.when) ? body.when.filter((w) => WHEN_OPTIONS.includes(w)) : [];
  const dtcStatus = ['sin_codigos', 'no_leidos', 'con_codigos'].includes(body.dtcStatus) ? body.dtcStatus : 'no_leidos';
  const dtcs = dtcStatus === 'con_codigos' && Array.isArray(body.dtcs)
    ? body.dtcs.slice(0, 20).map((d) => ({
      code: sanitizeText(d.code || '', 24).toUpperCase(),
      description: sanitizeText(d.description || '', 240),
      status: sanitizeText(d.status || '', 80)
    })).filter((d) => d.code)
    : [];
  return {
    main: sanitizeText(body.mainSymptom || body.main || '', 180),
    description: sanitizeText(body.description || '', 2500),
    when,
    dtcStatus,
    dtcs
  };
}

function parseParameters(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 40).map((p) => ({
    name: sanitizeText(p.name || p.nombreOriginal || '', 80),
    value: sanitizeText(p.value || '', 80),
    unit: sanitizeText(p.unit || '', 24),
    condition: sanitizeText(p.condition || '', 120)
  })).filter((p) => p.name);
}

function suggestedTitle(vehicle, symptom) {
  const model = vehicle.model || 'Renault';
  const year = vehicle.year ? ` ${vehicle.year}` : '';
  const main = symptom.main || 'diagnóstico';
  return sanitizeText(`${model}${year} · ${main}`, 120);
}

function applyAssistantToCase(caseDoc, output, documents) {
  caseDoc.lastAssistantOutput = output;
  caseDoc.hypotheses = output.hipotesis || [];
  caseDoc.evidence = output.evidencias || [];
  caseDoc.pendingTest = output.proximaPrueba || null;
  caseDoc.retrievedSources = (documents || []).map((d) => ({
    title: d.title,
    source: d.source,
    versionOrDate: d.versionOrDate,
    application: d.application,
    section: d.section
  }));
  caseDoc.knowledgeStatus = knowledgeStatusFromDocs(documents);
  caseDoc.promptVersion = DIAGNOSIS_PROMPT_VERSION;
  if (output.proximaPrueba?.titulo) {
    caseDoc.tests.push({
      title: output.proximaPrueba.titulo,
      status: 'pendiente',
      result: '',
      skipReason: '',
      at: new Date()
    });
  }
  if (output.estadoCasoSugerido && CASE_STATUS_OPTIONS.includes(output.estadoCasoSugerido) && caseDoc.status !== 'cerrado' && caseDoc.status !== 'pausado') {
    if (output.estadoCasoSugerido !== 'cerrado') caseDoc.status = output.estadoCasoSugerido;
    else caseDoc.status = 'pendiente_verificacion';
  } else if (caseDoc.status === 'abierto') {
    caseDoc.status = 'esperando_medicion';
  }
}

async function runAssistantTurn(caseDoc, userMessage, req) {
  const documents = await retrieveDocuments({ companyId: caseDoc.companyId, vehicle: caseDoc.vehicle });
  const antecedents = await retrieveReviewedAntecedents({
    companyId: caseDoc.companyId,
    vehicle: caseDoc.vehicle,
    excludeCaseId: caseDoc._id,
    enabled: !!caseDoc.includeReviewedCases
  });
  const input = buildTurnInput({
    caseDoc,
    userMessage,
    documents,
    antecedents
  });
  const { output, usage } = await requestDiagnosisTurn({
    input,
    documents,
    technicianConfirmed: !!caseDoc.repair?.applied
  });
  applyUsage(caseDoc, usage);
  applyAssistantToCase(caseDoc, output, documents);
  caseDoc.messages.push({
    role: 'assistant',
    type: 'diagnostico',
    content: output.resumen,
    structured: output,
    createdAt: new Date()
  });
  caseDoc.lastError = '';
  logger.info('diagnosis.turn.ok', {
    caseId: String(caseDoc._id),
    companyId: String(req.companyId),
    tokens: usage.totalTokens
  });
  return output;
}

export async function getMeta(req, res) {
  const docsCount = await DiagnosisDocument.countDocuments({ companyId: companyObjectId(req), active: true, reviewed: true });
  const openai = openaiConfigStatus();
  res.json({
    engines: RENAULT_ENGINES,
    whenOptions: WHEN_OPTIONS,
    statuses: CASE_STATUS_OPTIONS,
    skipReasons: SKIP_REASONS,
    openai: { configured: openai.configured, model: openai.model, promptVersion: openai.promptVersion },
    knowledge: {
      status: docsCount ? 'disponible' : 'pendiente',
      reviewedDocuments: docsCount,
      label: docsCount ? `${docsCount} ficha(s) revisada(s)` : 'Base técnica pendiente de cargar'
    },
    limits: usageLimitsFromEnv(),
    defaultCity: 'Bogotá'
  });
}

export async function listCases(req, res) {
  const { q, status, page = 1, limit = 30 } = req.query;
  const filter = { companyId: companyObjectId(req) };
  if (status && CASE_STATUS_OPTIONS.includes(String(status))) filter.status = status;
  if (q && String(q).trim()) {
    const term = String(q).trim();
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { title: rx },
      { 'vehicle.model': rx },
      { 'vehicle.plate': rx },
      { 'vehicle.engineCode': rx },
      { 'symptom.main': rx }
    ];
    if (/^\d+$/.test(term)) filter.$or.push({ caseNumber: Number(term) });
  }
  const lim = Math.min(Number(limit) || 30, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const [items, total] = await Promise.all([
    DiagnosisCase.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(lim).lean(),
    DiagnosisCase.countDocuments(filter)
  ]);
  res.json({ items: items.map(publicCaseSummary), total, page: Number(page) || 1, limit: lim });
}

export async function getCase(req, res) {
  const item = await loadOwnedCase(req, res);
  if (!item) return;
  res.json({ item: serializeCase(item) });
}

export async function createCase(req, res) {
  const body = omitPii(req.body || {});
  const vehicle = parseVehicle(body);
  const symptom = parseSymptom(body);
  if (!vehicle.model) return res.status(400).json({ error: 'El modelo es obligatorio' });
  if (!vehicle.year) return res.status(400).json({ error: 'El año es obligatorio' });
  if (!symptom.main) return res.status(400).json({ error: 'El síntoma principal es obligatorio' });

  const caseNumber = await nextCaseNumber(companyObjectId(req));
  const doc = await DiagnosisCase.create({
    companyId: companyObjectId(req),
    userId: userObjectId(req),
    caseNumber,
    title: suggestedTitle(vehicle, symptom),
    status: 'abierto',
    vehicle,
    symptom,
    conditions: {
      engineRunning: body.engineRunning || 'no_se',
      coolantTemp: sanitizeText(body.coolantTemp || '', 40),
      rpm: sanitizeText(body.rpm || '', 40),
      ac: body.ac || 'no_se',
      city: sanitizeText(body.city || 'Bogotá', 80) || 'Bogotá',
      altitudeNote: 'Bogotá ~2600 m. Interpretar MAP/baro según altitud.'
    },
    history: {
      recentRepairs: sanitizeText(body.recentRepairs || '', 2000),
      testsDone: sanitizeText(body.testsDone || '', 2000)
    },
    parameters: parseParameters(body.parameters),
    ecu: {
      identification: sanitizeText(body.ecuIdentification || '', 120),
      software: sanitizeText(body.ecuSoftware || '', 120)
    },
    freezeFrame: sanitizeText(body.freezeFrame || '', 2500),
    includeReviewedCases: body.includeReviewedCases === true,
    promptVersion: DIAGNOSIS_PROMPT_VERSION
  });

  const opening = buildUserTurnMessage({
    kind: 'texto',
    text: [
      `Nuevo caso de diagnóstico. Vehículo ${vehicle.model} ${vehicle.year || ''} motor ${vehicle.engineLabel}.`,
      `Síntoma: ${symptom.main}. ${symptom.description}`.trim(),
      `Cuándo: ${(symptom.when || []).join(', ') || 'no indicado'}.`,
      `DTCs: ${symptom.dtcStatus}${symptom.dtcs.length ? ' · ' + symptom.dtcs.map((d) => d.code).join(', ') : ''}.`,
      'Indica la primera comprobación.'
    ].join('\n')
  });
  doc.messages.push({
    role: 'user',
    type: opening.type,
    content: opening.text,
    structured: opening,
    createdAt: new Date()
  });

  try {
    await assertUsageAllowed(doc, companyObjectId(req));
    await runAssistantTurn(doc, opening, req);
    await doc.save();
    return res.status(201).json({ item: serializeCase(doc) });
  } catch (err) {
    const mapped = err instanceof DiagnosisProviderError || err instanceof DiagnosisLimitError
      ? err
      : new DiagnosisProviderError('provider', err.message || 'No se pudo obtener la primera orientación', 502);
    doc.lastError = mapped.message;
    await doc.save();
    return res.status(201).json({
      item: serializeCase(doc),
      warning: mapped.message,
      code: mapped.code
    });
  }
}

export async function addTurn(req, res) {
  const item = await loadOwnedCase(req, res);
  if (!item) return;
  if (item.status === 'cerrado') return res.status(409).json({ error: 'El caso está cerrado. Reábrelo para continuar.' });
  if (item.status === 'pausado') return res.status(409).json({ error: 'El caso está pausado. Reábrelo para continuar.' });

  const clientRequestId = sanitizeText(req.body?.clientRequestId || '', 80);
  if (clientRequestId && item.lastClientRequestId === clientRequestId) {
    return res.json({ item: serializeCase(item), deduplicated: true });
  }
  if (item.pendingTurnId && item.pendingTurnAt && Date.now() - new Date(item.pendingTurnAt).getTime() < PENDING_TTL_MS) {
    return res.status(409).json({ error: 'Ya hay una consulta en curso para este caso. Espera a que termine.' });
  }

  const userTurn = buildUserTurnMessage(req.body || {});
  if (!userTurn.text && !(userTurn.measurements || []).length) {
    return res.status(400).json({ error: 'Escribe lo observado o registra una medición' });
  }

  if (userTurn.measurements?.length) {
    for (const m of userTurn.measurements.slice(0, 8)) {
      item.measurements.push({
        name: sanitizeText(m.name || '', 80),
        value: sanitizeText(m.value ?? '', 80),
        unit: sanitizeText(m.unit || '', 24),
        condition: sanitizeText(m.condition || '', 120),
        note: sanitizeText(m.note || '', 400),
        at: new Date()
      });
    }
  }

  if (item.pendingTest?.titulo) {
    const lastPending = [...item.tests].reverse().find((t) => t.status === 'pendiente' && t.title === item.pendingTest.titulo);
    if (lastPending) {
      lastPending.status = userTurn.type === 'omitir' ? 'omitida' : 'completada';
      lastPending.result = userTurn.text;
      lastPending.skipReason = userTurn.skipReason || '';
      lastPending.at = new Date();
    }
  }

  item.messages.push({
    role: 'user',
    type: userTurn.type,
    content: userTurn.text,
    structured: userTurn,
    clientRequestId,
    createdAt: new Date()
  });

  item.pendingTurnId = crypto.randomUUID();
  item.pendingTurnAt = new Date();
  if (clientRequestId) item.lastClientRequestId = clientRequestId;
  await item.save();

  try {
    await assertUsageAllowed(item, companyObjectId(req));
    await runAssistantTurn(item, userTurn, req);
    item.pendingTurnId = '';
    item.pendingTurnAt = null;
    await item.save();
    return res.json({ item: serializeCase(item) });
  } catch (err) {
    item.pendingTurnId = '';
    item.pendingTurnAt = null;
    const mapped = err instanceof DiagnosisProviderError || err instanceof DiagnosisLimitError
      ? err
      : new DiagnosisProviderError('provider', err.message || 'Error al consultar el asistente', 502);
    item.lastError = mapped.message;
    await item.save();
    return res.status(mapped.httpStatus || 502).json({
      error: mapped.message,
      code: mapped.code,
      item: serializeCase(item)
    });
  }
}

export async function pauseCase(req, res) {
  const item = await loadOwnedCase(req, res);
  if (!item) return;
  if (item.status === 'cerrado') return res.status(409).json({ error: 'No se puede pausar un caso cerrado' });
  item.status = 'pausado';
  await item.save();
  res.json({ item: serializeCase(item) });
}

export async function reopenCase(req, res) {
  const item = await loadOwnedCase(req, res);
  if (!item) return;
  item.status = item.pendingTest ? 'esperando_medicion' : 'abierto';
  await item.save();
  res.json({ item: serializeCase(item) });
}

export async function recordRepair(req, res) {
  const item = await loadOwnedCase(req, res);
  if (!item) return;
  const applied = sanitizeText(req.body?.applied || '', 500);
  if (!applied) return res.status(400).json({ error: 'Describe la reparación aplicada' });
  item.repair = {
    applied,
    notes: sanitizeText(req.body?.notes || '', 2000),
    at: new Date(),
    by: userObjectId(req)
  };
  item.status = 'pendiente_verificacion';
  item.messages.push({
    role: 'user',
    type: 'reparacion',
    content: `Reparación registrada por el técnico: ${applied}`,
    structured: item.repair,
    createdAt: new Date()
  });
  await item.save();
  res.json({ item: serializeCase(item) });
}

export async function recordVerification(req, res) {
  const item = await loadOwnedCase(req, res);
  if (!item) return;
  const result = sanitizeText(req.body?.result || '', 500);
  if (!result) return res.status(400).json({ error: 'Describe el resultado de la verificación' });
  item.verification = {
    result,
    notes: sanitizeText(req.body?.notes || '', 2000),
    at: new Date(),
    by: userObjectId(req)
  };
  item.messages.push({
    role: 'user',
    type: 'verificacion',
    content: `Verificación posterior: ${result}`,
    structured: item.verification,
    createdAt: new Date()
  });
  await item.save();
  res.json({ item: serializeCase(item) });
}

export async function closeCase(req, res) {
  const item = await loadOwnedCase(req, res);
  if (!item) return;
  if (!item.repair?.applied) return res.status(400).json({ error: 'Registra la reparación antes de cerrar. El técnico confirma el cierre, no la IA.' });
  if (!item.verification?.result) return res.status(400).json({ error: 'Registra la verificación posterior antes de cerrar.' });
  item.status = 'cerrado';
  item.reviewedByWorkshop = req.body?.reviewedByWorkshop === true;
  await item.save();
  res.json({ item: serializeCase(item) });
}

export async function listDocuments(req, res) {
  const items = await DiagnosisDocument.find({ companyId: companyObjectId(req) }).sort({ updatedAt: -1 }).limit(200).lean();
  res.json({
    items,
    status: items.some((d) => d.active && d.reviewed) ? 'disponible' : 'pendiente',
    label: items.some((d) => d.active && d.reviewed) ? 'Documentación cargada' : 'Base técnica pendiente de cargar'
  });
}

export async function createDocument(req, res) {
  const body = req.body || {};
  if (!body.title || !body.source) return res.status(400).json({ error: 'Título y fuente son obligatorios' });
  const item = await DiagnosisDocument.create({
    companyId: companyObjectId(req),
    title: sanitizeText(body.title, 180),
    source: sanitizeText(body.source, 180),
    versionOrDate: sanitizeText(body.versionOrDate || '', 80),
    application: sanitizeText(body.application || '', 180),
    section: sanitizeText(body.section || '', 80),
    engineCode: sanitizeText(body.engineCode || '', 24),
    model: sanitizeText(body.model || '', 80),
    yearFrom: body.yearFrom ? Number(body.yearFrom) : null,
    yearTo: body.yearTo ? Number(body.yearTo) : null,
    ecu: sanitizeText(body.ecu || '', 80),
    kind: body.kind || 'ficha',
    body: sanitizeText(body.body || '', 20000),
    reviewed: false,
    active: true
  });
  res.status(201).json({ item });
}

export async function updateDocument(req, res) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
  const item = await DiagnosisDocument.findOne({ _id: id, companyId: companyObjectId(req) });
  if (!item) return res.status(404).json({ error: 'Documento no encontrado' });
  const body = req.body || {};
  const fields = ['title', 'source', 'versionOrDate', 'application', 'section', 'engineCode', 'model', 'ecu', 'kind', 'body'];
  for (const f of fields) {
    if (body[f] !== undefined) item[f] = typeof body[f] === 'string' ? sanitizeText(body[f], f === 'body' ? 20000 : 180) : body[f];
  }
  if (body.yearFrom !== undefined) item.yearFrom = body.yearFrom ? Number(body.yearFrom) : null;
  if (body.yearTo !== undefined) item.yearTo = body.yearTo ? Number(body.yearTo) : null;
  if (body.active !== undefined) item.active = !!body.active;
  if (body.reviewed === true) {
    item.reviewed = true;
    item.reviewedAt = new Date();
    item.reviewedBy = userObjectId(req);
  }
  if (body.reviewed === false) item.reviewed = false;
  await item.save();
  res.json({ item });
}

export async function deleteDocument(req, res) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'ID inválido' });
  const item = await DiagnosisDocument.findOneAndDelete({ _id: id, companyId: companyObjectId(req) });
  if (!item) return res.status(404).json({ error: 'Documento no encontrado' });
  res.json({ ok: true });
}

export async function getUsage(req, res) {
  const companyId = companyObjectId(req);
  const cases = await DiagnosisCase.find({ companyId }).select('caseNumber usage status title').sort({ 'usage.lastTurnAt': -1 }).limit(50).lean();
  res.json({
    limits: usageLimitsFromEnv(),
    openai: openaiConfigStatus(),
    items: cases.map((c) => ({
      id: String(c._id),
      caseNumber: c.caseNumber,
      title: c.title,
      status: c.status,
      usage: c.usage
    }))
  });
}

export async function requireDiagnosisFeature(req, res, next) {
  const c = await Company.findById(req.company?.id).select('features').lean();
  if (!c) return res.status(404).json({ error: 'Empresa no encontrada' });
  if (c.features?.diagnosticoRenault === false) {
    return res.status(403).json({ error: 'Funcionalidad deshabilitada: Diagnóstico Renault IA' });
  }
  next();
}
