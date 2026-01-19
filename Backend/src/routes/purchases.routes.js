import { Router } from 'express';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listInvestors,
  createInvestor,
  updateInvestor,
  deleteInvestor,
  listPurchases,
  createPurchase,
  getPurchase,
  updatePurchase,
  deletePurchaseItems
} from '../controllers/purchases.controller.js';

const router = Router();

// Suppliers
router.get('/suppliers', listSuppliers);
router.post('/suppliers', createSupplier);
router.put('/suppliers/:id', updateSupplier);
router.delete('/suppliers/:id', deleteSupplier);

// Investors
router.get('/investors', listInvestors);
router.post('/investors', createInvestor);
router.put('/investors/:id', updateInvestor);
router.delete('/investors/:id', deleteInvestor);

// Purchases
router.get('/purchases', listPurchases);
router.post('/purchases', createPurchase);
// Rutas más específicas primero (antes de /purchases/:id)
router.post('/purchases/:id/items/delete', deletePurchaseItems);
// Rutas generales después
router.get('/purchases/:id', getPurchase);
router.put('/purchases/:id', updatePurchase);

export default router;
