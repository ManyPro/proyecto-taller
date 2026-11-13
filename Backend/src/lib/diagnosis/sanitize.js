const SECRET_RE = /(sk-[A-Za-z0-9_-]{10,}|OPENAI_API_KEY\s*=\s*\S+|Bearer\s+[A-Za-z0-9._-]{20,})/gi;
const INJECTION_RE = /(ignore\s+(all\s+)?(previous|prior)\s+instructions|olvid[ae]\s+las\s+instrucciones|revela\s+(el\s+)?(prompt|secreto|api\s*key)|system\s*prompt)/gi;
const PII_KEYS = ['ownerName', 'owner', 'customerName', 'cliente', 'telefono', 'phone', 'email', 'cedula', 'documento', 'address', 'direccion'];

export function redactSecrets(text) {
  return String(text || '').replace(SECRET_RE, '[REDACTED]');
}

export function stripInjectionAttempts(text) {
  return String(text || '').replace(INJECTION_RE, '[contenido omitido]');
}

export function clipText(text, max = 4000) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…[truncado]`;
}

export function sanitizeText(text, max = 4000) {
  return clipText(stripInjectionAttempts(redactSecrets(text)), max);
}

export function omitPii(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(omitPii);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEYS.includes(k)) continue;
    out[k] = typeof v === 'object' && v !== null ? omitPii(v) : v;
  }
  return out;
}

export function wrapUserPayload(tag, content) {
  return `<${tag}>\n${sanitizeText(typeof content === 'string' ? content : JSON.stringify(content, null, 2), 12000)}\n</${tag}>`;
}
