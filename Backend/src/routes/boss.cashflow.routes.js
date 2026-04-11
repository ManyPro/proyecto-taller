import { Router } from 'express';
import Company from '../models/Company.js';
import { authBossReadonly } from '../middlewares/auth.js';
import { getBalances, listEntries } from '../controllers/cashflow.controller.js';

const router = Router();

router.use(authBossReadonly);
router.use(async (req, res, next) => {
  const company = await Company.findById(req.company?.id).lean();
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
  if (company?.bossPortal?.enabled !== true) {
    return res.status(403).json({ error: 'Portal del jefe deshabilitado' });
  }
  const enabled = company?.features?.cashflow !== false;
  if (!enabled) return res.status(403).json({ error: 'Funcionalidad deshabilitada: cashflow' });
  req.companyId = String(req.company.id);
  next();
});

router.get('/accounts/balances', getBalances);
router.get('/entries', listEntries);

export default router;
