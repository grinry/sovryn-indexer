import { Router } from 'express';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { maybeCacheResponse } from 'utils/cache';
import { asyncRoute } from 'utils/route-wrapper';
import { validatePaginated } from 'utils/validation';

const router = Router();

router.get(
  '/pool_list',
  asyncRoute(async (req, res) => {
    const { cursor, limit } = validatePaginated(req.query);
    return maybeCacheResponse(
      res,
      `sdex/pool_list/${req.network.chainId}/${limit}/${cursor}`,
      async () =>
        req.network.sdex.queryPools(limit).then((data) =>
          data.pools.map((item) => ({
            chainId: req.network.chainIdHex,
            base: item.base,
            quote: item.quote,
            poolIdx: Number(item.poolIdx),
          })),
        ),
      DEFAULT_CACHE_TTL,
    );
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
