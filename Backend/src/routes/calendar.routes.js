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
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);
router.post('/sync-note-reminders', syncNoteReminders);
router.get('/search-by-plate/:plate', searchByPlate);
router.get('/quotes-by-plate/:plate', getQuotesByPlate);
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

export default router;

