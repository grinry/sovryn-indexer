/* eslint-disable import/order */
import config from 'config';
import 'utils/shutdown';

import { startApp } from 'app';
import { startCrontab, tickWrapper } from 'crontab';
import { logger } from 'utils/logger';
import { CronJob } from 'cron';
import { priceFeedTask } from 'cronjobs/legacy/price-feed-task';

startApp();

if (!config.readOnly) {
  logger.info('Running in read-write mode. Starting crontab...');
  startCrontab();
} else {
  logger.info('Running in read-only mode.');
}

// todo: remove later
CronJob.from({
  cronTime: '*/5 * * * *',
  onTick: tickWrapper(priceFeedTask),
  runOnInit: true,
});
