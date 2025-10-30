import { Router } from 'express';
import {
  listConcepts,
  upsertConcept,
  deleteConcept,
  listAssignments,
  upsertAssignment,
  removeAssignment,
  createPeriod,
  listOpenPeriods,
  previewSettlement,
  approveSettlement,
  paySettlement,
  listSettlements,
  generateSettlementPdf,
  printSettlementHtml
} from '../controllers/payroll.controller.js';

const router = Router();

function requireCompanyManager(req, res, next){
  const role = req.user?.role || '';
  if (!['owner','admin'].includes(role)) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// Concepts per company
router.get('/concepts', listConcepts);
router.post('/concepts', requireCompanyManager, upsertConcept);
router.patch('/concepts/:id', requireCompanyManager, upsertConcept);
router.delete('/concepts/:id', requireCompanyManager, deleteConcept);

// Assignments per technician
router.get('/assignments', listAssignments);
router.post('/assignments', requireCompanyManager, upsertAssignment);
router.delete('/assignments', requireCompanyManager, removeAssignment);

// Periods
router.get('/periods/open', listOpenPeriods);
router.post('/periods', requireCompanyManager, createPeriod);

// Settlements
router.post('/settlements/preview', previewSettlement);
router.post('/settlements/approve', requireCompanyManager, approveSettlement);
router.post('/settlements/pay', requireCompanyManager, paySettlement);
router.get('/settlements', listSettlements);
router.get('/settlements/:id/pdf', generateSettlementPdf);
router.get('/settlements/:id/print', printSettlementHtml);

export default router;


