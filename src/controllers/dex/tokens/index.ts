import { and, eq } from 'drizzle-orm';
import { isNotNull } from 'drizzle-orm';
import { Router, Request, Response } from 'express';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { tokens } from 'database/schema/tokens';
import { maybeCacheResponse } from 'utils/cache';
import { toResponse } from 'utils/http-response';
import { asyncRoute } from 'utils/route-wrapper';

const router = Router();

// indexer.sovryn.app/dex/30/tokens
router.get(
  '/',
  asyncRoute(async (req: Request, res: Response) =>
    maybeCacheResponse(
      res,
      `/dex/${req.network.chainId}/tokens`,
      async () => {
        const chainId = req.network.chainId;

        const tokensData = await db
          .select({
            symbol: tokens.symbol,
            name: tokens.name,
            decimals: tokens.decimals,
            chainId: tokens.chainId,
            address: tokens.address,
            logoUrl: tokens.logoUrl,
            usdPrice: tokens.usdPrice,
          })
          .from(tokens)
          .where(and(eq(tokens.chainId, chainId), isNotNull(tokens.tradeableSince)))
          .execute();

        return tokensData;
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data))),
  ),
);

// indexer.sovryn.app/dex/30/tokens/available
router.get(
  '/available',
  asyncRoute(async (req: Request, res: Response) =>
    maybeCacheResponse(
      res,
      `/dex/${req.network.chainId}/tokens/available`,
      async () => {
        const chainId = req.network.chainId;

        const tokensData = await db
          .select({
            symbol: tokens.symbol,
            name: tokens.name,
            decimals: tokens.decimals,
            chainId: tokens.chainId,
            address: tokens.address,
            logoUrl: tokens.logoUrl,
            usdPrice: tokens.usdPrice,
          })
          .from(tokens)
          .where(eq(tokens.chainId, chainId))
          .execute();

        return tokensData;
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data))),
  ),
);

export default router;
