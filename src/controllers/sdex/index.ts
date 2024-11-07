import { eq, and, inArray } from 'drizzle-orm';
import { Router } from 'express';
import Joi from 'joi';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { tokens } from 'database/schema';
import { swapsTableV2 } from 'database/schema/swaps_v2';
import { maybeCacheResponse } from 'utils/cache';
import { toPaginatedResponse, toResponse } from 'utils/http-response';
import { createApiQuery, OrderBy, validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';
import { validate } from 'utils/validation';

import { prepareSdexVolume } from './volume.utils';

const router = Router();

const querySchema = Joi.object({
  user: Joi.string().required(),
  chainId: Joi.string().required(),
  base: Joi.string().required(),
  quote: Joi.string().required(),
  poolIdx: Joi.number().required(),
});

const swapHistoryQuerySchema = Joi.object({
  user: Joi.string().required(),
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
  '/volume',
  asyncRoute(async (req, res) => {
    return maybeCacheResponse(
      res,
      `sdex/volume/${req.network.chainId}`,
      async () => prepareSdexVolume(req.network.chainId),
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

router.get(
  '/user_pool_positions',
  asyncRoute(async (req, res) => {
    const { user, chainId, base, quote, poolIdx } = validate(querySchema, req.query);

    return maybeCacheResponse(
      res,
      `sdex/user_pool_positions/${chainId}/${user}/${base}/${quote}/${poolIdx}`,
      async () => {
        const liquidity = await req.network.sdex.getUpdatedLiquidity(user, base, quote, poolIdx);
        return {
          liquidity,
        };
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data.liquidity)));
  }),
);

router.get(
  '/swaps',
  asyncRoute(async (req, res) => {
    const { user, chainId } = validate(swapHistoryQuerySchema, req.query);
    const p = validatePaginatedRequest(req);
    const cacheKey = `sdex/swaps/${chainId}/${user}/${p.limit}/${p.cursor}`;

    return maybeCacheResponse(
      res,
      cacheKey,
      async () => {
        const swapsQuery = db
          .select({
            chainId: swapsTableV2.chainId,
            transactionHash: swapsTableV2.transactionHash,
            baseAmount: swapsTableV2.baseAmount,
            quoteAmount: swapsTableV2.quoteAmount,
            fees: swapsTableV2.fees,
            callIndex: swapsTableV2.callIndex,
            baseId: swapsTableV2.baseId,
            quoteId: swapsTableV2.quoteId,
            user: swapsTableV2.user,
            block: swapsTableV2.block,
            tickAt: swapsTableV2.tickAt,
          })
          .from(swapsTableV2)
          .where(
            and(
              chainId ? eq(swapsTableV2.chainId, chainId) : undefined,
              user ? eq(swapsTableV2.user, user) : undefined,
            ),
          )
          .limit(p.limit)
          .$dynamic();

        const api = createApiQuery('id', OrderBy.desc, (key) => swapsTableV2[key], p);
        const swaps = await api.applyPagination(swapsQuery).execute();

        if (swaps.length > 0) {
          const tokenIds = [...new Set(swaps.flatMap((swap) => [swap.baseId, swap.quoteId]))];
          const tokensData = await db.query.tokens.findMany({
            columns: {
              id: true,
              chainId: true,
              address: true,
              decimals: true,
              symbol: true,
            },
            where: and(eq(tokens.chainId, chainId), inArray(tokens.id, tokenIds)),
          });

          return api.getMetadata(
            swaps.map((swap) => ({
              transactionHash: swap.transactionHash,
              baseAmount: swap.baseAmount,
              quoteAmount: swap.quoteAmount,
              fees: swap.fees,
              callIndex: swap.callIndex,
              base: tokensData.find((item) => item.id === swap.baseId),
              quote: tokensData.find((item) => item.id === swap.quoteId),
              user: swap.user,
              block: swap.block,
              tickAt: swap.tickAt,
            })),
          );
        }

        return { data: [], next: null };
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toPaginatedResponse(data)));
  }),
);

export default router;
