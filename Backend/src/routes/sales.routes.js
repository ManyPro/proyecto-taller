import { Router } from 'express';
import {
  startSale, getSale,
  addItem, updateItem, removeItem,
  setCustomerVehicle, closeSale,
  addByQR
} from '../controllers/sales.controller.js';

const r = Router();

// Crear / abrir venta
r.post('/start', startSale);
// Obtener venta
r.get('/:id', getSale);

// Ítems
r.post('/:id/items', addItem);
r.put('/:id/items/:itemId', updateItem);
r.delete('/:id/items/:itemId', removeItem);

// Cliente y vehículo
r.put('/:id/customer', setCustomerVehicle);

// Cerrar venta
r.post('/:id/close', closeSale);

// Agregar por QR (SKU)
r.post('/addByQR', addByQR);

export default r;
