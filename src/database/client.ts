import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schemas from './schema';

export const migrationClient = postgres(process.env.DATABASE_URL!, { max: 1 });
export const queryClient = postgres(process.env.DATABASE_URL!);

export const db = drizzle(queryClient, {
  logger: true,
  schema: schemas,
});

export type Tx = typeof db & { rollback: () => void };
