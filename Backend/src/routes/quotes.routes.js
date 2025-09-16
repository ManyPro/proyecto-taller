    // Backend/src/routes/quotes.routes.js
import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import {
  createQuote, listQuotes, getQuote, updateQuote, deleteQuote
} from '../controllers/quotes.controller.js';

const router = Router();

// Todas las rutas protegidas; el server inyecta companyId/userId (ver withCompanyDefaults)
router.use(authCompany);

router.post('/', createQuote);
router.get('/', listQuotes);
router.get('/:id', getQuote);
router.patch('/:id', updateQuote);
router.delete('/:id', deleteQuote);

export default router;
