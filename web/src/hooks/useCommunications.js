import { useState, useEffect, useCallback, useRef } from 'react';
import client from '../api/client';

export function useCommunications(caseId) {
  const [communications, setComms]   = useState([]);
  const [loading,        setLoading] = useState(true);
  const [error,          setError]   = useState(null);
  const intervalRef = useRef(null);

  const refetch = useCallback(async () => {
    if (!caseId) return;
    try {
      const { data } = await client.get('/api/v1/communications', {
        params: { case_id: caseId },
      });
      setComms(Array.isArray(data) ? data : (data.communications ?? []));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    refetch();
    intervalRef.current = setInterval(refetch, 15_000);
    return () => clearInterval(intervalRef.current);
  }, [refetch]);

  return { communications, loading, error, refetch };
}
