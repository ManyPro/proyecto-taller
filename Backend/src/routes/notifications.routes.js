import { Router } from 'express';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../controllers/notifications.controller.js';

const router = Router();

router.get('/', listNotifications);
router.patch('/:id/read', markNotificationRead);
router.post('/read-all', markAllNotificationsRead);

export default router;
