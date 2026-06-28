import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/authStore';

/** Email + password sign in / sign up. Redirects to Home once a session exists. */
export function LoginPage() {
  const loading = useAuth((s) => s.loading);
  const session = useAuth((s) => s.session);
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);
  const navigate = useNavigate();

  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!loading && session) navigate('/', { replace: true });
  }, [loading, session, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = mode === 'in' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (!res.ok) setMsg({ type: 'error', text: res.error });
    else if (res.needsConfirmation)
      setMsg({ type: 'info', text: 'Check your email to confirm your account, then sign in.' });
    else navigate('/', { replace: true });
  };

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <div className="auth__brand">
          <span className="auth__product">Meridian</span>
        </div>
        <h1 className="auth__title">{mode === 'in' ? 'Sign in' : 'Create your account'}</h1>
        <p className="auth__sub">Whiteboard Mode — map a business process, review it with AI, freeze a spec.</p>

        <label className="auth__field">
          <span>Email</span>
          <input
            className="control"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="auth__field">
          <span>Password</span>
          <input
            className="control"
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>

        {msg && <div className={`auth__msg auth__msg--${msg.type}`}>{msg.text}</div>}

        <button type="submit" className="btn btn--primary auth__submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Sign up'}
        </button>

        <button
          type="button"
          className="auth__switch"
          onClick={() => {
            setMode((m) => (m === 'in' ? 'up' : 'in'));
            setMsg(null);
          }}
        >
          {mode === 'in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
