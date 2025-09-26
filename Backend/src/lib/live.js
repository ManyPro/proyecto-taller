// Backend/src/lib/live.js
import { EventEmitter } from 'node:events';

/**
 * In-memory pub/sub per company for SSE.
 * Not clustered; suitable for single-process or dev deployments.
 */
const bus = new EventEmitter();
bus.setMaxListeners(1000);

const clients = new Map(); // companyId => Set(res)

export function sseHandler(req, res) {
  const companyId = req.companyId || (req.user && req.user.companyId);
  if (!companyId) {
    res.status(401).end('Unauthorized');
    return;
  }
  // Headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Keep-alive
  const keepAlive = setInterval(() => {
    try { res.write(':

'); } catch { /* ignore */ }
  }, 25000);

  // Register client
  if (!clients.has(companyId)) clients.set(companyId, new Set());
  clients.get(companyId).add(res);

  // On close
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
    try { res.write(data); } catch { /* ignore */ }
  }
}

export default { sseHandler, publish };
