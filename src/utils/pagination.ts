import { asc, desc, gte, lte, SQL } from 'drizzle-orm';
import { PgColumn, PgSelect } from 'drizzle-orm/pg-core';
import { Request } from 'express';
import Joi from 'joi';

import { db } from 'database/client';

import { validate } from './validation';

const MAX_PAGINATION_LIMIT = 1000;
const DEFAULT_PAGINATION_LIMIT = 500;

export type PaginationOptions = {
  cursor: string | null;
  limit: number;
};

export enum OrderBy {
  asc = 'asc',
  desc = 'desc',
}

export const validatePaginatedRequest = (req: Request, opts: Partial<{ limit: number }> = {}) => {
  const schema = Joi.object({
    cursor: Joi.string().optional().default(null),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(MAX_PAGINATION_LIMIT)
      .default(opts.limit || DEFAULT_PAGINATION_LIMIT)
      .empty(),
  });

  return validate<PaginationOptions>(schema, req.query, { allowUnknown: true, abortEarly: true });
};

export const queryWithPagination = <T extends PgSelect>(query: T, options: PaginationOptions) => {
  const { cursor, limit } = options;
  const sq = query.as('pg_subquery');

  let q = db.select().from(sq).$dynamic();

  if (cursor) {
    q = q.where(gte(sq['id'] as PgColumn, atob(cursor)));
  }

  return q.limit(limit + 1);
};

class ApiQuery {
  constructor(
    protected readonly column: string,
    protected readonly sortBy: OrderBy,
    protected readonly keyFn: (key: string) => PgColumn,
    protected readonly options: Partial<PaginationOptions> = {},
  ) {
    this.column = column || 'id';
    this.sortBy = sortBy || OrderBy.desc;
  }

  // todo: replace with subquery: https://github.com/drizzle-team/drizzle-orm/issues/1644#issuecomment-1877442097
  public applyPagination<T extends PgSelect>(query: T) {
    const { cursor, limit } = this.options;

    const isDesc = this.sortBy === OrderBy.desc;

    const sq = query.as('paginate_sq');

    // const column = this.keyFn(this.column);
    const column = sq[this.column] as PgColumn;

    let _query = db.select().from(sq).$dynamic();
    let order: SQL;

    if (cursor) {
      const [value, direction] = atob(cursor).split('|');
      // todo: add pagination for going back...
      const isDesc = direction === OrderBy.desc;
      _query = _query.where(isDesc ? lte(column, value) : gte(column, value));
      order = isDesc ? desc(column) : asc(column);
    } else {
      order = isDesc ? desc(column) : asc(column);
    }

    return _query.orderBy(order).limit(limit + 1);
  }

  public getMetadata<T>(data: T[]) {
    const column = this.column || 'id';
    const direction = this.sortBy || OrderBy.asc;

    const items = this.shouldReverse() ? [...data.reverse()] : data;

    let next: string;
    // let previous: string;
    if (items.length > this.options.limit) {
      next = items.pop()[column] + '|' + direction + '|' + column;
    }

    // const inverted = direction === OrderBy.asc ? OrderBy.desc : OrderBy.asc;
    // if (
    //   this.options.cursor &&
    //   items.length &&
    //   this.options.cursor !== btoa(items?.[0]?.[column] + '|' + inverted + '|' + column)
    // ) {
    //   previous = items?.[0]?.[column] + '|' + inverted + '|' + column;
    // }

    return {
      data: items,
      // previous: previous ? btoa(previous) : undefined,
      next: next ? btoa(next) : undefined,
    };
  }

  private shouldReverse() {
    if (this.options.cursor) {
      const [, direction] = atob(this.options.cursor).split('|');
      return direction !== this.sortBy;
    }
    return false;
  }
}

export const createApiQuery = (
  column: string,
  sortBy: OrderBy,
  keyFn: (key: string) => PgColumn,
  options: Partial<PaginationOptions> = {},
) => new ApiQuery(column, sortBy, keyFn, options);

export const subgraphPaginationOptions = (opts: PaginationOptions) => ({
  first: opts.limit,
  skip: opts.cursor ? Number(opts.cursor) : 0,
});
