import dayjs from 'dayjs';
import { and, eq, gte, sql, sum } from 'drizzle-orm';
import _ from 'lodash';
import { bignumber } from 'mathjs';

import { MAX_DECIMAL_PLACES } from 'config/constants';
import { db } from 'database/client';
import { lower } from 'database/helpers';
import { PoolExtended, poolsRepository } from 'database/repository/pools-repository';
import { tokenRepository } from 'database/repository/token-repository';
import { NewPool, Pool, poolsTable, PoolType, swapsTable } from 'database/schema';
import { networks } from 'loader/networks';
import { SdexChain } from 'loader/networks/sdex-chain';
import { getPoolStats } from 'loader/tickers-loader';
import { areAddressesEqual } from 'utils/compare';
import { logger } from 'utils/logger';
import { prettyNumber } from 'utils/numbers';
import { toDisplayPrice } from 'utils/price';

// todo: think about pagination...
const POOL_LIMIT = 250;

const childLogger = logger.child({ module: 'crontab:dex:pools:ambient' });

export const retrieveAmbientPoolList = async (chain: SdexChain) => {
  const tokens = await tokenRepository.listForChain(chain.context.chainId);
  if (!tokens.length) {
    childLogger.info(`No tokens found for chain ${chain.context.chainId}. Skipping pool list retrieval`);
    return;
  }

  const query = await chain.queryPools(POOL_LIMIT);

  const pools = query.pools
    .map(
      (pool) =>
        ({
          chainId: chain.context.chainId,
          type: PoolType.ambient,
          identifier: `${pool.base}_${pool.quote}_${pool.poolIdx}`,
          baseId: tokens.find((token) => areAddressesEqual(token.address, pool.base))?.id,
          quoteId: tokens.find((token) => areAddressesEqual(token.address, pool.quote))?.id,
          extra: {
            poolIdx: pool.poolIdx,
            // lpToken: pool.lpToken, // todo
          },
        } satisfies NewPool),
    )
    .filter((pool) => pool.baseId && pool.quoteId);

  if (pools.length === 0) {
    childLogger.info(`No new pools found for chain ${chain.context.chainId}`);
    return;
  }

  const inserted = await poolsRepository.insertPools(pools);

  childLogger.info(`Inserted ${inserted.length} new pools for chain ${chain.context.chainId}`);

  if (inserted.length) {
    await Promise.allSettled(inserted.map(updateAmbientLpToken(chain)));
  }
};

const updateAmbientLpToken = (chain: SdexChain) => async (pool: Pool) => {
  const [base, quote, poolIdx] = pool.identifier.split('_');
  const lpToken = await chain.query.queryPoolLpTokenAddress(base, quote, poolIdx);
  if (lpToken) {
    await db
      .update(poolsTable)
      .set({ extra: { ...pool.extra, lpToken: lpToken.toLowerCase() } })
      .where(eq(poolsTable.id, pool.id));
  }
};

export const updateAmbientPool = async (pool: PoolExtended) => {
  const chain = networks.getByChainId(pool.chainId);
  const stats = await getPoolStats(chain.chainIdHex, pool.base.address, pool.quote.address, pool.extra.poolIdx);

  const displayPrice = toDisplayPrice(stats.lastPriceIndic, pool.base.decimals, pool.quote.decimals, true);

  const daily = await getDailyPoolVolume(chain.sdex, pool);

  await db
    .update(poolsTable)
    .set({
      fee: prettyNumber(bignumber(stats.feeRate).mul(100)),
      // printing with 18 decimals in case we will need precision for some calculations on FE side.
      price: prettyNumber(displayPrice, MAX_DECIMAL_PLACES),
      baseLiquidity: prettyNumber(bignumber(stats.baseTvl).div(10 ** pool.base.decimals), MAX_DECIMAL_PLACES),
      quoteLiquidity: prettyNumber(bignumber(stats.quoteTvl).div(10 ** pool.quote.decimals), MAX_DECIMAL_PLACES),
      baseVolume: prettyNumber(bignumber(stats.baseVolume).div(10 ** pool.base.decimals)),
      quoteVolume: prettyNumber(bignumber(stats.quoteVolume).div(10 ** pool.quote.decimals)),
      dailyBaseVolume: prettyNumber(bignumber(daily.baseFlow).div(10 ** pool.base.decimals)),
      dailyQuoteVolume: prettyNumber(bignumber(daily.quoteFlow).div(10 ** pool.quote.decimals)),
      // mark as just processed to avoid reprocessing
      processedAt: new Date(),
    })
    .where(eq(poolsTable.id, pool.id));
};

// build query to get volume of the pool for the last 24 hours
const getDailyPoolVolume = (chain: SdexChain, pool: PoolExtended) =>
  db
    .select({
      baseFlow: sum(sql`abs(${swapsTable.baseFlow}::numeric)`).as('baseFlow'),
      quoteFlow: sum(sql`abs(${swapsTable.quoteFlow}::numeric)`).as('quoteFlow'),
    })
    .from(swapsTable)
    .where(
      and(
        eq(swapsTable.chainId, chain.context.chainId),
        eq(lower(swapsTable.baseId), pool.base.address.toLowerCase()),
        eq(lower(swapsTable.quoteId), pool.quote.address.toLowerCase()),
        eq(swapsTable.poolIdx, String(pool.extra.poolIdx)),
        gte(swapsTable.tickAt, dayjs().subtract(1, 'days').toDate()),
      ),
    )
    .groupBy(swapsTable.baseId, swapsTable.quoteId, swapsTable.poolIdx)
    .then((rows) => (rows.length ? rows[0] : { baseFlow: '0', quoteFlow: '0' }));
