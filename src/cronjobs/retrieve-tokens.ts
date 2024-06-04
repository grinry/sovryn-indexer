import { CronJob } from 'cron';
import { and, eq, inArray } from 'drizzle-orm';
import { Contract, ZeroAddress } from 'ethers';
import _, { difference, uniq } from 'lodash';

import { db } from 'database/client';
import { tokens } from 'database/schema';
import { networks } from 'loader/networks';
import { Chain } from 'loader/networks/chain-config';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { SdexChain } from 'loader/networks/sdex-chain';
import { NetworkFeature } from 'loader/networks/types';
import { logger } from 'utils/logger';

export const retrieveTokens = async (ctx: CronJob) => {
  ctx.stop();
  logger.info('Retrieving tokens...');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.sdex)) {
      await prepareSdexTokens(item.sdex);
    }
    if (item.hasFeature(NetworkFeature.legacy)) {
      await prepareLegacyTokens(item.legacy);
    }
  }

  logger.info('Tokens retrieval finished.');

  ctx.start();
};

async function prepareLegacyTokens(chain: LegacyChain) {
  try {
    logger.info(`Preparing legacy tokens for chain ${chain.context.chainId}`);
    const items = await chain.queryTokens();

    if (items.tokens.length === 0) {
      logger.info('No tokens to add for legacy chain');
      return;
    }

    const result = await db
      .insert(tokens)
      .values(
        items.tokens.map((item) => ({
          chainId: chain.context.chainId,
          address: item.id,
          symbol: item.symbol,
          name: item.name,
          decimals: item.decimals,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: tokens.id })
      .execute();

    logger.info(`Added ${result.length} new tokens for chain ${chain.context.chainId}`);
  } catch (error) {
    logger.error(error, 'Error while preparing Sdex tokens');
  }
}

async function prepareSdexTokens(chain: SdexChain) {
  try {
    logger.info(`Preparing Sdex tokens for chain ${chain.context.chainId}`);
    const items = await chain.queryPools(1000);
    const tokensInPools = [];
    for (const item of items.pools) {
      tokensInPools.push(item.base, item.quote);
    }

    const toAdd = await getTokensToAdd(tokensInPools, chain.context.chainId);

    if (toAdd.length === 0) {
      logger.info('No tokens to add for Sdex chain');
      return;
    }

    const added = [];

    for (const item of toAdd) {
      const tokenInfo = await queryTokenInfo(chain.context, item);
      const t = await db
        .insert(tokens)
        .values({
          chainId: chain.context.chainId,
          address: item,
          symbol: tokenInfo.symbol,
          name: tokenInfo.name,
          decimals: tokenInfo.decimals,
        })
        .onConflictDoNothing()
        .returning({ id: tokens.id })
        .execute();
      added.push(t);
    }

    logger.info(`Added ${added.length} new tokens for chain ${chain.context.chainId} (SDEX)`);
  } catch (error) {
    logger.error(error, 'Error while preparing Sdex tokens');
  }
}

async function getTokensToAdd(tokenAddresses: string[], chainId: number) {
  const items = uniq(tokenAddresses);

  const existingTokens = await db.query.tokens.findMany({
    columns: {
      address: true,
    },
    where: and(eq(tokens.chainId, chainId), inArray(tokens.address, items)),
  });

  return difference(
    items,
    existingTokens.map((item) => item.address),
  );
}

const tokenInterface = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
];

async function queryTokenInfo(chain: Chain, tokenAddress: string) {
  if (tokenAddress === ZeroAddress) {
    return {
      symbol: chain.token.symbol,
      name: chain.token.name,
      decimals: chain.token.decimals,
    };
  }
  const contract = new Contract(tokenAddress, tokenInterface, chain.rpc);
  const symbol = await contract.symbol();
  const name = await contract.name();
  const decimals = await contract.decimals();
  return {
    symbol,
    name,
    decimals,
  };
}
