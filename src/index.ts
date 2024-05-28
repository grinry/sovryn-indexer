import 'config';
import 'utils/shutdown';
import { startApp } from 'app';
import { startCrontab } from 'crontab';

startApp();
startCrontab();
