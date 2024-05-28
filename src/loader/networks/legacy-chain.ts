import { queryFromSubgraph } from 'loader/subgraph';

import type { Chain } from './chain-config';
import type { LegacyChainConfig } from './types';

export class LegacyChain {
  // todo: add contract addresses as needed such as staking, pool registries, etc.
  constructor(readonly context: Chain, readonly config: LegacyChainConfig) {
    //
  }

  public queryFromSubgraph<T>(query: string, startTime: number, endTime: number, isAsc = true) {
    return queryFromSubgraph<T>(this.config.subgraph, query, startTime, endTime, isAsc);
  }
}
