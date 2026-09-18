import { Router } from 'express';
import Company from '../models/Company.js';
import { authBossReadonly } from '../middlewares/auth.js';
import { getSale, listSales } from '../controllers/sales.controller.js';
import { resolveEffectiveCompanyAccess } from '../lib/sharedDatabase.js';

const router = Router();

router.use(authBossReadonly);
router.use(async (req, res, next) => {
  const company = await Company.findById(req.company?.id).lean();
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
  if (company?.bossPortal?.enabled !== true) {
    return res.status(403).json({ error: 'Portal del jefe deshabilitado' });
  }
  const enabled = company?.features?.ventas !== false;
  if (!enabled) return res.status(403).json({ error: 'Funcionalidad deshabilitada: ventas' });
  const scope = await resolveEffectiveCompanyAccess(req.company.id);
  req.originalCompanyId = scope.originalCompanyId;
  req.companyId = scope.effectiveCompanyId;
  req.hasSharedDatabase = scope.hasSharedDatabase;
  next();
});

router.get('/', listSales);
router.get('/:id', getSale);

export default router;
