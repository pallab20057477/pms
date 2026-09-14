import { useFormik } from 'formik'
import * as Yup from 'yup'
import api from '../api'
import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { login } from '../Redux/authSlice'
import { Link, useNavigate } from 'react-router-dom'
import Cookies from 'js-cookie'
import Logo from '../assets/dist/img/logo.png'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [apiError, setApiError] = useState('')

  const formik = useFormik({
    initialValues: {
      email: Cookies.get('email') ?? '',
      password: '',
      remember_me: !!Cookies.get('email'),
    },
    validationSchema: Yup.object({
      email: Yup.string().required('Username or email is required'),
      password: Yup.string().required('Password is required'),
    }),
    onSubmit: async (vals) => {
      setLoading(true)
      setApiError('')
      try {
        const res = await api.post('login', {
          username: vals.email,
          email: vals.email,
          password: vals.password,
        })
        const data = res.data
        const token = data?.token || data?.access_token || null
        const role = data?.role || 'admin'
        const activeHotelId = data?.active_hotel_id || data?.ActiveHotelID || null
        const user = data?.user || {
          username: data?.username || vals.email,
          name: data?.name || data?.username || vals.email,
          email: data?.email || vals.email,
        }

        if (!token) {
          setApiError('Invalid credentials. Please verify your username and password.')
          return
        }

        dispatch(login({ token, role, activeHotelId, user }))
        localStorage.setItem('login_time', Date.now().toString())
        if (vals.remember_me) {
          Cookies.set('email', vals.email, { expires: 90 })
        } else {
          Cookies.remove('email')
        }
        navigate(role === 'super_admin' ? '/super-admin/dashboard' : '/dashboard')
      } catch (e) {
        const msg = e?.response?.data?.error || 'Sign in failed. Please check your credentials.'
        setApiError(msg)
      } finally {
        setLoading(false)
      }
    },
  })

  const { values, errors, touched, handleChange, handleBlur, handleSubmit } = formik

  return (
    <div className="extranet-login-wrapper">
      {/* Top Bar (Institutional OTA style like Agoda YCS / MakeMyTrip Extranet) */}
      <header className="extranet-top-bar">
        <div className="extranet-top-inner">
          <div className="extranet-brand">
            <img src={Logo} alt="HMS Extranet" className="extranet-logo-img" />
            <span className="extranet-portal-tag">Property Extranet</span>
          </div>
          <div className="extranet-top-support">
            <span className="extranet-support-label">Need help?</span>
            <span className="extranet-support-contact">support@staysync.com</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="extranet-main-content">
        <div className="extranet-login-card">
          <div className="extranet-card-header">
            <h1 className="extranet-card-title">Staff & Partner Sign In</h1>
            <p className="extranet-card-subtitle">
              Enter your authorized credentials to access the property management console.
            </p>
          </div>

          {/* API Error Alert */}
          {apiError && (
            <div className="extranet-alert-error" role="alert">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" className="extranet-alert-icon">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{apiError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="extranet-form">
            {/* Username / Email */}
            <div className="extranet-form-group">
              <label htmlFor="extranet-email" className="extranet-label">
                Username or Work Email
              </label>
              <div className="extranet-input-box">
                <input
                  id="extranet-email"
                  type="text"
                  name="email"
                  autoComplete="username"
                  placeholder="admin@property.com"
                  className={`extranet-input ${errors.email && touched.email ? 'is-invalid' : ''}`}
                  value={values.email}
                  onChange={e => { handleChange(e); setApiError('') }}
                  onBlur={handleBlur}
                />
              </div>
              {errors.email && touched.email && (
                <div className="extranet-field-error">{errors.email}</div>
              )}
            </div>

            {/* Password */}
            <div className="extranet-form-group">
              <div className="extranet-label-row">
                <label htmlFor="extranet-password" className="extranet-label">
                  Password
                </label>
                <Link to="/forgot_password" className="extranet-forgot-link">
                  Forgot password?
                </Link>
              </div>
              <div className="extranet-input-box password-box">
                <input
                  id="extranet-password"
                  type={showPw ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`extranet-input ${errors.password && touched.password ? 'is-invalid' : ''}`}
                  value={values.password}
                  onChange={e => { handleChange(e); setApiError('') }}
                  onBlur={handleBlur}
                />
                <button
                  type="button"
                  className="extranet-pw-toggle"
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
              {errors.password && touched.password && (
                <div className="extranet-field-error">{errors.password}</div>
              )}
            </div>

            {/* Remember Me */}
            <div className="extranet-options-row">
              <label className="extranet-checkbox-label">
                <input
                  type="checkbox"
                  name="remember_me"
                  className="extranet-checkbox"
                  checked={values.remember_me}
                  onChange={handleChange}
                />
                <span>Remember this device</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="extranet-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="extranet-btn-loading">
                  <span className="extranet-spinner" /> Authenticating…
                </span>
              ) : (
                'Sign In to Extranet'
              )}
            </button>
          </form>

          {/* Security Assurance */}
          <div className="extranet-card-footer">
            <div className="extranet-security-badge">
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>TLS 1.3 Encrypted &bull; ISO-Compliant Access</span>
            </div>
          </div>
        </div>
      </main>

      {/* Extranet Footer */}
      <footer className="extranet-page-footer">
        <div className="extranet-footer-inner">
          <p className="extranet-copyright">
            &copy; {new Date().getFullYear()} StaySync Hotel Management Systems. All rights reserved.
          </p>
          <div className="extranet-footer-links">
            <a href="#!">Privacy Policy</a>
            <span className="extranet-footer-sep">&bull;</span>
            <a href="#!">Terms of Service</a>
            <span className="extranet-footer-sep">&bull;</span>
            <a href="#!">Security Guidelines</a>
          </div>
        </div>
      </footer>
    </div>
  )
}