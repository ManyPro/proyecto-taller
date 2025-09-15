import { Router } from 'express';
const router = Router();

router.get('/', (req, res) => {
  res.json({
    ok: true,
    now: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;