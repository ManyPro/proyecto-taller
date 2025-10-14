import 'dotenv/config';
import 'express-async-errors';

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { authCompany } from './middlewares/auth.js';
import skusRouter from './routes/skus.routes.js';
import companyAuthRouter from './routes/auth.routes.js';
import healthRouter from './routes/health.js';
import inventoryRouter from './routes/inventory.routes.js';
import mediaRouter from './routes/media.routes.js';
import notesRouter from './routes/notes.routes.js';
import pricesRoutes from './routes/prices.routes.js';
import quotesRouter from './routes/quotes.routes.js';
import salesRouter from './routes/sales.routes.js';
import salesStreamRouter from './routes/sales.stream.route.js';
import servicesRouter from './routes/services.routes.js';
import profilesRouter from './routes/profiles.routes.js';
import companyRouter from './routes/company.routes.js';
import cashflowRouter from './routes/cashflow.routes.js';
import templatesRouter from './routes/templates.routes.js';
import notificationsRouter from './routes/notifications.routes.js';
import publicCatalogRouter from './routes/catalog.public.routes.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      connectSrc: ["'self'", 'https:', 'http:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  referrerPolicy: { policy: 'no-referrer' }
}));
app.use(compression());

// requestId + access log
app.use((req, res, next) => {
  const rid = crypto.randomUUID();
  req.requestId = rid;
  res.setHeader('X-Request-ID', rid);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start)/1e6;
    logger.info('access', {
      rid,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms*100)/100,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress,
      ua: req.headers['user-agent'] || ''
    });
  });
  next();
});

// --- In-memory rate limits (simple buckets) ---
const rlBuckets = new Map(); // key -> { count, ts }
const RL_WINDOW = 60_000;
const RL_PUBLIC_MAX = parseInt(process.env.PUBLIC_RATE_MAX || '120',10);
const RL_CHECKOUT_MAX = parseInt(process.env.CHECKOUT_RATE_MAX || '30',10); // más estricto
const RL_AUTH_MAX = parseInt(process.env.AUTH_RATE_MAX || '40',10);

function applyRate(ip, key, limit){
  const now = Date.now();
  const bucketKey = ip + '|' + key;
  const bucket = rlBuckets.get(bucketKey) || { count:0, ts: now };
  if(now - bucket.ts > RL_WINDOW){ bucket.count = 0; bucket.ts = now; }
  bucket.count++;
  rlBuckets.set(bucketKey, bucket);
  return bucket.count <= limit;
}

function rateLimit(req, res, next){
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const p = req.path;
  if(p.startsWith('/api/v1/public/catalog/checkout')){
    if(!applyRate(ip,'checkout', RL_CHECKOUT_MAX)){
      logger.warn('rate.limit.checkout', { ip });
      return res.status(429).json({ error: 'Demasiados intentos de checkout. Intenta en un minuto.' });
    }
    return next();
  }
  if(p.startsWith('/api/v1/auth/company')){
    if(!applyRate(ip,'auth', RL_AUTH_MAX)){
      logger.warn('rate.limit.auth', { ip });
      return res.status(429).json({ error: 'Demasiadas solicitudes de autenticación. Espera un momento.' });
    }
    return next();
  }
  if(p.startsWith('/api/v1/public/catalog')){
    if(!applyRate(ip,'public', RL_PUBLIC_MAX)){
      logger.warn('rate.limit.public', { ip, path: p });
      return res.status(429).json({ error: 'Rate limit excedido. Intenta en un momento.' });
    }
  }
  next();
}

// --- Lightweight ETag + Cache-Control for GET public catalog ---
function publicCacheHeaders(req, res, next){
  if(req.method !== 'GET' || !req.path.startsWith('/api/v1/public/catalog')) return next();
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  // Build a weak ETag from path + query
  const tagBase = req.originalUrl + '|' + (process.env.CACHE_VERSION || 'v1');
  const etag = 'W/"' + Buffer.from(tagBase).toString('base64').slice(0,16) + '"';
  const inm = req.headers['if-none-match'];
  if(inm && inm === etag){
    res.status(304).end();
    return;
  }
  res.setHeader('ETag', etag);
  next();
}

// --- CORS allowlist ---
const envAllow = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const defaultAllow = [
  'https://proyecto-taller.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

const allowList = envAllow.length ? envAllow : defaultAllow;
logger.info('[CORS] allowList', { allowList });

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);           // Postman/cURL
    if (allowList.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// app.use(morgan('tiny')); // redundante con access log estructurado
app.use(rateLimit);
app.use(publicCacheHeaders);

// Static uploads (local driver)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, name: 'taller-backend', ts: new Date().toISOString() });
});

// Public routes
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/media', mediaRouter);
app.use('/api/v1/sales', salesStreamRouter);
app.use('/api/v1/auth/company', companyAuthRouter);
app.use('/api/v1/public/catalog', publicCatalogRouter);

function withCompanyDefaults(req, _res, next) {
  if (req.company?.id) {
    req.companyId = String(req.company.id);
    if (req.user?.id) req.userId = String(req.user.id);

    if (req.method === 'GET') {
      req.query = { ...req.query, companyId: req.companyId };
    }
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
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
app.use('/api/v1/prices', authCompany, withCompanyDefaults, pricesRoutes);
app.use('/api/v1/quotes', authCompany, withCompanyDefaults, quotesRouter);
app.use('/api/v1/profiles', authCompany, withCompanyDefaults, profilesRouter);
app.use('/api/v1/company', companyRouter);
app.use('/api/v1/cashflow', authCompany, withCompanyDefaults, cashflowRouter);
app.use('/api/v1/templates', authCompany, withCompanyDefaults, templatesRouter);
app.use('/api/v1/notifications', authCompany, withCompanyDefaults, notificationsRouter);
app.use('/api/v1/skus', authCompany, withCompanyDefaults, skusRouter);

app.use((err, _req, res, _next) => {
  const isJsonParse = err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err);
  const status = isJsonParse ? 400 : (err.status || 500);
  const msg = isJsonParse ? 'JSON invalido o cuerpo no soportado' : (err.message || 'Internal error');
  logger.error('request.error', { rid: _req.requestId, status, msg, stack: err.stack?.split('\n').slice(0,4).join('\n') });
  if (!res.headersSent) res.status(status).json({ error: msg, requestId: _req.requestId });
});

const { MONGODB_URI } = process.env;
if (!MONGODB_URI) {
  logger.error('config.missing.mongodb_uri');
  process.exit(1);
}

mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || 'taller' })
  .then(() => logger.info('mongo.connected', { db: process.env.MONGODB_DB || 'taller' }))
  .catch(err => {
    logger.error('mongo.connect.error', { err: err.message });
    process.exit(1);
  });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info('server.listen', { port: PORT });
});


