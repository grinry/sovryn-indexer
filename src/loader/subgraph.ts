import { DocumentNode, print } from 'graphql';

import { HttpClient } from 'utils/http-client';
import { logger } from 'utils/logger';
import { sleep } from 'utils/sleep';

const SUBGRAPH_RETRY_MS = 5_000; // 5 seconds

const http = new HttpClient({}, 'subgraph-client');

type GraphRequest = {
  query: string;
  variables: Record<string, any>;
};

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
  query: DocumentNode,
  variables: Record<string, any> = {},
) {
  try {
    return await queryFromSubgraphTry<T>(subgraph, query, variables);
  } catch (error) {
    logger.error('Failed to query subgraph, retrying in ' + SUBGRAPH_RETRY_MS + 'ms', {
      error,
      subgraph,
      query,
      variables,
    });
    await sleep(SUBGRAPH_RETRY_MS);
    // todo: add retry limit, exponential backoff and use `queryFromSubgraph` here...
    return queryFromSubgraphTry<T>(subgraph, query, variables);
  }
}

async function queryFromSubgraphTry<T = unknown>(
  subgraph: string,
  query: DocumentNode,
  variables: Record<string, any> = {},
) {
  const request: GraphRequest = {
    query: print(query),
    variables,
  };

  logger.debug({ subgraph, request }, 'Querying subgraph');

  const response = await http.post<SubgraphResponse<T>>(subgraph, request);

  if (response.ok) {
    if (response.data.errors) {
      // logger.fatal({ subgraph, request, errors: response.data.errors }, 'Subgraph query failed:');
      // return undefined;
      throw new Error('Subgraph returned with errors: ' + JSON.stringify(response.data.errors));
    }
    return response.data.data;
  }

  throw new Error('Subgraph query failed: ' + response.statusText);
}
