import fs from 'fs';
import path from 'path';

import { Router } from 'express';
import gql from 'graphql-tag';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { LiquidityChangesResponse } from 'types/liquidity';
import { aggregatePositions } from 'utils/aggregationUtils';
import { maybeCacheResponse } from 'utils/cache';
import { toResponse } from 'utils/http-response';
import { validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';
const router = Router();

const queryPath = path.join(__dirname, '../../artifacts/graphQueries/sdex/liqchanges.graphql');
const LIQUIDITY_CHANGES_QUERY = gql(fs.readFileSync(queryPath, 'utf8'));

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
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const variables = {
      user: userId,
    };

    try {
      const response = await req.network.sdex.queryFromSubgraph<LiquidityChangesResponse>(
        LIQUIDITY_CHANGES_QUERY,
        variables,
      );
      const userPoolPositions = response.liquidityChanges;
      const aggregatedPositions = aggregatePositions(userPoolPositions);

      return maybeCacheResponse(
        res,
        `sdex/user_pool_positions/${req.network.chainId}/${userId}`,
        async () => aggregatedPositions,
        DEFAULT_CACHE_TTL,
      ).then((data) => res.json(toResponse(data)));
    } catch (error) {
      console.error('Error querying user pool positions:', error);
      return res.status(500).json({ error: 'Failed to fetch user pool positions' });
    }
  }),
);

export default router;
