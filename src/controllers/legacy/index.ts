import { Router } from 'express';

import ammRouter from './amm';

const router = Router();

router.use('/amm', ammRouter);

export default router;
