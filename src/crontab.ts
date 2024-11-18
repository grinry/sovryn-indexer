import { CronJob } from 'cron';

import { updateDexPoolList, updateDexPoolListData } from 'cronjobs/dex/pools';
import { updateDexPoolBalances } from 'cronjobs/dex/pools/ambient-pool-balances-tasks';
import { swapTasks } from 'cronjobs/dex/swaps/swaps-tasks';
import { tokenFetcherTask } from 'cronjobs/dex/token-fetcher-task';
import { ammApyBlockTask } from 'cronjobs/legacy/amm/amm-apy-block-task';
import { ammApyDailyDataTask } from 'cronjobs/legacy/amm/amm-apy-daily-data-task';
import { ammCleanUpTask } from 'cronjobs/legacy/amm/amm-cleanup-task';
import { ammPoolsTask } from 'cronjobs/legacy/amm/amm-pools-task';
import { tvlTask } from 'cronjobs/legacy/tvl-task';
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

  // LEGACY JOBS
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

  tempJobs();
};

function runOnInit() {
  // Update supported token list from the github repository on startup and every minute
  CronJob.from({
    cronTime: '*/1 * * * *',
    onTick: tickWrapper(tokenFetcherTask),
    runOnInit: true,
  }).start();

  // Retrieve USD prices of tokens every minute
  CronJob.from({
    cronTime: '*/5 * * * *',
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

  // Stores Swaps V2 every minute
  CronJob.from({
    cronTime: '*/1 * * * *',
    onTick: tickWrapper(swapTasks),
  }).start();

  CronJob.from({
    cronTime: '*/1 * * * *',
    runOnInit: true,
    onTick: tickWrapper(updateDexPoolBalances),
  }).start();
}

function tempJobs() {
  // CronJob.from({
  //   cronTime: '*/5 * * * *',
  //   onTick: tickWrapper(priceFeedTask),
  //   runOnInit: true,
  // }).start();
}
