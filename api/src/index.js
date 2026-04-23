import app from './app.js';
import { scheduleDeadlineMonitor }   from './queues/deadlineQueue.js';
import { scheduleRegulatoryMonitor } from './queues/regulatoryQueue.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`API listening on port ${PORT}`);
  await scheduleDeadlineMonitor();
  await scheduleRegulatoryMonitor();
});
