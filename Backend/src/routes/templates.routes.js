import { Router } from 'express';
import { listTemplates, getTemplate, createTemplate, updateTemplate, previewTemplate, activeTemplate } from '../controllers/templates.controller.js';

const router = Router();

router.get('/', listTemplates);
router.get('/active/:type', activeTemplate);
router.get('/:id', getTemplate);
router.post('/', createTemplate);
router.post('/preview', previewTemplate);
router.patch('/:id', updateTemplate);

export default router;