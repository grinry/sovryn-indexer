export const TIMEFRAMES = {
  '1m': 1,
  '5m': 5,
  '10m': 10,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '4h': 240,
  '12h': 720,
  '1d': 1440,
  '3d': 4320,
  '1w': 10080,
  '30d': 43200, // 1 month
};

export type Timeframe = keyof typeof TIMEFRAMES;
