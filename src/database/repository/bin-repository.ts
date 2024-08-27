import dayjs from 'dayjs';
import { eq, and, sql, gte, desc } from 'drizzle-orm';

import { db } from 'database/client';
import { NewBin, binsTable } from 'database/schema';

export type NewBinItem = Omit<NewBin, 'createdAt' | 'updatedAt'>;

export const binRepository = {
  create: (data: NewBinItem[]) => db.insert(binsTable).values(data).onConflictDoNothing(),

  loadAll: (chainId?: number) =>
    db
      .select({
        liquidity: binsTable.liquidity,
        binId: binsTable.binId,
        priceX: binsTable.priceX,
        priceY: binsTable.priceY,
        totalSupply: binsTable.totalSupply,
        tickAt: binsTable.tickAt,
        reserveX: binsTable.reserveX,
        reserveY: binsTable.reserveY,
        block: binsTable.block,
        user: binsTable.user,
        chainId: binsTable.chainId,
      })
      .from(binsTable)
      .where(and(chainId ? eq(binsTable.chainId, chainId) : undefined)),

  loadLastBin: (chainId?: number) =>
    db.query.binsTable.findFirst({
      where: and(chainId ? eq(binsTable.chainId, chainId) : undefined),
      orderBy: desc(binsTable.block),
    }),
  loadBins: (days = 1, chainId?: number) =>
    db
      .select()
      .from(binsTable)
      .where(
        and(
          chainId ? eq(binsTable.chainId, chainId) : undefined,
          gte(binsTable.tickAt, dayjs().subtract(days, 'days').toDate()),
        ),
      ),
};
