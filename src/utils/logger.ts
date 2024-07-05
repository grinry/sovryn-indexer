import pino from 'pino';

import config from 'config';

const transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty',
      level: config.logLevel,
      options: {
        colorize: true,
      },
    },
    {
      target: 'pino/file',
      level: config.logLevel,
      options: {
        destination: `${process.cwd()}/app.log`,
      },
    },
  ],
});

export const logger = pino({ level: config.logLevel, timestamp: pino.stdTimeFunctions.isoTime }, transport);
