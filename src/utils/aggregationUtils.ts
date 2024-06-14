import { AggregatedPosition } from '../types/aggregation';
import { LiquidityChanges } from '../types/liquidity';

export function aggregatePositions(userPoolPositions: LiquidityChanges[]): AggregatedPosition[] {
  const aggregatedPositions: AggregatedPosition[] = [];

  userPoolPositions.forEach((position) => {
    const existingPosition = aggregatedPositions.find((p) => p.poolId === position.pool.poolIdx);

    if (existingPosition) {
      existingPosition.baseAmount += parseFloat(position.baseFlow);
      existingPosition.quoteAmount += parseFloat(position.quoteFlow);
    } else {
      aggregatedPositions.push({
        poolId: position.pool.poolIdx,
        user: position.user,
        baseAmount: parseFloat(position.baseFlow),
        quoteAmount: parseFloat(position.quoteFlow),
        aggregatedLiquidity: position.liq,
        aggregatedBaseFlow: position.baseFlow,
        aggregatedQuoteFlow: position.quoteFlow,
      });
    }
  });

  return aggregatedPositions;
}
