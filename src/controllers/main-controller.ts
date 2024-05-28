import { Router, Request, Response, NextFunction } from 'express';

import { networkConfig } from 'loader/network-config';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const network = networkConfig.getNetwork('gobob');
    console.log(network);

    res.status(200).json({
      hello: 'world',
    });
  } catch (e) {
    return next(e);
  }
});

export default router;
