import { Router } from 'express';
import multer from 'multer';

import {
  listPrices,
  createPrice,
  updatePrice,
  deletePrice,
  importPrices,
  exportCsv,
  deleteAllPrices
} from '../controllers/prices.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const r = Router();

// CRUD básico
r.get('/', listPrices);
r.post('/', createPrice);
r.put('/:id', updatePrice);
r.delete('/:id', deletePrice);

// NUEVO: borrado masivo por servicio (rápido y eficiente)
r.delete('/', deleteAllPrices);

// Importar XLSX y exportar CSV
r.post('/import', upload.single('file'), importPrices);
r.get('/export', exportCsv);

export default r;
