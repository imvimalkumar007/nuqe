import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ message: 'cases route is live' });
});

export default router;
