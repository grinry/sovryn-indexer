import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

import { queryFromSubgraph } from 'loader/subgraph';
import { BinsResponse } from 'typings/subgraph/liquidity';
import { loadGqlFromArtifacts } from 'utils/subgraph';

import type { Chain } from './chain-config';
import type { LiquidityChainConfig } from './types';

const gqlLiquidityTokens = loadGqlFromArtifacts('graphQueries/liquidity/tokens.graphql');
const gqlTokenPrices = loadGqlFromArtifacts('graphQueries/liquidity/token-prices.graphql');
const gqlBins = loadGqlFromArtifacts('graphQueries/liquidity/bin-liquidities.graphql');

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

  public async queryBins(minTime: number, maxTime: number) {
    return this.queryFromSubgraph<BinsResponse>(gqlBins, { minTime, maxTime });
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
