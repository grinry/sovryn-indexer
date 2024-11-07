import dayjs from 'dayjs';
import { eq, and, gte, desc } from 'drizzle-orm';

import { db } from 'database/client';

import { swapsTableV2, NewSwap } from './../schema/swaps_v2';

export type NewSwapItem = Omit<NewSwap, 'createdAt' | 'updatedAt'>;

export const swapRepositoryV2 = {
  create: (data: NewSwapItem[]) => db.insert(swapsTableV2).values(data).onConflictDoNothing(),

  loadAll: async (chainId?: number) => {
    return await db
      .select({
        chainId: swapsTableV2.chainId,
        transactionHash: swapsTableV2.transactionHash,
        baseAmount: swapsTableV2.baseAmount,
        quoteAmount: swapsTableV2.quoteAmount,
        fees: swapsTableV2.fees,
        callIndex: swapsTableV2.callIndex,
        baseId: swapsTableV2.baseId,
        quoteId: swapsTableV2.quoteId,
        user: swapsTableV2.user,
        block: swapsTableV2.block,
        tickAt: swapsTableV2.tickAt,
      })
      .from(swapsTableV2)
      .where(chainId ? eq(swapsTableV2.chainId, chainId) : undefined);
  },

  loadLastSwap: (chainId?: number) =>
    db.query.swapsTable.findFirst({
      where: and(chainId ? eq(swapsTableV2.chainId, chainId) : undefined),
      orderBy: desc(swapsTableV2.block),
    }),
  loadSwaps: (days = 1, chainId?: number) =>
    db
      .select()
      .from(swapsTableV2)
      .where(
        and(
          chainId ? eq(swapsTableV2.chainId, chainId) : undefined,
          gte(swapsTableV2.tickAt, dayjs().subtract(days, 'days').toDate()),
        ),
      ),
};
