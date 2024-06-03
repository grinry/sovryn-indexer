import { NextFunction, Request, Response } from 'express';

type WrapperArgs = (req: Request, res: Response, next: NextFunction) => Promise<void | Response>;

export const asyncRoute = (fn: WrapperArgs) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);
