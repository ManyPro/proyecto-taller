
app.use('/api/v1/events', eventsRouter);
// Backend/src/server.js
import 'dotenv/config';
// Captura errores en handlers async automáticamente
import 'express-async-errors';

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Routers
import eventsRouter from './routes/events.routes.js';
import companyAuthRouter from './routes/auth.routes.js';
import healthRouter from './routes/health.js';
import mediaRouter from './routes/media.routes.js';
import notesRouter from './routes/notes.routes.js';
import inventoryRouter from './routes/inventory.routes.js';
import salesRouter from './routes/sales.routes.js';

// Lee empresa/usuario del JWT
import { authCompany } from './middlewares/auth.js';
import servicesRouter from './routes/services.routes.js';
import pricesRoutes from './routes/prices.routes.js';

const app = express();

// --- CORS con allowlist ---
// Si no defines ALLOWED_ORIGINS, usamos un fallback seguro (Netlify + localhost)
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
console.log('[CORS] allowList:', allowList);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);             // Postman/cURL
    if (allowList.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Cache-Control'] // ← añadido
};

app.use(cors(corsOptions));
// Responder preflights de todo
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('tiny'));

// estáticos /uploads si driver local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// raíz
app.get('/', (_req, res) =>
  res.status(200).json({ ok: true, name: 'taller-backend', ts: new Date().toISOString() })
);

// rutas públicas
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/media', mediaRouter);
app.use('/api/v1/notes', authCompany, withCompanyDefaults, notesRouter);
app.use('/api/v1/auth/company', companyAuthRouter);
app.use('/api/v1/sales', authCompany, withCompanyDefaults, salesRouter);
// ---- INYECTA companyId/userId AUTOMÁTICAMENTE EN INVENTORY ----
function withCompanyDefaults(req, _res, next) {
  if (req.company?.id) {
    // 👉 agrega estas dos propiedades que usan tus controllers
    req.companyId = String(req.company.id);
    if (req.user?.id) req.userId = String(req.user.id);

    // GET: añade filtro por empresa
    if (req.method === 'GET') {
      req.query = { ...req.query, companyId: req.companyId };
    }
    // Escrituras: asegura empresa/usuario en body
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      req.body ||= {};
      if (!req.body.companyId) req.body.companyId = req.companyId;
      if (!req.body.userId && req.userId) req.body.userId = req.userId;
    }
  }
  next();
}

// inventario protegido + defaults de empresa
app.use('/api/v1/inventory', authCompany, withCompanyDefaults, inventoryRouter);

// manejo de errores unificado
app.use((err, _req, res, _next) => {
  const isJsonParse = err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err);
  const status = isJsonParse ? 400 : (err.status || 500);
  const msg = isJsonParse ? 'JSON inválido o cuerpo no soportado' : (err.message || 'Internal error');
  if (!res.headersSent) res.status(status).json({ error: msg });
});

// DB + listen
const { MONGODB_URI } = process.env;
if (!MONGODB_URI) { console.error('Falta MONGODB_URI'); process.exit(1); }
mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || 'taller' })
  .then(() => console.log('MongoDB conectado'))
  .catch(err => { console.error('Error MongoDB:', err.message); process.exit(1); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API escuchando en :${PORT}`));

// 1) import
import quotesRouter from './routes/quotes.routes.js';

// 2) usar (protegido e inyectando companyId/userId como en inventario)
app.use('/api/v1/quotes', authCompany, withCompanyDefaults, quotesRouter);

app.use('/api/v1/services', authCompany, withCompanyDefaults, servicesRouter);
app.use('/api/v1/prices',   authCompany, withCompanyDefaults, pricesRoutes);