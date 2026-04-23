import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';

export function useCases(status) {
  const [cases,   setCases]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (status && status !== 'all' && status !== 'breach_risk') params.status = status;
      const { data } = await client.get('/api/v1/cases', { params });
      // API may return an array directly or { cases: [] }
      setCases(Array.isArray(data) ? data : (data.cases ?? []));
    } catch (err) {
      setError(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  return { cases, loading, error, refetch: fetchCases };
}
