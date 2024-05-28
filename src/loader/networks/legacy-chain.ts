import type { DocumentNode } from 'graphql';

import { queryFromSubgraph } from 'loader/subgraph';

import type { Chain } from './chain-config';
import type { LegacyChainConfig } from './types';

export class LegacyChain {
  // todo: add contract addresses as needed such as staking, pool registries, etc.
  constructor(readonly context: Chain, readonly config: LegacyChainConfig) {
    //
  }

  public queryFromSubgraph<T>(query: DocumentNode, variables: Record<string, unknown> = {}) {
    return queryFromSubgraph<T>(this.config.subgraph, query as any, variables);
  }
}
