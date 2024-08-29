// @ts-ignore
import { postMessageToThread, threadId, workerData, Worker, isMainThread, parentPort } from 'node:worker_threads';

import { db } from 'database/client';

// const channel = new BroadcastChannel('sync');
// const level = workerData?.level ?? 0;

// if (level < 10) {
//   const worker = new Worker(__filename, {
//     workerData: { level: level + 1 },
//   });
// }

// if (level === 0) {
//   process.on('workerMessage', (value, source) => {
//     console.log(`${source} -> ${threadId}:`, value);
//     postMessageToThread(source, { message: 'pong' });
//   });
// } else if (level === 10) {
//   process.on('workerMessage', (value, source) => {
//     console.log(`${source} -> ${threadId}:`, value);
//     channel.postMessage('done');
//     channel.close();
//   });

//   postMessageToThread(0, { message: 'ping' });
// }

// channel.onmessage = channel.close;

export function testAsyncWorker(input) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: input,
    });
    worker.on('message', (e) => {
      console.log('message from worker', e);
      resolve(e);
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      console.log('worker exited', code);
      if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

if (!isMainThread) {
  (async () => {
    const input = workerData;
    const start = Date.now();
    while (Date.now() - start < 3_000) {
      // blocking everything for 3 seconds
    }

    // has access to db
    const token = await db.query.tokens.findFirst();

    parentPort.postMessage([input, token.symbol]);
  })();
}
