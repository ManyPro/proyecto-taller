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

router.get('/items', listPublishedItems);
router.get('/items/:id', getPublishedItem);
router.get('/customer', lookupCustomerByIdNumber);
router.post('/checkout', checkoutCatalog);
router.get('/sitemap.txt', sitemapPlain);
router.get('/sitemap.xml', sitemapXml);
router.get('/feed.csv', feedCsv);

export default router;
