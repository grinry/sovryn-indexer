import { and, eq, inArray } from 'drizzle-orm';
import _ from 'lodash';

import { db } from 'database/client';
import { Pool, tokens } from 'database/schema';
import { networks } from 'loader/networks';
import { chainIdFromHex } from 'loader/networks/utils';

type PoolStats = {
  latestTime: number;
  baseTvl: number;
  quoteTvl: number;
  baseVolume: number;
  quoteVolume: number;
  baseFees: number;
  quoteFees: number;
  lastPriceSwap: number;
  lastPriceLiq: number;
  lastPriceIndic: number;
  feeRate: number;
};

export async function markTokensAsSwapable(pool: Pool[]) {
  const tokenIds = _.uniq(pool.flatMap((p) => [p.baseId, p.quoteId]));
  await db
    .update(tokens)
    .set({ swapableSince: new Date() })
    .where(and(inArray(tokens.id, tokenIds), eq(tokens.swapableSince, null)));
}

export async function getPoolStats(chainId: string, base: string, quote: string, poolIdx: number): Promise<PoolStats> {
  const baseUrl = networks.getByChainId(chainIdFromHex(chainId)).sdex.graphCacheUrl;
  return fetch(`${baseUrl}/pool_stats?chainId=${chainId}&base=${base}&quote=${quote}&poolIdx=${poolIdx}`)
    .then((res) => res.json())
    .then((data) => data.data satisfies PoolStats);
}
