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

  const [rememberMe, setRememberMe] = useState(false);

  return (
    <div className="auth-split-container">
      <div className="auth-split-card">
        {/* Left Visual Branding Panel */}
        <div className="auth-left-brand">
          <div className="auth-brand-top">
            <span className="auth-brand-logo">💸 SplitSmart</span>
            <Link to="/" className="auth-back-link">
              Back to website ➔
            </Link>
          </div>
          
          <div className="auth-brand-bottom">
            <h1 className="auth-brand-title">Simplify Group Expenses, Settle Debts</h1>
            <p className="auth-brand-desc">
              Track shared bills, calculate balances, and split group expenses effortlessly. Gain financial clarity and peace of mind with friends.
            </p>
            <div className="auth-carousel-dots">
              <span className="auth-dot active"></span>
              <span className="auth-dot"></span>
              <span className="auth-dot"></span>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="auth-right-form">
          <h2 className="auth-form-title">Welcome back</h2>
          <p className="auth-form-subtitle">
            Don't have an account yet? 
            <Link to="/register" className="auth-form-link">
              Register
            </Link>
          </p>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">Email</label>
              <div className="auth-input-wrapper">
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
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password">Password</label>
              <div className="auth-input-wrapper">
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <label className="auth-checkbox-label">
              <input
                type="checkbox"
                className="auth-checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember me for 30 days</span>
            </label>

            <button
              id="login-submit"
              type="submit"
              className="auth-btn-submit btn-full"
              disabled={loading}
            >
              {loading ? (
                <Loader size={18} className="spinner" style={{ animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <LogIn size={18} />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="auth-divider">Or sign in with</div>

          <div className="auth-social-row">
            <button type="button" className="auth-social-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            <button type="button" className="auth-social-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.21.67-2.93 1.49-.62.69-1.16 1.84-1.01 2.96 1.12.09 2.27-.57 2.95-1.39z"/>
              </svg>
              Apple
            </button>
          </div>

          {/* Demo accounts Section */}
          <div className="auth-demo-section">
            <p className="auth-demo-title">
              Or quick sign-in with a demo account:
            </p>
            <div className="auth-demo-grid">
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
                  type="button"
                  id={`demo-login-${d.name.toLowerCase()}`}
                  className="auth-demo-btn"
                  onClick={() => demoLogin(d.email)}
                  disabled={loading}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
