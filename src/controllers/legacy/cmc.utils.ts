import dayjs from 'dayjs';
import { desc, eq, sql, and, or, gte, avg, max, min } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { bignumber, max as bnMax, min as bnMin } from 'mathjs';

import { db } from 'database/client';
import { chains, prices, tAmmPools, tokens } from 'database/schema';

export async function prepareSummary() {
  const base = alias(tokens, 'base');
  const quote = alias(tokens, 'quote');
  const stablecoin = alias(tokens, 'stablecoin');

  const dayAgo = dayjs().subtract(1, 'day').unix();

  const pools = await db
    .select()
    .from(tAmmPools)
    // old BE has base and quote reversed, leaving it as is for backward compatibility
    .innerJoin(base, eq(base.id, tAmmPools.token2Id))
    .innerJoin(quote, eq(quote.id, tAmmPools.token1Id))
    .innerJoin(chains, eq(chains.id, tAmmPools.chainId))
    .innerJoin(
      stablecoin,
      and(eq(stablecoin.chainId, tAmmPools.chainId), eq(stablecoin.address, chains.stablecoinAddress)),
    )
    .execute();

  const tokenPairs = pools
    .map((pool) => [
      { baseId: pool.base.id, quoteId: pool.stablecoin.id },
      { baseId: pool.quote.id, quoteId: pool.stablecoin.id },
    ])
    .flat();

  const priceItems = await db
    .select({
      baseId: prices.baseId,
      quoteId: prices.quoteId,
      date: sql`date_trunc('hour', ${prices.tickAt})`.mapWith(String).as('date'),
      avg: avg(sql`${prices.value}::numeric`).as('avg'),
      high: max(sql`${prices.value}::numeric`).as('high'),
      low: min(sql`${prices.value}::numeric`).as('low'),
    })
    .from(prices)
    .where(
      and(
        gte(prices.tickAt, dayjs().subtract(1, 'week').toDate()),
        or(...tokenPairs.map((x) => and(eq(prices.baseId, x.baseId), eq(prices.quoteId, x.quoteId)))),
      ),
    )
    .groupBy(prices.baseId, prices.quoteId, sql`date`)
    .orderBy(desc(sql`date`))
    .execute();

  const items = pools.map((pool) => {
    const basePrices = priceItems.filter((item) => item.baseId === pool.base.id && item.quoteId === pool.stablecoin.id);
    const quotePrices = priceItems.filter(
      (item) => item.baseId === pool.quote.id && item.quoteId === pool.stablecoin.id,
    );

    const basePrices24h = basePrices.filter((x) => dayjs(x.date).unix() >= dayAgo);
    const quotePrices24h = quotePrices.filter((x) => dayjs(x.date).unix() >= dayAgo);

    const lastUsdPrice = basePrices[0]?.avg || null;
    const lastPriceQuote = quotePrices[0]?.avg || null;
    const lastPrice = lastUsdPrice && lastPriceQuote ? bignumber(lastUsdPrice).div(lastPriceQuote).toFixed(18) : null;
    const baseDayPrice = basePrices.find((x) => dayjs(x.date).unix() <= dayAgo)?.avg || null;
    const baseWeekPrice = basePrices[basePrices.length - 1]?.avg || null;

    const quoteDayPrice = quotePrices.find((x) => dayjs(x.date).unix() <= dayAgo)?.avg || null;
    const quoteWeekPrice = quotePrices[quotePrices.length - 1]?.avg || null;

    const baseHigh24 = basePrices24h.map((x) => bignumber(x.high));
    const baseHigh25Usd = baseHigh24.length ? bnMax(baseHigh24).toFixed(18) : null;

    const baseLow24 = basePrices24h.map((x) => bignumber(x.low));
    const baseLow24Usd = baseLow24.length ? bnMin(baseLow24).toFixed(18) : null;

    const quoteHigh24 = quotePrices24h.map((x) => bignumber(x.high));
    const quoteHigh24Usd = quoteHigh24.length ? bnMax(quoteHigh24).toFixed(18) : null;

    const quoteLow24 = quotePrices24h.map((x) => bignumber(x.low));
    const quoteLow24Usd = quoteLow24.length ? bnMin(quoteLow24).toFixed(18) : null;

    const high24 = baseHigh25Usd && quoteHigh24Usd ? bignumber(baseHigh25Usd).div(quoteHigh24Usd).toFixed(18) : null;
    const low24 = baseLow24Usd && quoteLow24Usd ? bignumber(baseLow24Usd).div(quoteLow24Usd).toFixed(18) : null;

    const percentChange24Usd =
      baseDayPrice && lastUsdPrice ? bignumber(lastUsdPrice).div(baseDayPrice).sub(1).mul(100).toFixed(2) : null;
    const percentChangeWeekUsd =
      baseWeekPrice && lastUsdPrice ? bignumber(lastUsdPrice).div(baseWeekPrice).sub(1).mul(100).toFixed(2) : null;

    const percentChange24Quote =
      quoteDayPrice && lastPriceQuote ? bignumber(lastPriceQuote).div(quoteDayPrice).sub(1).mul(100).toFixed(2) : null;
    const percentChangeWeekQuote =
      quoteWeekPrice && lastPriceQuote
        ? bignumber(lastPriceQuote).div(quoteWeekPrice).sub(1).mul(100).toFixed(2)
        : null;

    return {
      trading_pairs: `${pool.base.address}_${pool.quote.address}`,
      base_symbol: pool.base.symbol,
      base_id: pool.base.address,
      quote_symbol: pool.quote.symbol,
      quote_id: pool.quote.address,
      base_volume: bignumber(pool.legacy_amm__pools.token2Volume).toFixed(pool.base.decimals),
      quote_volume: bignumber(pool.legacy_amm__pools.token1Volume).toFixed(pool.base.decimals),
      base_volume_usd: bignumber(pool.legacy_amm__pools.token2Volume).mul(lastUsdPrice).toFixed(18),
      quote_volume_usd: bignumber(pool.legacy_amm__pools.token1Volume).mul(lastPriceQuote).toFixed(18),
      last_price_usd: lastUsdPrice,
      high_price_24_usd: baseHigh25Usd,
      lowest_price_24_usd: baseLow24Usd,
      price_change_percent_24h_usd: percentChange24Usd,
      price_change_percent_week_usd: percentChangeWeekUsd,
      // base -> quote price
      last_price: lastPrice,
      high_price_24: high24,
      lowest_price_24: low24,
      price_change_percent_24h: percentChange24Quote,
      price_change_percent_week: percentChangeWeekQuote,
      // 24h ago price (in USD)
      day_price: baseDayPrice,
    };
  });

  const pairs: Record<string, (typeof items)[number]> = {};
  let totalUsdVolume = bignumber('0');
  items.forEach((item) => {
    pairs[item.trading_pairs] = item;
    totalUsdVolume = totalUsdVolume.add(item.base_volume_usd);
  });

  return {
    pairs,
    updated_at: new Date().toISOString(),
    total_volume_usd: totalUsdVolume.toFixed(18),
  };
}
