import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import config from 'config';
import { logger } from 'utils/logger';
import { onShutdown } from 'utils/shutdown';

import * as schemas from './schema';

export const queryClient = postgres(config.databaseUrl, { max: 100 });

export const db = drizzle(queryClient, {
  logger: {
    logQuery: (query: string, params: unknown[]) => logger[config.dbLogLevel]({ params }, `Query: ${query}`),
  },
  schema: schemas,
});

export type Tx = typeof db & { rollback: () => void };

onShutdown(async () => {
  await queryClient.end();
});
