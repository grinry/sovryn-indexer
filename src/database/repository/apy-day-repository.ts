import dayjs from 'dayjs';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from 'database/client';
import { ammApyDays, NewAmmApyDay } from 'database/schema';

const DEFAULT_DATA_RANGE = 7; // 7 days

export const apyDayRepository = {
  storeItems: (data: NewAmmApyDay[]) =>
    db
      .insert(ammApyDays)
      .values(data)
      .onConflictDoUpdate({
        target: [ammApyDays.chainId, ammApyDays.date, ammApyDays.poolToken],
        set: {
          balanceBtc: sql`excluded.balance_btc`,
          feeApy: sql`excluded.fee_apy`,
          rewardsApy: sql`excluded.rewards_apy`,
          totalApy: sql`excluded.total_apy`,
          btcVolume: sql`excluded.btc_volume`,
        },
      }),
  getAllPoolData: (chainId: number, days = DEFAULT_DATA_RANGE) =>
    db
      .select({
        pool: ammApyDays.pool,
        poolToken: ammApyDays.poolToken,
        date: ammApyDays.date,
        balanceBtc: ammApyDays.balanceBtc,
        rewardsApy: ammApyDays.rewardsApy,
        feeApy: ammApyDays.feeApy,
        totalApy: ammApyDays.totalApy,
        btcVolume: ammApyDays.btcVolume,
      })
      .from(ammApyDays)
      .where(and(eq(ammApyDays.chainId, chainId), gte(ammApyDays.date, dayjs().subtract(days, 'days').toDate())))
      .orderBy(asc(ammApyDays.date)),
  getOnePoolData: (chainId: number, pool: string, days = DEFAULT_DATA_RANGE) =>
    db
      .select({
        pool: ammApyDays.pool,
        poolToken: ammApyDays.poolToken,
        date: ammApyDays.date,
        balanceBtc: ammApyDays.balanceBtc,
        rewardsApy: ammApyDays.rewardsApy,
        feeApy: ammApyDays.feeApy,
        totalApy: ammApyDays.totalApy,
        btcVolume: ammApyDays.btcVolume,
      })
      .from(ammApyDays)
      .limit(2)
      .where(
        and(
          eq(ammApyDays.chainId, chainId),
          eq(ammApyDays.pool, pool),
          gte(ammApyDays.date, dayjs().subtract(days, 'days').toDate()),
        ),
      )
      .orderBy(desc(ammApyDays.date)),
  getLastPoolApy: (chainId: number, pool: string) =>
    db
      .select({
        pool: ammApyDays.pool,
        poolToken: ammApyDays.poolToken,
        date: ammApyDays.date,
        balanceBtc: ammApyDays.balanceBtc,
        rewardsApy: ammApyDays.rewardsApy,
        feeApy: ammApyDays.feeApy,
        totalApy: ammApyDays.totalApy,
        btcVolume: ammApyDays.btcVolume,
      })
      .from(ammApyDays)
      .where(and(eq(ammApyDays.chainId, chainId), eq(ammApyDays.pool, pool)))
      .orderBy(asc(ammApyDays.date))
      .execute()
      .then((items) =>
        items.length ? items.filter((item) => item.date.getUTCDay() === items[0].date.getUTCDay()) : [],
      ),
};
