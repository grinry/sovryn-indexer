import { eq, and, sql, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Router, Request, Response } from 'express';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { prices, tokens } from 'database/schema';
import { chains } from 'database/schema/chains';
import { networks } from 'loader/networks';
import { validateChainId } from 'middleware/network-middleware';
import { maybeCacheResponse } from 'utils/cache';
import { toPaginatedResponse, toResponse } from 'utils/http-response';
import { createApiQuery, OrderBy, validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';
import _ from 'lodash';
import { constructCandlesticks, getPrices } from 'loader/chart/utils';
import dayjs from 'dayjs';
import { validate } from 'utils/validation';
import Joi from 'joi';

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

router.get(
  '/tokens',
  asyncRoute(async (req: Request, res: Response) => {
    const chainId = validateChainId(req, true);
    const p = validatePaginatedRequest(req);
    return maybeCacheResponse(
      res,
      `tokens/${chainId ?? 0}/${p.limit}/${p.cursor}`,
      async () => {
        const quoteToken = alias(tokens, 'quote_token');
        const chain = alias(chains, 'chain');

        const sb = db
          .selectDistinctOn([prices.baseId, prices.quoteId], {
            baseId: prices.baseId,
            quoteId: prices.quoteId,
            value: prices.value,
            // tickAt: prices.tickAt,
          })
          .from(prices)
          .orderBy(desc(prices.baseId), desc(prices.quoteId), desc(prices.tickAt))
          .as('sb');

        const tokenQuery = db
          .select({
            symbol: tokens.symbol,
            name: tokens.name,
            decimals: tokens.decimals,
            chainId: tokens.chainId,
            address: tokens.address,
            usdPrice: sql`${sb.value}`.as('last_usd_price'),
            ignored: tokens.ignored,
            // usdPriceTime: sb.tickAt,
          })
          .from(tokens)
          .where(eq(tokens.ignored, false))
          .innerJoin(chain, eq(tokens.chainId, chain.id))
          .innerJoin(quoteToken, and(eq(quoteToken.chainId, chain.id), eq(quoteToken.address, chain.stablecoinAddress)))
          .innerJoin(sb, and(eq(sb.baseId, tokens.id), eq(sb.quoteId, quoteToken.id)))
          .$dynamic();

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

router.get(
  '/chart',
  asyncRoute(async (req: Request, res: Response) => {
    const {
      chainId,
      base: baseTokenAddress,
      quote: quoteTokenAddress,
      start: startTimestamp,
      end: endTimestamp,
      timeframe,
    } = validate<{ chainId: number; base: string; quote: string; start: number; end: number; timeframe: number }>(
      Joi.object({
        chainId: Joi.number().required(),
        base: Joi.string().required(),
        quote: Joi.string().required(),
        start: Joi.number().required(),
        end: Joi.number().required(),
        timeframe: Joi.number().required(),
      }),
      req.query,
    );

    return maybeCacheResponse(
      res,
      `chart/${chainId}/${baseTokenAddress}/${quoteTokenAddress}/${startTimestamp}/${endTimestamp}/${timeframe}`,
      async () => {
        const startDate = dayjs.unix(startTimestamp).toDate();
        const endDate = dayjs.unix(endTimestamp).toDate();

        const intervals = await getPrices(chainId, baseTokenAddress, quoteTokenAddress, startDate, endDate);
        const candlesticks = await constructCandlesticks(intervals, timeframe);

        return candlesticks;
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

export default router;
