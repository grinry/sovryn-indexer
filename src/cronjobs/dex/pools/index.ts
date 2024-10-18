import { CronJob } from 'cron';
import _ from 'lodash';

import { PoolExtended, poolsRepository } from 'database/repository/pools-repository';
import { PoolType } from 'database/schema';
import { networks } from 'loader/networks';
import { NetworkFeature } from 'loader/networks/types';
import { logger } from 'utils/logger';

import { retrieveAmbientPoolList, updateAmbientPool } from './ambient-pool-tasks';
import { retrieveBancorPoolList, updateBancorPool } from './bancor-pool-tasks';

const childLogger = logger.child({ module: 'crontab:dex:pool_list' });

// to populate database with new pools
export const updateDexPoolList = async (ctx: CronJob) => {
  try {
    childLogger.info('Updating pool info...');

    const items = networks.listChains();

    for (const item of items) {
      await Promise.allSettled([
        item.hasFeature(NetworkFeature.sdex) && retrieveAmbientPoolList(item.sdex),
        item.hasFeature(NetworkFeature.legacy) && retrieveBancorPoolList(item.legacy),
      ]);
    }

    childLogger.info('Pool update finished.');
  } catch (e) {
    childLogger.error({ error: e.message }, 'Error retrieving pools');
  } finally {
    ctx.start();
  }
  ctx.stop();
};

// to populate database with pool data (liquidity, volume, etc)
export const updateDexPoolListData = async (ctx: CronJob) => {
  try {
    ctx.stop();
    childLogger.info('Updating pool info...');

    const items = await poolsRepository.allProcessable();

    childLogger.info(`Found ${items.length} pools to update`);

    await Promise.allSettled(items.map(choosePoolHandler));

    childLogger.info('Pool update finished.');
  } catch (e) {
    childLogger.error({ error: e.message }, 'Error updating pools');
  } finally {
    ctx.start();
  }
};

async function choosePoolHandler(pool: PoolExtended) {
  switch (pool.type) {
    case PoolType.ambient:
      return updateAmbientPool(pool);
    case PoolType.bancor:
      return updateBancorPool(pool);
    default:
      return Promise.reject(new Error(`Don't know how to process: ${pool.type}`));
  }
}
