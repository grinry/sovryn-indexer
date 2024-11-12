import { eq } from 'drizzle-orm';

import { getDailyPoolVolume } from 'cronjobs/dex/pools/ambient-pool-tasks';
import { db } from 'database/client';
import { poolsTable } from 'database/schema';
import { networks } from 'loader/networks';
import { logger } from 'utils/logger';

export default async function run() {
  logger.info('Check pool data');
  const chain = networks.getByChainId(60808);
  const pool = await db.query.poolsTable.findFirst({
    with: {
      base: true,
      quote: true,
    },
    where: eq(poolsTable.id, 1),
  });
  const data = await getDailyPoolVolume(chain.sdex, pool);
  logger.info(data, 'Pool data');
}
