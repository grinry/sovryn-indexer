import { Router, Request, Response } from 'express';

import { asyncRoute } from 'utils/route-wrapper';

import poolsController from './pools';
import tokensController from './tokens';

const router = Router();

router.get(
  '/',
  asyncRoute(async (req: Request, res: Response) =>
    res.json({
      name: req.network.name,
      chainId: req.network.chainId,
    }),
  ),
);

router.use('/tokens', tokensController);
router.use('/pools', poolsController);

export default router;
