import { Router } from 'express';
import {
  getMaintenanceTemplates,
  getMaintenanceTemplate,
  generateOilChangeSticker
} from '../controllers/maintenance.controller.js';

const router = Router();

// Obtener plantillas de mantenimiento
router.get('/templates', getMaintenanceTemplates);
router.get('/templates/:serviceId', getMaintenanceTemplate);

// Generar sticker de cambio de aceite
router.post('/generate-oil-change-sticker', generateOilChangeSticker);

export default router;

