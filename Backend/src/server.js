import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import healthRouter from './routes/health.js';
import mediaRouter from './routes/media.routes.js';
import notesRouter from './routes/notes.routes.js';

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
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('tiny'));

// --- /uploads estático si driver local ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// --- Rutas ---
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/media', mediaRouter);
app.use('/api/v1/notes', notesRouter);

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
