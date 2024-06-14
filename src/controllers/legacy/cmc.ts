import { Router } from 'express';
import Joi from 'joi';

import { LONG_CACHE_TTL, MEDIUM_CACHE_TTL } from 'config/constants';
import { apyDayRepository } from 'database/repository/apy-day-repository';
import { maybeCacheResponse } from 'utils/cache';
import { toResponse } from 'utils/http-response';
import { asyncRoute } from 'utils/route-wrapper';
import { validate } from 'utils/validation';

import { getOnChainData, parseApyHistoryData } from './amm.utils';

const router = Router();

router.get(
  '/summary',
  asyncRoute(async (req, res) => {
    return res.json(toResponse('summary'));
  }),
);

export default router;
