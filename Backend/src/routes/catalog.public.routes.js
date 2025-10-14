import { Router } from 'express';
import {
  listPublishedItems,
  getPublishedItem,
  checkoutCatalog,
  lookupCustomerByIdNumber,
  sitemapPlain,
  sitemapXml,
  feedCsv
} from '../controllers/catalog.public.controller.js';

const router = Router();

// Todas las rutas ahora requieren :companyId
router.get('/:companyId/items', listPublishedItems);
router.get('/:companyId/items/:id', getPublishedItem);
router.get('/:companyId/customer', lookupCustomerByIdNumber);
router.post('/:companyId/checkout', checkoutCatalog);
router.get('/:companyId/sitemap.txt', sitemapPlain);
router.get('/:companyId/sitemap.xml', sitemapXml);
router.get('/:companyId/feed.csv', feedCsv);

export default router;
