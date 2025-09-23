import { Router } from 'express';
import {
  startSale, getSale, addItem, updateItem, removeItem,
  setCustomerVehicle, closeSale, addByQR, listSales, summarySales
} from '../controllers/sales.controller.js';

const router = Router();

// CRUD básico de la venta en curso
router.post('/start', startSale);
router.get('/:id', getSale);
router.post('/:id/items', addItem);
router.put('/:id/items/:itemId', updateItem);
router.delete('/:id/items/:itemId', removeItem);
router.put('/:id/customer-vehicle', setCustomerVehicle);
router.post('/:id/close', closeSale);

// QR
router.post('/addByQR', addByQR);

// Listado / Resumen (Caja)
router.get('/', listSales);
router.get('/summary', summarySales);

export default router;
