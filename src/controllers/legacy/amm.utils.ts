import { BlockTag } from 'ethers';
import gql from 'graphql-tag';
import { isNil } from 'lodash';
import { bignumber } from 'mathjs';

import { LiquidityPoolV1Converter__factory, LiquidityPoolV2Converter__factory } from 'artifacts/abis/types';
import { AmmApyDay } from 'database/schema';
import { LegacyChain, QueryAmmApyDataForBlock } from 'loader/networks/legacy-chain';

type BalanceHistory = Array<{
  activity_date: Date;
  balance_btc: number | string;
  balance_usd: number | string;
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
        usd_volume: string;
      }>;
    };
    balanceHistory: BalanceHistory;
  };
}

type ParsableAmmApyDay = Pick<
  AmmApyDay,
  | 'pool'
  | 'poolToken'
  | 'date'
  | 'balanceBtc'
  | 'balanceUsd'
  | 'rewardsApy'
  | 'feeApy'
  | 'totalApy'
  | 'btcVolume'
  | 'usdVolume'
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
      usd_volume: row.usdVolume,
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
    balance_usd: row.balanceUsd,
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
    balanceHistory[balanceHistoryIndex].balance_usd = bignumber(balanceHistory[balanceHistoryIndex].balance_usd)
      .plus(bignumber(balanceHistoryItem.balance_usd))
      .valueOf();
  }
  return balanceHistory;
}

export async function getOnChainData(chain: LegacyChain, pool: string) {
  const data = await chain
    .queryFromSubgraph<{ liquidityPool: QueryAmmApyDataForBlock['liquidityPools'][number] }>(
      gql`
        query ($pool: ID!) {
          liquidityPool(id: $pool) {
            id
            type
            smartToken {
              id
            }
            poolTokens {
              id
              underlyingAssets {
                id
              }
            }
            token0 {
              id
              symbol
              lastPriceBtc
              lastPriceUsd
              decimals
            }
            token1 {
              id
              symbol
              lastPriceBtc
              lastPriceUsd
              decimals
            }
            token0Balance
            token1Balance
          }
        }
      `,
      { pool },
    )
    .then((data) => data.liquidityPool);

  // token0 actually is not always BTC, but leaving it like this to make compatible with FE and amm-apy wrapper BE.

  const tokenAddress = data.token1.id;
  const btcAddress = data.token0.id;

  const stakedBalanceToken =
    data.type === 2
      ? await getV2StakedBalance(chain, pool, tokenAddress, data.token1.decimals)
      : await getV1StakedBalance(chain, pool, tokenAddress, data.token1.decimals);

  const stakedBalanceBtc =
    data.type === 2
      ? await getV2StakedBalance(chain, pool, btcAddress, data.token0.decimals)
      : await getV1StakedBalance(chain, pool, btcAddress, data.token0.decimals);

  return {
    poolName: `${data.token0.symbol}-${data.token1.symbol}`,
    poolVersion: data.type,
    ammPool: data.token1.symbol,
    contractBalanceToken: Number(data.token1Balance),
    contractBalanceBtc: Number(data.token0Balance),
    stakedBalanceToken: Number(stakedBalanceToken.toFixed(18)),
    stakedBalanceBtc: Number(stakedBalanceBtc.toFixed(18)),
    tokenDelta: Number(bignumber(data.token1Balance).minus(stakedBalanceToken).toFixed(18)),
    btcDelta: Number(bignumber(data.token0Balance).minus(stakedBalanceBtc).toFixed(18)),
  };
}

async function getV1StakedBalance(
  chain: LegacyChain,
  pool: string,
  token: string,
  decimals: number,
  block: BlockTag = 'latest',
) {
  const contract = LiquidityPoolV1Converter__factory.connect(pool, chain.context.rpc);
  return contract.getConnectorBalance
    .staticCall(token, { blockTag: block })
    .then((data) => bignumber(data).div(Math.pow(10, decimals)));
}

async function getV2StakedBalance(
  chain: LegacyChain,
  pool: string,
  token: string,
  decimals: number,
  block: BlockTag = 'latest',
) {
  const contract = LiquidityPoolV2Converter__factory.connect(pool, chain.context.rpc);
  return contract.reserveStakedBalance
    .staticCall(token, { blockTag: block })
    .then((data) => bignumber(data).div(Math.pow(10, decimals)));
}
