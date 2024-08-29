import { CronJob } from 'cron';
import _ from 'lodash';

import { binRepository } from 'database/repository/bin-repository';
import { swapRepository } from 'database/repository/swap-repository';
import { networks } from 'loader/networks';
import { LiquidityChain } from 'loader/networks/liquidity-chain';
import { SdexChain } from 'loader/networks/sdex-chain';
import { NetworkFeature } from 'loader/networks/types';
import { floorDate } from 'utils/date';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:retrieve-swaps' });

export const retrieveSwaps = async (ctx: CronJob) => {
  ctx.stop();
  const tickAt = floorDate(ctx.lastDate());
  childLogger.info({ tickAt }, 'Retrieving Swaps...');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.sdex)) {
      await prepareSdexSwaps(item.sdex, item.chainId);
    }
    if (item.hasFeature(NetworkFeature.liquidity)) {
      await prepareLiquidityBins(item.liquidity, item.chainId);
    }
  }

  childLogger.info('Swaps retrieval finished.');

  ctx.start();
};

async function prepareSdexSwaps(chain: SdexChain, chainId: number) {
  try {
    const blockNumber = await chain.queryBlockNumber();
    const lastSwap = await swapRepository.loadLastSwap();

    if (!lastSwap || lastSwap.block < blockNumber) {
      const items = await chain.querySwaps(lastSwap?.block || 0, blockNumber);

      const values = items.swaps.map((swap) => ({
        tickAt: new Date(Number(swap.time) * 1000),
        transactionHash: swap.transactionHash,
        chainId: chainId,
        user: swap.user,
        baseId: swap.pool.base,
        quoteId: swap.pool.quote,
        poolIdx: swap.pool.poolIdx,
        block: Number(swap.block),
        isBuy: swap.isBuy,
        inBaseQty: swap.inBaseQty,
        qty: swap.qty,
        limitPrice: swap.limitPrice,
        minOut: swap.minOut,
        baseFlow: swap.baseFlow,
        quoteFlow: swap.quoteFlow,
        callIndex: swap.callIndex,
      }));

      await swapRepository.create(values);
    }
  } catch (error) {
    childLogger.error(error, 'Error while retrieving Swaps for Sdex chain');
  }
}

async function prepareLiquidityBins(chain: LiquidityChain, chainId: number) {
  try {
    const blockNumber = await chain.queryBlockNumber();
    const lastBin = await binRepository.loadLastBin();

    if (!lastBin || lastBin.block < blockNumber) {
      const items = await chain.queryBins(lastBin?.block || 0, blockNumber);
      childLogger.info(items.userBinLiquidities.length);

      const values = items.userBinLiquidities.map((bin) => ({
        tickAt: new Date(Number(bin.timestamp) * 1000),
        chainId: chainId,
        user: bin.user.id,
        liquidity: bin.liquidity,
        binId: bin.binId,
        priceX: bin.lbPairBinId.priceX,
        priceY: bin.lbPairBinId.priceY,
        totalSupply: bin.lbPairBinId.totalSupply,
        reserveX: bin.lbPairBinId.reserveX,
        reserveY: bin.lbPairBinId.reserveY,
        block: bin.block,
      }));

      await binRepository.create(values);
    }
  } catch (error) {
    childLogger.error(error, 'Error while retrieving Bins for Liquidity chain');
  }
}
