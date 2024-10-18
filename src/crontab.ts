import { CronJob } from 'cron';

import { updateDexPoolList, updateDexPoolListData } from 'cronjobs/dex/pools';
import { ammApyBlockTask } from 'cronjobs/legacy/amm/amm-apy-block-task';
import { ammApyDailyDataTask } from 'cronjobs/legacy/amm/amm-apy-daily-data-task';
import { ammCleanUpTask } from 'cronjobs/legacy/amm/amm-cleanup-task';
import { ammPoolsTask } from 'cronjobs/legacy/amm/amm-pools-task';
import { priceFeedTask } from 'cronjobs/legacy/price-migration';
import { tvlTask } from 'cronjobs/legacy/tvl-task';
import { retrieveSwaps } from 'cronjobs/retrieve-swaps';
import { retrieveTokens } from 'cronjobs/retrieve-tokens';
import { retrieveUsdPrices } from 'cronjobs/retrieve-usd-prices';
import { updateChains } from 'loader/networks';
import { getLastPrices } from 'loader/price';

export const tickWrapper = (fn: (context: CronJob) => Promise<void>) => {
  return async function () {
    await fn(this);
  };
};

export const startCrontab = async () => {
  // populate chain config on startup before running other tasks
  await updateChains();

  runOnInit();

  dexJobs();

  // Stores Swaps every minute
  CronJob.from({
    cronTime: '*/1 * * * *',
    onTick: tickWrapper(retrieveSwaps),
  }).start();

  // // LEGACY JOBS
  ammApyJobs();
  graphWrapperJobs();

  // update cached prices every minute
  CronJob.from({
    cronTime: '*/1 * * * *',
    onTick: async function () {
      this.stop();
      try {
        await getLastPrices(true);
      } catch (e) {
        console.error(e);
      }
      this.start();
    },
  });

  // tempJobs();
};

function runOnInit() {
  // Check and populate supported token list every 2 minutes
  CronJob.from({
    // cronTime: '*/10 * * * * *',
    cronTime: '*/2 * * * *',
    onTick: tickWrapper(retrieveTokens),
    runOnInit: true,
  }).start();

  // Retrieve USD prices of tokens every minute
  CronJob.from({
    cronTime: '*/1 * * * *',
    onTick: tickWrapper(retrieveUsdPrices),
    runOnInit: true,
  }).start();
}

function ammApyJobs() {
  // Retrieve AMM APY blocks every 2 minutes
  CronJob.from({
    cronTime: '*/2 * * * *',
    onTick: tickWrapper(ammApyBlockTask),
  }).start();

  // Retrieve daily AMM APY blocks every 30 minutes
  CronJob.from({
    cronTime: '*/30 * * * *',
    onTick: tickWrapper(ammApyDailyDataTask),
  }).start();

  // Remove AMM APY data older than 2 days every 2 hours
  CronJob.from({
    cronTime: '15 */2 * * *',
    onTick: tickWrapper(ammCleanUpTask),
  }).start();
}

// Tasks migrated from Sovryn-graph-wrapper repository.
function graphWrapperJobs() {
  CronJob.from({
    cronTime: '*/30 * * * *',
    onTick: tickWrapper(ammPoolsTask),
  }).start();

  CronJob.from({
    cronTime: '*/30 * * * *',
    onTick: tickWrapper(tvlTask),
  }).start();
}

function dexJobs() {
  CronJob.from({
    cronTime: '*/1 * * * *',
    onTick: tickWrapper(updateDexPoolList),
  }).start();

  CronJob.from({
    cronTime: '*/1 * * * *',
    onTick: tickWrapper(updateDexPoolListData),
  }).start();
}

function tempJobs() {
  CronJob.from({
    cronTime: '*/5 * * * *',
    onTick: tickWrapper(priceFeedTask),
    runOnInit: true,
  }).start();
}
