import dayjs from 'dayjs';
import { sql, and, eq, between, lte, desc, or, inArray } from 'drizzle-orm';
import _ from 'lodash';
import { bignumber, max, min } from 'mathjs';

import { LONG_CACHE_TTL } from 'config/constants';
import { Timeframe } from 'controllers/main-controller.constants';
import { db } from 'database/client';
import { prices, tokens } from 'database/schema';
import { networks } from 'loader/networks';
import { maybeCache } from 'utils/cache';
import { ValidationError } from 'utils/custom-error';
import { analyzeSelectQuery } from 'utils/dev';
import { logger } from 'utils/logger';

import { Interval } from './types';

export const constructCandlesticks = async (intervals: Interval[], timeframe: number) => {
  const groups = groupIntervals(intervals, timeframe);

  return groups
    .filter((group) => group.length > 0)
    .map((item) => {
      const startTime = item[item.length - 1].date;
      const endTime = item[0].date;

      const open = item[item.length - 1].value;
      const close = item[0].value;

      const values = item.reduce((acc, curValue) => {
        acc.push(curValue.value);
        return acc;
      }, []);

      return {
        date: dayjs(endTime).unix(),
        start: startTime,
        end: endTime,
        open,
        close,
        high: max(...values).toString(),
        low: min(...values).toString(),
      };
    })
    .sort((a, b) => dayjs(b.start).unix() - dayjs(a.start).unix());
};

type PriceItem = {
  baseId: number;
  quoteId: number;
  date: dayjs.Dayjs;
  value: string;
  filled?: boolean;
};

export const getPrices = async (
  chainId: number,
  baseTokenAddress: string,
  quoteTokenAddress: string,
  startTimestamp: Date,
  endTimestamp: Date,
  timeframe: Timeframe,
) => {
  const _start = Date.now();
  const { baseTokenId, quoteTokenId, stablecoinId } = await maybeCache(
    `/chart/q/${chainId}/${baseTokenAddress}/${quoteTokenAddress}`,
    () => getTokenIds(chainId, baseTokenAddress, quoteTokenAddress),
    LONG_CACHE_TTL,
  ).then((data) => data.data);

  console.log('[GET TOKEN IDS] Time ', Date.now() - _start);

  if (!baseTokenId) {
    throw new ValidationError('Unsupported base token');
  }

  if (!quoteTokenId) {
    throw new ValidationError('Unsupported quote token');
  }

  if (!stablecoinId) {
    logger.error(
      { chainId, baseTokenAddress, quoteTokenAddress },
      'Unsupported stablecoin found. It was not supposed to happen...',
    );
    throw new ValidationError('Unsupported stablecoin');
  }

  const tokenData = await queryTokenStablecoins(
    baseTokenId,
    quoteTokenId,
    stablecoinId,
    startTimestamp,
    endTimestamp,
    timeframe,
  );

  console.log('[QUERY TOKEN STABLECOINS] Time ', Date.now() - _start);
  const baseTokenData = tokenData.filter((item) => item.baseId === baseTokenId);
  const quoteTokenData = tokenData.filter((item) => item.baseId === quoteTokenId);

  const result = baseTokenData
    .map((item) => {
      const quoteTokenEquivalent = quoteTokenData.find((price) => price.date === item.date);

      if (quoteTokenEquivalent.value !== '0') {
        return {
          baseId: item.baseId,
          quoteId: quoteTokenEquivalent.baseId,
          date: dayjs(item.date),
          value: bignumber(item.value).div(quoteTokenEquivalent.value).toString(),
        };
      }

      return null;
    })
    .sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix());

  console.log('[RESULT] Time ', Date.now() - _start);

  if (result.length === 0) {
    console.log('Time #1', Date.now() - _start);
    return [];
  }

  // todo: make use of the timeframe
  const unit = 'minute';

  let start = dayjs(startTimestamp).startOf(unit);
  const end = dayjs(endTimestamp).startOf(unit).unix();

  // Check if the start date has data, if not, find the closest older value and use it as a start
  if (!result.find((item) => item.date.unix() === start.unix())) {
    const baseTokenStartData = await queryTokenStartPrice(baseTokenId, stablecoinId, startTimestamp);
    const quoteTokenStartData = await queryTokenStartPrice(quoteTokenId, stablecoinId, startTimestamp);

    if (baseTokenStartData && quoteTokenStartData) {
      const quoteTokenEquivalent =
        quoteTokenStartData.value !== '0'
          ? bignumber(baseTokenStartData.value).div(quoteTokenStartData.value).toString()
          : '0';

      result.push({
        baseId: baseTokenStartData.baseId,
        quoteId: quoteTokenStartData.baseId,
        date: start,
        value: quoteTokenEquivalent,
      });
    } else {
      // no data found for the start date, set the start to the oldest date in the data
      start = result[result.length - 1].date;
    }
  }

  console.log('[RESULT 1] Time ', Date.now() - _start);

  // fill missing dates
  const existingDates = result.map((i) => i.date.unix());

  const filled: PriceItem[] = [];

  while (start.unix() <= end) {
    if (!existingDates.includes(start.unix())) {
      filled.push({
        baseId: baseTokenId,
        quoteId: quoteTokenId,
        date: start,
        value: '0',
        filled: true,
      });
    }
    start = start.clone().add(1, unit);
  }

  console.log('[WHILE] Time ', Date.now() - _start);

  // loop through the items and if value is with the filled flag, fill it with the previous value
  const items: PriceItem[] = [...filled, ...result].sort((a, b) => a.date.unix() - b.date.unix());

  for (let i = 0; i < items.length; i++) {
    if (items[i]?.filled) {
      const previousValue = items[i - 1]?.value;
      items[i] = {
        ...items[i],
        value: previousValue,
        // unset the filled flag
        filled: undefined,
      };
    }
  }

  console.log('[ITEMS] Time ', Date.now() - _start);

  // sort items from newest to oldest
  return items.sort((a, b) => b.date.unix() - a.date.unix());
};

const timeframeToSql = (timeframe: Timeframe) => {
  switch (timeframe) {
    case '1m':
    case '5m':
    case '10m':
    case '15m':
    case '30m':
      return sql`date_trunc('minute', ${prices.tickAt}, 'UTC')`;
    case '1h':
    case '4h':
    case '12h':
    default:
      return sql`date_trunc('hour', ${prices.tickAt}, 'UTC')`;
    case '1d':
    case '3d':
      return sql`date_trunc('day', ${prices.tickAt}, 'UTC')`;
    case '1w':
      return sql`date_trunc('week', ${prices.tickAt}, 'UTC')`;
    case '30d':
      return sql`date_trunc('month', ${prices.tickAt}, 'UTC')`;
  }
};

const queryTokenStablecoins = async (
  baseId: number,
  quoteId: number,
  stablecoinId: number,
  startTimestamp: Date,
  endTimestamp: Date,
  timeframe: Timeframe,
) => {
  const sb = db
    .select({
      baseId: prices.baseId,
      quoteId: prices.quoteId,
      date: timeframeToSql(timeframe).mapWith(String).as('date'),
      value: prices.value,
    })
    .from(prices)
    .where(
      and(
        inArray(prices.baseId, [baseId, quoteId]),
        eq(prices.quoteId, stablecoinId),
        between(prices.tickAt, startTimestamp, endTimestamp),
      ),
    )
    .groupBy(prices.baseId, prices.quoteId, sql`date`, prices.value);
  await analyzeSelectQuery(sb, 'queryTokenStablecoins');
  return sb.execute();
};

const queryTokenStartPrice = async (baseId: number, quoteId: number, startTimestamp: Date) =>
  db.query.prices.findFirst({
    columns: {
      baseId: true,
      quoteId: true,
      value: true,
    },
    where: and(eq(prices.baseId, baseId), eq(prices.quoteId, quoteId), lte(prices.tickAt, startTimestamp)),
    orderBy: desc(prices.tickAt),
  });

const getTokenIds = async (chainId: number, baseTokenAddress: string, quoteTokenAddress: string) => {
  const stablecoinAddress = networks.getByChainId(chainId)?.stablecoinAddress.toLowerCase();

  const items = await db.query.tokens.findMany({
    columns: {
      id: true,
      chainId: true,
      address: true,
      decimals: true,
    },
    where: and(
      eq(tokens.chainId, chainId),
      inArray(tokens.address, [baseTokenAddress.toLowerCase(), quoteTokenAddress.toLowerCase(), stablecoinAddress]),
    ),
    limit: 3,
  });

  const baseTokenId = items.find((token) => token.address === baseTokenAddress.toLowerCase())?.id;
  const quoteTokenId = items.find((token) => token.address === quoteTokenAddress.toLowerCase())?.id;
  const stablecoinId = items.find((token) => token.address === stablecoinAddress)?.id;

  return { baseTokenId, quoteTokenId, stablecoinId };
};

const groupIntervals = (intervals: Interval[], timeframe: number) => {
  const result: Interval[][] = [];
  let currentGroup: Interval[] = [];
  let groupStartTime = intervals.length > 0 ? intervals[intervals.length - 1].date : null;

  intervals.forEach((item) => {
    if (item?.date && Math.abs(item.date.diff(groupStartTime, 'minute')) <= timeframe) {
      currentGroup.push(item);
    } else {
      if (currentGroup.length > 0) {
        result.push(currentGroup);
      }
      currentGroup = [item];
      groupStartTime = item?.date;
    }
  });

  if (currentGroup.length > 0) {
    result.push(currentGroup);
  }

  return result;
};
