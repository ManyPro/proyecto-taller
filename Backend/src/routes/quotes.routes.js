    // Backend/src/routes/quotes.routes.js
import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import {
  createQuote, listQuotes, getQuote, updateQuote, deleteQuote, lookupQuotePlate, lookupQuoteId
} from '../controllers/quotes.controller.js';

const router = Router();

// Todas las rutas protegidas; el server inyecta companyId/userId (ver withCompanyDefaults)
router.use(authCompany);

router.post('/', createQuote);
router.get('/', listQuotes);
router.get('/lookup/plate/:plate', lookupQuotePlate); // debe ir antes de /:id
router.get('/lookup/id/:id', lookupQuoteId); // búsqueda por identificación
router.get('/:id', getQuote);
router.patch('/:id', updateQuote);
router.delete('/:id', deleteQuote);

export default router;
