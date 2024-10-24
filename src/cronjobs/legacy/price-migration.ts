import { CronJob } from 'cron';
import dayjs from 'dayjs';
import { and, eq, lte, sql } from 'drizzle-orm';
import { bignumber } from 'mathjs';

import { findEndPrice, loadPoolPrices, PoolWithIndex } from 'cronjobs/helpers/ambient-query';
import { db } from 'database/client';
import { tokenRepository } from 'database/repository/token-repository';
import { usdDailyPricesTable, usdHourlyPricesTable, usdPricesTable } from 'database/schema';
import { networks } from 'loader/networks';
import { SdexChain } from 'loader/networks/sdex-chain';
import { NetworkFeature } from 'loader/networks/types';
import { CurrentPrice, prepareDataToStore, Price } from 'loader/usd-prices/usd-price-store';
import { floorDate } from 'utils/date';
import { getFlag, setFlag } from 'utils/flag';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'price-feed-task' });

const BLOCKS = 1000;
const START_BLOCK = 1129000; // first pool was made around this block
const END_BLOCK = 7890000; // we already have prices from this block

export const priceFeedTask = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Price feed task start.');

  try {
    const items = networks.listChains();

    for (const item of items) {
      if (item.hasFeature(NetworkFeature.sdex)) {
        await processChain(item.sdex);
      }
    }

    childLogger.info('Price feed task ended.');
    ctx.start();
  } catch (error) {
    childLogger.error({ error }, 'Price feed task failed.');
    ctx.start();
  }
};

export const processChain = async (chain: SdexChain) => {
  const key = `price-feed-${chain.context.chainId}-5`;
  const currentBlock = await chain.context.rpc.getBlockNumber();
  const savedBlock = await getFlag(key).then((value) => (value ? Number(value) : START_BLOCK));

  if (currentBlock < savedBlock) {
    childLogger.info(
      `Skipping chain ${chain.context.chainId} as current block ${currentBlock} is less than saved block ${savedBlock}.`,
    );
    return;
  }

  if (savedBlock >= END_BLOCK) {
    childLogger.info(`No need to migrate anymore... 1...`);
    return;
  }

  const tokens = await tokenRepository.listForChain(chain.context.chainId);
  const stablecoin = await tokenRepository.getStablecoin(chain.context);

  const nextBlock = savedBlock + BLOCKS;
  await searchBlock(chain, nextBlock, currentBlock, tokens, stablecoin);
};

const searchBlock = async (
  chain: SdexChain,
  blockNumber: number,
  lastBlock: number | undefined,
  tokens: Token[],
  stablecoin: Token,
) => {
  lastBlock = lastBlock ?? (await chain.context.rpc.getBlockNumber());

  if (blockNumber >= lastBlock) {
    childLogger.info({ blockNumber, lastBlock }, 'Up to date. Stop processing.');
    return;
  }

  if (blockNumber >= END_BLOCK) {
    childLogger.info({ lastBlock, blockNumber, END_BLOCK }, `No need to migrate anymore... 2`);
    return;
  }

  childLogger.info({ blockNumber, lastBlock }, 'Processing history prices on block.');

  const date = await chain.context.rpc
    .getBlock(blockNumber)
    .then((block) => floorDate(new Date(block.timestamp * 1000)));

  const { pools } = await chain.queryPools(1000);
  const poolsWithIndexes = pools.map((item) => [item.base, item.quote, item.poolIdx] as PoolWithIndex);

  const goal = chain.context.stablecoinAddress;
  const items = await loadPoolPrices(poolsWithIndexes, chain, tokens, blockNumber);

  if (items.length > 0) {
    const toAdd: Price[] = [];

    for (const token of tokens) {
      if (token.id === stablecoin.id) {
        toAdd.push({
          ...token,
          value: '1',
          date,
        });
        continue;
      }

      try {
        const price = findEndPrice(token.address, goal, pools, poolsWithIndexes, items);

        // invalid price, skip
        if (bignumber(price).eq(0)) {
          continue;
        }

        toAdd.push({
          ...token,
          value: price,
          date,
        });
      } catch (error) {
        logger.error(error, 'Error while preparing Sdex token' + token.id);
      }
    }

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

    await setFlag(`price-feed-${chain.context.chainId}-5`, blockNumber.toString());
  } else {
    childLogger.info({ blockNumber }, 'No prices to add for sdex chain');
    await setFlag(`price-feed-${chain.context.chainId}-5`, blockNumber.toString());
  }

  await searchBlock(chain, blockNumber + BLOCKS, lastBlock, tokens, stablecoin);
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
