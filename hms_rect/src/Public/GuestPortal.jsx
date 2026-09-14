import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'
import Logo from '../assets/dist/img/logo.png'
import { clearGuestSession, getGuestSession, guestAuthHeader, setGuestSession } from './guestSession'
import './GuestPortal.css'

const statusLabel = {
  reserved: 'Upcoming',
  checked_in: 'In house',
  checkedout: 'Completed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export default function GuestPortal() {
  const navigate = useNavigate()
  const [{ token, user }, setSessionState] = useState(getGuestSession)
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
  })

  useEffect(() => {
    if (!token) {
      navigate('/guest/login?redirect=/guest', { replace: true })
      return
    }

    let alive = true
    async function load() {
      setLoading(true)
      try {
        const headers = guestAuthHeader(token)
        const [meRes, bookingsRes] = await Promise.all([
          api.get('/api/public/auth/me', { headers }),
          api.get('/api/public/auth/my-bookings', { headers }),
        ])
        if (!alive) return
        const nextUser = meRes.data
        setGuestSession({ token, user: nextUser })
        setSessionState({ token, user: nextUser })
        setProfile({ name: nextUser?.name || '', phone: nextUser?.phone || '' })
        setBookings(Array.isArray(bookingsRes.data?.bookings) ? bookingsRes.data.bookings : [])
      } catch {
        clearGuestSession()
        navigate('/guest/login?redirect=/guest', { replace: true })
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [token, navigate])

  const stats = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let upcoming = 0
    let completed = 0
    let cancelled = 0
    bookings.forEach((booking) => {
      const status = String(booking.status || '').toLowerCase()
      const checkIn = new Date(`${booking.check_in_date}T00:00:00`)
      if (status === 'cancelled') cancelled += 1
      else if (status === 'completed' || status === 'checkedout' || checkIn < today) completed += 1
      else upcoming += 1
    })
    return { upcoming, completed, cancelled }
  }, [bookings])

  const saveProfile = async (e) => {
    e.preventDefault()
    if (!token) return
    setSaving(true)
    setMessage('')
    try {
      const res = await api.put('/api/public/auth/profile', profile, {
        headers: guestAuthHeader(token),
      })
      setGuestSession({ token, user: res.data })
      setSessionState({ token, user: res.data })
      setMessage('Profile updated. Future bookings will use these details.')
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Unable to update profile.')
    } finally {
      setSaving(false)
    }
  }

  const logout = () => {
    clearGuestSession()
    navigate('/book', { replace: true })
  }

  if (loading) {
    return (
      <div className="guest-page">
        <div className="guest-loading"><i className="fa-solid fa-circle-notch fa-spin" /> Loading your bookings</div>
      </div>
    )
  }

  return (
    <div className="guest-page">
      <header className="guest-topbar">
        <Link to="/book" className="guest-brand">
          <img src={Logo} alt="StaySync" />
          <span>StaySync Guest</span>
        </Link>
        <nav className="guest-nav">
          <Link to="/book">Browse hotels</Link>
          <button type="button" onClick={logout}>Sign out</button>
        </nav>
      </header>

      <main className="guest-dashboard">
        <section className="guest-welcome">
          <div>
            <div className="guest-kicker">Guest account</div>
            <h1>{user?.name || 'Welcome'}</h1>
            <p>{user?.email}</p>
          </div>
          <Link to="/book" className="guest-primary-link">
            <i className="fa-solid fa-magnifying-glass" /> Find a stay
          </Link>
        </section>

        <section className="guest-stat-grid">
          <div className="guest-stat"><span>Upcoming</span><strong>{stats.upcoming}</strong></div>
          <div className="guest-stat"><span>Completed</span><strong>{stats.completed}</strong></div>
          <div className="guest-stat"><span>Cancelled</span><strong>{stats.cancelled}</strong></div>
        </section>

        <section className="guest-layout">
          <div className="guest-panel">
            <div className="guest-panel-head">
              <h2>My Bookings</h2>
              <span>{bookings.length} total</span>
            </div>
            {bookings.length === 0 ? (
              <div className="guest-empty">
                <i className="fa-regular fa-calendar-check" />
                <h3>No bookings yet</h3>
                <p>Your direct hotel bookings will appear here after confirmation.</p>
                <Link to="/book">Browse available hotels</Link>
              </div>
            ) : (
              <div className="guest-booking-list">
                {bookings.map((booking) => {
                  const status = String(booking.status || '').toLowerCase()
                  return (
                    <article className="guest-booking" key={booking.id || booking.booking_code}>
                      <div>
                        <div className="guest-booking-code">{booking.booking_code}</div>
                        <h3>{booking.hotel_name}</h3>
                        <p>{booking.room_type || 'Room'} {booking.room_number ? `· Room ${booking.room_number}` : ''}</p>
                      </div>
                      <div className="guest-booking-dates">
                        <span>{formatDate(booking.check_in_date)}</span>
                        <i className="fa-solid fa-arrow-right" />
                        <span>{formatDate(booking.check_out_date)}</span>
                      </div>
                      <div className="guest-booking-meta">
                        <strong>{money(booking.total_amount)}</strong>
                        <span className={`guest-status ${status}`}>{statusLabel[status] || booking.status || 'Booked'}</span>
                      </div>
                      <div className="guest-booking-actions">
                        <Link to={`/guest/bookings/${booking.booking_code}`}>View details</Link>
                        <Link to={`/book/${booking.hotel_id}`}>Book again</Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <aside className="guest-panel guest-profile-panel">
            <div className="guest-panel-head">
              <h2>Saved Details</h2>
            </div>
            <form className="guest-profile-form" onSubmit={saveProfile}>
              <label>
                Name
                <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label>
                Email
                <input value={user?.email || ''} disabled />
              </label>
              <label>
                Mobile number
                <input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" />
              </label>
              <button className="guest-secondary-btn" disabled={saving}>
                {saving ? 'Saving...' : 'Save details'}
              </button>
              {message && <p className="guest-form-message">{message}</p>}
            </form>
            <div className="guest-assurance">
              <i className="fa-solid fa-shield-halved" />
              <p>Your details are used only to match your own bookings and speed up direct hotel reservations.</p>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}
