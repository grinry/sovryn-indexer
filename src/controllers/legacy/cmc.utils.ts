import dayjs from 'dayjs';
import { eq, and } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { bignumber, max as bnMax, min as bnMin } from 'mathjs';

import { db } from 'database/client';
import { chains, tAmmPools, tokens } from 'database/schema';
import { getPricesInRange } from 'loader/price';
import { prettyNumber } from 'utils/numbers';

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

  const priceItems = await getPricesInRange(dayjs().subtract(1, 'week').toDate(), new Date());

  const items = pools.map((pool) => {
    const basePrices = priceItems.filter((item) => item.tokenId === pool.base.id);
    const quotePrices = priceItems.filter((item) => item.tokenId === pool.quote.id);

    const basePrices24h = basePrices.filter((x) => dayjs(x.tickAt).unix() >= dayAgo);
    const quotePrices24h = quotePrices.filter((x) => dayjs(x.tickAt).unix() >= dayAgo);

    const lastUsdPrice = basePrices[0]?.avg || '0';
    const lastPriceQuote = quotePrices[0]?.avg || '0';
    const lastPrice = lastUsdPrice && lastPriceQuote ? prettyNumber(bignumber(lastUsdPrice).div(lastPriceQuote)) : '0';

    const baseDayPrice = basePrices.find((x) => dayjs(x.tickAt).unix() <= dayAgo)?.avg || lastUsdPrice;
    const baseWeekPrice = basePrices[basePrices.length - 1]?.avg || lastUsdPrice;

    const quoteDayPrice = quotePrices.find((x) => dayjs(x.tickAt).unix() <= dayAgo)?.avg || lastPriceQuote;
    const quoteWeekPrice = quotePrices[quotePrices.length - 1]?.avg || '0';

    const baseHigh24 =
      basePrices24h.length > 0 ? basePrices24h.map((x) => bignumber(x.high)) : [bignumber(lastPriceQuote)];
    const baseHigh24Usd = baseHigh24.length ? prettyNumber(bnMax(baseHigh24)) : '0';

    const baseLow24 = basePrices24h.map((x) => bignumber(x.low));
    const baseLow24Usd = baseLow24.length ? prettyNumber(bnMin(baseLow24)) : '0';

    const quoteHigh24 = quotePrices24h.map((x) => bignumber(x.high));
    const quoteHigh24Usd = quoteHigh24.length ? prettyNumber(bnMax(quoteHigh24)) : '0';

    const quoteLow24 = quotePrices24h.map((x) => bignumber(x.low));
    const quoteLow24Usd = quoteLow24.length ? prettyNumber(bnMin(quoteLow24)) : '0';

    const high24 = baseHigh24Usd && quoteHigh24Usd ? prettyNumber(bignumber(baseHigh24Usd).div(quoteHigh24Usd)) : '0';
    const low24 = baseLow24Usd && quoteLow24Usd ? prettyNumber(bignumber(baseLow24Usd).div(quoteLow24Usd)) : '0';

    const percentChange24Usd =
      baseDayPrice && lastUsdPrice ? prettyNumber(bignumber(lastUsdPrice).div(baseDayPrice).sub(1).mul(100)) : '0';
    const percentChangeWeekUsd =
      baseWeekPrice && lastUsdPrice ? prettyNumber(bignumber(lastUsdPrice).div(baseWeekPrice).sub(1).mul(100)) : '0';

    const percentChange24Quote =
      quoteDayPrice && lastPriceQuote
        ? prettyNumber(bignumber(lastPriceQuote).div(quoteDayPrice).sub(1).mul(100))
        : '0';
    const percentChangeWeekQuote =
      quoteWeekPrice && lastPriceQuote
        ? prettyNumber(bignumber(lastPriceQuote).div(quoteWeekPrice).sub(1).mul(100))
        : '0';

    return {
      trading_pairs: `${pool.base.address}_${pool.quote.address}`,
      base_symbol: pool.base.symbol,
      base_id: pool.base.address,
      quote_symbol: pool.quote.symbol,
      quote_id: pool.quote.address,
      base_volume: prettyNumber(bignumber(pool.legacy_amm__pools.token2Volume)),
      quote_volume: prettyNumber(bignumber(pool.legacy_amm__pools.token1Volume)),
      base_volume_usd: prettyNumber(bignumber(pool.legacy_amm__pools.token2Volume).mul(lastUsdPrice)),
      quote_volume_usd: prettyNumber(bignumber(pool.legacy_amm__pools.token1Volume).mul(lastPriceQuote)),
      last_price_usd: maybeNumber(lastUsdPrice),
      high_price_24_usd: maybeNumber(baseHigh24Usd),
      lowest_price_24_usd: maybeNumber(baseLow24Usd),
      price_change_percent_24h_usd: maybeNumber(percentChange24Usd),
      price_change_percent_week_usd: maybeNumber(percentChangeWeekUsd),
      // base -> quote price
      last_price: maybeNumber(lastPrice),
      high_price_24: maybeNumber(high24),
      lowest_price_24: maybeNumber(low24),
      price_change_percent_24h: maybeNumber(percentChange24Quote),
      price_change_percent_week: maybeNumber(percentChangeWeekQuote),
      // 24h ago price (in USD)
      day_price: maybeNumber(baseDayPrice),
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
    total_volume_usd: prettyNumber(totalUsdVolume),
  };
}

function maybeNumber(value: string) {
  // intentionally returning 0 as a number if value is invalid, so we know it needs to be looked at
  return isFinite(Number(value)) && isNaN(Number(value)) ? prettyNumber(value) : 0;
}
