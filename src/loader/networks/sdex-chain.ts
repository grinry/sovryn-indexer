import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

import { SdexQuery, SdexQuery__factory, SdexSwapDex, SdexSwapDex__factory } from 'artifacts/abis/types';
import { queryFromSubgraph } from 'loader/subgraph';
import { getUserPositions } from 'loader/userPositionsLoader';
import { LiquidityChangesResponse, SwapsResponse } from 'typings/subgraph/liquidity';
import { loadGqlFromArtifacts } from 'utils/subgraph';

import type { Chain } from './chain-config';
import type { SdexChainConfig } from './types';

const gqlPools = loadGqlFromArtifacts('graphQueries/sdex/pools.graphql');
const gqlLiquidityChanges = loadGqlFromArtifacts('graphQueries/sdex/liqchanges.graphql');
const gqlSwaps = loadGqlFromArtifacts('graphQueries/sdex/swaps.graphql');

export class SdexChain {
  readonly dex: SdexSwapDex;
  readonly query: SdexQuery;
  readonly graphCacheUrl: string;

  readonly startBlock: number;

  constructor(readonly context: Chain, readonly config: SdexChainConfig) {
    this.startBlock = config.block;
    this.dex = SdexSwapDex__factory.connect(config.dex, this.context.rpc);
    this.query = SdexQuery__factory.connect(config.query, this.context.rpc);

    this.graphCacheUrl = config.graphcache;
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
    }>(gqlPools, { limit });
  }

  public async queryUserPositions(user: string) {
    return this.queryFromSubgraph<LiquidityChangesResponse>(gqlLiquidityChanges, { user });
  }

  public async querySwaps(minTime: number, maxTime: number) {
    return this.queryFromSubgraph<SwapsResponse>(gqlSwaps, { minTime, maxTime });
  }

  public async getUpdatedLiquidity(user: string, base: string, quote: string, poolIdx: number) {
    const { liquidityChanges } = await this.queryUserPositions(user);
    return getUserPositions(this.query, this.context.rpc, user, base, quote, poolIdx, liquidityChanges, this.context);
  }

  public async queryBlockNumber() {
    return this.queryFromSubgraph<{ _meta: { block: { number: number } } }>(
      gql`
        {
          _meta {
            block {
              number
            }
          }
        }
      `,
    ).then((data) => data._meta.block.number);
  }

  toString() {
    return this.context.chainId;
  }
}
