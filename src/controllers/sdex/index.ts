import { Router } from 'express';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { maybeCacheResponse } from 'utils/cache';
import { toResponse } from 'utils/http-response';
import { validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';

const router = Router();

router.get(
  '/pool_list',
  asyncRoute(async (req, res) => {
    const { cursor, limit } = validatePaginatedRequest(req);
    return maybeCacheResponse(
      res,
      `sdex/pool_list/${req.network.chainId}/${limit}/${cursor}`,
      async () =>
        req.network.sdex.queryPools(limit).then((data) =>
          data.pools.map((item) => ({
            chainId: req.network.chainId,
            base: item.base,
            quote: item.quote,
            poolIdx: Number(item.poolIdx),
          })),
        ),
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

router.get('/user_pool_positions', async (req, res) => {
  res.status(200).json({
    data: {
      user_pool_positions: [],
    },
  });
});

export default router;
