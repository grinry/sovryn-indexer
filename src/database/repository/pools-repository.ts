import dayjs from 'dayjs';
import { and, asc, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from 'database/client';
import { lower } from 'database/helpers';
import { Token, tokens, usdDailyPricesTable } from 'database/schema';
import { NewPool, Pool, poolsTable } from 'database/schema/pools';

const TEN_MINUTES = 10 * 60 * 1000;

export type PoolExtended = Pool & { base: Token; quote: Token };

// todo: add methods to get extended pool data (ex: token symbol, addresses and last usd price)
export const poolsRepository = {
  insertPools(data: NewPool[]) {
    // verify if data is correct
    data.forEach((pool) => {
      // identifier must not have character "/", so we can use it in the url path.
      pool.identifier = pool.identifier.toLowerCase().replace('/', '_');
    });

    return db
      .insert(poolsTable)
      .values(data)
      .onConflictDoNothing({
        target: [poolsTable.chainId, poolsTable.type, poolsTable.identifier],
      })
      .returning();
  },
  listForChain: (chainId: number) =>
    db.query.poolsTable.findMany({
      columns: {
        id: true,
        identifier: true,
        type: true,
        price: true,
        fee: true,
        apr: true,
        baseLiquidity: true,
        quoteLiquidity: true,
        baseVolume: true,
        quoteVolume: true,
        dailyBaseVolume: true,
        dailyQuoteVolume: true,
        extra: true,
        featured: true,
      },
      with: {
        base: {
          columns: {
            symbol: true,
            name: true,
            address: true,
            decimals: true,
          },
        },
        quote: {
          columns: {
            symbol: true,
            name: true,
            address: true,
            decimals: true,
          },
        },
      },
      where: eq(poolsTable.chainId, chainId),
      // order by featured first, then by creation date
      orderBy: sql`(${poolsTable.featured} is true) desc, ${poolsTable.createdAt} desc`,
    }),
  getByIdentifier: (chainId: number, identifier: string) =>
    db.query.poolsTable.findFirst({
      where: and(eq(poolsTable.chainId, chainId), eq(lower(poolsTable.identifier), identifier.toLowerCase())),
    }),
  allProcessable: async (): Promise<PoolExtended[]> =>
    db.query.poolsTable.findMany({
      // only process pools that have not been processed in the last 10 minutes
      with: {
        base: true,
        quote: true,
      },
      where: or(isNull(poolsTable.processedAt), lt(poolsTable.processedAt, dayjs().subtract(TEN_MINUTES).toDate())),
      orderBy: asc(poolsTable.processedAt), // process oldest first
    }),

  listForChainAsTickers: (chainId: number) =>
    db.query.poolsTable.findMany({
      columns: {
        identifier: true,
        price: true,
        baseLiquidity: true,
        quoteLiquidity: true,
        dailyBaseVolume: true,
        dailyQuoteVolume: true,
      },
      with: {
        base: {
          columns: {
            address: true,
          },
          with: {
            usdDailyPrices: {
              columns: {
                value: true,
              },
              limit: 1,
              orderBy: desc(usdDailyPricesTable.tickAt),
            },
          },
        },
        quote: {
          columns: {
            address: true,
          },
          with: {
            usdDailyPrices: {
              columns: {
                value: true,
              },
              limit: 1,
              orderBy: desc(usdDailyPricesTable.tickAt),
            },
          },
        },
      },
      where: eq(poolsTable.chainId, chainId),
      orderBy: asc(poolsTable.id),
    }),
};
