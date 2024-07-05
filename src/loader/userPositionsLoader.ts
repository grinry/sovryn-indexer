import { ethers } from 'ethers';
import { bignumber } from 'mathjs';

import { SdexQuery } from 'artifacts/abis/types';
import { LiquidityChangesResponse, PositionType } from 'typings/subgraph/liquidity';
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
    return null;
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

  const multicallData = concentratedPositions.flatMap((userLiquidity) => {
    const { bidTick, askTick } = userLiquidity;
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
    concentratedPositions.map(async (userLiquidity, index) => {
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
            userLiquidity.bidTick, // bidTick
            userLiquidity.askTick, // askTick
            weightedAverageDuration(liquidityChanges), // weightedAverageDuration
            netCumulativeLiquidity(liquidityChanges), // netCumulativeLiquidity
          );

          return {
            ambientLiq: '0',
            time: userLiquidity.time,
            transactionHash: userLiquidity.transactionHash,
            concLiq: rangeTokens.liq.toString(),
            rewardLiq: rewardLiq.liqRewards.toString(),
            baseQty: rangeTokens.baseQty.toString(),
            quoteQty: rangeTokens.quoteQty.toString(),
            aggregatedLiquidity: userLiquidity.liq.toString(),
            aggregatedBaseFlow: userLiquidity.baseFlow.toString(),
            aggregatedQuoteFlow: userLiquidity.quoteFlow.toString(),
            positionType: userLiquidity.positionType,
            bidTick: userLiquidity.bidTick,
            askTick: userLiquidity.askTick,
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
