import { and, avg, between, desc, eq, lte, max, min, or, sql } from 'drizzle-orm';
import { bignumber } from 'mathjs';

import { MEDIUM_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { usdDailyPricesTable } from 'database/schema';
import { maybeCache } from 'utils/cache';

export function groupItemsInPairs<T>(items: T[]): T[][] {
  const groupedItems: T[][] = [];

  for (let i = 0; i < items.length - 1; i++) {
    groupedItems.push([items[i], items[i + 1]]);
  }

  return groupedItems;
}

export function findPrice(base: number, quote: number, prices: PriceItem[] = []) {
  const basePrice = prices.find((item) => item.tokenId === base);
  const quotePrice = prices.find((item) => item.tokenId === quote);

  if (base === quote) {
    return bignumber(1);
  }

  if (!basePrice || !quotePrice) {
    return bignumber(0);
  }

  return bignumber(quotePrice.value).div(basePrice.value);
}

export function findUsdPrice(entry: number, prices: PriceItem[]) {
  const token = prices.find((item) => item.tokenId === entry);
  if (token) {
    return bignumber(token.value);
  }
  return bignumber(0);
}

export type PriceItem = {
  tokenId: number;
  value: string;
  tickAt: Date;
  updatedAt: Date;
};

export const getLastPrices = (forceUpdate = false): Promise<PriceItem[]> =>
  maybeCache(
    'lastPrices',
    async () => {
      const dateMap = db
        .select({
          tokenId: usdDailyPricesTable.tokenId,
          date: sql<Date>`max(${usdDailyPricesTable.tickAt})`.as('date'),
        })
        .from(usdDailyPricesTable)
        .groupBy(usdDailyPricesTable.tokenId)
        .as('sq_dates');
      return db
        .select({
          tokenId: usdDailyPricesTable.tokenId,
          value: usdDailyPricesTable.value,
          tickAt: dateMap.date,
          updatedAt: usdDailyPricesTable.updatedAt,
        })
        .from(usdDailyPricesTable)
        .innerJoin(
          dateMap,
          and(eq(usdDailyPricesTable.tokenId, dateMap.tokenId), eq(usdDailyPricesTable.tickAt, dateMap.date)),
        );
    },
    MEDIUM_CACHE_TTL,
    forceUpdate,
  ).then((result) => result.data);

export const getPricesInRange = async (from: Date, to: Date) => {
  const sq = db
    .select({
      tokenId: usdDailyPricesTable.tokenId,
      date: sql<Date>`max(${usdDailyPricesTable.tickAt})`.as('date'),
    })
    .from(usdDailyPricesTable)
    .where(lte(usdDailyPricesTable.tickAt, to))
    .groupBy(usdDailyPricesTable.tokenId)
    .as('sq');

  return await db
    .select({
      tokenId: usdDailyPricesTable.tokenId,
      tickAt: usdDailyPricesTable.tickAt,
      avg: avg(sql`${usdDailyPricesTable.value}::numeric`).as('avg'),
      low: min(sql`${usdDailyPricesTable.value}::numeric`).as('low'),
      high: max(sql`${usdDailyPricesTable.value}::numeric`).as('high'),
    })
    .from(usdDailyPricesTable)
    .innerJoin(sq, and(eq(usdDailyPricesTable.tokenId, sq.tokenId), eq(usdDailyPricesTable.tickAt, sq.date)))
    .where(
      or(
        between(usdDailyPricesTable.tickAt, from, to),
        and(eq(usdDailyPricesTable.tokenId, sq.tokenId), eq(usdDailyPricesTable.tickAt, sq.date)),
      ),
    )
    .groupBy(usdDailyPricesTable.tokenId, usdDailyPricesTable.tickAt)
    .orderBy(desc(usdDailyPricesTable.tickAt));
};

export const getLastPrice = async (base: number, quote: number) => {
  const lastPrices = await getLastPrices();
  return findPrice(base, quote, lastPrices);
};

export const getLastUsdPrice = async (base: number) => {
  const lastPrices = await getLastPrices();
  return findUsdPrice(base, lastPrices);
};
