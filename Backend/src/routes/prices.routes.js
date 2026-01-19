import { Router } from 'express';
import multer from 'multer';

import {
  listPrices,
  getPrice,
  createPrice,
  updatePrice,
  deletePrice,
  importPrices,
  importGeneralPrices,
  exportPrices,
  downloadImportTemplate,
  downloadGeneralImportTemplate,
  deleteAllPrices,
  getLastPriceForVehicle
} from '../controllers/prices.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const r = Router();

// CRUD básico
r.get('/', listPrices);
r.get('/:priceId/last-for-vehicle/:vehicleId', getLastPriceForVehicle);
r.get('/:id', getPrice);
r.post('/', createPrice);
r.put('/:id', updatePrice);
r.delete('/:id', deletePrice);

// NUEVO: borrado masivo por servicio (rápido y eficiente)
r.delete('/', deleteAllPrices);

// Importar/Exportar Excel
r.get('/import/template', downloadImportTemplate);
r.get('/import/template-general', downloadGeneralImportTemplate);
r.post('/import', upload.single('file'), importPrices);
r.post('/import/general', upload.single('file'), importGeneralPrices);
r.get('/export', exportPrices);

export default r;
