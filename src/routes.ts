import { Router, Request, Response } from 'express';

import mainController from 'controllers/main-controller';

const router = Router();

router.use(mainController);

router.get('*', (req: Request, res: Response) => {
  return res.status(404).json({ error: '404 - Resource not found' });
});

export default router;
