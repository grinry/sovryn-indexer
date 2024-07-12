import { bignumber } from 'mathjs';

import {
  LiquidityChangesResponse,
  LiquidityChanges,
  LiquidityPosition,
  PositionType,
} from 'typings/subgraph/liquidity';

import { areAddressesEqual } from './compare';

const MIN_NUMERIC_STABLE_FLOW = 1e-9;

export function netCumulativeLiquidity(hist: LiquidityChanges[]): number {
  let totalLiq = 0;
  hist.forEach((delta) => {
    totalLiq += parseFloat(delta.liqChange);
  });
  return totalLiq < MIN_NUMERIC_STABLE_FLOW ? 0 : totalLiq;
}

export function weightedAverageDuration(hist: LiquidityChanges[]): number {
  const present = Date.now() / 1000;
  const past = weightedAverageTime(hist);
  return present - past;
}

function weightedAverageTime(hist: LiquidityChanges[]): number {
  let openLiq = 0;
  let openTime = 0;

  hist.forEach((delta) => {
    const liqChange = parseFloat(delta.liqChange);
    const time = parseFloat(delta.time);

    if (delta.resetRewards) {
      openTime = time;
    }

    if (liqChange < 0) {
      openLiq += liqChange;
      if (openLiq < 0 || openLiq < MIN_NUMERIC_STABLE_FLOW) {
        openLiq = 0;
      }
    }

    if (liqChange > 0) {
      const weight = openLiq / (openLiq + liqChange);
      openTime = openTime * weight + time * (1.0 - weight);
    }

    if (liqChange === 0 && openLiq === 0) {
      openTime = time;
    }
  });

  return openTime;
}

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
  const firstDepositTxHash =
    positions.reduce((acc, curr) => {
      if (!acc || new Date(curr.time) < new Date(acc.time)) {
        return curr;
      }
      return acc;
    }, positions[0])?.transactionHash || '';

  return positions.reduce(
    (acc, curr) => ({
      base: curr.base,
      quote: curr.quote,
      ambientLiq: bignumber(acc.ambientLiq).plus(curr.ambientLiq).toString(),
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
      aprEst: curr.aprEst,
    }),
    {
      base: '',
      quote: '',
      ambientLiq: '0',
      time: '0',
      transactionHash: '',
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
      aprEst: '0',
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
        parseInt(position.pool.poolIdx) === parseInt(poolIdx.toString()) &&
        areAddressesEqual(position.pool.base, base) &&
        areAddressesEqual(position.pool.quote, quote) &&
        position.positionType === positionType,
    )
    .map((position) => ({
      ...position,
      transactionHash: position.transactionHash,
    }));
}
