import { CronJob } from 'cron';
import _ from 'lodash';

import { swapRepositoryV2 } from 'database/repository/swap-repository-v2';
import { networks } from 'loader/networks';
import { SdexChain } from 'loader/networks/sdex-chain';
import { NetworkFeature } from 'loader/networks/types';
import { floorDate } from 'utils/date';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:retrieve-swaps-v2' });

export const retrieveSwapsV2 = async (ctx: CronJob) => {
  ctx.stop(); // Stop the job to prevent overlap
  const tickAt = floorDate(ctx.lastDate()); // Get the tick time
  childLogger.info({ tickAt }, 'Retrieving Swaps V2...');

  const items = networks.listChains();

  // Filter chains that have SDEX feature and process them
  for (const item of items) {
    if (item.hasFeature(NetworkFeature.sdex)) {
      await prepareSdexSwaps(item.sdex, item.chainId);
    }
  }

  childLogger.info('Swaps V2 retrieval finished.');
  ctx.start(); // Restart the job
};

async function prepareSdexSwaps(chain: SdexChain, chainId: number) {
  try {
    const blockNumber = await chain.queryBlockNumber(); // Get the current block number
    const lastSwap = await swapRepositoryV2.loadLastSwap(); // Load the last swap from the repository

    const startBlock = lastSwap?.block || 0; // Determine the start block for querying
    const items = await chain.querySwaps(startBlock, blockNumber); // Query new swaps
    console.log('items', items);

    // Prepare the values to insert into the database
    const values = items.swaps.map((swap) => {
      console.log('swap', swap);

      return {
        tickAt: new Date(Number(swap.time) * 1e3),
        transactionHash: swap.transactionHash,
        chainId: chainId,
        dexType: swap.dex,
        user: swap.user,
        baseId: String(swap.pool.base),
        quoteId: String(swap.pool.quote),
        poolId: Number(swap.pool.poolIdx),
        poolIdx: swap.pool.poolIdx,
        block: Number(swap.block),
        isBuy: swap.isBuy,
        amountIn: swap.amountIn ? swap.amountIn : '0',
        amountOut: swap.amountOut ? swap.amountOut : '0',
        amountInUSD: swap.amountInUSD ? swap.amountInUSD : '0',
        amountOutUSD: swap.amountOutUSD ? swap.amountOutUSD : '0',
        fees: swap.fees,
        feesUSD: swap.feesUSD,
        baseFlow: swap.baseFlow,
        quoteFlow: swap.quoteFlow,
        callIndex: swap.callIndex,
      };
    });

    // Insert the new swaps into the repository
    if (values.length > 0) {
      await swapRepositoryV2.create(values); // Create new swaps only if there are values
    }
  } catch (error) {
    childLogger.error(error, 'Error while retrieving Swaps V2 for Sdex chain');
  }
}
