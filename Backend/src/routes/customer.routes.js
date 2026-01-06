import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import {
  searchCustomerByPlate,
  getCustomerTier,
  updateCustomerTier,
  getCustomerSchedule,
  listCustomers
} from '../controllers/customer.controller.js';

const router = Router();

// Todas las rutas requieren autenticación de empresa
router.use(authCompany);

// IMPORTANTE: Rutas específicas deben ir ANTES de rutas con parámetros dinámicos
// Buscar cliente por placa
router.get('/search', searchCustomerByPlate);

// Listar clientes
router.get('/list', listCustomers);

// Obtener tier de un cliente
router.get('/:plate/tier', getCustomerTier);

// Actualizar tier de un cliente
router.put('/:plate/tier', updateCustomerTier);

// Obtener planilla de servicios (uso corporativo)
router.get('/:plate/schedule', getCustomerSchedule);

export default router;

