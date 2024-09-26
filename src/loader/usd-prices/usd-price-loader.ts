import dayjs from 'dayjs';
import { sql } from 'drizzle-orm';

import { db } from 'database/client';
import { usdDailyPricesTable, usdHourlyPricesTable, usdPricesTable } from 'database/schema';
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
        }
        return null;
      })
      .filter((item) => item !== null),
  )
    .then((result) => result.filter((item) => item.status === 'fulfilled').map((item) => item.value))
    .then((result) => result.flatMap((item) => item));

async function processLegacyTokens(chain: LegacyChain, date: Date, tokens: Token[]): Promise<Price[]> {
  const items = await chain.queryTokenPrices(tokens.map((item) => item.address));
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
  return [];
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

  logger.info({ storeData }, `Storing daily ${storeData.length} prices`);

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
