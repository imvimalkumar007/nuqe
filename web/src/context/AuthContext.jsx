import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { setAuthToken, clearAuthToken, setRefreshHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [initialising, setInitialising] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setUser(null);
        setAccessToken(null);
        clearAuthToken();
        return null;
      }
      const data = await res.json();
      setAccessToken(data.accessToken);
      setAuthToken(data.accessToken);
      return data.accessToken;
    } catch {
      setUser(null);
      setAccessToken(null);
      clearAuthToken();
      return null;
    }
  }, []);

  // On mount: try silent refresh to restore session
  useEffect(() => {
    setRefreshHandler(refresh);
    refresh().finally(() => setInitialising(false));
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Invalid credentials');
    }
    const data = await res.json();
    setUser(data.user);
    setAccessToken(data.accessToken);
    setAuthToken(data.accessToken);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch { /* ignore network errors on logout */ }
    setUser(null);
    setAccessToken(null);
    clearAuthToken();
  }, []);

  if (initialising) return null;

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
