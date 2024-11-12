import dayjs from 'dayjs';
import { eq, and, sql, gte, desc } from 'drizzle-orm';

import { db } from 'database/client';
import { NewSwap, swapsTable } from 'database/schema';

export type NewSwapItem = Omit<NewSwap, 'createdAt' | 'updatedAt'>;

/** @deprecated */
export const swapRepository = {
  create: (data: NewSwapItem[]) => db.insert(swapsTable).values(data).onConflictDoNothing(),

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
    db.query.swapsTable.findFirst({
      where: and(chainId ? eq(swapsTable.chainId, chainId) : undefined),
      orderBy: desc(swapsTable.block),
    }),
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
