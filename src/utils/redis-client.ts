import { createClient } from 'redis';

import config from 'config';

import { logger } from './logger';
import { onShutdown } from './shutdown';

export const redis = createClient({
  url: config.redisCacheUrl,
})
  .on('connect', () => {
    logger.info('Redis client connected');
  })
  .on('error', (err) => {
    logger.error(err, 'Redis error');
  });

redis.connect();

onShutdown(async () => {
  await redis.disconnect();
});
