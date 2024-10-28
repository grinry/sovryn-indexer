import { Router, Request, Response } from 'express';

import { networks } from 'loader/networks';
import { toResponse } from 'utils/http-response';
import { asyncRoute } from 'utils/route-wrapper';

const router = Router();

router.get(
  '/',
  asyncRoute(async (req: Request, res: Response) => res.json(toResponse(networks.listChains()))),
);

export default router;
