import { CronJob } from 'cron';
import { sql } from 'drizzle-orm';

import { GIT_TOKEN_LIST_URL } from 'config/constants';
import { db } from 'database/client';
import { tokens } from 'database/schema/tokens';
import { networks } from 'loader/networks';
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

async function insertTokensToDatabase(ctx: CronJob) {
  ctx.stop();
  const chains = networks.listChains();

  try {
    for (const chain of chains) {
      const chainId = chain.chainId;
      if (!chainId) {
        logger.error('chainId is required');
        continue;
      }

      const fetchedTokens = await fetchTokensByChain(chainId);
      if (!Array.isArray(fetchedTokens) || fetchedTokens.length === 0) {
        logger.warn(`No tokens found for chainId ${chainId}`);
        continue;
      }

      let dbTokens = [];
      try {
        dbTokens = await db
          .select()
          .from(tokens)
          .where(sql`${tokens.chainId} = ${chainId}`)
          .execute();
        logger.info(`Fetched ${dbTokens.length} tokens from the database for chainId ${chainId}`);
      } catch (error) {
        logger.error(`Error fetching tokens from the database for chainId ${chainId}:`, error);
        continue; // Skip to the next chain if fetching from the database fails
      }

      const dbTokenMap = new Map(dbTokens.map((token) => [token.address.toLowerCase(), token]));

      const tokensToUpsert = [];
      const tokensToIgnore = new Set<string>();

      // Process tokens fetched from GitHub
      for (const token of fetchedTokens) {
        const address = token.address.toLowerCase();
        const dbToken = dbTokenMap.get(address);

        const tokenData = {
          chainId,
          address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals || 18,
          logoUrl: token.logoURI,
        };

        if (!dbToken) {
          // Token exists in GitHub but not in DB - add it
          tokensToUpsert.push({ ...tokenData, ignored: false });
        } else {
          // Token exists in both - check for updates
          if (
            dbToken.ignored ||
            dbToken.symbol !== token.symbol ||
            dbToken.name !== token.name ||
            dbToken.decimals !== token.decimals ||
            dbToken.logoUrl !== token.logoURI
          ) {
            tokensToUpsert.push({ ...tokenData, ignored: false });
          }
          // Remove from dbTokenMap to track remaining tokens not in GitHub
          dbTokenMap.delete(address);
        }
      }

      // Mark remaining tokens in dbTokenMap as ignored
      for (const [address] of dbTokenMap) {
        tokensToIgnore.add(address);
      }

      // Upsert new or updated tokens
      if (tokensToUpsert.length > 0) {
        for (const token of tokensToUpsert) {
          try {
            await db
              .insert(tokens)
              .values(token)
              .onConflictDoUpdate({
                target: [tokens.chainId, tokens.address],
                set: {
                  symbol: sql`EXCLUDED.symbol`,
                  name: sql`EXCLUDED.name`,
                  decimals: sql`EXCLUDED.decimals`,
                  logoUrl: sql`EXCLUDED.logo_url`,
                  ignored: sql`EXCLUDED.ignored`,
                },
              })
              .execute();

            logger.info(`Upserted token ${token.address} for chainId ${chainId}`);
          } catch (error) {
            logger.error(`Error upserting token ${token.address} for chainId ${chainId}: ${error.message}`, {
              stack: error.stack,
              token,
            });
          }
        }
      }

      // Set ignored = true for tokens not in GitHub
      if (tokensToIgnore.size > 0) {
        const ignoreList = Array.from(tokensToIgnore);
        try {
          await db
            .update(tokens)
            .set({ ignored: true })
            .where(
              sql`${tokens.chainId} = ${chainId} AND ${tokens.address} IN (${ignoreList
                .map((address) => `'${address}'`)
                .join(', ')})`,
            )
            .execute();
          logger.info(`Set ignored = true for ${ignoreList.length} tokens for chainId ${chainId}`);
        } catch (error) {
          logger.error(`Error setting tokens to ignored for chainId ${chainId}:`, error);
        }
      }
    }
  } catch (error) {
    logger.error('Error inserting tokens to database:', error);
  } finally {
    ctx.start();
  }
}

export { fetchTokensByChain, insertTokensToDatabase };
