import { bignumber } from 'mathjs';

import { swapRepository } from 'database/repository/swap-repository';

export async function prepareSdexVolume(chainId: number, days = 1) {
  const last24hSwaps = await swapRepository.loadSwaps(days, chainId);

  const result: {
    token: string;
    volume: string;
  }[] = [];

  last24hSwaps.map((swap) => {
    if (!result.find((s) => s.token.toLowerCase() === swap.baseId.toLowerCase())) {
      result.push({
        token: swap.baseId,
        volume: bignumber(swap.baseFlow).abs().toString(),
      });
    } else {
      const index = result.findIndex((s) => s.token.toLowerCase() === swap.baseId.toLowerCase());
      result[index] = {
        token: swap.baseId,
        volume: bignumber(swap.baseFlow).abs().plus(result[index].volume).toString(),
      };
    }

    if (!result.find((s) => s.token.toLowerCase() === swap.quoteId.toLowerCase())) {
      result.push({
        token: swap.quoteId,
        volume: bignumber(swap.quoteFlow).abs().toString(),
      });
    } else {
      const index = result.findIndex((s) => s.token.toLowerCase() === swap.quoteId.toLowerCase());
      result[index] = {
        token: swap.quoteId,
        volume: bignumber(swap.quoteFlow).abs().plus(result[index].volume).toString(),
      };
    }
  });

  return result;
}
