import dayjs from 'dayjs';
import { ethers } from 'ethers';
import { bignumber } from 'mathjs';

import { SdexQuery } from 'artifacts/abis/types';
import { LiquidityChanges, LiquidityChangesResponse, PositionType } from 'typings/subgraph/liquidity';
import {
  aggregatePositions,
  parseAmbientTokensResult,
  parseRangeTokensResult,
  parseRewardResult,
  weightedAverageDuration,
  netCumulativeLiquidity,
} from 'utils/aggregationUtils';
import { calculateAPR } from 'utils/aprCalculation';

import { Chain } from './networks/chain-config';
import { getErc20Balance } from './token';

// Helper for Multicall
async function executeMulticall(chain: Chain, calls: any[]) {
  const results = await chain.multicall.tryAggregate.staticCall(true, calls);
  return results.map((result, index) => ({
    success: result.success,
    data: result.success ? result.returnData : null,
    index,
  }));
}

// Helper to fetch and process ambient positions
async function processAmbientPositions(
  queryContract: SdexQuery,
  rpc: ethers.JsonRpcProvider,
  ambientPositions: LiquidityChanges[],
  chain: Chain,
) {
  if (!ambientPositions.length) return [];

  const multicallData = ambientPositions.flatMap((position) => [
    {
      target: queryContract.getAddress(),
      callData: queryContract.interface.encodeFunctionData('queryAmbientTokens', [
        position.user,
        position.pool.base,
        position.pool.quote,
        position.pool.poolIdx,
      ]),
    },
    {
      target: queryContract.getAddress(),
      callData: queryContract.interface.encodeFunctionData('queryPoolLpTokenAddress', [
        position.pool.base,
        position.pool.quote,
        position.pool.poolIdx,
      ]),
    },
  ]);

  const multicallResults = await executeMulticall(chain, multicallData);

  return await Promise.all(
    ambientPositions.map(async (position, index) => {
      const tokensResult = multicallResults[index * 2];
      const lpTokenResult = multicallResults[index * 2 + 1];

      if (tokensResult.success && lpTokenResult.success) {
        const ambientTokens = parseAmbientTokensResult(
          queryContract.interface.decodeFunctionResult('queryAmbientTokens', tokensResult.data),
        );
        const lpTokenAddress = queryContract.interface.decodeFunctionResult(
          'queryPoolLpTokenAddress',
          lpTokenResult.data,
        )[0];
        const lpTokenBalance = await getErc20Balance(rpc, lpTokenAddress, position.user);

        return {
          ...position,
          ambientLiq: bignumber(ambientTokens.liq).plus(bignumber(lpTokenBalance)).toFixed(0),
          baseQty: ambientTokens.baseQty,
          quoteQty: ambientTokens.quoteQty,
          base: position.pool.base,
          quote: position.pool.quote,
          concLiq: '0',
          rewardLiq: '0',
          aggregatedLiquidity: '0',
          aggregatedBaseFlow: '0',
          aggregatedQuoteFlow: '0',
          positionType: PositionType.ambient,
          bidTick: 0,
          askTick: 0,
          aprDuration: '0',
          aprPostLiq: '0',
          aprContributedLiq: '0',
          aprEst: '0',
        };
      }
      return null;
    }),
  );
}

// Helper to fetch and process concentrated positions
async function processConcentratedPositions(
  queryContract: SdexQuery,
  groupedConcentratedPositions: { [key: string]: LiquidityChanges[] },
  liquidityChanges: LiquidityChangesResponse['liquidityChanges'],
  chain: Chain,
) {
  const multicallData = Object.values(groupedConcentratedPositions).flatMap((positions) => {
    const { bidTick, askTick, user, pool } = positions[0];
    return [
      {
        target: queryContract.getAddress(),
        callData: queryContract.interface.encodeFunctionData('queryRangeTokens', [
          user,
          pool.base,
          pool.quote,
          pool.poolIdx,
          bidTick,
          askTick,
        ]),
      },
      {
        target: queryContract.getAddress(),
        callData: queryContract.interface.encodeFunctionData('queryConcRewards', [
          user,
          pool.base,
          pool.quote,
          pool.poolIdx,
          bidTick,
          askTick,
        ]),
      },
    ];
  });

  const multicallResults = await executeMulticall(chain, multicallData);

  return await Promise.all(
    Object.values(groupedConcentratedPositions).map(async (positions, index) => {
      const latestPosition = positions[positions.length - 1];
      const tokensResult = multicallResults[index * 2];
      const rewardsResult = multicallResults[index * 2 + 1];

      if (tokensResult.success && rewardsResult.success) {
        const rangeTokens = parseRangeTokensResult(
          queryContract.interface.decodeFunctionResult('queryRangeTokens', tokensResult.data),
        );
        const rewardLiq = parseRewardResult(
          queryContract.interface.decodeFunctionResult('queryConcRewards', rewardsResult.data),
        );

        const apr = calculateAPR(
          true,
          rewardLiq.liqRewards,
          rangeTokens.liq,
          '0',
          latestPosition.bidTick,
          latestPosition.askTick,
          weightedAverageDuration(liquidityChanges),
          netCumulativeLiquidity(liquidityChanges),
        );

        return {
          ...latestPosition,
          concLiq: rangeTokens.liq.toString(),
          rewardLiq: rewardLiq.liqRewards.toString(),
          baseQty: rangeTokens.baseQty.toString(),
          quoteQty: rangeTokens.quoteQty.toString(),
          aprEst: apr.aprEst,
        };
      }
      return null;
    }),
  );
}

export async function getUserPositions(
  queryContract: SdexQuery,
  rpc: ethers.JsonRpcProvider,
  liquidityChanges: LiquidityChangesResponse['liquidityChanges'],
  chain: Chain,
) {
  const { ambientPositions, concentratedPositions } = liquidityChanges.reduce(
    (acc, change) => {
      if (change.positionType === PositionType.ambient) acc.ambientPositions.push(change);
      else acc.concentratedPositions.push(change);
      return acc;
    },
    { ambientPositions: [], concentratedPositions: [] },
  );

  const processedAmbient = await processAmbientPositions(queryContract, rpc, ambientPositions, chain);
  const groupedConcentrated = concentratedPositions.reduce((acc, pos) => {
    const key = `${pos.pool.base}-${pos.pool.quote}-${pos.pool.poolIdx}-${pos.bidTick}-${pos.askTick}`;
    acc[key] = acc[key] || [];
    acc[key].push(pos);
    return acc;
  }, {} as Record<string, LiquidityChanges[]>);

  const processedConcentrated = await processConcentratedPositions(
    queryContract,
    groupedConcentrated,
    liquidityChanges,
    chain,
  );

  return [aggregatePositions(processedAmbient), ...processedConcentrated.filter(Boolean)];
}

export async function getPositions(
  queryContract: SdexQuery,
  rpc: ethers.JsonRpcProvider,
  liquidityChanges: LiquidityChangesResponse['liquidityChanges'],
  chain: Chain,
) {
  const { ambientPositions, concentratedPositions } = liquidityChanges.reduce(
    (acc, change) => {
      if (change.positionType === PositionType.ambient) acc.ambientPositions.push(change);
      else acc.concentratedPositions.push(change);
      return acc;
    },
    { ambientPositions: [], concentratedPositions: [] },
  );
  // Process ambient positions
  const processedAmbient = await processAmbientPositions(queryContract, rpc, ambientPositions, chain);

  // Group concentrated positions by key
  const groupedConcentrated = concentratedPositions.reduce((acc, pos) => {
    const key = `${pos.pool.base}-${pos.pool.quote}-${pos.pool.poolIdx}-${pos.bidTick}-${pos.askTick}`;
    acc[key] = acc[key] || [];
    acc[key].push(pos);
    return acc;
  }, {} as Record<string, LiquidityChanges[]>);

  // Process concentrated positions
  const processedConcentrated = await processConcentratedPositions(
    queryContract,
    groupedConcentrated,
    liquidityChanges,
    chain,
  );

  // Combine results and return
  return [...processedAmbient.filter(Boolean), ...processedConcentrated.filter(Boolean)];
}
