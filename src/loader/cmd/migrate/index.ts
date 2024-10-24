import { processChain } from 'cronjobs/legacy/price-migration';
import { networks } from 'loader/networks';
import { logger } from 'utils/logger';

export default async function migrate() {
  logger.info('Migrate started');
  const chain = networks.getByChainId(60808);
  await processChain(chain.sdex);
}
