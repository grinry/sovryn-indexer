import { HttpClient } from 'utils/http-client';
import { logger } from 'utils/logger';
import { sleep } from 'utils/sleep';

const SUBGRAPH_RETRY_MS = 5_000; // 5 seconds

const http = new HttpClient({}, 'subgraph-client');

type GraphRequest = {
  query: string;
  variables: Record<string, any>;
};

type GraphRequestVariables = {
  order: string;
  minTime: number;
  maxTime: number;
};

export type Subgraphquery = string;

type SubgraphResponse<T> =
  | {
      data: T;
      errors: undefined;
    }
  | {
      data: undefined;
      errors: [{ locations: [{ line: number; column: number }]; message: string }];
    };

export async function queryFromSubgraph<T = unknown>(
  subgraph: string,
  query: Subgraphquery,
  startTime: number,
  endTime: number,
  isAsc = true,
) {
  try {
    return await queryFromSubgraphTry<T>(subgraph, query, startTime, endTime, isAsc);
  } catch (error) {
    logger.error('Failed to query subgraph, retrying in ' + SUBGRAPH_RETRY_MS + 'ms', { error });
    await sleep(SUBGRAPH_RETRY_MS);
    return queryFromSubgraph<T>(subgraph, query, startTime, endTime, isAsc);
  }
}

async function queryFromSubgraphTry<T = unknown>(
  subgraph: string,
  query: Subgraphquery,
  startTime: number,
  endTime: number,
  isAsc = true,
) {
  const request: GraphRequest = {
    query,
    variables: makeSubgraphVariables(startTime, endTime, isAsc),
  };

  const response = await http.post<SubgraphResponse<T>>(subgraph, request);

  if (response.ok) {
    if (response.data.errors) {
      logger.fatal({ subgraph, request, errors: response.data.errors }, 'Subgraph query failed:');
      return undefined;
    }
    return response.data.data;
  }

  throw new Error('Subgraph query failed: ' + response.statusText);
}

function makeSubgraphVariables(startTime: number, endTime: number, isAsc: boolean): GraphRequestVariables {
  return {
    order: isAsc ? 'asc' : 'desc',
    minTime: startTime,
    maxTime: endTime,
  };
}
