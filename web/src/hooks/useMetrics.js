import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function useMetrics(dateFrom, dateTo) {
  const resolvedFrom = dateFrom ?? daysAgo(30);
  const resolvedTo   = dateTo   ?? new Date().toISOString().slice(0, 10);

  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.get('/api/v1/metrics/ai-accuracy', {
        params: { dateFrom: resolvedFrom, dateTo: resolvedTo },
      });
      setMetrics(data);
    } catch (err) {
      setError(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [resolvedFrom, resolvedTo]);

  useEffect(() => { refetch(); }, [refetch]);

  return { metrics, loading, error, refetch };
}
