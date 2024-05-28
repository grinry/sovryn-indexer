import { CronJob } from 'cron';

import { logger } from 'utils/logger';

export const retrieveTokens = async (ctx: CronJob) => {
  ctx.stop();
  logger.info('Retrieving tokens...');

  // todo: retrieve tokens and put them to the database

  ctx.start();
};
