export type Pair<T> = [T, T];

type Graph<T> = Map<T, T[]>;

// Function to construct a graph from the token pools
export const constructGraph = <T>(pairs: Pair<T>[]): Graph<T> => {
  const graph: Graph<T> = new Map();

  pairs.forEach((pool) => {
    const [a, b] = pool;
    if (!graph.has(a)) graph.set(a, []);
    if (!graph.has(b)) graph.set(b, []);

    graph.get(a)?.push(b);
    graph.get(b)?.push(a); // Since the pools are bidirectional
  });

  return graph;
};

// BFS function to find the shortest path from start to goal in terms of pools
export const bfsShortestPath = <T>(graph: Graph<T>, start: T, goal: T): T[] | undefined => {
  const visited: Set<T> = new Set([start]);
  const queue: [T, T[]][] = [[start, [start]]]; // Queue of [vertex, path]

  while (queue.length > 0) {
    const [currentNode, path] = queue.shift()!;

    if (currentNode === goal) {
      return path; // Return the first path found to the goal
    }

    graph.get(currentNode)?.forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, [...path, neighbor]]);
      }
    });
  }

  return undefined;
};
