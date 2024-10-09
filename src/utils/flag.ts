import { eq } from 'drizzle-orm';

import { db } from 'database/client';
import { flags } from 'database/schema/flags';

export const getFlag = async (key: string): Promise<string | null> => {
  const flag = await getFlagRow(key);
  return flag?.value ?? null;
};

export const getFlagRow = async (key: string) => db.query.flags.findFirst({ where: eq(flags.key, key) });

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
