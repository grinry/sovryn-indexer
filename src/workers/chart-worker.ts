import { workerData, Worker, isMainThread, parentPort, threadId } from 'node:worker_threads';

import { Timeframe, TIMEFRAMES } from 'controllers/main-controller.constants';
import { constructCandlesticks, getPrices } from 'loader/chart/utils';
import { logger } from 'utils/logger';

export function buildCandlesticksOnWorker(
  chainId: number,
  baseTokenAddress: string,
  quoteTokenAddress: string,
  start: Date,
  end: Date,
  timeframe: Timeframe,
) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: [chainId, baseTokenAddress, quoteTokenAddress, start, end, timeframe],
    });
    worker.on('message', (e) => {
      resolve(e);
      worker.terminate();
    });
    worker.on('error', reject);
    worker.on('online', () => logger.info('worker online'));
    worker.on('exit', (code) => {
      logger.info('worker exited', code);
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

if (!isMainThread) {
  (async () => {
    logger.info({ threadId }, 'running worker process');
    const [chainId, baseTokenAddress, quoteTokenAddress, start, end, timeframe] = workerData;
    const intervals = await getPrices(chainId, baseTokenAddress, quoteTokenAddress, start, end, timeframe);
    const candlesticks = await constructCandlesticks(intervals, TIMEFRAMES[timeframe]);
    parentPort.postMessage(candlesticks);
  })();
}
