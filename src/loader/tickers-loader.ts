import { eq, sql, and, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { bignumber } from 'mathjs';

import { db } from 'database/client';
import { ammApyDays, tAmmPools, tokens } from 'database/schema';

import { Chain } from './networks/chain-config';
import { LegacyChain } from './networks/legacy-chain';
import { SdexChain } from './networks/sdex-chain';
import { NetworkFeature } from './networks/types';
import { getLastPrices } from './price';

type TickersItem = {
  chain_id: number;
  ticker_id: string;
  base_currency: string;
  target_currency: string;
  last_price: string;
  base_volume: string;
  target_volume: string;
  pool_id: string;
  liquidity_in_usd: string;
  base_symbol?: string;
  target_symbol?: string;
  bid?: string;
  ask?: string;
  high?: string;
  low?: string;
};

export async function prepareTickers(chains: Chain[]): Promise<TickersItem[]> {
  const tickers = await Promise.all(
    chains
      .map((chain) => {
        if (chain.hasFeature(NetworkFeature.legacy)) {
          return getLegacyDexTickers(chain.legacy);
        } else if (chain.hasFeature(NetworkFeature.sdex)) {
          return getAmbientTickers(chain.sdex);
        }
        return null;
      })
      .filter(Boolean),
  );

  return tickers.flatMap((chainTickers) => chainTickers);
}

async function getLegacyDexTickers(chain: LegacyChain) {
  const balanceSq = db
    .select({
      chainId: ammApyDays.chainId,
      pool: ammApyDays.pool,
      date: sql<string>`max(${ammApyDays.date})`.as('date'),
      balanceUsd: sql<string>`max(${ammApyDays.balanceUsd})`.as('balanceUsd'),
    })
    .from(ammApyDays)
    .groupBy(ammApyDays.chainId, ammApyDays.pool)
    .as('sq_balances');

  const baseToken = alias(tokens, 't1');
  const quoteToken = alias(tokens, 't2');

  const pools = await db
    .select({
      poolId: tAmmPools.pool,
      chainId: tAmmPools.chainId,
      baseTokenId: tAmmPools.token1Id,
      quoteTokenId: tAmmPools.token2Id,
      baseVolume: tAmmPools.token1Volume,
      quoteVolume: tAmmPools.token2Volume,
      liquidityInUsd: balanceSq.balanceUsd,
      baseAddress: baseToken.address,
      quoteAddress: quoteToken.address,
      baseSymbol: baseToken.symbol,
      quoteSymbol: quoteToken.symbol,
    })
    .from(tAmmPools)
    .innerJoin(baseToken, eq(tAmmPools.token1Id, baseToken.id))
    .innerJoin(quoteToken, eq(tAmmPools.token2Id, quoteToken.id))
    .innerJoin(balanceSq, and(eq(balanceSq.chainId, tAmmPools.chainId), eq(balanceSq.pool, tAmmPools.pool)))
    .where(eq(tAmmPools.chainId, chain.context.chainId))
    .execute();

  function getValidatedToken(address: string) {
    return address;
    // may need to show 0x0 for native token, but verify this with coingecko.
    // return address.toLowerCase() === chain.nativeTokenWrapper.toLowerCase() ? ZeroAddress : address;
  }

  const tickers = pools.map((pool) => {
    const baseAddress = getValidatedToken(pool.baseAddress);
    const quoteAddress = getValidatedToken(pool.quoteAddress);
    const lastPrice = bignumber(pool.quoteVolume).div(pool.baseVolume);
    return {
      chain_id: pool.chainId,
      ticker_id: `${baseAddress}_${quoteAddress}`,
      base_currency: baseAddress,
      target_currency: quoteAddress,
      last_price: lastPrice.isFinite() ? lastPrice.toString() : '0',
      base_volume: pool.baseVolume,
      target_volume: pool.quoteVolume,
      pool_id: `${pool.chainId}:${pool.poolId}`,
      liquidity_in_usd: pool.liquidityInUsd, // todo: calculate liquidity in USD

      base_symbol: pool.baseSymbol,
      target_symbol: pool.quoteSymbol,
    } satisfies TickersItem;
  });

  return tickers;
}

async function getAmbientTickers(chain: SdexChain) {
  const lastPrices = await getLastPrices();
  const poolsResponse = await chain.queryPools(1000);

  const assets = await db
    .select({ id: tokens.id, address: tokens.address, symbol: tokens.symbol, decimals: tokens.decimals })
    .from(tokens)
    .where(
      and(
        eq(tokens.chainId, chain.context.chainId),
        inArray(
          tokens.address,
          poolsResponse.pools.flatMap((pool) => [pool.base, pool.quote]),
        ),
        eq(tokens.ignored, false),
      ),
    )
    .execute();

  function getTokenId(address: string) {
    return assets.find((asset) => asset.address === address)?.id;
  }

  function getTokenDecimals(address: string) {
    return assets.find((asset) => asset.address === address)?.decimals ?? 18;
  }

  function getTokenSymbol(address: string) {
    return assets.find((asset) => asset.address === address)?.symbol;
  }

  function getUsdPrice(token: string) {
    const price = lastPrices.find(
      (item) => item.baseId === getTokenId(token) && item.quoteId === getTokenId(chain.context.stablecoinAddress),
    );
    return bignumber(price?.value ?? 0);
  }

  const tickers = await Promise.all(
    poolsResponse.pools
      .filter((pool) => {
        const baseToken = pool.base.toLowerCase();
        const quoteToken = pool.quote.toLowerCase();
        return (
          assets.some((asset) => asset.address === baseToken) && assets.some((asset) => asset.address === quoteToken)
        );
      })
      .map(async (pool) => {
        const baseToken = pool.base.toLowerCase();
        const quoteToken = pool.quote.toLowerCase();

        const stats = await getPoolStats(chain.context.chainIdHex, pool.base, pool.quote, pool.poolIdx);

        const baseVolume = bignumber(stats.baseVolume).div(10 ** getTokenDecimals(baseToken));
        const quoteVolume = bignumber(stats.quoteVolume).div(10 ** getTokenDecimals(quoteToken));
        const lastPrice = bignumber(1).div(
          bignumber(stats.lastPriceSwap)
            .mul(10 ** getTokenDecimals(quoteToken))
            .div(10 ** getTokenDecimals(baseToken)),
        );

        const baseTvl = bignumber(stats.baseTvl).div(10 ** getTokenDecimals(baseToken));
        const quoteTvl = bignumber(stats.quoteTvl).div(10 ** getTokenDecimals(quoteToken));

        const baseTvlUsd = baseTvl.mul(getUsdPrice(baseToken));
        const quoteTvlUsd = quoteTvl.mul(getUsdPrice(quoteToken));

        return {
          chain_id: chain.context.chainId,
          ticker_id: `${pool.base}_${pool.quote}`,
          base_currency: pool.base,
          target_currency: pool.quote,
          last_price: lastPrice.isFinite() ? lastPrice.toString() : '0',
          base_volume: baseVolume.isFinite() ? baseVolume.toString() : '0',
          target_volume: quoteVolume.isFinite() ? quoteVolume.toString() : '0',
          pool_id: `${chain.context.chainId}:${pool.base}_${pool.quote}_${pool.poolIdx}`,
          liquidity_in_usd: baseTvlUsd.add(quoteTvlUsd).toString(),
          base_symbol: getTokenSymbol(baseToken),
          target_symbol: getTokenSymbol(quoteToken),
        } satisfies TickersItem;
      }),
  );

  return tickers;
}

type PoolStats = {
  latestTime: number;
  baseTvl: number;
  quoteTvl: number;
  baseVolume: number;
  quoteVolume: number;
  baseFees: number;
  quoteFees: number;
  lastPriceSwap: number;
  lastPriceLiq: number;
  lastPriceIndic: number;
  feeRate: number;
};

async function getPoolStats(chainId: string, base: string, quote: string, poolIdx: number): Promise<PoolStats> {
  return fetch(
    `https://bob-ambient-graphcache.sovryn.app/gcgo/pool_stats?chainId=${chainId}&base=${base}&quote=${quote}&poolIdx=${poolIdx}`,
  )
    .then((res) => res.json())
    .then((data) => data.data satisfies PoolStats);
}
