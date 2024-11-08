import { eq, and, inArray } from 'drizzle-orm';
import { Router } from 'express';
import Joi from 'joi';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { lower } from 'database/helpers';
import { tokens } from 'database/schema';
import { swapsTableV2 } from 'database/schema/swaps_v2';
import { maybeCacheResponse } from 'utils/cache';
import { toPaginatedResponse } from 'utils/http-response';
import { createApiQuery, OrderBy, validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';
import { validate } from 'utils/validation';
import { logger } from 'utils/logger';

const router = Router();

const swapHistoryQuerySchema = Joi.object({
  user: Joi.string().required(),
});

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { user } = validate(swapHistoryQuerySchema, req.query, { allowUnknown: true });
    const p = validatePaginatedRequest(req);
    const cacheKey = `/v2/${req.network.chainId}/swaps/${user}/${p.limit}/${p.cursor}`;

    return maybeCacheResponse(
      res,
      cacheKey,
      async () => {
        const swapsQuery = db
          .select({
            id: swapsTableV2.id,
            chainId: swapsTableV2.chainId,
            transactionHash: swapsTableV2.transactionHash,
            baseAmount: swapsTableV2.baseAmount,
            quoteAmount: swapsTableV2.quoteAmount,
            fees: swapsTableV2.fees,
            price: swapsTableV2.price,
            callIndex: swapsTableV2.callIndex,
            baseId: swapsTableV2.baseId,
            quoteId: swapsTableV2.quoteId,
            user: swapsTableV2.user,
            block: swapsTableV2.block,
            tickAt: swapsTableV2.tickAt,
          })
          .from(swapsTableV2)
          .where(and(eq(swapsTableV2.chainId, req.network.chainId), eq(lower(swapsTableV2.user), user.toLowerCase())))
          .$dynamic();

        const api = createApiQuery('id', OrderBy.desc, (key) => swapsTableV2[key], p);
        const swaps = await api.applyPagination(swapsQuery).execute();

        if (swaps.length > 0) {
          const tokenIds = [...new Set(swaps.flatMap((swap) => [swap.baseId, swap.quoteId]))];
          const tokensData = await db.query.tokens.findMany({
            columns: {
              id: true,
              address: true,
              decimals: true,
              symbol: true,
              logoUrl: true,
            },
            where: inArray(tokens.id, tokenIds),
          });

          return api.getMetadata(
            swaps.map((swap) => ({
              id: swap.id,
              transactionHash: swap.transactionHash,
              user: swap.user,
              base: printTokenData(tokensData.find((item) => item.id === swap.baseId)),
              baseAmount: swap.baseAmount,
              quote: printTokenData(tokensData.find((item) => item.id === swap.quoteId)),
              quoteAmount: swap.quoteAmount,
              fees: swap.fees,
              price: swap.price,
              confirmedAt: swap.tickAt,
              block: swap.block,
              callIndex: swap.callIndex,
            })),
          );
        }

        return { data: [], next: null };
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toPaginatedResponse(data)));
  }),
);

function printTokenData(tokenData) {
  if (!tokenData) {
    return null;
  }
  return {
    address: tokenData.address,
    decimals: tokenData.decimals,
    symbol: tokenData.symbol,
    logoUrl: tokenData.logoUrl,
  };
}

export default router;
