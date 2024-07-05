import { CronJob } from 'cron';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ZeroAddress } from 'ethers';
import _, { difference, uniq } from 'lodash';

import { ERC20__factory } from 'artifacts/abis/types';
import { db } from 'database/client';
import { NewToken, tokens } from 'database/schema';
import { networks } from 'loader/networks';
import { Chain } from 'loader/networks/chain-config';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { SdexChain } from 'loader/networks/sdex-chain';
import { NetworkFeature } from 'loader/networks/types';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'crontab:retrieve-tokens' });

export const retrieveTokens = async (ctx: CronJob) => {
  ctx.stop();
  childLogger.info('Retrieving tokens...');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.sdex)) {
      await prepareSdexTokens(item.sdex);
    }
    if (item.hasFeature(NetworkFeature.legacy)) {
      await prepareLegacyTokens(item.legacy);
    }
  }

  childLogger.info('Tokens retrieval finished.');

  ctx.start();
};

async function prepareLegacyTokens(chain: LegacyChain) {
  try {
    childLogger.info(`Preparing legacy tokens for chain ${chain.context.chainId}`);
    // todo: looks like it does not query some tokens, like ZUSD. Need to investigate.
    const items = await chain.queryTokens();
    items.tokens.push({
      id: ZeroAddress,
      name: chain.context.token.name,
      symbol: chain.context.token.symbol,
      decimals: chain.context.token.decimals,
      lastPriceUsd: '0',
    });

    // add zusd token if it exists in config, because it's not in the subgraph.
    if (chain.config.zusdToken && !items.tokens.find((item) => item.id === chain.config.zusdToken.toLowerCase())) {
      items.tokens.push({
        id: chain.config.zusdToken.toLowerCase(),
        name: 'ZUSD',
        symbol: 'ZUSD',
        decimals: 18,
        lastPriceUsd: '0',
      });
    }

    if (items.tokens.length === 0) {
      childLogger.info('No tokens to add for legacy chain');
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

    childLogger.info(`Added ${result.length} new tokens for chain ${chain.context.chainId}`);
  } catch (error) {
    childLogger.error(error, 'Error while preparing Sdex tokens');
  }
}

async function prepareSdexTokens(chain: SdexChain) {
  try {
    childLogger.info(`Preparing Sdex tokens for chain ${chain.context.chainId}`);
    const items = await chain.queryPools(1000);
    const tokensInPools = [];
    for (const item of items.pools) {
      tokensInPools.push(item.base, item.quote);
    }

    const toAdd = await getTokensToAdd(tokensInPools, chain.context.chainId);

    if (toAdd.length === 0) {
      childLogger.info('No tokens to add for Sdex chain');
      return;
    }

    const newTokens: NewToken[] = [];

    for (const item of toAdd) {
      const tokenInfo = await queryTokenInfo(chain.context, item);
      newTokens.push({
        chainId: chain.context.chainId,
        address: item,
        symbol: tokenInfo.symbol,
        name: tokenInfo.name,
        decimals: tokenInfo.decimals,
        ignored: tokenInfo.name.startsWith('MOCK') && tokenInfo.symbol.startsWith('m'),
      });
    }

    logger.info({ newTokens }, 'New tokens');

    if (newTokens.length > 0) {
      const result = await db
        .insert(tokens)
        .values(newTokens)
        .onConflictDoNothing({
          target: [tokens.chainId, tokens.address],
        })
        .returning({ id: tokens.id })
        .execute();

      childLogger.info(`Added ${result.length} new tokens for chain ${chain.context.chainId} (SDEX)`);
    }
  } catch (error) {
    childLogger.error(error, 'Error while preparing Sdex tokens');
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

const tokenInterface = ERC20__factory.createInterface();

async function queryTokenInfo(chain: Chain, tokenAddress: string) {
  if (tokenAddress === ZeroAddress) {
    return {
      symbol: chain.token.symbol,
      name: chain.token.name,
      decimals: chain.token.decimals,
    };
  }

  if (chain.supportsMulticall) {
    return chain.multicall.tryAggregate
      .staticCall(true, [
        {
          target: tokenAddress,
          callData: tokenInterface.encodeFunctionData('symbol'),
        },
        {
          target: tokenAddress,
          callData: tokenInterface.encodeFunctionData('name'),
        },
        {
          target: tokenAddress,
          callData: tokenInterface.encodeFunctionData('decimals'),
        },
      ])
      .then((value) => ({
        symbol: tokenInterface.decodeFunctionResult('symbol', value[0][1]).toString(),
        name: tokenInterface.decodeFunctionResult('name', value[1][1]).toString(),
        decimals: Number(tokenInterface.decodeFunctionResult('decimals', value[2][1])),
      }));
  } else {
    const contract = ERC20__factory.connect(tokenAddress, chain.rpc);
    return {
      symbol: await contract.symbol(),
      name: await contract.name(),
      decimals: await contract.decimals().then((value) => Number(value)),
    };
  }
}
