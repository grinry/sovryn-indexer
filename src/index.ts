import 'dotenv/config';
import { startApp } from 'app';
import { logger } from 'utils/logger';
import { onShutdown } from 'utils/shutdown';

logger.info('Sovryn Indexer is starting...');

startApp();

onShutdown();
