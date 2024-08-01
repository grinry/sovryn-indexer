import { Column, sql } from 'drizzle-orm';

export const lower = (col: Column) => sql<string>`lower(${col})`;
