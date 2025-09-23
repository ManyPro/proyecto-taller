import { Router } from 'express';
import {
  startSale, getSale, addItem, updateItem, removeItem,
  setCustomerVehicle, closeSale, addByQR, listSales, summarySales
} from '../controllers/sales.controller.js';

const router = Router();

// ⚠️ Importante: las rutas “no-ID” primero (para que /summary no lo capture :id)
router.get('/summary', summarySales);
router.get('/', listSales);

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

export default router;
