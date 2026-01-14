import { Router } from 'express';
import {
  getInvestorInvestments,
  listInvestorsSummary,
  payInvestment
} from '../controllers/investments.controller.js';

const router = Router();

router.get('/investors', listInvestorsSummary);
router.get('/investors/:investorId', getInvestorInvestments);
router.post('/investors/:investorId/pay', payInvestment);

export default router;
