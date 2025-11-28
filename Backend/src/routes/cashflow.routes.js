import { Router } from 'express';
import Company from '../models/Company.js';
import { authCompany } from '../middlewares/auth.js';
import { listAccounts, createAccount, updateAccount, getBalances, listEntries, createEntry, updateEntry, deleteEntry, fixBalances } from '../controllers/cashflow.controller.js';
import { createLoan, listLoans, getPendingLoans, updateLoan, deleteLoan, settleLoan } from '../controllers/employeeLoan.controller.js';

const router = Router();

// Auth + cargar empresa para validar feature
router.use(authCompany);
router.use(async (req, res, next) => {
	const c = await Company.findById(req.company?.id).lean();
	if (!c) return res.status(404).json({ error: 'Empresa no encontrada' });
	const enabled = c?.features?.cashflow !== false; // default true si no existe
	if (!enabled) return res.status(403).json({ error: 'Funcionalidad deshabilitada: cashflow' });
	req.companyId = String(c._id);
	next();
});

// Accounts
router.get('/accounts', listAccounts);
router.post('/accounts', createAccount);
router.patch('/accounts/:id', updateAccount);
router.get('/accounts/balances', getBalances);

// Entries
router.get('/entries', listEntries);
router.post('/entries', createEntry);
router.patch('/entries/:id', updateEntry);
router.delete('/entries/:id', deleteEntry);
router.post('/entries/fix-balances', fixBalances);

// Employee Loans (Préstamos a empleados)
router.get('/loans', listLoans);
router.post('/loans', createLoan);
router.get('/loans/pending', getPendingLoans);
router.patch('/loans/:id', updateLoan);
router.post('/loans/:id/settle', settleLoan);
router.delete('/loans/:id', deleteLoan);

export default router;

