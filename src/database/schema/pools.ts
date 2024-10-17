import { relations } from 'drizzle-orm';
import { pgTable, timestamp, varchar, integer, unique, serial, boolean, jsonb } from 'drizzle-orm/pg-core';

import { chains } from './chains';
import { tokens } from './tokens';

export enum PoolType {
  ambient = 'ambient',
}

export type PoolExtra = {
  // for ambient pools
  poolIdx?: number;
  lpToken?: string;
  // todo: add extra fields once we know what they are
};

export const poolsTable = pgTable(
  'pools',
  {
    id: serial('id').primaryKey(),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).$type<PoolType>().notNull(),
    identifier: varchar('identifier', { length: 256 }).notNull(),
    baseId: integer('base_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    quoteId: integer('quote_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    featured: boolean('highlighted').default(false), // if pool needs to be on top of the list
    price: varchar('price', { length: 256 }).default('0'), // last price of base in quote
    fee: varchar('fee', { length: 256 }).default('0'), // fee protocol charges for swaps
    apr: varchar('apr', { length: 256 }).default('0'), // expected APR for providing liquidity
    baseLiquidity: varchar('base_liquidity', { length: 256 }).default('0'),
    quoteLiquidity: varchar('quote_liquidity', { length: 256 }).default('0'),
    baseVolume: varchar('base_volume', { length: 256 }).default('0'),
    quoteVolume: varchar('quote_volume', { length: 256 }).default('0'),
    dailyBaseVolume: varchar('daily_volume', { length: 256 }).default('0'),
    dailyQuoteVolume: varchar('daily_quote_volume', { length: 256 }).default('0'),
    extra: jsonb('extra').$type<PoolExtra>().default({}), // extra data for pool
    // to track when pool had data updated using cronjobs (liquidity, volume, etc)
    processedAt: timestamp('processed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    comb: unique('pools_idx_comb').on(t.chainId, t.type, t.identifier),
    search_comb: unique('pools_search_comb').on(t.chainId, t.identifier),
  }),
);

export const poolsTableRelations = relations(poolsTable, ({ one }) => ({
  chain: one(chains, { fields: [poolsTable.chainId], references: [chains.id] }),
  base: one(tokens, { fields: [poolsTable.baseId], references: [tokens.id] }),
  quote: one(tokens, { fields: [poolsTable.quoteId], references: [tokens.id] }),
}));

export type Pool = typeof poolsTable.$inferSelect;
export type NewPool = typeof poolsTable.$inferInsert;
