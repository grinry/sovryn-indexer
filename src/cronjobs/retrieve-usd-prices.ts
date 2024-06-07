import { CronJob } from 'cron';
import { and, eq } from 'drizzle-orm';
import { ZeroAddress } from 'ethers';
import _ from 'lodash';

import { db } from 'database/client';
import { tokens } from 'database/schema';
import { NewPrice, prices } from 'database/schema/prices';
import { networks } from 'loader/networks';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { SdexChain } from 'loader/networks/sdex-chain';
import { NetworkFeature } from 'loader/networks/types';
import { floorDate } from 'utils/date';
import { logger } from 'utils/logger';

import { findEndPrice, loadPoolPrices, PoolWithIndex } from './helpers/ambient-query';

const childLogger = logger.child({ module: 'crontab:retrieve-usd-prices' });

export const retrieveUsdPrices = async (ctx: CronJob) => {
  ctx.stop();
  const tickAt = floorDate(ctx.lastDate());
  childLogger.info({ tickAt }, 'Retrieving USD prices of tokens...');

  const tokens = await db.query.tokens.findMany({
    columns: {
      id: true,
      chainId: true,
      address: true,
      decimals: true,
    },
  });

  if (tokens.length === 0) {
    childLogger.info('No tokens to retrieve USD prices for');
    ctx.start();
    return;
  }

  const tokensByChain = _.groupBy(tokens, (item) => item.chainId);
  const chains = Object.keys(tokensByChain).map((item) => networks.getByChainId(Number(item))!);

  for (const chain of chains) {
    // if legacy supported, process all tokens throught it, because we can get prices of all tokens with single subgraph query.
    if (chain.hasFeature(NetworkFeature.legacy)) {
      await prepareLegacyTokens(chain.legacy, tickAt, tokensByChain[chain.chainId]);
    } else if (chain.hasFeature(NetworkFeature.sdex)) {
      await prepareSdexTokens(chain.sdex, tickAt, tokensByChain[chain.chainId]);
    }
  }

  childLogger.info('Token USD price retrieval finished.');

  ctx.start();
};

async function prepareLegacyTokens(chain: LegacyChain, date: Date, tokensToQuery: { id: number; address: string }[]) {
  try {
    childLogger.info(`Preparing ${tokensToQuery.length} legacy tokens for chain ${chain.context.chainId}`);
    const { tokens: items } = await chain.queryTokenPrices(tokensToQuery.map((item) => item.address));

    if (items.length === 0) {
      childLogger.info('No tokens to add for legacy chain');
      return;
    }

    const stablecoin = await db.query.tokens.findFirst({
      columns: {
        id: true,
      },
      where: and(eq(tokens.chainId, chain.context.chainId), eq(tokens.address, chain.context.stablecoinAddress)),
    });

    if (!stablecoin) {
      childLogger.error(
        { chainId: chain.context.chainId, stablecoin: chain.context.stablecoinAddress },
        'Stablecoin not found for legacy chain',
      );
      return;
    }

    const toAdd: NewPrice[] = [];

    // if native token price is requested, but subgraph does not return it, add it manually using native wrapper
    if (tokensToQuery.find((item) => item.address === ZeroAddress) && !items.find((item) => item.id === ZeroAddress)) {
      const wrapper = items.find((item) => item.id === chain.nativeTokenWrapper);
      if (wrapper) {
        const nativeId = tokensToQuery.find((item) => item.address === ZeroAddress)!.id;
        toAdd.push({
          baseId: nativeId,
          quoteId: stablecoin.id,
          tickAt: date,
          value: wrapper.lastPriceUsd,
        });
      }
    }

    for (const item of items) {
      const token = tokensToQuery.find((t) => t.address === item.id);
      if (!token) {
        childLogger.error({ address: item.id }, 'Token not found in tokens list');
        continue;
      }

      toAdd.push({
        baseId: token.id,
        quoteId: stablecoin.id,
        tickAt: date,
        value: item.lastPriceUsd,
      });
    }

    if (toAdd.length) {
      const result = await db
        .insert(prices)
        .values(toAdd)
        .onConflictDoNothing({ target: [prices.baseId, prices.quoteId, prices.tickAt] })
        .returning({ id: prices.id })
        .execute();

      childLogger.info(`Added ${result.length} new prices for chain ${chain.context.chainId} (Legacy)`);
    } else {
      childLogger.info('No prices to add for legacy chain');
    }
  } catch (error) {
    childLogger.error(error, 'Error while retrieving USD prices for legacy chain');
  }
}

async function prepareSdexTokens(
  chain: SdexChain,
  date: Date,
  tokensToQuery: { id: number; address: string; decimals: number }[],
) {
  try {
    childLogger.info(`Preparing ${tokensToQuery.length} Sdex tokens for chain ${chain.context.chainId}`);

    const { pools } = await chain.queryPools(1000);
    const poolsWithIndexes = pools.map((item) => [item.base, item.quote, item.poolIdx] as PoolWithIndex);

    const goal = chain.context.stablecoinAddress;

    const stablecoin = await db.query.tokens.findFirst({
      columns: {
        id: true,
      },
      where: and(eq(tokens.chainId, chain.context.chainId), eq(tokens.address, chain.context.stablecoinAddress)),
    });

    if (!stablecoin) {
      childLogger.error(
        { chainId: chain.context.chainId, stablecoin: chain.context.stablecoinAddress },
        'Stablecoin not found for sdex chain',
      );
      return;
    }

    // todo: put it to multicall?
    const poolPrices = await loadPoolPrices(poolsWithIndexes, chain, tokensToQuery);

    const toAdd: NewPrice[] = [];

    for (const token of tokensToQuery) {
      if (token.id === stablecoin.id) {
        toAdd.push({
          baseId: token.id,
          quoteId: token.id,
          tickAt: date,
          value: '1',
        });
        continue;
      }

      try {
        const price = findEndPrice(token.address, goal, pools, poolsWithIndexes, poolPrices);

        toAdd.push({
          baseId: token.id,
          quoteId: stablecoin.id,
          tickAt: date,
          value: price,
        });
      } catch (error) {
        childLogger.error(error, 'Error while preparing Sdex token' + token.id);
      }
    }

    childLogger.info(`Adding ${toAdd.length} new prices for chain ${chain.context.chainId} (Sdex)`);

    const result = await db
      .insert(prices)
      .values(toAdd)
      .onConflictDoNothing({ target: [prices.baseId, prices.quoteId, prices.tickAt] })
      .returning({ id: prices.id })
      .execute();

    childLogger.info(`Added ${result.length} new prices for chain ${chain.context.chainId} (Sdex)`);
  } catch (error) {
    childLogger.error(error, 'Error while preparing Sdex tokens');
  }
}
