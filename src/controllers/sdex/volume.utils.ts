import { bignumber } from 'mathjs';

import { swapRepositoryV2 } from 'database/repository/swap-repository-v2';
import { areAddressesEqual } from 'utils/compare';

export async function prepareSdexVolume(chainId: number, days = 1) {
  const last24hSwaps = await swapRepositoryV2.loadSwaps(days, chainId);

  const result: {
    token: string;
    volume: string;
  }[] = [];

  last24hSwaps.map((swap) => {
    const baseIndex = result.findIndex((s) => areAddressesEqual(s.token, swap.base.address));
    if (baseIndex < 0) {
      result.push({
        token: swap.base.address,
        volume: swap.baseAmount,
      });
    } else {
      result[baseIndex] = {
        token: swap.base.address,
        volume: bignumber(swap.baseAmount).plus(result[baseIndex].volume).toString(),
      };
    }

    const quoteIndex = result.findIndex((s) => areAddressesEqual(s.token, swap.quote.address));
    if (quoteIndex < 0) {
      result.push({
        token: swap.quote.address,
        volume: bignumber(swap.quoteAmount).toString(),
      });
    } else {
      result[quoteIndex] = {
        token: swap.quote.address,
        volume: bignumber(swap.quoteAmount).plus(result[quoteIndex].volume).toString(),
      };
    }
  });

  return result;
}
