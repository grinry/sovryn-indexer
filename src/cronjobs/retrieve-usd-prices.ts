import { CronJob } from 'cron';
import _ from 'lodash';

import { usdPriceLoader } from 'loader/usd-prices/usd-price-loader';
import { floorDate } from 'utils/date';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:retrieve-usd-prices' });

export const retrieveUsdPrices = async (ctx: CronJob) => {
  ctx.stop();
  const tickAt = floorDate(ctx.lastDate());
  childLogger.info({ tickAt }, 'Retrieving USD prices of tokens...');

  const res = await usdPriceLoader(tickAt);

  childLogger.info({ tickAt, items: res.length }, 'Retrieving USD prices of tokens completed.');

  ctx.start();
};
