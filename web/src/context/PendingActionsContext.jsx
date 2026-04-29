import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import client from '../api/client';

const PendingActionsContext = createContext({
  pendingCount:        0,   // ai_actions with status=pending only
  pendingActions:      [],  // ai_actions with status=pending
  pendingChunksCount:  0,   // knowledge_chunks with status=pending_review
  refresh:             () => {},
});

export function PendingActionsProvider({ children }) {
  const [pendingActions,     setPendingActions]     = useState([]);
  const [pendingChunksCount, setPendingChunksCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [aiRes, chunkRes] = await Promise.all([
        client.get('/api/v1/ai-actions', { params: { status: 'pending', limit: 200 } }),
        client.get('/api/v1/knowledge-chunks', { params: { status: 'pending_review', limit: 200 } }),
      ]);

      const aiData = aiRes.data;
      setPendingActions(Array.isArray(aiData) ? aiData : []);

      const chunkData = chunkRes.data;
      setPendingChunksCount(Array.isArray(chunkData) ? chunkData.length : 0);
    } catch {
      // silently fail — stale counts are better than a broken app
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const pendingCount = pendingActions.length;

  return (
    <PendingActionsContext.Provider
      value={{ pendingCount, pendingActions, pendingChunksCount, refresh }}
    >
      {children}
    </PendingActionsContext.Provider>
  );
}

export function usePendingActions() {
  return useContext(PendingActionsContext);
}
