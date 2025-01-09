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

export type Swap = {
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
  isBuy: boolean;
  inBaseQty: boolean;
  qty: string;
  limitPrice: string;
  minOut: string;
  baseFlow: string;
  quoteFlow: string;
  dex: string;
  // Optional fields to support the extended swap data
  extra?: string;
  baseAmount?: string;
  quoteAmount?: string;
  fees?: string;
};
export type SwapsResponse = {
  swaps: Swap[];
};

export type Bin = {
  id: string;
  liquidity: string;
  user: {
    id: string;
  };
  block: number;
  timestamp: number;
  binId: string;
  lbPairBinId: {
    id: string;
    priceX: string;
    priceY: string;
    totalSupply: string;
    reserveX: string;
    reserveY: string;
  };
};
export type BinsResponse = {
  userBinLiquidities: Bin[];
};

export type SwapExtra = {
  isBuy?: boolean;
  baseFlow?: string;
  quoteFlow?: string;
  protocolFee?: string;
  conversionFee?: string;
};
