import { desc, eq } from 'drizzle-orm';

import { db } from 'database/client';
import { ammApyBlocks, tokens } from 'database/schema';

interface AmmApyBlock {
  chainId: number;
  poolToken: string;
  blockTimestamp: number;
  block: number;
  pool: string;
  balanceBtc: string;
  conversionFeeBtc: string;
  rewards: string;
  rewardsCurrency: string;
  rewardsBtc: string;
}

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

  createBlockRow: async (data: AmmApyBlock) => {
    const token = await db.query.tokens.findFirst({
      columns: {
        id: true,
      },
      where: eq(tokens.address, data.poolToken),
    });
    return db
      .insert(ammApyBlocks)
      .values({
        chainId: data.chainId,
        tokenId: token.id,
        block: data.block,
        blockTimestamp: new Date(data.blockTimestamp * 1000),
        pool: data.pool,
        balanceBtc: data.balanceBtc,
        conversionFeeBtc: data.conversionFeeBtc,
        rewards: data.rewards,
        rewardsCurrency: data.rewardsCurrency,
        rewardsBtc: data.rewardsBtc,
      })
      .onConflictDoNothing({
        target: [ammApyBlocks.chainId, ammApyBlocks.pool, ammApyBlocks.block],
      })
      .execute();
  },
};
