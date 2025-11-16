import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import {
  // Empresas
  listCompanyAccounts,
  getCompanyAccount,
  createCompanyAccount,
  updateCompanyAccount,
  deleteCompanyAccount,
  // Cuentas por cobrar
  listReceivables,
  getReceivable,
  createReceivable,
  addPayment,
  cancelReceivable,
  getReceivablesStats,
  // Links Cliente-Empresa
  createClientCompanyLink,
  listClientCompanyLinks,
  getClientCompanyLinkByPlate,
  deleteClientCompanyLink
} from '../controllers/receivables.controller.js';

const router = Router();
router.use(authCompany);

// Empresas de cartera
router.get('/companies', listCompanyAccounts);
router.get('/companies/stats', getReceivablesStats);
router.get('/companies/:id', getCompanyAccount);
router.post('/companies', createCompanyAccount);
router.put('/companies/:id', updateCompanyAccount);
router.delete('/companies/:id', deleteCompanyAccount);

// Links Cliente-Empresa
router.get('/links', listClientCompanyLinks);
router.get('/links/plate/:plate', getClientCompanyLinkByPlate);
router.post('/links', createClientCompanyLink);
router.delete('/links/:id', deleteClientCompanyLink);

// Cuentas por cobrar
router.get('/stats', getReceivablesStats);
router.get('/', listReceivables);
router.get('/:id', getReceivable);
router.post('/', createReceivable);
router.post('/:id/payment', addPayment);
router.post('/:id/cancel', cancelReceivable);

export default router;

