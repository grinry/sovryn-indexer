import { logger } from './logger';
import { redis } from './redis-client';

export type CacheResponse<T> = {
  data: T;
  cache: 'hit' | 'miss';
};

export async function maybeCache<T>(
  key: string,
  fn: () => Promise<T>,
  cacheDurationInSeconds: number,
): Promise<CacheResponse<T>> {
  const cacheKey = `maybe:${key}`;

  const cached = await cache.get(cacheKey);

  if (cached) {
    logger.debug({ key }, 'Cache hit');
    return {
      data: JSON.parse(cached),
      cache: 'hit',
    };
  }

  logger.debug({ key }, 'Cache miss');
  const result = await fn();

  await cache.put(cacheKey, JSON.stringify(result), cacheDurationInSeconds);

  return {
    data: result,
    cache: 'miss',
  };
}

export const cache = {
  put: async (key: string, value: string, durationInSeconds: number) =>
    redis.set(`cache:${key}`, value, {
      EX: durationInSeconds,
    }),
  get: async (key: string) => redis.get(`cache:${key}`),
};
