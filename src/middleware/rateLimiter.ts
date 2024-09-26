import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';

import config from 'config';
import { HttpError } from 'utils/custom-error';

interface RateLimiterOptions {
  keyPrefix: string;
  points: number;
  duration: number;
}

const redisClient = new Redis(config.redisCacheUrl);

const createRateLimiterMiddleware = (options: RateLimiterOptions) => {
  const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: `rm--${options.keyPrefix}`,
    points: options.points,
    duration: options.duration,
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip;
    res.setHeader('X-RateLimit-Limit', String(options.points));
    res.setHeader('X-User', String(clientIp));
    res.setHeader('X-User-Path', req.ips.join(' -> '));
    try {
      // temporary bypass rate limit for testing
      if (!process.env.BYPASS_RATE_LIMIT) {
        // await rateLimiter.consume(clientIp);
      } else {
        res.setHeader('X-RateLimit-Disabled', 'true');
      }
      next();
    } catch (err) {
      return next(new HttpError(429, 'Too Many Requests'));
    }
  };
};

export default createRateLimiterMiddleware;
