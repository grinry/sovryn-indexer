import { Router, Request, Response } from 'express';

import { toResponse } from 'utils/http-response';
import { asyncRoute } from 'utils/route-wrapper';

import poolsController from './pools';
import swapsController from './swaps';
import tickersController from './tickers';
import tokensController from './tokens';

const router = Router();

router.get(
  '/',
  asyncRoute(async (req: Request, res: Response) => res.json(toResponse(req.network))),
);

router.use('/tokens', tokensController);
router.use('/tickers', tickersController);
router.use('/pools', poolsController);
router.use('/swaps', swapsController);

export default router;
