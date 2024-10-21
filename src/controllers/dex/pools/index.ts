import { Router, Request, Response } from 'express';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { poolsRepository } from 'database/repository/pools-repository';
import { maybeCacheResponse } from 'utils/cache';
import { NotFoundError } from 'utils/custom-error';
import { toResponse } from 'utils/http-response';
import { asyncRoute } from 'utils/route-wrapper';

const router = Router();

router.get(
  '/',
  asyncRoute(async (req: Request, res: Response) =>
    maybeCacheResponse(
      res,
      `/dex/${req.network.chainId}/pools`,
      async () => poolsRepository.listForChain(req.network.chainId),
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data))),
  ),
);

router.get(
  '/:id',
  asyncRoute(async (req: Request, res: Response) =>
    maybeCacheResponse(
      res,
      'chains',
      async () => {
        const pool = await poolsRepository.getByIdentifier(req.network.chainId, req.params.id);
        if (!pool) {
          throw new NotFoundError('Pool not found');
        }
        return pool;
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data))),
  ),
);

export default router;
