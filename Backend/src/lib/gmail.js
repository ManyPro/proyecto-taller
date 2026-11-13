import { logger } from './logger.js';

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

const accessCache = new Map(); // companyId -> { token, expiresAt }

export function gmailConfigured() {
  return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET);
}

export function gmailRedirectUri() {
  return process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/gmail/callback';
}

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID,
    redirect_uri: gmailRedirectUri(),
    response_type: 'code',
    scope: GMAIL_READONLY_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function postForm(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error_description || json.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function exchangeCode(code) {
  return postForm(TOKEN_URL, {
    code,
    client_id: process.env.GMAIL_CLIENT_ID,
    client_secret: process.env.GMAIL_CLIENT_SECRET,
    redirect_uri: gmailRedirectUri(),
    grant_type: 'authorization_code'
  });
}

export async function refreshAccessToken(refreshToken) {
  return postForm(TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: process.env.GMAIL_CLIENT_ID,
    client_secret: process.env.GMAIL_CLIENT_SECRET,
    grant_type: 'refresh_token'
  });
}

export async function getAccessToken(companyId, refreshToken) {
  const key = String(companyId);
  const cached = accessCache.get(key);
  if (cached?.token && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }
  const tokens = await refreshAccessToken(refreshToken);
  const expiresAt = Date.now() + Math.max(30, Number(tokens.expires_in || 3600) - 60) * 1000;
  accessCache.set(key, { token: tokens.access_token, expiresAt });
  return tokens.access_token;
}

export function clearAccessCache(companyId) {
  accessCache.delete(String(companyId));
}

async function gmailGet(accessToken, path, query = {}) {
  const url = new URL(`${GMAIL_API}${path}`);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error?.message || json.error_description || `Gmail HTTP ${res.status}`);
    err.status = res.status;
    err.code = json.error?.code;
    throw err;
  }
  return json;
}

export async function getProfile(accessToken) {
  return gmailGet(accessToken, '/profile');
}

function decodeB64Url(data = '') {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function collectText(payload, out) {
  if (!payload) return;
  if (payload.body?.data && /^text\/(plain|html)/i.test(payload.mimeType || '')) {
    out.push({ mime: payload.mimeType, text: decodeB64Url(payload.body.data) });
  }
  (payload.parts || []).forEach((part) => collectText(part, out));
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function headerMap(headers = []) {
  const map = {};
  for (const h of headers) {
    if (!h?.name) continue;
    map[String(h.name).toLowerCase()] = h.value || '';
  }
  return map;
}

export function extractMessageContent(message) {
  const headers = headerMap(message.payload?.headers || []);
  const parts = [];
  collectText(message.payload, parts);
  const plain = parts.find((p) => /text\/plain/i.test(p.mime))?.text
    || stripHtml(parts.find((p) => /text\/html/i.test(p.mime))?.text || '')
    || stripHtml(message.snippet || '');
  return {
    id: message.id,
    threadId: message.threadId,
    internalDate: Number(message.internalDate || 0),
    historyId: message.historyId,
    from: headers.from || '',
    subject: headers.subject || '',
    snippet: message.snippet || '',
    body: plain
  };
}

function colombianToNumber(raw) {
  const s = String(raw || '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes('.') && s.includes(',')) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) return Number(s.replace(/\./g, '').replace(',', '.'));
    return Number(s.replace(/,/g, ''));
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  if (/^\d{1,3}(,\d{3})+$/.test(s)) return Number(s.replace(/,/g, ''));
  if (/^\d+[.,]\d{1,2}$/.test(s)) return Number(s.replace(',', '.'));
  const n = Number(s.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseCopAmount(text) {
  const src = String(text || '');
  const patterns = [
    /valor(?:\s+de)?\s*\$?\s*([\d]{1,3}(?:[.\s]\d{3})+(?:,\d{2})?|\d+[.,]\d{2}|\d+)/i,
    /\$\s*([\d]{1,3}(?:\.\d{3})+(?:,\d{2})?)/,
    /\$\s*([\d]{1,3}(?:,\d{3})+(?:\.\d{2})?)/,
    /COP\s*\$?\s*([\d\.\,]+)/i,
    /recibiste\s+\$?\s*([\d\.\,]+)/i
  ];
  for (const re of patterns) {
    const m = src.match(re);
    if (m?.[1]) {
      const amount = colombianToNumber(m[1]);
      if (amount && amount > 0) return amount;
    }
  }
  return null;
}

export function parsePaymentChannel(text) {
  const blob = String(text || '').toLowerCase();
  if (/bre-?b/.test(blob)) return 'Bre-B';
  if (/\bqr\b|c[oó]digo qr/.test(blob)) return 'QR';
  if (/transferencia/.test(blob)) return 'Transferencia';
  return 'Bancolombia';
}

export function parseSenderName(text) {
  const src = String(text || '').replace(/\s+/g, ' ');
  const patterns = [
    /transferencia electr[oó]nica de\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s.]{2,80}?)(?:\s+por valor|\s+por \$|\s+el d[ií]a)/i,
    /de parte de\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s.]{2,80}?)(?:\s+por|\s+\$)/i,
    /origen[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s.]{2,80})/i
  ];
  for (const re of patterns) {
    const m = src.match(re);
    if (m?.[1]) return m[1].trim().replace(/\s+/g, ' ');
  }
  return '';
}

export function isBankNotice(from, subject, body) {
  const blob = `${from} ${subject} ${body}`.toLowerCase();
  if (/accounts\.google\.com|no-reply@accounts\.google|security alert|alerta de seguridad/.test(blob)) {
    return false;
  }
  return /bancolombia|grupoaval|bre-?b|nequi|davivienda|transferencia|recibiste|pago qr|c[oó]digo qr|transacci[oó]n/.test(blob);
}

export async function listRecentMessageIds(accessToken, { newerThan = '2d', maxResults = 20 } = {}) {
  const data = await gmailGet(accessToken, '/messages', {
    q: `newer_than:${newerThan}`,
    maxResults
  });
  return (data.messages || []).map((m) => m.id).filter(Boolean);
}

export async function listHistoryMessageIds(accessToken, startHistoryId) {
  const data = await gmailGet(accessToken, '/history', {
    startHistoryId,
    historyTypes: 'messageAdded'
  });
  const ids = [];
  for (const item of data.history || []) {
    for (const added of item.messagesAdded || []) {
      if (added.message?.id) ids.push(added.message.id);
    }
  }
  return { messageIds: [...new Set(ids)], historyId: data.historyId || startHistoryId };
}

export async function getMessage(accessToken, id) {
  return gmailGet(accessToken, `/messages/${id}`, { format: 'full' });
}

export function formatCop(amount) {
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(amount);
}

export function frontendBaseUrl() {
  if (process.env.FRONTEND_BASE_URL) return process.env.FRONTEND_BASE_URL.replace(/\/$/, '');
  const first = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .find(Boolean);
  return first || 'http://localhost:5173';
}

export function logGmail(event, extra = {}) {
  logger.info(`gmail.${event}`, extra);
}
