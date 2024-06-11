import { sql } from 'drizzle-orm';

import { db } from 'database/client';
import { ammApyDays, NewAmmApyDay } from 'database/schema';

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
};
