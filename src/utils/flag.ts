import { eq } from 'drizzle-orm';

import { db } from 'database/client';
import { flags } from 'database/schema/flags';

export const getFlag = async (key: string): Promise<string | null> => {
  const flag = await db.query.flags.findFirst({
    columns: {
      value: true,
    },
    where: eq(flags.key, key),
  });
  return flag?.value ?? null;
};

export const setFlag = async (key: string, value: string) =>
  db
    .insert(flags)
    .values({
      key,
      value,
    })
    .onConflictDoUpdate({
      target: [flags.key],
      set: {
        value,
      },
    });
