import 'dotenv/config';

import { drizzle } from 'drizzle-orm/postgres-js';

import { migrationClient } from './client';

(async () => {
  const db = drizzle(migrationClient);
  // await db
  //   .insert(users)
  //   .values({
  //     email: 'test',
  //     password: 'secret',
  //   })
  //   .onConflictDoNothing()
  //   .execute();

  await migrationClient.end();
})();
