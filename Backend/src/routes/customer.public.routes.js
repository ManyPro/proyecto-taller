import { Router } from 'express';
import {
  listCompanies,
  authenticateCustomer,
  getVehicleServices,
  getVehicleServiceSchedule,
  updateVehicleServiceSchedule
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

// Actualizar planilla de servicios por kilometraje
router.put('/:companyId/schedule', updateVehicleServiceSchedule);

export default router;

