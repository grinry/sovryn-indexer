import dayjs from 'dayjs';
import { eq, and, sql, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Router, Request, Response } from 'express';
import Joi from 'joi';
import _ from 'lodash';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { lower } from 'database/helpers';
import { prices, tokens } from 'database/schema';
import { chains } from 'database/schema/chains';
import { constructCandlesticks, getPrices } from 'loader/chart/utils';
import { networks } from 'loader/networks';
import { validateChainId } from 'middleware/network-middleware';
import { maybeCacheResponse } from 'utils/cache';
import { NotFoundError } from 'utils/custom-error';
import { ceilDate } from 'utils/date';
import { toPaginatedResponse, toResponse } from 'utils/http-response';
import { createApiQuery, OrderBy, validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';
import { validate } from 'utils/validation';

import { TIMEFRAMES } from './main-controller.constants';

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

        const tokenQuery = db
          .select({
            id: tokens.id,
            symbol: tokens.symbol,
            name: tokens.name,
            decimals: tokens.decimals,
            chainId: tokens.chainId,
            address: tokens.address,
            stablecoinId: sql<number>`${quoteToken.id}`.as('stablecoinId'),
          })
          .from(tokens)
          .where(and(eq(tokens.ignored, false), chainId ? eq(tokens.chainId, chainId) : undefined))
          .innerJoin(chain, eq(tokens.chainId, chain.id))
          .innerJoin(quoteToken, and(eq(quoteToken.chainId, chain.id), eq(quoteToken.address, chain.stablecoinAddress)))
          .$dynamic();

        const api = createApiQuery('address', OrderBy.asc, (key) => tokens[key], p);
        const items = await api.applyPagination(tokenQuery).execute();

        const pairs = items.map((item) => ({ base: item.id, quote: item.stablecoinId }));

        const lastPrices = await db
          .select({ baseId: prices.baseId, quoteId: prices.quoteId, value: prices.value, date: prices.tickAt })
          .from(prices)
          .where(
            and(
              eq(prices.tickAt, sql`(select max(${prices.tickAt}) from ${prices})`),
              or(...pairs.map((pair) => and(eq(prices.baseId, pair.base), eq(prices.quoteId, pair.quote)))),
            ),
          );

        return api.getMetadata(
          items.map((item) => {
            const lastUsdPrice =
              lastPrices.find((price) => price.baseId === item.id && price.quoteId === item.stablecoinId)?.value ?? '0';
            return {
              ...item,
              usdPrice: lastUsdPrice,
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

router.get(
  '/tokens/:tokenAddress',
  asyncRoute(async (req: Request, res: Response) => {
    const { tokenAddress } = validate<{ tokenAddress: string }>(
      Joi.object({
        tokenAddress: Joi.string().required(),
      }),
      req.params,
      { allowUnknown: true },
    );
    const chainId = validateChainId(req, true);
    return maybeCacheResponse(
      res,
      `tokens/${chainId ?? 0}/${tokenAddress}`,
      async () => {
        const quoteToken = alias(tokens, 'quote_token');
        const chain = alias(chains, 'chain');

        const items = await db
          .select({
            id: tokens.id,
            symbol: tokens.symbol,
            name: tokens.name,
            decimals: tokens.decimals,
            chainId: tokens.chainId,
            address: tokens.address,
            stablecoinId: sql<number>`${quoteToken.id}`.as('stablecoinId'),
          })
          .from(tokens)
          .where(
            and(
              eq(lower(tokens.address), tokenAddress.toLowerCase()),
              chainId ? eq(tokens.chainId, chainId) : undefined,
            ),
          )
          .innerJoin(chain, eq(tokens.chainId, chain.id))
          .innerJoin(quoteToken, and(eq(quoteToken.chainId, chain.id), eq(quoteToken.address, chain.stablecoinAddress)))
          .limit(1)
          .execute();

        const pairs = items.map((item) => ({ base: item.id, quote: item.stablecoinId }));

        const lastPrices = await db
          .select({ baseId: prices.baseId, quoteId: prices.quoteId, value: prices.value, date: prices.tickAt })
          .from(prices)
          .where(
            and(
              eq(prices.tickAt, sql`(select max(${prices.tickAt}) from ${prices})`),
              or(...pairs.map((pair) => and(eq(prices.baseId, pair.base), eq(prices.quoteId, pair.quote)))),
            ),
          );

        const item =
          items.map((item) => {
            const lastUsdPrice =
              lastPrices.find((price) => price.baseId === item.id && price.quoteId === item.stablecoinId)?.value ?? '0';
            return {
              ...item,
              usdPrice: lastUsdPrice,
              id: undefined,
              stablecoinId: undefined,
            };
          })?.[0] ?? null;

        if (!item) {
          throw new NotFoundError('Token not found');
        }

        return item;
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
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
    } = validate<{ chainId: number; base: string; quote: string; start: number; end: number; timeframe: string }>(
      Joi.object({
        chainId: Joi.number().required(),
        base: Joi.string().required(),
        quote: Joi.string().required(),
        start: Joi.number()
          .optional()
          .default((parent) =>
            dayjs
              .unix(parent.end ?? dayjs().unix())
              .subtract(Math.min(TIMEFRAMES[parent.timeframe ?? '1m'] * 30, 11520), 'minutes')
              .unix(),
          ),
        end: Joi.number()
          .optional()
          .default(() => dayjs().unix()),
        timeframe: Joi.string()
          .optional()
          .valid(...Object.keys(TIMEFRAMES))
          .default('1m'),
      }),
      req.query,
    );

    const timeframeMinutes = TIMEFRAMES[timeframe];
    const start = ceilDate(dayjs.unix(startTimestamp).toDate(), timeframeMinutes);
    const end = ceilDate(dayjs.unix(endTimestamp).toDate(), timeframeMinutes);

    return maybeCacheResponse(
      res,
      `chart/${chainId}/${baseTokenAddress}/${quoteTokenAddress}/${start.getTime()}/${end.getTime()}/${timeframe}`,
      async () => {
        const intervals = await getPrices(chainId, baseTokenAddress, quoteTokenAddress, start, end);
        const candlesticks = await constructCandlesticks(intervals, timeframeMinutes);

        return candlesticks;
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

export default router;
