import { Router } from 'express';

import { toResponse } from 'utils/http-response';
import { validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';

const router = Router();

router.get(
  '/pool_balances',
  asyncRoute(async (req, res) => {
    const { cursor, limit } = validatePaginatedRequest(req);
    return res.json(toResponse([]));
  }),
);

export default router;
