import { CronJob } from 'cron';
import { and, eq, inArray } from 'drizzle-orm';
import { Contract, Interface, ZeroAddress } from 'ethers';
import gql from 'graphql-tag';
import _, { difference, isNil, uniq } from 'lodash';

import { db } from 'database/client';
import { apyBlockRepository } from 'database/repository/apy-block-repository';
import { tokens } from 'database/schema';
import { networks } from 'loader/networks';
import { Chain } from 'loader/networks/chain-config';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { SdexChain } from 'loader/networks/sdex-chain';
import { NetworkFeature } from 'loader/networks/types';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:legacy:amm_apy_blocks' });

export const ammApyBlockTask = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Retrieving AMM APY blocks...');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.legacy)) {
      await processLegacyChain(item.legacy);
    }
  }

  // childLogger.info('Retrieving tokens...');

  // const items = networks.listChains();

  // for (const item of items) {
  //   if (item.hasFeature(NetworkFeature.sdex)) {
  //     await prepareSdexTokens(item.sdex);
  //   }
  //   if (item.hasFeature(NetworkFeature.legacy)) {
  //     await prepareLegacyTokens(item.legacy);
  //   }
  // }

  // childLogger.info('Tokens retrieval finished.');

  // ctx.start();
};

const CHUNK_SIZE = 100;

async function processLegacyChain(chain: LegacyChain) {
  const endBlock = await chain
    .queryFromSubgraph<{ _meta: { block: { number: number } } }>(
      gql`
        {
          _meta {
            block {
              number
            }
          }
        }
      `,
    )
    .then((data) => data._meta.block.number);

  let startBlock = await apyBlockRepository.getLastBlock(chain.context.chainId).then((block) => {
    if (isNil(block) || endBlock - block > CHUNK_SIZE) {
      return endBlock - CHUNK_SIZE;
    } else {
      return block;
    }
  });
  const startTime = Date.now();

  childLogger.info({ startBlock, endBlock }, 'Processing AMM APY blocks...');

  const items = [];

  while (startBlock < endBlock) {
    try {
      const blockTimestamp = await chain.context.rpc.getBlock(startBlock).then((block) => block.timestamp);
      childLogger.info({ startBlock, blockTimestamp }, 'Processing AMM APY block...');
    } catch (error) {
      childLogger.error({ error }, 'Error processing AMM APY blocks');
    }
    startBlock++;
  }

  const durationMs = Date.now() - startTime;
  childLogger.info({ durationMs }, 'AMM APY blocks processing finished.');
}
