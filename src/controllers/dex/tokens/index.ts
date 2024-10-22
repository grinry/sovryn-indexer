import { and, eq, sql, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Router, Request, Response } from 'express';
import { bignumber } from 'mathjs';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { chains } from 'database/schema/chains';
import { tokens } from 'database/schema/tokens';
import { getLastPrices } from 'loader/price';
import { validateChainId } from 'middleware/network-middleware';
import { maybeCacheResponse } from 'utils/cache';
import { toPaginatedResponse, toResponse } from 'utils/http-response';
import { prettyNumber } from 'utils/numbers';
import { createApiQuery, OrderBy, validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';

const router = Router();

// Endpoint to fetch tradeable tokens with price
router.get(
  '/',
  asyncRoute(async (req: Request, res: Response) => {
    const p = validatePaginatedRequest(req);
    const chainId = req.network.chainId;

    return maybeCacheResponse(
      res,
      `/dex/${chainId}/tokens`,
      async () => {
        const quoteToken = alias(tokens, 'quote_token');
        const chain = alias(chains, 'chain');
        const tokenQuery = db
          .select({
            id: tokens.id,
            symbol: tokens.symbol,
            name: tokens.name,
            decimals: tokens.decimals,
            address: tokens.address,
            logoUrl: tokens.logoUrl,
            stablecoinId: sql<number>`${quoteToken.id}`.as('stablecoinId'),
          })
          .from(tokens)
          .where(
            and(
              eq(tokens.chainId, chainId),
              Boolean(req.query.spam) ? undefined : eq(tokens.ignored, false),
              isNotNull(tokens.swapableSince),
            ),
          )
          .innerJoin(chain, eq(tokens.chainId, chain.id))
          .innerJoin(quoteToken, and(eq(quoteToken.chainId, chain.id), eq(quoteToken.address, chain.stablecoinAddress)))
          .$dynamic();

        const api = createApiQuery('address', OrderBy.asc, (key) => tokens[key], p);
        const items = await api.applyPagination(tokenQuery).execute();

        // Fetch the latest prices for tokens
        const lastPrices = await getLastPrices();

        return api.getMetadata(
          items.map((item) => {
            const lastUsdPrice = lastPrices.find((price) => price.tokenId === item.id);
            const price = bignumber(lastUsdPrice?.value ?? 0);
            return {
              ...item,
              usdPrice: prettyNumber(price),
              usdPriceDate: lastUsdPrice?.updatedAt ?? lastUsdPrice?.tickAt ?? null,
              id: undefined,
              stablecoinId: undefined,
            };
          }),
        );
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toPaginatedResponse(data)));
  }),
);

// Endpoint to fetch all available tokens (including non-tradeable)
router.get(
  '/available',
  asyncRoute(async (req: Request, res: Response) => {
    return maybeCacheResponse(
      res,
      `/dex/${req.network.chainId}/tokens/available`,
      async () => {
        const chainId = req.network.chainId;

        const tokensData = await db
          .select({
            symbol: tokens.symbol,
            name: tokens.name,
            decimals: tokens.decimals,
            address: tokens.address,
            logoUrl: tokens.logoUrl,
          })
          .from(tokens)
          .where(eq(tokens.chainId, chainId))
          .execute();

        return tokensData;
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

export default router;
