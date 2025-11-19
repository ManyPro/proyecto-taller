import { Router } from 'express';
import {
  startSale, getSale, addItem, updateItem, removeItem,
  setCustomerVehicle, closeSale, addByQR, listSales, summarySales, cancelSale, getProfileByPlate, getProfileByIdNumber, addItemsBatch, updateTechnician, technicianReport, completeOpenSlot, getSalesByPlate, updateCloseSale, deleteSalesBulk
} from '../controllers/sales.controller.js';
import { sseHandler } from '../lib/live.js';

const router = Router();

// Server-Sent Events stream for sales (company scoped via auth at mount level)
router.get('/stream', sseHandler);

// List and summaries first to avoid shadowing
router.get('/summary', summarySales);
router.get('/technicians/report', technicianReport);
router.get('/by-plate/:plate', getSalesByPlate); // Historial completo por placa
router.get('/profile/by-plate/:plate', getProfileByPlate);
router.get('/lookup/plate/:plate', getProfileByPlate); // alias para consistencia con quotes
router.get('/profile/by-id/:id', getProfileByIdNumber);
router.get('/lookup/id/:id', getProfileByIdNumber); // alias similar
router.get('/', listSales);

// Create
router.post('/start', startSale);

// Item operations
router.post('/:id/items', addItem);
router.post('/:id/items/batch', addItemsBatch);
router.put('/:id/items/:itemId', updateItem);
router.delete('/:id/items/:itemId', removeItem);

// Customer & vehicle on sale
router.put('/:id/customer-vehicle', setCustomerVehicle);
// Technician
router.patch('/:id/technician', updateTechnician);

// Lifecycle
router.post('/:id/close', closeSale);
router.post('/:id/cancel', cancelSale);
router.patch('/:id/close', updateCloseSale); // Actualizar cierre de venta cerrada

// Open slots
router.post('/:id/complete-slot', completeOpenSlot);

// Misc
router.post('/addByQR', addByQR);

// Bulk operations (administrativo)
router.post('/bulk/delete', deleteSalesBulk);

// Read single sale (keep last so it doesn't eat other routes)
router.get('/:id', getSale);

export default router;
