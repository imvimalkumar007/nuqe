import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db/pool.js';
import { scheduleDeadlineMonitor }    from './queues/deadlineQueue.js';
import { scheduleRegulatoryMonitor }  from './queues/regulatoryQueue.js';

import casesRouter        from './routes/cases.js';
import communicationsRouter from './routes/communications.js';
import deadlinesRouter    from './routes/deadlines.js';
import complianceRouter   from './routes/compliance.js';
import aiRouter           from './routes/ai.js';
import auditRouter        from './routes/audit.js';
import metricsRouter      from './routes/metrics.js';
import webhooksRouter     from './routes/webhooks.js';
import knowledgeRouter            from './routes/knowledge.js';
import knowledgeMonitoringRouter  from './routes/knowledgeMonitoring.js';
import regulatoryRouter           from './routes/regulatory.js';
import settingsRouter             from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method}  ${req.url}`);
  next();
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'unreachable', ts: new Date().toISOString() });
  }
});

app.use('/api/v1/cases',          casesRouter);
app.use('/api/v1/communications', communicationsRouter);
app.use('/api/v1/deadlines',      deadlinesRouter);
app.use('/api/v1/compliance',     complianceRouter);
app.use('/api/v1/ai-actions',     aiRouter);
app.use('/api/v1/audit',          auditRouter);
app.use('/api/v1/metrics',        metricsRouter);
app.use('/api/v1/webhooks',       webhooksRouter);
app.use('/api/v1/knowledge-chunks', knowledgeRouter);
app.use('/api/v1/knowledge',        knowledgeMonitoringRouter);
app.use('/api/v1/regulatory',       regulatoryRouter);
app.use('/api/v1/settings',         settingsRouter);

app.listen(PORT, async () => {
  console.log(`API listening on port ${PORT}`);
  await scheduleDeadlineMonitor();
  await scheduleRegulatoryMonitor();
});
