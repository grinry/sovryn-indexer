import { ethers } from 'ethers';
import { bignumber } from 'mathjs';

import { SdexQuery } from 'artifacts/abis/types';
import { LiquidityChanges, LiquidityChangesResponse, PositionType } from 'typings/subgraph/liquidity';
import {
  aggregatePositions,
  filterPositions,
  netCumulativeLiquidity,
  parseAmbientTokensResult,
  parseRangeTokensResult,
  parseRewardResult,
  weightedAverageDuration,
} from 'utils/aggregationUtils';
import { calculateAPR } from 'utils/aprCalculation';

import { Chain } from './networks/chain-config';
import { getErc20Balance } from './token';

export async function getUserPositions(
  queryContract: SdexQuery,
  rpc: ethers.JsonRpcProvider,
  user: string,
  base: string,
  quote: string,
  poolIdx: number,
  liquidityChanges: LiquidityChangesResponse['liquidityChanges'],
  chain: Chain,
) {
  const concentratedPositions = filterPositions(liquidityChanges, poolIdx, base, quote, PositionType.concentrated);
  const ambientPositions = filterPositions(liquidityChanges, poolIdx, base, quote, PositionType.ambient);

  if (concentratedPositions.length === 0 && ambientPositions.length === 0) {
    return [];
  }

  const ambientMulticallData = ambientPositions.flatMap(() => [
    {
      target: queryContract.getAddress(),
      callData: queryContract.interface.encodeFunctionData('queryAmbientTokens', [user, base, quote, poolIdx]),
    },
    {
      target: queryContract.getAddress(),
      callData: queryContract.interface.encodeFunctionData('queryPoolLpTokenAddress', [base, quote, poolIdx]),
    },
  ]);

  const ambientMulticallResults = await chain.multicall.tryAggregate.staticCall(true, ambientMulticallData);

  const ambientPositionResults = await Promise.all(
    ambientPositions.map(async (userLiquidity, index) => {
      const ambientTokensResult = ambientMulticallResults[index * 2];
      const lpTokenAddressResult = ambientMulticallResults[index * 2 + 1];

      if (ambientTokensResult.success && lpTokenAddressResult.success) {
        const ambientTokens = parseAmbientTokensResult(
          queryContract.interface.decodeFunctionResult('queryAmbientTokens', ambientTokensResult.returnData),
        );
        const lpTokenAddress = queryContract.interface.decodeFunctionResult(
          'queryPoolLpTokenAddress',
          lpTokenAddressResult.returnData,
        )[0];

        const lpTokenBalance = await getErc20Balance(rpc, lpTokenAddress, user).then((balance) => balance.toString());

        const ambientLiq = bignumber(ambientTokens.liq).plus(bignumber(lpTokenBalance)).toFixed(0);
        return {
          base: base,
          quote: quote,
          ambientLiq,
          time: userLiquidity.time,
          transactionHash: userLiquidity.transactionHash,
          concLiq: '0',
          rewardLiq: '0',
          baseQty: ambientTokens.baseQty,
          quoteQty: ambientTokens.quoteQty,
          aggregatedLiquidity: userLiquidity.liq,
          aggregatedBaseFlow: userLiquidity.baseFlow,
          aggregatedQuoteFlow: userLiquidity.quoteFlow,
          positionType: userLiquidity.positionType,
          bidTick: userLiquidity.bidTick,
          askTick: userLiquidity.askTick,
          aprDuration: '0',
          aprPostLiq: '0',
          aprContributedLiq: '0',
          aprEst: '0',
        };
      }
      return null;
    }),
  );

  const aggregatedAmbientPosition = aggregatePositions(ambientPositionResults.filter(Boolean));

  // Group concentrated positions by (base, quote, poolIdx, bidTick, askTick)
  const groupedConcentratedPositions: { [key: string]: LiquidityChanges[] } = concentratedPositions.reduce(
    (acc: { [key: string]: LiquidityChanges[] }, pos) => {
      const key = `${pos.pool.base}-${pos.pool.quote}-${pos.pool.poolIdx}-${pos.bidTick}-${pos.askTick}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(pos);
      return acc;
    },
    {},
  );

  const multicallData = Object.values(groupedConcentratedPositions).flatMap((positions) => {
    const { bidTick, askTick } = positions[0];
    return [
      {
        target: queryContract.getAddress(),
        callData: queryContract.interface.encodeFunctionData('queryRangeTokens', [
          user,
          base,
          quote,
          poolIdx,
          bidTick,
          askTick,
        ]),
      },
      {
        target: queryContract.getAddress(),
        callData: queryContract.interface.encodeFunctionData('queryConcRewards', [
          user,
          base,
          quote,
          poolIdx,
          bidTick,
          askTick,
        ]),
      },
    ];
  });

  const multicallResults = await chain.multicall.tryAggregate.staticCall(true, multicallData);

  const concentratedPositionsResults = await Promise.all(
    Object.values(groupedConcentratedPositions).map(async (positions, index) => {
      const latestPosition = positions[positions.length - 1];
      const rangeTokensResult = multicallResults[index * 2];
      const rewardLiqResult = multicallResults[index * 2 + 1];

      if (rangeTokensResult.success && rewardLiqResult.success) {
        const rangeTokens = parseRangeTokensResult(
          queryContract.interface.decodeFunctionResult('queryRangeTokens', rangeTokensResult.returnData),
        );
        const rewardLiq = parseRewardResult(
          queryContract.interface.decodeFunctionResult('queryConcRewards', rewardLiqResult.returnData),
        );

        if (!bignumber(rangeTokens.liq).isZero()) {
          const apr = calculateAPR(
            true, // isConcentrated
            rewardLiq.liqRewards, // rewardLiq
            rangeTokens.liq, // concLiq
            '0', // ambientLiq
            latestPosition.bidTick, // bidTick
            latestPosition.askTick, // askTick
            weightedAverageDuration(liquidityChanges), // weightedAverageDuration
            netCumulativeLiquidity(liquidityChanges), // netCumulativeLiquidity
          );

          return {
            base: base,
            quote: quote,
            ambientLiq: '0',
            time: latestPosition.time,
            transactionHash: latestPosition.transactionHash,
            concLiq: rangeTokens.liq.toString(),
            rewardLiq: rewardLiq.liqRewards.toString(),
            baseQty: rangeTokens.baseQty.toString(),
            quoteQty: rangeTokens.quoteQty.toString(),
            aggregatedLiquidity: latestPosition.liq.toString(),
            aggregatedBaseFlow: latestPosition.baseFlow.toString(),
            aggregatedQuoteFlow: latestPosition.quoteFlow.toString(),
            positionType: latestPosition.positionType,
            bidTick: latestPosition.bidTick,
            askTick: latestPosition.askTick,
            aprDuration: apr.aprDuration,
            aprPostLiq: apr.aprPostLiq,
            aprContributedLiq: apr.aprContributedLiq,
            aprEst: apr.aprEst,
          };
        }
      }
      return null;
    }),
  );

  return [aggregatedAmbientPosition, ...concentratedPositionsResults.filter(Boolean)];
}
