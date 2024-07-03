import { ethers } from 'ethers';
import { bignumber } from 'mathjs';

interface APRCalcResult {
  aprDuration: string;
  aprPostLiq: string;
  aprContributedLiq: string;
  aprEst: string;
}

export function calculateAPR(
  isConcentrated: boolean,
  rewardLiq: string,
  concLiq: string,
  ambientLiq: string,
  bidTick: number,
  askTick: number,
  weightedAverageDuration: number,
  netCumulativeLiquidity: number,
): APRCalcResult {
  const numerator = aprNumerator(isConcentrated, rewardLiq, concLiq, ambientLiq, bidTick, askTick);
  const denom = aprDenominator(isConcentrated, concLiq, netCumulativeLiquidity);
  const time = weightedAverageDuration;
  const apy = normalizeApr(numerator, denom, time);
  const aprPostLiqIntString = convertFloatToIntString(numerator);
  const aprContributedLiqIntString = convertFloatToIntString(denom);

  return {
    aprDuration: time.toString(),
    aprPostLiq: aprPostLiqIntString,
    aprContributedLiq: aprContributedLiqIntString,
    aprEst: apy.toString(),
  };
}

function aprNumerator(
  isConcentrated: boolean,
  rewardLiq: string,
  concLiq: string,
  ambientLiq: string,
  bidTick: number,
  askTick: number,
): number {
  if (isConcentrated) {
    const amplFactor = estLiqAmplification(bidTick, askTick);
    return amplFactor * castBigToFloat(rewardLiq) + castBigToFloat(concLiq);
  } else {
    return castBigToFloat(ambientLiq);
  }
}

function aprDenominator(isConcentrated: boolean, concLiq: string, netCumulativeLiquidity: number): number {
  if (isConcentrated) {
    return castBigToFloat(concLiq);
  } else {
    return netCumulativeLiquidity;
  }
}

const MAX_APR_CAP = 10.0;

function normalizeApr(num: number, denom: number, time: number): number {
  if (denom === 0 || time === 0) {
    return 0.0;
  }

  const growth = num / denom;
  const timeInYears = time / (3600 * 24 * 365);
  const compounded = Math.pow(1 + growth, 1 / timeInYears) - 1;

  if (compounded < 0.0) {
    return 0.0;
  } else if (compounded > MAX_APR_CAP) {
    return MAX_APR_CAP;
  }
  return compounded;
}

function castBigToFloat(liq: string): number {
  const bigNumber = bignumber(liq).toString();
  const floatVal = ethers.formatUnits(bigNumber, 18);
  return parseFloat(floatVal);
}

function convertFloatToIntString(value: number): string {
  const multiplier = Math.pow(10, 18);
  const intValue = Math.floor(value * multiplier);
  return intValue.toString();
}

function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

function estLiqAmplification(bidTick: number, askTick: number): number {
  const midTick = (bidTick + askTick) / 2;
  const bidPrice = Math.sqrt(tickToPrice(bidTick));
  const midPrice = Math.sqrt(tickToPrice(midTick));
  return midPrice / (midPrice - bidPrice);
}
