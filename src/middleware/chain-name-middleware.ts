import { Request, Response, NextFunction } from 'express';

import { networks } from 'loader/networks';
import { Chain } from 'loader/networks/chain-config';
import { BadRequestError } from 'utils/custom-error';

export const chainNameAwareMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const network = networks.getNetwork(req.params.chain) ?? networks.getByChainId(Number(req.params.chain));

  if (!network) {
    throw new BadRequestError('Unsupported network: ' + req.params.chain);
  }

  req.network = network;

  return next();
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    export interface Request {
      network: Chain;
    }

    interface NetworkAwareRequest extends Request {
      network: Chain;
    }
  }
}
