import { Router } from 'express';
import { 
  listEvents, 
  createEvent, 
  updateEvent, 
  deleteEvent, 
  syncNoteReminders,
  searchByPlate,
  getQuotesByPlate,
  getSettings,
  updateSettings
} from '../controllers/calendar.controller.js';

const router = Router();

router.get('/', listEvents);
router.post('/', createEvent);
router.post('/sync-note-reminders', syncNoteReminders);
router.get('/search-by-plate/:plate', searchByPlate);
router.get('/quotes-by-plate/:plate', getQuotesByPlate);
// Rutas de settings ANTES de las rutas con parámetros dinámicos
router.get('/settings', getSettings);
router.put('/settings', updateSettings);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

export default router;

