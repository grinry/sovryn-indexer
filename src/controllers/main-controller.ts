import dayjs from 'dayjs';
import { eq, and, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Router, Request, Response } from 'express';
import Joi from 'joi';
import _ from 'lodash';
import { bignumber, re } from 'mathjs';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { lower } from 'database/helpers';
import { tAmmPools, tokens } from 'database/schema';
import { chains } from 'database/schema/chains';
import { networks } from 'loader/networks';
import { NetworkFeature } from 'loader/networks/types';
import { getLastPrices } from 'loader/price';
import { networkAwareMiddleware, validateChainId } from 'middleware/network-middleware';
import { maybeCacheResponse } from 'utils/cache';
import { BadRequestError, NotFoundError } from 'utils/custom-error';
import { ceilDate } from 'utils/date';
import { toPaginatedResponse, toResponse } from 'utils/http-response';
import { createApiQuery, OrderBy, validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';
import { validate } from 'utils/validation';
import { buildCandlesticksOnWorker } from 'workers/chart-worker';

import { Timeframe, TIMEFRAMES } from './main-controller.constants';
import { prepareSdexVolume } from './sdex/volume.utils';

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
  networkAwareMiddleware([NetworkFeature.legacy, NetworkFeature.sdex]),
  asyncRoute(async (req, res) => {
    const chainId = validateChainId(req, true);

    if (req.network.hasFeature(NetworkFeature.sdex)) {
      return maybeCacheResponse(
        res,
        `${chainId}`,
        async () => {
          if (req.network.hasFeature(NetworkFeature.sdex)) {
            const poolsResponse = await req.network.sdex.queryPools(1000);
            const volumeResponse = await prepareSdexVolume(req.network.chainId);

            const volumeMap = new Map();
            volumeResponse.forEach(({ token, volume }) => {
              volumeMap.set(token.toLowerCase(), volume);
            });

            const tickers = poolsResponse.pools.map((pool) => {
              const baseToken = pool.base.toLowerCase();
              const quoteToken = pool.quote.toLowerCase();
              const baseVolume = bignumber(volumeMap.get(baseToken) || '0');
              const quoteVolume = bignumber(volumeMap.get(quoteToken) || '0');

              const lastPrice = baseVolume.isZero() ? '0' : quoteVolume.div(baseVolume).toFixed(18);
              const liquidityInUsd =
                baseVolume.isZero() || lastPrice === '0' ? '0' : baseVolume.times(bignumber(lastPrice)).toFixed(18);

              return {
                ticker_id: `${pool.base}_${pool.quote}`,
                base_currency: pool.base,
                target_currency: pool.quote,
                last_price: lastPrice,
                base_volume: baseVolume.toString(),
                target_volume: quoteVolume.toString(),
                pool_id: pool.poolIdx.toString(),
                liquidity_in_usd: liquidityInUsd,
              };
            });

            return tickers;
          } else {
            return [];
          }
        },
        DEFAULT_CACHE_TTL,
      ).then((data) => res.json(toResponse(data)));
    } else if (req.network.hasFeature(NetworkFeature.legacy)) {
      return maybeCacheResponse(
        res,
        `${chainId}`,
        async () => {
          if (req.network?.hasFeature(NetworkFeature.legacy)) {
            const ammPools = await db
              .select({
                poolId: tAmmPools.pool,
                baseTokenId: tAmmPools.token1Id,
                quoteTokenId: tAmmPools.token2Id,
                baseVolume: tAmmPools.token1Volume,
                quoteVolume: tAmmPools.token2Volume,
                liquidityInUsd: tAmmPools.token1Volume,
              })
              .from(tAmmPools)
              .where(chainId ? eq(tAmmPools.chainId, chainId) : undefined)
              .execute();

            if (!ammPools.length) {
              throw new BadRequestError('No pools found for the given chain.');
            }

            const tickers = await Promise.all(
              ammPools.map(async (pool) => {
                const baseToken = await db
                  .select({
                    symbol: tokens.symbol,
                    address: tokens.address,
                  })
                  .from(tokens)
                  .where(eq(tokens.id, pool.baseTokenId))
                  .limit(1)
                  .execute();

                const quoteToken = await db
                  .select({
                    symbol: tokens.symbol,
                    address: tokens.address,
                  })
                  .from(tokens)
                  .where(eq(tokens.id, pool.quoteTokenId))
                  .limit(1)
                  .execute();

                return {
                  ticker_id: `${baseToken[0].symbol}_${quoteToken[0].symbol}`,
                  base_currency: baseToken[0].address,
                  target_currency: quoteToken[0].address,
                  last_price: bignumber(pool.quoteVolume).div(pool.baseVolume).toString(),
                  base_volume: pool.baseVolume,
                  target_volume: pool.quoteVolume,
                  pool_id: pool.poolId,
                  liquidity_in_usd: pool.liquidityInUsd,
                };
              }),
            );

            return tickers;
          } else {
            return [];
          }
        },
        DEFAULT_CACHE_TTL,
      ).then((data) => res.json(toResponse(data)));
    } else {
      return res.json({ tickers: [] });
    }
  }),
);

router.get('/not-blocked', (req, res) => {
  return res.json({ success: true });
});

router.get('/err', (req, res) => {
  throw new BadRequestError('This is a test error');
});

export default router;
