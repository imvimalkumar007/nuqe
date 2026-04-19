import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const PendingActionsContext = createContext({
  pendingCount:        0,   // total: AI actions + pending_review chunks
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
        fetch('/api/v1/ai-actions?status=pending&limit=200'),
        fetch('/api/v1/knowledge-chunks?status=pending_review&limit=200'),
      ]);

      if (aiRes.ok) {
        const data = await aiRes.json();
        setPendingActions(Array.isArray(data) ? data : []);
      }

      if (chunkRes.ok) {
        const data = await chunkRes.json();
        setPendingChunksCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {
      // silently fail — stale counts are better than a broken app
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const pendingCount = pendingActions.length + pendingChunksCount;

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
