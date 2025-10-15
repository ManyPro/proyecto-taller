import express from 'express';
import * as skusController from '../controllers/skus.controller.js';
import { authCompany } from '../middlewares/auth.js';

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(authCompany);

// Rutas principales
router.get('/stats', skusController.getStats);
router.get('/by-category', skusController.getSKUsByCategory);
router.get('/suggestion/:prefix', skusController.getSKUSuggestion);
router.get('/code/:code', skusController.getByCode);
router.get('/:id', skusController.getSKU);
router.get('/', skusController.listSKUs);

router.post('/', skusController.createSKU);
router.post('/backfill/items', skusController.backfillFromItems);

router.patch('/:id', skusController.updateSKU);
router.patch('/:id/notes', skusController.updateNotes);
router.patch('/:id/print', skusController.markAsPrinted);
router.patch('/:id/apply', skusController.markAsApplied);

router.delete('/:id', skusController.deleteSKU);

export default router;