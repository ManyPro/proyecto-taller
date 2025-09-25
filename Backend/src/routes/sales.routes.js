import { Router } from 'express';
import {
  startSale, getSale, addItem, updateItem, removeItem,
  setCustomerVehicle, closeSale, addByQR, listSales, summarySales, cancelSale, getProfileByPlate
} from '../controllers/sales.controller.js';
const router = Router();
router.post('/start', startSale);
router.get('/', listSales);
router.get('/summary', summarySales);
router.get('/:id', getSale);
router.post('/:id/items', addItem);
router.put('/:id/items/:itemId', updateItem);
router.delete('/:id/items/:itemId', removeItem);
router.put('/:id/customer-vehicle', setCustomerVehicle);
router.post('/:id/close', closeSale);
router.post('/:id/cancel', cancelSale);
router.post('/addByQR', addByQR);
router.get('/profile/by-plate/:plate', getProfileByPlate);
export default router;
