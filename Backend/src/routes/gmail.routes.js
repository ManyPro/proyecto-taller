import { Router } from 'express';
import { getGmailStatus, startGmailConnect, disconnectGmail } from '../controllers/gmail.controller.js';

const router = Router();

router.get('/status', getGmailStatus);
router.post('/connect', startGmailConnect);
router.post('/disconnect', disconnectGmail);

export default router;
