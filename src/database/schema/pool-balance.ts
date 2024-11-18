import { pgTable, timestamp, varchar, integer, unique, serial, char } from 'drizzle-orm/pg-core';

import { chains } from './chains';

export const poolBalanceTable = pgTable(
  'pool-balance',
  {
    id: serial('id').primaryKey(),
    baseId: varchar('base_id').notNull(),
    quoteId: varchar('quote_id').notNull(),
    ambientLiq: varchar('ambient-liq'),
    user: char('user', { length: 42 }).notNull(),
    time: varchar('time'),
    concLiq: varchar('concLiq'),
    rewardLiq: varchar('rewardLiq'),
    baseQty: varchar('baseQty'),
    quoteQty: varchar('quoteQty'),
    aggregatedLiquidity: varchar('aggregatedLiquidity'),
    aggregatedBaseFlow: varchar('aggregatedBaseFlow'),
    aggregatedQuoteFlow: varchar('aggregatedQuoteFlow'),
    positionType: varchar('positionType'),
    bidTick: integer('bidTick'),
    askTick: integer('askTick'),
    aprDuration: varchar('aprDuration'),
    aprPostLiq: varchar('aprPostLiq'),
    aprContributedLiq: varchar('aprContributedLiq'),
    aprEst: varchar('aprEst'),
    identifier: varchar('identifier'),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    block: integer('block'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    comb: unique('pool_balance_comb_pkey').on(t.user, t.chainId, t.identifier),
  }),
);

export type PoolBalance = typeof poolBalanceTable.$inferSelect;
export type NewPoolBalance = typeof poolBalanceTable.$inferInsert;
