import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import { rebuildProfiles, listProfileHistory } from '../controllers/profiles.controller.js';

const router = Router();
router.use(authCompany);

// Rebuild: mode=append|replace, overwrite=true|false, limit=N
router.post('/rebuild', rebuildProfiles);
router.get('/history', listProfileHistory);

export default router;
