import { Queue, Worker } from 'bullmq';
import { checkSources } from '../engines/regulatoryMonitor.js';
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

const JOB_OPTS = { attempts: 3, backoff: { type: 'exponential', delay: 1000 } };

function makeQueue(name) {
  return new Queue(name, { connection, defaultJobOptions: JOB_OPTS });
}

function makeWorker(name, jurisdictions) {
  const worker = new Worker(
    name,
    async () => { await checkSources(jurisdictions); },
    { connection }
  );
  worker.on('completed', (job) => logger.info({ queue: name, job: job.name }, 'regulatoryQueue job completed'));
  worker.on('failed', (job, err) => logger.error({ queue: name, job: job?.name, err }, 'regulatoryQueue job failed'));
  return worker;
}

export const ukQueue  = makeQueue('regulatory-monitor-uk');
export const euQueue  = makeQueue('regulatory-monitor-eu');
export const inQueue  = makeQueue('regulatory-monitor-in');

export const ukWorker = makeWorker('regulatory-monitor-uk',  ['UK']);
export const euWorker = makeWorker('regulatory-monitor-eu',  ['EU']);
export const inWorker = makeWorker('regulatory-monitor-in',  ['IN']);

// Safe to call on every startup — BullMQ deduplicates repeatable jobs by jobId.
export async function scheduleRegulatoryMonitor() {
  await ukQueue.add(
    'check-uk',
    {},
    { repeat: { every: 12 * 60 * 60 * 1000 }, jobId: 'regulatory-monitor-uk-repeat' }
  );
  await euQueue.add(
    'check-eu',
    {},
    { repeat: { every: 12 * 60 * 60 * 1000 }, jobId: 'regulatory-monitor-eu-repeat' }
  );
  await inQueue.add(
    'check-in',
    {},
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'regulatory-monitor-in-repeat' }
  );

  logger.info('regulatoryQueue scheduled: UK/EU every 12h, IN every 24h');
}
