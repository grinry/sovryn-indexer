import dayjs from 'dayjs';
import { sql, and, eq, between, lte, desc } from 'drizzle-orm';
import _ from 'lodash';
import { bignumber, max, min } from 'mathjs';

import { db } from 'database/client';
import { prices } from 'database/schema';
import { networks } from 'loader/networks';
import { ValidationError } from 'utils/custom-error';
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
) => {
  const { baseTokenId, quoteTokenId, stablecoinId } = await getTokenIds(chainId, baseTokenAddress, quoteTokenAddress);

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

  const baseTokenData = await queryTokenData(baseTokenId, stablecoinId, startTimestamp, endTimestamp);
  const quoteTokenData = await queryTokenData(quoteTokenId, stablecoinId, startTimestamp, endTimestamp);

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

  if (result.length === 0) {
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

  // sort items from newest to oldest
  return items.sort((a, b) => b.date.unix() - a.date.unix());
};

const queryTokenData = async (baseId: number, quoteId: number, startTimestamp: Date, endTimestamp: Date) =>
  db
    .select({
      baseId: prices.baseId,
      quoteId: prices.quoteId,
      date: sql`date_trunc('minute', ${prices.tickAt}, 'UTC')`.mapWith(String).as('date'),
      value: prices.value,
    })
    .from(prices)
    .where(
      and(eq(prices.baseId, baseId), eq(prices.quoteId, quoteId), between(prices.tickAt, startTimestamp, endTimestamp)),
    );

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

  const baseTokenId = tokens.find((token) => token.address === baseTokenAddress.toLowerCase())?.id;
  const quoteTokenId = tokens.find((token) => token.address === quoteTokenAddress.toLowerCase())?.id;
  const stablecoinId = tokens.find((token) => token.address === chain.stablecoinAddress)?.id;

  return { baseTokenId, quoteTokenId, stablecoinId };
};

const groupIntervals = (intervals: Interval[], timeframe: number) => {
  const result: Interval[][] = [];
  let currentGroup: Interval[] = [];
  let groupStartTime = intervals[intervals.length - 1].date;

  intervals.forEach((item) => {
    if (Math.abs(item.date.diff(groupStartTime, 'minute')) <= timeframe) {
      currentGroup.push(item);
    } else {
      currentGroup = [item];
      result.push(currentGroup);
      groupStartTime = item.date;
    }
  });

  return result;
};
