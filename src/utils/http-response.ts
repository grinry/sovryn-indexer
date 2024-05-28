export const toResponse = <T>(data: T) => ({ data, timestamp: Date.now() });

export const toPaginatedResponse = <T>(data: T, cursor: string) => ({
  data,
  next: cursor ? cursor : undefined,
  timestamp: Date.now(),
});
