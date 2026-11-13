import test from 'node:test';
import assert from 'node:assert/strict';
import { requestDiagnosisTurn, DiagnosisProviderError } from './openaiClient.js';
import { DIAGNOSIS_SYSTEM_PROMPT } from './prompt.js';

function validOutput() {
  return {
    resumen: 'Primera comprobación: 5V, masa y señal.',
    interpretacion: 'P0106 no confirma sensor MAP dañado.',
    hipotesis: [{ titulo: 'Masa intermitente en conector MAP', justificacion: 'Código + ralenti inestable', nivel: 'posible' }],
    evidencias: [{ descripcion: 'DTC P0106', tipo: 'codigo' }],
    proximaPrueba: {
      titulo: 'Medir 5V de referencia en conector MAP',
      comoRealizarla: 'Con llave on, motor apagado, medir entre 5V y masa.',
      condiciones: 'Bogotá, A/C off',
      parametros: [{
        nombreOriginal: '5V Reference',
        nombresAlternativos: ['Voltaje de referencia', '5V REF'],
        unidadEsperada: 'V',
        tipoEntrada: 'numero',
        referencia: '',
        procedenciaReferencia: 'pendiente'
      }],
      quePuedeSignificar: 'Si no hay 5V, no culpar al sensor.',
      queResponder: 'Voltaje medido y unidad.',
      grupoParametrosRelacionados: false
    },
    referencias: [],
    limitaciones: '',
    estadoDiagnostico: 'en_curso',
    estadoCasoSugerido: 'esperando_medicion',
    advertencias: []
  };
}

test('el prompt de sistema incluye las reglas técnicas obligatorias', () => {
  assert.match(DIAGNOSIS_SYSTEM_PROMPT, /No diagnostiques una pieza únicamente por un código/);
  assert.match(DIAGNOSIS_SYSTEM_PROMPT, /No inventes tolerancias/);
  assert.match(DIAGNOSIS_SYSTEM_PROMPT, /altura de Bogotá/);
  assert.match(DIAGNOSIS_SYSTEM_PROMPT, /No inventes porcentajes de certeza/);
});

test('mapea clave ausente sin llamar al proveedor', async () => {
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(
    () => requestDiagnosisTurn({ input: [], clientFactory: () => { throw new Error('no debe crearse'); } }),
    (err) => err instanceof DiagnosisProviderError && err.code === 'missing_key'
  );
  if (prev != null) process.env.OPENAI_API_KEY = prev;
});

test('acepta una respuesta estructurada simulada del SDK', async () => {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-not-real';
  const fakeClient = {
    responses: {
      create: async () => ({
        id: 'resp_test',
        status: 'completed',
        model: 'gpt-4o-mini',
        output_text: JSON.stringify(validOutput()),
        usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 }
      })
    }
  };
  const result = await requestDiagnosisTurn({
    input: [{ role: 'user', content: 'FICTICIO: P0106 en Duster H5Ht. No culpes al sensor aún.' }],
    clientFactory: () => fakeClient,
    documents: []
  });
  assert.equal(result.output.proximaPrueba.titulo.includes('5V'), true);
  assert.equal(result.usage.totalTokens, 150);
  assert.match(result.output.limitaciones, /Base técnica pendiente/);
});

test('detecta rechazo del modelo', async () => {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-not-real';
  const fakeClient = {
    responses: {
      create: async () => ({
        id: 'resp_ref',
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }],
        usage: {}
      })
    }
  };
  await assert.rejects(
    () => requestDiagnosisTurn({ input: [], clientFactory: () => fakeClient }),
    (err) => err.code === 'refusal'
  );
});
