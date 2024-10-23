import { CronJob } from 'cron';
import dayjs from 'dayjs';
import { and, eq, lte, sql } from 'drizzle-orm';
import { ZeroAddress } from 'ethers';
import gql from 'graphql-tag';

import { db } from 'database/client';
import { tokenRepository } from 'database/repository/token-repository';
import { usdDailyPricesTable, usdHourlyPricesTable, usdPricesTable } from 'database/schema';
import { networks } from 'loader/networks';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { NetworkFeature } from 'loader/networks/types';
import { CurrentPrice, prepareDataToStore, Price } from 'loader/usd-prices/usd-price-store';
import { areAddressesEqual } from 'utils/compare';
import { floorDate } from 'utils/date';
import { getFlag, setFlag } from 'utils/flag';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'price-feed-task' });

const BLOCKS = 25;
const START_BLOCK = 4580025;

export const priceFeedTask = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Price feed task start.');

  try {
    const items = networks.listChains();

    for (const item of items) {
      if (item.hasFeature(NetworkFeature.legacy)) {
        await processLegacyChain(item.legacy);
      }
    }

    childLogger.info('Price feed task ended.');
    ctx.start();
  } catch (error) {
    childLogger.error({ error }, 'Price feed task failed.');
    ctx.start();
  }
};

const DLLR = '0xc1411567d2670e24d9c4daaa7cda95686e1250aa';

export const processLegacyChain = async (chain: LegacyChain) => {
  const key = `price-feed-${chain.context.chainId}-4`;
  const currentBlock = await chain.context.rpc.getBlockNumber();
  const savedBlock = await getFlag(key).then((value) => (value ? Number(value) : START_BLOCK));

  if (currentBlock < savedBlock) {
    childLogger.info(
      `Skipping chain ${chain.context.chainId} as current block ${currentBlock} is less than saved block ${savedBlock}.`,
    );
    return;
  }

  const tokens = await tokenRepository.listForChain(chain.context.chainId);
  const stablecoins = await tokenRepository.getStablecoin(chain.context);

  const nextBlock = savedBlock + BLOCKS;
  await searchBlock(chain, nextBlock, currentBlock, tokens, [stablecoins]);
};

const searchBlock = async (
  chain: LegacyChain,
  blockNumber: number,
  lastBlock: number | undefined,
  tokens: Token[],
  stablecoins: Token[],
) => {
  lastBlock = lastBlock ?? (await chain.context.rpc.getBlockNumber());

  if (blockNumber >= lastBlock) {
    childLogger.info({ blockNumber, lastBlock }, 'Up to date. Stop processing.');
    return;
  }

  childLogger.info({ blockNumber, lastBlock }, 'Processing history prices on block.');

  const date = await chain.context.rpc
    .getBlock(blockNumber)
    .then((block) => floorDate(new Date(block.timestamp * 1000)));

  const items = await chain
    .queryFromSubgraph<{ tokens: { id: string; lastPriceUsd: string }[] }>(
      gql`
    query {
      tokens(where: { id_in: ["${chain.nativeTokenWrapper}", "${DLLR}"]}, block: { number: ${blockNumber} }) {
        id
        lastPriceUsd
      }
    }
  `,
    )
    .then((data) => data.tokens);

  logger.info({ items, blockNumber }, 'Retrieved prices from subgraph');

  if (items.length > 0) {
    const toAdd: Price[] = items
      .map((item) => {
        let token;

        // if token is native token wrapper, assign data to native token
        if (areAddressesEqual(item.id, chain.nativeTokenWrapper)) {
          token = tokens.find((token) => areAddressesEqual(token.address, ZeroAddress));
        }
        // if token is DLLR, assign data to ZUSD
        else if (areAddressesEqual(item.id, DLLR) && blockNumber >= 421131) {
          // 421131 ZUSD deployed on this block
          token = tokens.find((token) => areAddressesEqual(token.address, chain.config.zusdToken));
        }

        if (!token) {
          return null;
        }

        return {
          id: token.id,
          chainId: token.chainId,
          address: token.address,
          decimals: token.decimals,
          value: item.lastPriceUsd,
          date,
        } satisfies Price;
      })
      .filter((item) => Boolean(item));

    await Promise.allSettled([
      storeLastPrices(toAdd, date),
      storeLastHourlyPrices(toAdd, date),
      storeLastDailyPrices(toAdd, date),
    ]).then((results) => {
      results.forEach((result) => {
        if (result.status === 'rejected') {
          logger.error(result.reason, 'Failed to store prices');
        }
      });
    });

    await setFlag(`price-feed-${chain.context.chainId}-4`, blockNumber.toString());
  } else {
    childLogger.info({ blockNumber }, 'No prices to add for legacy chain');
    await setFlag(`price-feed-${chain.context.chainId}-4`, blockNumber.toString());
  }

  await searchBlock(chain, blockNumber + BLOCKS, lastBlock, tokens, stablecoins);
};

type Token = {
  id: number;
  chainId: number;
  decimals: number;
  address: string;
};

type Table = typeof usdPricesTable | typeof usdHourlyPricesTable | typeof usdDailyPricesTable;

async function storeLastPrices(prices: Price[], date: Date) {
  // find last stored price for each token and write only if it's different
  const current = await loadLastStoredPrices(usdPricesTable, date);
  const storeData = prepareDataToStore(current, prices);

  if (storeData.length > 0) {
    logger.info({ storeData }, 'Prepared data to store (minute)');
    await db
      .insert(usdPricesTable)
      .values(storeData)
      .onConflictDoUpdate({
        target: [usdPricesTable.tokenId, usdPricesTable.tickAt],
        set: {
          value: sql`excluded.value`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
        },
      })
      .execute();
    return storeData;
  }

  return storeData;
}

async function storeLastHourlyPrices(prices: Price[], date: Date) {
  const items: Price[] = prices.map((item) => ({
    ...item,
    date: dayjs(item.date).startOf('hour').toDate(),
  }));

  const current = await loadLastStoredPrices(usdHourlyPricesTable, date);
  const storeData = prepareDataToStore(current, items);

  if (storeData.length > 0) {
    logger.info({ storeData }, 'Prepared data to store (hourly)');
    await db
      .insert(usdHourlyPricesTable)
      .values(storeData)
      .onConflictDoUpdate({
        target: [usdHourlyPricesTable.tokenId, usdHourlyPricesTable.tickAt],
        set: {
          value: sql`excluded.value`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
        },
      })
      .execute();
  }
}

async function storeLastDailyPrices(prices: Price[], date: Date) {
  const items = prices.map((item) => ({
    ...item,
    date: dayjs(item.date).startOf('day').toDate(),
  }));

  const current = await loadLastStoredPrices(usdDailyPricesTable, date);

  const storeData = prepareDataToStore(current, items);

  if (storeData.length > 0) {
    logger.info({ storeData }, 'Prepared data to store (daily)');
    await db
      .insert(usdDailyPricesTable)
      .values(storeData)
      .onConflictDoUpdate({
        target: [usdDailyPricesTable.tokenId, usdDailyPricesTable.tickAt],
        set: {
          value: sql`excluded.value`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
        },
      })
      .execute();
  }
}

async function loadLastStoredPrices(table: Table, date: Date): Promise<CurrentPrice[]> {
  const dateMap = db
    .select({
      tokenId: table.tokenId,
      date: sql<string>`max(${table.tickAt})`.as('date'),
    })
    .from(table)
    .where(lte(table.tickAt, date))
    .groupBy(table.tokenId)
    .as('sq_date');
  return db
    .select({
      id: table.id,
      tokenId: table.tokenId,
      value: table.value,
      high: table.high,
      low: table.low,
      tickAt: dateMap.date,
    })
    .from(table)
    .innerJoin(dateMap, and(eq(table.tokenId, dateMap.tokenId), eq(table.tickAt, dateMap.date)))
    .execute();
}
