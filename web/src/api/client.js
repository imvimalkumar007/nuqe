import axios from 'axios';

// In-memory auth state — set by AuthContext after login / refresh.
// Never stored in localStorage.
let _token = null;
let _refreshFn = null;

export function setAuthToken(token) { _token = token; }
export function clearAuthToken()    { _token = null; }
export function setRefreshHandler(fn) { _refreshFn = fn; }

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  timeout: 10_000,
  withCredentials: true, // send refresh_token cookie automatically
});

client.interceptors.request.use((config) => {
  if (_token) config.headers.Authorization = `Bearer ${_token}`;
  return config;
});

let _isRefreshing = false;
let _waitQueue = [];

function processQueue(err, token) {
  _waitQueue.forEach(({ resolve, reject }) => {
    if (err) reject(err);
    else resolve(token);
  });
  _waitQueue = [];
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const status   = err.response?.status;

    // Only attempt refresh on 401 from non-auth endpoints and not a retry
    if (status !== 401 || original._retry || original.url?.includes('/auth/')) {
      return Promise.reject(err);
    }

    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _waitQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return client(original);
      });
    }

    original._retry = true;
    _isRefreshing = true;

    try {
      const newToken = _refreshFn ? await _refreshFn() : null;
      if (!newToken) {
        processQueue(new Error('Session expired'), null);
        window.location.href = '/login';
        return Promise.reject(err);
      }
      processQueue(null, newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return client(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    } finally {
      _isRefreshing = false;
    }
  }
);

export default client;
