import { relations } from 'drizzle-orm';
import { pgTable, serial, varchar, integer, timestamp, boolean, unique, jsonb, numeric } from 'drizzle-orm/pg-core';

import { chains } from './chains';
import { tokens } from './tokens';

export const swapsTableV2 = pgTable(
  'swaps_v2',
  {
    id: serial('id').primaryKey(),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    transactionHash: varchar('transaction_hash', { length: 256 }).notNull(),
    user: varchar('user', { length: 256 }).notNull(),
    baseId: varchar('base_id', { length: 256 }).notNull(),
    quoteId: varchar('quote_id', { length: 256 }).notNull(),
    poolId: integer('pool_id').notNull(),
    dexType: varchar('dex_type', { length: 256 }).notNull(),
    poolIdx: varchar('pool_idx', { length: 256 }).notNull(),
    block: integer('block').notNull(),
    isBuy: boolean('is_buy').notNull(),
    amountIn: numeric('amount_in', { precision: 38, scale: 18 }).default('0'),
    amountOut: numeric('amount_out', { precision: 38, scale: 18 }).default('0'),
    amountInUSD: numeric('amount_in_usd', { precision: 38, scale: 18 }).default('0'),
    amountOutUSD: numeric('amount_out_usd', { precision: 38, scale: 18 }).default('0'),
    fees: varchar('fees', { length: 256 }).default('0'),
    feesUSD: numeric('fees_usd', { precision: 38, scale: 18 }).default('0'),
    baseFlow: varchar('base_flow', { length: 256 }).notNull(),
    quoteFlow: varchar('quote_flow', { length: 256 }).notNull(),
    callIndex: integer('call_index').notNull(),
    tickAt: timestamp('tick_at').notNull(),
    extraData: jsonb('extra_data').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    comb: unique('swaps_idx_comb').on(t.chainId, t.transactionHash, t.poolId),
  }),
);

export const swapsTableRelations = relations(swapsTableV2, ({ one }) => ({
  chain: one(chains, { fields: [swapsTableV2.chainId], references: [chains.id] }),
  base: one(tokens, { fields: [swapsTableV2.baseId], references: [tokens.id] }),
  quote: one(tokens, { fields: [swapsTableV2.quoteId], references: [tokens.id] }),
}));

export type Swap = typeof swapsTableV2.$inferSelect;
export type NewSwap = typeof swapsTableV2.$inferInsert;
