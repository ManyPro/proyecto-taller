import { Router } from 'express';
import { listAccounts, createAccount, updateAccount, getBalances, listEntries, createEntry, updateEntry, deleteEntry } from '../controllers/cashflow.controller.js';

const router = Router();

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

export default router;
