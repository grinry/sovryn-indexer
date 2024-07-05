import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from 'database/client';
import { prices, tokens } from 'database/schema';

export const priceRepository = {
  listLastPrices: () =>
    db
      .select()
      .from(prices)
      .where(eq(prices.tickAt, sql`(select max(${prices.tickAt}) from ${prices})`)),
};
