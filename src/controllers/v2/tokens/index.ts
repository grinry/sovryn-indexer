import { and, eq, isNotNull, asc, or, ilike } from 'drizzle-orm';
import { Router, Request, Response } from 'express';

import { DEFAULT_CACHE_TTL, DEFAULT_DECIMAL_PLACES } from 'config/constants';
import { db } from 'database/client';
import { lower } from 'database/helpers';
import { tokenRepository } from 'database/repository/token-repository';
import { tokens } from 'database/schema/tokens';
import { getLastPrices } from 'loader/price';
import { maybeCacheResponse } from 'utils/cache';
import { NotFoundError } from 'utils/custom-error';
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
    const search = req.query.search ? String(req.query.search) : '';
    const showSpam = Boolean(req.query.spam);

    return maybeCacheResponse(
      res,
      `/v2/${chainId}/tokens/${p.cursor}/${p.limit}/${btoa(search)}/${showSpam}`,
      async () => {
        const tokenQuery = db
          .select({
            id: tokens.id,
            symbol: tokens.symbol,
            name: tokens.name,
            decimals: tokens.decimals,
            address: tokens.address,
            logoUrl: tokens.logoUrl,
            swapableSince: tokens.swapableSince,
            ignored: tokens.ignored,
          })
          .from(tokens)
          .where(
            and(
              eq(tokens.chainId, chainId),
              Boolean(req.query.spam) ? undefined : eq(tokens.ignored, false),
              isNotNull(tokens.swapableSince),
              search.length > 0
                ? or(
                    eq(lower(tokens.address), search.toLowerCase()),
                    ilike(tokens.symbol, `%${search}%`),
                    ilike(tokens.name, `%${search}%`),
                  )
                : undefined,
            ),
          )
          .$dynamic();

        const api = createApiQuery('address', OrderBy.asc, (key) => tokens[key], p);
        const items = await api.applyPagination(tokenQuery).execute();

        // Fetch the latest prices for tokens
        const lastPrices = await getLastPrices();

        return api.getMetadata(
          items.map((item) => {
            const lastUsdPrice = lastPrices.find((price) => price.tokenId === item.id);
            return {
              address: item.address,
              symbol: item.symbol,
              name: item.name,
              decimals: item.decimals,
              logoUrl: item.logoUrl,
              usdPrice: lastUsdPrice ? prettyNumber(lastUsdPrice?.value ?? 0, DEFAULT_DECIMAL_PLACES) : null,
              isTradeable: item.swapableSince !== null,
              isSpam: item.ignored,
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
  '/all',
  asyncRoute(async (req: Request, res: Response) => {
    const chainId = req.network.chainId;
    const search = req.query.search ? String(req.query.search) : '';
    const showSpam = Boolean(req.query.spam);
    return maybeCacheResponse(
      res,
      `/v2/${req.network.chainId}/tokens/all/${btoa(search)}/${showSpam}`,
      async () => {
        const items = await db
          .select({
            id: tokens.id,
            symbol: tokens.symbol,
            name: tokens.name,
            decimals: tokens.decimals,
            address: tokens.address,
            logoUrl: tokens.logoUrl,
            swapableSince: tokens.swapableSince,
            ignored: tokens.ignored,
          })
          .from(tokens)
          .where(
            and(
              eq(tokens.chainId, chainId),
              showSpam ? undefined : eq(tokens.ignored, false),
              search.length > 0
                ? or(
                    eq(lower(tokens.address), search.toLowerCase()),
                    ilike(tokens.symbol, `%${search}%`),
                    ilike(tokens.name, `%${search}%`),
                  )
                : undefined,
            ),
          )
          .orderBy(asc(tokens.address))
          .execute();

        const lastPrices = await getLastPrices();

        return items.map((item) => {
          const lastUsdPrice = lastPrices.find((price) => price.tokenId === item.id);

          return {
            address: item.address,
            symbol: item.symbol,
            name: item.name,
            decimals: item.decimals,
            logoUrl: item.logoUrl,
            usdPrice: lastUsdPrice ? prettyNumber(lastUsdPrice?.value ?? 0, DEFAULT_DECIMAL_PLACES) : null,
            isTradeable: item.swapableSince !== null,
            isSpam: item.ignored,
          };
        });
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

router.get(
  '/:address',
  asyncRoute(async (req: Request, res: Response) => {
    const address = req.params.address;
    const chainId = req.network.chainId;

    return maybeCacheResponse(
      res,
      `/v2/${chainId}/tokens/${address}`,
      async () => {
        const item = await tokenRepository.getByAddress(chainId, address);
        if (!item) {
          throw new NotFoundError(`Token with address ${address} not found`);
        }
        return {
          address: item.address,
          symbol: item.symbol,
          name: item.name,
          decimals: item.decimals,
          logoUrl: item.logoUrl,
          usdPrice: prettyNumber(item.usdDailyPrices?.[0]?.value ?? 0, DEFAULT_DECIMAL_PLACES),
          isTradeable: item.swapableSince !== null,
          isSpam: item.ignored,
        };
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

export default router;
