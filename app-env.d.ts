declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT: string;
    DATABASE_URL: string;
    REDIS_CACHE_URL: string;
    LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
    NETWORKS: string;
    BYPASS_RATE_LIMIT: string;
  }
}
