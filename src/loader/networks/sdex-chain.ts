import { ethers, ZeroAddress } from 'ethers';
import { DocumentNode } from 'graphql';
import { bignumber } from 'mathjs';

import QueryContractABI from 'artifacts/abis/SdexQuery.json';
import { Multicall, SdexQuery, SdexQuery__factory } from 'artifacts/abis/types';
import { queryFromSubgraph } from 'loader/subgraph';
import { LiquidityChangesResponse, PositionType } from 'typings/subgraph/liquidity';
import {
  aggregatePositions,
  filterPositions,
  parseAmbientTokensResult,
  parseRangeTokensResult,
  parseRewardResult,
} from 'utils/aggregationUtils';
import { loadGqlFromArtifacts } from 'utils/subgraph';

import type { Chain } from './chain-config';
import type { SdexChainConfig } from './types';

const gqlPools = loadGqlFromArtifacts('graphQueries/sdex/pools.graphql');
const gqlLiquidityChanges = loadGqlFromArtifacts('graphQueries/sdex/liqchanges.graphql');

export class SdexChain {
  readonly query: SdexQuery;
  readonly queryContract: ethers.Contract;
  readonly multicall: Multicall;
  readonly lpTokens: string[];

  constructor(readonly context: Chain, readonly config: SdexChainConfig) {
    this.query = SdexQuery__factory.connect(config.query, this.context.rpc);
    this.queryContract = new ethers.Contract(config.query, QueryContractABI, this.context.rpc);
    this.multicall = this.context.multicall;
    this.lpTokens = [];
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

  private async executeMulticall(calls: Array<{ target: string; callData: string }>) {
    const results = await this.multicall.tryAggregate.staticCall(true, calls);
    if (results[0].success && results[0].returnData) {
      return results[0].returnData;
    } else {
      throw new Error('Multicall failed or returned empty');
    }
  }

  public async queryConcRewards(
    owner: string,
    base: string,
    quote: string,
    poolIdx: number,
    lowerTick: number,
    upperTick: number,
  ) {
    this.validateInputs(owner, base, quote, poolIdx);

    const callData = this.queryContract.interface.encodeFunctionData('queryConcRewards', [
      owner,
      base,
      quote,
      poolIdx,
      lowerTick,
      upperTick,
    ]);

    const returnData = await this.executeMulticall([{ target: this.config.query, callData }]);
    const result = this.queryContract.interface.decodeFunctionResult('queryConcRewards', returnData);
    return parseRewardResult(result);
  }

  public async queryAmbientTokens(owner: string, base: string, quote: string, poolIdx: number) {
    this.validateInputs(owner, base, quote, poolIdx);

    const callData = this.queryContract.interface.encodeFunctionData('queryAmbientTokens', [
      owner,
      base,
      quote,
      poolIdx,
    ]);
    const returnData = await this.executeMulticall([{ target: this.config.query, callData }]);
    const result = this.queryContract.interface.decodeFunctionResult('queryAmbientTokens', returnData);
    return parseAmbientTokensResult(result);
  }

  public async queryRangeTokens(
    owner: string,
    base: string,
    quote: string,
    poolIdx: number,
    lowTick: number,
    upperTick: number,
  ) {
    this.validateInputs(owner, base, quote, poolIdx);

    const callData = this.queryContract.interface.encodeFunctionData('queryRangeTokens', [
      owner,
      base,
      quote,
      poolIdx,
      lowTick,
      upperTick,
    ]);

    const returnData = await this.executeMulticall([{ target: this.config.query, callData }]);
    const result = this.queryContract.interface.decodeFunctionResult('queryRangeTokens', returnData);
    return parseRangeTokensResult(result);
  }

  private validateInputs(owner: string, base: string, quote: string, poolIdx: number) {
    if (!owner || !base || !quote || poolIdx < 0) {
      throw new Error('Invalid inputs');
    }
  }

  private async getLPTokenBalance(user: string, baseToken: string): Promise<string> {
    if (baseToken === ZeroAddress) {
      const balance = await this.context.rpc.getBalance(user);
      return balance.toString();
    } else {
      const LPContract = new ethers.Contract(
        baseToken,
        ['function balanceOf(address) view returns (uint256)'],
        this.context.rpc,
      );
      const balance = await LPContract.balanceOf(user);
      return balance.toString();
    }
  }

  private async updateLPTokens(baseToken: string, quoteToken: string) {
    if (!this.lpTokens.includes(baseToken)) {
      this.lpTokens.push(baseToken);
    }
    if (!this.lpTokens.includes(quoteToken)) {
      this.lpTokens.push(quoteToken);
    }
  }

  public async getUpdatedLiquidity(user: string, base: string, quote: string, poolIdx: number) {
    const { liquidityChanges } = await this.queryUserPositions(user);

    const concentratedPositions = filterPositions(liquidityChanges, poolIdx, base, quote, PositionType.concentrated);
    const ambientPositions = filterPositions(liquidityChanges, poolIdx, base, quote, PositionType.ambient);

    if (concentratedPositions.length === 0 && ambientPositions.length === 0) {
      return null;
    }

    await this.updateLPTokens(base, quote);

    const ambientPositionResults = await Promise.all(
      ambientPositions.map(async (userLiquidity) => {
        const ambientTokens = await this.queryAmbientTokens(user, base, quote, poolIdx);
        const [lpTokenBalanceBase, lpTokenBalanceQuote] = await Promise.all([
          this.getLPTokenBalance(user, base),
          this.getLPTokenBalance(user, quote),
        ]);
        const ambientLiq = bignumber(ambientTokens.liq)
          .plus(bignumber(lpTokenBalanceBase))
          .plus(bignumber(lpTokenBalanceQuote))
          .toString();

        return {
          ambientLiq,
          concLiq: '0',
          rewardLiq: '0',
          baseQty: ambientTokens.baseQty.toString(),
          quoteQty: ambientTokens.quoteQty.toString(),
          aggregatedLiquidity: userLiquidity.liq,
          aggregatedBaseFlow: userLiquidity.baseFlow,
          aggregatedQuoteFlow: userLiquidity.quoteFlow,
          positionType: userLiquidity.positionType,
        };
      }),
    );

    const aggregatedAmbientPosition = aggregatePositions(ambientPositionResults);

    const concentratedPositionsResults = await Promise.all(
      concentratedPositions.map(async (userLiquidity) => {
        const { bidTick, askTick } = userLiquidity;
        const [rangeTokens, rewardLiq] = await Promise.all([
          this.queryRangeTokens(user, base, quote, poolIdx, bidTick, askTick),
          this.queryConcRewards(user, base, quote, poolIdx, bidTick, askTick),
        ]);

        if (!bignumber(rangeTokens.liq).isZero()) {
          return {
            ambientLiq: '0',
            concLiq: rangeTokens.liq.toString(),
            rewardLiq: rewardLiq.liqRewards.toString(),
            baseQty: rangeTokens.baseQty.toString(),
            quoteQty: rangeTokens.quoteQty.toString(),
            aggregatedLiquidity: userLiquidity.liq.toString(),
            aggregatedBaseFlow: userLiquidity.baseFlow.toString(),
            aggregatedQuoteFlow: userLiquidity.quoteFlow.toString(),
            positionType: userLiquidity.positionType,
          };
        }
        return null;
      }),
    );

    const activePositionResults = concentratedPositionsResults.filter((result) => result !== null);

    return [aggregatedAmbientPosition, ...activePositionResults].filter(Boolean);
  }

  toString() {
    return this.context.chainId;
  }
}
