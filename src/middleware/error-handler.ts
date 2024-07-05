import { DrizzleError } from 'drizzle-orm';
import { Request, Response, NextFunction } from 'express';

import config from 'config';
import { CustomError } from 'utils/custom-error';
import { logger } from 'utils/logger';

export const errorHandler = (err: CustomError, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof DrizzleError) {
    err = new CustomError(419, 'General', 'Database error', [], err);
  }

  if (err instanceof CustomError) {
    return res.status(err.HttpStatusCode || 500).json(err.JSON);
  }

  logger.error(err, 'Internal server error');

  const extendedError =
    config.env !== 'production'
      ? {
          message: (err as Error).message,
          stack: (err as Error).stack,
        }
      : undefined;

  return res.status(500).json({
    type: 'General',
    error: 'Internal server error',
    ...extendedError,
  });
};
