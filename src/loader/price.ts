import { and, eq, sql } from 'drizzle-orm';
import { bignumber } from 'mathjs';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { NewPrice, prices } from 'database/schema';
import { bfsShortestPath, constructGraph } from 'utils/bfs';
import { maybeCache } from 'utils/cache';

export function groupItemsInPairs<T>(items: T[]): T[][] {
  const groupedItems: T[][] = [];

  for (let i = 0; i < items.length - 1; i++) {
    groupedItems.push([items[i], items[i + 1]]);
  }

  return groupedItems;
}

export function findPrice(base: number, quote: number, prices: NewPrice[] = []) {
  const item = prices.find(
    (item) => (item.baseId === base && item.quoteId === quote) || (item.baseId === quote && item.quoteId === base),
  );

  return item.baseId === base ? bignumber(item.value) : bignumber(1).div(item.value ?? 0);
}

export function findEndPrice(entry: number, destination: number, prices: NewPrice[]) {
  const graph = constructGraph(prices.map((item) => [item.baseId, item.quoteId]));
  const path = bfsShortestPath(graph, entry, destination);
  const groupedPath = groupItemsInPairs(path ?? []);

  if (entry === destination) {
    return bignumber(1);
  }

  if (groupedPath.length === 0) {
    return bignumber(0);
  }

  let price = bignumber(1);
  for (const [base, quote] of groupedPath) {
    price = bignumber(price).mul(findPrice(base, quote, prices));
  }

  return price;
}

// todo: add possibility to update cache data outside current thread if TTL is almost expired
export const getLastPrices = () =>
  maybeCache(
    'lastPrices',
    async () => {
      const dateMap = db
        .select({
          baseId: prices.baseId,
          quoteId: prices.quoteId,
          date: sql<string>`max(${prices.tickAt})`.as('date'),
        })
        .from(prices)
        .groupBy(prices.baseId, prices.quoteId)
        .as('sq_dates');

      const values = await db
        .select({
          baseId: prices.baseId,
          quoteId: prices.quoteId,
          value: prices.value,
          tickAt: dateMap.date,
        })
        .from(prices)
        .innerJoin(
          dateMap,
          and(eq(prices.baseId, dateMap.baseId), eq(prices.quoteId, dateMap.quoteId), eq(prices.tickAt, dateMap.date)),
        );
      return values;
    },
    DEFAULT_CACHE_TTL,
  ).then((result) => result.data);
