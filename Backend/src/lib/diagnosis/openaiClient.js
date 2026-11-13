import { logger } from '../logger.js';
import { DIAGNOSIS_PROMPT_VERSION, DIAGNOSIS_SYSTEM_PROMPT } from './prompt.js';
import { DIAGNOSIS_TEXT_FORMAT, validateDiagnosisOutput, applyTechnicalGuards } from './schema.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 60000);

export class DiagnosisProviderError extends Error {
  constructor(code, message, httpStatus = 502, details = {}) {
    super(message);
    this.name = 'DiagnosisProviderError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export function openaiConfigStatus() {
  const key = process.env.OPENAI_API_KEY || '';
  return {
    configured: Boolean(key.trim()),
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    promptVersion: DIAGNOSIS_PROMPT_VERSION
  };
}

function mapProviderError(err) {
  const status = err?.status || err?.statusCode;
  const type = err?.error?.type || err?.code || '';
  const msg = String(err?.message || 'Error del proveedor de IA');

  if (!process.env.OPENAI_API_KEY) {
    return new DiagnosisProviderError('missing_key', 'Falta OPENAI_API_KEY en el backend. Configúrala en el entorno, no en el navegador.', 503);
  }
  if (status === 401 || type === 'invalid_api_key' || /incorrect api key/i.test(msg)) {
    return new DiagnosisProviderError('invalid_credentials', 'La clave de OpenAI es inválida o no tiene permiso para este proyecto.', 401);
  }
  if (status === 429 && (type === 'insufficient_quota' || /insufficient_quota|quota/i.test(msg))) {
    return new DiagnosisProviderError('insufficient_quota', 'La cuenta de OpenAI no tiene cuota o crédito disponible.', 429);
  }
  if (status === 429) {
    return new DiagnosisProviderError('rate_limit', 'OpenAI rechazó la solicitud por límite de uso. Espera un momento y reintenta.', 429);
  }
  if (err?.name === 'APIConnectionTimeoutError' || /timeout/i.test(msg)) {
    return new DiagnosisProviderError('timeout', 'La consulta a OpenAI superó el tiempo de espera.', 504);
  }
  if (status === 400 && /format|schema|json/i.test(msg)) {
    return new DiagnosisProviderError('format', 'OpenAI devolvió un error de formato en la salida estructurada.', 502);
  }
  if (status >= 500) {
    return new DiagnosisProviderError('provider', 'OpenAI no está disponible en este momento.', 502);
  }
  return new DiagnosisProviderError('provider', msg.slice(0, 280), status >= 400 ? status : 502);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(err) {
  const status = err?.status || err?.statusCode;
  if (status === 429 && err?.error?.type !== 'insufficient_quota') return true;
  if (status >= 500) return true;
  if (err?.name === 'APIConnectionError') return true;
  return false;
}

function extractOutputText(response) {
  if (!response) return '';
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
  const texts = [];
  for (const item of response.output || []) {
    if (item?.type === 'message') {
      for (const part of item.content || []) {
        if (part?.type === 'output_text' && part.text) texts.push(part.text);
        if (part?.type === 'refusal' && part.refusal) {
          throw new DiagnosisProviderError('refusal', 'El modelo rechazó responder esta solicitud.', 422, { refusal: part.refusal });
        }
      }
    }
  }
  return texts.join('\n');
}

export async function createOpenAIClient(overrides = {}) {
  const apiKey = overrides.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const { default: OpenAI } = await import('openai');
  return new OpenAI({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0
  });
}

export async function requestDiagnosisTurn({
  input,
  clientFactory = createOpenAIClient,
  documents = [],
  technicianConfirmed = false
} = {}) {
  const status = openaiConfigStatus();
  if (!status.configured) {
    throw new DiagnosisProviderError('missing_key', 'Falta OPENAI_API_KEY en el backend. Configúrala en el entorno, no en el navegador.', 503);
  }

  const client = await clientFactory();
  if (!client?.responses?.create) {
    throw new DiagnosisProviderError('sdk', 'El SDK de OpenAI no expone Responses API.', 500);
  }

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.responses.create({
        model: status.model,
        instructions: DIAGNOSIS_SYSTEM_PROMPT,
        input,
        store: false,
        temperature: 0.2,
        text: { format: DIAGNOSIS_TEXT_FORMAT }
      });

      if (response?.status === 'incomplete') {
        throw new DiagnosisProviderError('incomplete', 'La respuesta de OpenAI quedó incompleta.', 502, {
          reason: response.incomplete_details?.reason || 'unknown'
        });
      }

      const text = extractOutputText(response);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new DiagnosisProviderError('format', 'No se pudo interpretar el JSON estructurado de OpenAI.', 502);
      }

      const validated = validateDiagnosisOutput(parsed);
      if (!validated.ok) {
        throw new DiagnosisProviderError('format', `La respuesta estructurada no es válida: ${validated.errors.join('; ')}`, 502);
      }

      const output = applyTechnicalGuards(validated.value, { documents, technicianConfirmed });
      const usage = {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        totalTokens: response.usage?.total_tokens || ((response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)),
        model: response.model || status.model,
        responseId: response.id || '',
        promptVersion: DIAGNOSIS_PROMPT_VERSION
      };

      logger.info('diagnosis.openai.ok', {
        model: usage.model,
        tokens: usage.totalTokens,
        responseId: usage.responseId,
        attempt
      });

      return { output, usage, rawStatus: response.status || 'completed' };
    } catch (err) {
      lastErr = err instanceof DiagnosisProviderError ? err : mapProviderError(err);
      logger.warn('diagnosis.openai.error', {
        code: lastErr.code,
        status: lastErr.httpStatus,
        attempt,
        msg: lastErr.message
      });
      if (attempt < MAX_RETRIES && shouldRetry(err)) {
        await sleep(400 * (attempt + 1) * (attempt + 1));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}
