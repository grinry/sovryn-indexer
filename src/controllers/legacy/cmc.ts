import { Router } from 'express';

import { LONG_CACHE_TTL } from 'config/constants';
import { NetworkFeature } from 'loader/networks/types';
import { prepareTvlEndpoint } from 'loader/tvl/prepare-tvl-endpoint-data';
import { networkAwareMiddleware } from 'middleware/network-middleware';
import { maybeCacheResponse } from 'utils/cache';
import { toResponse } from 'utils/http-response';
import { asyncRoute } from 'utils/route-wrapper';

import { prepareSummary } from './cmc.utils';

const router = Router();

router.get(
  '/summary',
  asyncRoute(async (req, res) =>
    maybeCacheResponse(res, 'legacy/cmc/summary', async () => prepareSummary(), LONG_CACHE_TTL).then((data) =>
      res.json(toResponse(data)),
    ),
  ),
);

router.get(
  '/tvl',
  networkAwareMiddleware([NetworkFeature.legacy, NetworkFeature.sdex]),
  asyncRoute(async (req, res) =>
    maybeCacheResponse(res, 'legacy/cmc/tvl___', async () => prepareTvlEndpoint(req.network), 1).then((data) =>
      res.json(toResponse(data)),
    ),
  ),
);

export default router;
