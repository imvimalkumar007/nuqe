import { Queue, Worker } from 'bullmq';
import { checkDeadlines } from '../engines/deadlineEngine.js';
import logger from '../logger.js';

const connection = {
  // BullMQ expects host/port options, not a connection string.
  // Parse REDIS_URL (redis://host:port) at startup.
  ...parseRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379'),
  maxRetriesPerRequest: null, // required by BullMQ
};

function parseRedisUrl(url) {
  const { hostname, port, password } = new URL(url);
  return {
    host: hostname,
    port: Number(port) || 6379,
    ...(password ? { password: decodeURIComponent(password) } : {}),
  };
}

const QUEUE_NAME = 'deadline-monitor';
const REPEAT_EVERY_MS = 15 * 60 * 1000; // 15 minutes

const JOB_OPTS = { attempts: 3, backoff: { type: 'exponential', delay: 1000 } };

export const deadlineQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: JOB_OPTS,
});

export const deadlineWorker = new Worker(
  QUEUE_NAME,
  async (_job) => { await checkDeadlines(); },
  { connection }
);

deadlineWorker.on('completed', () => {
  logger.info('deadlineQueue check completed');
});

deadlineWorker.on('failed', (_job, err) => {
  logger.error({ err }, 'deadlineQueue check failed');
});

// Registers the repeating job. BullMQ deduplicates by jobId so this
// is safe to call on every API startup — it will not stack duplicates.
export async function scheduleDeadlineMonitor() {
  await deadlineQueue.add(
    'check',
    {},
    {
      repeat: { every: REPEAT_EVERY_MS },
      jobId: 'deadline-monitor-recurring',
    }
  );
  logger.info({ intervalMin: REPEAT_EVERY_MS / 60000 }, 'deadlineQueue scheduled');
}
