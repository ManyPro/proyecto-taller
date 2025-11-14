import { Router } from 'express';
import { listEvents, createEvent, updateEvent, deleteEvent, syncNoteReminders } from '../controllers/calendar.controller.js';

const router = Router();

router.get('/', listEvents);
router.post('/', createEvent);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);
router.post('/sync-note-reminders', syncNoteReminders);

export default router;

