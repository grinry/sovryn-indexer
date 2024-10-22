import { pgTable, timestamp, varchar, integer, unique, serial, char, boolean, text } from 'drizzle-orm/pg-core';

import { chains } from './chains';

export const tokens = pgTable(
  'tokens',
  {
    id: serial('id').primaryKey(),
    symbol: varchar('symbol', { length: 24 }),
    name: varchar('name', { length: 256 }),
    decimals: integer('decimals').default(18),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    address: char('address', { length: 42 }),
    ignored: boolean('ignored').default(false),
    tradeableSince: timestamp('swapable_since'),
    usdPrice: varchar('usd_price', { length: 64 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
    logoUrl: text('logo_url'),
  },
  (t) => ({
    chain_address_pkey: unique('chain_address_pkey').on(t.chainId, t.address),
  }),
);

export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
