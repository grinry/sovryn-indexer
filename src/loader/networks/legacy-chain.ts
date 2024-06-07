import type { DocumentNode } from 'graphql';

import { queryFromSubgraph } from 'loader/subgraph';
import { loadGqlFromArtifacts } from 'utils/subgraph';

import type { Chain } from './chain-config';
import type { LegacyChainConfig } from './types';

const gqlTokens = loadGqlFromArtifacts('graphQueries/legacy/tokens.graphql');
const gqlTokenPrices = loadGqlFromArtifacts('graphQueries/legacy/token-prices.graphql');

export class LegacyChain {
  readonly nativeTokenWrapper: string;
  // todo: add contract addresses as needed such as staking, pool registries, etc.
  constructor(readonly context: Chain, readonly config: LegacyChainConfig) {
    this.nativeTokenWrapper = config.native.toLowerCase();
  }

  public queryFromSubgraph<T>(query: DocumentNode, variables: Record<string, unknown> = {}) {
    return queryFromSubgraph<T>(this.config.subgraph, query as any, variables);
  }

  public async queryTokens() {
    return this.queryFromSubgraph<{
      tokens: { id: string; name: string; symbol: string; decimals: number; lastPriceUsd: string }[];
    }>(gqlTokens);
  }

  public async queryTokenPrices(addresses: string[]) {
    return this.queryFromSubgraph<{ tokens: { id: string; lastPriceUsd: string }[] }>(gqlTokenPrices, {
      ids: addresses,
    });
  }
}
