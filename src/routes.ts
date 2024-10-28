import { Router, Request, Response } from 'express';

import legacyRouter from 'controllers/legacy';
import mainController from 'controllers/main-controller';
import sdexRouter from 'controllers/sdex';
import v2Router from 'controllers/v2';
import v2RouterBase from 'controllers/v2/v2base';
import { NetworkFeature } from 'loader/networks/types';
import { chainNameAwareMiddleware } from 'middleware/chain-name-middleware';
import { networkAwareMiddleware } from 'middleware/network-middleware';

const router = Router();

router.use(mainController);
router.use('/sdex', networkAwareMiddleware([NetworkFeature.sdex]), sdexRouter);
router.use('/legacy', legacyRouter);

router.use('/v2', v2RouterBase);
router.use('/v2/:chain', chainNameAwareMiddleware, v2Router);

router.get('*', (req: Request, res: Response) => {
  return res.status(404).json({ type: 'General', error: 'Resource not found' });
});

export default router;
