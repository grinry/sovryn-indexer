import { sql } from 'drizzle-orm';
import { pgTable, timestamp, varchar, integer, unique, serial } from 'drizzle-orm/pg-core';

export const tokens = pgTable(
  'tokens',
  {
    id: serial('id').primaryKey(),
    symbol: varchar('symbol', { length: 24 }),
    name: varchar('name', { length: 256 }),
    decimals: integer('decimals').default(18),
    chainId: integer('chain_id').notNull(),
    address: varchar('address', { length: 64 }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    chain_address_pkey: unique('chain_address_pkey').on(t.chainId, t.address),
  }),
);

export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
