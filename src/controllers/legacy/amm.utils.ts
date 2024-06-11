import { isNil } from 'lodash';
import { bignumber } from 'mathjs';

import { AmmApyDay } from 'database/schema';

type BalanceHistory = Array<{
  activity_date: Date;
  balance_btc: number | string;
  pool: string;
}>;

interface IAmmApyAll {
  [key: string]: {
    pool: string;
    data: {
      [key: string]: Array<{
        pool_token: string;
        activity_date: Date;
        APY_fees_pc: string;
        APY_rewards_pc: string;
        APY_pc: string;
        btc_volume: string;
      }>;
    };
    balanceHistory: BalanceHistory;
  };
}

type ParsableAmmApyDay = Pick<
  AmmApyDay,
  'pool' | 'poolToken' | 'date' | 'balanceBtc' | 'rewardsApy' | 'feeApy' | 'totalApy' | 'btcVolume'
>;

export function parseApyHistoryData(data: ParsableAmmApyDay[]): IAmmApyAll {
  const output: IAmmApyAll = {};
  for (const row of data) {
    const poolExists = !isNil(output[row.pool]);
    const poolTokenExists = poolExists && !isNil(output[row.pool].data[row.poolToken]);

    const dataItem = {
      pool_token: row.poolToken,
      activity_date: row.date,
      APY_fees_pc: row.feeApy,
      APY_rewards_pc: row.rewardsApy,
      APY_pc: row.totalApy,
      btc_volume: row.btcVolume,
    };

    if (!poolExists && !poolTokenExists) {
      const data: { [key: string]: any[] } = {};
      const balanceHistory = updateBalanceHistory(row, []);
      data[row.poolToken] = [dataItem];
      output[row.pool] = {
        pool: row.pool,
        data: data,
        balanceHistory: balanceHistory,
      };
    } else {
      const pool = output[row.pool];
      const newBalanceHistory = updateBalanceHistory(row, pool.balanceHistory);
      pool.balanceHistory = newBalanceHistory;
    }

    if (poolExists && !poolTokenExists) {
      const pool = output[row.pool];
      pool.data[row.poolToken] = [dataItem];
    } else {
      const poolTokenData = output[row.pool].data[row.poolToken];
      poolTokenData.push(dataItem);
    }
  }
  return output;
}

function updateBalanceHistory(row: ParsableAmmApyDay, balanceHistory: BalanceHistory): BalanceHistory {
  const balanceHistoryItem = {
    activity_date: row.date,
    balance_btc: row.balanceBtc,
    pool: row.pool,
  };
  const balanceHistoryIndex = balanceHistory.findIndex(
    (item) => item.activity_date.toISOString() === balanceHistoryItem.activity_date.toISOString(),
  );
  if (balanceHistoryIndex === -1) {
    balanceHistory.push(balanceHistoryItem);
  } else {
    balanceHistory[balanceHistoryIndex].balance_btc = bignumber(balanceHistory[balanceHistoryIndex].balance_btc)
      .plus(bignumber(balanceHistoryItem.balance_btc))
      .valueOf();
  }
  return balanceHistory;
}
