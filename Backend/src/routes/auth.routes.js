import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import {
  registerCompany,
  loginCompany,
  meCompany,
  forgotPasswordLocal,
  resetPasswordLocal
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', registerCompany);
router.post('/login', loginCompany);
router.get('/me', authCompany, meCompany);

router.post('/password/forgot', forgotPasswordLocal);
router.post('/password/reset-local', resetPasswordLocal);

export default router;
