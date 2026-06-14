import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Eye, EyeOff, LogIn, Loader } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
      toast.error('Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Quick login for demo accounts
  const demoLogin = async (email) => {
    setForm({ email, password: 'password123' });
    setError('');
    setLoading(true);
    try {
      await login(email, 'password123');
      navigate('/dashboard');
    } catch (err) {
      setError('Demo login failed — make sure the database is seeded.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">💸 SplitSmart</div>
        <p className="auth-tagline">Split & settle expenses with your group</p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                style={{ paddingRight: '2.75rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{
                  position: 'absolute', right: '0.75rem', top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', padding: 0,
                }}
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading}
            style={{ marginTop: '0.5rem' }}
          >
            {loading ? <Loader size={18} className="spinner" style={{ animation: 'spin 0.7s linear infinite' }} /> : <LogIn size={18} />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Demo accounts */}
        <div className="divider" />
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textAlign: 'center' }}>
          Demo accounts (password: <code style={{ color: 'var(--primary-light)' }}>password123</code>)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {[
            { name: 'Aisha', email: 'aisha@flat.com' },
            { name: 'Rohan', email: 'rohan@flat.com' },
            { name: 'Priya', email: 'priya@flat.com' },
            { name: 'Meera', email: 'meera@flat.com' },
            { name: 'Sam',   email: 'sam@flat.com'   },
            { name: 'Dev',   email: 'dev@guest.com'  },
          ].map((d) => (
            <button
              key={d.email}
              id={`demo-login-${d.name.toLowerCase()}`}
              className="btn btn-ghost btn-sm"
              onClick={() => demoLogin(d.email)}
              disabled={loading}
            >
              {d.name}
            </button>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          New user?{' '}
          <Link to="/register" style={{ color: 'var(--primary-light)', fontWeight: 500 }}>
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
