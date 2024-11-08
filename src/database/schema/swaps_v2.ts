import { relations } from 'drizzle-orm';
import { pgTable, serial, varchar, integer, timestamp, unique, jsonb, char } from 'drizzle-orm/pg-core';

import { SwapExtra } from 'typings/subgraph/liquidity';

import { chains } from './chains';
import { poolsTable } from './pools';
import { tokens } from './tokens';

export const swapsTableV2 = pgTable(
  'swaps_v2',
  {
    id: serial('id').primaryKey(),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    transactionHash: char('transaction_hash', { length: 66 }).notNull(),
    baseAmount: varchar('base_amount', { length: 256 }).notNull().default('0'),
    quoteAmount: varchar('quote_amount', { length: 256 }).notNull().default('0'),
    fees: varchar('fees', { length: 256 }).default('0'),
    price: varchar('price', { length: 256 }).default('0'),
    callIndex: integer('call_index').notNull(),
    user: char('user', { length: 42 }).notNull(),
    baseId: integer('base_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    quoteId: integer('quote_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    poolId: integer('pool_id').references(() => poolsTable.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }),
    block: integer('block').notNull(),
    tickAt: timestamp('tick_at').notNull(),
    extra: jsonb('extra').$type<SwapExtra>().default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    comb: unique('swaps_idx_comb').on(t.chainId, t.transactionHash, t.callIndex),
  }),
);

export const swapsTableRelations = relations(swapsTableV2, ({ one }) => ({
  chain: one(chains, { fields: [swapsTableV2.chainId], references: [chains.id] }),
  base: one(tokens, { fields: [swapsTableV2.baseId], references: [tokens.id] }),
  quote: one(tokens, { fields: [swapsTableV2.quoteId], references: [tokens.id] }),
}));

export type SwapV2 = typeof swapsTableV2.$inferSelect;
export type NewSwapV2 = typeof swapsTableV2.$inferInsert;
