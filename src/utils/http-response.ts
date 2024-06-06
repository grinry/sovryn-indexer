export const toResponse = <T>(data: T, cursor?: string) => ({
  data,
  next: cursor ? btoa(cursor) : undefined,
  timestamp: Date.now(),
});

type PaginatedResponse<T> = {
  data: T;
  next?: string;
};

export const toPaginatedResponse = <T>(data: PaginatedResponse<T>) => ({
  ...data,
  timestamp: Date.now(),
});
