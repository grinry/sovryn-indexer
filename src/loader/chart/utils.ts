import dayjs, { Dayjs, ManipulateType } from 'dayjs';
import { and, eq, between, lte, desc, or, inArray } from 'drizzle-orm';
import _ from 'lodash';
import { BigNumber, bignumber, max, min } from 'mathjs';

import { LONG_CACHE_TTL } from 'config/constants';
import { Timeframe, TIMEFRAME_ROUNDING } from 'controllers/main-controller.constants';
import { db } from 'database/client';
import { tokens, usdDailyPricesTable, usdHourlyPricesTable, usdPricesTable, UsdPricesTables } from 'database/schema';
import { maybeCache } from 'utils/cache';
import { ValidationError } from 'utils/custom-error';
import { toNearestDate } from 'utils/date';
import { logger } from 'utils/logger';
import { prettyNumber } from 'utils/numbers';

import { Interval } from './types';

export const constructCandlesticks = async (intervals: Interval[], timeframe: number) => {
  const groups = groupIntervals(intervals, timeframe);

  const candles = groups
    .filter((group) => group.length > 0)
    .map((item) => {
      const startTime = item[item.length - 1].date;
      const endTime = item[0].date;

      const open = item[item.length - 1].value;
      const close = item[0].value;

      const values = item.reduce((acc, curValue) => {
        acc.push(...[curValue.value, curValue.low, curValue.high].map((value) => bignumber(value)));
        return acc;
      }, [] as BigNumber[]);

      return {
        date: dayjs(endTime).unix(),
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        open: prettyNumber(open),
        close: prettyNumber(close),
        high: prettyNumber(max(...values)),
        low: prettyNumber(min(...values)),
      };
    })
    .sort((a, b) => dayjs(b.start).unix() - dayjs(a.start).unix());

  // make sure that open is same as previous close
  return candles.map((item, index) => {
    // previous is actually next in the array because we are iterating from newest to oldest
    if (index === candles.length - 1) {
      // last item, nothing to do
      return item;
    }

    const previous = candles[index + 1];
    const values = [item.open, item.close, item.high, item.low, previous.close].map((value) => bignumber(value));

    return { ...item, open: previous.close, high: prettyNumber(max(...values)) };
  });
};

type PriceItem = {
  date: dayjs.Dayjs;
  value: string;
  low: string;
  high: string;
};

export const getPrices = async (
  chainId: number,
  baseTokenAddress: string,
  quoteTokenAddress: string,
  startTimestamp: Date,
  endTimestamp: Date,
  timeframe: Timeframe,
) => {
  const { baseTokenId, quoteTokenId } = await maybeCache(
    `/chart/q/${chainId}/${baseTokenAddress}/${quoteTokenAddress}`,
    () => getTokenIds(chainId, baseTokenAddress, quoteTokenAddress),
    LONG_CACHE_TTL,
  ).then((data) => data.data);

  if (!baseTokenId) {
    throw new ValidationError('Unsupported base token');
  }

  if (!quoteTokenId) {
    throw new ValidationError('Unsupported quote token');
  }

  const tokenData = await queryTokenPricesInRange(baseTokenId, quoteTokenId, startTimestamp, endTimestamp, timeframe);

  const baseTokenData = tokenData.base;
  const quoteTokenData = tokenData.quote;

  if (baseTokenData.length === 0 || quoteTokenData.length === 0) {
    // no data to build the chart...
    logger.warn('No data to build the chart');
    return [];
  }

  const unit = getTimeStep(timeframe);

  let start = dayjs(tokenData.start).startOf(unit);
  const end = dayjs(endTimestamp).startOf(unit).unix();

  logger.info(
    { s: startTimestamp.toISOString(), start: start.toISOString(), end: dayjs(endTimestamp).toISOString() },
    'Building chart',
  );

  const items: PriceItem[] = [];

  while (start.unix() <= end) {
    try {
      const { value, low, high } = findNearestPrice(start, baseTokenData, quoteTokenData);
      items.push({
        date: start,
        value,
        low,
        high,
      });
    } catch (e) {
      logger.error({ e: e.message }, 'Error while building chart candle.');
    }
    start = start.clone().add(1, unit);
  }

  return items.sort((a, b) => a.date.unix() - b.date.unix());
};

const getTimeStep = (timeframe: Timeframe): ManipulateType => {
  switch (timeframe) {
    case '1m':
    case '5m':
    case '10m':
    case '15m':
    case '30m':
      return 'minute';
    case '1h':
    case '4h':
    case '12h':
      return 'hour';
    default:
      return 'day';
  }
};

const tableByTimeframe = (timeframe: Timeframe): UsdPricesTables => {
  switch (timeframe) {
    case '1m':
    case '5m':
    case '10m':
    case '15m':
    case '30m':
      return usdPricesTable;
    case '1h':
    case '4h':
    case '12h':
      return usdHourlyPricesTable;
    default:
      return usdDailyPricesTable;
  }
};

type PriceData = {
  tokenId: number;
  tickAt: Date;
  value: string;
  low: string;
  high: string;
};

const queryPrices = async (
  tokenId: number,
  quoteId: number,
  startTimestamp: Date,
  endTimestamp: Date,
  timeframe: Timeframe,
): Promise<PriceData[]> => {
  const table = tableByTimeframe(timeframe);
  return db
    .select({
      tokenId: table.tokenId,
      tickAt: table.tickAt,
      value: table.value,
      low: table.low,
      high: table.high,
    })
    .from(table)
    .where(
      and(
        or(eq(table.tokenId, tokenId), eq(table.tokenId, quoteId)),
        between(table.tickAt, startTimestamp, endTimestamp),
      ),
    );
};

const getTokenStartPrice = async (
  tokenId: number,
  beforeTimestamp: Date,
  timeframe: Timeframe,
): Promise<PriceData | null> => {
  const table = tableByTimeframe(timeframe);
  return db
    .select({ tokenId: table.tokenId, tickAt: table.tickAt, value: table.value, low: table.low, high: table.high })
    .from(table)
    .where(and(eq(table.tokenId, tokenId), lte(table.tickAt, beforeTimestamp)))
    .orderBy(desc(table.tickAt))
    .limit(1)
    .then((data) => (data.length ? { ...data[0], tickAt: beforeTimestamp } : null));
};

const validateStartPrice = async (items: PriceData[], tokenId: number, startTimestamp: Date, timeframe: Timeframe) => {
  if (items.find((item) => item.tokenId === tokenId && dayjs(item.tickAt).isSame(startTimestamp)) === undefined) {
    const startData = await getTokenStartPrice(tokenId, startTimestamp, timeframe);
    if (startData) {
      items.unshift(startData);
    }
  }
};

const queryTokenPricesInRange = async (
  tokenId: number,
  quoteId: number,
  startTimestamp: Date,
  endTimestamp: Date,
  timeframe: Timeframe,
) => {
  const items = await queryPrices(tokenId, quoteId, startTimestamp, endTimestamp, timeframe);
  await validateStartPrice(items, tokenId, startTimestamp, timeframe);
  await validateStartPrice(items, quoteId, startTimestamp, timeframe);

  // sort from newest to oldest, so we can search for the nearest price faster
  const result = items
    .map((item) => ({ ...item, tickAt: toNearestDate(item.tickAt, TIMEFRAME_ROUNDING[timeframe]) }))
    .sort((a, b) => dayjs(b.tickAt).unix() - dayjs(a.tickAt).unix());

  const base = result.filter((item) => item.tokenId === tokenId);
  const quote = result.filter((item) => item.tokenId === quoteId);

  if (base.length === 0 || quote.length === 0) {
    return { base: [], quote: [], start: startTimestamp, end: endTimestamp };
  }

  const oldestBase = dayjs(base[base.length - 1].tickAt).unix();
  const oldestQuote = dayjs(quote[quote.length - 1].tickAt).unix();

  const oldest = Math.max(oldestBase, oldestQuote);
  const newest = Math.min(dayjs(base[0].tickAt).unix(), dayjs(quote[0].tickAt).unix());

  return {
    base: base.filter((item) => dayjs(item.tickAt).unix() >= oldest),
    quote: quote.filter((item) => dayjs(item.tickAt).unix() >= oldest),
    start: dayjs.unix(oldest).toDate(),
    end: dayjs.unix(newest).toDate(),
  };
};

const getTokenIds = async (chainId: number, baseTokenAddress: string, quoteTokenAddress: string) => {
  const items = await db.query.tokens.findMany({
    columns: {
      id: true,
      chainId: true,
      address: true,
      decimals: true,
    },
    where: and(
      eq(tokens.chainId, chainId),
      inArray(tokens.address, [baseTokenAddress.toLowerCase(), quoteTokenAddress.toLowerCase()]),
    ),
    limit: 2,
  });

  const baseTokenId = items.find((token) => token.address === baseTokenAddress.toLowerCase())?.id;
  const quoteTokenId = items.find((token) => token.address === quoteTokenAddress.toLowerCase())?.id;

  return { baseTokenId, quoteTokenId };
};

const findNearestPrice = (date: Dayjs, bases: PriceData[], quotes: PriceData[]) => {
  const base = bases.find((item) => dayjs(item.tickAt).isSame(date) || dayjs(item.tickAt).isBefore(date));
  const quote = quotes.find((item) => dayjs(item.tickAt).isSame(date) || dayjs(item.tickAt).isBefore(date));

  const value = bignumber(base.value).div(quote.value).toString();

  return {
    value,
    low:
      dayjs(base.tickAt).isSame(quote.tickAt) && date.isSame(base.tickAt)
        ? bignumber(base.low).div(quote.low).toString()
        : value,
    high:
      dayjs(base.tickAt).isSame(quote.tickAt) && date.isSame(base.tickAt)
        ? bignumber(base.high).div(quote.high).toString()
        : value,
  };
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
