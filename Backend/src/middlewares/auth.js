import jwt from 'jsonwebtoken';

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
    req.user = { id: payload.sub, ...payload }; // flexible
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Si manejas multi-empresa por "companyId" en el token:
export function authCompany(req, res, next) {
  try {
    const token = parseBearer(req);
    if (!token) return res.status(401).json({ error: 'Missing Bearer token' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.companyId) return res.status(403).json({ error: 'No company in token' });
    req.company = { id: payload.companyId };
    req.user = { id: payload.sub, ...payload };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
