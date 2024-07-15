import { bignumber, BigNumber } from 'mathjs';

export function toDisplayPrice(price: number, baseDecimals: number, quoteDecimals: number, isInverted = false): number {
  const scaled = price * Math.pow(10, quoteDecimals - baseDecimals);
  return isInverted ? 1 / scaled : scaled;
}

export function fromDisplayPrice(
  price: number,
  baseDecimals: number,
  quoteDecimals: number,
  isInverted = false,
): number {
  const scaled = isInverted ? 1 / price : price;
  return scaled * Math.pow(10, baseDecimals - quoteDecimals);
}

export function decodeCrocPrice(val: bigint) {
  const x = val < Number.MAX_SAFE_INTEGER - 1 ? Number(val.toString()) : parseFloat(val.toString());
  const sq = x / 2 ** 64;
  return sq * sq;
}

export function toBn(val: number | bigint) {
  return typeof val === 'bigint' ? val : BigInt(Number(val).toLocaleString('fullwide', { useGrouping: false }));
}

export function fixBnValue(value: BigNumber) {
  if (value.isNaN() || !value.isFinite()) {
    return bignumber(0);
  }
  return value;
}
