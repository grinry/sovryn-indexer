import { pgTable, timestamp, serial, integer, varchar, decimal, index, char, unique } from 'drizzle-orm/pg-core';

import { chains } from '../chains';
import { tokens } from '../tokens';

export const tTvl = pgTable(
  'legacy_tvls',
  {
    id: serial('id').primaryKey(),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    group: varchar('group', { length: 32 }).notNull(),
    date: timestamp('date').notNull(),
    contract: char('contract', { length: 42 }).notNull(),
    tokenId: integer('token_id').references(() => tokens.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    balance: decimal('balance', { precision: 40, scale: 2 }).notNull(),
    balanceUsd: decimal('balance_usd', { precision: 40, scale: 18 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    unq: unique('ltvl_unq').on(t.chainId, t.group, t.date, t.contract),
  }),
);

export type TTvl = typeof tTvl.$inferSelect;
export type TNewTvl = typeof tTvl.$inferInsert;
