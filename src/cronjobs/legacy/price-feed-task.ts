import { and, eq, inArray } from 'drizzle-orm';
import gql from 'graphql-tag';

import { db } from 'database/client';
import { flags, NewPrice, prices, tokens } from 'database/schema';
import { networks } from 'loader/networks';
import { LegacyChain } from 'loader/networks/legacy-chain';
import { NetworkFeature } from 'loader/networks/types';
import { floorDate } from 'utils/date';
import { getFlag, setFlag } from 'utils/flag';
import { logger } from 'utils/logger';

const childLogger = logger.child({ module: 'price-feed-task' });

const BLOCKS = 5;

export const priceFeedTask = async () => {
  childLogger.info('Price feed task start.');

  const items = networks.listChains();

  for (const item of items) {
    if (item.hasFeature(NetworkFeature.legacy)) {
      await processLegacyChain(item.legacy);
    }
  }

  childLogger.info('Price feed task ended.');
};

const processLegacyChain = async (chain: LegacyChain) => {
  const key = `price-feed-${chain.context.chainId}`;
  const currentBlock = await chain.context.rpc.getBlockNumber();
  const savedBlock = await getFlag(key).then((value) => (value ? Number(value) : chain.startBlock));

  if (currentBlock < savedBlock) {
    childLogger.info(
      `Skipping chain ${chain.context.chainId} as current block ${currentBlock} is less than saved block ${savedBlock}.`,
    );
    return;
  }

  const nextBlock = savedBlock + BLOCKS;
  await searchBlock(chain, nextBlock, currentBlock);
};

const searchBlock = async (chain: LegacyChain, blockNumber: number, lastBlock?: number) => {
  lastBlock = lastBlock ?? (await chain.context.rpc.getBlockNumber());

  if (blockNumber >= lastBlock) {
    childLogger.info({ blockNumber, lastBlock }, 'Up to date. Stop processing.');
    return;
  }

  childLogger.info({ blockNumber, lastBlock }, 'Processing history prices on block.');

  const timestamp = await chain.context.rpc
    .getBlock(blockNumber)
    .then((block) => floorDate(new Date(block.timestamp * 1000)));

  const items = await chain
    .queryFromSubgraph<{ tokens: { id: string; lastPriceUsd: string }[] }>(
      gql`
    query {
      tokens(block: { number: ${blockNumber} }) {
        id
        lastPriceUsd
      }
    }
  `,
    )
    .then((data) => data.tokens);

  if (items.length > 0) {
    await db.transaction(async (tx) => {
      const ids = await tx.query.tokens.findMany({
        columns: {
          id: true,
          address: true,
        },
        where: and(
          eq(tokens.chainId, chain.context.chainId),
          inArray(tokens.address, [...items.map((item) => item.id), chain.context.stablecoinAddress]),
        ),
      });

      const stablecoinId = ids.find((item) => item.address === chain.context.stablecoinAddress)?.id;

      const toAdd: NewPrice[] = items
        .map((item) => ({
          baseId: ids.find((id) => id.address === item.id)?.id,
          quoteId: stablecoinId,
          value: item.lastPriceUsd,
          tickAt: timestamp,
        }))
        .filter((item) => item.baseId && item.quoteId);

      if (toAdd.length > 0) {
        await tx
          .insert(prices)
          .values(toAdd)
          .onConflictDoNothing({ target: [prices.baseId, prices.quoteId, prices.tickAt] })
          .execute();

        childLogger.info(`Added ${toAdd.length} new prices for chain ${chain.context.chainId} (Legacy)`);
      }

      await tx
        .update(flags)
        .set({ value: blockNumber.toString() })
        .where(eq(flags.key, `price-feed-${chain.context.chainId}`));
    });
  } else {
    childLogger.info({ blockNumber }, 'No prices to add for legacy chain');
    await setFlag(`price-feed-${chain.context.chainId}`, blockNumber.toString());
  }

  await searchBlock(chain, blockNumber + BLOCKS, lastBlock);
};
