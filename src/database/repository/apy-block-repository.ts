import { desc, eq } from 'drizzle-orm';

import { db } from 'database/client';
import { ammApyBlocks, NewAmmApyBlock, tokens } from 'database/schema';

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

  createBlockRow: (data: NewAmmApyBlock[]) =>
    db
      .insert(ammApyBlocks)
      .values(data)
      .onConflictDoNothing({
        target: [ammApyBlocks.chainId, ammApyBlocks.pool, ammApyBlocks.block],
      }),
};
