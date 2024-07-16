import { ethers } from 'ethers';
import { BigNumber, bignumber, pow } from 'mathjs';

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
): BigNumber {
  if (isConcentrated) {
    const amplFactor = estLiqAmplification(bidTick, askTick);
    return amplFactor.mul(castBigToFloat(rewardLiq).add(castBigToFloat(concLiq)));
  } else {
    return castBigToFloat(ambientLiq);
  }
}

function aprDenominator(isConcentrated: boolean, concLiq: string, netCumulativeLiquidity: number): BigNumber {
  if (isConcentrated) {
    return castBigToFloat(concLiq);
  } else {
    if (isNaN(netCumulativeLiquidity) || !isFinite(netCumulativeLiquidity)) {
      return bignumber(0);
    }
    return bignumber(netCumulativeLiquidity);
  }
}

const MAX_APR_CAP = 10.0;

function normalizeApr(num: BigNumber, denom: BigNumber, time: number) {
  if (denom.eq(0) || time === 0) {
    return 0.0;
  }

  const growth = num.div(denom);
  const timeInYears = time / (3600 * 24 * 365);
  const compounded = Math.pow(1 + growth.toNumber(), 1 / timeInYears) - 1;

  if (compounded < 0.0) {
    return 0.0;
  } else if (compounded > MAX_APR_CAP) {
    return MAX_APR_CAP;
  }
  return compounded;
}

function castBigToFloat(liq: string): BigNumber {
  const bigNumber = bignumber(liq).toString();
  return bignumber(bigNumber).div(10 ** 18);
}

function convertFloatToIntString(value: BigNumber): string {
  const multiplier = Math.pow(10, 18);
  const intValue = value.mul(multiplier);
  return intValue.toString();
}

function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

function estLiqAmplification(bidTick: number, askTick: number): BigNumber {
  const midTick = (bidTick + askTick) / 2;
  const bidPrice = Math.sqrt(tickToPrice(bidTick));
  const midPrice = Math.sqrt(tickToPrice(midTick));
  return bignumber(midPrice).div(bignumber(midPrice).minus(bidPrice));
}
