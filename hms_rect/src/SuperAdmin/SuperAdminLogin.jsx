import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { login } from '../Redux/authSlice';
import api from '../api';
import './SuperAdminLogin.css';

const SuperAdminLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await api.post('super-admin/login', { username, password });
      if (response.data.token) {
        dispatch(login({
          token: response.data.token,
          role: 'super_admin',
          user: {
            username: response.data.username || username,
            name: 'Super Administrator',
            email: '',
          }
        }));
        navigate('/super-admin/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed. Verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sa-login-root">
      {/* Left Panel - Trust + Brand */}
      <div className="sa-login-left">
        <div className="sa-login-left-inner">
          {/* Trust badge */}
          <div className="sa-trust-badge">
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>ISO 27001 Certified · 256-bit TLS</span>
          </div>

          {/* Brand */}
          <div className="sa-login-brand">
            <div className="sa-login-logo">
              <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 22V12h6v10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h1 className="sa-login-brand-name">StaySync HMS</h1>
              <p className="sa-login-brand-tagline">Platform Control Centre</p>
            </div>
          </div>

          <div className="sa-login-headline">
            <h2>Manage every hotel.<br />From one command centre.</h2>
            <p>Real-time visibility across all registered properties, admins, subscriptions, and revenue - all in a single view.</p>
          </div>

          {/* Stats */}
          <div className="sa-login-stats">
            <div className="sa-login-stat">
              <strong>99.9%</strong>
              <span>Uptime SLA</span>
            </div>
            <div className="sa-login-stat-divider" />
            <div className="sa-login-stat">
              <strong>256-bit</strong>
              <span>Encryption</span>
            </div>
            <div className="sa-login-stat-divider" />
            <div className="sa-login-stat">
              <strong>Live</strong>
              <span>Monitoring</span>
            </div>
          </div>

          {/* Feature list */}
          <ul className="sa-login-features">
            {[
              'Centralized hotel owner management',
              'Real-time subscription and plan control',
              'Revenue and booking analytics',
              'Feature flag control per property',
              'Full audit trail and activity logs',
            ].map((f) => (
              <li key={f}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="sa-feature-check">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l3-3z" clipRule="evenodd" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="sa-login-right">
        <div className="sa-login-form-wrap">
          <div className="sa-login-form-head">
            <div className="sa-login-form-icon">
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h3>Super Admin Access</h3>
              <p>Restricted to authorised platform administrators only.</p>
            </div>
          </div>

          {error && (
            <div className="sa-login-error" role="alert">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} noValidate className="sa-login-form">
            <div className="sa-login-field">
              <label htmlFor="sa-username">Administrator Username</label>
              <div className="sa-login-input-wrap">
                <svg className="sa-field-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                <input
                  id="sa-username"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter admin username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(''); }}
                  required
                />
              </div>
            </div>

            <div className="sa-login-field">
              <label htmlFor="sa-password">Secure Password</label>
              <div className="sa-login-input-wrap">
                <svg className="sa-field-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <input
                  id="sa-password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  required
                />
                <button
                  type="button"
                  className="sa-pw-toggle"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPw ? (
                    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="sa-login-submit"
              disabled={loading || !username || !password}
            >
              {loading ? (
                <span className="sa-login-loading">
                  <svg className="sa-spin" viewBox="0 0 24 24" fill="none" width="18" height="18">
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                    <path d="M12 2a10 10 0 0110 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Authenticating…
                </span>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
                  </svg>
                  Access Control Panel
                </>
              )}
            </button>
          </form>

          <div className="sa-login-security">
            <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span>All sessions are logged, encrypted and audited</span>
          </div>

          <div className="sa-login-footer-note">
            This is a restricted access portal. Unauthorised access attempts are monitored and may result in legal action.
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminLogin;
