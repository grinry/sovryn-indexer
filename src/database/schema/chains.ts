import { sql } from 'drizzle-orm';
import { pgTable, timestamp, integer, varchar, char } from 'drizzle-orm/pg-core';

export const chains = pgTable('chains', {
  id: integer('id').unique('chains_id_unique_pk').primaryKey().notNull(),
  name: varchar('name', { length: 256 }).notNull(),
  stablecoinAddress: char('stablecoin_address', { length: 42 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Chain = typeof chains.$inferSelect;
export type NewChain = typeof chains.$inferInsert;
