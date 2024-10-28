import { Router, Request, Response } from 'express';
import { bignumber } from 'mathjs';

import { DEFAULT_CACHE_TTL, DEFAULT_USD_DECIMAL_PLACES } from 'config/constants';
import { poolsRepository } from 'database/repository/pools-repository';
import { maybeCacheResponse } from 'utils/cache';
import { toResponse } from 'utils/http-response';
import { prettyNumber } from 'utils/numbers';
import { asyncRoute } from 'utils/route-wrapper';

const router = Router();

router.get(
  '/',
  asyncRoute(async (req: Request, res: Response) =>
    maybeCacheResponse(
      res,
      `/v2/${req.network.chainId}/tickers`,
      async () => {
        const pools = await poolsRepository.listForChainAsTickers(req.network.chainId);

        return pools.map((pool) => {
          const baseUsd = bignumber(pool.baseLiquidity).mul(pool.base?.usdDailyPrices?.[0]?.value ?? 0);
          const quoteUsd = bignumber(pool.quoteLiquidity).mul(pool.quote?.usdDailyPrices?.[0]?.value ?? 0);

          return {
            ticker_id: `${pool.base.address}_${pool.quote.address}`,
            base_currency: pool.base.address,
            target_currency: pool.quote.address,
            last_price: pool.price,
            base_volume: pool.dailyBaseVolume,
            target_volume: pool.dailyQuoteVolume,
            pool_id: pool.identifier,
            liquidity_in_usd: prettyNumber(bignumber(baseUsd).add(quoteUsd), DEFAULT_USD_DECIMAL_PLACES),
          };
        });
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data))),
  ),
);

export default router;
