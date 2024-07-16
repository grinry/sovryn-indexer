import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import config from 'config';

(async () => {
  const migrationClient = postgres(config.databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);
  const tablenames = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '__drizzle_migrations')
    .map((name) => `"public"."${name}"`)
    .join(', ');
  console.log({
    tablenames,
    tables,
  });
  try {
    await db.execute(sql`TRUNCATE TABLE ${sql.raw(tables)} CASCADE;`);
    for (const table of tablenames) {
      await db.execute(sql`DROP TABLE ${sql.raw(`"public"."${table.tablename}"`)} CASCADE;`);
    }
  } catch (error) {
    console.error(error);
  }
  await db.execute(sql`DROP TABLE IF EXISTS "public"."__drizzle_migrations";`);
  await db.execute(sql`DROP TABLE IF EXISTS "drizzle"."__drizzle_migrations";`);
  await migrationClient.end();
})();
