import { useState, useEffect, useCallback } from 'react';
import client from '../api/client';

export function useCase(caseId) {
  const [caseData, setCaseData] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const refetch = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.get(`/api/v1/cases/${caseId}`);
      setCaseData(data);
    } catch (err) {
      setError(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { refetch(); }, [refetch]);

  return { caseData, loading, error, refetch };
}
