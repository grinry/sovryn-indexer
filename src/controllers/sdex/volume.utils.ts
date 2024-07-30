import { bignumber } from 'mathjs';

import { swapRepository } from 'database/repository/swap-repository';
import { areAddressesEqual } from 'utils/compare';

export async function prepareSdexVolume(chainId: number, days = 1) {
  const last24hSwaps = await swapRepository.loadSwaps(days, chainId);

  const result: {
    token: string;
    volume: string;
  }[] = [];

  last24hSwaps.map((swap) => {
    const baseIndex = result.findIndex((s) => areAddressesEqual(s.token, swap.baseId));
    if (baseIndex < 0) {
      result.push({
        token: swap.baseId,
        volume: bignumber(swap.baseFlow).abs().toString(),
      });
    } else {
      result[baseIndex] = {
        token: swap.baseId,
        volume: bignumber(swap.baseFlow).abs().plus(result[baseIndex].volume).toString(),
      };
    }

    const quoteIndex = result.findIndex((s) => areAddressesEqual(s.token, swap.quoteId));
    if (quoteIndex < 0) {
      result.push({
        token: swap.quoteId,
        volume: bignumber(swap.quoteFlow).abs().toString(),
      });
    } else {
      result[quoteIndex] = {
        token: swap.quoteId,
        volume: bignumber(swap.quoteFlow).abs().plus(result[quoteIndex].volume).toString(),
      };
    }
  });

  return result;
}
