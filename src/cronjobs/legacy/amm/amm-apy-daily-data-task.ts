import { CronJob } from 'cron';

import { networks } from 'loader/networks';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { NetworkFeature } from 'loader/networks/types';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:legacy:amm_apy_daily_data' });

export const ammApyDailyDataTask = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Begin AMM APY daily data task..');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.legacy)) {
      await processLegacyChain(item.legacy);
    }
  }

  childLogger.info('AMM APY daily data task completed.');
  // ctx.start();
};

async function processLegacyChain(chain: LegacyChain) {
  //
}
