import { sql } from 'drizzle-orm';

import { GIT_TOKEN_LIST_URL } from 'config/constants';
import { db } from 'database/client';
import { tokens } from 'database/schema/tokens';
import { networks } from 'loader/networks';
import { getLastUsdPrice } from 'loader/price';
import { logger } from 'utils/logger';

async function fetchTokensByChain(chainId: number) {
  const tokensUrl = `${GIT_TOKEN_LIST_URL}/${chainId}/tokens.json`;
  try {
    const response = await fetch(tokensUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch tokens for chainId ${chainId}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching tokens for chainId ${chainId}:`, error);
    return [];
  }
}

async function insertTokensToDatabase() {
  const chains = networks.listChains();
  for (const chain of chains) {
    const chainId = chain.chainId;
    if (!chainId) {
      logger.error('chainId is required');
      continue; // Skip this iteration if chainId is missing
    }

    const fetchedTokens = await fetchTokensByChain(chainId);

    // Ensure fetchedTokens is an array
    if (!Array.isArray(fetchedTokens) || fetchedTokens.length === 0) {
      logger.warn(`No tokens found for chainId ${chainId}`);
      continue; // Skip if no tokens fetched
    }

    const values = await Promise.all(
      fetchedTokens.map(async (token: any) => {
        const price = await getLastUsdPrice(token.address.toLowerCase());
        return {
          chainId,
          address: token.address.toLowerCase(),
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals || 18,
          logoUrl: token.logoURI,
          usdPrice: price.toString(),
          tradeableSince: new Date(),
        };
      }),
    );

    if (values.length > 0) {
      await db
        .insert(tokens)
        .values(values)
        .onConflictDoUpdate({
          target: [tokens.chainId, tokens.address],
          set: {
            symbol: sql`EXCLUDED.symbol`,
            name: sql`EXCLUDED.name`,
            decimals: sql`EXCLUDED.decimals`,
            logoUrl: sql`EXCLUDED.logo_url`,
          },
        })
        .execute();
      logger.info(`Inserted ${values.length} tokens for chainId ${chainId}`);
    } else {
      logger.warn(`No tokens found for chainId ${chainId}`);
    }
  }
}

export { fetchTokensByChain, insertTokensToDatabase };
