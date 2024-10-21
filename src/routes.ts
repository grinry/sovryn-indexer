import { Router, Request, Response } from 'express';

import dexRouter from 'controllers/dex';
import legacyRouter from 'controllers/legacy';
import mainController from 'controllers/main-controller';
import sdexRouter from 'controllers/sdex';
import { NetworkFeature } from 'loader/networks/types';
import { chainNameAwareMiddleware } from 'middleware/chain-name-middleware';
import { networkAwareMiddleware } from 'middleware/network-middleware';

const router = Router();

router.use(mainController);
router.use('/sdex', networkAwareMiddleware([NetworkFeature.sdex]), sdexRouter);
router.use('/legacy', legacyRouter);
router.use('/dex/:chain', chainNameAwareMiddleware, dexRouter);

router.get('*', (req: Request, res: Response) => {
  return res.status(404).json({ type: 'General', error: 'Resource not found' });
});

export default router;
