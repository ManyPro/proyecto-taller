import { Router } from 'express';
import multer from 'multer';

import {
  listPrices,
  getPrice,
  createPrice,
  updatePrice,
  deletePrice,
  importPrices,
  exportPrices,
  downloadImportTemplate,
  deleteAllPrices
} from '../controllers/prices.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const r = Router();

// CRUD básico
r.get('/', listPrices);
r.get('/:id', getPrice);
r.post('/', createPrice);
r.put('/:id', updatePrice);
r.delete('/:id', deletePrice);

// NUEVO: borrado masivo por servicio (rápido y eficiente)
r.delete('/', deleteAllPrices);

// Importar/Exportar Excel
r.get('/import/template', downloadImportTemplate);
r.post('/import', upload.single('file'), importPrices);
r.get('/export', exportPrices);

export default r;
