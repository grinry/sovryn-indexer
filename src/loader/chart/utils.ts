import { db } from 'database/client';
import { prices } from 'database/schema';
import dayjs from 'dayjs';
import { sql, and, eq, between } from 'drizzle-orm';
import { networks } from 'loader/networks';
import { NetworkFeature } from 'loader/networks/types';
import _ from 'lodash';
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
        start: startTime,
        end: endTime,
        open,
        close,
        high: Math.max(...values),
        low: Math.min(...values),
      };
    })
    .sort((a, b) => dayjs(b.start).unix() - dayjs(a.start).unix());
};

export const getPrices = async (
  chainId: number,
  baseTokenAddress: string,
  quoteTokenAddress: string,
  startTimestamp: Date,
  endTimestamp: Date,
) => {
  const { baseTokenId, quoteTokenId, stablecoinId } = await getTokenIds(chainId, baseTokenAddress, quoteTokenAddress);

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
          value: Number(item.value) / Number(quoteTokenEquivalent.value),
        };
      }

      return null;
    })
    .sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix());

  return result;
};

const queryTokenData = async (baseId: number, quoteId: number, startTimestamp: Date, endTimestamp: Date) =>
  db
    .select({
      baseId: prices.baseId,
      quoteId: prices.quoteId,
      date: sql`date_trunc('minute', ${prices.tickAt})`.mapWith(String).as('date'),
      value: prices.value,
    })
    .from(prices)
    .where(
      and(eq(prices.baseId, baseId), eq(prices.quoteId, quoteId), between(prices.tickAt, startTimestamp, endTimestamp)),
    );

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

  const chainType = chain.hasFeature(NetworkFeature.legacy) ? chain.legacy : chain.sdex;

  const baseTokenId = tokens.find((token) => token.address === baseTokenAddress.toLowerCase())?.id;
  const quoteTokenId = tokens.find((token) => token.address === quoteTokenAddress.toLowerCase())?.id;
  const stablecoinId = tokens.find((token) => token.address === chainType.context.stablecoinAddress)?.id;

  return { baseTokenId, quoteTokenId, stablecoinId };
};

const groupIntervals = (intervals: Interval[], timeframe: number) => {
  const result = [];
  let currentGroup = [];
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
