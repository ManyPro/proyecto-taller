// src/routes/events.routes.js
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { subscribe } from '../lib/pubsub.js';

const router = Router();

router.get('/stream', (req, res) => {
  try {
    const token = req.query.token || '';
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const payload = jwt.verify(String(token), process.env.JWT_SECRET);
    const companyId = payload.companyId;
    if (!companyId) return res.status(403).json({ error: 'No company in token' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`: connected\n\n`);

    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const unsub = subscribe(companyId, send);
    const ping = setInterval(() => res.write(': ping\n\n'), 30000);

    req.on('close', () => { clearInterval(ping); unsub(); res.end(); });
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
