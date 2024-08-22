import { pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const flags = pgTable('flags', {
  key: varchar('key', { length: 32 }).primaryKey(),
  value: varchar('value', { length: 256 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Flag = typeof flags.$inferSelect;
export type NewFlag = typeof flags.$inferInsert;
