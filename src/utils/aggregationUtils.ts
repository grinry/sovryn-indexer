import { bignumber } from 'mathjs';

import { LiquidityChangesResponse, LiquidityPosition, PositionType } from 'typings/subgraph/liquidity';

export function parseRewardResult(result) {
  return {
    liqRewards: bignumber(result.liqRewards.toString()),
    baseRewards: bignumber(result.baseRewards.toString()),
    quoteRewards: bignumber(result.quoteRewards.toString()),
  };
}

export function parseAmbientTokensResult(result) {
  return {
    liq: bignumber(result.liq.toString()),
    baseQty: bignumber(result.baseQty.toString()),
    quoteQty: bignumber(result.quoteQty.toString()),
  };
}

export function parseRangeTokensResult(result) {
  return {
    liq: bignumber(result.liq.toString()),
    baseQty: bignumber(result.baseQty.toString()),
    quoteQty: bignumber(result.quoteQty.toString()),
  };
}

export function aggregatePositions(positions: LiquidityPosition[]) {
  const firstDepositTxHash = positions.reduce((acc, curr) => {
    if (!acc || new Date(curr.time) < new Date(acc.time)) {
      return curr;
    }
    return acc;
  }, positions[0]).transactionHash;

  return positions.reduce(
    (acc, curr) => ({
      ambientLiq: bignumber(acc.ambientLiq).plus(curr.ambientLiq).toString(),
      aprEst: curr.aprEst,
      time: curr.time,
      transactionHash: firstDepositTxHash,
      concLiq: bignumber(acc.concLiq).plus(curr.concLiq).toString(),
      rewardLiq: bignumber(acc.rewardLiq).plus(curr.rewardLiq).toString(),
      baseQty: bignumber(acc.baseQty).plus(curr.baseQty).toString(),
      quoteQty: bignumber(acc.quoteQty).plus(curr.quoteQty).toString(),
      aggregatedLiquidity: bignumber(acc.aggregatedLiquidity).plus(curr.aggregatedLiquidity).toString(),
      aggregatedBaseFlow: bignumber(acc.aggregatedBaseFlow).plus(curr.aggregatedBaseFlow).toString(),
      aggregatedQuoteFlow: bignumber(acc.aggregatedQuoteFlow).plus(curr.aggregatedQuoteFlow).toString(),
      positionType: PositionType.ambient,
      bidTick: curr.bidTick,
      askTick: curr.askTick,
      aprDuration: curr.aprDuration,
      aprPostLiq: curr.aprPostLiq,
      aprContributedLiq: curr.aprContributedLiq,
    }),
    {
      ambientLiq: '0',
      aprEst: '0',
      time: '0',
      transactionHash: '0',
      concLiq: '0',
      rewardLiq: '0',
      baseQty: '0',
      quoteQty: '0',
      aggregatedLiquidity: '0',
      aggregatedBaseFlow: '0',
      aggregatedQuoteFlow: '0',
      positionType: PositionType.ambient,
      bidTick: 0,
      askTick: 0,
      aprDuration: '0',
      aprPostLiq: '0',
      aprContributedLiq: '0',
    },
  );
}

export function filterPositions(
  liquidityChanges: LiquidityChangesResponse['liquidityChanges'],
  poolIdx: number,
  base: string,
  quote: string,
  positionType: PositionType,
) {
  return liquidityChanges
    .filter(
      (position) =>
        position.pool.poolIdx === poolIdx.toString() &&
        position.pool.base === base &&
        position.pool.quote === quote &&
        position.positionType === positionType,
    )
    .map((position) => ({
      ...position,
      transactionHash: position.transactionHash,
    }));
}
