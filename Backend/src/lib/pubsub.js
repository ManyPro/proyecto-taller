// src/lib/pubsub.js
import EventEmitter from 'events';

const bus = new EventEmitter();
bus.setMaxListeners(1000);

export function publish(companyId, event, payload) {
  try {
    const key = String(companyId || '');
    if (!key) return;
    const [entity, ...rest] = String(event || '').split(':');
    const action = rest.join(':') || '';
    bus.emit(`c:${key}`, { entity, action, data: payload });
  } catch {}
}

export function subscribe(companyId, handler) {
  const key = `c:${String(companyId || '')}`;
  const fn = (msg) => { try { handler(msg); } catch {} };
  bus.on(key, fn);
  return () => bus.off(key, fn);
}
