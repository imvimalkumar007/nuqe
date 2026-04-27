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
    <div className="min-h-screen bg-nuqe-bg flex items-center justify-center px-4"
         style={{ backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,58,237,0.12) 0%, transparent 70%)' }}>

      <div className="w-full max-w-[360px]">

        {/* Wordmark */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-base"
                 style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)' }}>
              N
            </div>
            <span className="text-xl font-semibold tracking-tight text-nuqe-text">Nuqe</span>
          </div>
          <p className="text-[13.5px] text-nuqe-muted leading-relaxed">
            Compliance-native case management<br />
            for regulated financial services
          </p>
        </div>

        {/* Form card */}
        <div className="bg-nuqe-surface rounded-xl p-7 shadow-2xl"
             style={{ border: '1px solid var(--nuqe-border-hi)', boxShadow: '0 24px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)' }}>

          <h1 className="text-[15px] font-semibold text-nuqe-text mb-5">Sign in to your workspace</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-nuqe-muted" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="you@yourcompany.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-nuqe-muted" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••••"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-md text-[12.5px] text-nuqe-danger"
                   style={{ background: 'var(--nuqe-danger-dim)', border: '1px solid var(--nuqe-danger-ring)' }}>
                <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 5v3.5M8 10.5v.5" strokeLinecap="round" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full mt-1"
              style={{ height: '38px', fontSize: '14px' }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in
                </span>
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11.5px] text-nuqe-subtle">
          FCA-compliant · GDPR-ready · ISO 27001 aligned
        </p>
      </div>
    </div>
  );
}
