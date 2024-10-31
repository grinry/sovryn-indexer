import dayjs from 'dayjs';
import { eq, and, sql, gte, desc } from 'drizzle-orm';

import { db } from 'database/client';

import { swapsTableV2, NewSwap } from './../schema/swaps_v2';

export type NewSwapItem = Omit<NewSwap, 'createdAt' | 'updatedAt'>;

export const swapRepositoryV2 = {
  create: (data: NewSwapItem[]) => db.insert(swapsTableV2).values(data).onConflictDoNothing(),

  loadAll: (chainId?: number) =>
    db
      .select({
        baseId: swapsTableV2.baseId,
        quoteId: swapsTableV2.quoteId,
        chainId: swapsTableV2.chainId,
        transactionHash: swapsTableV2.transactionHash,
        user: swapsTableV2.user,
        tickAt: swapsTableV2.tickAt,
        block: swapsTableV2.block,
        isBuy: swapsTableV2.isBuy,
        amountIn: swapsTableV2.amountIn,
        amountOut: swapsTableV2.amountOut,
        baseFlow: swapsTableV2.baseFlow,
        quoteFlow: swapsTableV2.quoteFlow,
      })
      .from(swapsTableV2)
      .where(and(chainId ? eq(swapsTableV2.chainId, chainId) : undefined)),

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
