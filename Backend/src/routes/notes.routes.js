import { Router } from 'express';
import { listNotes, createNote, updateNote, deleteNote } from '../controllers/notes.controller.js';

const router = Router();

// El server monta este router con authCompany + withCompanyDefaults
router.get('/', listNotes);
router.post('/', createNote);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);

export default router;
