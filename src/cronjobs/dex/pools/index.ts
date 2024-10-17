import { CronJob } from 'cron';
import _ from 'lodash';

import { PoolExtended, poolsRepository } from 'database/repository/pools-repository';
import { PoolType } from 'database/schema';
import { networks } from 'loader/networks';
import { NetworkFeature } from 'loader/networks/types';
import { logger } from 'utils/logger';

import { retrieveAmbientPoolList, updateAmbientPool } from './ambient-pool-tasks';

const childLogger = logger.child({ module: 'crontab:dex:pool_list' });

// to populate database with new pools
export const updateDexPoolList = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Updating pool info...');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.sdex)) {
      await retrieveAmbientPoolList(item.sdex);
    }
  }

  childLogger.info('Pool update finished.');

  ctx.start();
};

// to populate database with pool data (liquidity, volume, etc)
export const updateDexPoolListData = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Updating pool info...');

  const items = await poolsRepository.allProcessable();

  childLogger.info(`Found ${items.length} pools to update`);

  await Promise.allSettled(items.map(choosePoolHandler));

  // todo: remove this, it's for testing purposes
  // await choosePoolHandler(items[0]);

  childLogger.info('Pool update finished.');

  ctx.start();
};

async function choosePoolHandler(pool: PoolExtended) {
  switch (pool.type) {
    case PoolType.ambient:
      return updateAmbientPool(pool);
    default:
      return Promise.reject(new Error(`Don't know how to process: ${pool.type}`));
  }
}
