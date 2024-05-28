import { CronJob } from 'cron';

import { retrieveTokens } from 'cronjobs/retrieve-tokens';

export const tickWrapper = (fn: (context: CronJob) => Promise<void>) => {
  return async function () {
    await fn(this);
  };
};

export const startCrontab = () => {
  CronJob.from({
    cronTime: '0 */2 * * * *',
    onTick: tickWrapper(retrieveTokens),
  }).start();
};
