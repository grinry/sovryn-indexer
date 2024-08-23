import { DocumentNode } from 'graphql';

import { queryFromSubgraph } from 'loader/subgraph';
import { loadGqlFromArtifacts } from 'utils/subgraph';

import type { Chain } from './chain-config';
import type { LiquidityChainConfig } from './types';

const gqlLiquidityTokens = loadGqlFromArtifacts('graphQueries/liquidity/tokens.graphql');
const gqlTokenPrices = loadGqlFromArtifacts('graphQueries/liquidity/token-prices.graphql');
export class LiquidityChain {
  constructor(readonly context: Chain, readonly config: LiquidityChainConfig) {}

  public queryFromSubgraph<T>(query: DocumentNode, variables: Record<string, unknown> = {}) {
    return queryFromSubgraph<T>(this.config.subgraph, query, variables);
  }

  public async queryLiquidityTokens() {
    return this.queryFromSubgraph<{ tokens: { id: string; symbol: string; name: string; decimals: number }[] }>(
      gqlLiquidityTokens,
    );
  }
  public async queryTokenPrices() {
    return this.queryFromSubgraph<{
      lbpairs: {
        tokenX: { id: string; symbol: string; name: string; decimals: number };
        tokenY: { id: string; symbol: string; name: string; decimals: number };
        tokenXPriceUSD: string;
        tokenYPriceUSD: string;
      }[];
    }>(gqlTokenPrices);
  }

  toString() {
    return this.context.chainId;
  }
}
