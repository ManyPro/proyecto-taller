import { DIAGNOSIS_PROMPT_VERSION } from './prompt.js';
import { wrapUserPayload, omitPii, sanitizeText } from './sanitize.js';

const MAX_MESSAGES = 18;
const MAX_MEASUREMENTS = 24;
const MAX_TESTS = 16;

export function publicCaseSummary(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    caseNumber: doc.caseNumber,
    status: doc.status,
    title: doc.title,
    vehicle: doc.vehicle,
    symptom: doc.symptom,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    pendingTestTitle: doc.pendingTest?.titulo || '',
    lastError: doc.lastError || null
  };
}

export function serializeCase(doc) {
  if (!doc) return null;
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return omitPii({
    id: String(raw._id),
    caseNumber: raw.caseNumber,
    status: raw.status,
    title: raw.title,
    vehicle: raw.vehicle,
    symptom: raw.symptom,
    conditions: raw.conditions,
    history: raw.history,
    parameters: raw.parameters,
    ecu: raw.ecu,
    freezeFrame: raw.freezeFrame,
    messages: raw.messages || [],
    measurements: raw.measurements || [],
    tests: raw.tests || [],
    hypotheses: raw.hypotheses || [],
    evidence: raw.evidence || [],
    pendingTest: raw.pendingTest || null,
    lastAssistantOutput: raw.lastAssistantOutput || null,
    retrievedSources: raw.retrievedSources || [],
    knowledgeStatus: raw.knowledgeStatus,
    repair: raw.repair || null,
    verification: raw.verification || null,
    usage: raw.usage || {},
    promptVersion: raw.promptVersion,
    includeReviewedCases: !!raw.includeReviewedCases,
    lastError: raw.lastError || null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt
  });
}

export function buildTurnInput({ caseDoc, userMessage, documents, antecedents }) {
  const vehicle = omitPii(caseDoc.vehicle || {});
  const payload = {
    promptVersion: DIAGNOSIS_PROMPT_VERSION,
    caso: {
      id: String(caseDoc._id),
      numero: caseDoc.caseNumber,
      estado: caseDoc.status,
      vehiculo: vehicle,
      sintoma: caseDoc.symptom,
      condiciones: caseDoc.conditions,
      historialTaller: caseDoc.history,
      parametrosIniciales: (caseDoc.parameters || []).slice(0, 40),
      ecu: caseDoc.ecu,
      datosCongelados: caseDoc.freezeFrame
    },
    pruebaPendiente: caseDoc.pendingTest || null,
    hipotesisActuales: (caseDoc.hypotheses || []).slice(0, 3),
    evidencias: (caseDoc.evidence || []).slice(-12),
    mediciones: (caseDoc.measurements || []).slice(-MAX_MEASUREMENTS).map((m) => ({
      at: m.at,
      name: m.name,
      value: m.value,
      unit: m.unit,
      condition: m.condition,
      note: m.note
    })),
    pruebas: (caseDoc.tests || []).slice(-MAX_TESTS).map((t) => ({
      title: t.title,
      status: t.status,
      result: t.result,
      skipReason: t.skipReason,
      at: t.at
    })),
    mensajesPrevios: (caseDoc.messages || []).slice(-MAX_MESSAGES).map((m) => ({
      role: m.role,
      type: m.type,
      content: sanitizeText(m.content, 1500),
      at: m.createdAt
    })),
    conocimiento: {
      estado: documents?.length ? 'disponible' : 'pendiente',
      documentos: (documents || []).map((d) => ({
        titulo: d.title,
        fuente: d.source,
        versionOFecha: d.versionOrDate,
        aplicacion: d.application,
        seccion: d.section,
        extracto: sanitizeText(d.excerpt, 1800)
      }))
    },
    antecedentesTaller: (antecedents || []).map((a) => ({
      titulo: a.title,
      motor: a.engineCode,
      sintoma: a.symptom,
      reparacion: a.repair,
      nota: 'Antecedente revisado por el taller, no es especificación oficial'
    }))
  };

  return [
    { role: 'user', content: wrapUserPayload('DATOS_DEL_CASO', payload.caso) },
    { role: 'user', content: wrapUserPayload('PRUEBA_PENDIENTE_E_HISTORIAL', {
      pruebaPendiente: payload.pruebaPendiente,
      hipotesisActuales: payload.hipotesisActuales,
      evidencias: payload.evidencias,
      mediciones: payload.mediciones,
      pruebas: payload.pruebas,
      mensajesPrevios: payload.mensajesPrevios
    }) },
    { role: 'user', content: wrapUserPayload('DOCUMENTACION', payload.conocimiento) },
    { role: 'user', content: wrapUserPayload('ANTECEDENTES_DEL_TALLER', payload.antecedentesTaller) },
    { role: 'user', content: wrapUserPayload('MENSAJE_DEL_TECNICO', userMessage) }
  ];
}

export function buildUserTurnMessage(body = {}) {
  const kind = body.kind || 'texto';
  if (kind === 'medicion' || kind === 'grupo') {
    return {
      type: kind,
      text: sanitizeText(body.note || body.text || 'Resultados de medición', 2000),
      measurements: Array.isArray(body.measurements) ? body.measurements : [],
      skipReason: null
    };
  }
  if (kind === 'omitir') {
    return {
      type: 'omitir',
      text: sanitizeText(body.text || body.note || 'El técnico no pudo completar la prueba', 2000),
      measurements: [],
      skipReason: body.skipReason || 'no_puedo_realizar_prueba'
    };
  }
  return {
    type: 'texto',
    text: sanitizeText(body.text || '', 4000),
    measurements: Array.isArray(body.measurements) ? body.measurements : [],
    skipReason: null
  };
}
