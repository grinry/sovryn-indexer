import dayjs from 'dayjs';
import { sql } from 'drizzle-orm';
import { ZeroAddress } from 'ethers';
import { uniqBy } from 'lodash';

import { findEndPrice, loadPoolPrices, PoolWithIndex } from 'cronjobs/helpers/ambient-query';
import { db } from 'database/client';
import { tokenRepository } from 'database/repository/token-repository';
import { usdDailyPricesTable, usdHourlyPricesTable, usdPricesTable } from 'database/schema';
import { LiquidityChain } from 'loader/networks/liquidity-chain';
import { areAddressesEqual } from 'utils/compare';
import { logger } from 'utils/logger';

import { networks } from '../networks';
import { LegacyChain } from '../networks/legacy-chain';
import { SdexChain } from '../networks/sdex-chain';
import { NetworkFeature } from '../networks/types';

import { listTokens, loadLastStoredPrices, prepareDataToStore, Price, Token } from './usd-price-store';

export async function usdPriceLoader(date: Date) {
  const tokens = await listTokens();

  const prices = await processChainData(tokens, date);
  if (prices.length) {
    Promise.all([storeLastPrices(prices), storeLastHourlyPrices(prices), storeLastDailyPrices(prices)]);
  }
  return prices;
}

const processChainData = (tokens: Token[], date: Date) =>
  Promise.allSettled(
    networks
      .listChains()
      .map((chain) => {
        const chainTokens = tokens.filter((token) => token.chainId === chain.chainId);
        if (chain.hasFeature(NetworkFeature.legacy)) {
          return processLegacyTokens(chain.legacy, date, chainTokens);
        } else if (chain.hasFeature(NetworkFeature.sdex)) {
          return processSdexTokens(chain.sdex, date, chainTokens);
        } else if (chain.hasFeature(NetworkFeature.liquidity)) {
          return processTraderJoeTokens(chain.liquidity, date, chainTokens);
        }
        return null;
      })
      .filter((item) => item !== null),
  )
    .then((result) => result.filter((item) => item.status === 'fulfilled').map((item) => item.value))
    .then((result) => result.flatMap((item) => item));

async function processLegacyTokens(chain: LegacyChain, date: Date, tokens: Token[]): Promise<Price[]> {
  const items = await chain.queryTokenPrices(tokens.map((item) => item.address));

  // if native token is not in the list, add it's data from wrapped native token
  if (
    tokens.find((item) => areAddressesEqual(item.address, ZeroAddress)) &&
    !items.tokens.find((item) => areAddressesEqual(item.id, ZeroAddress))
  ) {
    const wrapper = items.tokens.find((item) => areAddressesEqual(item.id, chain.nativeTokenWrapper));
    if (wrapper) {
      items.tokens.push({
        id: ZeroAddress,
        symbol: wrapper.symbol,
        lastPriceUsd: wrapper.lastPriceUsd,
      });
    }
  }

  // if ZUSD token price is requested, but subgraph does not return it, add price of DLLR to it.
  if (
    tokens.find((item) => areAddressesEqual(item.address, chain.config.zusdToken)) &&
    !items.tokens.find((item) => areAddressesEqual(item.id, chain.config.zusdToken))
  ) {
    const dllr = items.tokens.find((item) => item.symbol.toLowerCase() === 'dllr');
    if (dllr) {
      const zusdId = tokens.find((item) => areAddressesEqual(item.address, chain.config.zusdToken))!.address;
      items.tokens.push({
        id: zusdId,
        symbol: 'ZUSD',
        lastPriceUsd: dllr.lastPriceUsd,
      });
    }
  }

  return items.tokens.map(
    (item) =>
      ({
        ...tokens.find((token) => token.address === item.id)!,
        value: item.lastPriceUsd,
        date,
      } satisfies Price),
  );
}

async function processSdexTokens(chain: SdexChain, date: Date, tokens: Token[]): Promise<Price[]> {
  const { pools } = await chain.queryPools(1000);
  const poolsWithIndexes = pools.map((item) => [item.base, item.quote, item.poolIdx] as PoolWithIndex);

  const goal = chain.context.stablecoinAddress;
  const stablecoin = await tokenRepository.getStablecoin(chain.context);

  if (!stablecoin) {
    logger.error(
      { chainId: chain.context.chainId, stablecoin: chain.context.stablecoinAddress },
      'Stablecoin not found for sdex chain',
    );
    return [];
  }

  // todo: put it to multicall?
  const poolPrices = await loadPoolPrices(poolsWithIndexes, chain, tokens);

  logger.warn({ chainId: chain.context.chainId, pools: pools.length, prices: poolPrices.length }, 'Loaded pools');

  const toAdd: Price[] = [];

  for (const token of tokens) {
    if (token.id === stablecoin.id) {
      toAdd.push({
        ...token,
        value: '1',
        date,
      });
      continue;
    }

    try {
      const price = findEndPrice(token.address, goal, pools, poolsWithIndexes, poolPrices);

      toAdd.push({
        ...token,
        value: price,
        date,
      });
    } catch (error) {
      logger.error(error, 'Error while preparing Sdex token' + token.id);
    }
  }
  return toAdd;
}

// todo: no way to test this because we have no working subgraph...
async function processTraderJoeTokens(chain: LiquidityChain, date: Date, tokens: Token[]): Promise<Price[]> {
  const { lbpairs } = await chain.queryTokenPrices();

  const items: { id: string; symbol: string; name: string; decimals: number; lastPriceUsd: string }[] = [];

  lbpairs.forEach((pair) => {
    items.push({
      id: pair.tokenX.id,
      symbol: pair.tokenX.symbol,
      name: pair.tokenX.name,
      decimals: pair.tokenX.decimals,
      lastPriceUsd: pair.tokenXPriceUSD,
    });

    items.push({
      id: pair.tokenY.id,
      symbol: pair.tokenY.symbol,
      name: pair.tokenY.name,
      decimals: pair.tokenY.decimals,
      lastPriceUsd: pair.tokenYPriceUSD,
    });
  });

  logger.info({ items }, 'Loaded tokens for liquidity chain');

  if (items.length === 0) {
    logger.info('No tokens to add for liquidity chain');
    return [];
  }

  const toAdd: Price[] = [];

  for (const item of items) {
    const token = tokens.find((t) => areAddressesEqual(t.address, item.id));
    if (!token) {
      continue;
    }

    toAdd.push({
      ...token,
      value: item.lastPriceUsd,
      date,
    });
  }

  // remove duplicated tokens, as it looks like we have them in pairs
  return uniqBy(toAdd, (item) => item.id);
}

async function storeLastPrices(prices: Price[]) {
  // find last stored price for each token and write only if it's different
  const current = await loadLastStoredPrices(usdPricesTable);
  const storeData = prepareDataToStore(current, prices);

  if (storeData.length > 0) {
    await db
      .insert(usdPricesTable)
      .values(storeData)
      .onConflictDoUpdate({
        target: [usdPricesTable.tokenId, usdPricesTable.tickAt],
        set: {
          value: sql`excluded.value`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
        },
      })
      .execute();
    return storeData;
  }

  return [];
}

async function storeLastHourlyPrices(prices: Price[]) {
  const items: Price[] = prices.map((item) => ({
    ...item,
    date: dayjs(item.date).startOf('hour').toDate(),
  }));

  const current = await loadLastStoredPrices(usdHourlyPricesTable);
  const storeData = prepareDataToStore(current, items);

  if (storeData.length > 0) {
    await db
      .insert(usdHourlyPricesTable)
      .values(storeData)
      .onConflictDoUpdate({
        target: [usdHourlyPricesTable.tokenId, usdHourlyPricesTable.tickAt],
        set: {
          value: sql`excluded.value`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
        },
      })
      .execute();
  }
}

async function storeLastDailyPrices(prices: Price[]) {
  const items = prices.map((item) => ({
    ...item,
    date: dayjs(item.date).startOf('day').toDate(),
  }));

  const current = await loadLastStoredPrices(usdDailyPricesTable);

  const storeData = prepareDataToStore(current, items);

  if (storeData.length > 0) {
    await db
      .insert(usdDailyPricesTable)
      .values(storeData)
      .onConflictDoUpdate({
        target: [usdDailyPricesTable.tokenId, usdDailyPricesTable.tickAt],
        set: {
          value: sql`excluded.value`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
        },
      })
      .execute();
  }
}
