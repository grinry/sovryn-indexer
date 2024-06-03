import { Logger } from 'pino';

import { logger } from './logger';

export type HttpClientConfig = {
  baseUrl: string;
  token: string;
};

export enum HttpClientProblem {
  none = 'NONE',
  clientError = 'CLIENT_ERROR',
  serverError = 'SERVER_ERROR',
  aborted = 'ABORTED',
  networkError = 'NETWORK_ERROR',
}

export type HttpClientResponse<T> = {
  ok: boolean;
  status: number;
  statusText: string;
  data: T;
  problem?: HttpClientProblem;
};

export type HttpClientQueryOptions = Record<string, any>;

export class HttpClient {
  readonly logger: Logger;
  constructor(private readonly config: Partial<HttpClientConfig> = {}, module = 'http-client') {
    this.logger = logger.child(
      { module, ...config },
      {
        redact: ['token'],
      },
    );
  }

  public async get<T>(
    url: string,
    params: HttpClientQueryOptions = {},
    options: RequestInit = {},
  ): Promise<HttpClientResponse<T>> {
    return this.fetch(this.searchify(url, params), options);
  }

  public async post<T, B = object>(
    url: string,
    body: B,
    params: HttpClientQueryOptions = {},
    options: RequestInit = {},
  ): Promise<HttpClientResponse<T>> {
    return this.fetch(
      this.searchify(url, params),
      this.mergeRequestInit(
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        options,
      ),
    );
  }

  public async put<T, B = object>(
    url: string,
    body: B,
    params: HttpClientQueryOptions = {},
    options: RequestInit = {},
  ): Promise<HttpClientResponse<T>> {
    return this.fetch(
      this.searchify(url, params),
      this.mergeRequestInit(
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
        options,
      ),
    );
  }

  public async patch<T, B = object>(
    url: string,
    body: B,
    params: HttpClientQueryOptions = {},
    options: RequestInit = {},
  ): Promise<HttpClientResponse<T>> {
    return this.fetch(
      this.searchify(url, params),
      this.mergeRequestInit(
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
        options,
      ),
    );
  }

  public async delete<T>(
    url: string,
    params: HttpClientQueryOptions = {},
    options: RequestInit = {},
  ): Promise<HttpClientResponse<T>> {
    return this.fetch(
      this.searchify(url, params),
      this.mergeRequestInit(
        {
          method: 'DELETE',
        },
        options,
      ),
    );
  }

  protected async fetch<T>(url: string, options: RequestInit = {}): Promise<HttpClientResponse<T>> {
    try {
      const isAbsoluteUrl = isValidAbsoluteUrl(url);
      const input = isAbsoluteUrl ? url : `${this.config.baseUrl}${url}`;

      this.logger.debug('Fetching', { url, options });

      const response = await fetch(input, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: this.config.token ? `Bearer ${this.config.token}` : undefined!,
          'Content-Type': 'application/json',
          'User-Agent': 'Sovryn-Indexer/0.1.0',
          Connection: 'close',
        },
      });

      let data = null as T;
      try {
        data = await response.json();
      } catch (error) {
        this.logger.error(error, 'Failed to parse response as JSON', { url, options, response });
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: data as T,
        problem: makeProblem(response.status),
      };
    } catch (error) {
      if (options.signal?.aborted) {
        return {
          ok: false,
          status: 0,
          statusText: 'Request aborted',
          data: {} as T,
          problem: HttpClientProblem.aborted,
        };
      }
      this.logger.error(error, 'Failed to fetch', { url, options });
      return {
        ok: false,
        status: 0,
        statusText: 'Network error',
        data: {} as T,
        problem: HttpClientProblem.networkError,
      };
    }
  }

  protected searchify(url: string, search: HttpClientQueryOptions = {}) {
    if (Object.keys(search).length === 0) {
      return url;
    }

    for (const key in search) {
      if (search[key] === undefined || search[key] === null) {
        delete search[key];
      }

      if (typeof search[key] === 'object') {
        search[key] = JSON.stringify(search[key]);
        if (search[key] === '{}') {
          delete search[key];
          continue;
        }
      }
    }

    const searchParams = new URLSearchParams(search);

    return `${url}?${searchParams.toString()}`;
  }

  protected mergeRequestInit(options: RequestInit = {}, overrides: RequestInit = {}): RequestInit {
    return {
      ...options,
      ...overrides,
    };
  }
}

const makeProblem = (status: number): HttpClientProblem => {
  if (status >= 200 && status < 400) {
    return HttpClientProblem.none;
  } else if (status >= 400 && status < 500) {
    return HttpClientProblem.clientError;
  } else if (status >= 500 && status < 600) {
    return HttpClientProblem.serverError;
  }

  return HttpClientProblem.none;
};

const isValidAbsoluteUrl = (url: string) => {
  try {
    const protocol = new URL(url).protocol;
    return !!protocol;
  } catch (error) {
    return false;
  }
};
