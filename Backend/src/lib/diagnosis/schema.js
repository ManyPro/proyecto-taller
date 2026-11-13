import { CASE_STATUS_OPTIONS, HYPOTHESIS_LEVELS, PARAM_INPUT_TYPES, REFERENCE_ORIGINS } from './engines.js';

const stringField = { type: 'string' };
const boolField = { type: 'boolean' };

const hypothesisItem = {
  type: 'object',
  additionalProperties: false,
  required: ['titulo', 'justificacion', 'nivel'],
  properties: {
    titulo: stringField,
    justificacion: stringField,
    nivel: { type: 'string', enum: HYPOTHESIS_LEVELS }
  }
};

const evidenceItem = {
  type: 'object',
  additionalProperties: false,
  required: ['descripcion', 'tipo'],
  properties: {
    descripcion: stringField,
    tipo: { type: 'string', enum: ['observacion', 'medicion', 'codigo', 'prueba'] }
  }
};

const parameterItem = {
  type: 'object',
  additionalProperties: false,
  required: ['nombreOriginal', 'nombresAlternativos', 'unidadEsperada', 'tipoEntrada', 'referencia', 'procedenciaReferencia'],
  properties: {
    nombreOriginal: stringField,
    nombresAlternativos: { type: 'array', items: stringField },
    unidadEsperada: stringField,
    tipoEntrada: { type: 'string', enum: PARAM_INPUT_TYPES },
    referencia: stringField,
    procedenciaReferencia: { type: 'string', enum: REFERENCE_ORIGINS }
  }
};

const referenceItem = {
  type: 'object',
  additionalProperties: false,
  required: ['titulo', 'fuente', 'versionOFecha', 'aplicacion', 'seccion', 'utilizada'],
  properties: {
    titulo: stringField,
    fuente: stringField,
    versionOFecha: stringField,
    aplicacion: stringField,
    seccion: stringField,
    utilizada: boolField
  }
};

export const DIAGNOSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'resumen',
    'interpretacion',
    'hipotesis',
    'evidencias',
    'proximaPrueba',
    'referencias',
    'limitaciones',
    'estadoDiagnostico',
    'estadoCasoSugerido',
    'advertencias'
  ],
  properties: {
    resumen: stringField,
    interpretacion: stringField,
    hipotesis: { type: 'array', items: hypothesisItem },
    evidencias: { type: 'array', items: evidenceItem },
    proximaPrueba: {
      type: 'object',
      additionalProperties: false,
      required: [
        'titulo',
        'comoRealizarla',
        'condiciones',
        'parametros',
        'quePuedeSignificar',
        'queResponder',
        'grupoParametrosRelacionados'
      ],
      properties: {
        titulo: stringField,
        comoRealizarla: stringField,
        condiciones: stringField,
        parametros: { type: 'array', items: parameterItem },
        quePuedeSignificar: stringField,
        queResponder: stringField,
        grupoParametrosRelacionados: boolField
      }
    },
    referencias: { type: 'array', items: referenceItem },
    limitaciones: stringField,
    estadoDiagnostico: {
      type: 'string',
      enum: ['en_curso', 'hace_falta_equipo', 'hace_falta_informacion', 'hipotesis_respaldada', 'pendiente_verificacion']
    },
    estadoCasoSugerido: { type: 'string', enum: CASE_STATUS_OPTIONS },
    advertencias: { type: 'array', items: stringField }
  }
};

export const DIAGNOSIS_TEXT_FORMAT = {
  type: 'json_schema',
  name: 'diagnostico_renault',
  strict: true,
  schema: DIAGNOSIS_JSON_SCHEMA
};

function asString(value, fallback = '') {
  if (value == null) return fallback;
  return String(value).trim();
}

function asBool(value) {
  return value === true;
}

function pickEnum(value, allowed, fallback) {
  const v = asString(value);
  return allowed.includes(v) ? v : fallback;
}

export function emptyDiagnosisOutput(overrides = {}) {
  return {
    resumen: '',
    interpretacion: '',
    hipotesis: [],
    evidencias: [],
    proximaPrueba: {
      titulo: '',
      comoRealizarla: '',
      condiciones: '',
      parametros: [],
      quePuedeSignificar: '',
      queResponder: '',
      grupoParametrosRelacionados: false
    },
    referencias: [],
    limitaciones: '',
    estadoDiagnostico: 'en_curso',
    estadoCasoSugerido: 'esperando_medicion',
    advertencias: [],
    ...overrides
  };
}

export function validateDiagnosisOutput(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['La respuesta no es un objeto JSON'], value: null };
  }

  const value = emptyDiagnosisOutput();
  value.resumen = asString(raw.resumen);
  value.interpretacion = asString(raw.interpretacion);
  value.limitaciones = asString(raw.limitaciones);
  value.estadoDiagnostico = pickEnum(raw.estadoDiagnostico, DIAGNOSIS_JSON_SCHEMA.properties.estadoDiagnostico.enum, 'en_curso');
  value.estadoCasoSugerido = pickEnum(raw.estadoCasoSugerido, CASE_STATUS_OPTIONS, 'esperando_medicion');
  value.advertencias = Array.isArray(raw.advertencias) ? raw.advertencias.map((x) => asString(x)).filter(Boolean).slice(0, 8) : [];

  if (!value.resumen) errors.push('Falta resumen');
  if (!value.interpretacion) errors.push('Falta interpretacion');

  const hyps = Array.isArray(raw.hipotesis) ? raw.hipotesis : [];
  value.hipotesis = hyps.slice(0, 3).map((h) => ({
    titulo: asString(h?.titulo),
    justificacion: asString(h?.justificacion),
    nivel: pickEnum(h?.nivel, HYPOTHESIS_LEVELS, 'posible')
  })).filter((h) => h.titulo);

  value.evidencias = (Array.isArray(raw.evidencias) ? raw.evidencias : []).slice(0, 12).map((e) => ({
    descripcion: asString(e?.descripcion),
    tipo: pickEnum(e?.tipo, ['observacion', 'medicion', 'codigo', 'prueba'], 'observacion')
  })).filter((e) => e.descripcion);

  const next = raw.proximaPrueba && typeof raw.proximaPrueba === 'object' ? raw.proximaPrueba : {};
  value.proximaPrueba = {
    titulo: asString(next.titulo),
    comoRealizarla: asString(next.comoRealizarla),
    condiciones: asString(next.condiciones),
    parametros: (Array.isArray(next.parametros) ? next.parametros : []).slice(0, 6).map((p) => ({
      nombreOriginal: asString(p?.nombreOriginal),
      nombresAlternativos: (Array.isArray(p?.nombresAlternativos) ? p.nombresAlternativos : []).map((n) => asString(n)).filter(Boolean).slice(0, 6),
      unidadEsperada: asString(p?.unidadEsperada),
      tipoEntrada: pickEnum(p?.tipoEntrada, PARAM_INPUT_TYPES, 'texto'),
      referencia: asString(p?.referencia),
      procedenciaReferencia: pickEnum(p?.procedenciaReferencia, REFERENCE_ORIGINS, 'pendiente')
    })).filter((p) => p.nombreOriginal),
    quePuedeSignificar: asString(next.quePuedeSignificar),
    queResponder: asString(next.queResponder),
    grupoParametrosRelacionados: asBool(next.grupoParametrosRelacionados)
  };

  if (!value.proximaPrueba.titulo) errors.push('Falta proximaPrueba.titulo');

  value.referencias = (Array.isArray(raw.referencias) ? raw.referencias : []).slice(0, 8).map((r) => ({
    titulo: asString(r?.titulo),
    fuente: asString(r?.fuente),
    versionOFecha: asString(r?.versionOFecha),
    aplicacion: asString(r?.aplicacion),
    seccion: asString(r?.seccion),
    utilizada: asBool(r?.utilizada)
  })).filter((r) => r.titulo || r.fuente);

  return { ok: errors.length === 0, errors, value };
}

export function applyTechnicalGuards(output, ctx = {}) {
  const guarded = structuredClone(output);
  const docs = Array.isArray(ctx.documents) ? ctx.documents : [];
  const technicianConfirmed = ctx.technicianConfirmed === true;
  const knowledgePending = docs.length === 0;

  if (knowledgePending) {
    const note = 'Base técnica pendiente de cargar. La orientación es general y no sustituye una especificación oficial.';
    if (!guarded.limitaciones.includes('Base técnica pendiente')) {
      guarded.limitaciones = guarded.limitaciones ? `${note} ${guarded.limitaciones}` : note;
    }
    guarded.advertencias = Array.from(new Set([note, ...guarded.advertencias]));
    for (const p of guarded.proximaPrueba.parametros) {
      if (p.procedenciaReferencia === 'fabricante') {
        p.procedenciaReferencia = 'pendiente';
        p.referencia = p.referencia
          ? `${p.referencia} (no hay ficha cargada: no tratar como tolerancia oficial)`
          : 'Especificación oficial no disponible en la base técnica';
      }
    }
    guarded.referencias = guarded.referencias.filter((r) => r.utilizada && docs.some((d) => d.title === r.titulo || d.source === r.fuente));
  } else {
    const allowedTitles = new Set(docs.map((d) => String(d.title || '')));
    const allowedSources = new Set(docs.map((d) => String(d.source || '')));
    guarded.referencias = guarded.referencias.filter((r) => allowedTitles.has(r.titulo) || allowedSources.has(r.fuente));
    if (!guarded.referencias.length) {
      guarded.referencias = docs.slice(0, 5).map((d) => ({
        titulo: d.title || '',
        fuente: d.source || '',
        versionOFecha: d.versionOrDate || '',
        aplicacion: d.application || '',
        seccion: d.section || '',
        utilizada: true
      }));
    }
  }

  for (const h of guarded.hipotesis) {
    if (h.nivel === 'confirmada_por_el_tecnico' && !technicianConfirmed) {
      h.nivel = 'respaldada_por_estas_pruebas';
    }
  }

  if (guarded.estadoCasoSugerido === 'cerrado') {
    guarded.estadoCasoSugerido = 'pendiente_verificacion';
  }

  return guarded;
}
