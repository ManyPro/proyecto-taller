import 'dotenv/config';
import 'express-async-errors';

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import companyAuthRouter from './routes/auth.routes.js';
import healthRouter from './routes/health.js';
import mediaRouter from './routes/media.routes.js';
import notesRouter from './routes/notes.routes.js';
import inventoryRouter from './routes/inventory.routes.js';
import salesRouter from './routes/sales.routes.js';
import { authCompany } from './middlewares/auth.js';
import servicesRouter from './routes/services.routes.js';
import pricesRoutes from './routes/prices.routes.js';
import quotesRouter from './routes/quotes.routes.js';

const app = express();

const envAllow = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const defaultAllow = [
  'https://proyecto-taller.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000'
];
const allowList = envAllow.length ? envAllow : defaultAllow;
console.log('[CORS] allowList:', allowList);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowList.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Cache-Control']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('tiny'));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ===== SSE =====
const sseClients = new Map(); // companyId -> Set(res)

function sseSend(companyId, event, data) {
  const set = sseClients.get(String(companyId));
  if (!set || !set.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch {}
  }
}
app.set('sseSend', sseSend);

app.get('/api/v1/stream', (req, res) => {
  const companyId = String(req.query.companyId || '').trim();
  if (!companyId) return res.status(400).send('companyId required');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n');

  const set = sseClients.get(companyId) || new Set();
  set.add(res);
  sseClients.set(companyId, set);
  console.log(`[SSE] +1 company=${companyId} -> ${set.size} clients`);

  const ping = setInterval(() => { try { res.write(':\n\n'); } catch {} }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    const s = sseClients.get(companyId);
    if (s) { s.delete(res); if (!s.size) sseClients.delete(companyId); }
    console.log(`[SSE] -1 company=${companyId} -> ${s ? s.size : 0} clients`);
  });
});

// ===== Rutas =====
app.get('/', (_req, res) => res.status(200).json({ ok: true, name: 'taller-backend', ts: new Date().toISOString() }));
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/media', mediaRouter);
app.use('/api/v1/auth/company', companyAuthRouter);

function withCompanyDefaults(req, _res, next) {
  if (req.company?.id) {
    req.companyId = String(req.company.id);
    if (req.user?.id) req.userId = String(req.user.id);
    if (req.method === 'GET') {
      req.query = { ...req.query, companyId: req.companyId };
    }
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      req.body ||= {};
      if (!req.body.companyId) req.body.companyId = req.companyId;
      if (!req.body.userId && req.userId) req.body.userId = req.userId;
    }
  }
  next();
}

app.use('/api/v1/notes', authCompany, withCompanyDefaults, notesRouter);
app.use('/api/v1/sales', authCompany, withCompanyDefaults, salesRouter);
app.use('/api/v1/inventory', authCompany, withCompanyDefaults, inventoryRouter);
app.use('/api/v1/services', authCompany, withCompanyDefaults, servicesRouter);
app.use('/api/v1/prices',   authCompany, withCompanyDefaults, pricesRoutes);
app.use('/api/v1/quotes',   authCompany, withCompanyDefaults, quotesRouter);

app.use((err, _req, res, _next) => {
  const isJsonParse = err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err);
  const status = isJsonParse ? 400 : (err.status || 500);
  const msg = isJsonParse ? 'JSON inválido o cuerpo no soportado' : (err.message || 'Internal error');
  if (!res.headersSent) res.status(status).json({ error: msg });
});

const { MONGODB_URI } = process.env;
if (!MONGODB_URI) { console.error('Falta MONGODB_URI'); process.exit(1); }
mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || 'taller' })
  .then(() => console.log('MongoDB conectado'))
  .catch(err => { console.error('Error MongoDB:', err.message); process.exit(1); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API escuchando en :${PORT}`));
