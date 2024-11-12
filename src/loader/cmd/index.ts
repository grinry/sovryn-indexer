import { logger } from 'utils/logger';
import { sleep } from 'utils/sleep';

import migrate from './migrate';

(async () => {
  const args = process.argv.slice(2);

  logger.info({ level: 1 }, 'CMD started');
  console.log('CMD started');

  switch (args[0]) {
    case 'migrate':
      await migrate();
      break;
    case 'pool':
      await import('./pool').then((mod) => mod.default());
      break;
    default:
      logger.warn('Unknown command');
  }
})()
  .catch((error) => {
    logger.error({ error: error.message }, 'CMD failed');
  })
  .finally(async () => {
    await sleep(1000);
    process.exit(0);
  });
