// Backend/src/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

// Conexión a Mongo (tu db.js ya hace el connect y loguea "MongoDB conectado")
import './db.js';

// Rutas
import authRoutes from './routes/auth.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import notesRoutes from './routes/notes.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import filesRoutes from './routes/files.routes.js';

// Soporte para servir ficheros locales si el driver es "local"
import { driver, uploadsRoot } from './lib/upload.js';

const app = express();

/* -------------------- Middlewares base -------------------- */
const allowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowed.length === 0 || allowed.includes(origin)) return cb(null, true);
      return cb(new Error('CORS: origin not allowed'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '20mb' })); // JSON del front
app.use(morgan('dev'));

/* -------------------- Rutas API v1 -------------------- */
// src/server.js (fragmento)
app.use("/api/v1/auth", authRoutes);   // <-- SIN middleware
app.use("/api/v1", inventoryRoutes);   // protegidas por middleware dentro del router
app.use("/api/v1", notesRoutes);
app.use("/api/v1/files", filesRoutes);
app.use('/api/v1', ordersRoutes);

/* -------------------- Archivos estáticos locales -------------------- */
// Solo sirve /uploads si el driver de archivos es "local" (no Cloudinary).
if (driver === 'local') {
  app.use('/uploads', express.static(uploadsRoot));
}

/* -------------------- Healthcheck -------------------- */
app.head('/', (_, res) => res.status(200).send('ok'));
app.get('/', (_, res) => res.send('ok'));

/* -------------------- Arranque -------------------- */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API en http://localhost:${PORT}`);
});

export default app;
