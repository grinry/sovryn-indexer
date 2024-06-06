/* eslint-disable import/order */
import config from 'config';
import 'utils/shutdown';

import { startApp } from 'app';
import { startCrontab } from 'crontab';
import { logger } from 'utils/logger';

startApp();

if (!config.readOnly) {
  logger.info('Running in read-write mode. Starting crontab...');
  startCrontab();
} else {
  logger.info('Running in read-only mode.');
}
