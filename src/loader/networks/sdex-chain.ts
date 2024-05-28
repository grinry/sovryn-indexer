import type { DocumentNode } from 'graphql';

import { SdexQuery, SdexQuery__factory } from 'artifacts/abis/types';
import { queryFromSubgraph } from 'loader/subgraph';

import type { Chain } from './chain-config';
import type { SdexChainConfig } from './types';

export class SdexChain {
  readonly query: SdexQuery;
  // todo: add impact

  constructor(readonly context: Chain, readonly config: SdexChainConfig) {
    this.query = SdexQuery__factory.connect(config.query, this.context.rpc);
  }

  public queryFromSubgraph<T>(query: DocumentNode, variables: Record<string, unknown> = {}) {
    return queryFromSubgraph<T>(this.config.subgraph, query, variables);
  }
}
