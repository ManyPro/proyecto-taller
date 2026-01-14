import { Router } from 'express';

import {
  listVehicleIntakes,
  createVehicleIntake,
  updateVehicleIntake,
  deleteVehicleIntake,
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  recalcIntakePrices,
  itemQrPng,
  addItemStock,
  addItemsStockBulk,
  getItemStockEntries,
  syncStockEntries,
  bulkPublishItems,
  downloadImportTemplate,
  importItemsFromExcel,
  exportInventoryToExcel,
  unpublishZeroStock
} from '../controllers/inventory.controller.js';

const router = Router();

// El server ya valida authCompany y carga defaults de empresa
router.get('/vehicle-intakes', listVehicleIntakes);
router.post('/vehicle-intakes', createVehicleIntake);
router.put('/vehicle-intakes/:id', updateVehicleIntake);
router.delete('/vehicle-intakes/:id', deleteVehicleIntake);
router.post('/vehicle-intakes/:id/recalc', recalcIntakePrices);

router.get('/items', listItems);
router.get('/items/:id', getItem);
router.post('/items', createItem);
router.put('/items/:id', updateItem);
router.delete('/items/:id', deleteItem);
router.post('/items/:id/stock-in', addItemStock);
router.post('/items/stock-in/bulk', addItemsStockBulk);
router.post('/items/publish/bulk', bulkPublishItems);
// Import/Export desde Excel
router.get('/items/import/template', downloadImportTemplate);
router.post('/items/import/excel', importItemsFromExcel);
router.get('/items/export/excel', exportInventoryToExcel);
// Mantenimiento
router.post('/items/maintenance/unpublish-zero-stock', unpublishZeroStock);
router.post('/items/maintenance/sync-stock-entries', syncStockEntries);

router.get('/items/:id/qr.png', itemQrPng);
router.get('/items/:id/stock-entries', getItemStockEntries);

export default router;
