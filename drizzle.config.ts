import type { Config } from 'drizzle-kit';

import config from './src/config';

export default {
  schema: './src/database/schema/*',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: config.databaseUrl,
  },
} satisfies Config;
