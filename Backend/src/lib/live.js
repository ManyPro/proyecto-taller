// Backend/src/lib/live.js (HOTFIX 2025-09-26)
import { EventEmitter } from 'node:events';

// Pub/Sub por empresa
const clients = new Map(); // companyId => Set(res)

export function sseHandler(req, res) {
  const companyId = String(req.companyId || (req.user && req.user.companyId) || '');
  if (!companyId) { res.status(401).end('Unauthorized'); return; }

  // Headers SSE (y evitar buffering en proxies)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Registrar cliente
  if (!clients.has(companyId)) clients.set(companyId, new Set());
  clients.get(companyId).add(res);

  // Mensaje de bienvenida (para abrir el stream en el cliente)
  try { res.write('event: connected\ndata: {}\n\n'); } catch {}

  // Keep-alive (evitar timeouts sin usar la sintaxis problemática de comentarios)
  const keepAlive = setInterval(() => {
    try { res.write(`event: ping\ndata: {"ts":${Date.now()}}\n\n`); } catch {}
  }, 25000);

  // Limpieza
  req.on('close', () => {
    clearInterval(keepAlive);
    const set = clients.get(companyId);
    if (set) { set.delete(res); if (set.size === 0) clients.delete(companyId); }
  });
}

export function publish(companyId, event, payload = {}) {
  const set = clients.get(String(companyId));
  if (!set || set.size === 0) return;
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(data); } catch {}
  }
}

export default { sseHandler, publish };
