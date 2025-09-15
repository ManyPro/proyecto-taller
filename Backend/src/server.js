import 'dotenv/config';
// Captura excepciones en handlers async (express 4)
import 'express-async-errors';

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Routers
import companyAuthRouter from './routes/auth.routes.js';
import healthRouter from './routes/health.js';
import mediaRouter from './routes/media.routes.js';
import notesRouter from './routes/notes.routes.js';
import inventoryRouter from './routes/inventory.routes.js';

// Auth middleware (para leer companyId/userId del token)
import { authCompany } from './middlewares/auth.js';

const app = express();

// --- CORS por ALLOWED_ORIGINS ---
const allowList = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: function (origin, cb) {
    if (!origin) return cb(null, true); // Postman/cURL
    if (allowList.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
};

app.use(cors(corsOptions));
// Responder preflights de todo
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan('tiny'));

// --- /uploads estático si driver local ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Raíz simple
app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, name: 'taller-backend', ts: new Date().toISOString() });
});

// --- Rutas públicas/otras ---
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/media', mediaRouter);
app.use('/api/v1/notes', notesRouter);
app.use('/api/v1/auth/company', companyAuthRouter);

// --- Helper: inyecta companyId/userId y filtra por empresa automáticamente ---
function withCompanyDefaults(req, _res, next) {
  // si vienes autenticado como empresa
  if (req.company?.id) {
    // GET: forzamos filtro por empresa (si tu controlador lo usa)
    if (req.method === 'GET') {
      req.query = { ...req.query, companyId: String(req.company.id) };
    }
    // Escrituras: aseguramos empresa/usuario
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      if (!req.body) req.body = {};
      if (!req.body.companyId) req.body.companyId = String(req.company.id);
      if (!req.body.userId && req.user?.id) req.body.userId = String(req.user.id);
    }
  }
  next();
}

// --- INVENTORY (protegido + company defaults) ---
app.use('/api/v1/inventory', authCompany, withCompanyDefaults, inventoryRouter);

// --- Manejo unificado de errores ---
app.use((err, req, res, _next) => {
  const isJsonParse = err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err);
  const status = isJsonParse ? 400 : (err.status || 500);
  const msg = isJsonParse ? 'JSON inválido o cuerpo no soportado' : (err.message || 'Internal error');
  if (!res.headersSent) res.status(status).json({ error: msg });
});

// --- DB ---
const { MONGODB_URI } = process.env;
if (!MONGODB_URI) {
  console.error('Falta MONGODB_URI en el entorno');
  process.exit(1);
}
mongoose
  .connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || 'taller' })
  .then(() => console.log('MongoDB conectado'))
  .catch(err => {
    console.error('Error MongoDB:', err.message);
    process.exit(1);
  });

// --- Listen ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API escuchando en :${PORT}`);
});
