import dayjs from 'dayjs';
import { eq, and, gte, desc, inArray } from 'drizzle-orm';

import { db } from 'database/client';
import { tokens } from 'database/schema';

import { swapsTableV2, NewSwap } from './../schema/swaps_v2';

export type NewSwapItem = Omit<NewSwap, 'createdAt' | 'updatedAt'>;

export const swapRepositoryV2 = {
  create: (data: NewSwapItem[]) => db.insert(swapsTableV2).values(data).onConflictDoNothing(),

  loadAll: async (chainId?: number) => {
    const swaps = await db
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
      .where(and(chainId ? eq(swapsTableV2.chainId, chainId) : undefined));

    const tokenIds = [...new Set(swaps.map((swap) => swap.baseId).concat(swaps.map((swap) => swap.quoteId)))];

    const tokensData = await db.query.tokens.findMany({
      columns: {
        id: true,
        chainId: true,
        address: true,
        decimals: true,
        symbol: true,
      },
      where: and(eq(tokens.chainId, chainId), inArray(tokens.id, tokenIds)),
    });

    const tokenMap = Object.fromEntries(
      tokensData.map((token) => [token.id, { address: token.address, symbol: token.symbol, decimals: token.decimals }]),
    );

    return swaps.map((swap) => ({
      ...swap,
      base: {
        address: tokenMap[swap.baseId]?.address,
        symbol: tokenMap[swap.baseId]?.symbol,
      },
      quote: {
        address: tokenMap[swap.quoteId]?.address,
        symbol: tokenMap[swap.quoteId]?.symbol,
      },
    }));
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
