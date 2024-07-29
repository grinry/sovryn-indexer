import dayjs from 'dayjs';
import { eq, and, sql, gte } from 'drizzle-orm';

import { db } from 'database/client';
import { NewSwap, swapsTable } from 'database/schema';

export type NewSwapItem = Omit<NewSwap, 'createdAt' | 'updatedAt'>;

export const swapRepository = {
  create: (data: NewSwapItem[]) =>
    db
      .insert(swapsTable)
      .values(data)
      .onConflictDoUpdate({
        target: [swapsTable.baseId, swapsTable.quoteId, swapsTable.transactionHash],
        set: {
          baseFlow: sql`excluded.base_flow`,
          quoteFlow: sql`excluded.quote_flow`,
        },
      }),

  loadAll: (chainId?: number) =>
    db
      .select({
        baseId: swapsTable.baseId,
        quoteId: swapsTable.quoteId,
        chainId: swapsTable.chainId,
        transactionHash: swapsTable.transactionHash,
        user: swapsTable.user,
        tickAt: swapsTable.tickAt,
        block: swapsTable.block,
        isBuy: swapsTable.isBuy,
        inBaseQty: swapsTable.inBaseQty,
        qty: swapsTable.qty,
        limitPrice: swapsTable.limitPrice,
        minOut: swapsTable.minOut,
        baseFlow: swapsTable.baseFlow,
        quoteFlow: swapsTable.quoteFlow,
      })
      .from(swapsTable)
      .where(and(chainId ? eq(swapsTable.chainId, chainId) : undefined)),

  loadLastSwap: (chainId?: number) =>
    db
      .select()
      .from(swapsTable)
      .where(
        and(
          chainId ? eq(swapsTable.chainId, chainId) : undefined,
          eq(swapsTable.block, sql`(select max(${swapsTable.block}) from ${swapsTable})`),
        ),
      ),

  loadSwaps: (days = 1, chainId?: number) =>
    db
      .select()
      .from(swapsTable)
      .where(
        and(
          chainId ? eq(swapsTable.chainId, chainId) : undefined,
          gte(swapsTable.tickAt, dayjs().subtract(days, 'days').toDate()),
        ),
      ),
};
