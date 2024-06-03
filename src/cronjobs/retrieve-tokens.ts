import { CronJob } from 'cron';

import { networks } from 'loader/networks';
import { logger } from 'utils/logger';

export const retrieveTokens = async (ctx: CronJob) => {
  ctx.stop();
  logger.info('Retrieving tokens...');

  // todo: retrieve tokens and put them to the database

  // const network = networks.getNetwork('gobob');
  // const data = await network.sdex.getPoolData();

  ctx.start();
};
