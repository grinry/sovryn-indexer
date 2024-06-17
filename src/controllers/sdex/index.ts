import { Router } from 'express';
import Joi from 'joi';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { aggregatePositions } from 'utils/aggregationUtils';
import { maybeCacheResponse } from 'utils/cache';
import { BadRequestError, HttpError } from 'utils/custom-error';
import { toResponse } from 'utils/http-response';
import { validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';

const router = Router();

const querySchema = Joi.object({
  user: Joi.string().required(),
  chainId: Joi.string().required(),
});

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

router.get(
  '/user_pool_positions',
  asyncRoute(async (req, res) => {
    const { error, value } = querySchema.validate(req.query);

    if (error) {
      throw new BadRequestError(error.details[0].message);
    }

    const { user, chainId } = value;

    return maybeCacheResponse(
      res,
      `sdex/user_pool_positions/${chainId}/${user}`,
      async () => {
        const response = await req.network.sdex.queryUserPositions(user);

        const userPoolPositions = response.liquidityChanges;

        if (!userPoolPositions) {
          throw new HttpError(500, 'Failed to fetch user pool positions');
        }

        return aggregatePositions(userPoolPositions);
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

export default router;
