import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDiagnosisOutput, applyTechnicalGuards, emptyDiagnosisOutput, DIAGNOSIS_JSON_SCHEMA } from './schema.js';

function sample() {
  const v = emptyDiagnosisOutput({
    resumen: 'Revisar alimentación del sensor MAP.',
    interpretacion: 'El código P0106 por sí solo no confirma un sensor dañado.',
    hipotesis: [{ titulo: 'Conector MAP con mala masa', justificacion: 'Código + síntoma, falta medición', nivel: 'posible' }],
    evidencias: [{ descripcion: 'P0106 presente', tipo: 'codigo' }],
    limitaciones: '',
    estadoDiagnostico: 'en_curso',
    estadoCasoSugerido: 'esperando_medicion'
  });
  v.proximaPrueba.titulo = 'Medir 5V, masa y señal MAP';
  v.proximaPrueba.comoRealizarla = 'Con motor encendido, ralenti, A/C off.';
  v.proximaPrueba.condiciones = 'Bogotá, motor caliente';
  v.proximaPrueba.parametros = [{
    nombreOriginal: 'MAP',
    nombresAlternativos: ['Manifold Absolute Pressure', 'Presión absoluta de admisión'],
    unidadEsperada: 'kPa',
    tipoEntrada: 'numero',
    referencia: 'Especificación oficial no cargada',
    procedenciaReferencia: 'pendiente'
  }];
  v.proximaPrueba.quePuedeSignificar = 'Si 5V y masa están bien, pasar a señal.';
  v.proximaPrueba.queResponder = 'Valor MAP, unidad y si el motor estaba en ralenti.';
  return v;
}

test('schema estricto exige additionalProperties false', () => {
  assert.equal(DIAGNOSIS_JSON_SCHEMA.additionalProperties, false);
  assert.ok(DIAGNOSIS_JSON_SCHEMA.required.includes('proximaPrueba'));
});

test('valida una respuesta completa', () => {
  const { ok, errors, value } = validateDiagnosisOutput(sample());
  assert.equal(ok, true, errors.join(', '));
  assert.equal(value.hipotesis.length, 1);
});

test('rechaza objeto vacío', () => {
  const { ok } = validateDiagnosisOutput({});
  assert.equal(ok, false);
});

test('no deja fabricante si la base está vacía', () => {
  const raw = sample();
  raw.proximaPrueba.parametros[0].procedenciaReferencia = 'fabricante';
  raw.proximaPrueba.parametros[0].referencia = '2.5 V';
  raw.hipotesis[0].nivel = 'confirmada_por_el_tecnico';
  const guarded = applyTechnicalGuards(raw, { documents: [], technicianConfirmed: false });
  assert.equal(guarded.proximaPrueba.parametros[0].procedenciaReferencia, 'pendiente');
  assert.equal(guarded.hipotesis[0].nivel, 'respaldada_por_estas_pruebas');
  assert.match(guarded.limitaciones, /Base técnica pendiente/);
});

test('no cierra el caso por sugerencia de la IA', () => {
  const raw = sample();
  raw.estadoCasoSugerido = 'cerrado';
  const guarded = applyTechnicalGuards(raw, { documents: [] });
  assert.equal(guarded.estadoCasoSugerido, 'pendiente_verificacion');
});

test('solo conserva referencias presentes en documentos recuperados', () => {
  const raw = sample();
  raw.referencias = [{ titulo: 'Inventada', fuente: 'web', versionOFecha: '', aplicacion: '', seccion: '', utilizada: true }];
  const guarded = applyTechnicalGuards(raw, {
    documents: [{ title: 'Ficha MAP H5Ht', source: 'Renault TSB 12', versionOrDate: '2021', application: 'H5Ht', section: '4.1' }]
  });
  assert.equal(guarded.referencias.length, 1);
  assert.equal(guarded.referencias[0].titulo, 'Ficha MAP H5Ht');
});
