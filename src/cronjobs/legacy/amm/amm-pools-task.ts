import { CronJob } from 'cron';
import dayjs from 'dayjs';
import { and, eq, inArray, sql } from 'drizzle-orm';
import gql from 'graphql-tag';
import _, { isNil } from 'lodash';
import { bignumber } from 'mathjs';

import { db } from 'database/client';
import { tAmmPools, tokens } from 'database/schema';
import { networks } from 'loader/networks';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { NetworkFeature } from 'loader/networks/types';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:legacy:amm_pools' });

export const ammPoolsTask = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Retrieving AMM pools data.');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.legacy)) {
      await processLegacyChain(item.legacy);
    }
  }

  childLogger.info('AMM pools data retrieved.');
  ctx.start();
};

async function processLegacyChain(chain: LegacyChain) {
  const yesterdayBlock = await getBlockNumberFromTimestamp(chain, dayjs().subtract(1, 'day').unix());

  const [pools, yesterdayVolumes] = await Promise.all([queryPoolData(chain), queryPoolVolume(chain, yesterdayBlock)]);

  const tokenList = await db.query.tokens.findMany({
    columns: {
      id: true,
      symbol: true,
      address: true,
    },
    where: and(
      eq(tokens.chainId, chain.context.chainId),
      inArray(
        tokens.address,
        pools.liquidityPools.map((x) => [x.token0.id, x.token1.id]).flatMap((x) => x),
      ),
    ),
  });

  const items = parseData(sortByPairs(pools.liquidityPools, yesterdayVolumes), tokenList);
  const tp = items.map((item) => ({
    chainId: chain.context.chainId,
    pool: item.poolId,
    token1Id: item.baseTokenId,
    token2Id: item.quoteTokenId,
    token1Volume: item.baseVolume24h,
    token2Volume: item.quoteVolume24h,
  }));

  childLogger.info({ chain: chain.context.chainId, items: items.length, tp }, 'Processing AMM pools data...');

  const result = await db
    .insert(tAmmPools)
    .values(
      items.map((item) => ({
        chainId: chain.context.chainId,
        pool: item.poolId,
        token1Id: item.baseTokenId,
        token2Id: item.quoteTokenId,
        token1Volume: item.baseVolume24h,
        token2Volume: item.quoteVolume24h,
      })),
    )
    .onConflictDoUpdate({
      target: [tAmmPools.chainId, tAmmPools.pool],
      set: {
        token1Volume: sql`excluded.token1_volume`,
        token2Volume: sql`excluded.token2_volume`,
      },
    })
    .returning({ id: tAmmPools.id })
    .execute();

  childLogger.info({ chain: chain.context.chainId, pools: result.length }, 'AMM pools data processed.');
}

type LiquidityPool = {
  id: string;
  type: number;
  token0: { id: string };
  token1: { id: string };
  connectorTokens: { token: { id: string }; totalVolume: string }[];
};

type PartialLiquidityPool = Pick<LiquidityPool, 'id' | 'connectorTokens'>;

const getBlockNumberFromTimestamp = (chain: LegacyChain, timestamp: number) =>
  chain
    .queryFromSubgraph<{ transactions: { blockNumber: number }[] }>(
      gql`
        query ($timestamp: Int!) {
          transactions(where: { timestamp_lte: $timestamp }, orderBy: timestamp, orderDirection: desc, first: 1) {
            blockNumber
          }
        }
      `,
      { timestamp },
    )
    .then((data) => data.transactions[0].blockNumber);

const queryPoolData = (chain: LegacyChain) =>
  chain.queryFromSubgraph<{ liquidityPools: LiquidityPool[] }>(
    gql`
      query {
        liquidityPools(where: { activated: true }) {
          id
          type
          token0 {
            id
          }
          token1 {
            id
          }
          connectorTokens {
            token {
              id
            }
            totalVolume
          }
        }
      }
    `,
  );

const queryPoolVolume = (chain: LegacyChain, block: number) =>
  chain
    .queryFromSubgraph<{
      liquidityPools: PartialLiquidityPool[];
    }>(
      gql`
        query ($block: Int!) {
          liquidityPools(where: { activated: true }, block: { number: $block }) {
            id
            connectorTokens {
              token {
                id
              }
              totalVolume
            }
          }
        }
      `,
      { block },
    )
    .then((data) => data.liquidityPools || []);

const sortByPairs = (pools: LiquidityPool[], day: PartialLiquidityPool[]) =>
  pools.map((item) => {
    const yesterday = day.find((x) => x.id === item.id);
    return {
      current: item,
      yesterday: !isNil(yesterday) ? yesterday.connectorTokens : item.connectorTokens,
    };
  });

const parseData = (
  items: ReturnType<typeof sortByPairs>,
  tokenList: { id: number; symbol: string; address: string }[],
) =>
  items.map((item) => {
    const isBaseTokenConnector0 = item.current.connectorTokens[0].token.id === item.current.token0.id;

    const baseTokenId = tokenList.find((x) => x.address === item.current.token0.id)?.id;
    const quoteTokenId = tokenList.find((x) => x.address === item.current.token1.id)?.id;

    const currenBaseVolume = parseFloat(
      isBaseTokenConnector0 ? item.current.connectorTokens[0].totalVolume : item.current.connectorTokens[1].totalVolume,
    );
    const currentQuoteVolume = parseFloat(
      isBaseTokenConnector0 ? item.current.connectorTokens[1].totalVolume : item.current.connectorTokens[0].totalVolume,
    );
    const dayBaseVolume = parseFloat(
      isBaseTokenConnector0 ? item.yesterday[0].totalVolume : item.yesterday[1].totalVolume,
    );
    const dayQuoteVolume = parseFloat(
      isBaseTokenConnector0 ? item.yesterday[1].totalVolume : item.yesterday[0].totalVolume,
    );

    // todo: retrieve prices from price table, inside controller instead of here...

    return {
      poolId: item.current.id,
      baseTokenId,
      quoteTokenId,
      baseVolume24h: bignumber(currenBaseVolume).minus(dayBaseVolume).toFixed(18),
      quoteVolume24h: bignumber(currentQuoteVolume).minus(dayQuoteVolume).toFixed(18),
    };
  });
