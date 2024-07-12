export type LiquidityChanges = {
  id: string;
  transactionHash: string;
  callIndex: number;
  user: string;
  pool: {
    base: string;
    quote: string;
    poolIdx: string;
  };
  block: string;
  time: string;
  positionType: PositionType;
  changeType: 'burn' | 'mint';
  liqChange: string;
  resetRewards: string;
  timeFirstMint: string;
  bidTick: number;
  askTick: number;
  isBid: boolean;
  liq: string;
  baseFlow: string;
  quoteFlow: string;
  pivotTime: string | null;
  aprDuration: string;
  aprPostLiq: string;
  aprContributedLiq: string;
  aprEst: string;
};

export type LiquidityChangesResponse = {
  liquidityChanges: LiquidityChanges[];
};

export type LiquidityPosition = {
  base: string;
  quote: string;
  ambientLiq: string;
  time: string;
  transactionHash: string;
  concLiq: string;
  rewardLiq: string;
  baseQty: string;
  quoteQty: string;
  aggregatedLiquidity: string;
  aggregatedBaseFlow: string;
  aggregatedQuoteFlow: string;
  positionType: PositionType;
  bidTick: number;
  askTick: number;
  aprDuration: string;
  aprPostLiq: string;
  aprContributedLiq: string;
  aprEst: string;
};

export enum PositionType {
  ambient = 'ambient',
  concentrated = 'concentrated',
}
