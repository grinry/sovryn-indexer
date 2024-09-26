import { sql, and, eq, inArray } from 'drizzle-orm';
import { bignumber } from 'mathjs';

import { db } from 'database/client';
import { tokens, usdDailyPricesTable, usdHourlyPricesTable, usdPricesTable } from 'database/schema';
import { networks } from 'loader/networks';

export type Token = {
  id: number;
  chainId: number;
  address: string;
  decimals: number;
};

export type CurrentPrice = {
  id: number;
  tokenId: number;
  value: string;
  high: string;
  low: string;
  tickAt: string;
};

export type Price = Token & {
  value: string;
  date: Date;
};

type Table = typeof usdPricesTable | typeof usdHourlyPricesTable | typeof usdDailyPricesTable;

export async function loadLastStoredPrices(table: Table): Promise<CurrentPrice[]> {
  const dateMap = db
    .select({
      tokenId: table.tokenId,
      date: sql<string>`max(${table.tickAt})`.as('date'),
    })
    .from(table)
    .groupBy(table.tokenId)
    .as('sq_date');
  return db
    .select({
      id: table.id,
      tokenId: table.tokenId,
      value: table.value,
      high: table.high,
      low: table.low,
      tickAt: dateMap.date,
    })
    .from(table)
    .innerJoin(dateMap, and(eq(table.tokenId, dateMap.tokenId), eq(table.tickAt, dateMap.date)))
    .execute();
}

export function prepareDataToStore(current: CurrentPrice[], prices: Price[]) {
  return prices
    .map((item) => {
      const last = current.find((price) => price.tokenId === item.id);
      return { last, item };
    })
    .filter(({ last, item }) => last === undefined || last.value !== item.value)
    .map(
      ({ item, last }) =>
        ({
          tokenId: item.id,
          value: item.value,
          high: last?.high !== undefined && bignumber(last.high).gt(item.value) ? last.high : item.value,
          low: last?.low !== undefined && bignumber(last.low).lt(item.value) ? last.low : item.value,
          tickAt: item.date,
          last,
        } satisfies any),
    );
}

export const listTokens = (): Promise<Token[]> =>
  db.query.tokens
    .findMany({
      columns: {
        id: true,
        chainId: true,
        address: true,
        decimals: true,
      },
      where: and(
        eq(tokens.ignored, false),
        inArray(
          tokens.chainId,
          networks.listChains().map((item) => item.chainId),
        ),
      ),
    })
    .execute();
