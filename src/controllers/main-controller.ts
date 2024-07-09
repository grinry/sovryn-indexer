import dayjs from 'dayjs';
import { eq, and, sql, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Router, Request, Response } from 'express';
import Joi from 'joi';
import _ from 'lodash';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { prices, tokens } from 'database/schema';
import { chains } from 'database/schema/chains';
import { constructCandlesticks, getPrices } from 'loader/chart/utils';
import { networks } from 'loader/networks';
import { validateChainId } from 'middleware/network-middleware';
import { maybeCacheResponse } from 'utils/cache';
import { ceilDate } from 'utils/date';
import { toPaginatedResponse, toResponse } from 'utils/http-response';
import { createApiQuery, OrderBy, validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';
import { validate } from 'utils/validation';

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
        start: Joi.number()
          .optional()
          .default((parent) =>
            dayjs
              .unix(parent.end ?? dayjs().unix())
              .subtract(Math.min((parent.timeframe ?? 1) * 30, 11520), 'minutes')
              .unix(),
          ),
        end: Joi.number()
          .optional()
          .default(() => dayjs().unix()),
        // todo: change it to 1m, 5m, 15m, 30m, 1h, 4h, 12h, 1d, 1w etc.
        timeframe: Joi.number().optional().valid(1, 5, 10, 15, 30, 60, 240, 720, 1440).default(1),
      }),
      req.query,
    );

    const start = ceilDate(dayjs.unix(startTimestamp).toDate(), timeframe);
    const end = ceilDate(dayjs.unix(endTimestamp).toDate(), timeframe);

    // todo: limit range to x days and y candles

    return maybeCacheResponse(
      res,
      `chart/${chainId}/${baseTokenAddress}/${quoteTokenAddress}/${start.getTime()}/${end.getTime()}/${timeframe}`,
      async () => {
        const intervals = await getPrices(chainId, baseTokenAddress, quoteTokenAddress, start, end);
        const candlesticks = await constructCandlesticks(intervals, timeframe);

        return candlesticks;
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

export default router;
