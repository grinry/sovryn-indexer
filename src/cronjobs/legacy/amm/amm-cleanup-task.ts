import { CronJob } from 'cron';
import dayjs from 'dayjs';
import { lt } from 'drizzle-orm';

import { db } from 'database/client';
import { ammApyBlocks } from 'database/schema';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:legacy:amm_apy_clean_up' });

export const ammCleanUpTask = async (ctx: CronJob) => {
  ctx.stop();
  const endDate = dayjs().subtract(2, 'day').toDate();
  childLogger.info({ endDate }, 'Cleaning up AMM APY data.');

  const result = await db
    .delete(ammApyBlocks)
    .where(lt(ammApyBlocks.blockTimestamp, endDate))
    .returning({ id: ammApyBlocks.id })
    .execute();

  childLogger.info({ deletedCount: result.length }, 'Cleaning up AMM APY data completed...');
  ctx.start();
};
