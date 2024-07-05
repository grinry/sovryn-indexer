import { bignumber } from 'mathjs';

import { NewPrice } from 'database/schema';
import { bfsShortestPath, constructGraph } from 'utils/bfs';

export function groupItemsInPairs<T>(items: T[]): T[][] {
  const groupedItems: T[][] = [];

  for (let i = 0; i < items.length - 1; i++) {
    groupedItems.push([items[i], items[i + 1]]);
  }

  return groupedItems;
}

export function findPrice(base: number, quote: number, prices: NewPrice[] = []) {
  const item = prices.find(
    (item) => (item.baseId === base && item.quoteId === quote) || (item.baseId === quote && item.quoteId === base),
  );

  return item.baseId === base ? bignumber(item.value) : bignumber(1).div(item.value ?? 0);
}

export function findEndPrice(entry: number, destination: number, prices: NewPrice[]) {
  const graph = constructGraph(prices.map((item) => [item.baseId, item.quoteId]));
  const path = bfsShortestPath(graph, entry, destination);
  const groupedPath = groupItemsInPairs(path ?? []);

  if (entry === destination) {
    return bignumber(1);
  }

  if (groupedPath.length === 0) {
    return bignumber(0);
  }

  let price = bignumber(1);
  for (const [base, quote] of groupedPath) {
    price = bignumber(price).mul(findPrice(base, quote, prices));
  }

  return price;
}
