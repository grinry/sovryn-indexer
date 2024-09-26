import { and, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from 'database/client';
import { ammApyBlocks, NewAmmApyBlock } from 'database/schema';

export type DailyAggregatedApyResult = {
  pool: string;
  poolToken: string;
  date: string;
  avgBalance: string;
  avgBalanceUsd: string;
  sumFees: string;
  sumRewards: string;
};

export const apyBlockRepository = {
  getLastBlock: async (chainId: number) =>
    db.query.ammApyBlocks
      .findFirst({
        columns: {
          block: true,
        },
        orderBy: desc(ammApyBlocks.block),
        where: eq(ammApyBlocks.chainId, chainId),
      })
      .then((item) => item?.block ?? null),

  getDailyAggregatedApy: async (chainId: number, fromDate: Date): Promise<DailyAggregatedApyResult[]> =>
    db
      .select({
        pool: sql<string>`string_agg(distinct ${ammApyBlocks.pool}, ',')`.as('pool'),
        poolToken: ammApyBlocks.poolToken,
        date: sql<string>`max(date(${ammApyBlocks.blockTimestamp}))`.as('date'),
        avgBalance: sql<string>`avg(${ammApyBlocks.balanceBtc})`.as('avg_balance'),
        avgBalanceUsd: sql<string>`avg(${ammApyBlocks.balanceUsd})`.as('avg_balance_usd'),
        sumFees: sql<string>`sum(${ammApyBlocks.conversionFeeBtc})`.as('sum_fees'),
        sumRewards: sql<string>`sum(${ammApyBlocks.rewardsBtc})`.as('sum_rewards'),
      })
      .from(ammApyBlocks)
      .where(and(eq(ammApyBlocks.chainId, chainId), gte(ammApyBlocks.blockTimestamp, fromDate)))
      .groupBy(ammApyBlocks.poolToken)
      .execute(),

  storeItems: (data: NewAmmApyBlock[]) =>
    db
      .insert(ammApyBlocks)
      .values(data)
      .onConflictDoNothing({
        target: [ammApyBlocks.chainId, ammApyBlocks.pool, ammApyBlocks.block],
      }),
};
