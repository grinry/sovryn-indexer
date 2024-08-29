import { sql } from 'drizzle-orm';
import { PgSelectQueryBuilder } from 'drizzle-orm/pg-core';

import { db } from 'database/client';

export async function analyzeSelectQuery(q: PgSelectQueryBuilder) {
  console.warn('[EXPLAIN]-------------------:');
  const explain = await db
    .execute(sql`EXPLAIN (ANALYZE, BUFFERS, COSTS, SETTINGS, SUMMARY, TIMING, WAL, VERBOSE) ${q}`)
    .then((result) => result.map((r) => r['QUERY PLAN']).join('\n'));
  console.log(explain);
  console.log('[QUERY]-------------------:');
  console.log(q.toSQL().sql);
}
