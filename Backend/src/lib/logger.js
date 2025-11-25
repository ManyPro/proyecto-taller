// Backend/src/lib/logger.js
// Logger estructurado JSON con niveles y request context opcional.
import util from 'util';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const currentLevelName = process.env.LOG_LEVEL || 'info';
const currentLevel = LEVELS[currentLevelName] || LEVELS.info;

function basePayload(level, msg, extra){
  const now = new Date();
  return {
    ts: now.toISOString(),
    level,
    msg: typeof msg === 'string' ? msg : util.format('%o', msg),
    ...extra
  };
}

function emit(payload){
  try {
    // Escribir JSON estructurado para herramientas de log
    process.stdout.write(JSON.stringify(payload) + '\n');
    // También escribir formato legible para debugging en Docker
    // FORZAR salida inmediata sin buffering
    const readable = `[${payload.ts}] ${payload.level.toUpperCase()}: ${payload.msg}${payload.extra ? ' ' + JSON.stringify(payload.extra) : ''}`;
    process.stdout.write(readable + '\n');
    // También usar console.log para asegurar que se vea
    console.log(readable);
  } catch(e){
    // fallback - forzar salida
    const fallback = JSON.stringify(payload);
    process.stdout.write(fallback + '\n');
    console.log(payload);
  }
}

function log(level, msg, extra){
  if(LEVELS[level] < currentLevel) return;
  emit(basePayload(level, msg, extra));
}

export const logger = {
  debug: (msg, extra) => log('debug', msg, extra),
  info: (msg, extra) => log('info', msg, extra),
  warn: (msg, extra) => log('warn', msg, extra),
  error: (msg, extra) => log('error', msg, extra),
  child: (bindings={}) => ({
    debug: (m,e={}) => log('debug', m, { ...bindings, ...e }),
    info: (m,e={}) => log('info', m, { ...bindings, ...e }),
    warn: (m,e={}) => log('warn', m, { ...bindings, ...e }),
    error: (m,e={}) => log('error', m, { ...bindings, ...e })
  })
};

// Helper para medir duración de operaciones
export function timeOp(name){
  const start = process.hrtime.bigint();
  return {
    end(extra={}){
      const end = process.hrtime.bigint();
      const ms = Number(end - start) / 1e6;
      logger.info(`op ${name} done`, { op:name, ms: Math.round(ms*100)/100, ...extra });
      return ms;
    }
  };
}

export function withError(fn){
  try { return fn(); } catch(e){ logger.error('sync error', { err: e.message, stack: e.stack }); throw e; }
}
