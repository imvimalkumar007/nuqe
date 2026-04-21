import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';

export function useAiActions(caseId) {
  const [aiActions, setAiActions] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const refetch = useCallback(async () => {
    if (!caseId) return;
    try {
      const { data } = await client.get('/api/v1/ai-actions', {
        params: { caseId },
      });
      setAiActions(Array.isArray(data) ? data : (data.actions ?? []));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { refetch(); }, [refetch]);

  const pendingCount = aiActions.filter((a) => a.status === 'pending').length;
  return { aiActions, pendingCount, loading, error, refetch };
}
