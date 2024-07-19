import { pgTable, timestamp, serial, integer, varchar, decimal, index, char, unique } from 'drizzle-orm/pg-core';

import { chains } from '../chains';
import { tokens } from '../tokens';

export enum TvlGroup {
  amm = 'tvlAmm',
  lending = 'tvlLending',
  protocol = 'tvlProtocol',
  subprotocol = 'tvlSubprotocols',
  staking = 'tvlStaking',
  zero = 'tvlZero',
  mynt = 'tvlMynt',
  sdex = 'tvlSdex',
  fish = 'tvlFish',
}

export const tvlTable = pgTable(
  'legacy_tvls',
  {
    id: serial('id').primaryKey(),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    date: timestamp('date').notNull(),
    group: varchar('group', { length: 64 }).notNull(),
    contract: char('pool', { length: 42 }).notNull(),
    tokenId: integer('token_id')
      .notNull()
      .references(() => tokens.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    balance: decimal('balance', { scale: 18, precision: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    unq: unique('ltvl__unq').on(t.chainId, t.date, t.group, t.contract, t.tokenId),
  }),
);

export type TvlTableItem = typeof tvlTable.$inferSelect;
export type NewTvlTableItem = typeof tvlTable.$inferInsert;
