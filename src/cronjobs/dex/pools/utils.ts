import { and, eq, inArray } from 'drizzle-orm';
import _ from 'lodash';

import { db } from 'database/client';
import { Pool, tokens } from 'database/schema';

export const markTokensAsSwapable = async (pool: Pool[]) => {
  const tokenIds = _.uniq(pool.flatMap((p) => [p.baseId, p.quoteId]));
  await db
    .update(tokens)
    .set({ swapableSince: new Date() })
    .where(and(inArray(tokens.id, tokenIds), eq(tokens.swapableSince, null)));
};
