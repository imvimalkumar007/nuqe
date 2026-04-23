import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message ?? 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-nuqe-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold tracking-tight text-nuqe-purple">nuqe</span>
          <p className="mt-1 text-sm text-nuqe-muted">Compliance-native case management</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-nuqe-surface rounded-xl p-8 shadow-lg space-y-5"
        >
          <div className="space-y-1">
            <label className="block text-xs font-medium text-nuqe-muted uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-nuqe-bg border border-white/10 rounded-lg px-3 py-2
                         text-nuqe-text placeholder-nuqe-muted text-sm
                         focus:outline-none focus:ring-2 focus:ring-nuqe-purple"
              placeholder="admin@nuqe.io"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-nuqe-muted uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-nuqe-bg border border-white/10 rounded-lg px-3 py-2
                         text-nuqe-text placeholder-nuqe-muted text-sm
                         focus:outline-none focus:ring-2 focus:ring-nuqe-purple"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-nuqe-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-nuqe-purple hover:bg-nuqe-purple-light disabled:opacity-50
                       text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
