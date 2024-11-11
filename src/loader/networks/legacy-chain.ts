import type { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

import { StabilityPool, StabilityPool__factory, TroveManager, TroveManager__factory } from 'artifacts/abis/types';
import { queryFromSubgraph } from 'loader/subgraph';
import { SwapsResponse } from 'typings/subgraph/liquidity';
import { loadGqlFromArtifacts } from 'utils/subgraph';

import type { Chain } from './chain-config';
import type { LegacyChainConfig } from './types';

const gqlTokens = loadGqlFromArtifacts('graphQueries/legacy/tokens.graphql');
const gqlTokenPrices = loadGqlFromArtifacts('graphQueries/legacy/token-prices.graphql');
const gqlAmmApyBlocks = loadGqlFromArtifacts('graphQueries/legacy/amm-apy-data.graphql');
const gqlSwaps = loadGqlFromArtifacts('graphQueries/legacy/swaps.graphql');

export type QueryAmmApyDataForBlock = {
  liquidityPools: {
    id: string;
    type: number;
    smartToken: { id: string };
    poolTokens: { id: string; underlyingAssets: { id: string }[] }[];
    token0: { id: string; symbol: string; decimals: number; lastPriceBtc: string; lastPriceUsd: string };
    token1: { id: string; symbol: string; decimals: number; lastPriceBtc: string; lastPriceUsd: string };
    token0Balance: string;
    token1Balance: string;
  }[];
  conversions: {
    _conversionFee: string;
    _toToken: {
      id: string;
      lastPriceBtc: string;
      lastPriceUsd: string;
    };
    emittedBy: {
      id: string;
      type: number;
      poolTokens: {
        id: string;
        underlyingAssets: {
          id: string;
        }[];
      }[];
      smartToken: {
        id: string;
      };
    };
  }[];
  liquidityMiningAllocationPoints: {
    id: string;
    allocationPoint: string;
    rewardPerBlock: string;
  }[];
};

export class LegacyChain {
  readonly nativeTokenWrapper: string;
  readonly protocolAddress: string;
  readonly babelFishMultisig: string;
  readonly babelFishStaking: string;

  readonly troveManager: TroveManager;
  readonly stabilityPool: StabilityPool;

  readonly startBlock: number;

  // todo: add contract addresses as needed such as staking, pool registries, etc.
  constructor(readonly context: Chain, readonly config: LegacyChainConfig) {
    this.startBlock = config.block;

    this.nativeTokenWrapper = config.native.toLowerCase();
    this.protocolAddress = config.protocol.toLowerCase();
    this.babelFishMultisig = (config.babelFishMultisig || '').toLowerCase();
    this.babelFishStaking = (config.babelFishStaking || '').toLowerCase();

    this.troveManager = TroveManager__factory.connect(this.config.troveManager, context.rpc);
    this.stabilityPool = StabilityPool__factory.connect(this.config.stabilityPool, context.rpc);
  }

  public queryFromSubgraph<T>(query: DocumentNode, variables: Record<string, unknown> = {}) {
    return queryFromSubgraph<T>(this.config.subgraph, query as any, variables);
  }

  public async querySwaps(block: number) {
    return this.queryFromSubgraph<SwapsResponse>(gqlSwaps, { block });
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

  public async queryTokens() {
    return this.queryFromSubgraph<{
      tokens: { id: string; name: string; symbol: string; decimals: number; lastPriceUsd: string }[];
    }>(gqlTokens);
  }

  public async queryTokenPrices(addresses: string[]) {
    return this.queryFromSubgraph<{ tokens: { id: string; symbol: string; lastPriceUsd: string }[] }>(gqlTokenPrices, {
      ids: addresses,
    });
  }

  public async queryAmmApyDataForBlock(block: number) {
    return this.queryFromSubgraph<QueryAmmApyDataForBlock>(gqlAmmApyBlocks, { block });
  }

  // subgraph limits entity count to 150k items, so we query conversions separately from liquidity pools...
  public async queryConversionFessByBlock(block: number) {
    return this.queryFromSubgraph<{ conversions: QueryAmmApyDataForBlock['conversions'] }>(
      gql`
        query ($block: Int!) {
          conversions(where: { blockNumber: $block }, block: { number: $block }) {
            _conversionFee
            _toToken {
              id
              lastPriceBtc
              lastPriceUsd
            }
            emittedBy {
              id
              type
              poolTokens {
                id
                underlyingAssets {
                  id
                }
              }
              smartToken {
                id
              }
            }
          }
        }
      `,
      { block },
    );
  }
}
