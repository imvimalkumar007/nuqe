import { Router } from 'express';
import {
  getAiAccuracyMetrics,
  getModelComparisonMetrics,
} from '../engines/metricsEngine.js';

const router = Router();

// GET /api/v1/metrics/ai-accuracy?organisationId=&dateFrom=&dateTo=
router.get('/ai-accuracy', async (req, res) => {
  const { organisationId, dateFrom, dateTo } = req.query;
  try {
    const data = await getAiAccuracyMetrics(organisationId, dateFrom, dateTo);
    res.json(data);
  } catch (err) {
    console.error('[metrics/ai-accuracy]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/metrics/model-comparison?organisationId=&dateFrom=&dateTo=
router.get('/model-comparison', async (req, res) => {
  const { organisationId, dateFrom, dateTo } = req.query;
  try {
    const data = await getModelComparisonMetrics(organisationId, dateFrom, dateTo);
    res.json(data);
  } catch (err) {
    console.error('[metrics/model-comparison]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
