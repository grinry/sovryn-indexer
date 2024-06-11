import { pgTable, timestamp, serial, integer, varchar, decimal, index, char, unique } from 'drizzle-orm/pg-core';

import { chains } from '../chains';

export const ammApyBlocks = pgTable(
  'legacy_amm__apy_blocks',
  {
    id: serial('id').primaryKey(),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    poolToken: char('pool_token', { length: 42 }).notNull(),
    pool: char('pool', { length: 42 }).notNull(),
    block: integer('block').notNull(),
    blockTimestamp: timestamp('block_timestamp').notNull(),
    balanceBtc: decimal('balance_btc', { scale: 18, precision: 25 }).notNull(),
    conversionFeeBtc: decimal('conversion_fee_btc', { scale: 18, precision: 25 }).notNull(),
    rewards: decimal('rewards', { scale: 18, precision: 25 }).notNull(),
    rewardsCurrency: varchar('rewards_currency', { length: 64 }).notNull(),
    rewardsBtc: decimal('rewards_btc', { scale: 18, precision: 25 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    unq: unique('lamab__unq').on(t.chainId, t.pool, t.block),
  }),
);

export type AmmApyBlock = typeof ammApyBlocks.$inferSelect;
export type NewAmmApyBlock = typeof ammApyBlocks.$inferInsert;

export const ammApyDays = pgTable(
  'legacy_amm__apy_days',
  {
    id: serial('id').primaryKey(),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    date: timestamp('date').notNull(),
    poolToken: char('pool_token', { length: 42 }).notNull(),
    pool: char('pool', { length: 42 }).notNull(),
    balanceBtc: decimal('balance_btc', { scale: 18, precision: 25 }).notNull(),
    feeApy: decimal('fee_apy', { scale: 18, precision: 25 }).notNull(),
    rewardsApy: decimal('rewards_apy', { scale: 18, precision: 25 }).notNull(),
    totalApy: decimal('total_apy', { scale: 18, precision: 25 }).notNull(),
    btcVolume: decimal('btc_volume', { scale: 18, precision: 25 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    unq: unique('lamad__unq').on(t.chainId, t.date, t.poolToken),
  }),
);

export type AmmApyDay = typeof ammApyDays.$inferSelect;
export type NewAmmApyDay = typeof ammApyDays.$inferInsert;
