import { CronJob } from 'cron';

import { retrieveTokens } from 'cronjobs/retrieve-tokens';
import { retrieveUsdPrices } from 'cronjobs/retrieve-usd-prices';

export const tickWrapper = (fn: (context: CronJob) => Promise<void>) => {
  return async function () {
    await fn(this);
  };
};

export const startCrontab = () => {
  // Check and populate supported token list every 2 minutes
  CronJob.from({
    // cronTime: '*/10 * * * * *',
    cronTime: '0 */2 * * * *',
    onTick: tickWrapper(retrieveTokens),
    runOnInit: true,
  }).start();

  // Retrieve USD prices of tokens every minute
  CronJob.from({
    cronTime: '0 * * * * *',
    onTick: tickWrapper(retrieveUsdPrices),
  }).start();
};
