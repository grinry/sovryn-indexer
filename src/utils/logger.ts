import pino from 'pino';

const transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
    {
      target: 'pino/file',
      options: {
        destination: `${process.cwd()}/app.log`,
      },
    },
  ],
});

export const logger = pino({ level: 'info', timestamp: pino.stdTimeFunctions.isoTime }, transport);
