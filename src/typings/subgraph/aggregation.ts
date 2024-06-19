export type AggregatedPositionResult = {
  poolId: string;
  user: string;
  baseAmount: string;
  quoteAmount: string;
  aggregatedLiquidity: string;
  aggregatedBaseFlow: string;
  aggregatedQuoteFlow: string;
  baseToken: string;
  quoteToken: string;
  positionType: string;
  bidTick: number;
  askTick: number;
  liq: string;
};
