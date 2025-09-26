import { Router } from 'express';
import {
  startSale, getSale, addItem, updateItem, removeItem,
  setCustomerVehicle, closeSale, addByQR, listSales, summarySales, cancelSale, getProfileByPlate
} from '../controllers/sales.controller.js';
import { sseHandler } from '../lib/live.js';

const router = Router();

// Server-Sent Events stream for sales (company scoped via auth at mount level)
router.get('/stream', sseHandler);

// List and summaries first to avoid shadowing
router.get('/summary', summarySales);
router.get('/profile/by-plate/:plate', getProfileByPlate);
router.get('/', listSales);

// Create
router.post('/start', startSale);

// Item operations
router.post('/:id/items', addItem);
router.put('/:id/items/:itemId', updateItem);
router.delete('/:id/items/:itemId', removeItem);

// Customer & vehicle on sale
router.put('/:id/customer-vehicle', setCustomerVehicle);

// Lifecycle
router.post('/:id/close', closeSale);
router.post('/:id/cancel', cancelSale);

// Misc
router.post('/addByQR', addByQR);

// Read single sale (keep last so it doesn't eat other routes)
router.get('/:id', getSale);

export default router;
