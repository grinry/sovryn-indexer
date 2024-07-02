import { ethers, ZeroAddress } from 'ethers';
import { bignumber } from 'mathjs';

import { SdexQuery } from 'artifacts/abis/types';
import { LiquidityChangesResponse, PositionType } from 'typings/subgraph/liquidity';
import { aggregatePositions, filterPositions } from 'utils/aggregationUtils';

export async function getLPTokenBalance(rpc: ethers.JsonRpcProvider, user: string, baseToken: string): Promise<string> {
  if (baseToken === ZeroAddress) {
    const balance = await rpc.getBalance(user);
    return balance.toString();
  } else {
    const LPContract = new ethers.Contract(baseToken, ['function balanceOf(address) view returns (uint256)'], rpc);
    const balance = await LPContract.balanceOf(user);
    return balance.toString();
  }
}

export async function getUserPositions(
  queryContract: SdexQuery,
  rpc: ethers.JsonRpcProvider,
  user: string,
  base: string,
  quote: string,
  poolIdx: number,
  liquidityChanges: LiquidityChangesResponse['liquidityChanges'],
) {
  const concentratedPositions = filterPositions(liquidityChanges, poolIdx, base, quote, PositionType.concentrated);
  const ambientPositions = filterPositions(liquidityChanges, poolIdx, base, quote, PositionType.ambient);

  if (concentratedPositions.length === 0 && ambientPositions.length === 0) {
    return null;
  }

  const ambientPositionResults = await Promise.all(
    ambientPositions.map(async (userLiquidity) => {
      const ambientTokens = await queryContract.queryAmbientTokens(user, base, quote, poolIdx);
      const lpTokenAddress = await queryContract.queryPoolLpTokenAddress(base, quote, poolIdx);
      const lpTokenBalance = await getLPTokenBalance(rpc, user, lpTokenAddress);
      const ambientLiq = bignumber(ambientTokens.liq).plus(bignumber(lpTokenBalance)).toString();

      return {
        ambientLiq,
        concLiq: '0',
        rewardLiq: '0',
        baseQty: ambientTokens.baseQty.toString(),
        quoteQty: ambientTokens.quoteQty.toString(),
        aggregatedLiquidity: userLiquidity.liq,
        aggregatedBaseFlow: userLiquidity.baseFlow,
        aggregatedQuoteFlow: userLiquidity.quoteFlow,
        positionType: userLiquidity.positionType,
        bidTick: userLiquidity.bidTick,
        askTick: userLiquidity.askTick,
        aprDuration: userLiquidity.aprDuration,
        aprPostLiq: userLiquidity.aprPostLiq,
        aprContributedLiq: userLiquidity.aprContributedLiq,
        aprEst: userLiquidity.aprEst,
      };
    }),
  );

  const aggregatedAmbientPosition = aggregatePositions(ambientPositionResults);

  const concentratedPositionsResults = await Promise.all(
    concentratedPositions.map(async (userLiquidity) => {
      const { bidTick, askTick } = userLiquidity;
      const [rangeTokens, rewardLiq] = await Promise.all([
        queryContract.queryRangeTokens(user, base, quote, poolIdx, bidTick, askTick),
        queryContract.queryConcRewards(user, base, quote, poolIdx, bidTick, askTick),
      ]);

      if (!bignumber(rangeTokens.liq).isZero()) {
        return {
          ambientLiq: '0',
          concLiq: rangeTokens.liq.toString(),
          rewardLiq: rewardLiq.liqRewards.toString(),
          baseQty: rangeTokens.baseQty.toString(),
          quoteQty: rangeTokens.quoteQty.toString(),
          aggregatedLiquidity: userLiquidity.liq.toString(),
          aggregatedBaseFlow: userLiquidity.baseFlow.toString(),
          aggregatedQuoteFlow: userLiquidity.quoteFlow.toString(),
          positionType: userLiquidity.positionType,
          bidTick: userLiquidity.bidTick,
          askTick: userLiquidity.askTick,
          aprDuration: userLiquidity.aprDuration.toString(),
          aprPostLiq: userLiquidity.aprPostLiq.toString(),
          aprContributedLiq: userLiquidity.aprContributedLiq.toString(),
          aprEst: userLiquidity.aprEst.toString(),
        };
      }
      return null;
    }),
  );

  const activePositionResults = concentratedPositionsResults.filter((result) => result !== null);

  return [aggregatedAmbientPosition, ...activePositionResults].filter(Boolean);
}
