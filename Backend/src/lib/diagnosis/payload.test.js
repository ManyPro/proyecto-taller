import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnInput, buildUserTurnMessage } from './payload.js';

const caseA = {
  _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  caseNumber: 1,
  status: 'esperando_medicion',
  vehicle: { model: 'Sandero', year: 2018, engineCode: 'K4M', ownerName: 'NO' },
  symptom: { main: 'ralenti inestable', dtcStatus: 'con_codigos', dtcs: [{ code: 'P0300' }] },
  conditions: { city: 'Bogotá' },
  history: {},
  parameters: [],
  ecu: {},
  freezeFrame: '',
  pendingTest: { titulo: 'Ver 5V de referencia' },
  hypotheses: [],
  evidence: [],
  measurements: [],
  tests: [],
  messages: [{ role: 'assistant', type: 'diagnostico', content: 'Mide 5V', createdAt: new Date() }]
};

const caseB = {
  ...caseA,
  _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  caseNumber: 2,
  vehicle: { model: 'Kwid', year: 2021, engineCode: 'B4D' },
  symptom: { main: 'no arranca', dtcStatus: 'no_leidos', dtcs: [] },
  messages: []
};

test('cada turno incluye solo el caso solicitado', () => {
  const input = buildTurnInput({
    caseDoc: caseA,
    userMessage: { type: 'texto', text: '5V presentes' },
    documents: [],
    antecedents: []
  });
  const blob = JSON.stringify(input);
  assert.match(blob, /Sandero/);
  assert.equal(blob.includes('Kwid'), false);
  assert.equal(blob.includes('bbbbbbbbbbbbbbbbbbbbbbbb'), false);
  assert.match(blob, /<MENSAJE_DEL_TECNICO>/);
});

test('dos casos distintos no mezclan vehículo', () => {
  const a = JSON.stringify(buildTurnInput({ caseDoc: caseA, userMessage: { text: 'a' }, documents: [], antecedents: [] }));
  const b = JSON.stringify(buildTurnInput({ caseDoc: caseB, userMessage: { text: 'b' }, documents: [], antecedents: [] }));
  assert.match(a, /K4M/);
  assert.match(b, /B4D/);
  assert.equal(a.includes('B4D'), false);
  assert.equal(b.includes('K4M'), false);
});

test('omitir prueba usa skipReason controlado', () => {
  const msg = buildUserTurnMessage({ kind: 'omitir', skipReason: 'no_tengo_herramienta', text: 'No hay osciloscopio' });
  assert.equal(msg.type, 'omitir');
  assert.equal(msg.skipReason, 'no_tengo_herramienta');
});
