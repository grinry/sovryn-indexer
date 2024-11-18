import { eq, and, desc, inArray } from 'drizzle-orm';

import { db } from 'database/client';
import { NewPoolBalance, poolBalanceTable } from 'database/schema/pool-balance';

export type PoolBalanceItem = Omit<NewPoolBalance, 'createdAt' | 'updatedAt'>;

export const poolBalanceRepository = {
  // create: (data: PoolBalanceItem[]) => db.insert(poolBalanceTable).values(data).onConflictDoUpdate({
  //   target: [tokens.chainId, tokens.address],
  //   set: {
  //     swapableSince: sql`EXCLUDED.swapable_since`,
  //   },
  // })
  // .returning({ id: tokens.id })
  // .execute();

  loadAll: (chainId?: number) =>
    db
      .select({
        id: poolBalanceTable.id,
        baseId: poolBalanceTable.baseId,
        quoteId: poolBalanceTable.quoteId,
        ambientLiq: poolBalanceTable.ambientLiq,
        user: poolBalanceTable.user,
        time: poolBalanceTable.time,
        concLiq: poolBalanceTable.concLiq,
        rewardLiq: poolBalanceTable.rewardLiq,
        baseQty: poolBalanceTable.baseQty,
        quoteQty: poolBalanceTable.quoteQty,
        aggregatedLiquidity: poolBalanceTable.aggregatedLiquidity,
        aggregatedBaseFlow: poolBalanceTable.aggregatedBaseFlow,
        aggregatedQuoteFlow: poolBalanceTable.aggregatedQuoteFlow,
        positionType: poolBalanceTable.positionType,
        bidTick: poolBalanceTable.bidTick,
        askTick: poolBalanceTable.askTick,
        aprDuration: poolBalanceTable.aprDuration,
        aprPostLiq: poolBalanceTable.aprPostLiq,
        aprContributedLiq: poolBalanceTable.aprContributedLiq,
        aprEst: poolBalanceTable.aprEst,
        block: poolBalanceTable.block,
      })
      .from(poolBalanceTable)
      .where(and(chainId ? eq(poolBalanceTable.chainId, chainId) : undefined)),

  loadUserBalances: (user: string, chainId?: number) =>
    db
      .select()
      .from(poolBalanceTable)
      .where(and(eq(poolBalanceTable.user, user), chainId ? eq(poolBalanceTable.chainId, chainId) : undefined)),

  loadUsersBalances: (users: string[], chainId?: number) =>
    db
      .select()
      .from(poolBalanceTable)
      .where(and(inArray(poolBalanceTable.user, users), chainId ? eq(poolBalanceTable.chainId, chainId) : undefined)),

  loadLastBalance: (chainId?: number) =>
    db.query.poolBalanceTable.findFirst({
      where: and(chainId ? eq(poolBalanceTable.chainId, chainId) : undefined),
      orderBy: desc(poolBalanceTable.block),
    }),
};
