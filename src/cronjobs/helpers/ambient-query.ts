import { SdexChain } from 'loader/networks/sdex-chain';
import { bfsShortestPath, constructGraph } from 'utils/bfs';
import { decodeCrocPrice, toDisplayPrice } from 'utils/price';

export type PoolWithIndex = [string, string, number];
export type Pool = [string, string];

export function groupItemsInPairs<T>(items: T[]): T[][] {
  const groupedItems: T[][] = [];

  for (let i = 0; i < items.length - 1; i++) {
    groupedItems.push([items[i], items[i + 1]]);
  }

  return groupedItems;
}

export function loadPoolPrices(
  pools: PoolWithIndex[],
  chain: SdexChain,
  tokensToQuery: { id: number; address: string; decimals: number }[],
) {
  // todo: implement multicall
  return Promise.all(
    pools.map(async (path) => {
      const [base, quote] = path[0] < path[1] ? [path[0], path[1]] : [path[1], path[0]];
      const baseDecimals = tokensToQuery.find((item) => item.address === base)!.decimals;
      const quoteDecimals = tokensToQuery.find((item) => item.address === quote)!.decimals;
      const price = await chain.query.queryPrice(base, quote, path[2]);
      return {
        base,
        quote,
        index: path[2],
        spotPrice: price,
        displayPrice: toDisplayPrice(decodeCrocPrice(price), baseDecimals, quoteDecimals, true),
        displayPriceInBase: toDisplayPrice(decodeCrocPrice(price), baseDecimals, quoteDecimals, false),
      };
    }),
  );
}

export function findPrice(
  base: string,
  quote: string,
  index: number,
  prices: { base: string; quote: string; index: number; displayPrice: number; displayPriceInBase: number }[],
) {
  const item = prices.find(
    (item) =>
      ((item.base.toLowerCase() === base.toLowerCase() && item.quote.toLowerCase() === quote.toLowerCase()) ||
        (item.base.toLowerCase() === quote.toLowerCase() && item.quote) === base) &&
      Number(item.index) === Number(index),
  );

  return item.base.toLowerCase() === base.toLowerCase() ? item.displayPrice : item.displayPriceInBase;
}

export function findEndPrice(
  entry: string,
  destination: string,
  pools: { base: string; quote: string; poolIdx: number }[],
  poolsWithIndexes: PoolWithIndex[],
  prices: { base: string; quote: string; index: number; displayPrice: number; displayPriceInBase: number }[],
) {
  const graph = constructGraph(pools.map((item) => [item.base, item.quote]));
  const path = bfsShortestPath(graph, entry, destination);
  const groupedPath = groupItemsInPairs(path ?? []);
  const pathsToPoolsWithIndexes = groupedPath.map((item) => {
    const index = findPair(poolsWithIndexes, item[0], item[1])?.[2];
    return [item[0], item[1], index] as PoolWithIndex;
  });

  let price = 1;
  for (const [base, quote, index] of pathsToPoolsWithIndexes) {
    price = price * findPrice(base, quote, index, prices);
  }

  return Number(price).toLocaleString('fullwide', { useGrouping: false, minimumFractionDigits: 18 });
}

const findPair = (pools: PoolWithIndex[], base: string, quote: string) => {
  return pools.find(
    (pool) =>
      (pool[0].toLowerCase() === base.toLowerCase() && pool[1].toLowerCase() === quote.toLowerCase()) ||
      (pool[0].toLowerCase() === quote.toLowerCase() && pool[1].toLowerCase() === base.toLowerCase()),
  );
};
