import { logger } from './logger';

const callbacks: Array<() => void | Promise<void>> = [];
let initialized = false;
let shuttingDown = false;

export function onShutdown(callback?: () => void) {
  if (callback && !shuttingDown) {
    callbacks.push(callback);
  }

  if (initialized) {
    return;
  }

  initialized = true;

  process.on('SIGINT', exitHandler);
  process.on('SIGTERM', exitHandler);

  process.on('uncaughtException', (err) => {
    logger.fatal(err, 'Uncaught exception detected');

    shuttingDown = true;
    Promise.allSettled(callbacks.map((cb) => cb())).finally(() => {
      process.exit(1);
    });

    // If a graceful shutdown is not achieved after 2 seconds,
    // shut down the process completely
    setTimeout(() => {
      process.abort();
    }, 2000).unref();
    process.exit(1);
  });
}

function exitHandler(code = 0) {
  if (shuttingDown) {
    return;
  }

  logger.info('Gracefull shutdown requested...');
  shuttingDown = true;
  Promise.allSettled(callbacks.map((cb) => cb())).finally(() => {
    process.exit(code);
  });
}
