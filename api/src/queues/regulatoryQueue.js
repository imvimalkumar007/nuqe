import { Queue, Worker } from 'bullmq';
import { checkSources } from '../engines/regulatoryMonitor.js';

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

const QUEUE_NAME = 'regulatory-monitor';

export const regulatoryQueue = new Queue(QUEUE_NAME, { connection });

export const regulatoryWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { jurisdictions } = job.data ?? {};
    await checkSources(jurisdictions ?? null);
  },
  { connection }
);

regulatoryWorker.on('completed', (job) => {
  console.log(`[regulatoryQueue] ${job.name} completed`);
});

regulatoryWorker.on('failed', (job, err) => {
  console.error(`[regulatoryQueue] ${job?.name} failed:`, err.message);
});

// Safe to call on every startup — BullMQ deduplicates repeatable jobs by jobId.
export async function scheduleRegulatoryMonitor() {
  // UK + EU: every 12 hours
  await regulatoryQueue.add(
    'check-uk-eu',
    { jurisdictions: ['UK', 'EU'] },
    {
      repeat:  { every: 12 * 60 * 60 * 1000 },
      jobId:   'regulatory-monitor-uk-eu',
    }
  );

  // India: every 24 hours
  await regulatoryQueue.add(
    'check-in',
    { jurisdictions: ['IN'] },
    {
      repeat:  { every: 24 * 60 * 60 * 1000 },
      jobId:   'regulatory-monitor-in',
    }
  );

  console.log('[regulatoryQueue] scheduled: UK+EU every 12 h, IN every 24 h');
}
