import { Router, Request, Response } from 'express';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { maybeCacheResponse } from 'utils/cache';
import { toResponse } from 'utils/http-response';
import { asyncRoute } from 'utils/route-wrapper';

const router = Router();

// indexer.sovryn.app/dex/30/tokens
router.get(
  '/',
  asyncRoute(async (req: Request, res: Response) =>
    maybeCacheResponse(
      res,
      `/dex/${req.network.chainId}/tokens`,
      async () => {
        // todo: load swapable tokens from database...
        return [];
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data))),
  ),
);

// indexer.sovryn.app/dex/30/tokens/available
router.get(
  '/available',
  asyncRoute(async (req: Request, res: Response) =>
    maybeCacheResponse(
      res,
      `/dex/${req.network.chainId}/tokens/available`,
      async () => {
        // todo: load tokens from github...
        return [];
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data))),
  ),
);

export default router;
