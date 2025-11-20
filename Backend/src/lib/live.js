// Backend/src/lib/live.js (HOTFIX 2025-09-26)
import { EventEmitter } from 'node:events';

// Pub/Sub por empresa
const clients = new Map(); // companyId => Set(res)

// Cache de empresas que comparten BD (se actualiza periódicamente)
let sharedDatabaseCache = new Map(); // companyId => Set(sharedCompanyIds)
let cacheLastUpdate = 0;
const CACHE_TTL = 60000; // 1 minuto

// Función para obtener empresas que comparten BD (con cache)
async function getSharedCompanies(companyId) {
  const now = Date.now();
  if (now - cacheLastUpdate < CACHE_TTL && sharedDatabaseCache.has(String(companyId))) {
    return sharedDatabaseCache.get(String(companyId));
  }
  
  try {
    const Company = (await import('../models/Company.js')).default;
    const company = await Company.findById(companyId).select('sharedDatabaseConfig sharedDatabaseId').lean();
    if (!company) return new Set();
    
    const sharedIds = new Set();
    
    // Nuevo sistema: sharedDatabaseConfig
    if (company.sharedDatabaseConfig?.sharedFrom?.companyId) {
      // Esta empresa es secundaria, compartir con la principal
      sharedIds.add(String(company.sharedDatabaseConfig.sharedFrom.companyId));
      
      // También buscar otras empresas secundarias que comparten la misma BD principal
      const mainCompanyId = company.sharedDatabaseConfig.sharedFrom.companyId;
      const mainCompany = await Company.findById(mainCompanyId).select('sharedDatabaseConfig').lean();
      if (mainCompany?.sharedDatabaseConfig?.sharedWith) {
        mainCompany.sharedDatabaseConfig.sharedWith.forEach(sw => {
          sharedIds.add(String(sw.companyId));
        });
      }
    } else if (company.sharedDatabaseConfig?.sharedWith) {
      // Esta empresa es principal, compartir con todas las secundarias
      company.sharedDatabaseConfig.sharedWith.forEach(sw => {
        sharedIds.add(String(sw.companyId));
      });
    }
    
    // Sistema antiguo: sharedDatabaseId (compatibilidad)
    if (company.sharedDatabaseId) {
      sharedIds.add(String(company.sharedDatabaseId));
    }
    
    // Actualizar cache
    sharedDatabaseCache.set(String(companyId), sharedIds);
    cacheLastUpdate = now;
    
    return sharedIds;
  } catch (err) {
    console.error('[live.js] Error obteniendo empresas compartidas:', err);
    return new Set();
  }
}

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

export async function publish(companyId, event, payload = {}) {
  const companyIdStr = String(companyId);
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  
  // Publicar a la empresa original
  const set = clients.get(companyIdStr);
  if (set && set.size > 0) {
    for (const res of set) {
      try { res.write(data); } catch {}
    }
  }
  
  // Publicar a empresas que comparten BD
  try {
    const sharedCompanies = await getSharedCompanies(companyIdStr);
    for (const sharedId of sharedCompanies) {
      const sharedSet = clients.get(sharedId);
      if (sharedSet && sharedSet.size > 0) {
        for (const res of sharedSet) {
          try { res.write(data); } catch {}
        }
      }
    }
  } catch (err) {
    console.error('[live.js] Error publicando a empresas compartidas:', err);
  }
}

export default { sseHandler, publish };
