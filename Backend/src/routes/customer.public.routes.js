import { Router } from 'express';
import {
  listCompanies,
  authenticateCustomer,
  getVehicleServices,
  getVehicleServiceSchedule
} from '../controllers/customer.public.controller.js';

const router = Router();

// Listar talleres disponibles (público, sin companyId)
router.get('/companies', listCompanies);

// Autenticación de cliente
router.post('/:companyId/auth', authenticateCustomer);

// Obtener servicios realizados
router.get('/:companyId/services', getVehicleServices);

// Obtener planilla de servicios por kilometraje
router.get('/:companyId/schedule', getVehicleServiceSchedule);

export default router;

