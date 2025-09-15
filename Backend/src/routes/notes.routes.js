import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import { listNotes, createNote, updateNote, deleteNote } from '../controllers/notes.controller.js';

const router = Router();

// ✅ multi-tenant: del token → req.companyId / req.userId
router.use(authCompany, (req, _res, next) => {
  req.companyId = req.company?.id;
  req.userId = req.user?.id;
  next();
});

// Rutas
router.get('/', listNotes);
router.post('/', createNote);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);

export default router;
