import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({
      hello: 'world',
    });
  } catch (e) {
    return next(e);
  }
});

export default router;
