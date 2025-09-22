import { Router } from 'express';
import {
  startSale, getSale, addItem, updateItem, removeItem,
  setCustomerVehicle, closeSale, addByQR,
  listSales, summarySales
} from '../controllers/sales.controller.js';

const r = Router();

// Caja / listados
r.get('/', listSales);
r.get('/summary', summarySales);

// Flujo principal
r.post('/start', startSale);
r.get('/:id', getSale);
r.post('/:id/items', addItem);
r.put('/:id/items/:itemId', updateItem);
r.delete('/:id/items/:itemId', removeItem);
r.put('/:id/customer', setCustomerVehicle);
r.post('/:id/close', closeSale);

// QR -> agrega ítem por código (IT:...)
r.post('/addByQR', addByQR);

export default r;
