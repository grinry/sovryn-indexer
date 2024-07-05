import dayjs from 'dayjs';
import { eq, inArray, sql } from 'drizzle-orm';

import { db } from 'database/client';
import { NewTvlTableItem, tokens, tvlTable } from 'database/schema';

type NewTvlItem = Omit<NewTvlTableItem, 'date'>;

export const tvlRepository = {
  create: (data: NewTvlItem | NewTvlItem[]) =>
    db
      .insert(tvlTable)
      .values((data instanceof Array ? data : [data]).map((item) => ({ ...item, date: dayjs().endOf('day').toDate() })))
      .onConflictDoUpdate({
        target: [tvlTable.chainId, tvlTable.date, tvlTable.group, tvlTable.contract, tvlTable.tokenId],
        set: {
          name: sql`excluded.name`,
          balance: sql`excluded.balance`,
          group: sql`excluded.group`,
        },
      }),
  loadAll: () =>
    db
      .select({
        name: tvlTable.name,
        group: tvlTable.group,
        contract: tvlTable.contract,
        asset: tokens.address,
        symbol: tokens.symbol,
        balance: tvlTable.balance,
        tokenId: tvlTable.tokenId,
      })
      .from(tvlTable)
      .innerJoin(tokens, eq(tvlTable.tokenId, tokens.id))
      .where(inArray(tvlTable.date, sql`(select MAX(${tvlTable.date}) from ${tvlTable})`)),
};
