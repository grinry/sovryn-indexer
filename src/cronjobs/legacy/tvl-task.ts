import { CronJob } from 'cron';
import { eq } from 'drizzle-orm';
import gql from 'graphql-tag';
import _, { isNil } from 'lodash';
import { bignumber } from 'mathjs';

import { ERC20__factory } from 'artifacts/abis/types';
import { db } from 'database/client';
import { apyBlockRepository } from 'database/repository/apy-block-repository';
import { ammApyBlocks, NewAmmApyBlock, tokens } from 'database/schema';
import { networks } from 'loader/networks';
import { LegacyChain, QueryAmmApyDataForBlock } from 'loader/networks/legacy-chain';
import { NetworkFeature } from 'loader/networks/types';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:legacy:tvl' });

export const tvlTask = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Retrieving TVL task');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.legacy)) {
      await processLegacyChain(item.legacy);
    }
  }

  childLogger.info('TVL task retrieved.');
  ctx.start();
};

async function processLegacyChain(chain: LegacyChain) {
  const protocolStats = await chain
    .queryFromSubgraph<{
      protocolStats: {
        tokens: { id: string; symbol: string; lastPriceUsd: number; lastPriceBtc: number; decimals: number }[];
      };
    }>(
      gql`
        query {
          protocolStats(id: "0") {
            tokens {
              id
              symbol
              decimals
              lastPriceUsd
              lastPriceBtc
            }
          }
        }
      `,
    )
    .then((data) => data.protocolStats.tokens);
}

async function getTokenBalance(chain: LegacyChain, userAddress: string, tokenAddress: string, tokenDecimals: number) {
  const tokenContract = ERC20__factory.connect(tokenAddress, chain.context.rpc);
  const balance = await tokenContract.balanceOf(userAddress);
  return bignumber(balance.toString()).div(bignumber(10).pow(tokenDecimals)).toFixed(18);
}
