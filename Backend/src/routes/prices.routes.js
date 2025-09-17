import { Router } from 'express';
import { listPrices, createPrice, updatePrice, deletePrice, importPrices, exportCsv } from '../controllers/prices.controller.js';
import multer from 'multer'; // NUEVO

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const r = Router();
r.get('/', listPrices);
r.post('/', createPrice);
r.put('/:id', updatePrice);
r.delete('/:id', deletePrice);

// NUEVO: importar XLSX (campo "file"), y exportar CSV
r.post('/import', upload.single('file'), importPrices);
r.get('/export', exportCsv);

export default r;
