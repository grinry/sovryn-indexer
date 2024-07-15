import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';

import config from 'config';
import { logger } from 'utils/logger';

interface RateLimiterOptions {
  keyPrefix: string;
  points: number;
  duration: number;
}

const redisClient = new Redis({
  host: config.redisHost || 'node-api-redis',
  port: config.redisPort || 6379,
  db: config.redisDb || 0,
  enableOfflineQueue: false,
});

const createRateLimiterMiddleware = (options: RateLimiterOptions) => {
  const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: options.keyPrefix,
    points: options.points,
    duration: options.duration,
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip;
    try {
      await rateLimiter.consume(clientIp);
      next();
    } catch (err) {
      res.status(429).send('Too Many Requests');
    }
  };
};

export default createRateLimiterMiddleware;
