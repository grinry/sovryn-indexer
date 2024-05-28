import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import config from 'config';

import * as schemas from './schema';

export const migrationClient = postgres(config.databaseUrl, { max: 1 });
export const queryClient = postgres(config.databaseUrl);

export const db = drizzle(queryClient, {
  logger: true,
  schema: schemas,
});

export type Tx = typeof db & { rollback: () => void };
