import { Router } from 'express';
import { listPrices, createPrice, updatePrice, deletePrice } from '../controllers/prices.controller.js';

const r = Router();
r.get('/', listPrices);
r.post('/', createPrice);
r.put('/:id', updatePrice);
r.delete('/:id', deletePrice);
export default r;
