import dayjs from 'dayjs';
import { eq, and, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Router, Request, Response } from 'express';
import Joi from 'joi';
import _ from 'lodash';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { lower } from 'database/helpers';
import { tokens } from 'database/schema';
import { chains } from 'database/schema/chains';
import { networks } from 'loader/networks';
import { getLastPrices } from 'loader/price';
import { prepareTickers } from 'loader/tickers-loader';
import { validateChainId } from 'middleware/network-middleware';
import { maybeCacheResponse } from 'utils/cache';
import { BadRequestError, NotFoundError } from 'utils/custom-error';
import { ceilDate } from 'utils/date';
import { toPaginatedResponse, toResponse } from 'utils/http-response';
import { createApiQuery, OrderBy, validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';
import { validate } from 'utils/validation';
import { buildCandlesticksOnWorker } from 'workers/chart-worker';

import { Timeframe, TIMEFRAMES } from './main-controller.constants';

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
      `tokens/${chainId ?? 0}/${p.limit}/${p.cursor}/${Boolean(req.query.spam) ? 'spam' : 'no-spam'}`,
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
          .where(
            and(
              chainId ? eq(tokens.chainId, chainId) : undefined,
              Boolean(req.query.spam) ? undefined : eq(tokens.ignored, false),
            ),
          )
          .innerJoin(chain, eq(tokens.chainId, chain.id))
          .innerJoin(quoteToken, and(eq(quoteToken.chainId, chain.id), eq(quoteToken.address, chain.stablecoinAddress)))
          .$dynamic();

        const api = createApiQuery('address', OrderBy.asc, (key) => tokens[key], p);
        const items = await api.applyPagination(tokenQuery).execute();

        const lastPrices = await getLastPrices();

        return api.getMetadata(
          items.map((item) => {
            const lastUsdPrice = lastPrices.find(
              (price) => price.baseId === item.id && price.quoteId === item.stablecoinId,
            );
            return {
              ...item,
              usdPrice: lastUsdPrice?.value ?? '0',
              usdPriceDate: lastUsdPrice?.tickAt ?? null,
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

        const lastPrices = await getLastPrices();

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
    const chainId = validateChainId(req);
    const {
      base: baseTokenAddress,
      quote: quoteTokenAddress,
      start: startTimestamp,
      end: endTimestamp,
      timeframe,
    } = validate<{ base: string; quote: string; start: number; end: number; timeframe: Timeframe }>(
      Joi.object({
        chainId: Joi.required(),
        base: Joi.string().required(),
        quote: Joi.string().required(),
        start: Joi.number()
          .optional()
          .default((parent) =>
            dayjs
              .unix(parent.end ?? dayjs().unix())
              .subtract(Math.min(TIMEFRAMES[parent.timeframe ?? '1m'] * 30, 43200), 'minutes')
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

    return await maybeCacheResponse(
      res,
      `chart/${chainId}/${baseTokenAddress}/${quoteTokenAddress}/${start.getTime()}/${end.getTime()}/${timeframe}`,
      async () => {
        const candlesticks = await buildCandlesticksOnWorker(
          chainId,
          baseTokenAddress,
          quoteTokenAddress,
          start,
          end,
          timeframe,
        );
        return candlesticks;
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

router.get(
  '/tickers',
  asyncRoute(async (req, res) => {
    const chainId = validateChainId(req, true);
    return maybeCacheResponse(res, `tickers/${chainId}`, async () => prepareTickers(networks.listChains()), 1).then(
      (data) => res.json(data),
    );
  }),
);

router.get('/not-blocked', (req, res) => {
  return res.json({ success: true });
});

router.get('/err', (req, res) => {
  throw new BadRequestError('This is a test error');
});

export default router;
