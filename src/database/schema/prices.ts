import { pgTable, timestamp, varchar, integer, unique, serial } from 'drizzle-orm/pg-core';

import { tokens } from './tokens';

/* @deprecated */
export const prices = pgTable(
  'prices',
  {
    id: serial('id').primaryKey(),
    baseId: integer('base_token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    quoteId: integer('quote_token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    value: varchar('value', { length: 256 }).notNull().default('0'),
    tickAt: timestamp('tick_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    prices_comb_pkey: unique('prices_comb_pkey').on(t.baseId, t.quoteId, t.tickAt),
  }),
);

export type Price = typeof prices.$inferSelect;
export type NewPrice = typeof prices.$inferInsert;
