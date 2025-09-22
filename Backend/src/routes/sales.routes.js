import { Router } from 'express';
import {
  startSale, getSale,
  addItem, updateItem, removeItem,
  setCustomerVehicle, closeSale, addByQR
} from '../controllers/sales.controller.js';

const r = Router();

r.post('/start', startSale);
r.get('/:id', getSale);

r.post('/:id/items', addItem);
r.put('/:id/items/:itemId', updateItem);
r.delete('/:id/items/:itemId', removeItem);

r.put('/:id/customer', setCustomerVehicle);
r.post('/:id/close', closeSale);

r.post('/addByQR', addByQR);

export default r;
