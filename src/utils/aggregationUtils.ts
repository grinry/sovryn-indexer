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
  return positions.reduce(
    (acc, curr) => ({
      ambientLiq: bignumber(acc.ambientLiq).plus(curr.ambientLiq).toString(),
      concLiq: bignumber(acc.concLiq).plus(curr.concLiq).toString(),
      rewardLiq: bignumber(acc.rewardLiq).plus(curr.rewardLiq).toString(),
      baseQty: bignumber(acc.baseQty).plus(curr.baseQty).toString(),
      quoteQty: bignumber(acc.quoteQty).plus(curr.quoteQty).toString(),
      aggregatedLiquidity: bignumber(acc.aggregatedLiquidity).plus(curr.aggregatedLiquidity).toString(),
      aggregatedBaseFlow: bignumber(acc.aggregatedBaseFlow).plus(curr.aggregatedBaseFlow).toString(),
      aggregatedQuoteFlow: bignumber(acc.aggregatedQuoteFlow).plus(curr.aggregatedQuoteFlow).toString(),
      positionType: PositionType.ambient,
    }),
    {
      ambientLiq: '0',
      concLiq: '0',
      rewardLiq: '0',
      baseQty: '0',
      quoteQty: '0',
      aggregatedLiquidity: '0',
      aggregatedBaseFlow: '0',
      aggregatedQuoteFlow: '0',
      positionType: PositionType.ambient,
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
  return liquidityChanges.filter(
    (position) =>
      position.pool.poolIdx === poolIdx.toString() &&
      position.pool.base === base &&
      position.pool.quote === quote &&
      position.positionType === positionType,
  );
}
