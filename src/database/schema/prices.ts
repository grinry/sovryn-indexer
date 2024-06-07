import { relations, sql } from 'drizzle-orm';
import { pgTable, timestamp, varchar, integer, unique, serial } from 'drizzle-orm/pg-core';

import { tokens } from './tokens';

export const prices = pgTable(
  'prices',
  {
    id: serial('id').primaryKey(),
    baseId: integer('base_token_id')
      .notNull()
      .references(() => tokens.id),
    quoteId: integer('quote_token_id')
      .notNull()
      .references(() => tokens.id),
    value: varchar('value', { length: 256 }).notNull().default('0'),
    tickAt: timestamp('tick_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    prices_comb_pkey: unique('prices_comb_pkey').on(t.baseId, t.quoteId, t.tickAt),
  }),
);

export const tokensRelations = relations(prices, ({ one }) => ({
  base: one(tokens, {
    fields: [prices.baseId],
    references: [tokens.id],
  }),
  quote: one(tokens, {
    fields: [prices.quoteId],
    references: [tokens.id],
  }),
}));

export type Price = typeof prices.$inferSelect;
export type NewPrice = typeof prices.$inferInsert;
