// Backend/src/routes/sales.stream.route.js
// Ruta pública (solo esta) para SSE con ?token=JWT
// Verifica el token y setea req.companyId para sseHandler.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { sseHandler } from '../lib/live.js';

const router = Router();

function sseAuth(req, res, next) {
  const qtok = (req.query.token || '').toString();
  const hAuth = (req.headers.authorization || '');
  const hat = hAuth.startsWith('Bearer ') ? hAuth.slice(7) : '';
  const token = qtok || hat;
  if (!token) return res.status(401).end('Unauthorized');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload debe contener companyId (igual que en tu middleware)
    req.user = { id: payload.userId || payload.id || payload.sub, companyId: payload.companyId };
    req.companyId = payload.companyId;
    return next();
  } catch (e) {
    return res.status(401).end('Unauthorized');
  }
}

// GET /api/v1/sales/stream?token=...
router.get('/stream', sseAuth, sseHandler);

export default router;
