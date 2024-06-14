import { CronJob } from 'cron';

import { ammApyBlockTask } from 'cronjobs/legacy/amm/amm-apy-block-task';
import { ammApyDailyDataTask } from 'cronjobs/legacy/amm/amm-apy-daily-data-task';
import { ammCleanUpTask } from 'cronjobs/legacy/amm/amm-cleanup-task';
import { retrieveTokens } from 'cronjobs/retrieve-tokens';
import { retrieveUsdPrices } from 'cronjobs/retrieve-usd-prices';

export const tickWrapper = (fn: (context: CronJob) => Promise<void>) => {
  return async function () {
    await fn(this);
  };
};

export const startCrontab = () => {
  // Check and populate supported token list every 2 minutes
  // CronJob.from({
  //   // cronTime: '*/10 * * * * *',
  //   cronTime: '*/2 * * * *',
  //   onTick: tickWrapper(retrieveTokens),
  //   runOnInit: true,
  // }).start();

  // // Retrieve USD prices of tokens every minute
  // CronJob.from({
  //   cronTime: '*/1 * * * *',
  //   onTick: tickWrapper(retrieveUsdPrices),
  // }).start();

  // START LEGACY JOBS (AMM)
  // Retrieve AMM APY blocks every 2 minutes
  // CronJob.from({
  //   cronTime: '*/2 * * * *',
  //   onTick: tickWrapper(ammApyBlockTask),
  // }).start();

  // Retrieve daily AMM APY blocks every 30 minutes
  CronJob.from({
    cronTime: '*/30 * * * *',
    onTick: tickWrapper(ammApyDailyDataTask),
    runOnInit: true,
  }).start();

  // Remove AMM APY data older than 2 days every 2 hours
  CronJob.from({
    cronTime: '15 */2 * * *',
    onTick: tickWrapper(ammCleanUpTask),
  }).start();
  // END LEGACY JOBS (AMM)
};
