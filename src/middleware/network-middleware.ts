import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

import { networks } from 'loader/networks';
import { Chain } from 'loader/networks/chain-config';
import { NetworkFeature } from 'loader/networks/types';
import { BadRequestError } from 'utils/custom-error';
import { validate } from 'utils/validation';

export const validateChainId = (req: Request, optional = false) =>
  Number(
    validate<{ chainId: number }>(
      Joi.object({
        chainId: optional
          ? Joi.string()
              .optional()
              .empty('')
              .valid(...networks.listChains().flatMap((chain) => [chain.chainId.toString(), chain.chainIdHex]))
              .default('0')
          : Joi.string()
              .required()
              .valid(...networks.listChains().flatMap((chain) => [chain.chainId.toString(), chain.chainIdHex])),
      }),
      req.query,
      { allowUnknown: true },
    ).chainId,
  );

export enum NetworkFeatureFlag {
  some = 'some',
  all = 'all',
}

export const networkAwareMiddleware =
  (
    features: NetworkFeature[] = [NetworkFeature.sdex, NetworkFeature.legacy],
    flag: NetworkFeatureFlag = NetworkFeatureFlag.some,
  ) =>
  (req: Request, res: Response, next: NextFunction) => {
    const chainId = validateChainId(req);
    const network = networks.getByChainId(chainId);

    if (
      !network ||
      (network && flag === NetworkFeatureFlag.all
        ? !features.every((feature) => network.hasFeature(feature))
        : !features.some((feature) => network.hasFeature(feature)))
    ) {
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
