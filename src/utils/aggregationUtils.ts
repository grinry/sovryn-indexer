import { bignumber, add } from 'mathjs';

import { AggregatedPositionResult } from '../typings/subgraph/aggregation';
import { LiquidityChanges } from '../typings/subgraph/liquidity';

export function aggregatePositions(userPoolPositions: LiquidityChanges[]): AggregatedPositionResult[] {
  const aggregatedPositions: AggregatedPositionResult[] = [];

  userPoolPositions.forEach((position) => {
    const existingPosition = aggregatedPositions.find((p) => p.poolId === position.pool.poolIdx);

    const baseFlow = bignumber(position.baseFlow);
    const quoteFlow = bignumber(position.quoteFlow);

    if (existingPosition) {
      existingPosition.baseAmount = add(bignumber(existingPosition.baseAmount), baseFlow).toString();
      existingPosition.quoteAmount = add(bignumber(existingPosition.quoteAmount), quoteFlow).toString();
    } else {
      aggregatedPositions.push({
        poolId: position.pool.poolIdx,
        user: position.user,
        baseAmount: baseFlow.toString(),
        quoteAmount: quoteFlow.toString(),
        aggregatedLiquidity: position.liq,
        aggregatedBaseFlow: position.baseFlow,
        aggregatedQuoteFlow: position.quoteFlow,
      });
    }
  });

  return aggregatedPositions;
}
