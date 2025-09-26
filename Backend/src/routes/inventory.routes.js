import { Router } from 'express';

import {
  listVehicleIntakes,
  createVehicleIntake,
  updateVehicleIntake,
  deleteVehicleIntake,
  listItems,
  createItem,
  updateItem,
  deleteItem,
  recalcIntakePrices,
  itemQrPng
} from '../controllers/inventory.controller.js';

const router = Router();

// El server ya valida authCompany y carga defaults de empresa
router.get('/vehicle-intakes', listVehicleIntakes);
router.post('/vehicle-intakes', createVehicleIntake);
router.put('/vehicle-intakes/:id', updateVehicleIntake);
router.delete('/vehicle-intakes/:id', deleteVehicleIntake);
router.post('/vehicle-intakes/:id/recalc', recalcIntakePrices);

router.get('/items', listItems);
router.post('/items', createItem);
router.put('/items/:id', updateItem);
router.delete('/items/:id', deleteItem);

router.get('/items/:id/qr.png', itemQrPng);

export default router;
