import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUserTurnMessage } from './payload.js';
import { DIAGNOSIS_SYSTEM_PROMPT } from './prompt.js';

test('permite unidad faltante y valores contradictorios como texto del técnico', () => {
  const missing = buildUserTurnMessage({
    kind: 'medicion',
    measurements: [{ name: 'MAP', value: '28', unit: '', condition: 'ralenti' }],
    note: 'No aparece la unidad en el AUTEL'
  });
  assert.equal(missing.measurements[0].unit, '');
  assert.match(missing.text, /unidad/i);

  const contradiction = buildUserTurnMessage({
    kind: 'texto',
    text: 'MAP 28 kPa pero BARO 101 kPa en Bogotá, parece contradictorio'
  });
  assert.match(contradiction.text, /contradictorio/);
});

test('el prompt prohíbe concluir pieza solo por código y borrar DTCs prematuramente', () => {
  assert.match(DIAGNOSIS_SYSTEM_PROMPT, /No diagnostiques una pieza únicamente por un código/);
  assert.match(DIAGNOSIS_SYSTEM_PROMPT, /No recomiendes borrar códigos/);
  assert.match(DIAGNOSIS_SYSTEM_PROMPT, /No recomiendes cambiar piezas sin una prueba/);
});
