import { CronJob } from 'cron';
import _ from 'lodash';
import { bignumber } from 'mathjs';

import { DEFAULT_DECIMAL_PLACES } from 'config/constants';
import { poolsRepository } from 'database/repository/pools-repository';
import { swapRepositoryV2 } from 'database/repository/swap-repository-v2';
import { tokenRepository } from 'database/repository/token-repository';
import { networks } from 'loader/networks';
import { SdexChain } from 'loader/networks/sdex-chain';
import { NetworkFeature } from 'loader/networks/types';
import { areAddressesEqual } from 'utils/compare';
import { floorDate } from 'utils/date';
import { logger } from 'utils/logger';
import { prettyNumber, unwei } from 'utils/numbers';

const childLogger = logger.child({ module: 'crontab:retrieve-swaps-v2' });

export const ambientSwapTasks = async (ctx: CronJob) => {
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

    const startBlock = lastSwap ? lastSwap.block - 100 : chain.startBlock; // Determine the start block for querying

    const items = await chain.querySwaps(startBlock, blockNumber); // Query new swaps

    // Fetch tokens and pools from the database
    const tokensList = await tokenRepository.listForChain(chainId);
    const poolsList = await poolsRepository.listForChain(chainId);

    // Prepare the values to insert into the database
    const values = items.swaps.map((swap) => {
      const baseToken = tokensList.find((token) =>
        areAddressesEqual(token.address, swap.isBuy ? swap.pool.base : swap.pool.quote),
      );
      const quoteToken = tokensList.find((token) =>
        areAddressesEqual(token.address, swap.isBuy ? swap.pool.quote : swap.pool.base),
      );

      const poolIdentifier = `${swap.pool.base}_${swap.pool.quote}_${swap.pool.poolIdx}`;

      const pool = poolsList.find((p) => p.identifier === poolIdentifier);

      if (!baseToken || !quoteToken || !pool) {
        // childLogger.warn({ swap, pool, baseToken, quoteToken, tokensList }, 'Missing reference for swap');
        return null;
      }

      const baseAmount = prettyNumber(
        unwei(swap.isBuy ? swap.baseFlow : swap.quoteFlow, baseToken.decimals).abs(),
        DEFAULT_DECIMAL_PLACES,
      );
      const quoteAmount = prettyNumber(
        unwei(swap.isBuy ? swap.quoteFlow : swap.baseFlow, quoteToken.decimals).abs(),
        DEFAULT_DECIMAL_PLACES,
      );

      return {
        chainId,
        transactionHash: swap.transactionHash,
        baseAmount: baseAmount,
        quoteAmount: quoteAmount,
        price: prettyNumber(bignumber(quoteAmount).div(baseAmount), DEFAULT_DECIMAL_PLACES),
        fees: prettyNumber(unwei(swap.fees ?? 0, baseToken.decimals), DEFAULT_DECIMAL_PLACES),
        callIndex: swap.callIndex,
        user: swap.user,
        baseId: baseToken.id,
        quoteId: quoteToken.id,
        poolId: pool.id,
        type: swap.dex,
        block: Number(swap.block),
        tickAt: new Date(Number(swap.time) * 1e3),
        extra: {
          isBuy: swap.isBuy,
          baseFlow: swap.baseFlow,
          quoteFlow: swap.quoteFlow,
        },
      };
    });

    // Filter out any null values before inserting
    const filteredValues = values.filter((value) => value !== null);

    if (filteredValues.length > 0) {
      await swapRepositoryV2.create(filteredValues); // Insert valid swaps only
    } else {
      childLogger.info('No valid swaps to insert.');
    }
  } catch (error) {
    childLogger.error(error, 'Error while retrieving Swaps V2 for Sdex chain');
  }
}
