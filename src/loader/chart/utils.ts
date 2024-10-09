import dayjs, { Dayjs, ManipulateType } from 'dayjs';
import { and, eq, between, lte, desc, or, inArray } from 'drizzle-orm';
import _ from 'lodash';
import { bignumber, max, min } from 'mathjs';

import { LONG_CACHE_TTL } from 'config/constants';
import { Timeframe } from 'controllers/main-controller.constants';
import { db } from 'database/client';
import { tokens, usdDailyPricesTable, usdHourlyPricesTable, usdPricesTable, UsdPricesTables } from 'database/schema';
import { maybeCache } from 'utils/cache';
import { NotFoundError, ValidationError } from 'utils/custom-error';
import { prettyNumber } from 'utils/numbers';

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
        acc.push(curValue.value, curValue.low, curValue.high);
        return acc;
      }, []);

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
    return [];
  }

  const unit = getTimeStep(timeframe);

  let start = dayjs(startTimestamp).startOf(unit);
  const end = dayjs(endTimestamp).startOf(unit).unix();

  const items: PriceItem[] = [];

  while (start.unix() <= end) {
    const { value, low, high } = findNearestPrice(start, baseTokenData, quoteTokenData);
    items.push({
      date: start,
      value,
      low,
      high,
    });
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
): Promise<PriceData[]> => {
  const table = tableByTimeframe(timeframe);
  return db
    .select({ tokenId: table.tokenId, tickAt: table.tickAt, value: table.value, low: table.low, high: table.high })
    .from(table)
    .where(and(eq(table.tokenId, tokenId), lte(table.tickAt, beforeTimestamp)))
    .orderBy(desc(table.tickAt))
    .limit(1);
};

const validateStartPrice = async (items: PriceData[], tokenId: number, startTimestamp: Date, timeframe: Timeframe) => {
  if (items.find((item) => item.tokenId === tokenId && dayjs(item.tickAt).isSame(startTimestamp)) === undefined) {
    const startData = await getTokenStartPrice(tokenId, startTimestamp, timeframe);
    if (startData.length) {
      items.unshift(...startData);
    } else {
      throw new NotFoundError('No data found for the start date');
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
  const result = items.sort((a, b) => dayjs(b.tickAt).unix() - dayjs(a.tickAt).unix());
  return {
    base: result.filter((item) => item.tokenId === tokenId),
    quote: result.filter((item) => item.tokenId === quoteId),
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
