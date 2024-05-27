import { DrizzleError } from 'drizzle-orm';
import { Request, Response, NextFunction } from 'express';

import { CustomError } from 'utils/custom-error';

export const errorHandler = (err: CustomError, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof DrizzleError) {
    err = new CustomError(419, 'General', 'Database error', [], err);
  }

  if (err instanceof CustomError) {
    return res.status(err.HttpStatusCode || 500).json(err.JSON);
  }

  console.error('Unknown error', err);

  return res.status(500).json({
    error: '500 - Internal Server Error',
    message: (err as Error).message,
  });
};
