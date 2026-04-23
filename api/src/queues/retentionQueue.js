import { Queue, Worker } from 'bullmq';
import { runRetentionArchiver } from '../jobs/retentionArchiver.js';
import logger from '../logger.js';

function parseRedisUrl(url) {
  const { hostname, port, password } = new URL(url);
  return {
    host: hostname,
    port: Number(port) || 6379,
    ...(password ? { password: decodeURIComponent(password) } : {}),
  };
}

const connection = {
  ...parseRedisUrl(process.env.REDIS_URL || 'redis://localhost:6379'),
  maxRetriesPerRequest: null,
};

const QUEUE_NAME    = 'retention-archiver';
const REPEAT_WEEKLY = 7 * 24 * 60 * 60 * 1000;
const JOB_OPTS      = { attempts: 3, backoff: { type: 'exponential', delay: 5000 } };

export const retentionQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: JOB_OPTS,
});

export const retentionWorker = new Worker(
  QUEUE_NAME,
  async () => { await runRetentionArchiver(); },
  { connection }
);

retentionWorker.on('completed', () => {
  logger.info('retentionQueue archival run completed');
});

retentionWorker.on('failed', (_job, err) => {
  logger.error({ err }, 'retentionQueue archival run failed');
});

export async function scheduleRetentionArchiver() {
  await retentionQueue.add(
    'archive',
    {},
    {
      repeat:  { every: REPEAT_WEEKLY },
      jobId:   'retention-archiver-recurring',
    }
  );
  logger.info({ intervalDays: 7 }, 'retentionQueue scheduled');
}
