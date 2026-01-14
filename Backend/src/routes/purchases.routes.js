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
  getPurchase
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
router.get('/purchases/:id', getPurchase);

export default router;
