import { eq } from 'drizzle-orm';
import { Router } from 'express';
import Joi from 'joi';
import { bignumber } from 'mathjs';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { tAmmPools, tokens } from 'database/schema';
import { networks } from 'loader/networks';
import { NetworkFeature } from 'loader/networks/types';
import { validateChainId } from 'middleware/network-middleware';
import { maybeCacheResponse } from 'utils/cache';
import { BadRequestError } from 'utils/custom-error';
import { toResponse } from 'utils/http-response';
import { validatePaginatedRequest } from 'utils/pagination';
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
  '/tickers',
  asyncRoute(async (req, res) => {
    const chainId = validateChainId(req, true);

    const items = networks.listChains();

    for (const item of items) {
      if (item.hasFeature(NetworkFeature.legacy)) {
        return maybeCacheResponse(
          res,
          `tickers/${chainId}`,
          async () => {
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
          },
          DEFAULT_CACHE_TTL,
        ).then((data) => res.json(toResponse(data)));
      } else if (item.hasFeature(NetworkFeature.sdex)) {
        return maybeCacheResponse(
          res,
          `sdex/tickers/${chainId}`,
          async () => {
            if (req.network.hasFeature(NetworkFeature.sdex)) {
              const poolsResponse = await req.network.sdex.queryPools(1000);
              const volumeResponse = await prepareSdexVolume(req.network.chainId);

              const volumeMap = new Map();
              volumeResponse.forEach(({ token, volume }) => {
                volumeMap.set(token.toLowerCase(), volume);
              });

              // Process tickers for BOB
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
      } else {
        return res.json({ tickers: [] });
      }
    }
  }),
);

export default router;
