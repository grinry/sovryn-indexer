import { sql } from 'drizzle-orm';

import { db } from 'database/client';

// use result of [EXPLAIN] and submit it to https://explain.depesz.com/ to get a better visualization
export async function analyzeSelectQuery(q: any, label?: string) {
  console.warn('[EXPLAIN]-------------------:', label);
  const explain = await db
    .execute(sql`EXPLAIN (ANALYZE, BUFFERS, COSTS, SETTINGS, SUMMARY, TIMING, WAL, VERBOSE) ${q}`)
    .then((result) => result.map((r) => r['QUERY PLAN']).join('\n'));
  console.log(explain);
  console.log('[QUERY]-------------------:', label);
  console.log(q.toSQL().sql);
}
