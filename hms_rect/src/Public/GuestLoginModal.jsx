import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { getGoogleClientId, setGuestSession } from './guestSession'
import './GuestPortal.css'

export default function GuestLoginModal({ onClose, onSuccess }) {
  const googleBtn = useRef(null)
  const [mode, setMode] = useState('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
  })

  const [googleClientId, setGoogleClientId] = useState('')

  useEffect(() => {
    getGoogleClientId().then(id => setGoogleClientId(id))
  }, [])

  const completeLogin = (payload) => {
    if (setGuestSession(payload)) {
      if (onSuccess) onSuccess(payload)
    } else {
      setError('Unable to start your secure guest session. Please try again.')
    }
  }

  useEffect(() => {
    if (!googleClientId || !googleBtn.current) return

    const initialize = () => {
      if (!window.google?.accounts?.id || !googleBtn.current) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          if (!credential) return
          setLoading(true)
          setError('')
          try {
            const res = await api.post('/api/public/auth/google', { token: credential })
            completeLogin(res.data)
          } catch (err) {
            setError(err?.response?.data?.error || 'Google sign in failed. Please try again.')
          } finally {
            setLoading(false)
          }
        },
      })
      window.google.accounts.id.renderButton(googleBtn.current, {
        theme: 'outline',
        size: 'large',
        shape: 'circle',
        type: 'icon',
        width: 40,
      })
    }

    if (window.google?.accounts?.id) {
      initialize()
      return
    }

    const existing = document.querySelector('script[data-google-identity]')
    if (existing) {
      existing.addEventListener('load', initialize, { once: true })
      return () => existing.removeEventListener('load', initialize)
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleIdentity = 'true'
    script.onload = initialize
    document.body.appendChild(script)
  }, [googleClientId, mode])

  const [showPassword, setShowPassword] = useState(false)

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'create') {
        const res = await api.post('/api/public/auth/register', form)
        completeLogin(res.data)
      } else {
        const res = await api.post('/api/public/auth/login', {
          email: form.email,
          password: form.password,
        })
        completeLogin(res.data)
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Sign in failed. Please check your details.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mmt-modal-overlay" onClick={onClose}>
      <div className="mmt-login-modal" onClick={(e) => e.stopPropagation()}>

        {/* LEFT PANE (PREMIUM) */}
        <div className="mmt-login-left">
          <div className="mmt-left-content">
            <h2>Unlock<br/>Exclusive Deals</h2>
            <p>Join millions of travelers who trust StaySync for their bookings.</p>
            
            <div className="mmt-benefit-list">
              <div className="mmt-benefit-item">
                <div className="mmt-benefit-icon"><i className="fa-solid fa-tags" /></div>
                <div className="mmt-benefit-text">
                  <h4>Member Only Prices</h4>
                  <p>Get up to 20% off on premium hotels</p>
                </div>
              </div>
              
              <div className="mmt-benefit-item">
                <div className="mmt-benefit-icon"><i className="fa-solid fa-shield-halved" /></div>
                <div className="mmt-benefit-text">
                  <h4>Secure Booking</h4>
                  <p>Zero convenience fee & guaranteed stays</p>
                </div>
              </div>
              
              <div className="mmt-benefit-item">
                <div className="mmt-benefit-icon"><i className="fa-solid fa-suitcase-rolling" /></div>
                <div className="mmt-benefit-text">
                  <h4>Manage Trips</h4>
                  <p>Modify or cancel your bookings anytime</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANE (FORM) */}
        <div className="mmt-login-right">
          <div className="mmt-login-topbar">
            <div className="mmt-login-tabs">
              <button
                type="button"
                className={mode === 'signin' ? 'active' : ''}
                onClick={() => setMode('signin')}
              >
                Log In
              </button>
              <button
                type="button"
                className={mode === 'create' ? 'active' : ''}
                onClick={() => setMode('create')}
              >
                Create Account
              </button>
            </div>
            <button className="mmt-modal-close" type="button" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          <div className="mmt-form-container">
            <h3 className="mmt-form-title">{mode === 'create' ? 'Create a new account' : 'Welcome back to StaySync'}</h3>
            
            {error && <div className="mmt-alert-error"><i className="fa-solid fa-circle-exclamation" /> {error}</div>}

            <form onSubmit={submit}>
              {mode === 'create' && (
                <div className="mmt-input-group">
                  <label>Full Name</label>
                  <input value={form.name} onChange={(e) => update('name', e.target.value)} required placeholder="e.g. John Doe" />
                </div>
              )}
              
              <div className="mmt-input-group">
                <label>Email Address</label>
                <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required placeholder="e.g. name@example.com" />
              </div>
              
              {mode === 'create' && (
                <div className="mmt-input-group">
                  <label>Mobile Number (Optional)</label>
                  <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="e.g. +91 98765 43210" />
                </div>
              )}
              
              <div className="mmt-input-group">
                <label className="mmt-label-split">
                  <span>Password</span>
                  {mode === 'signin' && <Link to="/book" className="mmt-forgot-link">Forgot?</Link>}
                </label>
                <div className="mmt-password-wrapper">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={form.password} 
                    onChange={(e) => update('password', e.target.value)} 
                    required 
                    placeholder="Enter your password" 
                  />
                  <button type="button" className="mmt-pwd-toggle" onClick={() => setShowPassword(!showPassword)}>
                    <i className={showPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye"} />
                  </button>
                </div>
              </div>
              
              {mode === 'create' && (
                <div className="mmt-input-group">
                  <label>Confirm Password</label>
                  <div className="mmt-password-wrapper">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={form.confirm_password} 
                      onChange={(e) => update('confirm_password', e.target.value)} 
                      required 
                      placeholder="Confirm your password" 
                    />
                  </div>
                </div>
              )}
              
              <button className="mmt-submit-btn" type="submit" disabled={loading}>
                {loading ? <div className="mmt-btn-spinner" /> : (mode === 'create' ? 'Create Account' : 'Log In')}
              </button>
            </form>

            <div className="mmt-divider"><span>Or continue with</span></div>

            <div className="mmt-google-btn-wrapper">
              {googleClientId ? (
                <div ref={googleBtn} className="mmt-google-btn-inner" />
              ) : (
                <div className="guest-google-missing">Google Client ID Missing</div>
              )}
            </div>
          </div>

          <div className="mmt-login-footer">
            By proceeding, you agree to StaySync's <a href="#!">Privacy Policy</a>, <a href="#!">User Agreement</a> and <a href="#!">T&Cs</a>
          </div>

        </div>
      </div>
    </div>
  )
}
