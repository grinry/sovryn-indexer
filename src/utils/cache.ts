import { Response } from 'express';

import { logger } from './logger';
import { redis } from './redis-client';

export type CacheResponse<T> = {
  data: T;
  cache: 'hit' | 'miss';
  expiresAt: number;
};

export async function maybeCache<T>(
  key: string,
  fn: () => Promise<T>,
  cacheDurationInSeconds: number,
  forceUpdate = false,
): Promise<CacheResponse<T>> {
  const cacheKey = `maybe:${key}`;

  const cached = await cache.get(cacheKey);

  if (cached && !forceUpdate) {
    logger.debug({ key }, 'Cache hit');
    const expiresAt = await cache.exp(cacheKey);
    return {
      data: JSON.parse(cached),
      cache: 'hit',
      expiresAt: expiresAt,
    };
  }

  const forced = cache && forceUpdate;

  logger.debug({ key }, forced ? 'Force update' : 'Cache miss');
  const result = await fn();

  await cache.put(cacheKey, JSON.stringify(result), cacheDurationInSeconds);

  return {
    data: result,
    cache: 'miss',
    expiresAt: Date.now() + cacheDurationInSeconds * 1000,
  };
}

export async function maybeCacheResponse<T>(
  res: Response,
  key: string,
  fn: () => Promise<T>,
  cacheDurationInSeconds: number,
) {
  res.setHeader('Cache-Control', `public, max-age=${cacheDurationInSeconds}`);

  const { data, cache, expiresAt } = await maybeCache(key, fn, cacheDurationInSeconds);

  if (cache === 'hit') {
    res.setHeader('X-Cache', 'HIT');
  } else {
    res.setHeader('X-Cache', 'MISS');
  }

  if (expiresAt) {
    res.setHeader('X-Cache-Expires', new Date(expiresAt).toISOString());
  }

  return data;
}

export const cache = {
  put: async (key: string, value: string, durationInSeconds: number) =>
    redis.set(`cache:${key}`, value, {
      EX: durationInSeconds,
    }),
  get: async (key: string) => redis.get(`cache:${key}`),
  exp: async (key: string) => /*(await redis.pExpireTime(`cache:${key}`)) ?? */ Date.now(),
};
