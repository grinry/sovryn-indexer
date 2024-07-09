import { CronJob } from 'cron';

import { networks } from 'loader/networks';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { SdexChain } from 'loader/networks/sdex-chain';
import { NetworkFeature } from 'loader/networks/types';
import {
  getAmmPoolTvl,
  getLendingPoolTvl,
  getMyntTvl,
  getProtocolTvl,
  getSdexTvl,
  getStakingTvl,
  getSubprotocolTvl,
  getZeroTvl,
} from 'loader/tvl/prepare-tvl-cronjob-data';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:tvl' });

export const tvlTask = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Retrieving TVL task');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.legacy)) {
      await processLegacyChain(item.legacy);
    }

    if (item.hasFeature(NetworkFeature.sdex)) {
      await processSdexChain(item.sdex);
    }
  }

  childLogger.info('TVL task retrieved.');
  ctx.start();
};

const processLegacyChain = (chain: LegacyChain) =>
  Promise.allSettled([
    getAmmPoolTvl(chain),
    getLendingPoolTvl(chain),
    getProtocolTvl(chain),
    getSubprotocolTvl(chain),
    getZeroTvl(chain),
    getMyntTvl(chain),
    getStakingTvl(chain.context),
  ]);

const processSdexChain = (chain: SdexChain) =>
  Promise.allSettled([getSdexTvl(chain), getStakingTvl(chain.context)]).then((results) =>
    logger.debug({ chain: chain.context.chainId, results }, 'Sdex chain processed'),
  );
