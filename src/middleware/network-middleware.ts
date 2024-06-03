import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

import { networks } from 'loader/networks';
import { Chain } from 'loader/networks/chain-config';
import { NetworkFeature } from 'loader/networks/types';
import { BadRequestError } from 'utils/custom-error';
import { validate } from 'utils/validation';

export const networkAwareMiddleware =
  (features: NetworkFeature[] = [NetworkFeature.sdex, NetworkFeature.legacy]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const { chainId } = validate<{ chainId: number }>(
      Joi.object({
        chainId: Joi.string().required(),
      }),
      req.query,
      { allowUnknown: true },
    );

    const network = networks.getByChainId(Number(chainId));

    if (!network || !features.every((feature) => network.hasFeature(feature))) {
      throw new BadRequestError('Unsupported network: ' + chainId);
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
