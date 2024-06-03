import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import config from 'config';

(async () => {
  const migrationClient = postgres(config.databaseUrl, { max: 1 });
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
