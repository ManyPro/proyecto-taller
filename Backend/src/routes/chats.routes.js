// Backend/src/routes/chats.routes.js
import { Router } from 'express';
import { authCompany } from '../middlewares/auth.js';
import {
  createChat,
  listChats,
  getChat,
  updateChat,
  deleteChat,
  addInventoryItem,
  addComment
} from '../controllers/chats.controller.js';

const router = Router();

// Todas las rutas protegidas
router.use(authCompany);

router.post('/', createChat);
router.get('/', listChats);
router.get('/:id', getChat);
router.patch('/:id', updateChat);
router.delete('/:id', deleteChat);
router.post('/:id/inventory', addInventoryItem);
router.post('/:id/comments', addComment);

export default router;

