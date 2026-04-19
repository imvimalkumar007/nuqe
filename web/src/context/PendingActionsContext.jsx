import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const PendingActionsContext = createContext({
  pendingCount:   0,
  pendingActions: [],
  refresh:        () => {},
});

export function PendingActionsProvider({ children }) {
  const [pendingActions, setPendingActions] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ai-actions?status=pending&limit=200');
      if (!res.ok) return;
      const data = await res.json();
      setPendingActions(Array.isArray(data) ? data : []);
    } catch {
      // silently fail — stale count is better than a broken app
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <PendingActionsContext.Provider
      value={{ pendingCount: pendingActions.length, pendingActions, refresh }}
    >
      {children}
    </PendingActionsContext.Provider>
  );
}

export function usePendingActions() {
  return useContext(PendingActionsContext);
}
