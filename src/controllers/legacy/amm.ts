import { Router } from 'express';
import Joi from 'joi';

import { LONG_CACHE_TTL, MEDIUM_CACHE_TTL } from 'config/constants';
import { apyDayRepository } from 'database/repository/apy-day-repository';
import { maybeCacheResponse } from 'utils/cache';
import { toResponse } from 'utils/http-response';
import { asyncRoute } from 'utils/route-wrapper';
import { validate } from 'utils/validation';

import { getOnChainData, parseApyHistoryData } from './amm.utils';

const router = Router();

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const { chainId } = req.network;
    return maybeCacheResponse(
      res,
      `legacy/amm/${chainId}`,
      async () => {
        const rows = await apyDayRepository.getAllPoolData(chainId).execute();
        return parseApyHistoryData(rows);
      },
      MEDIUM_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

router.get(
  '/pool/:pool',
  asyncRoute(async (req, res) => {
    const { chainId } = req.network;
    const { pool } = validate<{ pool: string }>(
      Joi.object({
        pool: Joi.string().required().length(42),
      }),
      req.params,
    );

    return maybeCacheResponse(
      res,
      `legacy/amm/${chainId}/pool/${pool}`,
      async () => {
        const rows = await apyDayRepository.getOnePoolData(chainId, pool).execute();
        return parseApyHistoryData(rows);
      },
      MEDIUM_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

router.get(
  '/today/:pool',
  asyncRoute(async (req, res) => {
    const { chainId } = req.network;
    const { pool } = validate<{ pool: string }>(
      Joi.object({
        pool: Joi.string().required().length(42),
      }),
      req.params,
    );

    return maybeCacheResponse(
      res,
      `legacy/amm/${chainId}/today/${pool}`,
      async () => apyDayRepository.getLastPoolApy(chainId, pool),
      MEDIUM_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

router.get(
  '/volume',
  asyncRoute(async (req, res) => {
    const { chainId } = req.network;
    return maybeCacheResponse(
      res,
      `legacy/amm/${chainId}/volume`,
      async () => {
        const rows = await apyDayRepository.getAllPoolData(chainId, 90).execute();
        return parseApyHistoryData(rows);
      },
      LONG_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

router.get(
  '/volume/pool/:pool',
  asyncRoute(async (req, res) => {
    const { chainId } = req.network;
    const { pool } = validate<{ pool: string }>(
      Joi.object({
        pool: Joi.string().required().length(42),
      }),
      req.params,
    );
    return maybeCacheResponse(
      res,
      `legacy/amm/${chainId}/volume/pool/${pool}`,
      async () => {
        const rows = await apyDayRepository.getOnePoolData(chainId, pool, 90).execute();
        return parseApyHistoryData(rows);
      },
      LONG_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

router.get(
  '/pool-balance/:pool',
  asyncRoute(async (req, res) => {
    const { chainId } = req.network;
    const { pool } = validate<{ pool: string }>(
      Joi.object({
        pool: Joi.string().required().length(42),
      }),
      req.params,
    );
    return maybeCacheResponse(
      res,
      `legacy/amm/${chainId}/pool-balance/${pool}`,
      async () => {
        const balanceData = await getOnChainData(req.network.legacy, pool);
        const apyData = await apyDayRepository.getLastPoolApy(chainId, pool);
        return {
          ...balanceData,
          yesterdayApy: apyData.map((item) => ({
            pool: item.pool,
            pool_token: item.poolToken,
            activity_date: item.date,
            apy: item.totalApy,
          })),
        };
      },
      LONG_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

export default router;
