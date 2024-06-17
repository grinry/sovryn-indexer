import type { DocumentNode } from 'graphql';

import { SdexQuery, SdexQuery__factory } from 'artifacts/abis/types';
import { queryFromSubgraph } from 'loader/subgraph';
import { LiquidityChangesResponse } from 'typings/subgraph/liquidity';
import { loadGqlFromArtifacts } from 'utils/subgraph';

import type { Chain } from './chain-config';
import type { SdexChainConfig } from './types';

const gglPools = loadGqlFromArtifacts('graphQueries/sdex/pools.graphql');
const qqlLiquidityChanges = loadGqlFromArtifacts('graphQueries/sdex/liqchanges.graphql');
export class SdexChain {
  readonly query: SdexQuery;
  // todo: add impact

  constructor(readonly context: Chain, readonly config: SdexChainConfig) {
    this.query = SdexQuery__factory.connect(config.query, this.context.rpc);
  }

  public queryFromSubgraph<T>(query: DocumentNode, variables: Record<string, unknown> = {}) {
    return queryFromSubgraph<T>(this.config.subgraph, query, variables);
  }

  public async queryPools(limit: number) {
    return this.queryFromSubgraph<{
      pools: {
        base: string;
        quote: string;
        poolIdx: number;
      }[];
    }>(gglPools, { limit });
  }

  public async queryUserPositions(user: string) {
    return this.queryFromSubgraph<LiquidityChangesResponse>(qqlLiquidityChanges, { user });
  }

  toString() {
    return this.context.chainId;
  }
}
