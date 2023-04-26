import 'dotenv/config';
import { start as startQueue } from './queues';
import { start as startDiscord } from './discord';

startQueue();
startDiscord();
