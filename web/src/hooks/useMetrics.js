import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function useMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.get('/api/v1/metrics/ai-accuracy', {
        params: {
          dateFrom: daysAgo(30),
          dateTo:   new Date().toISOString().slice(0, 10),
        },
      });
      setMetrics({
        breach_risk:  data.breach_risk_count  ?? data.breach_risk  ?? 0,
        under_review: data.under_review_count ?? data.under_review ?? 0,
        open:         data.open_count         ?? data.open         ?? 0,
        fos_referred: data.fos_referred_count ?? data.fos_referred ?? 0,
      });
    } catch (err) {
      setError(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  return { metrics, loading, error, refetch: fetchMetrics };
}
