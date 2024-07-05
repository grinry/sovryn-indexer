import config from 'config';
import { tvlRepository } from 'database/repository/tvl-repository';
import { TvlGroup } from 'database/schema';
import { logger } from 'utils/logger';
import { sleep } from 'utils/sleep';

// logger.level = 'debug';

(async () => {
  const args = process.argv.slice(2);

  logger.info({ level: 1 }, 'Debugger started');
  console.log('Debugger started');

  switch (args[0]) {
    case 'add':
      await tvlRepository
        .create([
          {
            chainId: 30,
            contract: '0x1234567890123456789012345678901234567890',
            tokenId: 3,
            balance: '3000000000000000000',
            group: TvlGroup.sdexPools,
            name: 'Sdex',
          },
          {
            chainId: 30,
            contract: '0x1234567890123456789012345678901234567891',
            tokenId: 2,
            balance: '5000000000000000000',
            group: TvlGroup.lending,
            name: 'Lending',
          },
        ])
        .execute();
      break;
    case 'tvl':
      await tvl();
      break;
    default:
      logger.warn('Unknown command');
  }
})()
  .catch((error) => {
    logger.error({ error: error.message }, 'Debugger failed');
  })
  .finally(async () => {
    await sleep(1000);
    process.exit(0);
  });

async function tvl() {
  logger.debug('Loading TVL');
  const items = await tvlRepository.loadAll().execute();
  logger.info({ items }, 'TVL loaded');
}
