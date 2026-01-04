import { Router } from 'express';
import {
  authenticateCustomer,
  getVehicleServices,
  getVehicleServiceSchedule
} from '../controllers/customer.public.controller.js';

const router = Router();

// Autenticación de cliente
router.post('/:companyId/auth', authenticateCustomer);

// Obtener servicios realizados
router.get('/:companyId/services', getVehicleServices);

// Obtener planilla de servicios por kilometraje
router.get('/:companyId/schedule', getVehicleServiceSchedule);

export default router;

