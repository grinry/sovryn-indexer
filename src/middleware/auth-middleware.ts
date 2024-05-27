import { Request, Response, NextFunction } from 'express';

import { CustomError } from 'utils/custom-error';

export const checkAuthorization = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.get('Authorization')?.replace('Bearer ', '')?.trim();

  if (!authHeader) {
    const customError = new CustomError(400, 'Unauthorized', 'Authorization header not provided');
    return next(customError);
  }

  try {
    // if (!(req as any).user) {
    //   throw new CustomError(401, 'Unauthorized', 'User not found');
    // }

    res.header('Content-Type', 'application/json');

    return next();
  } catch (err) {
    console.error('checkAuthorization failed', err);
    return next();
    // const customError = new CustomError(401, 'Unauthorized', 'Failed to authenticate.', null, err);
    // return next(customError);
  }
};
