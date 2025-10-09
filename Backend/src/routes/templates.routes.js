import { Router } from 'express';
import { listTemplates, getTemplate, createTemplate, updateTemplate, previewTemplate, activeTemplate, deleteTemplate, duplicateTemplate } from '../controllers/templates.controller.js';

const router = Router();

router.get('/', listTemplates);
router.get('/active/:type', activeTemplate);
router.get('/:id', getTemplate);
router.post('/', createTemplate);
router.post('/preview', previewTemplate);
router.post('/:id/duplicate', duplicateTemplate);
router.patch('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

export default router;