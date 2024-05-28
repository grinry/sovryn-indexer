import { Router, Request, Response, NextFunction } from 'express';
import gql from 'graphql-tag';

import { networks } from 'loader/networks';
import { maybeCache } from 'utils/cache';
import { toResponse } from 'utils/http-response';

const router = Router();

router.get('/chains', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = await maybeCache(
      'chains',
      async () =>
        networks.networks.map((network) => {
          const chain = networks.getNetwork(network);
          return {
            name: network,
            chainId: chain.chainId,
            features: chain.features,
          };
        }),
      60,
    );

    return res.json(toResponse(data));
  } catch (e) {
    return next(e);
  }
});

router.get('/tokens', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // todo: retrieve tokens from database
    // todo: put tokens to the database using the subgraph and cron job
    const { data } = await maybeCache(
      'tokens',
      async () => {
        const query = gql`
          query ($chainId: Int!) {
            tokens {
              id
            }
          }
        `;

        const data = await networks.getNetwork('rootstock').legacy.queryFromSubgraph(query, { chainId: 30 });
        return data;
      },
      5,
    );

    return res.json(toResponse(data));
  } catch (e) {
    return next(e);
  }
});

export default router;
