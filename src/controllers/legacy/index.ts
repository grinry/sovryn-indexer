import { Router } from 'express';

import { NetworkFeature } from 'loader/networks/types';
import { networkAwareMiddleware } from 'middleware/network-middleware';

import ammRouter from './amm';
import cmcRouter from './cmc';

const router = Router();

router.use('/amm', networkAwareMiddleware([NetworkFeature.legacy]), ammRouter);
router.use('/cmc', cmcRouter);

export default router;
