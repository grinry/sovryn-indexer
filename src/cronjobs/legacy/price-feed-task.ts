import { CronJob } from 'cron';
import dayjs from 'dayjs';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { uniqBy } from 'lodash';

import { db } from 'database/client';
import { tokenRepository } from 'database/repository/token-repository';
import { prices, usdDailyPricesTable, usdHourlyPricesTable, usdPricesTable } from 'database/schema';
import { networks } from 'loader/networks';
import { CurrentPrice, prepareDataToStore, Price } from 'loader/usd-prices/usd-price-store';
import { floorDate } from 'utils/date';
import { getFlag, setFlag } from 'utils/flag';
import { logger } from 'utils/logger';
import { sleep } from 'utils/sleep';

const childLogger = logger.child({ module: 'price-feed-task' });

const SKIP_MINUTES = 1;
const SLEEP_TIME = 20;

// todo: when completed, find all DLLR and WBTC prices stored and make copy of them to ZUSD and RBTC (zusd after certain date maybe)
export const priceFeedTask = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Price migration task start.');

  try {
    const key = `price-feed-migration`;
    const currentTime = new Date();
    let savedTime = await getFlag(key).then((value) =>
      value ? dayjs(value).add(SKIP_MINUTES, 'minutes').toDate() : null,
    );

    if (savedTime === null) {
      // find oldest price row in the table
      const oldestPrice = await db.query.prices.findFirst({
        columns: {
          tickAt: true,
        },
        orderBy: asc(prices.tickAt),
      });
      console.log({ oldestPrice });

      if (oldestPrice) {
        savedTime = floorDate(oldestPrice.tickAt);
      }
    }

    if (savedTime === null) {
      childLogger.info('No price feed data found.');
      return;
    }

    if (currentTime.getTime() < savedTime.getTime()) {
      childLogger.info('Price feed migration already completed.');
      return;
    }

    const tokens = await Promise.all(
      networks.listChains().map((chain) => tokenRepository.listForChain(chain.chainId)),
    ).then((items) => items.flatMap((item) => item));

    const stablecoins = await Promise.all(
      networks.listChains().map((chain) => tokenRepository.getStablecoin(chain)),
    ).then((items) => uniqBy(items, 'id').filter((item) => Boolean(item)));

    searchBlock(savedTime, currentTime, tokens, stablecoins);

    childLogger.info('Price feed task ended.');
    ctx.start();
  } catch (error) {
    childLogger.error(error, 'Price migration task failed.');
    ctx.start();
  }
};

type Token = {
  id: number;
  chainId: number;
  decimals: number;
  address: string;
};

const searchBlock = async (date: Date, now: Date, tokens: Token[], stablecoins: Token[]) => {
  now = now ?? new Date();

  if (date.getTime() > now.getTime()) {
    childLogger.info('Up to date. Stop processing.');
    return;
  }

  childLogger.info({ date, now }, 'Processing history prices.');

  const items = await db
    .select()
    .from(prices)
    .where(
      and(
        inArray(
          prices.baseId,
          tokens.map((item) => item.id),
        ),
        inArray(
          prices.quoteId,
          stablecoins.map((item) => item.id),
        ),
        eq(prices.tickAt, date),
      ),
    );

  const toAdd: Price[] = items
    .map((item) => {
      const token = tokens.find((token) => token.id === item.baseId);
      const stablecoin = stablecoins.find((token) => token.id === item.quoteId);

      if (!token || !stablecoin) {
        return null;
      }

      return {
        id: token.id,
        chainId: token.chainId,
        address: token.address,
        decimals: token.decimals,
        value: item.value,
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

  await setFlag(`price-feed-migration`, date.toISOString());
  await sleep(SLEEP_TIME);
  await searchBlock(dayjs(date).add(SKIP_MINUTES, 'minute').toDate(), now, tokens, stablecoins);
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
