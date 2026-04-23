import app from './app.js';
import logger from './logger.js';
import { pool } from './db/pool.js';
import { scheduleDeadlineMonitor }   from './queues/deadlineQueue.js';
import { scheduleRegulatoryMonitor } from './queues/regulatoryQueue.js';
import { scheduleRetentionArchiver } from './queues/retentionQueue.js';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, async () => {
  logger.info({ port: PORT }, 'API listening');
  await scheduleDeadlineMonitor();
  await scheduleRegulatoryMonitor();
  await scheduleRetentionArchiver();
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close(async () => {
    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database pool');
    }
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced exit after shutdown timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
