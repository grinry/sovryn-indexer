import { eq, and, sql, desc, between } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Router, Request, Response } from 'express';

import { DEFAULT_CACHE_TTL } from 'config/constants';
import { db } from 'database/client';
import { tokens } from 'database/schema';
import { chains } from 'database/schema/chains';
import { prices } from 'database/schema/prices';
import { networks } from 'loader/networks';
import { validateChainId } from 'middleware/network-middleware';
import { maybeCacheResponse } from 'utils/cache';
import { toPaginatedResponse, toResponse } from 'utils/http-response';
import { createApiQuery, OrderBy, validatePaginatedRequest } from 'utils/pagination';
import { asyncRoute } from 'utils/route-wrapper';
import dayjs from 'dayjs';
import _ from 'lodash';
import { NetworkFeature } from 'loader/networks/types';

const router = Router();

router.get(
  '/chains',
  asyncRoute(async (req: Request, res: Response) =>
    maybeCacheResponse(
      res,
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
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data))),
  ),
);

router.get(
  '/tokens',
  asyncRoute(async (req: Request, res: Response) => {
    const chainId = validateChainId(req, true);
    const p = validatePaginatedRequest(req);
    return maybeCacheResponse(
      res,
      `tokens/${chainId ?? 0}/${p.limit}/${p.cursor}`,
      async () => {
        const quoteToken = alias(tokens, 'quote_token');
        const chain = alias(chains, 'chain');

        const sb = db
          .selectDistinctOn([prices.baseId, prices.quoteId], {
            baseId: prices.baseId,
            quoteId: prices.quoteId,
            value: prices.value,
            // tickAt: prices.tickAt,
          })
          .from(prices)
          .orderBy(desc(prices.baseId), desc(prices.quoteId), desc(prices.tickAt))
          .as('sb');

        const tokenQuery = db
          .select({
            symbol: tokens.symbol,
            name: tokens.name,
            decimals: tokens.decimals,
            chainId: tokens.chainId,
            address: tokens.address,
            usdPrice: sql`${sb.value}`.as('last_usd_price'),
            // usdPriceTime: sb.tickAt,
          })
          .from(tokens)
          .innerJoin(chain, eq(tokens.chainId, chain.id))
          .innerJoin(quoteToken, and(eq(quoteToken.chainId, chain.id), eq(quoteToken.address, chain.stablecoinAddress)))
          .innerJoin(sb, and(eq(sb.baseId, tokens.id), eq(sb.quoteId, quoteToken.id)))
          .$dynamic();

        const api = createApiQuery('address', OrderBy.asc, (key) => tokens[key], p);
        const items = await api
          .applyPagination(!chainId ? tokenQuery : tokenQuery.where(eq(tokens.chainId, chainId)))
          .execute();
        return api.getMetadata(items);
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toPaginatedResponse(data)));
  }),
);

router.get(
  '/chart',
  asyncRoute(async (req: Request, res: Response) => {
    const chainId = validateChainId(req, true);
    const baseTokenAddress = String(req.query.base);
    const quoteTokenAddress = String(req.query.quote);

    return maybeCacheResponse(
      res,
      `chart/${chainId ?? 0}/${baseTokenAddress}/${quoteTokenAddress}`,
      async () => {
        const startTimestamp = dayjs().subtract(10, 'hours').toDate();
        const endTimestamp = dayjs().toDate();

        const tokens = await db.query.tokens.findMany({
          columns: {
            id: true,
            chainId: true,
            address: true,
            decimals: true,
          },
        });

        const tokensByChain = _.groupBy(tokens, (item) => item.chainId);
        const chains = Object.keys(tokensByChain).map((item) => networks.getByChainId(Number(item))!);
        const chain = chains.find((item) => item.chainId === chainId);

        const chainType = chain.hasFeature(NetworkFeature.legacy) ? chain.legacy : chain.sdex;

        const baseTokenId = tokens.find((token) => token.address === baseTokenAddress.toLowerCase())?.id;
        const quoteTokenId = tokens.find((token) => token.address === quoteTokenAddress.toLowerCase())?.id;
        const stablecoinId = tokens.find((token) => token.address === chainType.context.stablecoinAddress)?.id;

        const baseTokenPrices = await db
          .select({
            baseId: prices.baseId,
            quoteId: prices.quoteId,
            date: sql`date_trunc('minute', ${prices.tickAt})`.mapWith(String).as('date'),
            value: prices.value,
          })
          .from(prices)
          .where(
            and(
              eq(prices.baseId, baseTokenId),
              eq(prices.quoteId, stablecoinId),
              between(prices.tickAt, startTimestamp, endTimestamp),
            ),
          );

        const quoteTokenPrices = await db
          .select({
            baseId: prices.baseId,
            quoteId: prices.quoteId,
            date: sql`date_trunc('minute', ${prices.tickAt})`.mapWith(String).as('date'),
            value: prices.value,
          })
          .from(prices)
          .where(
            and(
              eq(prices.baseId, quoteTokenId),
              eq(prices.quoteId, stablecoinId),
              between(prices.tickAt, startTimestamp, endTimestamp),
            ),
          );

        const result = baseTokenPrices.map((item) => {
          const quoteTokenEquivalent = quoteTokenPrices.find((price) => price.date === item.date);

          if (quoteTokenEquivalent.value !== '0') {
            return {
              baseId: item.baseId,
              quoteId: quoteTokenEquivalent.baseId,
              date: item.date,
              value: Number(item.value) / Number(quoteTokenEquivalent.value),
            };
          }

          return null;
        });

        return result;
      },
      DEFAULT_CACHE_TTL,
    ).then((data) => res.json(toResponse(data)));
  }),
);

export default router;
