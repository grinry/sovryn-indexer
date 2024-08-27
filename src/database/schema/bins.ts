import { pgTable, timestamp, varchar, integer, unique, serial, char, boolean } from 'drizzle-orm/pg-core';

import { chains } from './chains';

export const binsTable = pgTable(
  'bins',
  {
    id: serial('id').primaryKey(),
    binId: varchar('bin_id').notNull(),
    liquidity: varchar('liquidity'),
    priceX: varchar('price_x'),
    priceY: varchar('price_y'),
    totalSupply: varchar('total_supply'),
    reserveX: varchar('reserve_x'),
    reserveY: varchar('reserve_y'),
    tickAt: timestamp('tick_at').defaultNow(),
    block: integer('block'),
    user: char('address'),
    chainId: integer('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    bins: unique('bins_comb_pkey').on(t.binId),
  }),
);

export type Bin = typeof binsTable.$inferSelect;
export type NewBin = typeof binsTable.$inferInsert;
