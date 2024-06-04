import { asc, eq } from 'drizzle-orm';
import { Router, Request, Response } from 'express';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { tokens } from 'database/schema';
import { networks } from 'loader/networks';
import { validateChainId } from 'middleware/network-middleware';
import { maybeCacheResponse } from 'utils/cache';
import { toPaginatedResponse, toResponse } from 'utils/http-response';
import { createApiQuery, OrderBy, queryWithPagination, validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';

const router = Router();

router.get(
  '/chains',
  asyncRoute(async (req: Request, res: Response) =>
    maybeCacheResponse(
      res,
      'chains',
      async () =>
        networks.networks.map((network) => {
          const chain = networks.getNetwork(network);
          return {
            name: network,
            chainId: chain.chainId,
            features: chain.features,
          };
        }),
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data))),
  ),
);

const tokenQuery = db
  .select({
    symbol: tokens.symbol,
    name: tokens.name,
    decimals: tokens.decimals,
    chainId: tokens.chainId,
    address: tokens.address,
  })
  .from(tokens)
  .$dynamic();

router.get(
  '/tokens',
  asyncRoute(async (req: Request, res: Response) => {
    const chainId = validateChainId(req, true);
    const p = validatePaginatedRequest(req);
    return maybeCacheResponse(
      res,
      `tokens/${chainId}/${p.limit}/${p.cursor}`,
      async () => {
        const api = createApiQuery('address', OrderBy.asc, (key) => tokens[key], p);
        const items = await api
          .applyPagination(!chainId ? tokenQuery : tokenQuery.where(eq(tokens.chainId, chainId)))
          .execute();
        return api.getMetadata(items);
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toPaginatedResponse(data)));
  }),
);

export default router;
