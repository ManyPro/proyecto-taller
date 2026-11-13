import { Router } from 'express';
import {
  getMeta,
  listCases,
  getCase,
  createCase,
  addTurn,
  pauseCase,
  reopenCase,
  recordRepair,
  recordVerification,
  closeCase,
  listDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  getUsage,
  requireDiagnosisFeature
} from '../controllers/diagnosis.controller.js';

const router = Router();
router.use(requireDiagnosisFeature);

router.get('/meta', getMeta);
router.get('/usage', getUsage);
router.get('/cases', listCases);
router.post('/cases', createCase);
router.get('/cases/:id', getCase);
router.post('/cases/:id/turns', addTurn);
router.post('/cases/:id/pause', pauseCase);
router.post('/cases/:id/reopen', reopenCase);
router.post('/cases/:id/repair', recordRepair);
router.post('/cases/:id/verify', recordVerification);
router.post('/cases/:id/close', closeCase);

router.get('/documents', listDocuments);
router.post('/documents', createDocument);
router.patch('/documents/:id', updateDocument);
router.delete('/documents/:id', deleteDocument);

export default router;
