import dayjs from 'dayjs';
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

  if (!ambientPositions.length || ambientPositions[0].liq === '0') {
    // If there are no ambient positions, try checking for LP tokens...
    const lpTokenAddress = await queryContract.queryPoolLpTokenAddress(base, quote, poolIdx);
    const lpTokenBalance = await getErc20Balance(rpc, lpTokenAddress, user).then((balance) => balance.toString());

    if (bignumber(lpTokenBalance).gt(0)) {
      ambientPositions.push({
        id: '',
        changeType: 'mint',
        transactionHash: '',
        callIndex: 0,
        user,
        pool: {
          base,
          quote,
          poolIdx: poolIdx.toString(),
        },
        block: '',
        time: dayjs().unix().toString(),
        positionType: PositionType.ambient,
        liqChange: lpTokenBalance,
        resetRewards: '',
        timeFirstMint: '',
        bidTick: 0,
        askTick: 0,
        isBid: false,
        liq: lpTokenBalance,
        baseFlow: '0',
        quoteFlow: '0',
        pivotTime: null,
        aprDuration: '0',
        aprPostLiq: '0',
        aprContributedLiq: '0',
        aprEst: '0',
      });
    }
  }

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

        // first call
        // return [concentratedPositionsResults] -> balanceTable
        // [new concentratedPositions] ->
      }
      return null;
    }),
  );

  return [aggregatedAmbientPosition, ...concentratedPositionsResults.filter(Boolean)];
}

export async function getPositions(
  queryContract: SdexQuery,
  rpc: ethers.JsonRpcProvider,
  liquidityChanges: LiquidityChangesResponse['liquidityChanges'],
  chain: Chain,
) {
  const concentratedPositions = liquidityChanges.filter(
    (liquidityChange) => liquidityChange.positionType === PositionType.concentrated,
  );
  const ambientPositions = liquidityChanges.filter(
    (liquidityChange) => liquidityChange.positionType === PositionType.ambient,
  );

  const ambientMulticallData = ambientPositions.flatMap((position) => [
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

        const lpTokenBalance = await getErc20Balance(rpc, lpTokenAddress, userLiquidity.user).then((balance) =>
          balance.toString(),
        );

        const ambientLiq = bignumber(ambientTokens.liq).plus(bignumber(lpTokenBalance)).toFixed(0);

        return {
          user: userLiquidity.user,
          base: userLiquidity.pool.base,
          quote: userLiquidity.pool.quote,
          poolIdx: userLiquidity.pool.poolIdx,
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
            base: latestPosition.pool.base,
            quote: latestPosition.pool.quote,
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

        // first call
        // return [concentratedPositionsResults] -> balanceTable
        // [new concentratedPositions] ->
      }
      return null;
    }),
  );

  console.log({
    ambientPositionResults,
    concentratedPositionsResults,
  });
}
