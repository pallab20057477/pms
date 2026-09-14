import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api'
import Logo from '../assets/dist/img/logo.png'
import { getGoogleClientId, setGuestSession } from './guestSession'
import './GuestPortal.css'

export default function GuestAccess() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const googleBtn = useRef(null)
  const redirectTo = params.get('redirect') || '/guest'
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
      navigate(redirectTo, { replace: true })
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
        shape: 'rectangular',
        text: mode === 'create' ? 'signup_with' : 'signin_with',
        width: Math.min(420, googleBtn.current.offsetWidth || 360),
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
    <div className="guest-page guest-auth-page">
      <header className="guest-topbar">
        <Link to="/book" className="guest-brand">
          <img src={Logo} alt="StaySync" />
          <span>StaySync Guest</span>
        </Link>
        <Link to="/book" className="guest-top-link">Browse hotels</Link>
      </header>

      <main className="guest-auth-shell">
        <section className="guest-auth-copy">
          <div className="guest-kicker">Direct hotel booking</div>
          <h1>Sign in once. Book with confidence.</h1>
          <p>Use your secure guest account to book enabled hotel links, keep your details ready, and view your stay history in one place.</p>
          <div className="guest-trust-strip">
            <span><i className="fa-solid fa-shield-halved" /> Verified hotel links</span>
            <span><i className="fa-solid fa-lock" /> Secure session</span>
            <span><i className="fa-solid fa-receipt" /> Booking history</span>
          </div>
        </section>

        <section className="guest-auth-card">
          <div className="guest-auth-tabs">
            <button className={mode === 'signin' ? 'active' : ''} type="button" onClick={() => setMode('signin')}>Sign in</button>
            <button className={mode === 'create' ? 'active' : ''} type="button" onClick={() => setMode('create')}>Create account</button>
          </div>

          <div className="guest-google-slot">
            {googleClientId ? (
              <div ref={googleBtn} className="guest-google-button" />
            ) : (
              <div className="guest-google-missing">
                Add Google Client ID to enable one-tap Google sign in.
              </div>
            )}
          </div>

          <div className="guest-divider"><span>or use email</span></div>

          {error && <div className="guest-alert error"><i className="fa-solid fa-circle-exclamation" />{error}</div>}

          <form className="guest-auth-form" onSubmit={submit}>
            {mode === 'create' && (
              <>
                <label>
                  Full name
                  <input value={form.name} onChange={(e) => update('name', e.target.value)} required placeholder="Your full name" />
                </label>
                <label>
                  Mobile number
                  <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+91 98765 43210" />
                </label>
              </>
            )}
            <label>
              Email address
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required placeholder="you@example.com" />
            </label>
            <label>
              Password
              <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required placeholder="Minimum 8 characters" />
            </label>
            {mode === 'create' && (
              <label>
                Confirm password
                <input type="password" value={form.confirm_password} onChange={(e) => update('confirm_password', e.target.value)} required placeholder="Re-enter password" />
              </label>
            )}
            <button className="guest-primary-btn" type="submit" disabled={loading}>
              {loading ? <><i className="fa-solid fa-circle-notch fa-spin" /> Please wait</> : mode === 'create' ? 'Create secure account' : 'Sign in securely'}
            </button>
          </form>

          <p className="guest-auth-note">
            No email OTP is required. Your Google/email account is used to keep booking history attached to you.
          </p>
        </section>
      </main>
    </div>
  )
}
