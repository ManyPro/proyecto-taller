/**
 * Prueba mínima real contra OpenAI Responses API.
 * No imprime la clave. Sale 0 si hay respuesta estructurada válida.
 *
 *   cd Backend
 *   node scripts/test_openai_diagnosis.js
 */
import 'dotenv/config';
import { requestDiagnosisTurn, openaiConfigStatus } from '../src/lib/diagnosis/openaiClient.js';
import { wrapUserPayload } from '../src/lib/diagnosis/sanitize.js';

const status = openaiConfigStatus();
if (!status.configured) {
  console.error('PENDIENTE: OPENAI_API_KEY no está configurada en el entorno del backend.');
  console.error('No se realizó ninguna llamada real. Completa Backend/.env (ver .env.example).');
  process.exit(2);
}

console.log('Modelo:', status.model);
console.log('Prompt:', status.promptVersion);
console.log('Enviando caso ficticio de prueba...');

try {
  const { output, usage } = await requestDiagnosisTurn({
    input: [{
      role: 'user',
      content: wrapUserPayload('MENSAJE_DEL_TECNICO', {
        etiqueta: 'CASO FICTICIO DE PRUEBA — no es un vehículo real',
        vehiculo: { modelo: 'Duster', anio: 2020, motor: 'H5Ht 1.3 turbo', ciudad: 'Bogotá' },
        sintoma: 'ralenti inestable en caliente',
        dtcs: { estado: 'con_codigos', codigos: [{ code: 'P0106', description: 'MAP performance', status: 'stored' }] },
        pedido: 'Indica la primera comprobación. No concluyas sensor dañado solo por el código.'
      })
    }],
    documents: []
  });
  if (!output?.proximaPrueba?.titulo) {
    console.error('La respuesta real no trajo próxima prueba.');
    process.exit(1);
  }
  console.log('Llamada real: OK');
  console.log('Resumen:', output.resumen);
  console.log('Próxima prueba:', output.proximaPrueba.titulo);
  console.log('Tokens:', usage.totalTokens, 'modelo:', usage.model);
  process.exit(0);
} catch (err) {
  console.error('Llamada real falló:', err.code || err.name, err.message);
  process.exit(1);
}
