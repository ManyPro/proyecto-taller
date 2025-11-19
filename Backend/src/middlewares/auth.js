import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger.js';

function parseBearer(req) {
  const h = req.headers.authorization || '';
  const [scheme, token] = h.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : null;
}

export function authUser(req, res, next) {
  try {
    const token = parseBearer(req);
    if (!token) return res.status(401).json({ error: 'Missing Bearer token' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, ...payload };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function authCompany(req, res, next) {
  try {
    const token = parseBearer(req);
    if (!token) {
      logger.warn('[authCompany] Missing Bearer token', { path: req.path, method: req.method });
      return res.status(401).json({ error: 'Missing Bearer token' });
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.companyId) {
      logger.warn('[authCompany] No company in token', { path: req.path, method: req.method, userId: payload.sub });
      return res.status(403).json({ error: 'No company in token' });
    }
    req.company = { id: payload.companyId };
    req.user = { id: payload.sub, ...payload };
    logger.debug('[authCompany] Authenticated', { path: req.path, method: req.method, companyId: payload.companyId });
    next();
  } catch (err) {
    logger.warn('[authCompany] Invalid token', { path: req.path, method: req.method, error: err?.message });
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function authAdmin(req, res, next){
  try{
    const token = parseBearer(req);
    if(!token) return res.status(401).json({ error: 'Missing Bearer token' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if(payload?.kind !== 'admin' && payload?.kind !== 'dev') return res.status(403).json({ error: 'No admin token' });
    req.user = { id: payload.sub, ...payload };
    next();
  }catch{ return res.status(401).json({ error: 'Invalid token' }); }
}

export function requireAdminRole(...roles){
  return function(req, res, next){
    const r = req.user?.role;
    if(!r) return res.status(403).json({ error: 'No role' });
    if(roles.length && !roles.includes(r)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
