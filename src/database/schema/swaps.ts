import { pgTable, timestamp, varchar, integer, unique, serial, char, boolean } from 'drizzle-orm/pg-core';

import { chains } from './chains';

export const swapsTable = pgTable(
  'swaps',
  {
    id: serial('id').primaryKey(),
    transactionHash: varchar('transactionHash'),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    user: char('address'),
    baseId: varchar('base_id').notNull(),
    quoteId: varchar('quote_id').notNull(),
    poolIdx: varchar('pool_idx'),
    block: integer('block'),
    tickAt: timestamp('tick_at').defaultNow(),
    isBuy: boolean('is_buy'),
    inBaseQty: boolean('is_base_qty'),
    qty: varchar('qty'),
    limitPrice: varchar('limit_price'),
    minOut: varchar('min_out'),
    baseFlow: varchar('base_flow'),
    quoteFlow: varchar('quote_flow'),
    callIndex: integer('call_index'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    swaps: unique('swaps_comb_pkey').on(t.baseId, t.quoteId, t.transactionHash),
  }),
);

export type Swap = typeof swapsTable.$inferSelect;
export type NewSwap = typeof swapsTable.$inferInsert;
