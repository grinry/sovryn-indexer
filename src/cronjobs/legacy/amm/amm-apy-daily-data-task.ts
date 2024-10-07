import { CronJob } from 'cron';
import dayjs from 'dayjs';
import gql from 'graphql-tag';
import { BigNumber, bignumber } from 'mathjs';

import { apyBlockRepository, DailyAggregatedApyResult } from 'database/repository/apy-block-repository';
import { apyDayRepository } from 'database/repository/apy-day-repository';
import { tokenRepository } from 'database/repository/token-repository';
import { ammApyDays, NewAmmApyDay } from 'database/schema';
import { networks } from 'loader/networks';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { NetworkFeature } from 'loader/networks/types';
import { getLastPrices, getLastUsdPrice } from 'loader/price';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:legacy:amm_apy_daily_data' });

export const ammApyDailyDataTask = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Begin AMM APY daily data task..');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.legacy)) {
      await processLegacyChain(item.legacy);
    }
  }

  childLogger.info('AMM APY daily data task completed.');
  // ctx.start();
};

async function processLegacyChain(chain: LegacyChain) {
  const yesterday = dayjs().subtract(1, 'day').toDate();
  const rawDayData = await apyBlockRepository.getDailyAggregatedApy(chain.context.chainId, yesterday);

  const volumeData = await getPoolVolumeItems(chain, Math.floor(yesterday.getTime() / 1000));
  const btc = await tokenRepository.getBitcoin(chain.context);
  const usdPrice = await getLastUsdPrice(btc.id);

  const items = rawDayData
    .map((item) => {
      if (parseFloat(item.avgBalance) > 0) {
        const poolVolume = volumeData.find((item) => item.pool === item.pool)?.btcVolume ?? '0';
        return calculateDayApr(chain, item, poolVolume, usdPrice);
      }
      return null;
    })
    .filter((item) => item !== null) as NewAmmApyDay[];

  if (items.length) {
    const result = await apyDayRepository.storeItems(items).returning({ id: ammApyDays.id }).execute();
    childLogger.info(
      { chain: chain.context.chainId, yesterday, items: result.length },
      'Processed AMM APY daily data...',
    );
  } else {
    childLogger.info({ chain: chain.context.chainId, yesterday }, 'No items to process');
  }
}

export interface IPoolVolumeResult {
  pool: string;
  btcVolume: string;
}

export const getPoolVolumeItems = async (chain: LegacyChain, timestamp: number): Promise<IPoolVolumeResult[]> => {
  const poolVolumeItemsData = await chain.queryFromSubgraph<{
    poolVolumeItems: { id: string; btcAmount: string; timestamp: number; pool: { id: string } }[];
  }>(
    gql`
      query ($timestamp: Int!) {
        poolVolumeItems(where: { timestamp_gte: $timestamp }) {
          id
          btcAmount
          timestamp
          pool {
            id
          }
        }
      }
    `,
    { timestamp },
  );

  const data = poolVolumeItemsData.poolVolumeItems;

  let result: IPoolVolumeResult[] = [];

  data.forEach((item) => {
    const poolId = item.pool.id;
    const btcAmount = bignumber(item.btcAmount);

    const poolInArray = result.find((item) => item.pool === poolId);

    if (poolInArray !== undefined) {
      // If the poolId already exists, add to the existing sum
      const updatedItem = { pool: poolInArray.pool, btcVolume: btcAmount.add(poolInArray.btcVolume).toFixed(18) };
      const updatedArray = result.map((item) => {
        if (item.pool === updatedItem.pool) {
          return updatedItem;
        }
        return item;
      });

      result = updatedArray;
    } else {
      // If the poolId does not exist, create a new entry
      result.push({ pool: poolId, btcVolume: btcAmount.toFixed(18) });
    }
  });

  return result;
};

export function calculateDayApr(
  chain: LegacyChain,
  data: DailyAggregatedApyResult,
  volume: string,
  usdPrice: BigNumber,
): NewAmmApyDay {
  const feeApy = bignumber(data.sumFees)
    .div(bignumber(data.avgBalance))
    .mul(365 * 100)
    .toFixed(2);
  const rewardsApy = bignumber(data.sumRewards)
    .div(bignumber(data.avgBalance))
    .mul(365 * 100)
    .toFixed(2);
  const totalApy = bignumber(data.sumFees)
    .plus(bignumber(data.sumRewards))
    .div(bignumber(data.avgBalance))
    .mul(365 * 100)
    .toFixed(2);
  return {
    chainId: chain.context.chainId,
    pool: data.pool,
    poolToken: data.poolToken,
    balanceBtc: bignumber(data.avgBalance).toFixed(8),
    balanceUsd: bignumber(data.avgBalanceUsd).toFixed(8),
    feeApy: feeApy,
    rewardsApy: rewardsApy,
    totalApy: totalApy,
    date: dayjs(data.date).set('hour', 0).set('minute', 0).set('second', 0).set('millisecond', 0).toDate(),
    btcVolume: volume,
    usdVolume: bignumber(volume).mul(usdPrice).toFixed(8),
  };
}
